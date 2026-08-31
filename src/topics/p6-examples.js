// Part 6, worked machines: sequence detectors built a state at a time (overlapping or not, Mealy or Moore), a
// serial adder whose only state is the carry, and a vending controller with two inputs and two outputs.
(function (S) {
  'use strict';
  const K = S.Kit, P6 = S.P6, Geo = S.geom;
  const F = () => S.Fsm;
  const pr = P6.pr;

  S.family({ id: 'p6-examples', part: 'machines', order: 50, title: 'Machines at work', blurb: 'Sequence detectors, a serial adder and a vending controller: the ideas of this part on jobs a designer meets.' });

  // ---------------------------------------------------------------------------------------------------
  // Sequence detectors
  // ---------------------------------------------------------------------------------------------------
  const bitsCheck = (label, lo, hi) => (v) => (new RegExp('^[01]{' + lo + ',' + hi + '}$').test(String(v).replace(/\s+/g, '')) ? null : label + ': ' + lo + ' to ' + hi + ' bits of 0s and 1s');
  S.topic({
    id: 'sequence-detector', family: 'p6-examples', order: 10, title: 'Sequence detectors',
    blurb: 'State Si means "the last i bits are the first i bits of the pattern". On each bit, go to the longest tail of what has been read that is still a start of the pattern. With overlap, a match may reuse the end of the one before; without, the search starts afresh.',
    inputs: [
      { id: 'pattern', kind: 'text', label: 'Pattern', def: '1011', check: bitsCheck('Pattern', 2, 5) },
      { id: 'type', kind: 'choice', label: 'Kind', def: 'mealy', options: [{ value: 'mealy', label: 'Mealy' }, { value: 'moore', label: 'Moore' }] },
      { id: 'overlap', kind: 'choice', label: 'Matches', def: 'yes', options: [{ value: 'yes', label: 'may overlap' }, { value: 'no', label: 'do not overlap' }] },
      { id: 'seq', kind: 'text', label: 'Input X', def: '1011011010', check: bitsCheck('Input X', 3, 12) },
    ],
    presets: [
      { label: '1011, Mealy, overlapping', values: { pattern: '1011', type: 'mealy', overlap: 'yes', seq: '1011011010' } },
      { label: '1011, Mealy, not overlapping', values: { pattern: '1011', type: 'mealy', overlap: 'no', seq: '1011011010' } },
      { label: '110, Moore', values: { pattern: '110', type: 'moore', overlap: 'yes', seq: '1101101110' } },
      { label: '1001, Mealy', values: { pattern: '1001', type: 'mealy', overlap: 'yes', seq: '1001001100' } },
      { label: '0101, Moore, not overlapping', values: { pattern: '0101', type: 'moore', overlap: 'no', seq: '0101010101' } },
    ],
    counters: [{ id: 'states', label: 'states' }, { id: 'hits', label: 'detections' }],
    camera: 'fit-all',
    run(inp) {
      const pat = String(inp.pattern).trim(), xs = String(inp.seq).replace(/\s+/g, '').split('');
      const det = F().detector(pat, { type: inp.type, overlap: inp.overlap === 'yes' }), m = det.machine;
      // the layered layout, unless it comes out too tall to read beside the strip: then the compact stress one
      let pos = P6.layout(m);
      if (P6.diagram(m, { pos }).box.h > 420) pos = P6.layout(m, { mode: 'stress' });
      const full = K.fsm.machine(m);
      const mean = (s) => { const i = +s.slice(1); return i === 0 ? 'nothing of ' + pat + ' yet' : i === pat.length ? 'the whole ' + pat + ' just seen' : 'seen ' + pat.slice(0, i); };
      const Fr = new S.Frames(['states', 'hits']);
      const run = F().run(m, xs);
      // where the strip goes: under the full diagram
      const dFull = P6.diagram(m, { prefix: 'fsm', pos });
      const stripY = dFull.box.y + dFull.box.h + 50;
      const blank = P6.strip(m, xs, run, { x: dFull.box.x, y: stripY, upto: 0 });
      const meaningX = dFull.box.x + dFull.box.w + 60;
      const meanings = (k, lit) => P6.eqs(m.states.slice(0, k).map((s) => ({ key: s, text: s + ': ' + mean(s) })), meaningX, dFull.box.y + 20, { prefix: 'mn', title: 'states', lit: lit ? new Set([lit]) : null });
      Fr.add({ items: meanings(0).items.concat(blank.items, [{ key: 'ph', kind: 'text', x: dFull.box.x, y: dFull.box.y + 40, text: 'pattern ' + pat, cls: 'big' }]), say: det.trace[0].say + ' ' + (m.type === 'mealy' ? pat.length : pat.length + 1) + ' states will do.' });
      for (let k = 1; k <= m.states.length; k++) {
        const have = new Set(m.states.slice(0, k)), s = m.states[k - 1];
        const part = { states: m.states.slice(0, k), start: m.start, trans: full.trans.filter((t) => have.has(t.from) && have.has(t.to)), labelOf: full.labelOf };
        const dd = K.fsm.draw(part, { prefix: 'fsm', pos, hot: [s] });
        const edges = det.trace.filter((t) => t.kind === 'edge' && t.from === s);
        Fr.set('states', k);
        Fr.add({ items: dd.items.concat(meanings(k, s).items, blank.items), say: s + ': ' + mean(s) + '. ' + edges.map((e) => (m.type === 'moore' && e.to === 'S' + pat.length && !/pattern is complete/.test(e.say) ? e.say.replace(/^(From S\d+ on [01]): /, '$1: the pattern is complete again; ') : e.say)).join(' ') });
      }
      // the run
      let hits = 0;
      xs.forEach((x, k) => {
        const s = run.states[k], n = run.states[k + 1], z = run.outputs[m.type === 'mealy' ? k : k + 1];
        if (z === '1') hits++;
        Fr.set('hits', hits);
        const dd = P6.diagram(m, { prefix: 'fsm', pos, active: [n], taken: [s + '>' + n] });
        const st = P6.strip(m, xs, run, { x: dFull.box.x, y: stripY, upto: k + 1, cur: k });
        Fr.add({ items: dd.items.concat(meanings(m.states.length, n).items, st.items), say: 'Bit ' + (k + 1) + ': X = ' + x + ', ' + s + ' → ' + n + '. ' + (m.type === 'mealy' ? (z === '1' ? 'Z = 1: ' + pat + ' is complete on this bit.' : 'Z = 0.') : (z === '1' ? 'Now in ' + n + ', which outputs 1 for this clock.' : n + ' outputs 0.')), meta: { ask: k >= pat.length - 1, next: n } });
      });
      const other = F().detector(pat, { type: inp.type, overlap: inp.overlap !== 'yes' }).machine;
      const oh = F().run(other, xs).outputs.filter((z, i) => z === '1' && (m.type === 'mealy' || i > 0)).length;
      Fr.add({ items: dFull.items.concat(meanings(m.states.length).items, P6.strip(m, xs, run, { x: dFull.box.x, y: stripY }).items), say: hits + ' detection' + (hits === 1 ? '' : 's') + ' in ' + xs.join('') + '. ' + (inp.overlap === 'yes' ? 'Without overlap' : 'With overlap') + ' the same input would give ' + oh + '.' });
      for (const f of Fr.list) f.narrowView = P6.narrow(dFull.box);
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Detector for ' + pat, text: ['Si: the last i bits = the first i of ' + pat, 'on bit b from Si: go to the longest', '  tail of (first i bits + b) that is', '  a start of the pattern', 'overlap: after a match keep the tail', 'no overlap: start again from S0'].join('\n') }] };
      return { frames: Fr.list, def };
    },
    predict: [
      { at: (f, i, fr) => f.meta && f.meta.ask && fr[i + 1] && fr[i + 1].meta, pick: 'item', ask: 'Read the next bit on the strip. Click the state the machine goes to.', answer: (fr, i) => 'fsm:s:' + fr[i + 1].meta.next, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A Mealy detector for an n-bit pattern needs how many states?', options: ['n − 1', 'n', 'n + 1', '2ⁿ'], answer: 1, why: 'S0 to S(n−1): how much of the pattern has been matched; the output on the last bit needs no state of its own.' },
      { q: 'Detecting 1011 with overlap: after 1011 the machine goes to…', options: ['S0', 'S1, because the last 1 can start a new match', 'S2', 'S3'], answer: 1, why: 'The longest tail of 1011 that starts the pattern is "1".' },
      { q: 'Without overlap, after a complete match the machine…', options: ['keeps the tail', 'starts again as if nothing had been read', 'stops', 'goes to the last state'], answer: 1, why: 'No bit of one match may be used by the next.' },
      { q: 'In 101010, how many times is 1010 found with overlap, and without?', options: ['2 and 1', '1 and 1', '2 and 2', '3 and 1'], answer: 0, why: 'With overlap at bits 1–4 and 3–6; without, the second shares bits with the first.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Serial adder
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'serial-adder', family: 'p6-examples', order: 20, title: 'A serial adder',
    blurb: 'Two numbers arrive one bit per clock, least significant first. A full adder makes each sum bit, and a single flip-flop keeps the carry for the next clock: the carry is the state of a two-state Mealy machine.',
    inputs: [
      { id: 'a', kind: 'number', label: 'A', def: 11, min: 0, max: 31 },
      { id: 'b', kind: 'number', label: 'B', def: 6, min: 0, max: 31 },
      { id: 'n', kind: 'number', label: 'Bits', def: 5, min: 3, max: 6 },
    ],
    check: (inp) => (inp.a >= 1 << inp.n || inp.b >= 1 << inp.n ? 'A and B must fit in ' + inp.n + ' bits (at most ' + ((1 << inp.n) - 1) + ')' : null),
    presets: [
      { label: '11 + 6', values: { a: 11, b: 6, n: 5 } },
      { label: '7 + 1: a carry that ripples', values: { a: 7, b: 1, n: 4 } },
      { label: '13 + 9: a carry out of the top', values: { a: 13, b: 9, n: 4 } },
      { label: '21 + 10', values: { a: 21, b: 10, n: 5 } },
    ],
    counters: [{ id: 'bit', label: 'bits added' }, { id: 'carries', label: 'carries' }],
    run(inp) {
      const m = P6.machine('serial'), n = inp.n;
      const bit = (v, i) => (v >> i) & 1;
      const xs = []; for (let i = 0; i < n; i++) xs.push(String(bit(inp.a, i)) + String(bit(inp.b, i)));
      const run = F().run(m, xs);
      const pos = P6.layout(m);
      const d = F().design(m, { ff: 'D', reset: true });
      const Fr = new S.Frames(['bit', 'carries']);
      const dg = P6.diagram(m, { prefix: 'fsm', pos });
      const tb = P6.table(m, { x: dg.box.x + dg.box.w + 70, y: dg.box.y });
      const regY = Math.max(dg.box.y + dg.box.h, tb.box.y + tb.box.h) + 60;
      const C = 44;
      const regs = (k, cur) => {
        const items = [];
        const row = (name, val, y, filled) => {
          items.push({ key: 'rn:' + name, kind: 'text', x: dg.box.x, y: y + 27, text: name, cls: 'strong', size: 16 });
          for (let i = 0; i < n; i++) {
            const col = n - 1 - i;
            const show = filled === undefined || i < filled;
            items.push({ key: 'r:' + name + ':' + i, kind: 'cell', x: dg.box.x + 50 + col * C, y, w: C, h: 40, rx: 0, text: show ? String(bit(val, i)) : '', cls: 'mono strip' + (i === cur ? ' act' : '') + (name === 'S' && show ? ' z1' : ''), size: 17 });
          }
          if (filled === undefined || filled >= n) items.push({ key: 'rv:' + name, kind: 'text', x: dg.box.x + 60 + n * C, y: y + 27, text: '= ' + val, cls: 'mono', size: 15 });
        };
        const sum = run.outputs.slice(0, k).reduce((acc, z, i) => acc + (+z << i), 0);
        row('A', inp.a, regY, undefined); row('B', inp.b, regY + 48, undefined); row('S', sum, regY + 110, k);
        items.push({ key: 'rl', kind: 'text', x: dg.box.x + 50, y: regY - 12, text: 'bit ' + (n - 1) + ' … bit 0 (sent first)', cls: 'note', size: 13 });
        return items;
      };
      Fr.add({ items: dg.items.concat(tb.items, regs(0)), say: 'Two states: C0 (no carry waiting) and C1 (a carry of 1 waiting). On each clock the inputs are one bit of A and one of B; the output S is their sum bit. A = ' + inp.a + ', B = ' + inp.b + ', sent least significant bit first.' });
      let carries = 0;
      xs.forEach((x, k) => {
        const s = run.states[k], nx = run.states[k + 1], z = run.outputs[k];
        const dA = P6.diagram(m, { prefix: 'fsm', pos, active: [s] });
        const tA = P6.table(m, { x: dg.box.x + dg.box.w + 70, y: dg.box.y, cell: [s, x] });
        Fr.add({ items: dA.items.concat(tA.items, regs(k, k)), say: 'Bit ' + k + ': A = ' + x[0] + ', B = ' + x[1] + ', carry in = ' + (s === 'C1' ? 1 : 0) + ' (state ' + s + ').', meta: { ask: true, z, next: nx } });
        Fr.count('bit');
        if (nx === 'C1') { carries++; Fr.set('carries', carries); }
        const dB = P6.diagram(m, { prefix: 'fsm', pos, active: [nx], taken: [s + '>' + nx] });
        Fr.add({ items: dB.items.concat(tA.items, regs(k + 1, k)), say: x[0] + ' + ' + x[1] + ' + ' + (s === 'C1' ? 1 : 0) + ' = ' + (+x[0] + +x[1] + (s === 'C1' ? 1 : 0)) + ': sum bit S = ' + z + ', carry ' + (nx === 'C1' ? '1, so the next state is C1.' : '0, so the next state is C0.') });
      });
      const sum = run.outputs.reduce((acc, z, i) => acc + (+z << i), 0), cout = run.states[n] === 'C1' ? 1 : 0;
      Fr.add({ items: dg.items.concat(tb.items, regs(n)), say: 'After ' + n + ' clocks S = ' + sum + (cout ? ', and the machine is left in C1: a carry out of the top bit, so the true sum ' + inp.a + ' + ' + inp.b + ' = ' + (inp.a + inp.b) + ' needs one more bit.' : ' = ' + inp.a + ' + ' + inp.b + '.') });
      const res = K.schem.layout(d.circuit);
      // the circuit as large as the stage allows, the equations beside it
      const e = P6.eqs(d.equations.map((q, i) => ({ key: 'e' + i, text: q.text })), res.bounds.w + 50, 20, { prefix: 'eq', title: 'one D flip-flop for the carry' });
      const circItems = [K.schem.item('circ', res, { textScale: 1.1 })].concat(e.items);
      Fr.add({ items: circItems, view: S.stageBounds(circItems, { margin: 14, minW: 900, minH: 480 }), say: 'Built with a D flip-flop for the carry (' + d.vars[0] + '): ' + d.equations.map((q) => pr(q.text)).join('; ') + '. D is the carry out of a full adder and S its sum, written as a sum of products: one full adder and one flip-flop, however wide the numbers.' });
      for (const f of Fr.list) if (!f.items.some((it) => it.kind === 'schem')) f.narrowView = P6.narrow(P6.union([dg.box, { x: dg.box.x, y: regY - 20, w: 60 + n * C + 60, h: 160 }]));
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Serial adder', text: ['state = the carry', 'S = A ⊕ B ⊕ C', 'C(next) = AB + AC + BC', '', 'n clocks for n bits,', 'one full adder in all'].join('\n') }] };
      return { frames: P6.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['0', '1'], ask: 'What is the sum bit S on this clock?', answer: (fr, i) => fr[i].meta.z, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'What does the state of a serial adder remember?', options: ['the sum so far', 'the carry into the next bit', 'the number of bits', 'A'], answer: 1, why: 'Everything else is in the two input bits of the present clock.' },
      { q: 'Why are the bits sent least significant first?', options: ['It is shorter', 'The carry flows from the low bits to the high bits', 'The flip-flop needs it', 'No reason'], answer: 1, why: 'Each bit needs the carry out of the bit below it.' },
      { q: 'A serial adder for 32-bit numbers needs…', options: ['32 full adders', 'one full adder and one flip-flop, and 32 clocks', '32 flip-flops only', 'a 32-state machine'], answer: 1, why: 'It trades time for hardware.' },
      { q: 'In state C1 with A = 1 and B = 0, the output and next state are…', options: ['S = 1, C1', 'S = 0, C1', 'S = 0, C0', 'S = 1, C0'], answer: 1, why: '1 + 0 + 1 = 10 in binary: sum 0, carry 1.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Vending controller
  // ---------------------------------------------------------------------------------------------------
  const coinsCheck = (v) => { const t = String(v).trim().split(/[\s,]+/).filter(Boolean); if (!t.length) return 'Coins: give at least one'; if (t.length > 10) return 'Coins: at most 10'; const bad = t.find((c) => !/^(5|10|-)$/.test(c)); return bad ? 'Coins: "' + bad + '" is not 5, 10 or - (no coin)' : null; };
  S.topic({
    id: 'vending-fsm', family: 'p6-examples', order: 30, title: 'A vending controller',
    blurb: 'Coins of 5 and 10 arrive at most one per clock; at 15 the controller vends, and with 20 it also gives 5 back. The state is the money held. Two inputs, two outputs and a forbidden input combination that becomes a don\'t care.',
    inputs: [{ id: 'coins', kind: 'text', label: 'Coins, one per clock (5, 10 or - for none)', def: '5 - 10 10 - 10 5 5', check: coinsCheck }],
    presets: [
      { label: '5, then 10', values: { coins: '5 - 10 - 5 5 5' } },
      { label: '10 and 10: change', values: { coins: '10 10 - 5 10' } },
      { label: 'Only fives', values: { coins: '5 5 5 - 5 5 5' } },
      { label: 'Slow customer', values: { coins: '5 - - 5 - - 5' } },
    ],
    counters: [{ id: 'vends', label: 'vended' }, { id: 'change', label: 'change given' }],
    run(inp) {
      const m = P6.machine('vend');
      const coins = String(inp.coins).trim().split(/[\s,]+/).filter(Boolean);
      const xs = coins.map((c) => (c === '5' ? '10' : c === '10' ? '01' : '00'));
      const run = F().run(m, xs);
      const pos = P6.layout(m);
      const d = F().design(m, { ff: 'D' });
      const Fr = new S.Frames(['vends', 'change']);
      const dg = P6.diagram(m, { prefix: 'fsm', pos });
      const tX = dg.box.x + dg.box.w + 70;
      const strip = (k, cur) => P6.strip(m, xs, run, { x: dg.box.x, y: dg.box.y + dg.box.h + 50, upto: k, cur });
      Fr.add({ items: dg.items.concat(P6.table(m, { x: tX, y: dg.box.y }).items, strip(0).items), say: 'Inputs N (a 5-cent coin) and D (a 10-cent coin), outputs V (vend) and C (5 cents change). S0, S5 and S10 hold the money so far. N = D = 1 together cannot happen, so that column is left unspecified: a don\'t care for the design.' });
      let v = 0, c = 0;
      xs.forEach((x, k) => {
        const s = run.states[k], n = run.states[k + 1], z = run.outputs[k];
        const dd = P6.diagram(m, { prefix: 'fsm', pos, active: [s] });
        const t = P6.table(m, { x: tX, y: dg.box.y, cell: [s, x] });
        Fr.add({ items: dd.items.concat(t.items, strip(k, k).items), say: 'Clock ' + (k + 1) + ': holding ' + s.slice(1) + ' cents, ' + (coins[k] === '-' ? 'no coin.' : 'a ' + coins[k] + '-cent coin arrives.'), meta: { ask: true, vend: z[0] === '1' ? 'Vend' + (z[1] === '1' ? ' and give 5 back' : '') : 'Wait' } });
        if (z[0] === '1') v++; if (z[1] === '1') c++;
        Fr.set('vends', v); Fr.set('change', c);
        const d2 = P6.diagram(m, { prefix: 'fsm', pos, active: [n], taken: [s + '>' + n] });
        Fr.add({ items: d2.items.concat(t.items, strip(k + 1, k).items), say: 'V = ' + z[0] + ', C = ' + z[1] + (z[0] === '1' ? ': ' + (+s.slice(1) + +(coins[k] === '-' ? 0 : coins[k])) + ' cents reached, so it vends' + (z[1] === '1' ? ' and returns 5' : '') + ' and goes back to S0.' : ': now ' + n.slice(1) + ' cents.') });
      });
      const e = P6.eqs(d.equations.map((q, i) => ({ key: 'e' + i, text: q.text })), tX, dg.box.y + 20, { prefix: 'eq', title: 'D flip-flops, binary codes ' + m.states.map((s) => s + ' = ' + d.codes[s]).join(', ') });
      Fr.add({ items: P6.diagram(m, { prefix: 'fsm', pos, sub: d.codes }).items.concat(e.items, strip(xs.length).items), say: 'Designed with two D flip-flops: ' + d.equations.map((q) => pr(q.text)).join('; ') + '. The don\'t cares (the unused code 11 and the input N = D = 1) keep the equations short.' });
      for (const f of Fr.list) f.narrowView = P6.narrow(dg.box);
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Vending controller', text: ['state: money held (0, 5, 10)', 'inputs: N (5), D (10)', 'outputs: V vend, C change 5', 'N = D = 1: never, a don\'t care'].join('\n') }] };
      return { frames: P6.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['Wait', 'Vend', 'Vend and give 5 back'], ask: 'What does the controller do on this clock?', answer: (fr, i) => fr[i].meta.vend, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'What does the state of this vending controller remember?', options: ['the last coin', 'the money inserted so far', 'how many items were sold', 'the price'], answer: 1, why: 'S0, S5, S10: the amount held.' },
      { q: 'Why is the input N = D = 1 a don\'t care?', options: ['It means no coin', 'The coin slot can never deliver both in one clock', 'It is a reset', 'It vends twice'], answer: 1, why: 'An input that cannot happen may be given any next state and output.' },
      { q: 'Holding 10 cents, a 10-cent coin arrives. The outputs are…', options: ['V = 1, C = 0', 'V = 1, C = 1', 'V = 0, C = 1', 'V = 0, C = 0'], answer: 1, why: '20 cents: vend, and 5 back.' },
      { q: 'Are V and C Mealy or Moore outputs here?', options: ['Moore', 'Mealy', 'neither', 'both'], answer: 1, why: 'They depend on the coin arriving in the same clock, not just on the state.' },
    ],
  });
  void Geo;
})(globalThis.Sirkit = globalThis.Sirkit || {});
