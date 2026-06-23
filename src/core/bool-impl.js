// From expressions to gates: cost measures, the two-level forms (AND-OR, NAND-NAND, OR-NAND, NOR-OR, OR-AND,
// NOR-NOR, NAND-AND, AND-NOR, with AOI and OAI), multi-level NAND-only and NOR-only conversion by bubble pushing
// (traced), static hazards read from the cover, dynamic hazards by path analysis, and the XOR side: parity and
// the Reed–Muller (ring-sum) form. Circuits are Netlist.Circuit objects.
(function (S) {
  'use strict';
  const B = S.Bool = S.Bool || {};
  const { V, C, NOT } = B;
  const P = (x) => B.P(x);
  const s = (x) => B.toString(x);

  // ---- cost ---------------------------------------------------------------------------------------------------------
  /**
   * cost(expr, {complements}) -> {literals, gates, gateInputs, inverters, levels, byType}
   * Each AND/OR/XOR with two or more inputs is a gate, and so is NOT over one (a NAND, NOR or XNOR). Equal
   * subterms are built once. Complemented inputs are free by default (counted in inverters but not in gates or
   * levels); with complements:false each one is an inverter gate and a level.
   */
  B.cost = (e, opts) => {
    e = P(e); opts = opts || {};
    const free = opts.complements !== false;
    const memo = new Map(), byType = {}, invs = new Set();
    let gates = 0, inputs = 0;
    const add = (t, n) => { gates++; inputs += n; byType[t] = (byType[t] || 0) + 1; };
    function lvl(x) {
      if (x.op === 'var' || x.op === 'const') return 0;
      if (x.op === 'not' && x.a.op === 'var') { invs.add(x.a.name); return free ? 0 : 1; }
      const kk = B.key(x);
      if (memo.has(kk)) return memo.get(kk);
      let r;
      if (x.op === 'not') {
        const a = x.a;
        if (a.op === 'and' || a.op === 'or' || a.op === 'xor') { r = 1 + Math.max(...a.args.map(lvl)); add({ and: 'NAND', or: 'NOR', xor: 'XNOR' }[a.op], a.args.length); }
        else { r = 1 + lvl(a); add('NOT', 1); }
      } else { r = 1 + Math.max(...x.args.map(lvl)); add(x.op.toUpperCase(), x.args.length); }
      memo.set(kk, r);
      return r;
    }
    const levels = lvl(e);
    if (!free) { for (const v of invs) add('NOT', 1); }
    return { literals: B.literals(e), gates, gateInputs: inputs, inverters: invs.size, levels, byType };
  };

  // ---- two-level forms -----------------------------------------------------------------------------------------------
  const FORMS = {
    'and-or': { from: 'sop', name: 'AND-OR', say: 'AND gates make the products and an OR gate adds them.' },
    'nand-nand': { from: 'sop', name: 'NAND-NAND', say: 'Put a bubble at each AND output and at each OR input: the bubbles cancel in pairs, the ANDs become NANDs and the OR with bubbled inputs is a NAND.' },
    'or-nand': { from: 'sop', name: 'OR-NAND', say: 'Each product XY is (X\' + Y\')\', so the first level becomes OR gates on complemented inputs and the second level a NAND.' },
    'nor-or': { from: 'sop', name: 'NOR-OR', say: 'Each product XY is (X\' + Y\')\', a NOR of complemented inputs; an OR gate adds them.' },
    'or-and': { from: 'pos', name: 'OR-AND', say: 'OR gates make the sums and an AND gate multiplies them.' },
    'nor-nor': { from: 'pos', name: 'NOR-NOR', say: 'Put a bubble at each OR output and at each AND input: the ORs become NORs and the AND with bubbled inputs is a NOR.' },
    'nand-and': { from: 'pos', name: 'NAND-AND', say: 'Each sum X + Y is (X\'Y\')\', a NAND of complemented inputs; an AND gate multiplies them.' },
    'and-nor': { from: 'pos', name: 'AND-NOR (AND-OR-INVERT)', say: 'F\' is the sum of the products of complemented inputs, one per sum term of F, so AND gates feed a NOR (an AOI gate).' },
  };
  B.twoLevelForms = Object.keys(FORMS).map((k) => ({ id: k, name: FORMS[k].name, from: FORMS[k].from }));
  const ALIAS = { aoi: 'and-nor', oai: 'or-nand' };
  const litsOf = (t, op) => (t.op === op ? t.args : [t]);
  const flip = (l) => (l.op === 'not' ? l.a : l.op === 'const' ? C(1 - l.v) : NOT(l));
  /** the expression of a form, given the minimal SOP (for SOP-type forms) or POS terms */
  function formExpr(style, min) {
    const pos = FORMS[style].from === 'pos';
    const terms = min.cover.map((t) => litsOf(t.expr, pos ? 'or' : 'and'));
    if (!terms.length || min.expr.op === 'const') return min.expr;
    const many = (op, xs) => (xs.length === 1 ? xs[0] : { op, args: xs });
    switch (style) {
      case 'and-or': return many('or', terms.map((ls) => many('and', ls)));
      case 'or-and': return many('and', terms.map((ls) => many('or', ls)));
      case 'nand-nand': return NOT({ op: 'and', args: terms.map((ls) => NOT(many('and', ls))) });
      case 'nor-nor': return NOT({ op: 'or', args: terms.map((ls) => NOT(many('or', ls))) });
      case 'or-nand': return NOT({ op: 'and', args: terms.map((ls) => many('or', ls.map(flip))) });
      case 'nor-or': return many('or', terms.map((ls) => NOT(many('or', ls.map(flip)))));
      case 'nand-and': return many('and', terms.map((ls) => NOT(many('and', ls.map(flip)))));
      case 'and-nor': return NOT({ op: 'or', args: terms.map((ls) => many('and', ls.map(flip))) });
    }
    throw new Error('unknown form ' + style);
  }
  /**
   * implement(fn | expression, style, {name, title}) -> {style, expr, text, circuit, cost, trace}
   * style: a two-level form ('and-or', 'nand-nand', 'or-nand', 'nor-or', 'or-and', 'nor-nor', 'nand-and', 'and-nor',
   * 'aoi', 'oai'), or 'nand' / 'nor' (multi-level conversion of the expression as written), or 'multi'.
   */
  B.implement = (x, style, opts) => {
    opts = opts || {};
    style = ALIAS[style] || style || 'and-or';
    const N = S.Netlist, name = opts.name || 'F', title = opts.title || name;
    if (style === 'nand' || style === 'nor') {
      const r = B.bubblePush(typeof x === 'string' || !x.ones ? P(x) : B.minimise(x).expr, style.toUpperCase());
      return Object.assign(r, { style, circuit: r.circuit(title, name) });
    }
    if (style === 'multi') {
      const e = x.ones ? B.minimise(x).expr : P(x);
      return { style, expr: e, text: s(e), circuit: openUnused(N.fromExpressions(title, { [name]: B.flatten(e) }, 'multi', x.ones ? { inputs: x.vars } : {})), cost: B.cost(e), trace: [{ kind: 'impl-multi', say: 'Build the expression as written, one gate per operator.' }] };
    }
    if (!FORMS[style]) throw new Error('unknown style ' + style);
    const fn = B.asFn(x);
    const pos = FORMS[style].from === 'pos';
    const min = B.minimise(fn, { form: pos ? 'pos' : 'sop' });
    const trace = [{ kind: 'impl-min', say: 'Start from the minimal ' + (pos ? 'product of sums' : 'sum of products') + ': F = ' + min.text + '.' }];
    const expr = formExpr(style, min);
    trace.push({ kind: 'impl-form', style, say: FORMS[style].say + ' F = ' + s(expr) + '.' });
    const native = { 'and-or': 1, 'nand-nand': 1, 'or-and': 1, 'nor-nor': 1 }[style];
    const circuit = native ? N.fromExpressions(title, { [name]: B.flatten(min.expr) }, style, { inputs: fn.vars }) : N.fromExpressions(title, { [name]: expr }, 'multi', { inputs: fn.vars });
    openUnused(circuit);
    const cost = B.cost(expr);
    trace.push({ kind: 'impl-cost', cost, say: cost.gates + ' gate' + (cost.gates === 1 ? '' : 's') + ', ' + cost.gateInputs + ' gate inputs, ' + cost.levels + ' level' + (cost.levels === 1 ? '' : 's') + '.' });
    return { style, expr, text: s(expr), circuit, cost, minimal: min, trace };
  };

  /** inputs the expression does not use are left open on purpose (the function still has them as variables) */
  const openUnused = (c) => { for (const p of c.parts) if (p.type === 'IN' && !p.net.y) c.leaveOpen(p.pin('y')); return c; };

  // ---- bubble pushing ---------------------------------------------------------------------------------------------------
  /**
   * Multi-level conversion to NAND-only (T = 'NAND') or NOR-only (T = 'NOR'), traced:
   *  1. complements are pushed down to the inputs (De Morgan), XOR written as a sum of products;
   *  2. every AND becomes T drawn as AND-with-output-bubble (for NAND), every OR becomes T drawn as OR with
   *     bubbled inputs (and the reverse for NOR);
   *  3. each line whose bubbles do not pair up gets an inverter, or the input is complemented.
   * -> {expr, text, struct, trace, cost, circuit(title, name)}
   */
  B.bubblePush = (e, T, opts) => {
    e = P(e); T = T || 'NAND'; opts = opts || {};
    const trace = [];
    const base = T === 'NAND' ? 'and' : 'or', other = base === 'and' ? 'or' : 'and';
    const noXor = (x) => {
      if (x.op === 'xor') { let acc = noXor(x.args[0]); for (const y of x.args.slice(1)) { const b = noXor(y); acc = { op: 'or', args: [{ op: 'and', args: [acc, NOT(b)] }, { op: 'and', args: [NOT(acc), b] }] }; } return acc; }
      if (x.op === 'not') return NOT(noXor(x.a));
      if (x.args) return { op: x.op, args: x.args.map(noXor) };
      return x;
    };
    const hadXor = B.paths(e).some((p) => p.node.op === 'xor');
    let f = noXor(e);
    if (hadXor) trace.push({ kind: 'bp-xor', say: "Write each XOR as XY' + X'Y first, so only AND, OR and NOT remain: " + s(f) + '.' });
    // push complements to the inputs
    const push = (x, neg) => {
      if (x.op === 'var') return neg ? NOT(V(x.name)) : V(x.name);
      if (x.op === 'const') return C(neg ? 1 - x.v : x.v);
      if (x.op === 'not') return push(x.a, !neg);
      const op = neg ? (x.op === 'and' ? 'or' : 'and') : x.op;
      return B.flat(op, x.args.map((y) => push(y, neg)));
    };
    const g = push(f, false);
    if (B.key(g) !== B.key(B.flatten(f))) trace.push({ kind: 'bp-demorgan', say: 'Push every complement down to the inputs with De Morgan\'s law: ' + s(g) + '.' });
    trace.push({ kind: 'bp-start', expr: g, say: 'Draw the AND-OR circuit of ' + s(g) + ', then turn every gate into a ' + T + '.' });
    // convert
    let inverters = 0, flips = 0, gateNo = 0;
    const ob = (x) => (x.op === base ? 1 : 0);
    function conv(x, path) {
      if (x.op === 'var' || x.op === 'const' || (x.op === 'not' && x.a.op === 'var')) return { kind: 'lit', node: x };
      const id = ++gateNo;
      const isBase = x.op === base;
      trace.push({ kind: 'bp-gate', path, gate: id, from: x.op.toUpperCase(), to: T, drawn: isBase ? x.op.toUpperCase() + ' with a bubble on its output' : x.op.toUpperCase() + ' with bubbles on its inputs',
        say: 'The ' + x.op.toUpperCase() + ' gate for ' + s(x) + ' becomes a ' + T + ', drawn as ' + (isBase ? 'an ' + x.op.toUpperCase() + ' with a bubble on its output.' : 'an ' + x.op.toUpperCase() + ' with bubbles on its inputs (the same gate, by De Morgan).') });
      const ins = x.args.map((c, i) => {
        const sc = conv(c, path.concat(i));
        const needInv = isBase ? 0 : 1; // the line must carry the complement when it enters a bubbled input
        if (sc.kind === 'lit') {
          if (needInv) {
            flips++;
            const nl = c.op === 'not' ? c.a : c.op === 'const' ? C(1 - c.v) : NOT(c);
            trace.push({ kind: 'bp-input', path: path.concat(i), from: c, to: nl, say: 'Input ' + s(c) + ' meets a bubble with none to cancel it: feed ' + s(nl) + ' instead.' });
            return { kind: 'lit', node: nl };
          }
          return sc;
        }
        const have = ob(c);
        if (have === needInv) { trace.push({ kind: 'bp-cancel', path: path.concat(i), say: have ? 'On the line from ' + s(c) + ' the two bubbles cancel.' : 'The line from ' + s(c) + ' has no bubble at either end: it stays as it is.' }); return sc; }
        inverters++;
        trace.push({ kind: 'bp-inverter', path: path.concat(i), say: 'The line from ' + s(c) + ' has ' + (have ? 'a bubble at its output but none at the input it feeds' : 'a bubble at the input it feeds but none at its source') + ': add an inverter.' });
        return { kind: 'inv', in: sc };
      });
      return { kind: 'gate', type: T, ins, op: x.op };
    }
    let root = conv(g, []);
    if (root.kind === 'gate' && ob(g)) { inverters++; trace.push({ kind: 'bp-output', say: 'The output gate has a bubble that nothing cancels: add an inverter at the output.' }); root = { kind: 'inv', in: root }; }
    const gop = T === 'NAND' ? 'and' : 'or';
    const toExpr = (st) => (st.kind === 'lit' ? st.node : st.kind === 'inv' ? NOT(toExpr(st.in)) : NOT({ op: gop, args: st.ins.map(toExpr) }));
    const out = toExpr(root);
    const gates = (function cnt(st) { return st.kind === 'gate' ? 1 + st.ins.reduce((a, b) => a + cnt(b), 0) : st.kind === 'inv' ? 1 + cnt(st.in) : 0; })(root);
    trace.push({ kind: 'bp-done', expr: out, say: 'Done: ' + gates + ' gate' + (gates === 1 ? '' : 's') + ' in all, ' + inverters + ' of them inverter' + (inverters === 1 ? '' : 's') + ' (a ' + T + ' with its inputs tied)' + (flips ? ', and ' + flips + ' complemented input' + (flips === 1 ? '' : 's') : '') + '.' });
    // a circuit of T gates only: inverters as T with tied inputs (or NOT gates with opts.notGates), complemented inputs likewise
    const circuit = (title, name) => {
      const N = S.Netlist, c = new N.Circuit(title || 'F');
      const vs = B.vars(out), inp = {};
      for (const v of vs) inp[v] = c.input(v);
      const memo = new Map();
      const inv = (src, k) => {
        if (memo.has('inv:' + k)) return memo.get('inv:' + k);
        let y;
        if (opts.notGates) { const gt = c.gate('NOT'); c.connect(src, gt.pin('i0')); y = gt.pin('y'); }
        else { const gt = c.gate(T, 2); c.connect(src, gt.pin('i0'), gt.pin('i1')); y = gt.pin('y'); }
        memo.set('inv:' + k, y); return y;
      };
      const consts = {};
      function sig(st) {
        if (st.kind === 'lit') {
          const nd = st.node;
          if (nd.op === 'var') return inp[nd.name].pin('y');
          if (nd.op === 'const') { if (!consts[nd.v]) consts[nd.v] = c.constant(nd.v).pin('y'); return consts[nd.v]; }
          return inv(inp[nd.a.name].pin('y'), nd.a.name);
        }
        const kk = B.skey(toExpr(st));
        if (st.kind === 'inv') return inv(sig(st.in), kk);
        if (memo.has(kk)) return memo.get(kk);
        const ins = st.ins.map(sig);
        const gt = c.gate(T, ins.length);
        ins.forEach((q, i) => c.connect(q, gt.pin('i' + i)));
        memo.set(kk, gt.pin('y'));
        return gt.pin('y');
      }
      const y = sig(root);
      c.connect(y, c.output(name || 'F').pin('a'));
      return c;
    };
    return { expr: out, text: s(out), struct: root, trace, gates, inverters, cost: B.cost(out), circuit };
  };

  // ---- static hazards in two-level forms ---------------------------------------------------------------------------------
  /**
   * staticHazards(fn, terms, form): terms are cubes (or term records, or an SOP/POS expression to read). For SOP,
   * a static-1 hazard is a pair of adjacent 1s that no single term covers; for POS, a static-0 hazard is a pair of
   * adjacent 0s that no single sum term covers. Each comes with the consensus term that removes it.
   * -> {hazards:[{from, to, var, kind, terms:[a, b], fix}], trace}
   */
  B.staticHazards = (x, cover, form) => {
    form = form || 'sop';
    const pos = form === 'pos';
    let fn, cubes;
    if (cover == null) {
      const e = P(x); fn = B.fromExpr(e);
      cubes = (e.op === (pos ? 'and' : 'or') ? e.args : [e]).map((t) => B.termCube(t, fn.vars, form)).filter((c) => c && c !== 'empty');
      if (cubes.length !== (e.op === (pos ? 'and' : 'or') ? e.args.length : 1) && !(e.op === 'const')) throw new Error('expected a ' + (pos ? 'product of sums' : 'sum of products'));
    } else {
      fn = B.asFn(x);
      cubes = cover.map((t) => (t.cube ? t.cube : typeof t === 'string' ? B.cubeFromStr(t) : t.mask != null ? t : B.termCube(t, fn.vars, form)));
    }
    const n = fn.vars.length, vs = fn.vars, trace = [], hazards = [];
    const val = pos ? 0 : 1;
    const isT = (m) => B.value(fn, m) === val;
    const name = (c) => B.toString(pos ? B.cubeSum(c, vs) : B.cubeProduct(c, vs));
    for (let m = 0; m < 1 << n; m++) {
      if (!isT(m)) continue;
      for (let i = 0; i < n; i++) {
        const b = 1 << (n - 1 - i), m2 = m ^ b;
        if (m2 < m || !isT(m2)) continue;
        if (cubes.some((c) => B.covers(c, m) && B.covers(c, m2))) continue;
        const a = cubes.find((c) => B.covers(c, m)), bb = cubes.find((c) => B.covers(c, m2));
        const fix = B.spanCube([m, m2], n);
        // the consensus of the two covering terms is the largest such fix
        let cons = null;
        if (a && bb) { const mask = (a.mask | bb.mask) & ~b, bits = (a.bits | bb.bits) & mask; if (((a.bits ^ bb.bits) & a.mask & bb.mask & ~b) === 0) cons = B.cube(n, mask, bits); }
        const f = cons || fix;
        const hz = { from: m, to: m2, var: vs[i], kind: pos ? 'static-0' : 'static-1', terms: [a && name(a), bb && name(bb)], fix: { cube: f, text: name(f) } };
        hazards.push(hz);
        trace.push({ kind: 'hazard', from: m, to: m2, var: vs[i],
          say: 'Static-' + val + ' hazard: going between ' + B.bits(m, n) + ' and ' + B.bits(m2, n) + ' (' + vs[i] + ' changes) the output should stay ' + val + ', but ' + (a && bb ? name(a) + ' and ' + name(bb) + ' are different terms' : 'no one term holds both') + ', so for a moment neither may hold it. The consensus term ' + name(f) + ' bridges the gap.' });
      }
    }
    if (!hazards.length) trace.push({ kind: 'no-hazard', say: 'No static-' + val + ' hazard: every pair of adjacent ' + val + 's lies inside one term.' });
    return { hazards, trace };
  };
  /** the cheapest SOP (or POS) in which every pair of adjacent 1s (0s) shares a term: no static hazards */
  B.hazardFree = (fn, form) => {
    fn = B.asFn(fn); form = form || 'sop';
    const pos = form === 'pos', n = fn.vars.length, val = pos ? 0 : 1;
    const primes = B.mapPrimes(fn, form).map((c) => B.term(c, fn.vars, form));
    const on = B._target(fn, form).on;
    const cols = on.map((m) => [m]);
    for (const m of on) for (let i = 0; i < n; i++) { const m2 = m ^ (1 << i); if (m2 > m && B.value(fn, m2) === val) cols.push([m, m2]); }
    const ids = cols.map((c, i) => i);
    const rows = primes.map((p) => ({ cover: ids.filter((i) => cols[i].every((m) => B.covers(p.cube, m))), lits: p.lits }));
    const r = B.exactCover(ids, rows);
    const cover = (r.chosen || []).map((i) => primes[i]);
    const plain = B.minimise(fn, { form });
    const extra = cover.filter((t) => !plain.cover.some((u) => B.cubeKey(u.cube) === B.cubeKey(t.cube)));
    const trace = plain.trace.slice(-1).concat([{ kind: 'hazard-free', say: 'To remove every static hazard, each pair of adjacent ' + val + 's must share a term as well as each single ' + val + '. ' + (extra.length ? 'That adds ' + extra.map((t) => t.text).join(', ') + '.' : 'The minimal cover already does this.') }]);
    const res = B._result(fn, form, 'hazard-free', cover, primes, [], trace);
    res.added = extra;
    return res;
  };

  // ---- path analysis -------------------------------------------------------------------------------------------------------
  /**
   * Hazards of a multi-level expression (or a Netlist circuit, unfolded into a tree per output) when one input
   * changes. Each occurrence of the changing input is one path to the output; with arbitrary path delays the
   * occurrences switch in any order. A static hazard is an order that makes the output change and change back;
   * a dynamic hazard is an order that makes it change three or more times instead of once.
   * -> {hazards:[{var, from, to, kind, order:[paths], sequence:[values]}], trace}
   */
  B.pathHazards = (x, opts) => {
    opts = opts || {};
    let e = x instanceof S.Netlist.Circuit ? B.circuitExpr(x, opts.output) : P(x);
    const vs = opts.vars || B.vars(e), n = vs.length, hazards = [], trace = [];
    const maxPaths = opts.maxPaths || 12;
    // number the occurrences of each variable
    const occ = {};
    for (const { path, node } of B.paths(e)) if (node.op === 'var') (occ[node.name] = occ[node.name] || []).push(path);
    const evalWith = (env, v, switched, to) => {
      // value with occurrences of v in `switched` (a Set of indexes) at `to`, the rest at 1 - to
      let idx = 0;
      const go = (y) => {
        switch (y.op) {
          case 'var': if (y.name === v) { const r = switched.has(idx++) ? to : 1 - to; return r; } return env[y.name];
          case 'const': return y.v;
          case 'not': return 1 - go(y.a);
          case 'and': { let r = 1; for (const a of y.args) if (!go(a)) r = 0; return r; }
          case 'or': { let r = 0; for (const a of y.args) if (go(a)) r = 1; return r; }
          case 'xor': return y.args.reduce((acc, a) => acc ^ go(a), 0);
        }
        return 0;
      };
      return go(e);
    };
    for (let vi = 0; vi < n; vi++) {
      const v = vs[vi], paths = occ[v] || [];
      if (paths.length < 2) continue;
      if (paths.length > maxPaths) { trace.push({ kind: 'too-many-paths', var: v, say: v + ' reaches the output along ' + paths.length + ' paths; that is too many to try every order.' }); continue; }
      const k = paths.length, K = 1 << k, bit = 1 << (n - 1 - vi);
      for (let m = 0; m < 1 << n; m++) {
        if (m & bit) continue;
        for (const dir of [0, 1]) {
          const from = dir ? m | bit : m, to = dir ? m : m | bit, env = B.env(from, vs), tv = (to & bit) ? 1 : 0;
          // the output for every set of switched paths; the worst order is the longest chain of changes
          const val = new Array(K), most = new Array(K).fill(0), prev = new Array(K).fill(-1);
          for (let sw = 0; sw < K; sw++) val[sw] = evalWith(env, v, new Set([...Array(k).keys()].filter((i) => (sw >> i) & 1)), tv);
          const order = [...Array(K).keys()].sort((a, b) => B.popcount(a) - B.popcount(b));
          for (const sw of order) for (let i = 0; i < k; i++) if ((sw >> i) & 1) {
            const p = sw ^ (1 << i), c = most[p] + (val[p] !== val[sw] ? 1 : 0);
            if (prev[sw] < 0 || c > most[sw]) { most[sw] = c; prev[sw] = i; }
          }
          const start = val[0], end = val[K - 1], changes = most[K - 1];
          if (start === end ? changes >= 2 : changes >= 3) {
            const ord = [], seq = [];
            for (let sw = K - 1; sw; sw ^= 1 << prev[sw]) { ord.unshift(prev[sw]); seq.unshift(val[sw]); }
            seq.unshift(start);
            const sq = seq.filter((x, i) => i === 0 || x !== seq[i - 1]);
            const kind = start === end ? 'static-' + start : 'dynamic';
            const hz = { var: v, from, to, kind, order: ord.map((i) => paths[i]), sequence: sq };
            hazards.push(hz);
            trace.push({ kind: 'path-hazard', hazard: hz, say: (kind === 'dynamic' ? 'Dynamic hazard' : 'Static-' + start + ' hazard') + ' when ' + v + ' goes ' + (1 - tv) + '→' + tv + ' with ' + vs.filter((w) => w !== v).map((w) => w + ' = ' + env[w]).join(', ') + ': if the ' + k + ' paths from ' + v + ' arrive in a bad order the output can go ' + sq.join('→') + '.' });
          }
        }
      }
    }
    if (!hazards.length) trace.push({ kind: 'no-hazard', say: 'No order of path delays makes the output glitch for any single input change.' });
    return { hazards, trace, expr: e };
  };
  /** unfold a combinational Netlist circuit into an expression tree for one output (every path becomes a leaf) */
  B.circuitExpr = (c, outName) => {
    const out = c.parts.find((p) => p.type === 'OUT' && (!outName || p.params.name === outName));
    if (!out) throw new Error('no output ' + (outName || ''));
    const driver = (net) => { const r = net.pins.find((q) => q.part.pins.find((x) => x.name === q.pin).dir === 'out'); return r; };
    function sig(net, depth) {
      if (depth > 200) throw new Error('the circuit has a loop');
      const d = driver(net), p = d.part;
      const ins = () => p.pins.filter((q) => q.dir === 'in').map((q) => sig(p.net[q.name], depth + 1));
      switch (p.type) {
        case 'IN': return V(p.params.name);
        case 'CONST': return C(p.params.value);
        case 'BUF': return ins()[0];
        case 'NOT': return NOT(ins()[0]);
        case 'AND': return { op: 'and', args: ins() };
        case 'OR': return { op: 'or', args: ins() };
        case 'XOR': return { op: 'xor', args: ins() };
        case 'NAND': return NOT({ op: 'and', args: ins() });
        case 'NOR': return NOT({ op: 'or', args: ins() });
        case 'XNOR': return NOT({ op: 'xor', args: ins() });
      }
      throw new Error('part ' + p.type + ' is not a plain gate');
    }
    return sig(out.net.a, 0);
  };

  // ---- XOR, parity, Reed–Muller ---------------------------------------------------------------------------------------------
  /** the n-input odd function (1 for an odd number of 1s), or the even function with kind 'even' */
  B.parity = (vs, kind) => {
    vs = B.nameVars(vs);
    const e = vs.length === 1 ? V(vs[0]) : { op: 'xor', args: vs.map(V) };
    return kind === 'even' ? NOT(e) : e;
  };
  /** the parity bit that makes the total number of 1s even (or odd), traced */
  B.parityBit = (bits, kind) => {
    const b = String(bits).replace(/\s+/g, '').split('').map(Number);
    const ones = b.filter((x) => x).length;
    const p = kind === 'odd' ? 1 - (ones % 2) : ones % 2;
    return { bit: p, ones, say: b.join('') + ' has ' + ones + ' one' + (ones === 1 ? '' : 's') + '; for ' + (kind === 'odd' ? 'odd' : 'even') + ' parity the parity bit is ' + p + ', so ' + (b.join('') + p) + ' is sent.' };
  };
  /** check a received word including its parity bit */
  B.parityCheck = (bits, kind) => {
    const b = String(bits).replace(/\s+/g, '').split('').map(Number), ones = b.filter((x) => x).length;
    const ok = kind === 'odd' ? ones % 2 === 1 : ones % 2 === 0;
    return { ok, ones, say: b.join('') + ' has ' + ones + ' one' + (ones === 1 ? '' : 's') + ': ' + (ok ? 'parity checks.' : 'parity error — an odd number of bits changed.') };
  };
  /** a balanced XOR tree over the inputs, for a parity generator with fewest levels */
  B.parityTree = (vs, kind) => {
    vs = B.nameVars(vs);
    let layer = vs.map(V);
    while (layer.length > 1) { const next = []; for (let i = 0; i < layer.length; i += 2) next.push(i + 1 < layer.length ? { op: 'xor', args: [layer[i], layer[i + 1]] } : layer[i]); layer = next; }
    return kind === 'even' ? NOT(layer[0]) : layer[0];
  };
  /**
   * Reed–Muller (ring-sum) form: F as an XOR of products, positive polarity by default (opts.polarity: an array of
   * 0/1 per variable, 1 meaning that variable appears complemented). Don't-cares are taken as 0.
   * Traced as the butterfly: one stage per variable. -> {expr, text, terms:[mask], coeffs, trace}
   */
  B.reedMuller = (fn, opts) => {
    opts = opts || {};
    fn = B.asFn(fn);
    const n = fn.vars.length, N = 1 << n, vs = fn.vars;
    const pol = opts.polarity || vs.map(() => 0);
    const pmask = pol.reduce((acc, p, i) => acc | (p ? 1 << (n - 1 - i) : 0), 0);
    const a = [];
    for (let m = 0; m < N; m++) a.push(fn.ones.has(m ^ pmask) ? 1 : 0);
    const trace = [{ kind: 'rm-start', values: a.slice(), say: 'Start from the output column' + (pmask ? ' (with ' + vs.filter((_, i) => pol[i]).join(', ') + ' complemented)' : '') + ': ' + a.join('') + '.' }];
    for (let i = 0; i < n; i++) {
      const b = 1 << (n - 1 - i);
      for (let m = 0; m < N; m++) if (m & b) a[m] ^= a[m ^ b];
      trace.push({ kind: 'rm-stage', var: vs[i], values: a.slice(), say: 'Stage ' + vs[i] + ': in each pair of rows that differ only in ' + vs[i] + ', XOR the ' + vs[i] + ' = 0 value into the ' + vs[i] + ' = 1 row: ' + a.join('') + '.' });
    }
    const terms = [];
    for (let m = 0; m < N; m++) if (a[m]) terms.push(m);
    const lit = (i) => (pol[i] ? NOT(V(vs[i])) : V(vs[i]));
    const mono = (m) => { const ls = []; for (let i = 0; i < n; i++) if (m & (1 << (n - 1 - i))) ls.push(lit(i)); return B.AND(ls); };
    terms.sort((x, y) => B.popcount(x) - B.popcount(y) || y - x);
    const expr = terms.length === 0 ? C(0) : terms.length === 1 ? mono(terms[0]) : { op: 'xor', args: terms.map(mono) };
    const text = s(expr);
    trace.push({ kind: 'rm-done', say: 'Each 1 left marks a product in the XOR sum: F = ' + text + '.' });
    return { expr, text, terms, coeffs: a, trace };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
