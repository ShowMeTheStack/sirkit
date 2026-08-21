// Part 2, expressions and their forms: an expression's tree beside its circuit (precedence decides the shape),
// truth tables and the sixteen functions of two variables, minterms and maxterms, Σm and ΠM lists, expanding a
// non-standard form into the canonical one, the complement and the dual of a function, and the classifiers.
(function (S) {
  'use strict';
  const K = S.Kit, X = K.expr, Geo = S.geom;
  const B = () => S.Bool;
  const vName = (vs, env) => vs.map((v) => v + ' = ' + env[v]).join(', ');
  const mOf = (env, vars) => vars.reduce((a, v, i) => a | (env[v] << (vars.length - 1 - i)), 0);

  S.family({ id: 'p2-forms', part: 'algebra', order: 20, title: 'Expressions, tables and canonical forms', blurb: 'An expression has a shape (its tree, its circuit) and a meaning (its truth table). Canonical forms write the meaning down directly: one minterm per 1, or one maxterm per 0.' });

  // ---------------------------------------------------------------------------------------------------
  // the expression tree beside its circuit
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'expr-tree', family: 'p2-forms', order: 10, title: 'Expression tree and circuit',
    blurb: 'NOT binds tightest, then AND, then XOR, then OR. Precedence decides which operator is applied last, and so the shape of the tree, and the tree is the circuit: one gate per operator. Move a bracket and both change.',
    inputs: [
      { id: 'f', kind: 'expr', label: 'Expression', def: "A + B'C", check: X.check('Expression', 4) },
      { id: 'row', kind: 'number', label: 'Evaluate at row', def: 5, min: 0, max: 15 },
    ],
    check: (inp) => { const n = B().vars(B().parse(inp.f)).length; return inp.row >= 1 << n ? 'Evaluate at row: at most ' + ((1 << n) - 1) + ' for ' + n + ' variables' : null; },
    presets: [
      { label: "A + B'C (AND first)", values: { f: "A + B'C", row: 5 } },
      { label: "(A + B')C (bracket moved)", values: { f: "(A + B')C", row: 5 } },
      { label: "A'B versus (AB)'", values: { f: "(AB)' + A'B", row: 3 } },
      { label: 'XOR between AND and OR: A + B ⊕ CD', values: { f: 'A + B ^ CD', row: 6 } },
      { label: "Deeper: (A + BC)'(C + D)", values: { f: "(A + BC)'(C + D)", row: 9 } },
    ],
    counters: [{ id: 'gates', label: 'operators placed' }],
    run(inp) {
      const e = B().parse(inp.f), vars = B().vars(e);
      const env = X.env(inp.row, vars);
      const ops = [];
      (function post(x, p) { (x.op === 'not' ? [x.a] : x.args || []).forEach((k, i) => post(k, p.concat(i))); if (x.op !== 'var' && x.op !== 'const' && !(x.op === 'not' && (x.a.op === 'var'))) ops.push({ path: X.pstr(p), node: x }); })(e, []);
      const all = []; (function w(x, p) { all.push({ id: X.pstr(p), node: x }); (x.op === 'not' ? [x.a] : x.args || []).forEach((k, i) => w(k, p.concat(i))); })(e, []);
      const opIds = new Set(all.filter((a) => a.node.op !== 'var' && a.node.op !== 'const').map((a) => a.id));
      const probe = X.tree(e, { prefix: 'tr', grow: false, nodeW: 86 });
      const tx = -probe.box.x, ty = 90;
      const made = X.circuit(e, { inputs: vars });
      const cX = probe.box.w + 90;
      const F = new S.Frames(['gates']);
      const shown = new Set();
      const scene = (o) => {
        o = o || {};
        const items = [];
        const ch = X.chips(e, { prefix: 'e', x: 0, y: 0, size: 24, box: o.box ? { [o.box]: 'hot' } : {} });
        items.push(...ch.items);
        const hide = new Set([...opIds].filter((id) => !shown.has(id)));
        const tr = X.tree(e, { prefix: 'tr', x: tx, y: ty + 21, hide, nodeW: 86, inline: true, hot: o.box ? [o.box] : [], grow: false, env: o.env, valued: o.env ? new Set(all.map((a) => a.id)) : null });
        items.push({ key: 'tt', kind: 'text', x: 0, y: ty - 18, text: 'tree', cls: 'title' }, ...tr.items);
        if (o.circuit) items.push({ key: 'ct', kind: 'text', x: cX, y: ty - 18, text: 'circuit', cls: 'title' }, X.schem('c', made, { x: cX, y: ty, env: o.env }));
        if (o.env) items.push({ key: 'res', kind: 'text', x: cX, y: ty + made.res.bounds.h + 30, text: 'F = ' + B().evaluate(e, o.env) + ' at ' + vName(vars, o.env), cls: 'strong', size: 17 });
        return items;
      };
      const PN = { not: 'NOT', and: 'AND', xor: 'XOR', or: 'OR' };
      F.add({ items: scene(), say: 'F = ' + X.text(e) + '. Precedence, tightest first: NOT, AND, XOR, OR; brackets override it. The operator applied last is the root of the tree and the gate that drives the output.', meta: { start: true, root: PN[e.op] || 'none' } });
      for (const o of ops) {
        shown.add(o.path); F.count('gates');
        if (o.node.op === 'not') for (const id of opIds) if (id === o.path + '.0' || (id.startsWith(o.path + '.') && false)) shown.add(id);
        const its = scene({ box: o.path });
        F.add({ items: its, narrowView: X.focus(its, ['e:', 'tr:', 'tt']), say: PN[o.node.op] + ' over ' + (o.node.op === 'not' ? X.text(o.node.a) : o.node.args.map(X.text).join(', ')) + ': the subterm ' + X.text(o.node) + '.' + (o.path === 'r' ? ' This is the last operator, so it is the root.' : '') });
      }
      for (const id of opIds) shown.add(id);
      F.add({ items: scene({ circuit: true }), mark: 'circuit', say: 'The circuit has the same shape: each operator node is a gate whose inputs are its children. (A NOT right over a variable is drawn as a complemented input, and a NOT over an AND or OR folds into a NAND or NOR.)' });
      F.add({ items: scene({ circuit: true, env }), say: 'At row ' + inp.row + ' (' + vName(vars, env) + '), values flow up the tree and through the gates: F = ' + X.subst(e, env) + ' = ' + B().evaluate(e, env) + '.', meta: { val: B().evaluate(e, env) } });
      return { frames: F.list, def: { sections: [{ id: 'p', kind: 'math', title: 'Precedence', text: "1. ( ) brackets\n2. ′ NOT\n3. · AND\n4. ⊕ XOR\n5. + OR" }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.start, pick: 'option', options: ['NOT', 'AND', 'XOR', 'OR'], ask: 'Which operator will be the root of the tree?', answer: (fr) => fr[0].meta.root, explain: 'The root is the operator applied last: the one with the weakest precedence outside every bracket.' },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.val !== undefined, pick: 'option', options: ['0', '1'], ask: 'What will F be at this row?', answer: (fr, i) => String(fr[i + 1].meta.val), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: "In A + B'C, which operator is applied last?", options: ['NOT', 'AND', 'OR'], answer: 2, why: 'OR has the weakest precedence.' },
      { q: "(A + B)C and A + BC differ at A = 1, B = 0, C = 0. Their values there?", options: ['0 and 1', '1 and 0', 'both 1', 'both 0'], answer: 0, why: '(1 + 0)·0 = 0; 1 + 0·0 = 1.' },
      { q: 'How many gates does the tree of (AB)′ + C need (complemented inputs free)?', options: ['1', '2', '3', '4'], answer: 1, why: 'A NAND for (AB)′ and an OR.' },
      { q: "Is A'B the same as (AB)'?", options: ['Yes', 'No'], answer: 1, why: "At A = 0, B = 0: A′B = 0 but (AB)′ = 1." },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // the sixteen functions of two variables
  // ---------------------------------------------------------------------------------------------------
  const GROUPS = [
    ['the constants', [0, 15], 'They ignore both inputs.'],
    ['AND and NAND', [1, 14], 'AND is 1 only on the last row; NAND is its complement.'],
    ['OR and NOR', [7, 8], 'OR is 0 only on the first row; NOR is its complement.'],
    ['XOR and XNOR', [6, 9], 'XOR is 1 where the inputs differ; XNOR where they are equal.'],
    ['transfers and complements', [3, 5, 12, 10], 'They depend on one input only.'],
    ['inhibitions and implications', [2, 4, 11, 13], 'One input blocks the other; the implications are their complements.'],
  ];
  S.topic({
    id: 'sixteen-functions', family: 'p2-forms', order: 20, title: 'The sixteen functions of two variables',
    blurb: 'Two inputs give four rows, and each row can output 0 or 1: 2⁴ = 16 output columns, so exactly sixteen functions. Meet them in families, then find the one with your column.',
    inputs: [{ id: 'col', kind: 'string', label: 'Output column (AB = 00, 01, 10, 11)', def: '0110', alphabet: '01', min: 4, max: 4 }],
    presets: [{ label: 'XOR: 0110', values: { col: '0110' } }, { label: 'AND: 0001', values: { col: '0001' } }, { label: 'NAND: 1110', values: { col: '1110' } }, { label: 'Implication: 1101', values: { col: '1101' } }, { label: 'Constant 0: 0000', values: { col: '0000' } }],
    counters: [{ id: 'met', label: 'functions met' }],
    run(inp) {
      const TV = B().twoVariable;
      const F = new S.Frames(['met']);
      const CW = 170, CH = 96, GX = 300;
      const target = parseInt(inp.col, 2);
      const met = new Set();
      const scene = (o) => {
        o = o || {};
        const items = [];
        const col = o.col === undefined ? null : TV[o.col];
        items.push(...X.table({ vars: ['A', 'B'], prefix: 'tt', x: 0, y: 40, rowH: 40, size: 18, cols: [{ name: col ? 'F' + col.index : 'F', f: (env) => (col ? col.column[env.A * 2 + env.B] : '') }] }).items);
        if (col) items.push({ key: 'tname', kind: 'text', x: 0, y: 260, text: col.name, cls: 'strong', size: 16 }, { key: 'texpr', kind: 'text', x: 0, y: 286, text: 'F = ' + col.expr.replace(/'/g, '′'), cls: 'mono', size: 16 });
        TV.forEach((f, i) => {
          const r = Math.floor(i / 4), c = i % 4;
          const on = (o.lit || []).includes(i);
          items.push({ key: 'card' + i, kind: 'cell', x: GX + c * (CW + 10), y: r * (CH + 10), w: CW, h: CH, lines: ['F' + i + '   ' + f.column, f.name.replace(/ \(.*\)$/, ''), f.expr.replace(/'/g, '′')], cls: 'fcard' + (on ? (o.good ? ' good' : ' hot') : met.has(i) ? '' : ' dim'), size: 13, pick: true });
        });
        return items;
      };
      F.add({ items: scene(), say: 'With inputs A and B the table has 4 rows. A function is any choice of the 4 output bits, read top to bottom as a column: 2 × 2 × 2 × 2 = 16 columns, numbered F0 (0000) to F15 (1111).', meta: { start: true } });
      for (const [name, ids, why] of GROUPS) {
        ids.forEach((i) => met.add(i)); F.count('met', ids.length);
        F.add({ items: scene({ lit: ids, col: ids[0] }), say: 'The ' + name + ': ' + ids.map((i) => 'F' + i + ' = ' + TV[i].expr.replace(/'/g, '′') + ' (' + TV[i].column + ')').join(', ') + '. ' + why });
      }
      F.add({ items: scene({ lit: [target], col: target, good: true }), mark: 'yours', say: 'Your column ' + inp.col + ' is F' + target + ': ' + TV[target].name + ', F = ' + TV[target].expr.replace(/'/g, '′') + '.', meta: { name: TV[target].name } });
      const counts = [1, 2, 3, 4, 5].map((n) => 'n = ' + n + ': 2^' + (1 << n) + ' = ' + B().countFunctions(n).count.toString());
      F.add({ items: scene({ lit: [target], col: target, good: true }), say: 'In general n inputs give 2ⁿ rows and 2^(2ⁿ) functions. ' + counts.join('; ') + '. The count explodes, which is why we name a function by its formula or its minterm list rather than by trying them all.' });
      return { frames: F.list, def: { sections: [{ id: 'c', kind: 'math', title: 'How many functions?', text: counts.join('\n') }] } };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].mark === 'yours', pick: 'item', ask: 'Click the card of your column.', answer: (fr, i, inp) => 'card' + parseInt(inp.col, 2), explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'How many Boolean functions of three variables are there?', options: ['8', '16', '64', '256'], answer: 3, why: '2³ = 8 rows, so 2⁸ = 256 columns.' },
      { q: 'Which function has the column 1001 (AB = 00, 01, 10, 11)?', options: ['XOR', 'XNOR', 'NOR', 'NAND'], answer: 1, why: '1 where the inputs are equal.' },
      { q: "A' + B is called…", options: ['inhibition', 'implication (A implies B)', 'NAND', 'transfer'], answer: 1, why: 'It is 0 only when A = 1 and B = 0.' },
      { q: 'How many of the sixteen depend on both inputs?', options: ['6', '8', '10', '12'], answer: 2, why: 'Take away the 2 constants and the 4 that depend on one input only.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // minterms and maxterms
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'minterms-maxterms', family: 'p2-forms', order: 30, title: 'Minterms and maxterms',
    blurb: 'Each row has a minterm, the product that is 1 on that row only, and a maxterm, the sum that is 0 on that row only. A 0 in the row gives a complemented letter in the minterm and a plain one in the maxterm.',
    inputs: [{ id: 'f', kind: 'expr', label: 'Function', def: "A'B + AC", check: X.check('Function', 4) }],
    presets: [
      { label: "A'B + AC", values: { f: "A'B + AC" } },
      { label: 'Two variables: A ⊕ B', values: { f: 'A ^ B' } },
      { label: 'Four variables: AB + CD', values: { f: 'AB + CD' } },
      { label: 'Always 1: A + A\'', values: { f: "A + A'" } },
    ],
    counters: [{ id: 'ones', label: 'minterms (1 rows)' }, { id: 'zeros', label: 'maxterms (0 rows)' }],
    run(inp) {
      const e = B().parse(inp.f), vars = B().vars(e), n = vars.length, N = 1 << n;
      const fn = B().fromExpr(e);
      const F = new S.Frames(['ones', 'zeros']);
      const mt = (m) => X.text(B().minterm(m, vars)), Mt = (m) => X.text(B().maxterm(m, vars));
      const done = new Set();
      const rh = n === 4 ? 27 : 34, fs = n === 4 ? 14 : 16;
      const scene = (o) => {
        o = o || {};
        const rows = [];
        for (let m = 0; m < N; m++) { const v = B().value(fn, m); rows.push([String(m)].concat(B().bits(m, n).split('')).concat([done.has(m) ? mt(m) : '', done.has(m) ? Mt(m) : '', String(v)])); }
        const t = K.table.draw({ prefix: 'mt', x: 0, y: 0, rows, colHead: ['row'].concat(vars, ['minterm', 'maxterm', 'F']), ch: rh, size: fs, mono: true, hot: o.row === undefined ? [] : [[o.row, n + 1], [o.row, n + 2]], act: o.row === undefined ? [] : vars.map((_, i) => [o.row, i + 1]),
          cls: (r, c) => (o.sums && c === n + 1 && B().value(fn, r) === 1 ? 'good' : o.sums && c === n + 2 && B().value(fn, r) === 0 ? 'src-a' : o.sums && (c === n + 1 || c === n + 2) ? 'dim' : '') });
        const items = t.items;
        if (o.sums) {
          const x0 = t.box.w + 50;
          const ones = B().minterms(fn), zeros = B().maxterms(fn);
          items.push({ key: 's:t', kind: 'text', x: x0, y: 30, text: 'sum of minterms (the 1 rows)', cls: 'title' });
          items.push({ key: 's:f', kind: 'cell', x: x0, y: 44, w: 420, h: Math.max(44, 30 * Math.ceil(ones.length / 3) + 14), lines: ones.length ? chunk(ones.map(mt), 3, ' + ') : ['0'], align: 'left', cls: 'mono good', size: 15, enter: 'grow' });
          items.push({ key: 's:s', kind: 'text', x: x0, y: 44 + Math.max(44, 30 * Math.ceil(ones.length / 3) + 14) + 24, text: 'F = ' + B().sigma(fn), cls: 'mono', size: 16 });
          const y2 = 44 + Math.max(44, 30 * Math.ceil(ones.length / 3) + 14) + 80;
          items.push({ key: 'p:t', kind: 'text', x: x0, y: y2, text: 'product of maxterms (the 0 rows)', cls: 'title' });
          const h2 = Math.max(44, 30 * Math.ceil(zeros.length / 2) + 14);
          items.push({ key: 'p:f', kind: 'cell', x: x0, y: y2 + 14, w: 420, h: h2, lines: zeros.length ? chunk(zeros.map((m) => '(' + Mt(m) + ')'), 2, '') : ['1'], align: 'left', cls: 'mono src-a', size: 15, enter: 'grow' });
          items.push({ key: 'p:s', kind: 'text', x: x0, y: y2 + 14 + h2 + 24, text: 'F = ' + B().pi(fn), cls: 'mono', size: 16 });
        }
        return items;
      };
      F.add({ items: scene(), say: 'F = ' + X.text(e) + ' over ' + vars.join(', ') + ': ' + N + ' rows, numbered by reading the inputs as a binary number.', meta: { start: true } });
      const pick = N <= 8 ? [...Array(N).keys()] : [0, 1, 5, 10, 15];
      for (const m of pick) {
        done.add(m);
        const bits = B().bits(m, n);
        F.add({ items: scene({ row: m }), say: 'Row ' + m + ' = ' + bits + ': the minterm m' + m + ' = ' + mt(m) + ' (a letter is complemented where its bit is 0), and the maxterm M' + m + ' = ' + Mt(m) + ' (complemented where its bit is 1). F = ' + B().value(fn, m) + ' here.', meta: { row: m, m: mt(m) } });
      }
      for (let m = 0; m < N; m++) done.add(m);
      F.set('ones', fn.ones.size).set('zeros', N - fn.ones.size);
      if (N > 8) F.add({ items: scene(), say: 'The other rows follow the same rule.' });
      F.add({ items: scene({ sums: true }), mark: 'forms', say: 'F is the OR of the minterms of its 1 rows, ' + B().sigma(fn) + ', and the AND of the maxterms of its 0 rows, ' + B().pi(fn) + '. The two lists together hold every row number exactly once.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Rules', text: 'minterm mᵢ: 1 only on row i\n  bit 0 → X′, bit 1 → X\nmaxterm Mᵢ: 0 only on row i\n  bit 0 → X, bit 1 → X′\nMᵢ = mᵢ′' }] } };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.row === 3, pick: 'option', options: (fr, i, inp) => { const vars = B().vars(B().parse(inp.f)); const right = fr[i + 1].meta.m; const wrong = X.text(B().minterm(((1 << vars.length) - 1) ^ 3, vars)); return [right, wrong].sort(); }, ask: 'What is the minterm of row 3?', answer: (fr, i) => fr[i + 1].meta.m, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'Over A, B, C, the minterm m5 is', options: ["AB'C", "A'BC'", "A + B' + C", "A' + B + C'"], answer: 0, why: '5 = 101: A plain, B complemented, C plain.' },
      { q: 'Over A, B, C, the maxterm M5 is', options: ["A' + B + C'", "AB'C", "A + B' + C", "A'BC'"], answer: 0, why: 'A maxterm complements where the bit is 1: 101 → A′ + B + C′.' },
      { q: 'How are mᵢ and Mᵢ related?', options: ['They are equal', 'Mᵢ = mᵢ′', 'Mᵢ is the dual', 'unrelated'], answer: 1, why: 'De Morgan turns the product into the sum of complements.' },
      { q: 'A function with three 1 rows over three variables has how many maxterms in its ΠM form?', options: ['3', '5', '8', '0'], answer: 1, why: 'Eight rows, three are 1s: five 0 rows.' },
    ],
  });
  function chunk(xs, k, sep) { const out = []; for (let i = 0; i < xs.length; i += k) out.push(xs.slice(i, i + k).join(sep) + (i + k < xs.length && sep.trim() ? sep.trimEnd() : '')); return out; }

  // ---------------------------------------------------------------------------------------------------
  // Σm and ΠM
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'sigma-pi', family: 'p2-forms', order: 40, title: 'Σm and ΠM: one list from the other',
    blurb: 'A function\'s minterm list and maxterm list split the row numbers between them: whatever is not a 1 (or a don\'t-care) is a 0. Converting is just taking the numbers that are missing.',
    inputs: [
      { id: 'list', kind: 'text', label: 'List', def: 'Σm(1, 3, 4, 6) + d(7)', check: (v) => { try { B().parseList(v, 3); return null; } catch (e) { return 'List: ' + e.message; } } },
      { id: 'n', kind: 'number', label: 'Variables', def: 3, min: 2, max: 4 },
    ],
    check: (inp) => { try { B().parseList(inp.list, inp.n); return null; } catch (e) { return 'List: ' + e.message; } },
    presets: [
      { label: 'Σm(1, 3, 4, 6) + d(7)', values: { list: 'Σm(1, 3, 4, 6) + d(7)', n: 3 } },
      { label: 'From ΠM: ΠM(0, 5, 9, 14) over 4', values: { list: 'ΠM(0, 5, 9, 14)', n: 4 } },
      { label: 'Every row: Σm(0, 1, 2, 3)', values: { list: 'Σm(0, 1, 2, 3)', n: 2 } },
      { label: 'No rows: Σm()', values: { list: 'Σm()', n: 3 } },
    ],
    counters: [{ id: 'moved', label: 'numbers moved' }],
    run(inp) {
      const fn = B().parseList(inp.list, inp.n), N = 1 << inp.n;
      const fromPi = /Π|prod|M\(/.test(inp.list) && !/Σ|sum|m\(/.test(inp.list);
      const to = fromPi ? 'sigma' : 'pi';
      const conv = B().convertList(fn, to);
      const ones = B().minterms(fn), zeros = B().maxterms(fn), dcs = B().dontCares(fn);
      const given = fromPi ? zeros : ones, other = fromPi ? ones : zeros;
      const F = new S.Frames(['moved']);
      const CW = 46;
      const moved = new Set();
      const scene = (o) => {
        o = o || {};
        const items = [{ key: 't0', kind: 'text', x: 0, y: -14, text: 'row numbers 0 to ' + (N - 1), cls: 'title' }];
        for (let m = 0; m < N; m++) {
          if (moved.has(m)) continue;
          const st = given.includes(m) ? (fromPi ? 'off' : 'on') : dcs.includes(m) ? 'dc' : o.lit ? 'hot' : '';
          items.push({ key: 'n' + m, kind: 'cell', x: m * CW, y: 0, w: CW - 6, h: 40, text: String(m), cls: 'nchip ' + st, size: 17, pick: true });
        }
        const y2 = 130;
        items.push({ key: 't1', kind: 'text', x: 0, y: y2 - 14, text: (to === 'pi' ? 'maxterms: the 0 rows' : 'minterms: the 1 rows'), cls: 'title' });
        [...moved].sort((a, b) => a - b).forEach((m, k) => items.push({ key: 'n' + m, kind: 'cell', x: k * CW, y: y2, w: CW - 6, h: 40, text: String(m), cls: 'nchip ' + (to === 'pi' ? 'off' : 'on'), size: 17 }));
        if (o.text) items.push({ key: 'res', kind: 'text', x: 0, y: y2 + 90, text: 'F = ' + o.text, cls: 'mono strong', size: 20 }, { key: 'res2', kind: 'text', x: 0, y: y2 + 124, text: "F′ = " + (to === 'pi' ? B().sigma(B().complement(fn)) : B().pi(B().complement(fn))), cls: 'mono', size: 16 });
        return items;
      };
      F.add({ items: scene(), say: conv.trace[0].say + (dcs.length ? ' The dashed numbers are don\'t-cares.' : ''), meta: { start: true, count: other.length } });
      F.add({ items: scene({ lit: true }), say: 'The numbers not in the list ' + (dcs.length ? 'and not don\'t-cares ' : '') + 'are lit: ' + (other.length ? other.join(', ') : 'none') + '. Each one is a ' + (to === 'pi' ? '0' : '1') + ' of F.' });
      other.forEach((m) => moved.add(m));
      F.count('moved', other.length);
      F.add({ items: scene(), say: conv.trace.find((t) => t.kind === 'list-missing').say });
      if (dcs.length) F.add({ items: scene(), say: conv.trace.find((t) => t.kind === 'list-dc').say });
      F.add({ items: scene({ text: conv.text }), mark: 'converted', say: 'So F = ' + B().sigma(fn) + ' = ' + B().pi(fn) + '. And F′ swaps the roles: its minterms are F\'s maxterms.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Both lists', text: 'F = ' + B().sigma(fn) + '\nF = ' + B().pi(fn) + "\nF′ = " + B().sigma(B().complement(fn)) } ] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.start, pick: 'option', options: (fr) => { const c = fr[0].meta.count; return [c - 2, c - 1, c, c + 1, c + 2].filter((x) => x >= 0).map(String); }, ask: 'How many numbers will the other list hold?', answer: (fr) => String(fr[0].meta.count), explain: (fr) => fr[2].say }],
    quiz: [
      { q: 'Over three variables, Σm(0, 2, 5) = ΠM(…)?', options: ['1, 3, 4, 6, 7', '0, 2, 5', '3, 4, 6', '1, 3, 6, 7'], answer: 0, why: 'The missing numbers from 0 to 7.' },
      { q: "If F = Σm(1, 2), what is F′ over two variables?", options: ['Σm(0, 3)', 'Σm(1, 2)', 'ΠM(0, 3)', 'Σm(2, 1)'], answer: 0, why: 'The complement is 1 exactly where F is 0.' },
      { q: 'Where do don\'t-cares go when converting?', options: ['into the new list', 'they stay don\'t-cares', 'they become 0s', 'they become 1s'], answer: 1, why: 'A don\'t-care is neither a 1 nor a 0, so it is listed apart in both forms.' },
      { q: 'Σm and ΠM lists of the same function, together, contain…', options: ['every row number once (with the don\'t-cares)', 'some numbers twice', 'only the 1 rows', 'nothing in common with the table'], answer: 0, why: 'Each row is a 1, a 0 or a don\'t-care.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // expanding a non-standard form
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'expand-canonical', family: 'p2-forms', order: 50, title: 'Expanding into canonical form',
    blurb: 'A product term missing a variable covers two rows: multiply it by (X + X′) = 1 and it splits into two terms that have it. Repeat until every term has every variable, and the terms are minterms.',
    inputs: [
      { id: 'f', kind: 'expr', label: 'Sum of products (or product of sums)', def: "AB + C'", check: X.check('Expression', 4) },
      { id: 'form', kind: 'choice', label: 'Form', def: 'sop', options: [{ value: 'sop', label: 'sum of products → minterms' }, { value: 'pos', label: 'product of sums → maxterms' }] },
    ],
    check: (inp) => { try { B().expand(B().parse(inp.f), null, inp.form); return null; } catch (e) { return 'Expression: ' + e.message; } },
    presets: [
      { label: "AB + C'", values: { f: "AB + C'", form: 'sop' } },
      { label: "A + B'C (a term covers half the rows)", values: { f: "A + B'C", form: 'sop' } },
      { label: "Overlapping terms: AB + BC", values: { f: 'AB + BC', form: 'sop' } },
      { label: "Product of sums: (A + B)(A' + C)", values: { f: "(A + B)(A' + C)", form: 'pos' } },
      { label: "A term that is always 0: AA'B + C", values: { f: "AA'B + C", form: 'sop' } },
    ],
    counters: [{ id: 'splits', label: 'splits' }],
    run(inp) {
      const e = B().parse(inp.f), vars = B().vars(e), n = vars.length, sop = inp.form === 'sop';
      const r = B().expand(e, vars, inp.form);
      const terms = (e.op === (sop ? 'or' : 'and') ? e.args : [e]);
      const F = new S.Frames(['splits']);
      const RH = 64, PX = 170;
      const parts = terms.map((t) => [X.text(t)]), nums = terms.map(() => null), dead = new Set();
      const hits = new Map();
      const pw = (t) => Math.max(44, Geo.textWidth(t, 15, { mono: true }) + 14);
      const scene = (o) => {
        o = o || {};
        const items = [];
        terms.forEach((t, ti) => {
          const y = ti * RH;
          items.push({ key: 'eq' + ti, kind: 'text', x: 152, y: y + 27, text: '=', cls: 'strong', size: 18 }, { key: 't' + ti, kind: 'cell', x: 0, y, w: 140, h: 42, text: X.text(t), cls: 'mono' + (o.term === ti ? ' hot' : dead.has(ti) ? ' gone' : ''), size: 16 });
          let x = PX;
          if (nums[ti]) nums[ti].forEach((m, k) => { items.push({ key: 'm' + ti + ':' + k, kind: 'cell', x: x, y: y - 2, w: 52, h: 46, lines: [(sop ? 'm' : 'M') + m, B().bits(m, n)], cls: 'nchip on', size: 13, enter: 'from', src: 'p' + ti + ':' + k }); x += 58; });
          else if (!dead.has(ti)) parts[ti].forEach((p, k) => { const w = pw(p); items.push({ key: 'p' + ti + ':' + k, kind: 'cell', x, y: y + 4, w, h: 34, text: p, cls: 'mono' + (o.term === ti ? ' new' : ''), size: 15, enter: 'from', src: 'p' + ti + ':' + Math.floor(k / 2) }); x += w + 8; });
        });
        if (o.strip) {
          const y = terms.length * RH + 30;
          items.push({ key: 'st', kind: 'text', x: 0, y: y - 12, text: 'rows covered', cls: 'title' });
          for (let m = 0; m < 1 << n; m++) items.push({ key: 's' + m, kind: 'cell', x: m * 44, y, w: 40, h: 38, text: String(m), cls: 'nchip ' + (hits.has(m) ? (hits.get(m) > 1 && o.dup ? 'dc' : 'on') : ''), size: 15 });
        }
        return items;
      };
      F.add({ items: scene(), say: r.trace[0].say, meta: { start: true } });
      let ti = -1;
      for (const st of r.trace.slice(1)) {
        if (st.kind === 'expand-dup' || st.kind === 'expand-done') continue;
        ti = terms.findIndex((t, i) => X.text(t) === st.term.replace(/'/g, '′') && (nums[i] === null && !dead.has(i)));
        if (ti < 0) continue;
        if (st.kind === 'expand-var') { parts[ti] = st.after.map((p) => p.replace(/'/g, '′')); F.count('splits'); F.add({ items: scene({ term: ti }), say: st.say.replace(/'/g, '′'), meta: { count: st.after.length } }); }
        else if (st.kind === 'expand-term') { nums[ti] = st.list; st.list.forEach((m) => hits.set(m, (hits.get(m) || 0) + 1)); F.add({ items: scene({ term: ti }), say: st.say.replace(/'/g, '′') }); }
        else if (st.kind === 'expand-empty') { dead.add(ti); F.add({ items: scene({ term: ti }), say: st.say.replace(/'/g, '′') }); }
        else F.add({ items: scene({ term: ti }), say: st.say.replace(/'/g, '′') });
      }
      const dup = r.trace.find((t) => t.kind === 'expand-dup');
      F.add({ items: scene({ strip: true, dup: true }), say: dup ? dup.say : 'No row is covered twice.' });
      F.add({ items: scene({ strip: true }), mark: 'done', say: r.trace[r.trace.length - 1].say + ' ' + r.list.length + ' of the ' + (1 << n) + ' rows.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'The step', text: sop ? "T = T(X + X′) = TX + TX′" : "S = S + XX′ = (S + X)(S + X′)" }] } };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.count, once: true, pick: 'option', options: ['2', '4', '8'], ask: 'After this split, how many terms will this one have become?', answer: (fr, i) => String(fr[i + 1].meta.count), explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'Over A, B, C, the term A expands into how many minterms?', options: ['1', '2', '4', '8'], answer: 2, why: 'Two missing variables: 2 × 2 = 4.' },
      { q: "AB over A, B, C becomes", options: ["ABC + ABC'", "ABC", "A + B + C", "AB'C"], answer: 0, why: 'Multiply by (C + C′).' },
      { q: 'Why multiply by (X + X′)?', options: ['It equals 1, so the term keeps its value', 'It doubles the function', 'It removes X', 'It is De Morgan'], answer: 0, why: 'Multiplying by 1 changes nothing, but writes X into the term.' },
      { q: 'Two terms produce the same minterm. Then…', options: ['it counts twice', 'it is kept once (idempotence)', 'the function is wrong', 'it becomes a don\'t-care'], answer: 1, why: 'X + X = X.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // complement and dual
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'complement-dual', family: 'p2-forms', order: 60, title: 'Complement and dual of a function',
    blurb: 'The complement swaps AND with OR and complements every literal; the dual swaps AND with OR only. Built side by side from the same expression, their tables show how each relates to the original.',
    inputs: [{ id: 'f', kind: 'expr', label: 'Function', def: "AB' + C", check: X.check('Function', 3) }],
    presets: [{ label: "AB' + C", values: { f: "AB' + C" } }, { label: "(A + B')C'", values: { f: "(A + B')C'" } }, { label: 'Majority: AB + AC + BC (its own dual)', values: { f: 'AB + AC + BC' } }, { label: 'XOR: A ⊕ B', values: { f: 'A ^ B' } }],
    counters: [],
    run(inp) {
      const e = B().parse(inp.f), vars = B().vars(e), n = vars.length;
      const c = B().complementExpr(e).expr, d = B().dualExpr(e);
      const F = new S.Frames([]);
      const SZ = 24, LX = 150;
      const lab = (k, y, t) => ({ key: k, kind: 'text', x: LX - 20, y: y + SZ * 1.15, text: t, anchor: 'end', cls: 'strong', size: 18 });
      const mark = (items, f) => items.map((it) => (it.kind === 'cell' && f(it.text) ? Object.assign({}, it, { cls: it.cls + ' flip' }) : it));
      const isOp = (t) => t === '+' || t === '·';
      const rows = (o) => {
        const items = [lab('lf', 0, 'F ='), ...X.chips(e, { prefix: 'F', x: LX, y: 0, size: SZ, dots: true }).items];
        if (o >= 1) items.push(lab('lc', 70, 'F′ ='), ...mark(X.chips(c, { prefix: 'C', x: LX, y: 70, size: SZ, dots: true }).items.map((it) => (it.kind === 'cell' ? Object.assign({}, it, { enter: 'from', src: 'F' + it.key.slice(1) }) : it)), (t) => isOp(t) || /′/.test(t) || /^[A-Z]$/.test(t)));
        if (o >= 2) items.push(lab('ld', 140, 'Fᵈ ='), ...mark(X.chips(d, { prefix: 'D', x: LX, y: 140, size: SZ, dots: true }).items.map((it) => (it.kind === 'cell' ? Object.assign({}, it, { enter: 'from', src: 'F' + it.key.slice(1) }) : it)), isOp));
        return items;
      };
      const tbl = (o) => X.table({ vars, prefix: 'tt', x: 0, y: 230, rowH: 32, size: 16, hot: o.row, cols: [{ name: 'F', f: e }, { name: 'F′', f: c }, { name: 'Fᵈ', f: d }], cls: (r, cc) => (o.pair && (r === o.pair[0] || r === o.pair[1]) ? 'act' : '') }).items;
      F.add({ items: rows(0), say: 'F = ' + X.text(e) + '.', meta: { start: true } });
      F.add({ items: rows(1), say: 'The complement F′: every · becomes +, every + becomes ·, and every literal is complemented (De Morgan pushed down to the inputs): F′ = ' + X.text(c) + '.' });
      F.add({ items: rows(2), say: 'The dual Fᵈ: only the operators swap; the literals stay as they are: Fᵈ = ' + X.text(d) + '.' });
      F.add({ items: rows(2).concat(tbl({})), say: 'In the table, F′ is F with every output flipped, row by row.' });
      const m = 1, mc = ((1 << n) - 1) ^ m, env = X.env(m, vars), envc = X.env(mc, vars);
      const fd = B().evaluate(d, env), fc = B().evaluate(e, envc);
      F.add({ items: rows(2).concat(tbl({ pair: [m, mc] })), mark: 'dual rule', say: 'The dual is subtler: Fᵈ at a row is the complement of F at the opposite row. At ' + B().bits(m, n) + ', Fᵈ = ' + fd + '; F at ' + B().bits(mc, n) + ' is ' + fc + ', complemented ' + (1 - fc) + '.', meta: { fd } });
      const self = B().prove(e, d).equal;
      F.add({ items: rows(2).concat(tbl({})), say: self ? 'Here Fᵈ = F: the function is self-dual.' : 'Fᵈ(x) = F(x′)′ for every row. A function equal to its own dual is called self-dual; this one is not.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Definitions', text: "F′(x) = F(x)′\nFᵈ(x) = F(x′)′\nF′: swap · and +, complement literals\nFᵈ: swap · and + (and 0, 1)" }] } };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].mark === 'dual rule', pick: 'option', options: ['0', '1'], ask: 'Fᵈ at the lit row equals F at the opposite row, complemented. Which value is it?', answer: (fr, i) => String(fr[i + 1].meta.fd), explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: "The complement of AB' + C is", options: ["(A' + B)C'", "(A + B')C", "A'B + C'", "(A' + B)C"], answer: 0, why: 'Swap operators and complement each literal.' },
      { q: "The dual of AB' + C is", options: ["(A + B')C", "(A' + B)C'", "AB'C", "A + B' + C"], answer: 0, why: 'Swap operators only.' },
      { q: 'Which is always true?', options: ['Fᵈ = F′', 'Fᵈ(x) = F(x′)′', 'Fᵈ = F', "F′ = F(x′)"], answer: 1, why: 'Dualising swaps the operators; De Morgan relates that to complementing inputs and output.' },
      { q: 'AB + AC + BC is…', options: ['self-dual', 'its own complement', 'constant', 'XOR'], answer: 0, why: 'Its dual (A + B)(A + C)(B + C) multiplies out to the same majority function.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // classifiers
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'classifiers', family: 'p2-forms', order: 70, title: 'Self-dual, symmetric, monotone, threshold',
    blurb: 'Four properties a function may have, each read straight off its truth table: complementary rows giving complementary outputs, the output depending only on how many inputs are 1, never falling when an input rises, and a weighted vote.',
    inputs: [{ id: 'f', kind: 'expr', label: 'Function', def: 'AB + AC + BC', check: X.check('Function', 4) }],
    presets: [{ label: 'Majority: AB + AC + BC', values: { f: 'AB + AC + BC' } }, { label: 'Odd parity: A ⊕ B ⊕ C', values: { f: 'A ^ B ^ C' } }, { label: 'A + BC', values: { f: 'A + BC' } }, { label: "AB' + C", values: { f: "AB' + C" } }, { label: 'Two of four: AB + CD', values: { f: 'AB + CD' } }],
    counters: [{ id: 'yes', label: 'properties held' }],
    run(inp) {
      const e = B().parse(inp.f), vars = B().vars(e), n = vars.length, fn = B().fromExpr(e), N = 1 << n;
      const sd = B().selfDual(fn), sy = B().symmetric(fn), mo = B().monotone(fn), th = B().threshold(fn);
      const F = new S.Frames(['yes']);
      const verdicts = [];
      const rowsOf = (w) => { if (!w) return []; if (Array.isArray(w)) return w; if (w.rows) return w.rows; if (w.ones) return w.ones.concat(w.zeros); return []; };
      const scene = (o) => {
        o = o || {};
        const lit = new Set(o.rows || []);
        const t = X.table({ vars, prefix: 'tt', x: 0, y: 0, rowH: n === 4 ? 26 : 34, size: n === 4 ? 14 : 16, cols: [{ name: 'F', f: e }].concat(o.weight ? [{ name: '# of 1s', f: (env) => vars.filter((v) => env[v]).length }] : []), cls: (r) => (lit.has(r) ? (o.bad ? 'bad' : 'act') : '') });
        const items = t.items;
        const vx = t.box.w + 60;
        verdicts.forEach((v, i) => items.push({ key: 'v' + i, kind: 'cell', x: vx, y: i * 64, w: 330, h: 52, lines: [v.name + (v.ok ? '  ✓' : '  ✗'), v.note], cls: v.ok ? 'good' : 'bad', size: 14, align: 'left', enter: 'grow' }));
        return items;
      };
      F.add({ items: scene(), say: 'F = ' + X.text(e) + '. Four tests, each on the truth table.', meta: { start: true, sd: sd.selfDual } });
      const step = (name, ok, say, rows, extra, note) => {
        verdicts.push({ name, ok, note }); if (ok) F.count('yes');
        F.add({ items: scene(Object.assign({ rows, bad: !ok }, extra || {})), say });
      };
      const bits = (m) => B().bits(m, n);
      const opp = sd.selfDual ? [0, N - 1] : rowsOf(sd.witness);
      step('self-dual', sd.selfDual, sd.say + (sd.selfDual ? ' For example rows ' + B().bits(0, n) + ' and ' + B().bits(N - 1, n) + ' give ' + B().value(fn, 0) + ' and ' + B().value(fn, N - 1) + '.' : ''), opp, null, sd.selfDual ? "F(x′) = F(x)′ on every row" : 'rows ' + bits(opp[0]) + ', ' + bits(opp[1]) + ' both give ' + B().value(fn, opp[0]));
      step('symmetric', sy.symmetric, sy.say, rowsOf(sy.witness), { weight: true }, sy.symmetric ? 'F = 1 when the count of 1s is in {' + sy.weights.join(', ') + '}' : 'rows ' + rowsOf(sy.witness).map(bits).join(', ') + ': same count, different F');
      step('monotone', mo.monotone, mo.say, mo.witness ? rowsOf(mo.witness) : [], null, mo.monotone ? 'no input rise lowers F' : 'raising ' + mo.witness.var + ': ' + rowsOf(mo.witness).map(bits).join(' → ') + ' drops F');
      step('threshold', th.threshold, th.say, th.witness ? rowsOf(th.witness) : [], null, th.threshold ? th.say.replace(/^.*exactly when /, '').replace(/\.$/, '') : 'no weights separate the 1s from the 0s');
      F.add({ items: scene(), mark: 'summary', say: 'F is ' + ['self-dual', 'symmetric', 'monotone', 'a threshold function'].filter((_, i) => [sd.selfDual, sy.symmetric, mo.monotone, th.threshold][i]).join(', ').replace(/^$/, 'none of the four') + '.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'The tests', text: "self-dual: F(x′) = F(x)′\nsymmetric: depends on the count of 1s\nmonotone: raising an input never lowers F\nthreshold: F = 1 ⇔ Σ wᵢxᵢ ≥ T" }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.start, pick: 'option', options: ['Yes', 'No'], ask: 'Is F self-dual?', answer: (fr) => (fr[0].meta.sd ? 'Yes' : 'No'), explain: (fr) => fr[1].say }],
    quiz: [
      { q: 'The majority of three inputs is…', options: ['all four: self-dual, symmetric, monotone, threshold', 'only symmetric', 'only monotone', 'none'], answer: 0, why: 'Weights 1, 1, 1 and threshold 2.' },
      { q: 'Why is XOR not monotone?', options: ['Raising an input can drop the output from 1 to 0', 'It is constant', 'It has three inputs', 'It is self-dual'], answer: 0, why: 'A ⊕ B: from 10 (1) to 11 (0).' },
      { q: 'A symmetric function depends on…', options: ['which inputs are 1', 'how many inputs are 1', 'the first input only', 'nothing'], answer: 1, why: 'Permuting the inputs never changes it.' },
      { q: 'Can a single threshold gate compute XOR?', options: ['Yes', 'No'], answer: 1, why: 'XOR is not linearly separable: no weights put 01 and 10 above the threshold and 00 and 11 below.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
