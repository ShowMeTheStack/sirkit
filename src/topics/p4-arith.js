// Part 4, more arithmetic: the array multiplier (partial products from AND gates, summed by rows of adders, with
// its delay measured) and the magnitude comparator (equal bits found by XNOR, the first difference from the
// top deciding).
(function (S) {
  'use strict';
  const K = S.Kit, L = K.live, N = S.Netlist;
  const title = (key, x, y, text, cls, size) => ({ key, kind: 'text', x, y, text, cls: cls || 'strong', size: size || 15 });
  const r2 = (x) => Math.round(x * 100) / 100;

  S.family({ id: 'p4-arith', part: 'combinational', order: 30, title: 'Multipliers and comparators', blurb: 'Multiplication as an array of AND gates and adders, and comparing two numbers bit by bit from the top.' });

  // ---------------------------------------------------------------------------------------------------
  // Array multiplier
  // ---------------------------------------------------------------------------------------------------
  /** a gate-level n × n array multiplier (for the simulator): partial products, then n − 1 rows of ripple adders */
  function mulArray(n) {
    const c = new N.Circuit('mul' + n), G = L.G, A = [], B = [];
    for (let i = 0; i < n; i++) A.push(c.input('A' + i).pin('y'));
    for (let i = 0; i < n; i++) B.push(c.input('B' + i).pin('y'));
    const pp = (j, k) => G(c, 'AND', A[j], B[k]);
    const fa = (a, b, ci) => { const p = G(c, 'XOR', a, b); return { s: G(c, 'XOR', p, ci), c: G(c, 'OR', G(c, 'AND', a, b), G(c, 'AND', p, ci)) }; };
    const ha = (a, b) => ({ s: G(c, 'XOR', a, b), c: G(c, 'AND', a, b) });
    // acc holds bits of the running sum from weight k upwards
    let acc = [...Array(n).keys()].map((j) => pp(j, 0));
    c.connect(acc[0], c.output('P0'));
    let top = null;
    for (let k = 1; k < n; k++) {
      const row = [...Array(n).keys()].map((j) => pp(j, k));
      const upper = acc.slice(1).concat([top]);
      let carry = null;
      const next = [];
      for (let j = 0; j < n; j++) {
        const x = upper[j];
        let r;
        if (!x) r = carry ? ha(row[j], carry) : { s: row[j], c: null };
        else if (!carry) r = ha(row[j], x);
        else r = fa(row[j], x, carry);
        next.push(r.s); carry = r.c;
      }
      acc = next; top = carry;
      c.connect(acc[0], c.output('P' + k));
    }
    for (let j = 1; j < n; j++) c.connect(acc[j], c.output('P' + (n - 1 + j)));
    c.connect(top, c.output('P' + (2 * n - 1)));
    return c;
  }
  S.topic({
    id: 'array-multiplier', family: 'p4-arith', order: 10, title: 'Array multiplier',
    blurb: 'Binary multiplication is shift-and-add: each bit of B selects A (an AND gate per bit) shifted to its place, and rows of adders sum the partial products. Built as an array of gates, the product appears after the slowest path through the adders.',
    inputs: [
      { id: 'n', kind: 'choice', label: 'Size', def: '3', options: [{ value: '2', label: '2 × 2 bits' }, { value: '3', label: '3 × 3 bits' }, { value: '4', label: '4 × 4 bits' }] },
      { id: 'a', kind: 'number', label: 'A', def: 5, min: 0, max: 15, check: (v, inp) => (v >= 1 << +inp.n ? 'A: at most ' + ((1 << +inp.n) - 1) : null) },
      { id: 'b', kind: 'number', label: 'B', def: 7, min: 0, max: 15, check: (v, inp) => (v >= 1 << +inp.n ? 'B: at most ' + ((1 << +inp.n) - 1) : null) },
    ],
    presets: [
      { label: '3 × 3: 5 × 7', values: { n: '3', a: 5, b: 7 } },
      { label: '2 × 2: 3 × 3', values: { n: '2', a: 3, b: 3 } },
      { label: '4 × 4: 13 × 11', values: { n: '4', a: 13, b: 11 } },
      { label: '4 × 4: 15 × 15, the largest', values: { n: '4', a: 15, b: 15 } },
    ],
    counters: [{ id: 'pp', label: 'partial products' }, { id: 'adds', label: 'adder rows' }],
    run(inp) {
      const n = +inp.n, a = inp.a, b = inp.b, P = a * b;
      const F = new S.Frames(['pp', 'adds']);
      // the paper picture: columns by weight, 2n − 1 at the left
      const W = 36, gap = 4, cols = 2 * n, X = (wt) => 130 + (cols - 1 - wt) * (W + gap);
      const bitsOf = (v, k) => [...Array(k).keys()].map((i) => (v >> i) & 1);
      const cell = (key, wt, y, v, cls) => ({ key, kind: 'cell', x: X(wt), y, w: W, h: 30, text: String(v), cls: 'p4-bit' + (String(v) === '1' ? ' one' : '') + (cls ? ' ' + cls : ''), size: 15 });
      const label = (key, y, text) => ({ key, kind: 'text', x: 0, y: y + 20, text, cls: 'strong', size: 14 });
      const items0 = () => {
        const it = [label('la', 0, 'A = ' + a), label('lb', 36, '× B = ' + b)];
        bitsOf(a, n).forEach((v, i) => it.push(cell('a' + i, i, 0, v)));
        bitsOf(b, n).forEach((v, i) => it.push(cell('b' + i, i, 36, v, 'act')));
        it.push({ key: 'rule1', kind: 'line', x1: X(cols - 1), y1: 74, x2: X(0) + W, y2: 74, cls: 'p4-rule' });
        return it;
      };
      const ppY = (k) => 84 + k * 36;
      const ppItems = (upto, hotRow) => {
        const it = [];
        for (let k = 0; k <= upto; k++) {
          const bk = (b >> k) & 1;
          it.push(label('lp' + k, ppY(k), 'A·b' + k + (bk ? ' (b' + k + ' = 1)' : ' (b' + k + ' = 0)')));
          bitsOf(bk ? a : 0, n).forEach((v, j) => it.push(cell('pp' + k + '_' + j, j + k, ppY(k), v, k === hotRow ? 'hot' : '')));
        }
        return it;
      };
      F.add({ items: items0(), say: 'Multiply A = ' + L.bits(a, n) + ' by B = ' + L.bits(b, n) + '. As on paper: one row for each bit of B, shifted left by its place.', scene: 'arr' });
      for (let k = 0; k < n; k++) {
        F.set('pp', (k + 1) * n);
        const bk = (b >> k) & 1;
        F.add({ items: items0().concat(ppItems(k, k)), say: 'Row ' + k + ': each bit of A ANDed with b' + k + ' = ' + bk + ' gives ' + (bk ? 'A itself, ' + L.bits(a, n) : 'all zeros') + ', shifted ' + k + ' place' + (k === 1 ? '' : 's') + ' left. ' + n + ' AND gates per row.', scene: 'arr', meta: { row: k } });
      }
      // running sums
      const sumY = ppY(n) + 14;
      let acc = (b & 1) ? a : 0;
      const sums = [];
      for (let k = 1; k < n; k++) {
        acc += ((b >> k) & 1) ? a << k : 0;
        sums.push(acc);
        F.set('adds', k);
        const it = items0().concat(ppItems(n - 1), [{ key: 'rule2', kind: 'line', x1: X(cols - 1), y1: sumY - 6, x2: X(0) + W, y2: sumY - 6, cls: 'p4-rule' }]);
        sums.forEach((sv, i) => { it.push(label('ls' + i, sumY + i * 36, i === n - 2 ? 'product' : 'sum of rows 0–' + (i + 1))); bitsOf(sv, Math.min(cols, n + i + 2)).forEach((v, j) => it.push(cell('s' + i + '_' + j, j, sumY + i * 36, v, i === sums.length - 1 ? 'good' : ''))); });
        F.add({ items: it, say: 'Adder row ' + k + ' adds partial product ' + k + ' to the sum so far: ' + (k === 1 ? 'rows 0 and 1' : 'the running sum and row ' + k) + ' give ' + acc + ' = ' + L.bits(acc, cols) + '.' + (k === n - 1 ? ' That is the product.' : ''), scene: 'arr', meta: { add: k, sum: acc } });
      }
      // timing on the simulator
      const c = mulArray(n), sim = L.sim(c), names = [...Array(2 * n).keys()].map((i) => 'P' + i);
      const zero = {};
      for (let i = 0; i < n; i++) { zero['A' + i] = 0; zero['B' + i] = 0; }
      L.apply(sim, zero);
      const t0 = sim.time;
      const go = {};
      for (let i = 0; i < n; i++) { go['A' + i] = (a >> i) & 1; go['B' + i] = (b >> i) & 1; }
      const ch = L.change(sim, c, go);
      const sta = S.Sim.sta(c);
      const pw = L.busWave(sim, names, t0).map(([t, v]) => [r2(t - t0), v]);
      const tEnd = r2(ch.end - t0) + 5;
      const gates = c.parts.filter((p) => N.GATES.has(p.type)).length;
      const steps = [...new Set(pw.map((x) => x[0]))];
      const show = steps.length > 6 ? [steps[0], steps[Math.floor(steps.length / 3)], steps[Math.floor((2 * steps.length) / 3)], steps[steps.length - 1]] : steps;
      show.forEach((t, k) => {
        const v = pw.filter((x) => x[0] <= t).pop()[1];
        const it = [title('h', 0, -14, 'The gate-level array on the simulator: ' + gates + ' gates')];
        bitsOf(typeof v === 'number' ? v : 0, cols).forEach((bv, j) => it.push(cell('t' + j, j, 0, bv, t >= tEnd - 5 ? 'good' : 'hot')));
        it.push(label('lt', 0, 'P at ' + t + ' ns'));
        const last = k === show.length - 1;
        it.push(...L.waves({ prefix: 'pw', x: 0, y: 56, w: 420, t0: 0, t1: tEnd, now: last ? tEnd : t, signals: [{ name: 'P', changes: pw, width: cols }] }).items);
        F.add({ items: it, say: t === 0 ? 'Now the real circuit: ' + gates + ' gates, A and B applied together at 0 ns.' : 'At ' + t + ' ns the outputs read ' + (typeof v === 'number' ? v : 'unknown') + '. ' + (last ? 'The product settles at ' + t + ' ns' + (pw.length > 2 ? ', after passing through ' + pw.slice(1, -1).map((x) => x[1]).join(', ') + ' on the way: wrong products shown while the carries are still moving' : '') + '. The worst case for any inputs is ' + r2(sta.comb) + ' ns, along a path that runs down through every adder row and along the last one.' : 'Bits further left wait for carries from the rows above.'), scene: 'sim', meta: { t, settle: k === show.length - 1 } });
      });
      L.views(F.list);
      const def = { sections: [{ id: 'eq', kind: 'math', title: 'An n × n array', text: ['partial product (j, k) = A(j)·B(k), weight j + k', 'n² AND gates', 'n − 1 rows of n-bit adders', 'product: 2n bits', 'here ' + gates + ' gates, worst case ' + r2(sta.comb) + ' ns'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.add !== undefined, pick: 'option', ask: 'What will the running sum be after this adder row?', options: (fr, i) => { const s = fr[i + 1].meta.sum; return [...new Set([s, s + 1, Math.max(0, s - 2), s * 2])].map(String); }, answer: (fr, i) => String(fr[i + 1].meta.sum), explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => f.meta && f.meta.row !== undefined && fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.row !== undefined, pick: 'option', ask: 'The next partial-product row: A, or all zeros?', options: ['A, shifted', 'all zeros'], answer: (fr, i, inp) => (((inp.b >> fr[i + 1].meta.row) & 1) ? 'A, shifted' : 'all zeros'), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'How many AND gates does a 4 × 4 array multiplier need for its partial products?', options: ['4', '8', '16', '32'], answer: 2, why: 'One for every pair of bits: 4 × 4.' },
      { q: 'The product of two n-bit numbers needs at most…', options: ['n bits', 'n + 1 bits', '2n bits', 'n² bits'], answer: 2, why: '(2^n − 1)² < 2^(2n).' },
      { q: 'A partial-product row is all zeros when…', options: ['the matching bit of B is 0', 'A is odd', 'the row is the last', 'never'], answer: 0, why: 'Each row is A ANDed with one bit of B.' },
      { q: 'Why is an array multiplier slower than an adder of the same width?', options: ['AND gates are slow', 'The carries must pass through several rows of adders', 'It uses more inputs', 'It is not slower'], answer: 1, why: 'The worst path runs through every adder row and along the last.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Magnitude comparator
  // ---------------------------------------------------------------------------------------------------
  const cmp2 = () => N.fromExpressions('cmp2', { GT: "A1B1' + (A1 ^ B1)'A0B0'", EQ: "(A1 ^ B1)'(A0 ^ B0)'", LT: "A1'B1 + (A1 ^ B1)'A0'B0" }, 'multi', { inputs: ['A1', 'B1', 'A0', 'B0'] });
  const cmpN = (n) => {
    const x = (i) => '(A' + i + ' ^ B' + i + ")'";
    const term = (i, gt) => [...Array(n - 1 - i).keys()].map((k) => x(n - 1 - k)).join('') + (gt ? 'A' + i + 'B' + i + "'" : 'A' + i + "'B" + i);
    const ins = [...Array(n).keys()].reverse().flatMap((i) => ['A' + i, 'B' + i]);
    return N.fromExpressions('cmp' + n, { GT: [...Array(n).keys()].reverse().map((i) => term(i, true)).join(' + '), EQ: [...Array(n).keys()].reverse().map(x).join(''), LT: [...Array(n).keys()].reverse().map((i) => term(i, false)).join(' + ') }, 'multi', { inputs: ins });
  };
  S.topic({
    id: 'magnitude-comparator', family: 'p4-arith', order: 20, title: 'Magnitude comparator',
    blurb: 'Is A greater than, equal to or less than B? Mark each bit position where A and B agree, x(i) = (A(i) ⊕ B(i))′. Then the first position from the top where they differ decides: A > B if A has the 1 there.',
    inputs: [
      { id: 'n', kind: 'choice', label: 'Bits', def: '4', options: [{ value: '2', label: '2 (every gate drawn, running)' }, { value: '4', label: '4' }] },
      { id: 'a', kind: 'number', label: 'A', def: 11, min: 0, max: 15, check: (v, inp) => (v >= 1 << +inp.n ? 'A: at most ' + ((1 << +inp.n) - 1) : null) },
      { id: 'b', kind: 'number', label: 'B', def: 9, min: 0, max: 15, check: (v, inp) => (v >= 1 << +inp.n ? 'B: at most ' + ((1 << +inp.n) - 1) : null) },
    ],
    presets: [
      { label: '4 bits: 1011 against 1001', values: { n: '4', a: 11, b: 9 } },
      { label: '4 bits: equal', values: { n: '4', a: 6, b: 6 } },
      { label: '4 bits: decided at the top', values: { n: '4', a: 7, b: 8 } },
      { label: '2 bits, running: 2 against 3', values: { n: '2', a: 2, b: 3 } },
      { label: '2 bits, running: 3 against 1', values: { n: '2', a: 3, b: 1 } },
    ],
    counters: [{ id: 'bits', label: 'bits examined' }],
    run(inp) {
      const n = +inp.n, a = inp.a, b = inp.b;
      const verdict = a > b ? 'GT' : a < b ? 'LT' : 'EQ';
      const word = { GT: 'A > B', LT: 'A < B', EQ: 'A = B' }[verdict];
      const F = new S.Frames(['bits']);
      if (n === 2) {
        const c = cmp2(), ins = ['A1', 'B1', 'A0', 'B0'];
        const env = (x, y) => ((x >> 1) & 1) * 8 + ((y >> 1) & 1) * 4 + (x & 1) * 2 + (y & 1);
        const w = L.walk({ c, ins, outs: ['GT', 'EQ', 'LT'], rows: [env(0, 0), env(a, b)], table: false, waves: ['A1', 'B1', 'A0', 'B0', 'GT', 'EQ', 'LT'],
          sayRow: (e, o) => { const x = e.A1 * 2 + e.A0, y = e.B1 * 2 + e.B0; return 'A = ' + x + ', B = ' + y + ': GT = ' + o.GT + ', EQ = ' + o.EQ + ', LT = ' + o.LT + '.'; } });
        w.frames.forEach((f) => F.add(f));
        F.set('bits', 2);
        F.add(Object.assign({}, F.last(), { say: 'GT = A1B1′ + x1·A0B0′: A is bigger if it wins at the top bit, or ties there and wins at the next. EQ = x1·x0. LT is GT with A and B swapped. Here ' + word + '.', meta: { end: true, verdict } }));
        return { frames: F.list, def: { sections: [{ id: 'eq', kind: 'math', title: 'Two bits', text: "x1 = (A1 ⊕ B1)′\nGT = A1B1′ + x1A0B0′\nEQ = x1x0\nLT = A1′B1 + x1A0′B0" }] } };
      }
      const cols = [...Array(n).keys()].reverse();
      const xb = (i) => 1 - (((a >> i) ^ (b >> i)) & 1);
      const tbl = (upto, hot) => K.table.draw({ prefix: 'cb', x: 0, y: 0, mono: true, cw: 44, ch: 32, size: 15, corner: 'bit', colHead: cols.map(String), rowHead: ['A', 'B', 'x = (A ⊕ B)′'],
        rows: [cols.map((i) => (a >> i) & 1), cols.map((i) => (b >> i) & 1), cols.map((i) => (i >= upto ? xb(i) : ''))],
        cls: (r, cc) => { const i = cols[cc]; if (i === hot) return 'act'; if (r === 2 && i >= upto) return xb(i) ? 'good' : 'bad'; return ''; } });
      F.add({ items: tbl(n).items.concat(title('h', 0, -14, 'A = ' + L.bits(a, n) + ' (' + a + ')   B = ' + L.bits(b, n) + ' (' + b + ')')), say: 'Compare A = ' + a + ' with B = ' + b + ', starting at the most significant bit, where a difference matters most.', scene: 't' });
      let decided = null;
      for (const i of cols) {
        F.count('bits');
        const ai = (a >> i) & 1, bi = (b >> i) & 1;
        let say;
        if (ai === bi) say = 'Bit ' + i + ': A' + i + ' = B' + i + ' = ' + ai + ', so x' + i + ' = 1: no decision yet, look at the next bit down.';
        else { decided = ai ? 'GT' : 'LT'; say = 'Bit ' + i + ': A' + i + ' = ' + ai + ' and B' + i + ' = ' + bi + ', so x' + i + ' = 0. Every bit above agreed, so this bit decides: ' + (ai ? 'A > B' : 'A < B') + '. The term ' + (ai ? 'GT' : 'LT') + ' = ' + cols.filter((k) => k > i).map((k) => 'x' + k).join('') + (ai ? 'A' + i + 'B' + i + '′' : 'A' + i + '′B' + i) + ' is 1.'; }
        F.add({ items: tbl(i, i).items.concat(title('h', 0, -14, 'A = ' + L.bits(a, n) + ' (' + a + ')   B = ' + L.bits(b, n) + ' (' + b + ')')), say, scene: 't', meta: { bit: i, decided: decided !== null } });
        if (decided) break;
      }
      // the equations, with the term that fires lit
      const terms = (gt) => cols.map((i) => ({ text: cols.filter((k) => k > i).map((k) => 'x' + k).join('') + (gt ? 'A' + i + 'B' + i + '′' : 'A' + i + '′B' + i), v: cols.filter((k) => k > i).every((k) => xb(k)) && (gt ? ((a >> i) & 1) && !((b >> i) & 1) : !((a >> i) & 1) && ((b >> i) & 1)) ? 1 : 0 }));
      const eqItems = [];
      const row = (key, y, name, ts) => {
        let x = 0;
        eqItems.push({ key: key + ':n', kind: 'text', x, y: y + 22, text: name + ' =', cls: 'p4-mono', size: 15 });
        x += 70;
        ts.forEach((t, k) => {
          const w = S.geom.textWidth(t.text, 14, { mono: true }) + 18;
          eqItems.push({ key: key + ':' + k, kind: 'cell', x, y, w, h: 32, text: t.text, cls: 'p4-bit' + (t.v ? ' good' : ''), size: 14 });
          x += w + 8;
        });
      };
      row('gt', 150, 'GT', terms(true));
      row('lt', 196, 'LT', terms(false));
      row('eq', 242, 'EQ', [{ text: cols.map((i) => 'x' + i).join(''), v: a === b ? 1 : 0 }]);
      // the real circuit, on the simulator, for its delay
      const c = cmpN(n), sim = L.sim(c);
      L.apply(sim, Object.fromEntries(cols.flatMap((i) => [['A' + i, 0], ['B' + i, 0]])));
      const t0 = sim.time;
      const ch = L.change(sim, c, Object.fromEntries(cols.flatMap((i) => [['A' + i, (a >> i) & 1], ['B' + i, (b >> i) & 1]])));
      const got = { GT: sim.get('GT'), EQ: sim.get('EQ'), LT: sim.get('LT') };
      F.add({ items: tbl(decided ? cols.find((i) => xb(i) === 0) : 0).items.concat(eqItems, title('h', 0, -14, 'A = ' + L.bits(a, n) + ' (' + a + ')   B = ' + L.bits(b, n) + ' (' + b + ')')), say: 'In the equations, exactly one term of one output is 1 (lit), or EQ = 1 when every x is 1. Built as gates and run on the simulator: GT = ' + got.GT + ', EQ = ' + got.EQ + ', LT = ' + got.LT + ', settled ' + r2(ch.end - t0) + ' ns after A and B changed. So ' + word + '.', scene: 't', meta: { end: true, verdict } });
      L.views(F.list);
      const def = { sections: [{ id: 'eq', kind: 'math', title: n + '-bit comparator', text: ['x(i) = (A(i) ⊕ B(i))′ = A(i)B(i) + A(i)′B(i)′', 'EQ = ' + cols.map((i) => 'x' + i).join(''), 'GT = ' + terms(true).map((t) => t.text).join(' + '), 'LT = ' + terms(false).map((t) => t.text).join(' + ')].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.bit !== undefined && !f.meta.decided, pick: 'option', ask: 'Will the next bit down decide the comparison?', options: ['Yes, it decides', 'No, they agree there'], answer: (fr, i, inp) => { const nx = fr[i + 1] && fr[i + 1].meta; if (!nx || nx.bit === undefined) return null; return nx.decided ? 'Yes, it decides' : 'No, they agree there'; }, explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => i === 0, pick: 'option', ask: 'Which output will be 1?', options: ['GT (A > B)', 'EQ (A = B)', 'LT (A < B)'], answer: (fr) => ({ GT: 'GT (A > B)', EQ: 'EQ (A = B)', LT: 'LT (A < B)' })[fr[fr.length - 1].meta.verdict], explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'x(i) = (A(i) ⊕ B(i))′ is 1 when…', options: ['A(i) and B(i) are equal', 'A(i) = 1', 'A(i) > B(i)', 'both are 1 only'], answer: 0, why: 'An XNOR is 1 when its inputs agree.' },
      { q: 'Comparing 0110 with 0101, which bit decides?', options: ['bit 3', 'bit 2', 'bit 1', 'bit 0'], answer: 2, why: 'Bits 3 and 2 agree; at bit 1, A has 1 and B has 0, so A > B.' },
      { q: 'EQ for 4 bits is…', options: ['x3 + x2 + x1 + x0', 'x3x2x1x0', 'A ⊕ B', 'GT + LT'], answer: 1, why: 'Equal means every position agrees.' },
      { q: 'If neither GT nor EQ is 1, then…', options: ['LT is 1', 'the comparator failed', 'A = B', 'both are 0'], answer: 0, why: 'Exactly one of the three is always 1.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
