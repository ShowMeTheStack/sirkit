// Part 8, programmable logic: the PLA (programmable AND and OR planes, product terms shared between outputs, its
// programming table and fuse map), the PAL (a fixed OR plane, so no sharing), the look-up table at the heart of an
// FPGA, and a tiny FPGA fabric that a design is mapped, placed and routed onto, then run.
(function (S) {
  'use strict';
  const K = S.Kit, L = K.live, B = S.Bool, N = S.Netlist;
  const title = (key, x, y, text, cls, size) => ({ key, kind: 'text', x, y, text, cls: cls || 'strong', size: size || 15 });
  const note = (key, x, y, text, anchor) => ({ key, kind: 'text', x, y, text, anchor: anchor || 'start', cls: 'p4-note', size: 13 });
  const mlist = (text) => [...new Set(String(text).split(/[\s,]+/).filter(Boolean).map(Number))].filter((x) => Number.isInteger(x) && x >= 0 && x < 8).sort((a, b) => a - b);
  const listCheck = (label, need) => (v) => { const xs = String(v).split(/[\s,]+/).filter(Boolean); if (xs.some((x) => !/^[0-7]$/.test(x))) return label + ': minterms from 0 to 7, separated by commas'; if (need && !xs.length) return label + ': at least one minterm'; if (xs.length >= 8) return label + ': fewer than eight minterms (a constant 1 needs no array)'; return null; };
  const VARS = ['A', 'B', 'C'];
  /** prime marks as the narration writes them */
  const pr = (t) => String(t).replace(/'/g, '′');
  const litsOf = (str) => { const o = {}; [...str].forEach((ch, i) => { if (ch !== '-') o[VARS[i]] = +ch; }); return o; };
  const fnsOf = (inp) => { const f = { F1: mlist(inp.f1), F2: mlist(inp.f2) }; if (mlist(inp.f3).length) f.F3 = mlist(inp.f3); return f; };
  const envRows = (text) => String(text).split(/[\s,]+/).filter(Boolean).map(Number).filter((m) => m >= 0 && m < 8).slice(0, 4);
  const fnInputs = [
    { id: 'f1', kind: 'text', label: 'F1 = Σm(…)', def: '0, 1, 3, 7', check: listCheck('F1', true) },
    { id: 'f2', kind: 'text', label: 'F2 = Σm(…)', def: '3, 5, 6, 7', check: listCheck('F2', true) },
    { id: 'f3', kind: 'text', label: 'F3 = Σm(…) (optional)', def: '', check: listCheck('F3', false) },
    { id: 'tries', kind: 'text', label: 'Inputs to try (ABC as numbers)', def: '3, 5', check: (v) => (envRows(v).length ? null : 'Inputs to try: one to four numbers from 0 to 7') },
  ];
  const fnPresets = [
    { label: 'Two functions sharing BC', values: { f1: '0, 1, 3, 7', f2: '3, 5, 6, 7', f3: '', tries: '3, 5' } },
    { label: 'Three outputs, two shared terms', values: { f1: '1, 3, 5, 7', f2: '1, 5, 6', f3: '3, 6, 7', tries: '5, 6, 7' } },
    { label: 'A full adder (nothing shared)', values: { f1: '1, 2, 4, 7', f2: '3, 5, 6, 7', f3: '', tries: '6, 7' } },
  ];

  S.family({ id: 'p8-pld', part: 'memory', order: 30, title: 'Programmable logic', blurb: 'PLA and PAL arrays programmed by fuses, and the look-up tables, logic blocks and routing of an FPGA.' });

  /** the frames that run a programmed array on some inputs, checked by a gate circuit on the simulator */
  function tryRows(F, draw, fns, rowsOf, tries, circuit) {
    const sim = L.sim(circuit);
    for (const m of tries) {
      const env = L.envOf(VARS, m);
      L.apply(sim, env);
      const d = draw(env);
      const outs = Object.keys(fns).map((nm) => nm + ' = ' + sim.get(nm)).join(', ');
      const live = rowsOf().map((r, i) => (d.rowValue(i) === 1 ? r.label : null)).filter(Boolean);
      F.add({ items: d.items, say: 'ABC = ' + L.bits(m, 3) + ': the lit columns are the literals that are 1. ' + (live.length ? 'Product term' + (live.length > 1 ? 's ' : ' ') + live.join(', ') + (live.length > 1 ? ' are' : ' is') + ' 1 (every dot on the row sits on a lit column)' : 'No product term is 1') + ', so ' + outs + '. The same function built as gates and run on the simulator agrees.', scene: 'arr', meta: { m, outs } });
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // PLA
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'pla', family: 'p8-pld', order: 10, title: 'PLA: programmable AND and OR planes',
    blurb: 'A PLA builds only the product terms it needs (a programmable AND plane) and ORs them into any of its outputs (a programmable OR plane), so outputs can share terms. Its programming table lists each term\'s literals and the outputs it feeds; the fuse map is the same table drawn on the array.',
    inputs: fnInputs, presets: fnPresets,
    counters: [{ id: 'terms', label: 'product terms' }, { id: 'fuses', label: 'connections' }],
    run(inp) {
      const fns = fnsOf(inp), names = Object.keys(fns);
      const r = B.minimiseMulti(Object.fromEntries(names.map((nm) => [nm, B.fromMinterms(VARS, fns[nm])])));
      const terms = r.terms.map((u, i) => ({ label: 'T' + (i + 1), str: u.term.str, text: u.term.text, used: u.used, lits: litsOf(u.term.str) }));
      const F = new S.Frames(['terms', 'fuses']);
      // one equation per line, so that a long one never runs off the picture; the two ways side by side
      const eqs = (key, x, list) => list.map((t, i) => ({ key: key + i, kind: 'text', x, y: 30 + i * 24, text: t, cls: 'p4-mono', size: 14, mono: true }));
      const sepEq = names.map((nm) => nm + ' = ' + r.separate.perOutput[nm]), sepNote = r.separate.terms + ' different product terms';
      const x2 = Math.max(S.geom.textWidth('Minimised one at a time', 15, { bold: true }), S.geom.textWidth(sepNote, 13), ...sepEq.map((t) => S.geom.textWidth(t, 14, { mono: true }))) + 60;
      const yN = 30 + names.length * 24;
      F.add({ items: [title('h', 0, 0, 'Minimised one at a time'), ...eqs('s1', 0, sepEq), note('s1n', 0, yN, sepNote), title('h2', x2, 0, 'Minimised together'), ...eqs('s2', x2, names.map((nm) => nm + ' = ' + r.outputs[nm].text)), note('s2n', x2, yN, r.cost.terms + ' product terms' + (r.shared.length ? '; shared: ' + r.shared.map((u) => u.term.text + ' by ' + u.used.join(' and ')).join(', ') : '; none shared'))], say: 'A PLA pays for each distinct product term, so the outputs are minimised together, sharing terms where they can. Separately they need ' + r.separate.terms + ' terms; together ' + r.cost.terms + '.', scene: 'eq' });
      F.set('terms', terms.length);
      const tbl = K.table.draw({ prefix: 'pt', x: 0, y: 0, mono: true, minW: 36, ch: 30, size: 14, colHead: ['term', 'product'].concat(VARS, names), rows: terms.map((t) => [t.label, t.text].concat([...t.str], names.map((nm) => (t.used.includes(nm) ? '1' : '–')))), cls: (rr, cc) => (cc >= 5 && terms[rr].used.length > 1 && terms[rr].used.includes(names[cc - 5]) ? 'good' : '') });
      F.add({ items: tbl.items.concat(title('h', 0, -14, 'The programming table')), say: 'The programming table: one row per product term. Under the inputs, 1 means the true literal, 0 the complemented literal, – that the input is not used. Under the outputs, 1 means the term is ORed into that output. ' + (r.shared.length ? 'A term with two 1s on the right is shared.' : 'Here no term is shared.'), scene: 'tbl' });
      const rows = terms.map((t) => ({ label: t.label, lits: t.lits }));
      const orf = (ri, k) => terms[ri].used.includes(names[k]);
      const fuses = terms.reduce((s, t) => s + Object.keys(t.lits).length + t.used.length, 0);
      F.set('fuses', fuses);
      const draw = (env, hotRow) => K.pla.draw({ prefix: 'pla', x: 0, y: 0, inputs: VARS, rows, outputs: names, or: orf, env, hotRow, blown: true });
      terms.forEach((t, i) => F.add({ items: draw(null, i).items, say: t.label + ' = ' + pr(t.text) + ': dots on the ' + Object.keys(t.lits).map((v) => v + (t.lits[v] ? '' : '′')).join(', ') + ' columns of the AND plane, and on the ' + t.used.join(' and ') + ' column' + (t.used.length > 1 ? 's' : '') + ' of the OR plane. Every other crossing is left unconnected (its fuse blown, drawn faintly).', scene: 'arr', meta: { term: i } }));
      const circ = N.fromExpressions('pla', Object.fromEntries(names.map((nm) => [nm, r.outputs[nm].expr])), 'and-or', { inputs: VARS });
      for (const p of circ.parts) if (p.type === 'IN' && !p.net.y) circ.leaveOpen(p.pin('y'));
      tryRows(F, (env) => draw(env), fns, () => rows, envRows(inp.tries), circ);
      L.views(F.list);
      return { frames: F.list, def: { sections: [{ id: 'pt', kind: 'table', title: 'Programming table', colHead: ['term', 'A B C'].concat(names), rows: terms.map((t) => [t.label + ' = ' + t.text, [...t.str].join(' ')].concat(names.map((nm) => (t.used.includes(nm) ? '1' : '–')))) }] } };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.m !== undefined, pick: 'option', ask: 'For these inputs, what will the outputs be?', options: (fr, i) => { const ks = fr[i + 1].meta.outs.split(', ').map((x) => x.split(' = ')[0]); const opts = []; const rec = (j, acc) => { if (j === ks.length) { opts.push(acc.join(', ')); return; } for (const v of [0, 1]) rec(j + 1, acc.concat(ks[j] + ' = ' + v)); }; rec(0, []); return opts; }, answer: (fr, i) => fr[i + 1].meta.outs, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'In a PLA, which planes are programmable?', options: ['only the AND plane', 'only the OR plane', 'both', 'neither'], answer: 2, why: 'That is what sets a PLA apart from a PAL (fixed OR) and a ROM (fixed AND).' },
      { q: 'Why minimise a PLA\'s outputs together?', options: ['To share product terms, which the array charges for', 'To use fewer inputs', 'To make it faster', 'It does not matter'], answer: 0, why: 'A PLA has a fixed number of product-term rows.' },
      { q: 'In a programming table, a – under input B means…', options: ['B must be 0', 'B must be 1', 'the term does not use B', 'B is an output'], answer: 2, why: 'Neither B nor B′ is connected to that row.' },
      { q: 'A PLA with 3 inputs, 6 product terms and 2 outputs has how many fuse positions?', options: ['36 + 12 = 48', '6', '18', '3 × 6 × 2'], answer: 0, why: 'AND plane: 2 × 3 columns × 6 rows = 36; OR plane: 6 × 2 = 12.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // PAL
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'pal', family: 'p8-pld', order: 20, title: 'PAL: a fixed OR plane',
    blurb: 'A PAL fixes the OR plane: each output owns a few product-term rows and only the AND plane is programmed. It is simpler and faster than a PLA, but a term needed by two outputs must be built twice, and an output can use no more terms than its rows.',
    inputs: fnInputs.concat([{ id: 'per', kind: 'choice', label: 'Rows per output', def: '3', options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }] }]),
    presets: fnPresets.map((p) => ({ label: p.label, values: Object.assign({ per: '3' }, p.values) })).concat([{ label: 'Too few rows: 2 per output', values: { f1: '1, 2, 4, 7', f2: '3, 5, 6, 7', f3: '', tries: '6', per: '2' } }]),
    counters: [{ id: 'rows', label: 'rows programmed' }],
    run(inp) {
      const fns = fnsOf(inp), names = Object.keys(fns), per = +inp.per;
      const mins = names.map((nm) => B.minimise(B.fromMinterms(VARS, fns[nm])));
      const rows = [], F = new S.Frames(['rows']);
      const fits = mins.map((m) => m.cover.length <= per);
      names.forEach((nm, k) => {
        for (let j = 0; j < per; j++) {
          const t = mins[k].cover[j];
          rows.push(t ? { label: nm + '.' + (j + 1), lits: litsOf(t.str), text: t.text, out: k } : { label: nm + '.' + (j + 1), lits: {}, unused: true, out: k });
        }
      });
      const orf = (ri, k) => rows[ri].out === k;
      const draw = (env, upto, hotRow) => K.pla.draw({ prefix: 'pal', x: 0, y: 0, inputs: VARS, rows: rows.map((rw, i) => (i <= upto ? rw : { label: rw.label, lits: {}, unused: false, blank: true })), outputs: names, or: orf, env, hotRow, fixedOr: true, blown: true });
      F.add({ items: draw(null, -1).items, say: 'The OR plane is fixed at the factory: the outputs ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + ' each own ' + per + ' product rows (the blue dots). Only the AND plane is left to program.', scene: 'arr' });
      let done = 0;
      names.forEach((nm, k) => {
        const m = mins[k];
        done += Math.min(per, m.cover.length);
        F.set('rows', done);
        const shared = m.cover.filter((t) => names.some((o, k2) => k2 !== k && mins[k2].cover.some((u) => u.str === t.str)));
        F.add({ items: draw(null, (k + 1) * per - 1, k * per).items, say: nm + ' = ' + pr(m.text) + ': ' + (fits[k] ? m.cover.length + ' term' + (m.cover.length === 1 ? '' : 's') + ' in its ' + per + ' rows' + (m.cover.length < per ? '; the spare row keeps all its fuses (A·A′ = 0), so it adds nothing' : '') + '.' : 'it needs ' + m.cover.length + ' terms but has only ' + per + ' rows: it does not fit. A larger PAL, or feeding one output back as an input, would be needed.') + (shared.length ? ' ' + shared.map((t) => pr(t.text)).join(', ') + (shared.length > 1 ? ' are' : ' is') + ' also used by another output, and must be built again in that output\'s rows: no sharing in a PAL.' : ''), scene: 'arr', meta: { out: k, fits: fits[k] } });
      });
      if (fits.every(Boolean)) {
        const circ = N.fromExpressions('pal', Object.fromEntries(names.map((nm, k) => [nm, mins[k].expr])), 'and-or', { inputs: VARS });
        for (const p of circ.parts) if (p.type === 'IN' && !p.net.y) circ.leaveOpen(p.pin('y'));
        tryRows(F, (env) => draw(env, rows.length), fns, () => rows, envRows(inp.tries), circ);
      }
      const pla = B.minimiseMulti(Object.fromEntries(names.map((nm) => [nm, B.fromMinterms(VARS, fns[nm])])));
      const used = mins.reduce((s, m) => s + m.cover.length, 0);
      F.add({ items: draw(null, rows.length).items, say: (fits.every(Boolean) ? 'This PAL uses ' + used + ' of its ' + names.length * per + ' product rows' : 'These outputs need ' + used + ' product terms, but ' + names.filter((nm, k) => !fits[k]).join(' and ') + (fits.filter((x) => !x).length > 1 ? ' do' : ' does') + ' not fit in ' + per + ' rows') + '; a PLA, sharing terms, would need ' + pla.cost.terms + '. In return the PAL\'s fixed OR is faster and cheaper, which is why PALs (and the CPLDs built from many of them) were so widely used.', scene: 'arr', meta: { end: true } });
      L.views(F.list);
      return { frames: F.list, def: { sections: [{ id: 'eq', kind: 'math', title: 'Each output alone', text: names.map((nm, k) => nm + ' = ' + mins[k].text + (fits[k] ? '' : '   (too many terms)')).join('\n') }] } };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.out !== undefined, pick: 'option', ask: 'Will the next output fit into its rows?', options: ['Yes', 'No'], answer: (fr, i) => (fr[i + 1].meta.fits ? 'Yes' : 'No'), explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'In a PAL, the programmable plane is…', options: ['the AND plane', 'the OR plane', 'both', 'neither'], answer: 0, why: 'The OR connections are fixed.' },
      { q: 'Two outputs of a PAL both need the term AB. The PAL needs…', options: ['one AB row', 'two AB rows, one per output', 'no rows', 'an extra input'], answer: 1, why: 'Each output can only use its own rows.' },
      { q: 'An unused product row in a PAL is left with all its fuses intact because…', options: ['it then always gives 0 (it contains A·A′)', 'it gives 1', 'fuses cannot be blown', 'it is faster'], answer: 0, why: 'A 0 term adds nothing to the OR.' },
      { q: 'Compared with a PLA, a PAL is usually…', options: ['slower and larger', 'faster and simpler, but less flexible', 'identical', 'unable to make sums of products'], answer: 1, why: 'A fixed OR plane costs less and adds less delay.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The LUT
  // ---------------------------------------------------------------------------------------------------
  // a 3-input look-up table: eight configuration bits (constants here) through a tree of 2-to-1 multiplexers
  const lutCircuit = (bits) => L.muxTree({ bits, sel: ['C', 'B', 'A'], out: 'F', title: 'lut' });
  const exprCheck = (v) => { const r = B.tryParse(String(v)); if (!r.ok) return 'Function: ' + r.error.msg; const bad = B.vars(r.expr).filter((x) => !VARS.includes(x)); return bad.length ? 'Function: use only A, B and C' : null; };
  S.topic({
    id: 'fpga-lut', family: 'p8-pld', order: 30, title: 'The look-up table (LUT)',
    blurb: 'An FPGA logic cell does not build gates for a function: it stores the function\'s truth table in a few memory bits and uses the inputs as an address, through a tree of multiplexers. Any function of three inputs fits a 3-input LUT; changing the function means only changing the bits.',
    inputs: [
      { id: 'fn', kind: 'text', label: 'Function of A, B, C', def: "AB + A'C", check: exprCheck },
      { id: 'tries', kind: 'text', label: 'Inputs to try (ABC as numbers)', def: '3, 6, 1', check: (v) => (envRows(v).length ? null : 'Inputs to try: one to four numbers from 0 to 7') },
    ],
    presets: [
      { label: "AB + A′C (a multiplexer)", values: { fn: "AB + A'C", tries: '3, 6, 1' } },
      { label: 'A ⊕ B ⊕ C (odd parity)', values: { fn: 'A ^ B ^ C', tries: '7, 5' } },
      { label: 'Majority of three', values: { fn: 'AB + AC + BC', tries: '6, 4' } },
    ],
    counters: [{ id: 'bits', label: 'configuration bits' }],
    run(inp) {
      const e = B.parse(inp.fn), f = B.fromExpr(e, VARS);
      const bits = [...Array(8).keys()].map((m) => (f.ones.has(m) ? 1 : 0));
      const F = new S.Frames(['bits']);
      const tbl = K.table.draw({ prefix: 'tt', x: 0, y: 0, mono: true, minW: 34, ch: 28, size: 14, colHead: VARS.concat(['F']), rows: bits.map((b, m) => [...L.bits(m, 3)].concat([String(b)])), cls: (rr, cc) => (cc === 3 ? 'act' : '') });
      F.add({ items: tbl.items.concat(title('h', 0, -14, 'F = ' + B.toString(e))), say: 'The truth table of F = ' + pr(B.toString(e)) + '. Its output column, read top to bottom, is ' + bits.join('') + ': that is all a LUT needs to know.', scene: 't' });
      F.set('bits', 8);
      const c = lutCircuit(bits);
      const path = (m) => { const a = (m >> 2) & 1, b = (m >> 1) & 1; return ['mux' + (1 + (m >> 1)), 'mux' + (5 + (m >> 2)), 'mux7'].concat(a + b < 0 ? [] : []); };
      const w = L.walk({ c, ins: VARS, outs: ['F'], rows: [0].concat(envRows(inp.tries)), detail: 1, table: false, waves: VARS.concat(['F']),
        settledHot: (env) => path(env.A * 4 + env.B * 2 + env.C),
        sayRow: (env, o) => { const m = env.A * 4 + env.B * 2 + env.C; return 'ABC = ' + L.bits(m, 3) + ' is an address: C picks within each pair of bits, B between pairs, A at the root, and bit ' + m + ' of the configuration (' + bits[m] + ') comes out. F = ' + o.F + '.'; } });
      F.add(Object.assign({}, w.frames[0], { say: 'The LUT: the eight bits ' + bits.join(' ') + ' sit in configuration memory (drawn as the constants on the left) and a tree of seven 2-to-1 multiplexers picks one of them. Loading different bits makes a different function from the same hardware.', scene: 'w' }));
      w.frames.slice(1).forEach((fr) => F.add(Object.assign(fr, { scene: 'w' })));
      L.views(F.list);
      return { frames: F.list, def: { sections: [{ id: 'eq', kind: 'math', title: 'A k-input LUT', text: ['2^k configuration bits', 'the inputs are the address', 'any function of k inputs', 'delay: the same for every function', 'here: ' + bits.join('') + ' (bit 0 first)'].join('\n') }] } };
    },
    predict: [{ at: (f, i, fr) => i > 0 && fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.first && fr[i + 1].meta.row !== undefined, pick: 'option', ask: 'Which configuration bit will reach the output?', options: ['bit 0', 'bit 1', 'bit 2', 'bit 3', 'bit 4', 'bit 5', 'bit 6', 'bit 7'], answer: (fr, i) => 'bit ' + fr[i + 1].meta.row, explain: (fr, i) => { const s = fr.slice(i + 1).find((f) => f.meta && f.meta.settled); return s ? s.say : ''; } }],
    quiz: [
      { q: 'How many configuration bits does a 4-input LUT hold?', options: ['4', '8', '16', '256'], answer: 2, why: 'One per row of the truth table: 2^4.' },
      { q: 'How many different functions can a 3-input LUT make?', options: ['8', '16', '256', '3'], answer: 2, why: '2^8: any pattern of the eight bits.' },
      { q: 'A LUT implementing A ⊕ B ⊕ C is slower than one implementing AB.', options: ['true', 'false'], answer: 1, why: 'Every function goes through the same multiplexer tree.' },
      { q: 'In the LUT, the inputs act as…', options: ['data', 'an address into the configuration bits', 'a clock', 'outputs'], answer: 1, why: 'A LUT is a tiny memory read by its inputs.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // A tiny FPGA fabric
  // ---------------------------------------------------------------------------------------------------
  const DESIGNS = {
    fa: { label: 'A full adder', ins: ['A', 'B', 'C'], outs: ['S', 'K'], luts: [{ name: 'S', ins: ['A', 'B', 'C'], expr: 'A ^ B ^ C', at: [0, 0] }, { name: 'K', ins: ['A', 'B', 'C'], expr: 'AB + AC + BC', at: [0, 1] }], text: 'sum S = A ⊕ B ⊕ C, carry K = AB + AC + BC' },
    chain: { label: 'Five inputs, three LUTs', ins: ['A', 'B', 'C', 'D', 'E'], outs: ['F'], luts: [{ name: 'X', ins: ['A', 'B'], expr: 'A ^ B', at: [0, 0] }, { name: 'Y', ins: ['X', 'C', 'D'], expr: 'X(C + D)', at: [1, 0] }, { name: 'F', ins: ['Y', 'E'], expr: 'Y + E', at: [2, 1] }], text: 'F = (A ⊕ B)(C + D) + E' },
    eq: { label: '2-bit equality', ins: ['A1', 'B1', 'A0', 'B0'], outs: ['E'], luts: [{ name: 'X', ins: ['A1', 'B1'], expr: "(A1 ^ B1)'", at: [0, 0] }, { name: 'E', ins: ['X', 'A0', 'B0'], expr: "X(A0 ^ B0)'", at: [1, 1] }], text: 'E = (A1 ⊕ B1)′(A0 ⊕ B0)′' },
  };
  S.topic({
    id: 'fpga-fabric', family: 'p8-pld', order: 40, title: 'A tiny FPGA: map, place, route, run',
    blurb: 'An FPGA is a grid of logic blocks (each a LUT) in a sea of wiring channels, joined by programmable switches. A design is cut into LUT-sized pieces (mapping), each piece given a block (placement), and the switches set to join them (routing). Then it runs.',
    inputs: [
      { id: 'design', kind: 'choice', label: 'Design', def: 'chain', options: Object.entries(DESIGNS).map(([k, v]) => ({ value: k, label: v.label })) },
      { id: 'tries', kind: 'text', label: 'Inputs to try (as binary, in input order)', def: '10100, 11001', check: (v, inp) => { const n = DESIGNS[inp.design].ins.length; const xs = String(v).split(/[\s,]+/).filter(Boolean); return !xs.length || xs.length > 3 || xs.some((x) => !new RegExp('^[01]{' + n + '}$').test(x)) ? 'Inputs: one to three patterns of ' + n + ' bits' : null; } },
    ],
    presets: [
      { label: 'Five inputs, three LUTs', values: { design: 'chain', tries: '10100, 11001' } },
      { label: 'A full adder', values: { design: 'fa', tries: '110, 111' } },
      { label: '2-bit equality', values: { design: 'eq', tries: '1111, 1011' } },
    ],
    counters: [{ id: 'luts', label: 'LUTs used' }, { id: 'sw', label: 'switches set' }],
    run(inp) {
      const d = DESIGNS[inp.design];
      const COLS = 3, ROWS = 2, CW = 120, CH = 96, GAPX = 70, GAPY = 70, X0 = 90, Y0 = 50;
      const vx = (i) => X0 + i * (CW + GAPX) - GAPX / 2;          // vertical channel i (left of column i)
      const hy = (j) => Y0 + j * (CH + GAPY) - GAPY / 2;          // horizontal channel j (above row j)
      const clb = (c, r) => ({ x: X0 + c * (CW + GAPX), y: Y0 + r * (CH + GAPY), w: CW, h: CH });
      const right = vx(COLS), bottom = hy(ROWS);
      // input pads down the left, output pads down the right
      const padY = (k, n) => hy(0) + ((bottom - hy(0)) * (k + 1)) / (n + 1);
      const inPad = Object.fromEntries(d.ins.map((nm, k) => [nm, { x: -14, y: padY(k, d.ins.length), side: 'left' }]));
      const outPad = Object.fromEntries(d.outs.map((nm, k) => [nm, { x: right + 40, y: padY(k, d.outs.length), side: 'right' }]));
      // LUT pins: inputs on the left edge, the output on the right
      const lutAt = Object.fromEntries(d.luts.map((l) => [l.name, l]));
      const pinIn = (l, k) => { const b = clb(l.at[0], l.at[1]); return { x: b.x, y: b.y + (b.h * (k + 1)) / 4, chan: l.at[0] }; };
      const pinOut = (l) => { const b = clb(l.at[0], l.at[1]); return { x: b.x + b.w, y: b.y + b.h / 2, chan: l.at[0] + 1 }; };
      // the nets: each signal from its source to every place it is used
      const nets = [];
      const srcOf = (nm) => (inPad[nm] ? { x: inPad[nm].x + 46, y: inPad[nm].y, chan: 0, pad: nm } : Object.assign(pinOut(lutAt[nm]), { lut: nm }));
      const sigs = d.ins.concat(d.luts.map((l) => l.name));
      sigs.forEach((nm) => {
        const sinks = [];
        d.luts.forEach((l) => l.ins.forEach((x, k) => { if (x === nm) sinks.push(Object.assign(pinIn(l, k), { lut: l.name })); }));
        if (d.outs.includes(nm)) sinks.push({ x: outPad[nm].x, y: outPad[nm].y, chan: COLS, pad: nm });
        if (sinks.length) nets.push({ name: nm, src: srcOf(nm), sinks });
      });
      // route each net: along the source's vertical channel to a horizontal channel, across, and down to the sink
      const switches = new Set();
      nets.forEach((net, k) => {
        const off = ((k % 4) - 1.5) * 6;
        net.segs = [];
        const s = net.src;
        const sx = vx(s.chan) + off;
        net.segs.push([s.x, s.y, sx, s.y]);
        for (const t of net.sinks) {
          const tx = vx(t.chan) + off;
          if (t.chan === s.chan) { net.segs.push([sx, s.y, sx, t.y], [sx, t.y, t.x, t.y]); continue; }
          // the horizontal channel nearest both ends
          let bestJ = 0, best = Infinity;
          for (let j = 0; j <= ROWS; j++) { const cost = Math.abs(hy(j) - s.y) + Math.abs(hy(j) - t.y); if (cost < best) { best = cost; bestJ = j; } }
          const y = hy(bestJ) + off;
          net.segs.push([sx, s.y, sx, y], [sx, y, tx, y], [tx, y, tx, t.y], [tx, t.y, t.x, t.y]);
          switches.add(s.chan + ',' + bestJ); switches.add(t.chan + ',' + bestJ);
        }
      });
      // the gate-level version of the mapped design, for the values
      const circ = new N.Circuit('fpga');
      const pins = {};
      d.ins.forEach((nm) => { pins[nm] = circ.input(nm).pin('y'); });
      for (const l of d.luts) {
        const sub = N.fromExpressions('lut' + l.name, { [l.name]: l.expr }, 'multi', { inputs: l.ins });
        // build each LUT's function inline from its expression
        const map = {};
        for (const p of sub.parts) if (p.type === 'IN') map[p.id] = pins[p.params.name];
        const made = {};
        const order = sub.parts.filter((p) => N.GATES.has(p.type) || p.type === 'CONST');
        const outOf = (net) => { const drv = net.pins.find((q) => q.part.pins.find((x) => x.name === q.pin).dir === 'out'); return drv.part.type === 'IN' ? map[drv.part.id] : made[drv.part.id]; };
        let guard = 0;
        while (Object.keys(made).length < order.length && guard++ < 50) for (const g of order) {
          if (made[g.id]) continue;
          if (g.type === 'CONST') { made[g.id] = circ.constant(g.params.value).pin('y'); continue; }
          const ins = g.pins.filter((q) => q.dir === 'in').map((q) => outOf(g.net[q.name]));
          if (ins.some((x) => !x)) continue;
          made[g.id] = L.G(circ, g.type, ...ins);
        }
        const o = sub.parts.find((p) => p.type === 'OUT');
        pins[l.name] = outOf(o.net.a);
        if (!d.outs.includes(l.name)) circ.name(pins[l.name], l.name, false);
      }
      d.outs.forEach((nm) => circ.connect(pins[nm], circ.output(nm)));
      const sim = L.sim(circ, { tech: 'FPGA' });
      const F = new S.Frames(['luts', 'sw']);
      const scene = (o) => {
        const items = [];
        for (let j = 0; j <= ROWS; j++) items.push({ key: 'h' + j, kind: 'line', x1: vx(0) - 14, y1: hy(j), x2: right + 14, y2: hy(j), cls: 'p8-chan', audit: 'edge-x' });
        for (let i = 0; i <= COLS; i++) items.push({ key: 'v' + i, kind: 'line', x1: vx(i), y1: hy(0) - 14, x2: vx(i), y2: bottom + 14, cls: 'p8-chan', audit: 'edge-x' });
        for (let i = 0; i <= COLS; i++) for (let j = 0; j <= ROWS; j++) items.push({ key: 'sw' + i + ',' + j, kind: 'cell', x: vx(i) - 13, y: hy(j) - 13, w: 26, h: 26, text: '', cls: 'p8-sw' + (o.routed && switches.has(i + ',' + j) ? ' used' : ''), audit: 'overlap-ok' });
        for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
          const b = clb(c, r), l = d.luts.find((x) => x.at[0] === c && x.at[1] === r && o.placed);
          items.push({ key: 'clb' + c + ',' + r, kind: 'region', x: b.x, y: b.y, w: b.w, h: b.h, rx: 8, text: '', cls: 'p8-clb' + (l ? ' used' : ''), audit: 'group' });
          items.push({ key: 'cl' + c + ',' + r, kind: 'text', x: b.x + b.w / 2, y: b.y + 22, text: l ? 'LUT ' + l.name : 'LUT', anchor: 'middle', cls: l ? 'strong' : 'p4-note', size: 13 });
          if (l) items.push({ key: 'cf' + c + ',' + r, kind: 'text', x: b.x + b.w / 2, y: b.y + 46, text: B.toString(B.parse(l.expr)), anchor: 'middle', cls: 'p4-mono', size: 11 });
          if (l && o.env) items.push({ key: 'cv' + c + ',' + r, kind: 'text', x: b.x + b.w / 2, y: b.y + 72, text: l.name + ' = ' + sim.get(l.name), anchor: 'middle', cls: 'p4-mono good', size: 12 });
        }
        d.ins.forEach((nm) => { const p = inPad[nm]; items.push({ key: 'ip' + nm, kind: 'cell', x: p.x, y: p.y - 13, w: 46, h: 26, text: nm + (o.env ? '=' + o.env[nm] : ''), cls: 'p8-pad' + (o.routed ? ' used' : ''), size: 11 }); });
        d.outs.forEach((nm) => { const p = outPad[nm]; items.push({ key: 'op' + nm, kind: 'cell', x: p.x, y: p.y - 13, w: 52, h: 26, text: nm + (o.env ? '=' + sim.get(nm) : ''), cls: 'p8-pad' + (o.routed ? ' used' : ''), size: 11 }); });
        if (o.routed) nets.slice(0, o.routed).forEach((net, k) => {
          const v = o.env ? sim.get(net.name) : null;
          net.segs.forEach((sg, q) => { if (Math.hypot(sg[2] - sg[0], sg[3] - sg[1]) > 0.5) items.push({ key: 'rt' + k + ':' + q, kind: 'line', x1: sg[0], y1: sg[1], x2: sg[2], y2: sg[3], cls: 'p8-route' + (v === 1 ? ' v1' : v === 0 ? ' v0' : ''), audit: 'edge-x', layer: 'top' }); });
        });
        if (o.ttl) items.push(title('ttl', -14, -26, o.ttl));
        return items;
      };
      F.add({ items: scene({ ttl: 'The fabric: 6 logic blocks, channels and switch boxes' }), say: 'The fabric: a 3 × 2 grid of logic blocks, each a 3-input LUT, with wiring channels between them and a switch box wherever two channels cross. Input pads on the left, output pads on the right. Nothing is connected until it is configured.', scene: 'f' });
      F.add({ items: scene({ ttl: 'Mapping: ' + d.text }), say: 'Mapping: the design ' + d.text + ' is cut into pieces of at most three inputs: ' + d.luts.map((l) => l.name + ' = ' + pr(B.toString(B.parse(l.expr))) + ' (' + l.ins.length + ' inputs)').join('; ') + '.', scene: 'f', meta: { luts: d.luts.length } });
      F.set('luts', d.luts.length);
      F.add({ items: scene({ placed: true, ttl: 'Placement' }), say: 'Placement: each piece gets a logic block, ' + d.luts.map((l) => 'LUT ' + l.name + ' at column ' + (l.at[0] + 1) + ', row ' + (l.at[1] + 1)).join('; ') + '. Each LUT\'s 8 configuration bits are loaded with its truth table.', scene: 'f' });
      const swUsed = new Set();
      nets.forEach((net, k) => {
        for (const s2 of [...switches]) swUsed.add(s2);
        F.set('sw', switches.size);
        F.add({ items: scene({ placed: true, routed: k + 1, ttl: 'Routing ' + net.name }), say: 'Routing ' + net.name + ': from ' + (net.src.pad ? 'its input pad' : 'the output of LUT ' + net.name) + ' to ' + net.sinks.map((t) => (t.pad ? 'the output pad' : 'an input of LUT ' + t.lut)).join(' and ') + ', along the channels, turning at switch boxes that are set to connect.', scene: 'f', meta: { net: k } });
      });
      const bitsCount = d.luts.length * 8;
      F.add({ items: scene({ placed: true, routed: nets.length, ttl: 'Configured' }), say: 'Configured: ' + d.luts.length + ' LUTs × 8 bits = ' + bitsCount + ' LUT bits, plus the switch settings, make the bitstream that is loaded into the FPGA when it powers up.', scene: 'f' });
      String(inp.tries).split(/[\s,]+/).filter(Boolean).forEach((pat) => {
        const env = Object.fromEntries(d.ins.map((nm, i) => [nm, +pat[i]]));
        L.apply(sim, env);
        F.add({ items: scene({ placed: true, routed: nets.length, env, ttl: 'Running: ' + d.ins.map((nm) => nm + ' = ' + env[nm]).join(', ') }), say: 'Run it: ' + d.ins.map((nm) => nm + ' = ' + env[nm]).join(', ') + '. Each LUT looks up its output: ' + d.luts.map((l) => l.name + ' = ' + sim.get(l.name)).join(', ') + '. Routes carrying 1 are lit. Out: ' + d.outs.map((nm) => nm + ' = ' + sim.get(nm)).join(', ') + '.', scene: 'f', meta: { run: true, out: d.outs.map((nm) => nm + ' = ' + sim.get(nm)).join(', ') } });
      });
      L.views(F.list);
      return { frames: F.list, def: { sections: [{ id: 'eq', kind: 'math', title: 'The flow', text: ['map: pieces of at most 3 inputs', ...d.luts.map((l) => '  ' + l.name + ' = ' + B.toString(B.parse(l.expr))), 'place: a logic block for each', 'route: channels and switch boxes', 'configure: LUT bits + switch bits'].join('\n') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.luts, pick: 'option', ask: 'How many logic blocks will this design need?', options: ['1', '2', '3', '4'], answer: (fr, i) => String(fr[i].meta.luts), explain: (fr, i) => fr[i].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.run, pick: 'option', ask: 'What will the output be?', options: (fr, i, inp) => { const outs = DESIGNS[inp.design].outs; const opts = []; const rec = (j, acc) => { if (j === outs.length) { opts.push(acc.join(', ')); return; } for (const v of [0, 1]) rec(j + 1, acc.concat(outs[j] + ' = ' + v)); }; rec(0, []); return opts; }, answer: (fr, i) => fr[i + 1].meta.out, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'Mapping a design onto an FPGA means…', options: ['cutting it into pieces that each fit a LUT', 'drawing its schematic', 'choosing the clock', 'testing it'], answer: 0, why: 'Each piece must have no more inputs than a LUT.' },
      { q: 'A switch box lets…', options: ['a LUT change its function', 'wires in crossing channels be joined', 'the clock be divided', 'pads be inputs or outputs'], answer: 1, why: 'Routing turns corners only where switches are set.' },
      { q: 'A function of 5 inputs needs, with 3-input LUTs, at least…', options: ['one LUT', 'two LUTs', 'five LUTs', '32 LUTs'], answer: 1, why: 'One LUT has only 3 inputs, so the function must be split.' },
      { q: 'What is in an FPGA\'s bitstream?', options: ['the LUT contents and the switch settings', 'only the inputs', 'a program for a processor', 'the netlist as text'], answer: 0, why: 'They define what each block computes and how blocks connect.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
