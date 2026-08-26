// Part 4, procedures and code converters: analysing a gate circuit (outputs labelled, equations derived gate by
// gate, the truth table read off the running circuit), designing one from a word problem (table, maps, minimal
// equations, circuit, check), and the code converters: BCD to excess-3, BCD to seven segments with a live
// display, and binary to Gray and back.
(function (S) {
  'use strict';
  const K = S.Kit, L = K.live, B = S.Bool, N = S.Netlist;
  const title = (key, x, y, text, cls, size) => ({ key, kind: 'text', x, y, text, cls: cls || 'strong', size: size || 15 });
  const mono = (key, x, y, text, cls) => ({ key, kind: 'text', x, y, text, cls: 'p4-mono' + (cls ? ' ' + cls : ''), size: 14, mono: true });
  /** text broken into lines of at most n characters */
  const wrap = (s, n) => { const out = []; let line = ''; for (const w of String(s).split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line.trim()); line = w; } else line += ' ' + w; } if (line.trim()) out.push(line.trim()); return out; };
  const tableFrom = (vars, outs, rows, filled, o) => K.table.draw(Object.assign({ prefix: 'tt', x: 0, y: 0, mono: true, minW: 34, ch: rows.length > 10 ? 24 : 28, size: rows.length > 10 ? 13 : 14,
    colHead: vars.concat(outs.map((x) => x.name)), rows: rows.map((m) => vars.map((_, i) => String((m >> (vars.length - 1 - i)) & 1)).concat(outs.map((x) => (filled(m) ? String(x.value(m)) : '')))),
    cls: (r, c) => (c >= vars.length ? 'out' : '') }, o || {}));

  S.family({ id: 'p4-procedures', part: 'combinational', order: 10, title: 'Analysis, design and code converters', blurb: 'Reading a circuit back to its equations and table, building one from a word problem, and the classic converters between codes.' });

  // ---------------------------------------------------------------------------------------------------
  // The analysis procedure
  // ---------------------------------------------------------------------------------------------------
  const ANALYSIS = {
    fa5: { label: 'Five gates, two outputs', ins: ['A', 'B', 'C'], outs: ['F1', 'F2'], gates: [['T1', 'XOR', 'A', 'B'], ['T2', 'AND', 'A', 'B'], ['T3', 'AND', 'T1', 'C'], ['F1', 'XOR', 'T1', 'C'], ['F2', 'OR', 'T2', 'T3']], verdict: 'F1 = A ⊕ B ⊕ C and F2 = AB + C(A ⊕ B) = AB + AC + BC: the sum and carry of a full adder.' },
    nor4: { label: 'Four NOR gates', ins: ['A', 'B', 'C'], outs: ['F'], gates: [['T1', 'NOR', 'A', 'B'], ['T2', 'NOR', 'B', 'C'], ['T3', 'NOR', 'A', 'C'], ['F', 'NOR', 'T1', 'T2', 'T3']], verdict: 'F = AB + BC + AC: the majority of three inputs, built as a product of sums.' },
    xor4: { label: 'Four NANDs, two inputs', ins: ['A', 'B'], outs: ['F'], gates: [['T1', 'NAND', 'A', 'B'], ['T2', 'NAND', 'A', 'T1'], ['T3', 'NAND', 'B', 'T1'], ['F', 'NAND', 'T2', 'T3']], verdict: 'F = A′B + AB′ = A ⊕ B: the exclusive-OR, from four NANDs.' },
    mixed: { label: 'NOR, XOR and AND', ins: ['A', 'B', 'C'], outs: ['F1', 'F2'], gates: [['T1', 'NOR', 'A', 'B'], ['T2', 'NOR', 'B', 'C'], ['F1', 'NOR', 'T1', 'T2'], ['T3', 'XOR', 'A', 'C'], ['F2', 'AND', 'T3', 'B']], verdict: 'F1 = (A + B)(B + C) = B + AC, and F2 = B(A ⊕ C): B together with "exactly one of A and C". Neither is a familiar function, which is exactly when the procedure earns its keep.' },
  };
  const OPS = { AND: 'and', OR: 'or', XOR: 'xor', NAND: 'and', NOR: 'or', XNOR: 'xor' };
  function analysisCircuit(spec) {
    const c = new N.Circuit('analysis'), sig = {};
    for (const v of spec.ins) sig[v] = c.input(v).pin('y');
    for (const [name, type, ...ins] of spec.gates) {
      const g = L.G(c, type, ...ins.map((x) => sig[x]));
      sig[name] = g;
      c.name(g, name, true);
    }
    for (const o of spec.outs) c.connect(sig[o], c.output(o));
    return c;
  }
  S.topic({
    id: 'analysis-procedure', family: 'p4-procedures', order: 10, title: 'The analysis procedure',
    blurb: 'Given a circuit, what does it do? Name every gate output, write each one as an expression of the inputs (working from the inputs forward), simplify the outputs, then run the circuit through every input row to fill its truth table.',
    inputs: [{ id: 'circuit', kind: 'choice', label: 'Circuit', def: 'nor4', options: Object.entries(ANALYSIS).map(([k, v]) => ({ value: k, label: v.label })) }],
    presets: Object.keys(ANALYSIS).map((k) => ({ label: ANALYSIS[k].label, values: { circuit: k } })),
    counters: [{ id: 'eqs', label: 'equations' }, { id: 'rows', label: 'rows' }],
    run(inp) {
      const spec = ANALYSIS[inp.circuit], c = analysisCircuit(spec), res = K.schem.layout(c), sw = res.bounds.w, sh = res.bounds.h;
      const sim = L.sim(c);
      const ast = {};
      for (const v of spec.ins) ast[v] = { op: 'var', name: v };
      const F = new S.Frames(['eqs', 'rows']);
      const lines = [];
      const listX = sw + 50;
      const eqItems = (hot) => lines.map((l, i) => mono('eq' + i, listX, 20 + i * 26, l.text, l.g === hot ? 'hot' : l.out ? 'good' : ''));
      const gateId = new Map();
      for (const p of c.parts) if (p.net.y && p.net.y.name) gateId.set(p.net.y.name, p.id);
      F.add({ items: [L.item('c', c, 0, 0), title('h', 0, -20, 'Step 1: name every gate output')], say: 'Step 1: give every gate output a name. The gates fed only by inputs come first: ' + spec.gates.filter((g) => g.slice(2).every((x) => spec.ins.includes(x))).map((g) => g[0]).join(', ') + '. The names are written beside the wires.', scene: 'eq' });
      spec.gates.forEach(([name, type, ...ins], k) => {
        const args = ins.map((x) => ast[x]);
        let e;
        if (type === 'NOT') e = { op: 'not', a: args[0] };
        else { e = { op: OPS[type], args }; if (type[0] === 'N' || type === 'XNOR') e = { op: 'not', a: e }; }
        ast[name] = e;
        const local = type === 'NOT' ? ins[0] + '′' : (type[0] === 'N' || type === 'XNOR' ? '(' : '') + ins.join(type.includes('AND') ? '' : type.includes('XOR') || type === 'XNOR' ? ' ⊕ ' : ' + ') + (type[0] === 'N' || type === 'XNOR' ? ')′' : '');
        const fn = B.fromExpr(e, spec.ins), min = B.minimise(fn);
        const out = spec.outs.includes(name);
        const inner = ins.filter((x) => !spec.ins.includes(x));
        // a long simplified form goes on a line of its own, under the gate's own expression
        const tail = min.text !== local ? ' = ' + min.text : '';
        if (tail && (name + local + tail).length > 26) lines.push({ text: name + ' = ' + local, out, g: k }, { text: '\u00a0'.repeat(name.length + 1) + tail, out, g: k });
        else lines.push({ text: name + ' = ' + local + tail, out, g: k });
        F.count('eqs');
        F.add({ items: [L.item('c', c, 0, 0, { hot: [gateId.get(name)] }), title('h', 0, -20, 'Step 2: each output as a function of the inputs')].concat(eqItems(k)), say: name + (type === 'NOT' ? ' is the inverse of ' + ins[0] : ' is ' + (/^(AND|OR|XOR|XNOR)$/.test(type) ? 'an ' : 'a ') + type + ' of ' + ins.join(' and ')) + ': ' + name + ' = ' + local + '. ' + (inner.length ? 'Putting in what ' + inner.join(' and ') + ' stand' + (inner.length === 1 ? 's' : '') + ' for and simplifying' : 'Its inputs are all circuit inputs, so it is already in terms of them; simplified') + ': ' + name + ' = ' + min.text + '.' + (out ? ' This is an output.' : ''), scene: 'eq', narrowView: L.pad({ x: listX - 10, y: 0, w: 280, h: Math.max(80, lines.length * 26 + 20) }, 10), meta: { gate: name, simple: min.text } });
      });
      // the truth table, read off the running circuit
      const n = spec.ins.length, rows = [...Array(1 << n).keys()];
      const got = new Map();
      const tbl = (hot) => K.table.draw({ prefix: 'tt', x: sw + 50, y: 0, mono: true, minW: 34, ch: 28, size: 14, colHead: spec.ins.concat(spec.outs), rows: rows.map((m) => spec.ins.map((_, i) => String((m >> (n - 1 - i)) & 1)).concat(spec.outs.map((o) => (got.has(m) ? String(got.get(m)[o]) : '')))), hot: hot === undefined ? [] : spec.outs.map((_, i) => [hot, n + i]), act: hot === undefined ? [] : spec.ins.map((_, i) => [hot, i]) });
      for (const m of rows) {
        L.apply(sim, L.envOf(spec.ins, m));
        const out = Object.fromEntries(spec.outs.map((o) => [o, sim.get(o)]));
        got.set(m, out);
        F.count('rows');
        F.add({ items: [L.item('c', c, 0, 0, { values: L.values(sim, c) }), title('h', 0, -20, 'Step 3: run every input row')].concat(tbl(m).items), say: 'Row ' + m + ': ' + spec.ins.map((v, i) => v + ' = ' + ((m >> (n - 1 - i)) & 1)).join(', ') + ' gives ' + spec.outs.map((o) => o + ' = ' + out[o]).join(', ') + '.', scene: 'tt', meta: { row: m, out } });
      }
      F.add({ items: [L.item('c', c, 0, 0, { values: L.values(sim, c) }), title('h', 0, -20, 'What it does')].concat(tbl().items), say: spec.verdict, scene: 'tt', meta: { end: true } });
      L.views(F.list);
      const def = { sections: [{ id: 'proc', kind: 'math', title: 'The procedure', text: ['1. name each gate output', '2. write each name as an expression,', '   from the inputs forward', '3. substitute and simplify the outputs', '4. fill the truth table, row by row', '', ...lines.map((l) => l.text)].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.row !== undefined && fr[i + 1].meta.row % 3 === 2, pick: 'option', options: (fr, i) => { const o = fr[i + 1].meta.out, ks = Object.keys(o); const opts = []; const rec = (j, acc) => { if (j === ks.length) { opts.push(acc.join(', ')); return; } for (const v of [0, 1]) rec(j + 1, acc.concat(ks[j] + ' = ' + v)); }; rec(0, []); return opts; }, ask: 'From the equations, what will the next row give?', answer: (fr, i) => { const o = fr[i + 1].meta.out; return Object.keys(o).map((k) => k + ' = ' + o[k]).join(', '); }, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'The analysis procedure works through the gates…', options: ['from the outputs back to the inputs', 'from the inputs forward', 'in any order', 'only for two-level circuits'], answer: 1, why: 'Each gate\'s expression needs the expressions of the gates feeding it.' },
      { q: 'T1 = (AB)′ and F = (A·T1)′. Then F equals…', options: ['A′ + B', 'A + B′', 'AB′', 'A′B'], answer: 0, why: 'F = (A(AB)′)′ = A′ + AB = A′ + B.' },
      { q: 'Why fill the truth table as well as derive equations?', options: ['The table proves nothing', 'It checks the algebra and shows the function at a glance', 'Equations cannot describe circuits', 'Only to count gates'], answer: 1, why: 'A table is unambiguous: two circuits with the same table are the same function.' },
      { q: 'A circuit with 3 inputs has a truth table of…', options: ['3 rows', '6 rows', '8 rows', '9 rows'], answer: 2, why: '2^3 = 8 input combinations.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The design procedure
  // ---------------------------------------------------------------------------------------------------
  const isPrime = (m) => m > 1 && [2, 3, 5, 7, 11, 13].includes(m);
  const DESIGNS = {
    vote: { label: 'A committee of three votes', vars: ['A', 'B', 'C'], text: 'Three members vote yes (1) or no (0) on A, B and C. The motion passes, F = 1, when at least two vote yes.', outs: [{ name: 'F', value: (m) => (((m >> 2) & 1) + ((m >> 1) & 1) + (m & 1) >= 2 ? 1 : 0) }], why: (m, v) => (v.F ? 'two or more yes votes' : 'fewer than two yes votes') },
    prime: { label: 'Prime detector, 4 bits', vars: ['A', 'B', 'C', 'D'], text: 'ABCD is a number from 0 to 15 (A the most significant bit). P = 1 when the number is prime: 2, 3, 5, 7, 11 or 13.', outs: [{ name: 'P', value: (m) => (isPrime(m) ? 1 : 0) }], why: (m, v) => m + (v.P ? ' is prime' : ' is not prime') },
    greater: { label: 'Is one 2-bit number bigger?', vars: ['A', 'B', 'C', 'D'], text: 'AB and CD are two 2-bit numbers. G = 1 when AB is greater than CD.', outs: [{ name: 'G', value: (m) => ((m >> 2) > (m & 3) ? 1 : 0) }], why: (m, v) => (m >> 2) + (v.G ? ' > ' : ' ≤ ') + (m & 3) },
    middle: { label: 'Between 2 and 5', vars: ['A', 'B', 'C'], text: 'ABC is a number from 0 to 7. M = 1 when it is 2, 3, 4 or 5: in the middle of the range.', outs: [{ name: 'M', value: (m) => (m >= 2 && m <= 5 ? 1 : 0) }], why: (m, v) => m + (v.M ? ' is between 2 and 5' : ' is outside 2 to 5') },
    seven: { label: 'Divisible by three, 3 bits', vars: ['A', 'B', 'C'], text: 'ABC is a number from 0 to 7. T = 1 when it is a multiple of three (0, 3 or 6).', outs: [{ name: 'T', value: (m) => (m % 3 === 0 ? 1 : 0) }], why: (m, v) => m + (v.T ? ' is a multiple of 3' : ' is not a multiple of 3') },
  };
  S.topic({
    id: 'design-procedure', family: 'p4-procedures', order: 20, title: 'The design procedure',
    blurb: 'From words to gates: decide the inputs and outputs, write the truth table from the specification, minimise each output on a K-map, draw the circuit, and check it against the table by running it.',
    inputs: [{ id: 'spec', kind: 'choice', label: 'Specification', def: 'prime', options: Object.entries(DESIGNS).map(([k, v]) => ({ value: k, label: v.label })) }],
    presets: Object.keys(DESIGNS).map((k) => ({ label: DESIGNS[k].label, values: { spec: k } })),
    counters: [{ id: 'rows', label: 'rows written' }, { id: 'gates', label: 'gates' }],
    run(inp) {
      const d = DESIGNS[inp.spec], vars = d.vars, n = vars.length, rows = [...Array(1 << n).keys()];
      const F = new S.Frames(['rows', 'gates']);
      const specLines = wrap(d.text, 56);
      const specItems = specLines.map((l, i) => title('sp' + i, 0, 20 + i * 24, l, 'strong', 15));
      F.add({ items: [title('h', 0, -14, 'Step 1: the specification', 'title')].concat(specItems, [title('io', 0, 30 + specLines.length * 24, 'Inputs: ' + vars.join(', ') + '.   Outputs: ' + d.outs.map((o) => o.name).join(', ') + '.', 'hot', 15)]), say: 'Step 1: read the specification and name the inputs and outputs. ' + d.text, scene: 'spec' });
      // the table, filled a few rows at a time
      const per = rows.length > 8 ? 4 : 2;
      let filled = 0;
      const val = (m) => Object.fromEntries(d.outs.map((o) => [o.name, o.value(m)]));
      while (filled < rows.length) {
        const from = filled;
        filled = Math.min(rows.length, filled + per);
        F.set('rows', filled);
        const t = tableFrom(vars, d.outs, rows, (m) => m < filled, { hot: [...Array(filled - from).keys()].flatMap((k) => d.outs.map((_, i) => [from + k, n + i])) });
        F.add({ items: t.items.concat(title('h', 0, -14, 'Step 2: the truth table', 'title')), say: 'Rows ' + from + ' to ' + (filled - 1) + ': ' + rows.slice(from, filled).map((m) => d.why(m, val(m)) + ' → ' + d.outs.map((o) => o.name + ' = ' + o.value(m)).join(' ')).join('; ') + '.', scene: 'table', meta: { rowsTo: filled } });
      }
      // a map for each output
      const mins = d.outs.map((o) => ({ o, fn: B.fromMinterms(vars, rows.filter((m) => o.value(m))), min: null }));
      mins.forEach((x) => { x.min = B.minimise(x.fn); });
      const mapItems = (upto, groups) => {
        const items = [];
        let x = 0;
        mins.forEach((m, i) => {
          if (i > upto) return;
          const km = K.km.draw({ fn: m.fn, prefix: 'km' + i, x, y: 30, cell: n <= 2 ? 52 : 50, groups: groups || i < upto ? m.min.cover.map((t, k) => ({ cube: t.cube, tone: k % 6 })) : [] });
          items.push(...km.items, title('kt' + i, x, 14, m.o.name, 'strong', 16));
          if (groups || i < upto) items.push(mono('ke' + i, x, km.box.h + 54, m.o.name + ' = ' + m.min.text, 'good'));
          x += km.box.w + 40;
        });
        return items;
      };
      mins.forEach((m, i) => {
        F.add({ items: mapItems(i, false).concat(title('h', 0, -14, 'Step 3: minimise', 'title')), say: 'Copy ' + m.o.name + ' into a K-map: ' + (m.fn.ones.size ? 'its 1s are at ' + B.minterms(m.fn).join(', ') + '.' : 'it has no 1s at all.'), scene: 'map', meta: { map: i } });
        F.add({ items: mapItems(i, true).concat(title('h', 0, -14, 'Step 3: minimise', 'title')), say: m.min.cover.length ? 'Circle the largest groups that cover the 1s: ' + m.min.cover.map((t) => t.text).join(', ') + '. So ' + m.o.name + ' = ' + m.min.text + '.' : m.o.name + ' is always 0, so it needs no gates: ' + m.o.name + ' = 0.', scene: 'map', meta: { map: i, done: true } });
      });
      // the circuit
      const outs = Object.fromEntries(mins.map((m) => [m.o.name, m.min.expr]));
      const c = L.sop('design', outs, vars);
      const gates = c.parts.filter((p) => N.GATES.has(p.type)).length;
      F.set('gates', gates);
      F.add({ items: [L.item('c', c, 0, 0), title('h', 0, -14, 'Step 4: the circuit', 'title')], say: 'Step 4: build each minimal sum of products as AND gates feeding an OR: ' + mins.map((m) => m.o.name + ' = ' + m.min.text).join(', ') + '. ' + gates + ' gate' + (gates === 1 ? '' : 's') + ' in all' + (c.parts.some((p) => p.type === 'NOT') ? ', counting the inverters for complemented inputs' : '') + '.', scene: 'circ' });
      // check by running it
      const sim = L.sim(c);
      let agree = 0;
      const samples = [];
      for (const m of rows) {
        L.apply(sim, L.envOf(vars, m));
        const ok = d.outs.every((o) => sim.get(o.name) === o.value(m));
        if (ok) agree++;
        if (samples.length < 3 && (m === rows.find((r) => d.outs.some((o) => o.value(r))) || m === rows.length - 1 || m === 0)) samples.push({ m, vals: L.values(sim, c), out: val(m) });
      }
      samples.forEach((s) => F.add({ items: [L.item('c', c, 0, 0, { values: s.vals }), title('h', 0, -14, 'Step 5: check, row ' + s.m, 'title')], say: 'Step 5: run the circuit. Row ' + s.m + ' (' + vars.map((v, i) => v + ' = ' + ((s.m >> (n - 1 - i)) & 1)).join(', ') + '): ' + d.outs.map((o) => o.name + ' = ' + s.out[o.name]).join(', ') + ', as the table says. Wires carrying 1 are lit.', scene: 'circ' }));
      F.add({ items: [L.item('c', c, 0, 0, { values: samples.length ? samples[samples.length - 1].vals : undefined }), title('h', 0, -14, 'Checked', 'title')], say: 'All ' + rows.length + ' rows run on the simulator: the circuit agrees with the table on ' + agree + ' of ' + rows.length + '. The design is done.', scene: 'circ', meta: { end: true } });
      L.views(F.list);
      const def = { sections: [{ id: 'proc', kind: 'math', title: 'The procedure', text: ['1. inputs and outputs from the words', '2. the truth table', '3. minimise each output (K-map)', '4. draw the circuit', '5. check it against the table', '', ...mins.map((m) => m.o.name + ' = ' + m.min.text)].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => f.meta && f.meta.map !== undefined && !f.meta.done && fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.done, pick: 'option', ask: 'How many product terms will the minimal sum of products need?', options: ['0', '1', '2', '3', '4', '5 or more'], answer: (fr, i, inp) => { const d = DESIGNS[inp.spec], o = d.outs[fr[i].meta.map]; const fn = B.fromMinterms(d.vars, [...Array(1 << d.vars.length).keys()].filter((m) => o.value(m))); const k = B.minimise(fn).cover.length; return k >= 5 ? '5 or more' : String(k); }, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'The first step of the design procedure is…', options: ['drawing gates', 'naming the inputs and outputs from the specification', 'a K-map', 'choosing a technology'], answer: 1, why: 'Everything after depends on what the inputs and outputs are.' },
      { q: 'A prime detector for 0..15 has P = 1 for how many rows?', options: ['4', '5', '6', '7'], answer: 2, why: '2, 3, 5, 7, 11 and 13.' },
      { q: 'Why run the finished circuit through the table?', options: ['To find its delay only', 'To catch mistakes made in the steps before', 'Because K-maps are wrong', 'It is not needed'], answer: 1, why: 'A copying slip or a wrong group shows up as a row that disagrees.' },
      { q: 'An output that is 0 in every row needs…', options: ['one AND gate', 'no gates: tie it to 0', 'an inverter', 'a decoder'], answer: 1, why: 'A constant needs no logic.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // BCD to excess-3
  // ---------------------------------------------------------------------------------------------------
  const XS3 = { W: 'A + BC + BD', X: "B'C + B'D + BC'D'", Y: "CD + C'D'", Z: "D'" };
  const digitsCheck = (v) => { const xs = String(v).split(/[\s,]+/).filter(Boolean); if (!xs.length || xs.length > 6 || xs.some((x) => !/^\d$/.test(x))) return 'Digits: up to six digits from 0 to 9, separated by commas'; return null; };
  S.topic({
    id: 'bcd-excess3', family: 'p4-procedures', order: 30, title: 'Code converter: BCD to excess-3',
    blurb: 'Excess-3 is each decimal digit plus three, in four bits. Ten input codes are used and six (1010 to 1111) never occur, so they are don\'t-cares: the maps get much simpler. Then the converter runs on digits you choose.',
    inputs: [{ id: 'digits', kind: 'text', label: 'Digits to convert', def: '0, 4, 5, 9', check: digitsCheck }],
    presets: [{ label: '0, 4, 5, 9', values: { digits: '0, 4, 5, 9' } }, { label: '2, 7', values: { digits: '2, 7' } }, { label: '9, 8, 7, 6', values: { digits: '9, 8, 7, 6' } }],
    counters: [{ id: 'conv', label: 'digits converted' }],
    run(inp) {
      const vars = ['A', 'B', 'C', 'D'], outs = ['W', 'X', 'Y', 'Z'], rows = [...Array(16).keys()];
      const xs = (m) => m + 3;
      const F = new S.Frames(['conv']);
      const tbl = K.table.draw({ prefix: 'tt', x: 0, y: 0, mono: true, minW: 32, ch: 24, size: 13, colHead: ['digit'].concat(vars, outs), rows: rows.map((m) => [m < 10 ? String(m) : '–'].concat(vars.map((_, i) => String((m >> (3 - i)) & 1)), outs.map((_, i) => (m < 10 ? String((xs(m) >> (3 - i)) & 1) : 'X')))), cls: (r) => (r >= 10 ? 'read' : '') });
      F.add({ items: tbl.items.concat(title('h', 0, -14, 'BCD in, excess-3 out', 'title')), say: 'The table: digit d in BCD on A B C D, d + 3 in binary on W X Y Z. Rows 10 to 15 cannot happen in BCD, so their outputs are don\'t-cares (X): the maps may treat each as 0 or 1, whichever helps.', scene: 'table' });
      const fns = outs.map((o, i) => B.fromMinterms(vars, rows.filter((m) => m < 10 && (xs(m) >> (3 - i)) & 1), [10, 11, 12, 13, 14, 15]));
      const mins = fns.map((f) => B.minimise(f));
      let x = 0;
      const mapAll = [];
      outs.forEach((o, i) => {
        const km = K.km.draw({ fn: fns[i], prefix: 'km' + i, x: (i % 2) * 330, y: 30 + Math.floor(i / 2) * 330, cell: 48, numSize: 11, groups: mins[i].cover.map((t, k) => ({ cube: t.cube, tone: k % 6 })) });
        mapAll.push({ items: km.items.concat(title('kt' + i, (i % 2) * 330, 14 + Math.floor(i / 2) * 330, o + ' = ' + mins[i].text, 'strong', 16)), box: km.box });
        x += 1;
      });
      outs.forEach((o, i) => {
        const items = [];
        for (let k = 0; k <= i; k++) items.push(...mapAll[k].items);
        F.add({ items, say: o + ': its 1s and the six don\'t-cares on the map; the groups use don\'t-cares to grow. ' + o + ' = ' + mins[i].text + '.', scene: 'maps', meta: { map: i }, narrowView: L.pad({ x: (i % 2) * 330, y: Math.floor(i / 2) * 330, w: 300, h: 300 }, 10) });
      });
      const c = L.sop('xs3', Object.fromEntries(outs.map((o, i) => [o, mins[i].expr])), vars);
      const digits = String(inp.digits).split(/[\s,]+/).filter(Boolean).map(Number);
      const w = L.walk({ c, ins: vars, outs, rows: digits, detail: 1, sayRow: (env, o) => { const d = env.A * 8 + env.B * 4 + env.C * 2 + env.D; return 'Digit ' + d + ' = ' + L.bits(d, 4) + ' in BCD becomes ' + outs.map((k) => o[k]).join('') + ' = ' + (d + 3) + ' in excess-3.'; } });
      let k = 0;
      w.frames.forEach((f) => { if (f.meta.settled) k++; F.set('conv', k); f.scene = 'walk'; F.add(f); });
      L.views(F.list);
      const def = { sections: [{ id: 'eq', kind: 'math', title: 'Equations (don\'t-cares used)', text: outs.map((o, i) => o + ' = ' + mins[i].text).join('\n') }].concat(w.def.sections) };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.first && fr[i + 1].meta.row !== undefined && !(f.meta && f.meta.first && f.meta.settled && i === fr.findIndex((x) => x.meta && x.meta.row !== undefined)), pick: 'option', ask: 'What excess-3 code will come out for the next digit?', options: (fr, i) => { const m = fr[i + 1].meta.row; return [...new Set([m + 3, m + 2, m + 4, (m + 3) ^ 8].map((v) => L.bits(v & 15, 4)))]; }, answer: (fr, i) => L.bits(fr[i + 1].meta.row + 3, 4), explain: (fr, i) => { const s = fr.slice(i + 1).find((f) => f.meta && f.meta.settled); return s ? s.say : ''; } },
    ],
    quiz: [
      { q: 'The excess-3 code of 6 is…', options: ['0110', '1001', '1000', '0011'], answer: 1, why: '6 + 3 = 9 = 1001.' },
      { q: 'Why are rows 1010 to 1111 don\'t-cares?', options: ['They give zero', 'They never occur in BCD', 'They are errors that must output 0', 'The converter ignores A'], answer: 1, why: 'A BCD digit is 0 to 9; the other six codes are never applied.' },
      { q: 'Z (the last bit of excess-3) equals…', options: ['D', 'D′', 'C ⊕ D', 'A'], answer: 1, why: 'Adding 3 (odd) flips the last bit.' },
      { q: 'Using don\'t-cares lets the groups on a map…', options: ['be any shape', 'grow larger, giving fewer literals', 'overlap less', 'include zeros'], answer: 1, why: 'A don\'t-care may be taken as 1 when it makes a bigger group.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // BCD to seven segments, with a live display
  // ---------------------------------------------------------------------------------------------------
  const SEG_EQ = { a: "A + C + BD + B'D'", b: "B' + C'D' + CD", c: "B + C' + D", d: "A + B'D' + B'C + CD' + BC'D", e: "B'D' + CD'", f: "A + C'D' + BC' + BD'", g: "A + BC' + B'C + CD'" };
  S.topic({
    id: 'bcd-seven-segment', family: 'p4-procedures', order: 40, title: 'BCD to seven-segment decoder',
    blurb: 'Seven outputs, one per bar of the display, each a function of the BCD digit. Pick a segment to see its map and its gates; the whole decoder runs on the simulator and lights a real-looking display, digit by digit.',
    inputs: [
      { id: 'seg', kind: 'choice', label: 'Segment to study', def: 'e', options: 'abcdefg'.split('').map((s) => ({ value: s, label: 'segment ' + s })) },
      { id: 'digits', kind: 'text', label: 'Digits to show', def: '2, 3, 8, 6', check: (v) => { const xs = String(v).split(/[\s,]+/).filter(Boolean); if (!xs.length || xs.length > 6 || xs.some((x) => !/^\d+$/.test(x) || +x > 15)) return 'Digits: up to six codes from 0 to 15, separated by commas'; return null; } },
    ],
    presets: [
      { label: 'Segment e, digits 2 3 8 6', values: { seg: 'e', digits: '2, 3, 8, 6' } },
      { label: 'Segment a, counting 0 to 5', values: { seg: 'a', digits: '0, 1, 2, 3, 4, 5' } },
      { label: 'Segment g, digits 1 7 0', values: { seg: 'g', digits: '1, 7, 0' } },
      { label: 'What codes 10 to 15 show', values: { seg: 'c', digits: '9, 10, 12, 15' } },
    ],
    counters: [{ id: 'shown', label: 'digits shown' }],
    run(inp) {
      const vars = ['A', 'B', 'C', 'D'], seg = inp.seg, si = 'abcdefg'.indexOf(seg);
      const F = new S.Frames(['shown']);
      // the segment table and a display showing which bars each digit lights
      const tbl = K.table.draw({ prefix: 'st', x: 0, y: 0, mono: true, cw: 30, ch: 24, size: 13, colHead: ['d'].concat('abcdefg'.split('')), rows: [...Array(10).keys()].map((d) => [String(d)].concat('abcdefg'.split('').map((s) => (L.DIGITS[d].includes(s) ? '1' : '0')))), cls: (r, cc) => (cc === si + 1 ? 'act' : '') });
      const disp0 = L.seven({ x: tbl.box.w + 50, y: 10, size: 50, on: 'abcdefg', names: true, prefix: 'sd', label: 'segment names' });
      F.add({ items: tbl.items.concat(disp0.items, title('h', 0, -14, 'Which bars each digit lights', 'title')), say: 'The bars are named a to g, clockwise from the top, with g in the middle. Each column of the table is one output of the decoder; segment ' + seg + ' is lit for the digits ' + [...Array(10).keys()].filter((d) => L.DIGITS[d].includes(seg)).join(', ') + '.', scene: 'table' });
      const fn = B.fromMinterms(vars, [...Array(10).keys()].filter((d) => L.DIGITS[d].includes(seg)), [10, 11, 12, 13, 14, 15]);
      const min = B.minimise(fn);
      const km = K.km.draw({ fn, prefix: 'km', x: 0, y: 30, cell: 48, groups: min.cover.map((t, k) => ({ cube: t.cube, tone: k % 6 })) });
      F.add({ items: km.items.concat(title('h', 0, 14, 'segment ' + seg + ' = ' + min.text, 'strong', 16)), say: 'Segment ' + seg + ' on a K-map, codes 10 to 15 as don\'t-cares: ' + seg + ' = ' + min.text + '. Each of the seven segments gets a map like this.', scene: 'map' });
      const used = vars.filter((v) => B.vars(min.expr).includes(v));
      const one = L.sop('seg' + seg, { [seg]: min.expr }, used);
      // the whole decoder, simulated (not drawn): every segment's minimal sum of products
      const full = N.fromExpressions('bcd7', Object.fromEntries('abcdefg'.split('').map((s) => [s, B.minimise(B.fromMinterms(vars, [...Array(10).keys()].filter((d) => L.DIGITS[d].includes(s)), [10, 11, 12, 13, 14, 15])).expr])), 'and-or', { inputs: vars });
      for (const p of full.parts) if (p.type === 'IN' && !p.net.y) full.leaveOpen(p.pin('y'));
      const fs = L.sim(full), os = L.sim(one);
      const digits = String(inp.digits).split(/[\s,]+/).filter(Boolean).map(Number);
      const res = K.schem.layout(one), sw = res.bounds.w;
      digits.forEach((dg, k) => {
        const env = L.envOf(vars, dg);
        L.apply(fs, env); L.apply(os, Object.fromEntries(used.map((v) => [v, env[v]])));
        const lit = 'abcdefg'.split('').filter((s) => fs.get(s) === 1).join('');
        const disp = L.seven({ x: sw + 60, y: 0, size: 50, on: lit, prefix: 'dd', label: 'code ' + L.bits(dg, 4) });
        F.count('shown');
        const want = dg < 10 ? L.DIGITS[dg] : null;
        const sayIt = 'Code ' + L.bits(dg, 4) + (dg < 10 ? ' (digit ' + dg + ')' : ' (not a BCD digit)') + ': the decoder lights ' + (lit ? lit.split('').join(', ') : 'nothing') + '. Segment ' + seg + ' = ' + os.get(seg) + (dg < 10 ? '.' : '. For codes 10 to 15 the don\'t-cares decided the outputs, so the display shows whatever shape the minimised logic happens to give.');
        F.add({ items: [L.item('c', one, 0, 0, { values: L.values(os, one) })].concat(disp.items, title('h', 0, -16, 'segment ' + seg + ' = ' + min.text, 'strong')), say: sayIt, scene: 'live', meta: { digit: dg, lit, segv: os.get(seg), valid: dg < 10, want } });
      });
      L.views(F.list);
      const def = { sections: [{ id: 'eq', kind: 'math', title: 'All seven segments (minimal)', text: 'abcdefg'.split('').map((s) => s + ' = ' + B.minimise(B.fromMinterms(vars, [...Array(10).keys()].filter((d) => L.DIGITS[d].includes(s)), [10, 11, 12, 13, 14, 15])).text).join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.digit !== undefined, pick: 'option', ask: 'Will the segment being studied be lit for the next code?', options: ['lit (1)', 'dark (0)'], answer: (fr, i) => (fr[i + 1].meta.segv === 1 ? 'lit (1)' : 'dark (0)'), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'Which segments light for the digit 7?', options: ['a, b, c', 'b, c', 'a, b, c, f', 'a, b, g, c'], answer: 0, why: 'A 7 is the top bar and the two right-hand bars.' },
      { q: 'How many outputs does a BCD to seven-segment decoder have?', options: ['4', '7', '10', '16'], answer: 1, why: 'One per segment, a to g.' },
      { q: 'Segment g (the middle bar) is dark for…', options: ['0, 1 and 7', '0 and 8', '1 and 4', 'only 0'], answer: 0, why: 'Only 0, 1 and 7 have no middle bar.' },
      { q: 'What does the display show for the code 1100?', options: ['Always blank', 'Always an error sign', 'Whatever the don\'t-care choices produce', 'The digit 12'], answer: 2, why: 'Those rows were left as don\'t-cares, so the minimised logic decides.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Binary to Gray and back
  // ---------------------------------------------------------------------------------------------------
  function grayCircuit(n, toGray) {
    const c = new N.Circuit(toGray ? 'b2g' : 'g2b'), G = L.G;
    const ins = [];
    for (let i = n - 1; i >= 0; i--) ins[i] = c.input((toGray ? 'B' : 'G') + i).pin('y');
    const out = [];
    if (toGray) { out[n - 1] = ins[n - 1]; for (let i = n - 2; i >= 0; i--) out[i] = G(c, 'XOR', ins[i + 1], ins[i]); }
    else { out[n - 1] = ins[n - 1]; for (let i = n - 2; i >= 0; i--) out[i] = G(c, 'XOR', out[i + 1], ins[i]); }
    for (let i = n - 1; i >= 0; i--) c.connect(out[i], c.output((toGray ? 'G' : 'B') + i));
    return c;
  }
  S.topic({
    id: 'gray-converter', family: 'p4-procedures', order: 50, title: 'Code converter: binary and Gray',
    blurb: 'Binary to Gray: each Gray bit is the XOR of two neighbouring binary bits, all at once. Gray to binary: each binary bit needs the one above it, so the XORs form a chain and the answer ripples down. Counting shows why Gray code is used: one bit changes per step.',
    inputs: [
      { id: 'dir', kind: 'choice', label: 'Direction', def: 'b2g', options: [{ value: 'b2g', label: 'Binary → Gray' }, { value: 'g2b', label: 'Gray → binary' }] },
      { id: 'n', kind: 'choice', label: 'Bits', def: '3', options: [{ value: '3', label: '3' }, { value: '4', label: '4' }] },
      { id: 'steps', kind: 'number', label: 'Count up to', def: 4, min: 2, max: 15 },
    ],
    check: (inp) => (inp.steps >= 1 << +inp.n ? 'Count up to: at most ' + ((1 << +inp.n) - 1) + ' for ' + inp.n + ' bits' : null),
    presets: [
      { label: 'Binary → Gray, counting 0 to 4', values: { dir: 'b2g', n: '3', steps: 4 } },
      { label: 'Gray → binary, 3 bits', values: { dir: 'g2b', n: '3', steps: 7 } },
      { label: 'Binary → Gray, 4 bits to 8', values: { dir: 'b2g', n: '4', steps: 8 } },
      { label: 'Gray → binary, 4 bits: the chain', values: { dir: 'g2b', n: '4', steps: 3 } },
    ],
    counters: [{ id: 'rows', label: 'codes converted' }],
    run(inp) {
      const n = +inp.n, toGray = inp.dir === 'b2g', c = grayCircuit(n, toGray);
      const ins = [...Array(n).keys()].reverse().map((i) => (toGray ? 'B' : 'G') + i), outs = [...Array(n).keys()].reverse().map((i) => (toGray ? 'G' : 'B') + i);
      const gray = (v) => v ^ (v >> 1);
      // in Gray to binary the inputs step through the Gray sequence, so the binary output counts
      const rows = [...Array(inp.steps + 1).keys()].map((v) => (toGray ? v : gray(v)));
      const w = L.walk({ c, ins, outs, rows, detail: toGray ? 2 : Math.min(3, rows.length - 1),
        sayRow: (env, o) => { const a = ins.map((k) => env[k]).join(''), b = outs.map((k) => o[k]).join(''); return (toGray ? 'Binary ' + a + ' (' + parseInt(a, 2) + ') is Gray ' + b : 'Gray ' + a + ' is binary ' + b + ' (' + parseInt(b, 2) + ')') + '.'; } });
      let k = 0;
      for (const f of w.frames) { if (f.meta.settled) k++; f.counters = { rows: k }; }
      // bits that differ from one settled code to the next (the waves also hold the first settling from unknown)
      const flips = (names) => w.plan.slice(1).reduce((s, p, k) => { const q = w.plan[k], val = (x, nm) => (ins.includes(nm) ? (x.m >> (n - 1 - ins.indexOf(nm))) & 1 : x.out[nm]); return s + names.filter((nm) => val(p, nm) !== val(q, nm)).length; }, 0);
      const gNames = toGray ? outs : ins, bNames = toGray ? ins : outs;
      const gT = flips(gNames), bT = flips(bNames);
      w.frames.push(Object.assign({}, w.frames[w.frames.length - 1], { say: 'Over the count, the Gray bits changed ' + gT + ' times in all, the binary bits ' + bT + ' times: Gray code changes exactly one bit per step, so a reading taken mid-change is never far off. ' + (toGray ? 'Every Gray bit is one XOR from the inputs, so all settle together.' : 'Each binary bit waits for the one above it: the delay grows with the number of bits.'), meta: { end: true } }));
      return { frames: w.frames, def: { sections: [{ id: 'eq', kind: 'math', title: 'Equations', text: toGray ? 'G(n−1) = B(n−1)\nG(i) = B(i+1) ⊕ B(i)' : 'B(n−1) = G(n−1)\nB(i) = B(i+1) ⊕ G(i)   (a chain)' }].concat(w.def.sections) } };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.first && fr[i + 1].meta.row !== undefined && i > 0, pick: 'option', ask: 'How many output bits will change for the next code?', options: ['0', '1', '2', '3', '4'], answer: (fr, i) => { const s = fr.slice(i + 1).find((f) => f.meta && f.meta.settled), p = fr.slice(0, i + 1).reverse().find((f) => f.meta && f.meta.settled); if (!s || !p) return null; return String(Object.keys(s.meta.out).filter((k) => s.meta.out[k] !== p.meta.out[k]).length); }, explain: (fr, i) => { const s = fr.slice(i + 1).find((f) => f.meta && f.meta.settled); return s ? s.say : ''; } },
    ],
    quiz: [
      { q: 'The Gray code of binary 0110 is…', options: ['0101', '0110', '0100', '0111'], answer: 0, why: 'G3 = 0, G2 = 0 ⊕ 1 = 1, G1 = 1 ⊕ 1 = 0, G0 = 1 ⊕ 0 = 1.' },
      { q: 'Going from one count to the next, Gray code changes…', options: ['one bit', 'two bits', 'all bits', 'as many bits as binary'], answer: 0, why: 'That is its defining property.' },
      { q: 'Why is Gray to binary slower than binary to Gray?', options: ['It needs more inputs', 'Each binary bit depends on the binary bit above it, a chain of XORs', 'XOR gates are slower in that direction', 'It is not slower'], answer: 1, why: 'B(i) = B(i+1) ⊕ G(i): the top bit\'s result ripples down.' },
      { q: 'Binary to Gray for n bits needs how many XOR gates?', options: ['n', 'n − 1', '2n', 'n²'], answer: 1, why: 'The top bit passes straight through.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
