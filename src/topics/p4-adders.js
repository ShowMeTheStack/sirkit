// Part 4, adders: the half and full adder run row by row on the simulator, a ripple-carry adder with its carry
// crawling slice to slice and its delay measured, carry lookahead with generate and propagate raced against
// ripple, the adder–subtractor with overflow, and the BCD adder with its +6 correction.
(function (S) {
  'use strict';
  const K = S.Kit, L = K.live, B = S.Bool;
  const techInput = { id: 'tech', kind: 'choice', label: 'Technology', def: 'CMOS', options: [{ value: 'CMOS', label: 'CMOS' }, { value: 'TTL', label: 'TTL' }, { value: 'LS-TTL', label: 'LS-TTL' }] };
  const r2 = (x) => Math.round(x * 100) / 100;
  const title = (key, x, y, text, cls) => ({ key, kind: 'text', x, y, text, cls: cls || 'strong', size: 15 });
  const outOpts = (names) => {
    const opts = [];
    const rec = (i, acc) => { if (i === names.length) { opts.push(acc.join(', ')); return; } for (const v of [0, 1]) rec(i + 1, acc.concat(names[i] + ' = ' + v)); };
    rec(0, []);
    return opts;
  };
  const outText = (names, out) => names.map((n) => n + ' = ' + out[n]).join(', ');

  S.family({ id: 'p4-adders', part: 'combinational', order: 20, title: 'Adders', blurb: 'From one bit to many: half and full adders, the ripple-carry adder and its crawling carry, carry lookahead, subtraction and overflow, and decimal (BCD) addition.' });

  /** the prediction every row walk asks: what the outputs will be once the next row settles */
  const rowPredict = (outs) => ({
    at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.first && !fr[i + 1].meta.settled && fr[i + 1].meta.row !== undefined && i > 0,
    pick: 'option', options: outOpts(outs), ask: 'The inputs are about to change. What will the outputs be once the circuit settles?',
    answer: (fr, i) => outText(outs, fr[i + 1].meta.out), explain: (fr, i) => { const s = fr.slice(i + 1).find((f) => f.meta && f.meta.settled); return s ? s.say : ''; },
  });

  // ---------------------------------------------------------------------------------------------------
  // Half adder
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'half-adder', family: 'p4-adders', order: 10, title: 'Half adder',
    blurb: 'Adding two bits gives a two-bit answer: a sum S = A ⊕ B and a carry C = AB. Watch each row of the table go through the XOR and the AND, each with its own delay.',
    inputs: [techInput, { id: 'order', kind: 'choice', label: 'Row order', def: 'binary', options: [{ value: 'binary', label: 'Counting 00, 01, 10, 11' }, { value: 'gray', label: 'One input at a time 00, 01, 11, 10' }] }],
    presets: [
      { label: 'CMOS, counting', values: { tech: 'CMOS', order: 'binary' } },
      { label: 'One input at a time', values: { tech: 'CMOS', order: 'gray' } },
      { label: 'TTL delays', values: { tech: 'TTL', order: 'binary' } },
    ],
    counters: [{ id: 'rows', label: 'rows' }],
    run(inp) {
      const c = L.fromExpr('ha', { S: 'A ^ B', C: 'AB' }, 'multi', ['A', 'B']);
      const w = L.walk({ c, ins: ['A', 'B'], outs: ['S', 'C'], rows: inp.order === 'gray' ? [0, 1, 3, 2] : [0, 1, 2, 3], tech: inp.tech,
        sayRow: (env, o) => env.A + ' + ' + env.B + ' = ' + (2 * o.C + o.S) + ', written as carry C = ' + o.C + ' and sum S = ' + o.S + '.' });
      let n = 0;
      for (const f of w.frames) { if (f.meta.settled) n++; f.counters = { rows: n }; }
      w.frames.push(Object.assign({}, w.frames[w.frames.length - 1], { say: 'The whole table: S is 1 when exactly one input is 1 (XOR), C is 1 only when both are (AND). With two bits in and no carry coming in, this is only half of what one column of an addition needs.', meta: { end: true } }));
      return { frames: w.frames, def: { sections: w.def.sections.concat([{ id: 'eq', kind: 'math', title: 'Equations', text: 'S = A ⊕ B = A′B + AB′\nC = AB' }]) } };
    },
    predict: [rowPredict(['S', 'C'])],
    quiz: [
      { q: 'A half adder adds…', options: ['two bits', 'three bits', 'two 4-bit numbers', 'a bit and a carry out'], answer: 0, why: 'It has two inputs; a full adder also takes a carry in.' },
      { q: 'For A = 1, B = 1 the half adder gives…', options: ['S = 1, C = 1', 'S = 0, C = 1', 'S = 1, C = 0', 'S = 0, C = 0'], answer: 1, why: '1 + 1 = 10 in binary: carry 1, sum 0.' },
      { q: 'The sum output of a half adder is the gate…', options: ['AND', 'OR', 'XOR', 'NAND'], answer: 2, why: 'S is 1 when exactly one input is 1.' },
      { q: 'Why is it called a "half" adder?', options: ['It is half as fast', 'It cannot take a carry in, so it only does half of a column', 'It uses half the gates of a decoder', 'It adds half-bits'], answer: 1, why: 'A column of a multi-bit addition has three bits to add: A, B and the carry in.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Full adder
  // ---------------------------------------------------------------------------------------------------
  function faGates() {
    const c = new S.Netlist.Circuit('fa'), G = L.G;
    const a = c.input('A').pin('y'), b = c.input('B').pin('y'), ci = c.input('Cin').pin('y');
    const p = G(c, 'XOR', a, b);
    c.name(p, 'P', true);
    const g = G(c, 'AND', a, b);
    c.name(g, 'G', true);
    const sum = G(c, 'XOR', p, ci), carry = G(c, 'OR', g, G(c, 'AND', p, ci));
    c.connect(carry, c.output('Cout')); c.connect(sum, c.output('S'));
    return c;
  }
  S.topic({
    id: 'full-adder', family: 'p4-adders', order: 20, title: 'Full adder',
    blurb: 'Three bits in (A, B and a carry in), two out. Built from two half adders and an OR: P = A ⊕ B and G = AB first, then S = P ⊕ Cin and Cout = G + P·Cin.',
    inputs: [techInput, { id: 'order', kind: 'choice', label: 'Rows', def: 'binary', options: [{ value: 'binary', label: 'All eight, counting' }, { value: 'gray', label: 'All eight, one input at a time' }, { value: 'carry', label: 'Just the carry chain cases' }] }],
    presets: [
      { label: 'All eight rows', values: { tech: 'CMOS', order: 'binary' } },
      { label: 'One input at a time', values: { tech: 'CMOS', order: 'gray' } },
      { label: 'Carry in decides', values: { tech: 'CMOS', order: 'carry' } },
      { label: 'TTL delays', values: { tech: 'TTL', order: 'gray' } },
    ],
    counters: [{ id: 'rows', label: 'rows' }],
    run(inp) {
      const c = faGates();
      const rows = inp.order === 'gray' ? [0, 1, 3, 2, 6, 7, 5, 4] : inp.order === 'carry' ? [0, 1, 4, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
      const w = L.walk({ c, ins: ['A', 'B', 'Cin'], outs: ['S', 'Cout'], rows, tech: inp.tech, waves: ['A', 'B', 'Cin', 'P', 'S', 'Cout'], detail: inp.order === 'carry' ? rows.length : 4,
        sayRow: (env, o) => env.A + ' + ' + env.B + ' + ' + env.Cin + ' = ' + (2 * o.Cout + o.S) + ': Cout = ' + o.Cout + ', S = ' + o.S + '.' + (env.A !== env.B ? ' A and B differ, so P = 1 and the carry in passes straight through to Cout (propagate).' : env.A ? ' A = B = 1, so G = 1: a carry is generated whatever Cin is.' : ' A = B = 0: no carry can come out (kill).') });
      let n = 0;
      for (const f of w.frames) { if (f.meta.settled) n++; f.counters = { rows: n }; }
      w.frames.push(Object.assign({}, w.frames[w.frames.length - 1], { say: 'S is 1 when an odd number of inputs are 1; Cout is 1 when at least two are (the majority). Cout = G + P·Cin: G generates a carry, P propagates the one coming in.', meta: { end: true } }));
      return { frames: w.frames, def: { sections: w.def.sections.concat([{ id: 'eq', kind: 'math', title: 'Equations', text: 'P = A ⊕ B   G = AB\nS = P ⊕ Cin = A ⊕ B ⊕ Cin\nCout = G + P·Cin = AB + Cin(A ⊕ B)\n     = AB + ACin + BCin' }]) } };
    },
    predict: [rowPredict(['S', 'Cout'])],
    quiz: [
      { q: 'A full adder with A = 1, B = 0, Cin = 1 gives…', options: ['S = 0, Cout = 1', 'S = 1, Cout = 0', 'S = 1, Cout = 1', 'S = 0, Cout = 0'], answer: 0, why: '1 + 0 + 1 = 2 = 10 in binary.' },
      { q: 'Cout of a full adder is the…', options: ['XOR of the three inputs', 'majority of the three inputs', 'AND of the three inputs', 'OR of the three inputs'], answer: 1, why: 'A carry comes out when at least two of the three bits are 1.' },
      { q: 'When A ≠ B (P = 1), Cout equals…', options: ['0', '1', 'Cin', 'A'], answer: 2, why: 'Cout = G + P·Cin with G = 0 and P = 1.' },
      { q: 'How many half adders, plus one OR gate, make a full adder?', options: ['one', 'two', 'three', 'four'], answer: 1, why: 'One adds A and B, the second adds the carry in to their sum; the OR joins the two carries.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Ripple-carry adder
  // ---------------------------------------------------------------------------------------------------
  const opCheck = (bitsKey) => (v, inp) => (v < 0 || v >= 1 << +inp[bitsKey] ? 'a number from 0 to ' + ((1 << +inp[bitsKey]) - 1) : null);
  /** the box round the parts lit in a moment, for the phone's close-up */
  const hotBox = (res, ids, pad) => {
    const ps = res.parts.filter((p) => ids.includes(p.id));
    if (!ps.length) return null;
    const u = S.geom.union(ps.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })));
    return L.pad(u, pad || 40);
  };
  S.topic({
    id: 'ripple-carry', family: 'p4-adders', order: 30, title: 'Ripple-carry adder: the carry crawls',
    blurb: 'Chain n full adders, each carry out into the next carry in. Every sum bit needs the carry from the bit below, so a carry can crawl the whole length of the adder, two gate delays per bit. Watch it, and measure it.',
    inputs: [
      { id: 'n', kind: 'choice', label: 'Bits', def: '4', options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }, { value: '6', label: '6' }] },
      { id: 'a', kind: 'number', label: 'A', def: 15, min: 0, max: 63, check: opCheck('n') },
      { id: 'b', kind: 'number', label: 'B', def: 0, min: 0, max: 63, check: opCheck('n') },
      { id: 'start', kind: 'choice', label: 'What changes', def: 'cin', options: [{ value: 'cin', label: 'A and B are set; then Cin goes 0 → 1' }, { value: 'all', label: 'From 0 + 0, everything at once' }] },
      techInput,
    ],
    presets: [
      { label: '1111 + 0000, Cin 0 → 1: the longest crawl', values: { n: '4', a: 15, b: 0, start: 'cin', tech: 'CMOS' } },
      { label: '0111 + 0001: a carry generated, then propagated', values: { n: '4', a: 7, b: 1, start: 'all', tech: 'CMOS' } },
      { label: '0101 + 0010: no carries at all', values: { n: '4', a: 5, b: 2, start: 'all', tech: 'CMOS' } },
      { label: '6 bits, 111111 + 0, Cin 0 → 1', values: { n: '6', a: 63, b: 0, start: 'cin', tech: 'CMOS' } },
      { label: 'TTL, 1111 + 0001', values: { n: '4', a: 15, b: 1, start: 'all', tech: 'TTL' } },
    ],
    counters: [{ id: 'ns', label: 'ns since the change' }, { id: 'changes', label: 'wire changes' }],
    run(inp) {
      const n = +inp.n, a = inp.a, b = inp.b;
      const c = L.adder(n), res = K.schem.layout(c), sim = L.sim(c, { tech: inp.tech });
      const cin = inp.start === 'cin' ? 1 : 0;
      L.apply(sim, Object.assign(inp.start === 'cin' ? L.operands(n, a, b) : L.operands(n, 0, 0), { C0: 0 }));
      const t0 = sim.time;
      const v0 = L.valuesAt(sim, c, [t0])[0];
      const ch = L.change(sim, c, inp.start === 'cin' ? { C0: 1 } : Object.assign(L.operands(n, a, b), { C0: 0 }));
      const sum = L.sumOf(sim, n), cout = sim.get('C' + n), total = a + b + cin;
      const sta = S.Sim.sta(c, { tech: inp.tech });
      const tEnd = Math.max(ch.end, t0 + 1) + 8;
      const carries = ['C0'].concat([...Array(n).keys()].map((i) => 'C' + (i + 1)));
      const wn = n <= 4 ? carries.concat([...Array(n).keys()].reverse().map((i) => 'S' + i)) : carries;
      const sigs = wn.map((nm) => ({ name: nm, changes: L.wave(sim, nm, t0) }));
      const sw = res.bounds.w, sh = res.bounds.h;
      const head = title('h', 0, -22, 'A = ' + L.bits(a, n) + ' (' + a + ')   B = ' + L.bits(b, n) + ' (' + b + ')   Cin = ' + (inp.start === 'cin' ? '0 → 1' : '0'));
      const F = new S.Frames(['ns', 'changes']);
      const wAt = L.placeWaves(res, { w: Math.min(sw - 80, 620), signals: sigs, top: -40 });
      const scene = (vals, hot, now, extra) => {
        const items = [head, L.item('c', c, 0, 0, { values: vals, hot })];
        items.push(...L.waves({ prefix: 'w', x: wAt.x, y: wAt.y, size: wAt.size, w: Math.min(sw - 80, 620), t0, t1: tEnd, now, origin: t0, signals: sigs }).items);
        return items.concat(extra || []);
      };
      F.add({ items: scene(v0, [], t0), say: inp.start === 'cin' ? 'A = ' + a + ' and B = ' + b + ' are in place and the adder has settled with Cin = 0: S = ' + L.bits(a + b, n).slice(-n) + '. Now the carry in goes from 0 to 1.' : 'The adder rests at 0 + 0 = 0. Now A becomes ' + L.bits(a, n) + ' and B becomes ' + L.bits(b, n) + ', all bits at once.', meta: { start: true } });
      let changes = 0;
      const lastCarry = (() => { let best = null; for (const m of ch.moments) for (const e of m.events) if (/^C\d+$/.test(e.net) && e.net !== 'C0') best = e.net; return best; })();
      ch.moments.forEach((mo) => {
        changes += mo.events.length;
        F.set('ns', r2(mo.t - t0)).set('changes', changes);
        const evs = mo.events.filter((e) => !/^in_/.test(e.part || ''));
        const named = evs.filter((e) => /^(C\d+|S\d+)$/.test(e.net));
        const say = 'At ' + r2(mo.t - t0) + ' ns: ' + (evs.length ? (named.length ? named : evs).slice(0, 3).map((e) => L.say(Object.assign({}, e, { t: r2(e.t - t0), by: e.by ? Object.assign({}, e.by, { t: r2(e.by.t - t0) }) : null }))).join('; ') + '.' : 'the inputs change; the full adders have not answered yet.');
        const hot = mo.hot.filter((h) => /^fa/.test(h));
        F.add({ items: scene(mo.values, hot, mo.t), say, narrowView: hotBox(res, hot.length ? hot : ['fa0'], 110), meta: { t: mo.t, carries: named.filter((e) => /^C/.test(e.net)).map((e) => e.net) } });
      });
      const delay = r2(ch.end - t0);
      F.add({ items: scene(L.valuesAt(sim, c, [ch.end])[0], [], tEnd), say: 'Settled: ' + a + ' + ' + b + (cin ? ' + 1' : '') + ' = ' + total + ' = ' + (cout === 1 ? '1 ' : '') + L.bits(sum, n) + (cout === 1 ? ' (the carry out C' + n + ' is the extra bit)' : '') + '. The last change came ' + delay + ' ns after the input changed. The worst case for this adder, over every input change, is ' + r2(sta.comb) + ' ns: a carry rippling through all ' + n + ' bits.', meta: { end: true, delay } });
      const def = { sections: [{ id: 'eq', kind: 'math', title: 'Each slice', text: ['S(i) = A(i) ⊕ B(i) ⊕ C(i)', 'C(i+1) = A(i)B(i) + C(i)(A(i) ⊕ B(i))', '', 'carry path per bit: an AND, then an OR', 'worst case ≈ n × (AND + OR)', 'here: ' + r2(sta.comb) + ' ns for ' + n + ' bits (' + inp.tech + ')'].join('\n') }] };
      return { frames: F.list, def, result: { lastCarry } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.start, pick: 'option', ask: 'Which carry will be the last to change?', options: (fr, i, inp) => ['none of them'].concat([...Array(+inp.n).keys()].map((k) => 'C' + (k + 1))),
        answer: (fr) => { let last = 'none of them'; for (const f of fr) if (f.meta && f.meta.carries && f.meta.carries.length) last = f.meta.carries[f.meta.carries.length - 1]; return last; }, explain: (fr) => fr[fr.length - 1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.end, pick: 'option', ask: 'Is the adder settled now, or will something still change?', options: ['Settled', 'Still changing'], answer: 'Settled', explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'In a ripple-carry adder, the delay grows with the number of bits…', options: ['not at all', 'linearly', 'as the logarithm', 'as the square'], answer: 1, why: 'The carry may have to pass every slice, one after another.' },
      { q: 'Which input change makes a 4-bit ripple adder take longest?', options: ['0000 + 0000 with Cin 0 → 1', '1111 + 0000 with Cin 0 → 1', '1010 + 0101 with Cin 0', '0001 + 0001'], answer: 1, why: 'Every bit propagates (A ≠ B), so the carry runs through all four slices.' },
      { q: 'In each slice, the carry passes through…', options: ['two XORs', 'an AND then an OR', 'one inverter', 'a multiplexer'], answer: 1, why: 'Cout = AB + Cin·P: Cin goes through the AND with P, then the OR.' },
      { q: 'An 8-bit adder built from two 4-bit ripple adders has a worst-case delay about…', options: ['the same as one 4-bit adder', 'twice that of one 4-bit adder', 'half', 'four times'], answer: 1, why: 'The carry crosses the first four slices, then the next four.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Carry lookahead, raced against ripple
  // ---------------------------------------------------------------------------------------------------
  /** a gate-level carry-lookahead adder: 4-bit lookahead groups, groups chained by their carries (for the race) */
  function claAdder(n) {
    const N = S.Netlist, G = L.G, c = new N.Circuit('cla' + n);
    const A = [], Bv = [];
    for (let i = 0; i < n; i++) { A.push(c.input('A' + i).pin('y')); Bv.push(c.input('B' + i).pin('y')); }
    let cin = c.input('C0').pin('y');
    for (let g0 = 0; g0 < n; g0 += 4) {
      const k = Math.min(4, n - g0), P = [], Gs = [];
      for (let i = 0; i < k; i++) { P.push(G(c, 'XOR', A[g0 + i], Bv[g0 + i])); Gs.push(G(c, 'AND', A[g0 + i], Bv[g0 + i])); }
      const carries = [cin];
      for (let i = 0; i < k; i++) {
        // C(i+1) = G(i) + P(i)G(i-1) + ... + P(i)..P(0)C0
        const terms = [Gs[i]];
        for (let j = i - 1; j >= -1; j--) {
          const lits = [];
          for (let q = i; q > j; q--) lits.push(P[q]);
          lits.push(j >= 0 ? Gs[j] : cin);
          terms.push(lits.length === 1 ? lits[0] : G(c, 'AND', ...lits));
        }
        carries.push(terms.length === 1 ? terms[0] : G(c, 'OR', ...terms));
      }
      for (let i = 0; i < k; i++) c.connect(G(c, 'XOR', P[i], carries[i]), c.output('S' + (g0 + i)));
      cin = carries[k];
    }
    c.connect(cin, c.output('C' + n));
    return c;
  }
  /** a gate-level ripple adder (not drawn) */
  function rippleGates(n) {
    const N = S.Netlist, G = L.G, c = new N.Circuit('rip' + n);
    let carry = c.input('C0').pin('y');
    for (let i = 0; i < n; i++) {
      const a = c.input('A' + i).pin('y'), b = c.input('B' + i).pin('y'), p = G(c, 'XOR', a, b);
      c.connect(G(c, 'XOR', p, carry), c.output('S' + i));
      carry = G(c, 'OR', G(c, 'AND', a, b), G(c, 'AND', p, carry));
    }
    c.connect(carry, c.output('C' + n));
    return c;
  }
  S.topic({
    id: 'carry-lookahead', family: 'p4-adders', order: 40, title: 'Carry lookahead, raced against ripple',
    blurb: 'Each bit either generates a carry (G = AB) or propagates one (P = A ⊕ B). Expanding C(i+1) = G(i) + P(i)C(i) gives every carry as two levels of gates straight from the inputs, so no carry waits for the one below. Then both adders race.',
    inputs: [
      { id: 'n', kind: 'choice', label: 'Bits', def: '8', options: [{ value: '4', label: '4' }, { value: '8', label: '8 (two lookahead groups)' }, { value: '16', label: '16 (four groups)' }] },
      { id: 'a', kind: 'text', label: 'A (binary)', def: '11111111', check: (v, inp) => (/^[01]+$/.test(v) && v.length <= +inp.n ? null : 'A: up to ' + inp.n + ' binary digits') },
      { id: 'b', kind: 'text', label: 'B (binary)', def: '00000001', check: (v, inp) => (/^[01]+$/.test(v) && v.length <= +inp.n ? null : 'B: up to ' + inp.n + ' binary digits') },
      techInput,
    ],
    presets: [
      { label: '8 bits: 11111111 + 1, the worst case', values: { n: '8', a: '11111111', b: '00000001', tech: 'CMOS' } },
      { label: '4 bits: 0111 + 0001', values: { n: '4', a: '0111', b: '0001', tech: 'CMOS' } },
      { label: '16 bits: all ones + 1', values: { n: '16', a: '1111111111111111', b: '0000000000000001', tech: 'CMOS' } },
      { label: '8 bits, no long carry: 01010101 + 00100010', values: { n: '8', a: '01010101', b: '00100010', tech: 'CMOS' } },
    ],
    counters: [{ id: 'ns', label: 'ns' }],
    run(inp) {
      const n = +inp.n, a = parseInt(inp.a, 2), b = parseInt(inp.b, 2);
      const bit = (v, i) => (v >> i) & 1;
      const Gb = [...Array(n).keys()].map((i) => bit(a, i) & bit(b, i)), Pb = [...Array(n).keys()].map((i) => bit(a, i) ^ bit(b, i));
      const C = [0];
      for (let i = 0; i < n; i++) C.push(Gb[i] | (Pb[i] & C[i]));
      const F = new S.Frames(['ns']);
      // the bit table: A, B, G, P, C, S per column, bit n-1 at the left
      const cols = [...Array(n).keys()].reverse();
      const cw = n > 8 ? 30 : 38;
      const gpTable = (hotRow) => K.table.draw({ prefix: 'gp', x: 0, y: 0, mono: true, cw, ch: 30, size: 14, colHead: cols.map(String), rowHead: ['A', 'B', 'G = AB', 'P = A⊕B', 'carry in', 'S = P⊕C'], corner: 'bit',
        rows: [cols.map((i) => bit(a, i)), cols.map((i) => bit(b, i)), cols.map((i) => Gb[i]), cols.map((i) => Pb[i]), cols.map((i) => (hotRow >= 4 ? C[i] : '')), cols.map((i) => (hotRow >= 5 ? Pb[i] ^ C[i] : ''))],
        cls: (r, col) => { const i = cols[col]; if (r === 2 && Gb[i]) return 'good'; if (r === 3 && Pb[i]) return 'src-a'; if (r === hotRow) return 'act'; return ''; } });
      const t1 = gpTable(3);
      F.add({ items: t1.items.concat(title('h', 0, -14, 'A = ' + inp.a.padStart(n, '0') + '   B = ' + inp.b.padStart(n, '0'))), say: 'For each bit: G = AB says "this bit makes a carry by itself" (' + Gb.filter(Boolean).length + ' of them here); P = A ⊕ B says "this bit passes a carry on" (' + Pb.filter(Boolean).length + ' here). Both come straight from A and B, one gate after the inputs.', meta: { gp: true } });
      // the lookahead network, drawn for the lowest group
      const cla = S.Netlist.fromExpressions('cla4', { C1: 'G0 + P0C0', C2: 'G1 + P1G0 + P1P0C0', C3: 'G2 + P2G1 + P2P1G0 + P2P1P0C0', C4: 'G3 + P3G2 + P3P2G1 + P3P2P1G0 + P3P2P1P0C0' }, 'and-or', { inputs: ['C0', 'G0', 'P0', 'G1', 'P1', 'G2', 'P2', 'G3', 'P3'] });
      const env = { C0: 0 };
      for (let i = 0; i < 4 && i < n; i++) { env['G' + i] = Gb[i]; env['P' + i] = Pb[i]; }
      const claIt = L.item('cla', cla, 0, 0, { values: K.schem.values(cla, env), textScale: 1.35, pinCap: 1.35 });
      const cb = L.box(claIt);
      F.add({ items: [Object.assign(title('h', 0, -18, 'The lookahead network of bits 0 to 3'), { size: 17 }), claIt], say: 'Expand the carry rule C(i+1) = G(i) + P(i)C(i) all the way down: C1 = G0 + P0C0, C2 = G1 + P1G0 + P1P0C0, and so on. Every carry is now an OR of ANDs of G, P and C0: two gate levels, however far the carry comes from. Here C1..C4 = ' + [1, 2, 3, 4].filter((i) => i <= n).map((i) => C[i]).join(', ') + '.', narrowView: L.pad(cb, 10), meta: { net: true } });
      const t2 = gpTable(5);
      F.add({ items: t2.items.concat(title('h', 0, -14, 'Carries and sums')), say: 'With every carry known, each sum is one more XOR: S = P ⊕ C. The answer: ' + inp.a.padStart(n, '0') + ' + ' + inp.b.padStart(n, '0') + ' = ' + (C[n] ? '1 ' : '') + [...Array(n).keys()].reverse().map((i) => Pb[i] ^ C[i]).join('') + '.' + (n > 4 ? ' Beyond 4 bits the AND gates would need too many inputs, so ' + n / 4 + ' lookahead groups of 4 bits are chained: each group passes its carry to the next.' : '') });
      // the race
      const rc = rippleGates(n), lc = claAdder(n);
      const rs = L.sim(rc, { tech: inp.tech }), ls = L.sim(lc, { tech: inp.tech });
      const zero = Object.assign(L.operands(n, 0, 0), { C0: 0 }), go = Object.assign(L.operands(n, a, b), { C0: 0 });
      L.apply(rs, zero); L.apply(ls, zero);
      const t0r = rs.time, t0l = ls.time;
      const rch = L.change(rs, rc, go), lch = L.change(ls, lc, go);
      const lastOf = (sim, t0) => { const out = []; for (let i = 0; i <= n; i++) { const w = L.wave(sim, i < n ? 'S' + i : 'C' + n, t0); out.push(r2(Math.max(t0, w[w.length - 1][0]) - t0)); } return out; };
      const rDone = lastOf(rs, t0r), lDone = lastOf(ls, t0l);
      const rEnd = r2(rch.end - t0r), lEnd = r2(lch.end - t0l);
      const total = Math.max(rEnd, lEnd) + 5;
      const sumAt = (sim, t0, t) => [...Array(n).keys()].reverse().map((i) => { const v = L.at(sim, 'S' + i, t0 + t); return v === 'X' ? 'x' : String(v); }).join('');
      const final = [...Array(n).keys()].reverse().map((i) => String(Pb[i] ^ C[i])).join('');
      const raceItems = (t) => {
        const items = [];
        const W = n > 8 ? 26 : 34;
        const rowOf = (key, y, sim, t0, done, label) => {
          const s = sumAt(sim, t0, t);
          items.push({ key: key + ':l', kind: 'text', x: 0, y: y + 22, text: label, cls: 'strong', size: 14 });
          [...s].forEach((ch, k) => { const i = n - 1 - k; const ok = done[i] <= t; items.push({ key: key + ':' + k, kind: 'cell', x: 110 + k * (W + 3), y, w: W, h: 32, text: ch, cls: 'p4-bit ' + (ok ? 'good' : ch === final[k] ? '' : 'bad'), size: 15 }); });
          const all = Math.max(...done);
          items.push({ key: key + ':t', kind: 'text', x: 110 + n * (W + 3) + 12, y: y + 22, text: t >= all ? 'done at ' + all + ' ns' : '…', cls: t >= all ? 'good' : 'hot', size: 14 });
        };
        rowOf('rr', 0, rs, t0r, rDone, 'Ripple');
        rowOf('ll', 50, ls, t0l, lDone, 'Lookahead');
        const wv = L.waves({ prefix: 'rw', x: 0, y: 120, w: Math.max(300, n * (W + 3) + 40), t0: 0, t1: total, now: t, signals: [{ name: 'ripple C' + n, changes: L.wave(rs, 'C' + n, t0r).map(([tt, v]) => [r2(tt - t0r), v]) }, { name: 'lookahead C' + n, changes: L.wave(ls, 'C' + n, t0l).map(([tt, v]) => [r2(tt - t0l), v]) }] });
        items.push(...wv.items, title('h', 0, -14, 'The race: both adders see A and B change at 0 ns'));
        return items;
      };
      const times = [...new Set(rch.moments.map((m) => r2(m.t - t0r)).concat(lch.moments.map((m) => r2(m.t - t0l))))].sort((x, y) => x - y);
      // keep the frames few: a frame at each time a sum bit settles in either adder, and at the two finishes
      const keyTimes = [...new Set([0].concat(rDone, lDone, [rEnd, lEnd]).filter((t) => times.includes(t) || t === 0))].sort((x, y) => x - y);
      keyTimes.forEach((t, k) => {
        F.set('ns', t);
        const rn = rDone.slice(0, n).filter((x) => x <= t).length, ln = lDone.slice(0, n).filter((x) => x <= t).length;
        const say = t === 0 ? 'Both adders get the same operands at 0 ns, from 0 + 0. Green bits have reached their final value; red ones still show a wrong value.' : 'At ' + t + ' ns: ' + rn + ' of ' + n + ' ripple sum bits and ' + ln + ' of ' + n + ' lookahead sum bits are final.' + (t === lEnd ? ' The lookahead adder is done.' : '') + (t === rEnd ? ' The ripple adder is done.' : '');
        F.add({ items: raceItems(t), say, meta: { race: k, t }, scene: 'race' });
      });
      F.add({ items: raceItems(total), say: 'Lookahead finished in ' + lEnd + ' ns, ripple in ' + rEnd + ' ns' + (rEnd > lEnd ? ' (' + r2(rEnd / Math.max(1, lEnd)) + ' times as long)' : '') + '. The price: the lookahead logic grows quickly with the group size (C4 alone needs an AND of five inputs), which is why groups of four are chained or given a second level of lookahead.', meta: { verdict: true, faster: rEnd > lEnd ? 'Lookahead' : rEnd < lEnd ? 'Ripple' : 'A tie' }, scene: 'race' });
      F.list.forEach((f, i) => { if (f.scene === undefined) f.scene = f.meta && f.meta.net ? 'net' : 'gp'; });
      L.views(F.list);
      const def = { sections: [{ id: 'eq', kind: 'math', title: 'Generate and propagate', text: ['G(i) = A(i)B(i)   P(i) = A(i) ⊕ B(i)', 'C(i+1) = G(i) + P(i)C(i)', 'C1 = G0 + P0C0', 'C2 = G1 + P1G0 + P1P0C0', 'C3 = G2 + P2G1 + P2P1G0 + P2P1P0C0', 'C4 = G3 + P3G2 + P3P2G1 + P3P2P1G0', '     + P3P2P1P0C0', 'S(i) = P(i) ⊕ C(i)'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.race === 0, once: true, pick: 'option', ask: 'Which adder will finish first?', options: ['Ripple', 'Lookahead', 'A tie'], answer: (fr) => fr[fr.length - 1].meta.faster, explain: (fr) => fr[fr.length - 1].say },
      { at: (f) => f.meta && f.meta.gp, pick: 'option', ask: 'C1 = G0 + P0C0. With C0 = 0, what is C1 here?', options: ['0', '1'], answer: (fr, i, inp) => { const a = parseInt(inp.a, 2), b = parseInt(inp.b, 2); return String(a & b & 1); }, explain: () => 'With C0 = 0, C1 is just G0 = A0B0.' },
    ],
    quiz: [
      { q: 'A bit "generates" a carry when…', options: ['A ⊕ B = 1', 'A = B = 1', 'A = B = 0', 'the carry in is 1'], answer: 1, why: 'G = AB: 1 + 1 makes a carry whatever comes in.' },
      { q: 'A bit "propagates" a carry when…', options: ['A ⊕ B = 1', 'A = B = 1', 'A = B = 0', 'S = 1'], answer: 0, why: 'With exactly one of A, B at 1, a carry in becomes a carry out.' },
      { q: 'In a carry-lookahead adder each carry is computed in about…', options: ['one gate delay per bit below it', 'two gate levels after G and P, whatever the bit', 'one gate delay in total', 'n squared gate delays'], answer: 1, why: 'Each carry is a sum of products of G, P and C0.' },
      { q: 'Why are lookahead groups usually 4 bits?', options: ['Wider groups need gates with too many inputs', 'Adders only come in 4 bits', 'BCD digits are 4 bits', 'It makes the adder slower'], answer: 0, why: 'C(n) has n + 1 product terms, the largest an AND of n + 1 inputs.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Adder–subtractor with overflow
  // ---------------------------------------------------------------------------------------------------
  const sgn = (v, n) => (v >= 1 << (n - 1) ? v - (1 << n) : v);
  S.topic({
    id: 'adder-subtractor', family: 'p4-adders', order: 50, title: 'Adder–subtractor and overflow',
    blurb: 'One adder does both: M = 0 adds; M = 1 flips every bit of B through XOR gates and feeds 1 in as the carry, so the adder computes A + B′ + 1 = A − B. Overflow is V = C3 ⊕ C4.',
    inputs: [
      { id: 'a', kind: 'number', label: 'A (−8 to 15)', def: 5, min: -8, max: 15 },
      { id: 'b', kind: 'number', label: 'B (−8 to 15)', def: 3, min: -8, max: 15 },
      { id: 'op', kind: 'choice', label: 'Operation', def: 'sub', options: [{ value: 'add', label: 'A + B (M = 0)' }, { value: 'sub', label: 'A − B (M = 1)' }] },
      techInput,
    ],
    presets: [
      { label: '5 − 3', values: { a: 5, b: 3, op: 'sub' } },
      { label: '3 − 5: a negative answer', values: { a: 3, b: 5, op: 'sub' } },
      { label: '6 + 3: signed overflow', values: { a: 6, b: 3, op: 'add' } },
      { label: '−7 − 4: overflow going down', values: { a: -7, b: 4, op: 'sub' } },
      { label: '−3 + −2', values: { a: -3, b: -2, op: 'add' } },
    ],
    counters: [{ id: 'ns', label: 'ns since the change' }],
    run(inp) {
      const n = 4, a = inp.a & 15, b = inp.b & 15, m = inp.op === 'sub' ? 1 : 0;
      const c = L.adder(n, { sub: true }), res = K.schem.layout(c), sim = L.sim(c, { tech: inp.tech });
      L.apply(sim, Object.assign(L.operands(n, 0, 0), { M: 0 }));
      const t0 = sim.time;
      const ch = L.change(sim, c, Object.assign(L.operands(n, a, b), { M: m }));
      const s = L.sumOf(sim, n), c4 = sim.get('C4'), v = sim.get('V');
      const c3 = L.at(sim, 'C3', sim.time);
      const sw = res.bounds.w, sh = res.bounds.h;
      const bEff = m ? (~b & 15) : b;
      const head = title('h', 0, -22, 'A = ' + L.bits(a, n) + '   B = ' + L.bits(b, n) + '   M = ' + m + (m ? '   (adds A + ' + L.bits(bEff, n) + ' + 1)' : ''));
      const tEnd = ch.end + 8;
      const sigs = ['M', 'C1', 'C2', 'C3', 'C4', 'V'].map((nm) => ({ name: nm, changes: L.wave(sim, nm, t0) }));
      const F = new S.Frames(['ns']);
      const wAt = L.placeWaves(res, { w: Math.min(sw - 80, 560), signals: sigs, top: -40 });
      const scene = (vals, hot, now) => [head, L.item('c', c, 0, 0, { values: vals, hot })].concat(L.waves({ prefix: 'w', x: wAt.x, y: wAt.y, size: wAt.size, w: Math.min(sw - 80, 560), t0, t1: tEnd, now, origin: t0, signals: sigs }).items);
      F.add({ items: scene(L.valuesAt(sim, c, [t0])[0], [], t0), say: m ? 'Subtract: M = 1. Each B bit goes through an XOR with M, which complements it (B ⊕ 1 = B′), and M also enters as the carry into bit 0. So the adder adds A + B′ + 1: the two\'s complement of B.' : 'Add: M = 0. B ⊕ 0 = B, so B reaches the adder unchanged and the carry in is 0.', meta: { start: true } });
      ch.moments.forEach((mo) => {
        F.set('ns', r2(mo.t - t0));
        const evs = mo.events.filter((e) => !/^in_/.test(e.part || ''));
        const named = evs.filter((e) => /^(C\d+|S\d+|V)$/.test(e.net));
        const shift = (e) => Object.assign({}, e, { t: r2(e.t - t0), by: e.by ? Object.assign({}, e.by, { t: r2(e.by.t - t0) }) : null });
        F.add({ items: scene(mo.values, mo.hot.filter((h) => !/^in_|^out_/.test(h)), mo.t), say: 'At ' + r2(mo.t - t0) + ' ns: ' + (evs.length ? (named.length ? named : evs).slice(0, 3).map((e) => L.say(shift(e))).join('; ') : 'the inputs and M change') + '.', narrowView: hotBox(res, mo.hot.filter((h) => /^(fa|xor)/.test(h)), 60) || L.pad({ x: 0, y: 0, w: sw, h: sh }, 10) });
      });
      const uns = m ? a - b : a + b, sg = m ? sgn(a, n) - sgn(b, n) : sgn(a, n) + sgn(b, n);
      // negative numbers with a true minus sign, in brackets when they follow an operator
      const neg = (x) => (x < 0 ? '−' + -x : String(x)), opnd = (x) => (x < 0 ? '(' + neg(x) + ')' : String(x));
      const sayEnd = 'Result S = ' + L.bits(s, n) + ', C4 = ' + c4 + ', V = ' + v + '. Unsigned: ' + a + (m ? ' − ' : ' + ') + b + ' = ' + neg(uns) + (m ? (c4 ? ' (C4 = 1: no borrow, A ≥ B)' : ' is negative: C4 = 0 means a borrow, A < B') : (c4 ? ' does not fit in 4 bits: C4 = 1 is the carry out' : '')) + '. Signed: ' + neg(sgn(a, n)) + (m ? ' − ' : ' + ') + opnd(sgn(b, n)) + ' = ' + neg(sg) + (v ? ', which is outside −8..7: overflow, V = C3 ⊕ C4 = ' + c3 + ' ⊕ ' + c4 + ' = 1, and S reads as ' + neg(sgn(s, n)) + ', wrong.' : ', and S = ' + neg(sgn(s, n)) + ' is right; V = C3 ⊕ C4 = ' + c3 + ' ⊕ ' + c4 + ' = 0.');
      F.add({ items: scene(L.valuesAt(sim, c, [ch.end])[0], [], tEnd), say: sayEnd, meta: { end: true, v } });
      const def = { sections: [{ id: 'eq', kind: 'math', title: 'How it works', text: ['M = 0:  S = A + B', 'M = 1:  S = A + B′ + 1 = A − B', 'each B bit: B ⊕ M', 'carry in: M', '', 'V = C3 ⊕ C4  (signed overflow)', 'C4 = carry (unsigned); for M = 1,', 'C4 = 0 means a borrow'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.start, pick: 'option', ask: 'Will the signed result overflow (V = 1)?', options: ['V = 0', 'V = 1'], answer: (fr) => 'V = ' + fr[fr.length - 1].meta.v, explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'With M = 1, the XOR gates on B…', options: ['pass B unchanged', 'complement every bit of B', 'set B to 0', 'shift B left'], answer: 1, why: 'B ⊕ 1 = B′.' },
      { q: 'Why does M also go to the carry in?', options: ['To add the 1 of the two\'s complement', 'To detect overflow', 'To clear the adder', 'It does not'], answer: 0, why: 'A − B = A + B′ + 1.' },
      { q: 'Signed overflow in a 4-bit adder–subtractor is…', options: ['C4', 'C3 ⊕ C4', 'S3', 'C3 · C4'], answer: 1, why: 'Overflow happens when the carry into the sign bit differs from the carry out of it.' },
      { q: '6 + 3 in 4-bit two\'s complement gives…', options: ['9, correct', '1001 = −7, with V = 1', '0011, V = 0', '1111'], answer: 1, why: '9 does not fit in −8..7; the bits 1001 read as −7.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // BCD adder
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'bcd-adder', family: 'p4-adders', order: 60, title: 'BCD adder: binary sum, then +6',
    blurb: 'Add two decimal digits in binary. If the 4-bit sum is over 9 (or carries out), it has skipped the six codes 1010..1111, so add 6 (0110) to get the right digit and a decimal carry. The detector is K = C + Z3Z2 + Z3Z1.',
    inputs: [
      { id: 'x', kind: 'number', label: 'X (0 to 9999)', def: 47, min: 0, max: 9999 },
      { id: 'y', kind: 'number', label: 'Y (0 to 9999)', def: 38, min: 0, max: 9999 },
    ],
    presets: [
      { label: '47 + 38', values: { x: 47, y: 38 } },
      { label: '9 + 9: the largest digit sum', values: { x: 9, y: 9 } },
      { label: '8 + 9: the sum carries out in binary', values: { x: 8, y: 9 } },
      { label: '305 + 192: no corrections', values: { x: 305, y: 192 } },
      { label: '999 + 1: carries all the way', values: { x: 999, y: 1 } },
    ],
    counters: [{ id: 'digits', label: 'digits added' }, { id: 'fix', label: 'corrections' }],
    run(inp) {
      const xs = String(inp.x), ys = String(inp.y), nd = Math.max(xs.length, ys.length);
      const dx = [...Array(nd).keys()].map((i) => +(xs[xs.length - 1 - i] || 0)), dy = [...Array(nd).keys()].map((i) => +(ys[ys.length - 1 - i] || 0));
      const det = S.Netlist.fromExpressions('bcdk', { Cd: 'C + Z3Z2 + Z3Z1' }, 'and-or', { inputs: ['C', 'Z3', 'Z2', 'Z1'] });
      const F = new S.Frames(['digits', 'fix']);
      const b4 = (v) => L.bits(v, 4);
      let carry = 0, fixes = 0;
      const outDigits = [];
      const digitStrip = (k, resDigits) => {
        // the two numbers, digit by digit, with the current digit lit and finished result digits below
        const items = [], W = 40, x0 = 430;
        const col = (i) => x0 + (nd - 1 - i) * (W + 6);
        for (let i = 0; i < nd; i++) {
          items.push({ key: 'sx' + i, kind: 'cell', x: col(i), y: 0, w: W, h: 34, text: String(dx[i]), cls: 'p4-bit' + (i === k ? ' act' : ''), size: 17 });
          items.push({ key: 'sy' + i, kind: 'cell', x: col(i), y: 40, w: W, h: 34, text: String(dy[i]), cls: 'p4-bit' + (i === k ? ' act' : ''), size: 17 });
          items.push({ key: 'sr' + i, kind: 'cell', x: col(i), y: 92, w: W, h: 34, text: resDigits[i] === undefined ? '' : String(resDigits[i]), cls: 'p4-bit' + (resDigits[i] === undefined ? '' : ' good'), size: 17 });
        }
        items.push({ key: 'srx', kind: 'cell', x: col(nd), y: 92, w: W, h: 34, text: resDigits[nd] === undefined ? '' : String(resDigits[nd]), cls: 'p4-bit' + (resDigits[nd] ? ' good' : ' dim'), size: 17 });
        items.push({ key: 'sl', kind: 'line', x1: col(nd), y1: 84, x2: col(0) + W, y2: 84, cls: 'p4-rule' });
        items.push({ key: 'sxl', kind: 'text', x: col(nd) + W - 4, y: 22, text: 'X', anchor: 'end', cls: 'strong' });
        items.push({ key: 'syl', kind: 'text', x: col(nd) + W - 4, y: 62, text: '+ Y', anchor: 'end', cls: 'strong' });
        return items;
      };
      for (let k = 0; k < nd; k++) {
        const x = dx[k], y = dy[k], cin = carry, z = x + y + cin, cb = z > 15 ? 1 : 0, zb = z & 15;
        const env = { C: cb, Z3: (zb >> 3) & 1, Z2: (zb >> 2) & 1, Z1: (zb >> 1) & 1 };
        const kk = cb | (env.Z3 & env.Z2) | (env.Z3 & env.Z1);
        const fixed = kk ? (zb + 6) & 15 : zb;
        const rows = [['', b4(x)], ['', b4(y)], [String(cin), ''], [String(cb), b4(zb)], ['', kk ? '0110' : '0000'], [String(kk), b4(fixed)]];
        const tbl = (upto, hot) => K.table.draw({ prefix: 'bt', x: 0, y: 0, mono: true, ch: 32, size: 15, colHead: ['carry', '8 4 2 1'], rowHead: ['digit X = ' + x, 'digit Y = ' + y, 'carry in', 'binary sum Z', 'correction', 'BCD digit'], corner: '',
          rows: rows.map((r, i) => (i <= upto ? r : ['', ''])), cls: (r, cc) => (r === hot ? 'act' : r === 5 && upto >= 5 ? 'good' : r === 4 && upto >= 4 && kk ? 'hot' : '') });
        const detIt = L.item('det', det, 0, 236, { values: K.schem.values(det, env) });
        const db = L.box(detIt);
        F.set('digits', k);
        F.add({ items: tbl(2, 2).items.concat(digitStrip(k, outDigits)), say: 'Digit ' + (k + 1) + ' (from the right): ' + x + ' + ' + y + (cin ? ' + carry 1' : '') + '. In BCD each digit is 4 bits: ' + b4(x) + ' and ' + b4(y) + '.', meta: { digit: k, kk } });
        F.add({ items: tbl(3, 3).items.concat(digitStrip(k, outDigits), [detIt]), say: 'A 4-bit binary adder gives Z = ' + z + ' = ' + (cb ? 'carry 1, ' : '') + b4(zb) + '. The detector checks for a sum over 9: K = C + Z3Z2 + Z3Z1 = ' + cb + ' + ' + env.Z3 + '·' + env.Z2 + ' + ' + env.Z3 + '·' + env.Z1 + ' = ' + kk + '.', narrowView: L.pad(db, 10), meta: { digit: k, kk, ask: true } });
        if (kk) { fixes++; F.count('fix'); }
        F.add({ items: tbl(4, 4).items.concat(digitStrip(k, outDigits), [detIt]), say: kk ? 'K = 1: ' + z + ' is not a BCD digit (or overflowed 4 bits). The six codes 1010 to 1111 were skipped, so a second adder adds 0110: ' + b4(zb) + ' + 0110 = ' + b4(fixed) + (cb ? '' : ' (its own carry out is ignored)') + '.' : 'K = 0: ' + z + ' is a valid digit; the second adder adds 0000 and nothing changes.' });
        outDigits[k] = fixed;
        carry = kk;
        F.set('digits', k + 1);
        F.add({ items: tbl(5, 5).items.concat(digitStrip(k, outDigits.concat(k === nd - 1 && carry ? [] : []).map((d) => d))), say: 'Digit ' + fixed + (kk ? ', and K = 1 is the decimal carry into the next digit.' : ', with no decimal carry.') + (k === nd - 1 && carry ? ' It is the last digit, so the carry becomes a new leading 1.' : '') });
      }
      if (carry) outDigits[nd] = 1;
      const result = inp.x + inp.y;
      F.add({ items: digitStrip(-1, outDigits).concat(title('h', 430, -14, inp.x + ' + ' + inp.y + ' = ' + result)), say: inp.x + ' + ' + inp.y + ' = ' + result + ', every digit in BCD, with ' + fixes + ' correction' + (fixes === 1 ? '' : 's') + ' of +6. Each digit needed a 4-bit adder, the detector and a second adder; the digits are chained by the decimal carry K.', meta: { end: true } });
      const def = { sections: [{ id: 'eq', kind: 'math', title: 'One BCD digit', text: ['Z = X + Y + carry in  (binary, 0..19)', 'K = C + Z3Z2 + Z3Z1  (Z > 9)', 'K = 1: add 0110, carry out = 1', 'K = 0: the digit is Z'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', ask: 'Does this digit need the +6 correction (is K = 1)?', options: ['K = 0', 'K = 1'], answer: (fr, i) => 'K = ' + fr[i].meta.kk, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A BCD digit sum needs correcting when it is…', options: ['over 9', 'odd', 'over 15 only', 'zero'], answer: 0, why: 'Codes 1010 to 1111 are not BCD digits, and sums from 16 to 19 carry out of the 4-bit adder.' },
      { q: 'The correction adds…', options: ['0110', '1010', '0011', '1111'], answer: 0, why: 'Six codes were skipped (10 to 15), so 6 is added to jump over them.' },
      { q: 'K = C + Z3Z2 + Z3Z1 is 1 for the binary sum 1100?', options: ['Yes', 'No'], answer: 0, why: 'Z3Z2 = 1·1 = 1: twelve is over nine.' },
      { q: 'In BCD, 8 + 9 first gives the binary sum…', options: ['1 0001', '1 0111', '0 1111', '0 1001'], answer: 0, why: '17 = 10001: the carry is set, so K = 1 and 0001 + 0110 = 0111 with a decimal carry: 17.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
