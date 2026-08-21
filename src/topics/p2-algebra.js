// Part 2, two-valued Boolean algebra: the axioms checked over 0 and 1 row by row, duality as operators and
// constants trading places, the theorems with both sides built as circuits and their columns agreeing, and
// absorption and consensus with the redundant term shown covered on every row where it is 1.
(function (S) {
  'use strict';
  const K = S.Kit, X = K.expr, Geo = S.geom;
  const B = () => S.Bool;
  const vName = (vs, env) => vs.map((v) => v + ' = ' + env[v]).join(', ');
  const T = (e) => X.text(e);

  S.family({ id: 'p2-algebra', part: 'algebra', order: 10, title: 'Two-valued Boolean algebra', blurb: 'Only two values, 0 and 1, and three operations. The axioms, duality and every theorem can be checked by trying each row: the algebra is small enough to test completely.' });

  // ---------------------------------------------------------------------------------------------------
  // a shared picture: an identity checked row by row, with each side's circuit lit for the row
  // ---------------------------------------------------------------------------------------------------
  /**
   * frames for "lhs = rhs": opts {circuits (draw both sides as gates), say0, tag (a short name), after(frames)}
   */
  function checkFrames(text, opts) {
    opts = opts || {};
    const { lhs, rhs } = X.identity(text);
    const vars = [...new Set(B().vars(lhs).concat(B().vars(rhs)))].sort(B().byName);
    const n = vars.length, rows = 1 << n;
    const fl = B().compile(lhs, vars), fr = B().compile(rhs, vars);
    const F = new S.Frames(['rows', 'agree']);
    const L = opts.circuits ? X.circuit(lhs, { inputs: vars }) : null, R = opts.circuits ? X.circuit(rhs, { inputs: vars }) : null;
    // geometry: the identity on top; the two circuits stacked on the left; the table on the right
    const top = 0;
    const cw = opts.circuits ? Math.max(L.res.bounds.w, R.res.bounds.w) : 0;
    const lY = 70, rY = opts.circuits ? lY + L.res.bounds.h + 64 : 0;
    const tX = opts.circuits ? cw + 90 : 0;
    const shown = new Set();
    const bad = [];
    const scene = (o) => {
      o = o || {};
      const items = [];
      const lc = X.chips(lhs, { prefix: 'L', x: 0, y: top, size: 22 });
      const eqX = lc.w + 14;
      items.push(...lc.items);
      items.push({ key: 'eq', kind: 'text', x: eqX, y: top + 26, text: '=', cls: 'big' + (o.verdict === false ? ' bad' : o.verdict ? ' good' : '') });
      const rc = X.chips(rhs, { prefix: 'R', x: eqX + 32, y: top, size: 22, keyOf: (t) => 'R:' + t.path + ':' + t.role });
      items.push(...rc.items);
      if (o.verdict !== undefined) items.push({ key: 'verdict', kind: 'text', x: eqX + 32 + rc.w + 24, y: top + 26, text: o.verdict ? '✓ holds' : '✗ fails', cls: o.verdict ? 'good' : 'bad', size: 18 });
      if (opts.circuits) {
        const env = o.env;
        items.push({ key: 'lt', kind: 'text', x: 0, y: lY - 14, text: 'left side', cls: 'title' });
        items.push(X.schem('lc', L, { x: 0, y: lY, env }));
        items.push({ key: 'rt', kind: 'text', x: 0, y: rY - 14, text: 'right side', cls: 'title' });
        items.push(X.schem('rc', R, { x: 0, y: rY, env }));
        if (env) for (const [k, made, y0, f] of [['lv', L, lY, fl], ['rv', R, rY, fr]]) {
          const o2 = X.outPin(made), v = f(o.row);
          items.push({ key: k, kind: 'text', x: o2.right + 8, y: y0 + o2.y + 6, text: '= ' + v, cls: 'mono ' + (v ? 'good' : 'strong'), size: 18 });
        }
      }
      const tb = X.table({
        vars, prefix: 'tt', x: tX, y: opts.circuits ? lY : 76, hot: o.row, rowH: 34, size: 16,
        cols: [{ name: 'left', f: (env) => { const m = vars.reduce((a, v, i) => a | (env[v] << (n - 1 - i)), 0); return shown.has(m) ? fl(m) : ''; } },
          { name: 'right', f: (env) => { const m = vars.reduce((a, v, i) => a | (env[v] << (n - 1 - i)), 0); return shown.has(m) ? fr(m) : ''; } }],
        cls: (r, c) => (c >= n && shown.has(r) ? (fl(r) === fr(r) ? (o.final ? 'good' : '') : 'bad') : ''),
      });
      items.push(...tb.items);
      if (o.final) {
        const b = tb.cellBox(0, n), b2 = tb.cellBox(rows - 1, n + 1);
        items.push({ key: 'agreeBox', kind: 'region', x: b.x - 4, y: b.y - 4, w: b2.x + b2.w - b.x + 8, h: b2.y + b2.h - b.y + 8, rx: 8, cls: 'xbox ' + (o.verdict ? 'good' : 'bad'), audit: 'overlap-ok' });
      }
      return items;
    };
    F.add({ items: scene(), say: (opts.say0 || 'Is ' + T(lhs) + ' = ' + T(rhs) + ' an identity?') + ' With ' + n + ' variable' + (n === 1 ? '' : 's') + ' there are only ' + rows + ' rows to try: if both sides agree on every one, it holds for all values.', meta: { start: true } });
    for (let m = 0; m < rows; m++) {
      const env = X.env(m, vars);
      const a = fl(m), b = fr(m);
      shown.add(m);
      F.count('rows');
      if (a === b) F.count('agree'); else bad.push(m);
      const its = scene({ row: m, env, lit: 'both' });
      F.add({ items: its, narrowView: X.focus(its, ['tt:']), say: vName(vars, env) + ': the left side is ' + X.subst(lhs, env) + ' = ' + a + ', the right side is ' + X.subst(rhs, env) + ' = ' + b + '. ' + (a === b ? 'They agree.' : 'They differ: this row is a counterexample.'), meta: { row: m, a, b, env } });
    }
    const ok = !bad.length;
    F.add({ items: scene({ final: true, verdict: ok }), say: ok ? 'All ' + rows + ' rows agree, so ' + T(lhs) + ' = ' + T(rhs) + ' holds for every value of ' + vars.join(', ') + '.' + (opts.tagSay ? ' ' + opts.tagSay : '') : 'The sides differ on ' + bad.length + ' row' + (bad.length === 1 ? '' : 's') + ' (first at ' + vName(vars, X.env(bad[0], vars)) + '), so this is not an identity.', mark: 'verdict', meta: { verdict: ok } });
    return { frames: F.list, vars, ok, lhs, rhs, bad };
  }
  S.P2 = { checkFrames };

  const rowPredict = {
    at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.row !== undefined && fr[i + 1].meta.row % 3 === 1,
    pick: 'option', options: ['0', '1'],
    ask: (fr, i) => { const m = fr[i + 1].meta; return 'Next row: ' + Object.entries(m.env).map(([k, v]) => k + ' = ' + v).join(', ') + '. What is the left side there?'; },
    answer: (fr, i) => String(fr[i + 1].meta.a), explain: (fr, i) => fr[i + 1].say,
  };
  const holdsPredict = { at: (f) => f.meta && f.meta.start, once: true, pick: 'option', options: ['It holds', 'It fails'], ask: 'Before checking: is this an identity?', answer: (fr) => (fr[fr.length - 1].meta.verdict ? 'It holds' : 'It fails'), explain: (fr) => fr[fr.length - 1].say };

  // ---------------------------------------------------------------------------------------------------
  // the axioms
  // ---------------------------------------------------------------------------------------------------
  const AXIOMS = {
    'X + 0 = X': 'Identity for +: 0 is the identity element of OR.',
    'X·1 = X': 'Identity for ·: 1 is the identity element of AND.',
    'X + Y = Y + X': 'Commutativity of +.',
    'XY = YX': 'Commutativity of ·.',
    'X(Y + Z) = XY + XZ': '· distributes over +, as in ordinary arithmetic.',
    'X + YZ = (X + Y)(X + Z)': '+ distributes over ·: this one has no counterpart in ordinary arithmetic.',
    "X + X' = 1": "Complement: X + X' = 1.",
    "XX' = 0": "Complement: X·X' = 0.",
  };
  S.topic({
    id: 'axioms', family: 'p2-algebra', order: 10, title: 'The axioms, checked row by row',
    blurb: 'Closure, identity, commutativity, distributivity both ways and the complement. With only 0 and 1, each axiom can be tested on every row: here each side is evaluated with the actual values.',
    inputs: [{ id: 'law', kind: 'text', label: 'Identity (left = right)', def: 'X + YZ = (X + Y)(X + Z)', check: X.checkIdentity('Identity', 3) }],
    presets: Object.keys(AXIOMS).map((k) => ({ label: k, values: { law: k } })).concat([{ label: 'Not an axiom: X + YZ = (X + Y)Z', values: { law: 'X + YZ = (X + Y)Z' } }, { label: 'Ordinary arithmetic fails: X + X = 0', values: { law: 'X + X = 0' } }]),
    counters: [{ id: 'rows', label: 'rows tried' }, { id: 'agree', label: 'rows that agree' }],
    run(inp) {
      const key = Object.keys(AXIOMS).find((k) => B().key(X.identity(k).lhs) === B().key(X.identity(inp.law).lhs) && B().key(X.identity(k).rhs) === B().key(X.identity(inp.law).rhs));
      const r = checkFrames(inp.law, { say0: (key ? AXIOMS[key] + ' ' : '') + 'Check ' + inp.law.replace(/'/g, '′') + '.' });
      // closure first: every operation on 0 and 1 gives 0 or 1
      const cl = [['0 + 0', 0], ['0 + 1', 1], ['1 + 0', 1], ['1 + 1', 1], ['0·0', 0], ['0·1', 0], ['1·0', 0], ['1·1', 1], ["0′", 1], ["1′", 0]];
      const items = cl.map(([t, v], i) => ({ key: 'cl:' + i, kind: 'cell', x: (i % 5) * 112, y: 76 + Math.floor(i / 5) * 54, w: 100, h: 42, text: t + ' = ' + v, cls: 'mono ' + (v ? 'bit1' : 'bit0'), size: 17, enter: 'drop' }));
      items.push({ key: 'cl:t', kind: 'text', x: 0, y: 56, text: 'closure: every result is 0 or 1', cls: 'title' });
      const first = { items, say: 'Closure: OR, AND and NOT applied to 0 and 1 only ever give 0 or 1, so every expression has a value in {0, 1} and a table of rows tells the whole story.' };
      const def = { sections: [{ id: 'ax', kind: 'math', title: 'The axioms (two-valued)', text: Object.keys(AXIOMS).map((k) => k.replace(/'/g, '′')).join('\n') }] };
      return { frames: [first].concat(r.frames), def };
    },
    predict: [holdsPredict, rowPredict],
    quiz: [
      { q: 'Which distributive law holds in Boolean algebra but not in ordinary arithmetic?', options: ['X(Y + Z) = XY + XZ', 'X + YZ = (X + Y)(X + Z)', 'X + Y = Y + X', 'X·1 = X'], answer: 1, why: 'Try X = 1, Y = Z = 0 in ordinary numbers: 1 + 0 = 1 but (1 + 0)(1 + 0) = 1 too; X = 2 breaks it. In Boolean algebra it holds on every row.' },
      { q: 'How many rows prove a three-variable identity?', options: ['3', '6', '8', '9'], answer: 2, why: 'Each variable is 0 or 1: 2 × 2 × 2 = 8 rows, and agreeing on all of them proves it.' },
      { q: 'What is the identity element of AND?', options: ['0', '1', 'X', "X'"], answer: 1, why: 'X·1 = X for X = 0 and X = 1.' },
      { q: "X + X' equals", options: ['0', '1', 'X', "X'"], answer: 1, why: 'One of X and X′ is always 1, so their OR is 1.' },
      { q: 'One row where the sides differ shows that…', options: ['the identity holds', 'the identity fails', 'nothing yet', 'its dual holds'], answer: 1, why: 'An identity must hold for every value; one counterexample is enough to refute it.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // the theorems, with both sides as circuits
  // ---------------------------------------------------------------------------------------------------
  const THEOREMS = [
    ['Idempotence', 'X + X = X'], ['Idempotence (·)', 'XX = X'], ['Involution', "(X')' = X"], ['Null element', 'X + 1 = 1'],
    ['Absorption', 'X + XY = X'], ['Absorption (dual)', 'X(X + Y) = X'], ['Absorption, second form', "X + X'Y = X + Y"],
    ['Associativity', '(X + Y) + Z = X + (Y + Z)'], ['De Morgan', "(X + Y)' = X'Y'"], ['De Morgan, three variables', "(XYZ)' = X' + Y' + Z'"],
    ['Consensus', "XY + X'Z + YZ = XY + X'Z"], ['Not a theorem', 'X + YZ = (X + Y)Z'],
  ];
  S.topic({
    id: 'theorems', family: 'p2-algebra', order: 30, title: 'Theorems: both sides as circuits',
    blurb: 'Each side of a theorem is a circuit. Feed both circuits the same inputs, row by row: their outputs agree on every row exactly when the theorem holds, and then the cheaper circuit can replace the other.',
    inputs: [{ id: 'law', kind: 'text', label: 'Identity (left = right)', def: 'X + XY = X', check: X.checkIdentity('Identity', 3) }],
    presets: THEOREMS.map(([l, t]) => ({ label: l + ': ' + t, values: { law: t } })),
    counters: [{ id: 'rows', label: 'rows tried' }, { id: 'agree', label: 'rows that agree' }],
    run(inp) {
      const name = (THEOREMS.find(([, t]) => t === inp.law) || [])[0];
      const id = X.identity(inp.law);
      const cl = B().cost(id.lhs), cr = B().cost(id.rhs);
      const r = checkFrames(inp.law, { circuits: true, say0: (name ? name + ': ' : '') + 'the left side ' + T(id.lhs) + ' needs ' + cl.gates + ' gate' + (cl.gates === 1 ? '' : 's') + ', the right side ' + T(id.rhs) + ' needs ' + cr.gates + '. Do they compute the same function?', tagSay: cl.gates !== cr.gates ? 'So the ' + (cl.gates > cr.gates ? 'right' : 'left') + ' circuit, with ' + Math.min(cl.gates, cr.gates) + ' gate' + (Math.min(cl.gates, cr.gates) === 1 ? '' : 's') + ', can replace the other.' : '' });
      const def = { sections: [{ id: 'th', kind: 'math', title: 'Theorems', text: THEOREMS.slice(0, -1).map(([l, t]) => t.replace(/'/g, '′') + '   ' + l).join('\n') }] };
      return { frames: r.frames, def };
    },
    predict: [holdsPredict, rowPredict],
    quiz: [
      { q: 'X + XY simplifies to', options: ['XY', 'X', 'X + Y', 'Y'], answer: 1, why: 'Absorption: whenever XY is 1, X is already 1.' },
      { q: "X + X'Y simplifies to", options: ['X', 'Y', 'X + Y', "X'Y"], answer: 2, why: "When X = 0 the term X′Y is just Y; when X = 1 the sum is 1 anyway. So X + Y." },
      { q: "(X + Y)' equals", options: ["X' + Y'", "X'Y'", 'XY', "(XY)'"], answer: 1, why: 'De Morgan: the complement of a sum is the product of the complements.' },
      { q: 'Two circuits agree on every row of their truth table. Then…', options: ['they have the same number of gates', 'they compute the same function', 'one is a NAND circuit', 'nothing can be said'], answer: 1, why: 'A combinational circuit is fully described by its truth table.' },
      { q: 'In XY + X′Z + YZ, which term is redundant?', options: ['XY', "X'Z", 'YZ', 'none'], answer: 2, why: 'YZ is the consensus of XY and X′Z: wherever YZ = 1, one of the others is 1 too.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // duality
  // ---------------------------------------------------------------------------------------------------
  const mapOps = (e) => (e.op === 'and' || e.op === 'or' ? { op: e.op === 'and' ? 'or' : 'and', args: e.args.map(mapOps) } : e.op === 'not' ? { op: 'not', a: mapOps(e.a) } : e.op === 'xor' ? { op: 'xor', args: e.args.map(mapOps) } : e);
  const mapConsts = (e) => (e.op === 'const' ? { op: 'const', v: 1 - e.v } : e.op === 'not' ? { op: 'not', a: mapConsts(e.a) } : e.args ? { op: e.op, args: e.args.map(mapConsts) } : e);
  const countIn = (e, f) => { let n = 0; (function w(x) { if (f(x)) n++; (x.op === 'not' ? [x.a] : x.args || []).forEach(w); })(e); return n; };
  /** a strip of small cells, one per row: green where the two sides agree, red where they differ */
  function rowStrip(prefix, a, b, vars, x, y, upto) {
    const fa = B().compile(a, vars), fb = B().compile(b, vars), items = [];
    const n = 1 << vars.length;
    for (let m = 0; m < n; m++) {
      const shown = m < upto, ok = fa(m) === fb(m);
      items.push({ key: prefix + m, kind: 'cell', x: x + m * 34, y, w: 30, h: 30, rx: 6, text: shown ? (ok ? '✓' : '✗') : '', sub: m < n ? B().bits(m, vars.length) : '', cls: 'mono ' + (shown ? (ok ? 'good' : 'bad') : ''), size: 15 });
    }
    return { items, agree: [...Array(n).keys()].filter((m) => fa(m) === fb(m)).length, n };
  }
  S.topic({
    id: 'duality', family: 'p2-algebra', order: 20, title: 'Duality: every identity has a twin',
    blurb: 'Swap + with · and 0 with 1, leaving the variables alone: an identity becomes its dual, and the dual of an identity is always an identity too. Watch the operators trade places, then check both.',
    inputs: [{ id: 'law', kind: 'text', label: 'Identity (left = right)', def: 'X + YZ = (X + Y)(X + Z)', check: X.checkIdentity('Identity', 3) }],
    presets: [
      { label: 'Distributivity', values: { law: 'X + YZ = (X + Y)(X + Z)' } },
      { label: 'Identity element: X + 0 = X', values: { law: 'X + 0 = X' } },
      { label: 'Null element: X + 1 = 1', values: { law: 'X + 1 = 1' } },
      { label: "Absorption: X + X'Y = X + Y", values: { law: "X + X'Y = X + Y" } },
      { label: "De Morgan: (X + Y)' = X'Y'", values: { law: "(X + Y)' = X'Y'" } },
      { label: 'Self-dual: X = X', values: { law: 'XX = X' } },
      { label: 'Not an identity: X + Y = X', values: { law: 'X + Y = X' } },
    ],
    counters: [{ id: 'swapped', label: 'symbols swapped' }],
    run(inp) {
      const { lhs, rhs } = X.identity(inp.law);
      const d = B().dualise(lhs, rhs);
      const vars = [...new Set(B().vars(lhs).concat(B().vars(rhs)))].sort(B().byName);
      const nOps = countIn(lhs, (x) => x.op === 'and' || x.op === 'or') + countIn(rhs, (x) => x.op === 'and' || x.op === 'or');
      const nOpsTok = (e) => X.tokens(e, { dots: true }).tokens.filter((t) => t.t === '+' || t.t === '·').length;
      const nC = countIn(lhs, (x) => x.op === 'const') + countIn(rhs, (x) => x.op === 'const');
      const F = new S.Frames(['swapped']);
      const SZ = 24;
      const line = (pre, l, r, y, o) => {
        o = o || {};
        const items = [];
        const lc = X.chips(l, { prefix: pre + 'L', x: 0, y, size: SZ, dots: true, lit: o.lit, enter: o.enterL });
        const eqX = lc.w + 16;
        const rc = X.chips(r, { prefix: pre + 'R', x: eqX + 34, y, size: SZ, dots: true, lit: o.lit, enter: o.enterR });
        const fix = (c, from) => { if (!o.from) return c.items; return c.items.map((it) => { if (it.kind !== 'cell') return it; const src = from + it.key.slice(it.key.indexOf(':')); return Object.assign({}, it, { enter: 'from', src }); }); };
        items.push(...fix(lc, o.from ? o.from + 'L' : ''), { key: pre + ':eq', kind: 'text', x: eqX, y: y + SZ * 1.2, text: '=', cls: 'big' }, ...fix(rc, o.from ? o.from + 'R' : ''));
        // the symbols that changed are tinted
        if (o.mark) for (const it of items) if (it.kind === 'cell' && o.mark(it.text)) it.cls += ' flip';
        return { items, w: eqX + 34 + rc.w };
      };
      const isOp = (t) => t === '+' || t === '·', isC = (t) => t === '0' || t === '1';
      const o0 = line('O', lhs, rhs, 0);
      const W = Math.max(o0.w, 420);
      const strips = (upO, upD) => {
        const a = rowStrip('so', lhs, rhs, vars, 0, 210, upO), b = rowStrip('sd', d.dualLhs, d.dualRhs, vars, 0, 300, upD);
        return { items: [{ key: 'so:t', kind: 'text', x: 0, y: 198, text: 'the identity, row by row', cls: 'title' }, ...a.items, { key: 'sd:t', kind: 'text', x: 0, y: 288, text: 'its dual, row by row', cls: 'title' }, ...b.items], a, b };
      };
      const label = (y, t, k) => ({ key: k, kind: 'text', x: -18, y, text: t, anchor: 'end', cls: 'title' });
      const base = () => [label(SZ * 1.15, 'identity', 'lab0')].concat(o0.items);
      F.add({ items: base(), say: 'Start from ' + X.text(lhs) + ' = ' + X.text(rhs) + '. Its dual keeps every variable and every complement, but swaps + with · and 0 with 1.', meta: { start: true } });
      F.add({ items: [label(SZ * 1.15, 'identity', 'lab0')].concat(line('O', lhs, rhs, 0, { mark: (t) => isOp(t) || isC(t) }).items), say: 'The symbols to swap are tinted: ' + (nOpsTok(lhs) + nOpsTok(rhs)) + ' operator' + (nOpsTok(lhs) + nOpsTok(rhs) === 1 ? '' : 's') + (nC ? ' and ' + nC + ' constant' + (nC === 1 ? '' : 's') : '') + '.' });
      const midL = mapOps(lhs), midR = mapOps(rhs);
      F.count('swapped', nOpsTok(lhs) + nOpsTok(rhs));
      F.add({ items: base().concat([label(110 + SZ * 1.15, 'dual', 'lab1')], line('D', midL, midR, 110, { from: 'O', mark: isOp }).items, [{ key: 'arrow', kind: 'edge', from: { x: W / 2, y: 50 }, to: { x: W / 2, y: 104 }, label: '+ ↔ ·', lx: W / 2 + 46, ly: 77 }]),
        say: 'Every + becomes · and every · becomes +: ' + X.text(midL) + ' = ' + X.text(midR) + '. Brackets appear where the new precedence needs them, so each operator still acts on the same operands.' });
      let fin = line('D', d.dualLhs, d.dualRhs, 110, { from: 'O', mark: (t) => isOp(t) || isC(t) });
      if (nC) {
        F.count('swapped', nC);
        F.add({ items: base().concat([label(110 + SZ * 1.15, 'dual', 'lab1')], fin.items, [{ key: 'arrow', kind: 'edge', from: { x: W / 2, y: 50 }, to: { x: W / 2, y: 104 }, label: '0 ↔ 1', lx: W / 2 + 46, ly: 77 }]), say: 'Then every 0 becomes 1 and every 1 becomes 0. The dual identity is ' + X.text(d.dualLhs) + ' = ' + X.text(d.dualRhs) + '.' });
      }
      const head = () => base().concat([label(110 + SZ * 1.15, 'dual', 'lab1')], fin.items, [{ key: 'arrow', kind: 'edge', from: { x: W / 2, y: 50 }, to: { x: W / 2, y: 104 }, label: 'dual', lx: W / 2 + 40, ly: 77 }]);
      const N = 1 << vars.length;
      const s1 = strips(N, 0);
      F.add({ items: head().concat(strips(N, 0).items), say: 'Check the identity on all ' + N + ' rows: it ' + (d.holds ? 'agrees on every one, so it holds.' : 'agrees on only ' + s1.a.agree + ' of ' + N + ', so it is not an identity.'), meta: { dual: d.dualHolds } });
      F.add({ items: head().concat(strips(N, N).items).concat([{ key: 'verdict', kind: 'text', x: N * 34 + 20, y: 320, text: d.dualHolds ? '✓ the dual holds' : '✗ the dual fails', cls: d.dualHolds ? 'good' : 'bad', size: 17 }]), mark: 'both checked',
        say: 'And the dual on all ' + N + ' rows: ' + (d.dualHolds ? 'it holds too' : 'it fails too') + '. ' + (d.holds ? 'Duality guarantees this: every axiom has its dual among the axioms, so every proof can be dualised step by step.' : 'Duality only promises that the dual of an identity is an identity; this was never one.') });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'The dual', text: ['swap + and ·', 'swap 0 and 1', 'keep variables and complements', '', X.text(lhs) + ' = ' + X.text(rhs), '↓', X.text(d.dualLhs) + ' = ' + X.text(d.dualRhs)].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.start, once: true, pick: 'option', options: (fr, i, inp) => { const { lhs, rhs } = X.identity(inp.law); const d = B().dualise(lhs, rhs); const right = X.text(d.dualLhs) + ' = ' + X.text(d.dualRhs); const wrong = X.text(B().complementExpr(lhs).expr) + ' = ' + X.text(B().complementExpr(rhs).expr); return right === wrong ? [right, 'none of these'] : [right, wrong].sort(); }, ask: 'Which is the dual of this identity?', answer: (fr, i, inp) => { const { lhs, rhs } = X.identity(inp.law); const d = B().dualise(lhs, rhs); return X.text(d.dualLhs) + ' = ' + X.text(d.dualRhs); }, explain: 'The dual swaps the operators and the constants but leaves every variable as it is; complementing each variable as well would give the complement instead.' },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].mark === 'both checked', pick: 'option', options: ['It holds', 'It fails'], ask: 'Will the dual hold on every row?', answer: (fr, i) => (fr[i].meta.dual ? 'It holds' : 'It fails'), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'What is the dual of X + 0 = X?', options: ["X' + 1 = X'", 'X·1 = X', 'X·0 = 0', 'X + 1 = 1'], answer: 1, why: 'Swap + with · and 0 with 1; the variable stays.' },
      { q: 'What is the dual of X(Y + Z)?', options: ['X + YZ', "X'(Y' + Z')", 'XY + XZ', '(X + Y)Z'], answer: 0, why: 'The AND becomes an OR and the OR an AND; brackets keep the same grouping.' },
      { q: 'If an identity holds, its dual…', options: ['may fail', 'always holds', 'is its complement', 'has more literals'], answer: 1, why: 'Every axiom comes in a dual pair, so the dual of any proof is a proof of the dual.' },
      { q: 'Does dualising change complemented variables such as X′?', options: ['Yes, X′ becomes X', 'No, they stay as they are', 'They become 1', 'They become X + X′'], answer: 1, why: 'Only operators and constants swap. Complementing the variables too gives the complement of the function, a different thing.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // absorption and consensus: a term that is 1 only where another term is already 1
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'absorb-consensus', family: 'p2-algebra', order: 40, title: 'Absorption and consensus',
    blurb: 'A term can be dropped when, on every row where it is 1, some other term is 1 already. Absorption is the simple case; consensus is the subtle one, where the covering is shared between two other terms.',
    inputs: [{ id: 'f', kind: 'expr', label: 'Sum of products (or product of sums)', def: "XY + X'Z + YZ", check: X.check('Expression', 3) }],
    presets: [
      { label: "Consensus: XY + X'Z + YZ", values: { f: "XY + X'Z + YZ" } },
      { label: 'Absorption: X + XY', values: { f: 'X + XY' } },
      { label: "Consensus of four variables? AB + A'C + BC", values: { f: "AB + A'C + BC" } },
      { label: "Product of sums: (X + Y)(X' + Z)(Y + Z)", values: { f: "(X + Y)(X' + Z)(Y + Z)" } },
      { label: 'Absorption (dual): X(X + Y)', values: { f: 'X(X + Y)' } },
      { label: "Nothing to drop: XY + X'Z", values: { f: "XY + X'Z" } },
    ],
    counters: [{ id: 'rows', label: 'rows checked' }],
    check: (inp) => { const e = B().parse(inp.f); if (e.op !== 'or' && e.op !== 'and') return 'Expression: give a sum of terms (or a product of sums), so there is something to drop'; return null; },
    run(inp) {
      const e = B().parse(inp.f), pos = e.op === 'and', vars = B().vars(e), n = vars.length;
      const terms = e.args, tf = terms.map((t) => B().compile(t, vars)), ff = B().compile(e, vars);
      const want = pos ? 0 : 1;
      // which terms can go: the rest still give the same function
      const without = (i) => (terms.length === 2 ? terms[1 - i] : { op: e.op, args: terms.filter((_, j) => j !== i) });
      const red = terms.map((_, i) => B().prove(without(i), e).equal);
      // the last redundant term is the one to show (the consensus term is usually written last)
      const ri = red.lastIndexOf(true);
      const F = new S.Frames(['rows']);
      const colors = ['alt', 'good', ''];
      const box = {}; terms.forEach((_, i) => { box[String(i)] = i === ri ? 'hot' : colors[i % 3]; });
      const names = terms.map((t) => X.text(t));
      const done = new Set();
      const scene = (o) => {
        o = o || {};
        const ch = X.chips(e, { prefix: 'f', x: 0, y: 0, size: 24, box: o.nobox ? {} : box, lit: o.gone && ri >= 0 ? { [String(ri)]: 'gone' } : {} });
        const items = ch.items.slice();
        if (ri >= 0 && !o.nobox) { const b = ch.span(String(ri), 5); items.push({ key: 'tag', kind: 'head', x: b.x + b.w / 2, y: b.y + b.h + 2, text: o.gone ? 'redundant' : 'covered?', cls: o.gone ? 'good' : 'hot', side: 'below' }); }
        const tb = X.table({ vars, prefix: 'tt', x: 0, y: 110, rowH: 36, size: 18, hot: o.row, done: [...done], dim: o.dim,
          cols: terms.map((t, i) => ({ name: names[i], f: (env) => B().evaluate(t, env) })).concat([{ name: 'F', f: (env) => B().evaluate(e, env) }]),
          cls: (r, c) => { if (c < n || ri < 0) return ''; const ti = c - n; if (ti === ri && tf[ri](r) === want) return 'hot'; if (ti < terms.length && ti !== ri && tf[ri](r) === want && tf[ti](r) === want && done.has(r)) return 'good'; return ''; } });
        items.push(...tb.items);
        if (o.result) items.push(...X.chips(o.result, { prefix: 'res', x: 0, y: tb.box.y + tb.box.h + 30, size: 24, lit: { r: 'new' } }).items, { key: 'resl', kind: 'text', x: -14, y: tb.box.y + tb.box.h + 58, text: 'F =', anchor: 'end', cls: 'strong', size: 20 });
        return items;
      };
      F.add({ items: scene({ nobox: true }), say: 'F = ' + X.text(e) + ', ' + (pos ? 'a product of ' : 'a sum of ') + terms.length + ' terms. ' + (pos ? 'A sum term can be dropped if, wherever it is 0, another sum term is 0 already.' : 'A product term can be dropped if, wherever it is 1, another term is 1 already.'), meta: { start: true } });
      if (ri < 0) {
        F.add({ items: scene(), say: 'Try each term: none of them is covered by the others, so nothing can be dropped. ' + X.text(e) + ' is already irredundant.' });
        F.add({ items: scene({ result: e }), say: 'F stays ' + X.text(e) + '.' });
      } else {
        const rows = [...Array(1 << n).keys()].filter((m) => tf[ri](m) === want);
        F.add({ items: scene(), say: 'Look at ' + names[ri] + '. It is ' + want + ' on ' + rows.length + ' row' + (rows.length === 1 ? '' : 's') + ': ' + rows.map((m) => B().bits(m, n)).join(', ') + '. On each, is some other term ' + want + ' as well?' });
        for (const m of rows) {
          done.add(m); F.count('rows');
          const others = terms.map((_, j) => j).filter((j) => j !== ri && tf[j](m) === want);
          const env = X.env(m, vars);
          F.add({ items: scene({ row: m }), say: vName(vars, env) + ': ' + names[ri] + ' = ' + want + ', and so ' + (others.length === 1 ? 'is ' : 'are ') + others.map((j) => names[j]).join(' and ') + '. ' + names[ri] + ' adds nothing here.', meta: { row: m, cover: names[others[0]], options: names.filter((_, j) => j !== ri) } });
        }
        const r2 = without(ri);
        const shared = new Set(rows.map((m) => terms.findIndex((_, j) => j !== ri && tf[j](m) === want)));
        F.add({ items: scene({ gone: true }), say: 'On every row where ' + names[ri] + ' is ' + want + ', another term is too' + (shared.size > 1 ? ' — but not always the same one: the covering is shared between ' + [...shared].map((j) => names[j]).join(' and ') + '. That is consensus.' : ': ' + names[[...shared][0]] + ' alone covers it. That is absorption.'), mark: 'redundant' });
        F.add({ items: scene({ gone: true, result: r2 }), say: 'Drop it: F = ' + X.text(r2) + ', the same function with ' + B().literals(r2) + ' literals instead of ' + B().literals(e) + '.' });
      }
      const def = { sections: [{ id: 'l', kind: 'math', title: 'The laws', text: ['X + XY = X', 'X(X + Y) = X', "X + X′Y = X + Y", "XY + X′Z + YZ = XY + X′Z", "(X + Y)(X′ + Z)(Y + Z) = (X + Y)(X′ + Z)"].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.row !== undefined, once: true, pick: 'option', options: (fr, i) => fr[i + 1].meta.options, ask: (fr, i) => 'Next row: which other term covers this row too?', answer: (fr, i) => fr[i + 1].meta.cover, explain: (fr, i) => fr[i + 1].say },
      { at: (f) => f.meta && f.meta.start, once: true, pick: 'option', options: ['Yes', 'No'], ask: 'Can a term of F be dropped without changing it?', answer: (fr) => (fr.some((f) => f.mark === 'redundant') ? 'Yes' : 'No'), explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'What is the consensus term of AB and A′C?', options: ['AC', 'BC', "A'B", 'ABC'], answer: 1, why: 'Take the two terms that hold A and A′, drop A, and AND what is left: B·C.' },
      { q: 'X + XY = ?', options: ['X', 'XY', 'Y', 'X + Y'], answer: 0, why: 'Wherever XY = 1, X = 1 already.' },
      { q: 'Why is YZ redundant in XY + X′Z + YZ?', options: ['It never equals 1', 'Where YZ = 1, either X = 1 (so XY = 1) or X = 0 (so X′Z = 1)', 'It has fewer literals', 'It is the complement of XY'], answer: 1, why: 'The rows with Y = Z = 1 split on X, and each half is covered by one of the other terms.' },
      { q: 'What is the dual of the consensus theorem?', options: ["(X + Y)(X' + Z)(Y + Z) = (X + Y)(X' + Z)", "XY + X'Z = YZ", "(X + Y)(X' + Z) = XZ + X'Y", 'X(X + Y) = X'], answer: 0, why: 'Swap + and · throughout.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
