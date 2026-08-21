// Part 2, gates: De Morgan as bubbles sliding through a gate, the gate symbols in both styles, positive and
// negative logic, NAND and NOR as universal gates, and XOR with parity.
(function (S) {
  'use strict';
  const K = S.Kit, X = K.expr;
  const B = () => S.Bool;
  const vName = (vs, env) => vs.map((v) => v + ' = ' + env[v]).join(', ');

  S.family({ id: 'p2-gates', part: 'algebra', order: 30, title: 'Logic gates', blurb: 'The gates, their two kinds of symbol, the bubble that means "complement", and why NAND or NOR alone is enough to build anything.' });

  // ---------------------------------------------------------------------------------------------------
  // De Morgan as bubbles sliding through a gate
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'demorgan-bubbles', family: 'p2-gates', order: 10, title: 'De Morgan: bubbles sliding through a gate',
    blurb: 'A bubble on a gate\'s output can slide back through the gate: it splits into a bubble on every input, and the gate changes from AND to OR (or OR to AND) as it passes. That is De Morgan\'s law, drawn.',
    inputs: [
      { id: 'gate', kind: 'choice', label: 'Start from', def: 'NAND', options: [{ value: 'NAND', label: 'NAND: (AB…)′' }, { value: 'NOR', label: 'NOR: (A + B + …)′' }] },
      { id: 'n', kind: 'number', label: 'Inputs', def: 2, min: 2, max: 4 },
    ],
    presets: [
      { label: 'NAND, two inputs', values: { gate: 'NAND', n: 2 } },
      { label: 'NOR, two inputs', values: { gate: 'NOR', n: 2 } },
      { label: 'NAND, three inputs', values: { gate: 'NAND', n: 3 } },
      { label: 'NOR, four inputs', values: { gate: 'NOR', n: 4 } },
    ],
    counters: [{ id: 'bubbles', label: 'bubbles' }, { id: 'rows', label: 'rows checked' }],
    run(inp) {
      const n = inp.n, nand = inp.gate === 'NAND';
      const vars = 'ABCD'.slice(0, n).split('');
      const inner = nand ? 'AND' : 'OR', outer = nand ? 'OR' : 'AND';
      const g0 = X.gate(inp.gate, n), gI = X.gate(inner, n), gO = X.gate(outer, n);
      const join = nand ? '' : ' + ';
      const lhsT = '(' + vars.join(join) + ')′', rhsT = vars.map((v) => v + '′').join(nand ? ' + ' : '');
      const lhs = B().parse('(' + vars.join(nand ? '' : '+') + ")'"), rhs = B().parse(vars.map((v) => v + "'").join(nand ? '+' : ''));
      const GX = 0, GY = 70;
      const F = new S.Frames(['bubbles', 'rows']);
      const tX = Math.max(g0.w, gI.w, gO.w) + 110;
      const shown = new Set();
      const outB = (g) => { const p = g.pin('y'); return { x: GX + p.x + 6, y: GY + p.y }; };
      const inB = (g, i) => { const p = g.pin('i' + i); return { x: GX + p.x - 7, y: GY + p.y }; };
      const scene = (o) => {
        const items = [];
        const g = o.g === 'start' ? g0 : o.g === 'inner' ? gI : gO;
        items.push(X.schem('gate:' + o.g, g, { x: GX, y: GY, env: o.env, only: o.bub === 'in' ? ['F'] : null }));
        if (o.bub === 'out') items.push(X.bubble('bo', outB(g).x, outB(g).y, { cls: 'xbubble' + (o.hotB ? ' hot' : '') }));
        if (o.bub === 'in') vars.forEach((v, i) => items.push(X.bubble('bi' + i, inB(g, i).x, inB(g, i).y, { cls: 'xbubble' + (o.hotB ? ' hot' : ''), enter: 'from', src: 'bo' })));
        const ex = X.chips(o.expr, { prefix: o.exprKey || 'e', x: GX, y: 0, size: 24, lit: o.lit || {} });
        items.push(...ex.items);
        if (o.caption) items.push({ key: 'cap', kind: 'text', x: GX, y: GY + g.h + 34, text: o.caption, cls: 'strong', size: 16 });
        const tb = X.table({ vars, prefix: 'tt', x: tX, y: 10, rowH: n > 3 ? 26 : 32, size: n > 3 ? 14 : 16, hot: o.row,
          cols: [{ name: lhsT, f: (env) => (o.cols >= 1 ? B().evaluate(lhs, env) : '') }, { name: rhsT, f: (env) => { const m = vars.reduce((a, v, i) => a | (env[v] << (n - 1 - i)), 0); return o.cols >= 2 && shown.has(m) ? B().evaluate(rhs, env) : ''; } }],
          cls: (r, c) => (c === n + 1 && shown.has(r) && o.cols >= 2 ? 'good' : '') });
        items.push(...tb.items);
        return items;
      };
      const gateBox = { x: GX - 20, y: -20, w: Math.max(g0.w, gI.w, gO.w) + 40, h: GY + Math.max(g0.h, gI.h, gO.h) + 70 };
      F.add({ items: scene({ g: 'start', expr: lhs, cols: 1, caption: inp.gate + ' = ' + inner + ' with a bubble on its output' }), narrowView: gateBox, say: 'A ' + n + '-input ' + inp.gate + ' computes ' + lhsT + ': the ' + inner + ' of the inputs, complemented. Its symbol is an ' + inner + ' with a small circle, a bubble, on the output.', meta: { start: true } });
      F.count('bubbles', 1);
      F.add({ items: scene({ g: 'inner', bub: 'out', hotB: true, expr: lhs, cols: 1, lit: { r: 'hot' }, caption: 'the bubble: complement whatever passes it' }), narrowView: gateBox, say: 'Think of the bubble as a part of its own: an inverter shrunk to a circle. Here it complements the ' + inner + ' gate\'s output.' });
      F.count('bubbles', n - 1);
      F.add({ items: scene({ g: 'outer', bub: 'in', hotB: true, expr: rhs, exprKey: 'e2', cols: 1, lit: { r: 'new' }, caption: outer + ' with a bubble on every input' }), narrowView: gateBox, mark: 'slide',
        say: 'Slide the bubble back through the gate: it splits into ' + n + ' bubbles, one on each input, and the ' + inner + ' turns into an ' + outer + '. The drawing now says ' + rhsT + '.' });
      for (let m = 0; m < 1 << n; m++) {
        if (n === 4 && m > 0 && m < 15 && m !== 5 && m !== 10) { shown.add(m); continue; }
        shown.add(m); F.count('rows', 1);
        const env = X.env(m, vars), a = B().evaluate(lhs, env);
        const its = scene({ g: 'outer', bub: 'in', expr: rhs, exprKey: 'e2', cols: 2, row: m, env });
        F.add({ items: its, narrowView: X.focus(its, ['tt:']), say: vName(vars, env) + ': the bubbles turn the inputs into ' + vars.map((v) => 1 - env[v]).join(', ') + '; their ' + outer + ' is ' + a + ', and ' + lhsT + ' = ' + a + ' too.', meta: { row: m, val: a } });
      }
      F.set('rows', 1 << n);
      F.add({ items: scene({ g: 'outer', bub: 'in', expr: rhs, exprKey: 'e2', cols: 2, caption: lhsT + ' = ' + rhsT }), mark: 'law',
        say: 'Both columns agree on all ' + (1 << n) + ' rows: ' + lhsT + ' = ' + rhsT + '. A ' + inp.gate + ' can be drawn either way; choosing the drawing whose bubbles meet other bubbles makes a circuit easy to read.' });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'De Morgan', text: ["(AB)′ = A′ + B′", "(A + B)′ = A′B′", '(ABC…)′ = A′ + B′ + C′ + …', '(A + B + C + …)′ = A′B′C′…', '', 'bubble on the output ⇄ bubbles on all inputs', 'AND ⇄ OR as the bubbles pass'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].mark === 'slide', pick: 'option', options: ['An AND with bubbled inputs', 'An OR with bubbled inputs', 'An AND with no bubbles', 'An XOR'], ask: 'The bubble slides back through the gate. What does the gate become?', answer: (fr, i, inp) => (inp.gate === 'NAND' ? 'An OR with bubbled inputs' : 'An AND with bubbled inputs'), explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.row === 1, pick: 'option', options: ['0', '1'], ask: 'Next row: what will the bubbled gate give?', answer: (fr, i) => String(fr[i + 1].meta.val), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A NAND gate can also be drawn as…', options: ['an AND with bubbled inputs', 'an OR with bubbled inputs', 'an OR with a bubbled output', 'an XOR'], answer: 1, why: '(AB)′ = A′ + B′.' },
      { q: "(A + B + C)' equals", options: ["A' + B' + C'", "A'B'C'", 'ABC', "(ABC)'"], answer: 1, why: 'De Morgan for three variables: the complement of a sum is the product of the complements.' },
      { q: 'When a bubble slides from the output to the inputs, the number of bubbles…', options: ['stays one', 'becomes one per input', 'becomes zero', 'doubles'], answer: 1, why: 'Each input gets its own bubble.' },
      { q: 'Two bubbles on the same wire…', options: ['make a NAND', 'cancel', 'make the wire 0', 'make an XOR'], answer: 1, why: 'Complementing twice gives the signal back: (X′)′ = X.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // the gates, in both symbol styles
  // ---------------------------------------------------------------------------------------------------
  const GATES = {
    AND: { e: (v) => v.join(''), rule: 'the output is 1 only when every input is 1' },
    OR: { e: (v) => v.join(' + '), rule: 'the output is 1 when any input is 1' },
    NOT: { e: (v) => v[0] + "'", rule: 'the output is the opposite of the input' },
    BUF: { e: (v) => v[0], rule: 'the output copies the input (a buffer restores the signal and adds drive)' },
    NAND: { e: (v) => '(' + v.join('') + ")'", rule: 'the output is 0 only when every input is 1' },
    NOR: { e: (v) => '(' + v.join(' + ') + ")'", rule: 'the output is 1 only when every input is 0' },
    XOR: { e: (v) => v.join(' ⊕ '), rule: 'the output is 1 when an odd number of inputs are 1' },
    XNOR: { e: (v) => '(' + v.join(' ⊕ ') + ")'", rule: 'the output is 1 when an even number of inputs are 1' },
  };
  S.topic({
    id: 'gate-symbols', family: 'p2-gates', order: 20, title: 'The gates and their two symbols',
    blurb: 'Every gate has two standard drawings: the distinctive shape (the D of AND, the shield of OR) and the rectangular box with its function written inside (&, ≥1, =1). Watch both answer each row.',
    inputs: [
      { id: 'gate', kind: 'choice', label: 'Gate', def: 'AND', options: Object.keys(GATES).map((k) => ({ value: k, label: k })) },
      { id: 'n', kind: 'number', label: 'Inputs', def: 2, min: 2, max: 3 },
    ],
    presets: Object.keys(GATES).map((k) => ({ label: k, values: { gate: k, n: 2 } })).concat([{ label: 'XOR, three inputs (odd parity)', values: { gate: 'XOR', n: 3 } }, { label: 'NOR, three inputs', values: { gate: 'NOR', n: 3 } }]),
    counters: [{ id: 'rows', label: 'rows' }, { id: 'ones', label: 'rows giving 1' }],
    run(inp) {
      const one = inp.gate === 'NOT' || inp.gate === 'BUF', n = one ? 1 : inp.n;
      const vars = 'ABC'.slice(0, n).split('');
      const g = X.gate(inp.gate, n), G = GATES[inp.gate];
      const e = B().parse(G.e(vars).replace(/⊕/g, '^'));
      const F = new S.Frames(['rows', 'ones']);
      const tX = g.w + 120;
      const shown = new Set();
      const scene = (o) => {
        o = o || {};
        const items = [];
        items.push(...X.chips(e, { prefix: 'e', x: 0, y: 0, size: 24 }).items, { key: 'eqF', kind: 'text', x: -10, y: 28, text: 'F =', anchor: 'end', cls: 'strong', size: 20 });
        items.push({ key: 't1', kind: 'text', x: 0, y: 78, text: 'distinctive shape', cls: 'title' }, X.schem('g1', g, { x: 0, y: 90, env: o.env, style: 'shape' }));
        items.push({ key: 't2', kind: 'text', x: 0, y: 90 + g.h + 44, text: 'rectangular symbol', cls: 'title' }, X.schem('g2', g, { x: 0, y: 90 + g.h + 56, env: o.env, style: 'rect' }));
        items.push(...X.table({ vars, prefix: 'tt', x: tX, y: 40, rowH: 34, size: 17, hot: o.row, cols: [{ name: 'F', f: (env) => { const m = vars.reduce((a, v, i) => a | (env[v] << (n - 1 - i)), 0); return shown.has(m) ? B().evaluate(e, env) : ''; } }] }).items);
        return items;
      };
      F.add({ items: scene(), say: 'The ' + inp.gate + ' gate' + (one ? '' : ' with ' + n + ' inputs') + ': F = ' + X.text(e) + '. Above, its distinctive-shape symbol; below, the rectangular one. They are the same gate: ' + G.rule + '.', meta: { start: true } });
      for (let m = 0; m < 1 << n; m++) {
        const env = X.env(m, vars), v = B().evaluate(e, env);
        shown.add(m); F.count('rows'); if (v) F.count('ones');
        F.add({ items: scene({ row: m, env }), say: vName(vars, env) + ' → F = ' + v + '.', meta: { row: m, v, env } });
      }
      F.add({ items: scene({}), mark: 'done', say: inp.gate + ': ' + G.rule + ' — here ' + F.counts.ones + ' of the ' + (1 << n) + ' rows give 1.' });
      const def = { sections: [{ id: 'g', kind: 'math', title: 'The gates', text: Object.entries(GATES).map(([k, x]) => k.padEnd(5) + ' ' + X.text(B().parse(x.e(['A', 'B']).replace(/⊕/g, '^')))).join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.row === (1 << Object.keys(fr[i + 1].meta.env).length) - 1, pick: 'option', options: ['0', '1'], ask: 'Every input is now 1. What will F be?', answer: (fr, i) => String(fr[i + 1].meta.v), explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'In the rectangular style, which mark means OR?', options: ['&', '≥1', '=1', '1'], answer: 1, why: 'At least one input must be 1.' },
      { q: 'Which gate gives 1 only when all inputs are 0?', options: ['NAND', 'NOR', 'XOR', 'AND'], answer: 1, why: 'NOR is OR complemented: any 1 makes it 0.' },
      { q: 'A three-input XOR gives 1 for inputs 1, 1, 1?', options: ['Yes, an odd number of 1s', 'No, it gives 0', 'Only for two inputs', 'It is undefined'], answer: 0, why: 'A many-input XOR is the odd function: three 1s is odd.' },
      { q: 'What does the small circle on a symbol mean?', options: ['a delay', 'complement', 'a clock', 'a pull-up'], answer: 1, why: 'The bubble inverts the signal at that point.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // positive and negative logic
  // ---------------------------------------------------------------------------------------------------
  const DEVICES = {
    and: { name: 'a device whose output is H only when both inputs are H', f: (a, b) => a & b },
    or: { name: 'a device whose output is H when either input is H', f: (a, b) => a | b },
    nand: { name: 'a device whose output is L only when both inputs are H', f: (a, b) => 1 - (a & b) },
    xor: { name: 'a device whose output is H when the inputs differ', f: (a, b) => a ^ b },
  };
  S.topic({
    id: 'pos-neg-logic', family: 'p2-gates', order: 30, title: 'Positive and negative logic',
    blurb: 'A circuit only knows high and low voltages. Calling high 1 (positive logic) or calling low 1 (negative logic) is a choice, and the same device is a different gate under each: an AND in one is an OR in the other.',
    inputs: [{ id: 'dev', kind: 'choice', label: 'Device', def: 'and', options: [{ value: 'and', label: 'H only if both H' }, { value: 'or', label: 'H if either H' }, { value: 'nand', label: 'L only if both H' }, { value: 'xor', label: 'H if they differ' }] }],
    presets: [{ label: 'H only if both inputs are H', values: { dev: 'and' } }, { label: 'H if either input is H', values: { dev: 'or' } }, { label: 'L only if both are H', values: { dev: 'nand' } }, { label: 'H if the inputs differ', values: { dev: 'xor' } }],
    counters: [{ id: 'rows', label: 'rows read' }],
    run(inp) {
      const D = DEVICES[inp.dev], vars = ['A', 'B'];
      const HL = (b) => (b ? 'H' : 'L');
      const pos = B().fromTable(vars, [0, 1, 2, 3].map((m) => D.f(m >> 1, m & 1)));
      const neg = B().dual(pos);
      const cp = B().classify2(pos), cn = B().classify2(neg);
      const gate = (c) => ({ AND: 'AND', OR: 'OR', NAND: 'NAND', NOR: 'NOR', XOR: 'XOR', 'XNOR (equivalence)': 'XNOR' }[c.name]);
      const gp = X.gate(gate(cp), 2), gn = X.gate(gate(cn), 2);
      const F = new S.Frames(['rows']);
      const done = new Set();
      const tab = (pre, x, title, cell, cls, hot) => {
        const items = [{ key: pre + ':t', kind: 'text', x: x + 87, y: -16, text: title, anchor: 'middle', cls: 'title' }];
        ['A', 'B', 'F'].forEach((h, c) => items.push({ key: pre + ':h' + c, kind: 'cell', x: x + c * 58, y: 0, w: 58, h: 34, text: h, cls: 'head', rx: 0 }));
        for (let m = 0; m < 4; m++) {
          const vals = [m >> 1, m & 1, D.f(m >> 1, m & 1)];
          vals.forEach((v, c) => items.push({ key: pre + ':' + m + ',' + c, kind: 'cell', x: x + c * 58, y: 34 + m * 38, w: 58, h: 38, rx: 0, text: done.has(m) || c < 2 && pre === 'ph' ? cell(v) : '', cls: 'mono ' + (done.has(m) || (c < 2 && pre === 'ph') ? cls(v) : '') + (hot === m ? ' hot' : ''), size: 18 }));
        }
        return items;
      };
      const scene = (o) => {
        o = o || {};
        const items = [];
        items.push(...tab('ph', 260, 'voltages', HL, (v) => 'lv' + HL(v), o.row));
        if (o.pos) items.push(...tab('po', 0, 'positive: H = 1', (v) => String(v), (v) => 'bit' + v, o.row));
        if (o.neg) items.push(...tab('ne', 520, 'negative: L = 1', (v) => String(1 - v), (v) => 'bit' + (1 - v), o.row));
        if (o.gates) {
          items.push(X.schem('gp', gp, { x: 87 - gp.w / 2, y: 230 }), { key: 'gpt', kind: 'text', x: 87, y: 230 + gp.h + 22, text: gate(cp) + ' in positive logic', anchor: 'middle', cls: 'strong' });
          items.push(X.schem('gn', gn, { x: 607 - gn.w / 2, y: 230 }), { key: 'gnt', kind: 'text', x: 607, y: 230 + gn.h + 22, text: gate(cn) + ' in negative logic', anchor: 'middle', cls: 'strong' });
        }
        return items;
      };
      F.add({ items: scene(), say: 'Take ' + D.name + '. The table records only voltages: L (low) and H (high).', meta: { start: true } });
      for (let m = 0; m < 4; m++) {
        done.add(m); F.count('rows');
        const a = m >> 1, b = m & 1, y = D.f(a, b);
        F.add({ items: scene({ row: m, pos: true, neg: true }), say: 'A = ' + HL(a) + ', B = ' + HL(b) + ' gives F = ' + HL(y) + '. Positive logic reads this row as ' + a + ', ' + b + ' → ' + y + '; negative logic reads it as ' + (1 - a) + ', ' + (1 - b) + ' → ' + (1 - y) + '.', meta: { row: m } });
      }
      F.add({ items: scene({ pos: true, neg: true }), say: 'Read as 0s and 1s, the positive table is ' + cp.name + ' and the negative one is ' + cn.name + '.', meta: { name: cn.name } });
      F.add({ items: scene({ pos: true, neg: true, gates: true }), mark: 'gates', say: 'One device, two gates: ' + gate(cp) + ' in positive logic, ' + gate(cn) + ' in negative logic. Swapping the meaning of H and L complements every input and the output, which turns a function into its dual.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Pairs', text: 'positive AND = negative OR\npositive OR = negative AND\npositive NAND = negative NOR\npositive XOR = negative XNOR' }] } };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.name, pick: 'option', options: ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR (equivalence)'], ask: 'Which gate is the negative-logic table?', answer: (fr, i) => fr[i + 1].meta.name, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'A device is an AND gate in positive logic. In negative logic it is…', options: ['AND', 'OR', 'NAND', 'XOR'], answer: 1, why: 'Complementing all inputs and the output of AND gives OR (De Morgan).' },
      { q: 'In negative logic, a high voltage means…', options: ['1', '0', 'undefined', 'Z'], answer: 1, why: 'Negative logic calls low 1 and high 0.' },
      { q: 'A positive-logic NAND is a negative-logic…', options: ['NAND', 'NOR', 'AND', 'OR'], answer: 1, why: 'The dual of NAND is NOR.' },
      { q: 'What changes when we switch from positive to negative logic?', options: ['The voltages', 'Only how we name them', 'The wiring', 'The delay'], answer: 1, why: 'The device is the same; only the meaning given to H and L changes.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // NAND and NOR are universal
  // ---------------------------------------------------------------------------------------------------
  function universalCircuit(fam, target) {
    const N = S.Netlist, c = new N.Circuit(fam + ' ' + target);
    const G = (...ins) => { const g = c.gate(fam, ins.length === 1 ? 2 : ins.length); if (ins.length === 1) c.connect(ins[0], g.pin('i0'), g.pin('i1')); else ins.forEach((s, i) => c.connect(s, g.pin('i' + i))); return g; };
    const A = c.input('A').pin('y'), Bp = target === 'NOT' ? null : c.input('B').pin('y');
    const says = [];
    let out;
    const nand = fam === 'NAND';
    if (target === 'NOT') { const g = G(A); out = g; says.push([g, 'tie both inputs to A: ' + fam + '(A, A) = ' + (nand ? '(AA)′' : '(A + A)′') + ' = A′']); }
    else if ((target === 'AND') === nand) {
      const g1 = G(A, Bp), g2 = G(g1.pin('y'));
      says.push([g1, fam + '(A, B) = ' + (nand ? '(AB)′' : '(A + B)′')]);
      says.push([g2, 'a second ' + fam + ' with tied inputs complements it: ' + (nand ? 'AB' : 'A + B')]);
      out = g2;
    } else if (target === 'AND' || target === 'OR') {
      const ga = G(A), gb = G(Bp), g = G(ga.pin('y'), gb.pin('y'));
      says.push([ga, fam + '(A, A) = A′'], [gb, fam + '(B, B) = B′']);
      says.push([g, nand ? "(A′B′)′ = A + B, by De Morgan" : "(A′ + B′)′ = AB, by De Morgan"]);
      out = g;
    } else {
      // XOR
      const g1 = G(A, Bp), g2 = G(A, g1.pin('y')), g3 = G(Bp, g1.pin('y')), g4 = G(g2.pin('y'), g3.pin('y'));
      says.push([g1, nand ? 'T = (AB)′' : 'T = (A + B)′'], [g2, nand ? '(A·T)′ = (AB′)′' : "(A + T)′ = A′B"], [g3, nand ? '(B·T)′ = (A′B)′' : "(B + T)′ = AB′"], [g4, nand ? "((AB′)′(A′B)′)′ = AB′ + A′B = A ⊕ B" : "(A′B + AB′)′ = (A ⊕ B)′"]);
      out = g4;
      if (!nand) { const g5 = G(g4.pin('y')); says.push([g5, 'one more NOR as an inverter: A ⊕ B']); out = g5; }
    }
    c.connect(out.pin('y'), c.output('F').pin('a'));
    return { circuit: c, res: X.layout(c), says };
  }
  S.topic({
    id: 'universal', family: 'p2-gates', order: 40, title: 'NAND and NOR are universal',
    blurb: 'NOT, AND and OR can each be built from NAND gates alone, and also from NOR gates alone, so either gate is enough for any circuit. Watch each construction gate by gate, then check it row by row.',
    inputs: [
      { id: 'fam', kind: 'choice', label: 'Only', def: 'NAND', options: [{ value: 'NAND', label: 'NAND gates' }, { value: 'NOR', label: 'NOR gates' }] },
      { id: 'target', kind: 'choice', label: 'Build', def: 'OR', options: ['NOT', 'AND', 'OR', 'XOR'].map((v) => ({ value: v, label: v })) },
    ],
    presets: [
      { label: 'NOT from NAND', values: { fam: 'NAND', target: 'NOT' } }, { label: 'AND from NAND', values: { fam: 'NAND', target: 'AND' } }, { label: 'OR from NAND', values: { fam: 'NAND', target: 'OR' } },
      { label: 'NOT from NOR', values: { fam: 'NOR', target: 'NOT' } }, { label: 'OR from NOR', values: { fam: 'NOR', target: 'OR' } }, { label: 'AND from NOR', values: { fam: 'NOR', target: 'AND' } },
      { label: 'XOR from four NANDs', values: { fam: 'NAND', target: 'XOR' } }, { label: 'XOR from five NORs', values: { fam: 'NOR', target: 'XOR' } },
    ],
    counters: [{ id: 'gates', label: 'gates placed' }, { id: 'rows', label: 'rows checked' }],
    run(inp) {
      const U = universalCircuit(inp.fam, inp.target);
      const one = inp.target === 'NOT', vars = one ? ['A'] : ['A', 'B'], n = vars.length;
      const ref = X.gate(inp.target, n);
      const tExpr = B().parse({ NOT: "A'", AND: 'AB', OR: 'A + B', XOR: 'A ^ B' }[inp.target]);
      const F = new S.Frames(['gates', 'rows']);
      const rX = ref.w + 70, tX = rX + U.res.bounds.w + 60;
      const shown = new Set();
      const scene = (o) => {
        o = o || {};
        const items = [{ key: 'rt', kind: 'text', x: 0, y: -14, text: 'wanted', cls: 'title' }, X.schem('ref', ref, { x: 0, y: U.res.bounds.h / 2 - ref.h / 2, env: o.env })];
        items.push({ key: 'eq', kind: 'text', x: ref.w + 22, y: U.res.bounds.h / 2 + 8, text: '=', cls: 'big' });
        items.push({ key: 'ut', kind: 'text', x: rX, y: -14, text: inp.fam + ' gates only', cls: 'title' }, X.schem('u', U, { x: rX, y: 0, env: o.env, hot: o.hot }));
        items.push(...X.table({ vars, prefix: 'tt', x: tX, y: 0, rowH: 34, size: 17, hot: o.row, cols: [{ name: inp.target, f: (env) => B().evaluate(tExpr, env) }, { name: 'built', f: (env) => { const m = vars.reduce((a, v, i) => a | (env[v] << (n - 1 - i)), 0); return shown.has(m) ? K.schem.values(U.circuit, env).F : ''; } }], cls: (r, c) => (c === n + 1 && shown.has(r) ? 'good' : '') }).items);
        return items;
      };
      F.add({ items: scene(), say: 'Build ' + inp.target + ' (left) from ' + inp.fam + ' gates only. It takes ' + U.says.length + ' ' + inp.fam + ' gate' + (U.says.length === 1 ? '' : 's') + '.', meta: { start: true, gates: U.says.length } });
      U.says.forEach(([g, t], i) => { F.count('gates'); const its = scene({ hot: [g.id] }); F.add({ items: its, narrowView: X.focus(its, ['u']), say: 'Gate ' + (i + 1) + ': ' + t + '.' }); });
      for (let m = 0; m < 1 << n; m++) {
        const env = X.env(m, vars); shown.add(m); F.count('rows');
        const v = +K.schem.values(U.circuit, env).F;
        const its = scene({ env, row: m });
        F.add({ items: its, narrowView: X.focus(its, ['tt:', 'u']), say: vName(vars, env) + ': the ' + inp.fam + ' circuit gives ' + v + ', and ' + inp.target + ' gives ' + B().evaluate(tExpr, env) + '.', meta: { row: m, v } });
      }
      F.add({ items: scene(), mark: 'done', say: 'The ' + inp.fam + ' circuit matches ' + inp.target + ' on every row. Since NOT, AND and OR can all be built this way, any Boolean function can be built from ' + inp.fam + ' gates alone.' });
      return { frames: F.list, def: { sections: [{ id: 'u', kind: 'math', title: 'The constructions', text: inp.fam === 'NAND' ? "NOT A = (AA)′\nAB = ((AB)′)′\nA + B = (A′B′)′" : "NOT A = (A + A)′\nA + B = ((A + B)′)′\nAB = (A′ + B′)′" }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.start, pick: 'option', options: ['1', '2', '3', '4', '5'], ask: 'How many gates will the construction need?', answer: (fr) => String(fr[0].meta.gates), explain: (fr) => fr[1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.row === 1, pick: 'option', options: ['0', '1'], ask: 'Next row: what will the built circuit give?', answer: (fr, i) => String(fr[i + 1].meta.v), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'How do you make an inverter from a two-input NAND?', options: ['Tie both inputs together', 'Tie one input to 0', 'Leave one input open', 'It cannot be done'], answer: 0, why: '(AA)′ = A′. Tying one input to 1 also works.' },
      { q: 'OR from NANDs needs…', options: ['1 gate', '2 gates', '3 gates', '4 gates'], answer: 2, why: 'Invert each input, then NAND them: (A′B′)′ = A + B.' },
      { q: 'Why are NAND and NOR called universal?', options: ['They are the fastest', 'Any function can be built from either one alone', 'They have the most inputs', 'They need no power'], answer: 1, why: 'Each can make NOT, AND and OR, which together make everything.' },
      { q: 'AND from NOR gates is…', options: ['((A + B)′)′', '(A′ + B′)′', '(A + B)′', 'A′B′'], answer: 1, why: 'De Morgan: (A′ + B′)′ = AB, with each A′ made by a NOR with tied inputs.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // XOR and parity
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'xor-parity', family: 'p2-gates', order: 50, title: 'XOR and parity',
    blurb: 'XOR is 1 for an odd number of 1s, so a tree of XOR gates counts 1s modulo 2. The sender adds a parity bit to make the count even; the receiver runs the same tree and any single flipped bit shows as a 1.',
    inputs: [
      { id: 'data', kind: 'string', label: 'Data bits', def: '1011', alphabet: '01', min: 2, max: 7 },
      { id: 'kind', kind: 'choice', label: 'Parity', def: 'even', options: [{ value: 'even', label: 'even' }, { value: 'odd', label: 'odd' }] },
      { id: 'flip', kind: 'number', label: 'Flip bit in transit (0 = none)', def: 2, min: 0, max: 8 },
    ],
    check: (inp) => (inp.flip > inp.data.length + 1 ? 'Flip bit: at most ' + (inp.data.length + 1) + ' (the data bits and the parity bit)' : null),
    presets: [
      { label: 'Even parity, one bit flipped', values: { data: '1011', kind: 'even', flip: 2 } },
      { label: 'Even parity, nothing flipped', values: { data: '1011', kind: 'even', flip: 0 } },
      { label: 'Odd parity, seven bits', values: { data: '1100101', kind: 'odd', flip: 5 } },
      { label: 'The parity bit itself flipped', values: { data: '110', kind: 'even', flip: 4 } },
      { label: 'All zeros', values: { data: '0000', kind: 'even', flip: 0 } },
    ],
    counters: [{ id: 'level', label: 'XOR levels' }],
    run(inp) {
      const bits = inp.data.split('').map(Number), n = bits.length, odd = inp.kind === 'odd';
      const names = 'ABCDEFGH'.slice(0, n).split('');
      const gen = X.circuit(B().parityTree(names, odd ? 'even' : 'odd'), { inputs: names, name: 'P', down: true });
      const lv = X.levels(gen.circuit), depth = Math.max(...lv.values());
      const env = Object.fromEntries(names.map((v, i) => [v, bits[i]]));
      const pb = B().parityBit(inp.data, inp.kind);
      const F = new S.Frames(['level']);
      const word = bits.concat([pb.bit]);
      const recv = word.slice(); if (inp.flip) recv[inp.flip - 1] ^= 1;
      const cnames = names.concat(['P']);
      const chk = X.circuit(B().parityTree(cnames, odd ? 'even' : 'odd'), { inputs: cnames, name: 'E', down: true });
      const cenv = Object.fromEntries(cnames.map((v, i) => [v, recv[i]]));
      const W = Math.max(gen.res.bounds.w, chk.res.bounds.w);
      const cellRow = (pre, vals, y, label, o) => {
        o = o || {};
        const items = [{ key: pre + ':l', kind: 'text', x: -14, y: y + 24, text: label, anchor: 'end', cls: 'title' }];
        vals.forEach((v, i) => items.push({ key: pre + ':n' + i, kind: 'text', x: i * 46 + 20, y: y + 56, text: i < n ? names[i] : 'P', anchor: 'middle', cls: 'strong', size: 13 }, { key: pre + ':' + i, kind: 'cell', x: i * 46, y, w: 40, h: 38, text: String(v), cls: 'mono bit' + v + (i === n ? ' act' : '') + (o.bad === i ? ' bad' : ''), size: 19, enter: o.from ? 'from' : undefined, src: o.from ? o.from + ':' + i : undefined }));
        return items;
      };
      const CX = (n + 1) * 46 + 80;
      const genView = (o) => {
        const items = cellRow('d', bits, 0, 'data');
        items.push({ key: 'gt', kind: 'text', x: CX, y: -8, text: 'parity generator', cls: 'title' }, X.schem('gen', gen, { x: CX, y: 6, env: o.env ? env : null, hot: o.hot }));
        return items;
      };
      F.add({ items: genView({}), say: 'Data ' + inp.data + ' has ' + pb.ones + ' one' + (pb.ones === 1 ? '' : 's') + '. The generator is a tree of ' + (n - 1) + ' XOR gates, ' + depth + ' level' + (depth === 1 ? '' : 's') + ' deep' + (odd ? ', with an inverter at the root for odd parity' : '') + '.', meta: { start: true, bit: pb.bit } });
      for (let L = 1; L <= depth; L++) {
        const gs = gen.circuit.parts.filter((p) => lv.get(p.id) === L);
        F.count('level');
        F.add({ items: genView({ env: true, hot: gs.map((p) => p.id) }), say: 'Level ' + L + ': ' + gs.map((p) => p.type + ' = ' + X.gateOut(gen.circuit, p, env)).join(', ') + '. Each XOR passes on whether its inputs hold an odd number of 1s.' });
      }
      F.add({ items: genView({ env: true }).concat(cellRow('w', word, 84, 'sent')), say: pb.say, mark: 'parity bit' });
      const recvView = (o) => {
        const items = cellRow('w', word, 84, 'sent').concat(cellRow('r', recv, 168, 'received', { from: 'w', bad: inp.flip ? inp.flip - 1 : -1 }));
        items.push({ key: 'ct', kind: 'text', x: CX, y: -8, text: 'parity checker', cls: 'title' }, X.schem('chk', chk, { x: CX, y: 6, env: o.env ? cenv : null }));
        return items;
      };
      F.add({ items: recvView({}), say: inp.flip ? 'In transit, bit ' + inp.flip + ' (' + cnames[inp.flip - 1] + ') flips: ' + word.join('') + ' arrives as ' + recv.join('') + '.' : 'The word ' + word.join('') + ' arrives unchanged.', meta: { err: B().parityCheck(recv.join(''), inp.kind).ok ? 0 : 1 } });
      const pc = B().parityCheck(recv.join(''), inp.kind);
      F.add({ items: recvView({ env: true }), mark: 'check', say: 'The checker XORs all ' + (n + 1) + ' bits: ' + pc.say + ' Its output E = ' + (pc.ok ? 0 : 1) + (pc.ok ? (inp.flip ? '' : '.') : ': an error is flagged. Parity cannot say which bit, and two flips would cancel out unnoticed.') });
      return { frames: F.list, def: { sections: [{ id: 'x', kind: 'math', title: 'XOR algebra', text: ['X ⊕ 0 = X', 'X ⊕ 1 = X′', 'X ⊕ X = 0', 'X ⊕ X′ = 1', 'X ⊕ Y = Y ⊕ X', '(X ⊕ Y) ⊕ Z = X ⊕ (Y ⊕ Z)', 'X ⊕ Y = XY′ + X′Y'].join('\n') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.start, pick: 'option', options: ['0', '1'], ask: 'Which parity bit will be sent?', answer: (fr) => String(fr[0].meta.bit), explain: 'The parity bit makes the total count of 1s even (or odd, for odd parity).' },
      { at: (f) => f.meta && f.meta.err !== undefined, pick: 'option', options: ['0 (no error seen)', '1 (error flagged)'], ask: 'What will the checker output?', answer: (fr, i) => (fr[i].meta.err ? '1 (error flagged)' : '0 (no error seen)'), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A ⊕ B ⊕ C is 1 when…', options: ['all are 1', 'an odd number of them are 1', 'exactly one is 1', 'none is 1'], answer: 1, why: 'XOR of many bits is the odd function.' },
      { q: 'Even parity on 1101: the parity bit is', options: ['0', '1'], answer: 1, why: 'Three 1s; one more makes four, an even count.' },
      { q: 'Two bits flip in transit. A parity check…', options: ['catches it', 'misses it', 'corrects it', 'flags the wrong bit'], answer: 1, why: 'Two flips keep the count of 1s even.' },
      { q: 'X ⊕ X′ =', options: ['0', '1', 'X', "X'"], answer: 1, why: 'X and X′ always differ.' },
      { q: 'How many two-input XOR gates does a parity tree over 8 bits need?', options: ['3', '4', '7', '8'], answer: 2, why: 'Each gate merges two signals into one: 8 → 1 takes 7 gates (3 levels).' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
