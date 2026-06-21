// Karnaugh maps for 1 to 6 variables: the geometry in Gray order (5 variables as two 4-variable maps, or one
// mirrored map; 6 variables as four maps in a 2×2 grid), adjacency across the edges and between maps, groups as
// rectangles that may wrap, minimising by map (essential cells first), checking a student's group and a
// student's whole cover, maps for several outputs with shared terms, and map-entered variables.
(function (S) {
  'use strict';
  const B = S.Bool = S.Bool || {};
  const gray = (k) => { const out = []; for (let i = 0; i < 1 << k; i++) out.push(i ^ (i >> 1)); return out; };
  B.grayCodes = gray;

  /**
   * kmap(fn | expression, {layout:'maps'|'mirror', cover:[cube|term], form}) -> geometry:
   *   {n, vars, mapVars, rowVars, colVars, rowCodes, colCodes, maps:[{i, code, fixed, label, mr, mc}],
   *    cells:[{m, map, r, c, gr, gc, bits, value}], rows, cols, cellOf(m), groups?}
   * r, c are inside one map; gr, gc place the cell on one grid with a one-cell gap between maps.
   */
  function kmap(fn, opts) {
    opts = opts || {};
    fn = B.asFn(fn);
    const n = fn.vars.length, vs = fn.vars;
    if (n < 1 || n > 6) throw new Error('K-maps here take 1 to 6 variables');
    let mk, rk, ck;
    if (n === 5 && opts.layout === 'mirror') { mk = 0; rk = 2; ck = 3; }
    else [mk, rk, ck] = [null, [0, 0, 1], [0, 1, 1], [0, 1, 2], [0, 2, 2], [1, 2, 2], [2, 2, 2]][n];
    const g = {
      n, vars: vs.slice(), layout: n === 5 ? (opts.layout === 'mirror' ? 'mirror' : 'maps') : 'single',
      mapVars: vs.slice(0, mk), rowVars: vs.slice(mk, mk + rk), colVars: vs.slice(mk + rk),
      rowCodes: gray(rk), colCodes: gray(ck), rows: 1 << rk, cols: 1 << ck, maps: [], cells: [],
    };
    // maps: one variable side by side; two variables in a 2×2 grid, A down and B across, so neighbours differ by one bit
    for (let code = 0; code < 1 << mk; code++) {
      const fixed = Object.fromEntries(g.mapVars.map((v, i) => [v, (code >> (mk - 1 - i)) & 1]));
      const mr = mk === 2 ? (code >> 1) & 1 : 0, mc = mk === 2 ? code & 1 : code;
      g.maps.push({ i: code, code, fixed, label: g.mapVars.length ? g.mapVars.map((v) => v + ' = ' + fixed[v]).join(', ') : '', mr, mc });
    }
    const index = new Map();
    for (const mp of g.maps) for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const m = (mp.code << (rk + ck)) | (g.rowCodes[r] << ck) | g.colCodes[c];
      const cell = { m, map: mp.i, r, c, gr: mp.mr * (g.rows + 1) + r, gc: mp.mc * (g.cols + 1) + c, bits: B.bits(m, n), value: B.value(fn, m) };
      index.set(m, g.cells.length); g.cells.push(cell);
    }
    g.rowLabels = g.rowCodes.map((x) => B.bits(x, rk));
    g.colLabels = g.colCodes.map((x) => B.bits(x, ck));
    g.cellOf = (m) => g.cells[index.get(m)];
    g.fn = fn;
    if (opts.cover) g.groups = opts.cover.map((t) => group(g, t.cube || t, opts.form));
    return g;
  }
  B.kmap = kmap;

  /** cyclic runs of a set of positions on a ring of length L: [{start, len, wraps}] */
  function runs(set, L) {
    if (set.length === L) return [{ start: 0, len: L, wraps: false }];
    const has = new Set(set), out = [];
    for (const i of set) {
      if (has.has((i - 1 + L) % L)) continue;
      let len = 1;
      while (has.has((i + len) % L)) len++;
      out.push({ start: i, len, wraps: i + len > L });
    }
    return out;
  }
  /**
   * the rectangles of a cube on the map: {cube, str, cells, pieces:[{map, r, c, h, w}], wrapRows, wrapCols,
   * maps, spansMaps}. A run that wraps round an edge is split into two pieces, one at each edge.
   */
  function group(g, c, form) {
    const cells = B.cubeMinterms(c).map((m) => g.cellOf(m));
    const pieces = [];
    let wrapRows = false, wrapCols = false;
    const maps = [...new Set(cells.map((x) => x.map))].sort((a, b) => a - b);
    for (const mi of maps) {
      const here = cells.filter((x) => x.map === mi);
      const rs = runs([...new Set(here.map((x) => x.r))].sort((a, b) => a - b), g.rows);
      const cs = runs([...new Set(here.map((x) => x.c))].sort((a, b) => a - b), g.cols);
      const split = (run, L) => (run.wraps ? [{ s: run.start, len: L - run.start }, { s: 0, len: run.start + run.len - L }] : [{ s: run.start, len: run.len }]);
      for (const rr of rs) for (const cc of cs) {
        if (rr.wraps) wrapRows = true;
        if (cc.wraps) wrapCols = true;
        for (const a of split(rr, g.rows)) for (const b of split(cc, g.cols)) pieces.push({ map: mi, r: a.s, c: b.s, h: a.len, w: b.len });
      }
    }
    const t = B.term(c, g.vars, form || 'sop');
    return { cube: c, str: t.str, text: t.text, cells: cells.map((x) => x.m).sort((a, b) => a - b), pieces, wrapRows, wrapCols, maps, spansMaps: maps.length > 1 };
  }
  B.kmapGroup = (g, c, form) => group(g, typeof c === 'string' ? B.cubeFromStr(c) : c, form);

  /** the neighbours of a cell: [{m, var, how:'side'|'wrap'|'between-maps'|'mirror'}] */
  B.kmapNeighbours = (g, m) => {
    const a = g.cellOf(m), out = [];
    for (let i = 0; i < g.n; i++) {
      const m2 = m ^ (1 << (g.n - 1 - i)), b = g.cellOf(m2);
      let how;
      if (a.map !== b.map) how = 'between-maps';
      else {
        const dr = Math.abs(a.r - b.r), dc = Math.abs(a.c - b.c);
        if (dr + dc === 1) how = 'side';
        else if ((dr === 0 && dc === g.cols - 1) || (dc === 0 && dr === g.rows - 1)) how = 'wrap';
        else how = 'mirror';
      }
      out.push({ m: m2, var: g.vars[i], how });
    }
    return out;
  };

  // ---- primes straight from the map --------------------------------------------------------------------------------
  /** every prime implicant, found by growing cubes over 1s and don't-cares (no tabulation) */
  function mapPrimes(fn, form) {
    const n = fn.vars.length, full = (1 << n) - 1;
    const ok = new Set(form === 'pos' ? B.zeros(fn).concat([...fn.dc]) : [...fn.ones, ...fn.dc]);
    const valid = new Map();
    const isValid = (mask, bits) => {
      const k = mask + ':' + bits;
      if (valid.has(k)) return valid.get(k);
      let v = true;
      const free = full & ~mask;
      for (let s = free; ; s = (s - 1) & free) { if (!ok.has(bits | s)) { v = false; break; } if (!s) break; }
      valid.set(k, v);
      return v;
    };
    const out = [];
    for (let mask = 0; mask <= full; mask++) {
      for (let bits = mask; ; bits = (bits - 1) & mask) {
        if (isValid(mask, bits)) {
          let prime = true;
          for (let i = 0; i < n && prime; i++) { const b = 1 << i; if (mask & b && isValid(mask & ~b, bits & ~b)) prime = false; }
          if (prime) out.push(B.cube(n, mask, bits));
        }
        if (!bits) break;
      }
    }
    return out;
  }
  B.mapPrimes = mapPrimes;

  /** minimise by map: prime groups, essential cells, then the cheapest completion. Same result shape as minimise */
  B.kmapSolve = (fn, form) => {
    fn = B.asFn(fn);
    form = form || 'sop';
    const pos = form === 'pos', vs = fn.vars, trace = [];
    const g = kmap(fn);
    const { on } = B._target(fn, form);
    const what = pos ? '0' : '1';
    trace.push({ kind: 'kmap-cells', on, dc: B.dontCares(fn), say: 'Mark the ' + what + 's on the map' + (fn.dc.size ? ' and the don\'t-cares (X), which may join a group if that helps.' : '.') });
    if (!on.length) { trace.push({ kind: 'trivial', say: pos ? 'There are no 0s: F = 1.' : 'There are no 1s: F = 0.' }); return Object.assign(B._result(fn, form, 'kmap', [], [], [], trace), { geometry: g, groups: [] }); }
    const dcs = new Set(fn.dc);
    const primes = mapPrimes(fn, form).map((c) => Object.assign(B.term(c, vs, form), { dcOnly: B.cubeMinterms(c).every((m) => dcs.has(m)) }))
      .sort((a, b) => a.lits - b.lits || b.cube.mask - a.cube.mask || a.cube.bits - b.cube.bits);
    primes.forEach((p, i) => { p.label = 'G' + (i + 1); p.group = group(g, p.cube, form); });
    trace.push({ kind: 'kmap-primes', groups: primes.map((p) => ({ label: p.label, text: p.text, group: p.group, dcOnly: p.dcOnly })),
      say: 'The largest groups (prime implicants): ' + primes.filter((p) => !p.dcOnly).map((p) => p.text + ' (' + p.group.cells.length + ' cells)').join(', ') + '. Each is a block of 1, 2, 4, … cells that cannot be doubled.' });
    const useful = primes.filter((p) => !p.dcOnly);
    let left = on.slice();
    const cover = [], essentials = [];
    for (const m of on) {
      const hits = useful.filter((p) => B.covers(p.cube, m));
      if (hits.length === 1 && !cover.includes(hits[0])) {
        const p = hits[0];
        cover.push(p); essentials.push(p);
        trace.push({ kind: 'kmap-essential', cell: m, group: p.label, text: p.text, cells: p.group.cells,
          say: 'Cell ' + m + ' (' + B.bits(m, vs.length) + ') lies in only one group, ' + p.text + ', so that group is essential.' });
        left = left.filter((x) => !B.covers(p.cube, x));
      }
    }
    if (left.length) {
      const rest = useful.filter((p) => !cover.includes(p) && p.minterms.some((m) => left.includes(m)));
      trace.push({ kind: 'kmap-left', cells: left.slice(), candidates: rest.map((p) => p.label), say: 'Still uncovered: cell' + (left.length === 1 ? ' ' : 's ') + left.join(', ') + '. The groups that can reach them: ' + rest.map((p) => p.text).join(', ') + '.' });
      const r = B.exactCover(left, rest.map((p) => ({ cover: p.minterms, lits: p.lits })));
      const pick = r.chosen.map((i) => rest[i]);
      for (const p of pick) {
        cover.push(p);
        trace.push({ kind: 'kmap-choose', group: p.label, text: p.text, cells: p.group.cells.filter((m) => left.includes(m)), say: 'Take ' + p.text + ' for cell' + (p.minterms.filter((m) => left.includes(m)).length === 1 ? ' ' : 's ') + p.minterms.filter((m) => left.includes(m)).join(', ') + '.' });
      }
      if (rest.length > pick.length) trace.push({ kind: 'kmap-skip', groups: rest.filter((p) => !pick.includes(p)).map((p) => p.text), say: 'The other groups (' + rest.filter((p) => !pick.includes(p)).map((p) => p.text).join(', ') + ') are not needed: every cell they hold is already covered.' });
    }
    const res = B._result(fn, form, 'kmap', cover, primes, essentials, trace);
    res.geometry = g;
    res.groups = cover.map((t) => t.group);
    if (pos) trace.splice(trace.length - 1, 0, { kind: 'kmap-pos', say: 'Each group of 0s gives a sum term: a variable that is 0 across the group appears plain, a 1 appears complemented (De Morgan on the groups of F\').' });
    return res;
  };

  // ---- checking a student's work -----------------------------------------------------------------------------------
  const asCells = (x, n) => (Array.isArray(x) ? x.slice() : typeof x === 'string' ? B.cubeMinterms(B.cubeFromStr(x)) : x.cube ? B.cubeMinterms(x.cube) : B.cubeMinterms(x));
  /**
   * check one circled group: {ok, size, powerOfTwo, rectangular, cube, onlyTargets, prime, term, bigger, reasons, say}
   * form 'sop' groups 1s, 'pos' groups 0s.
   */
  function checkGroup(fn, cellsIn, opts) {
    opts = opts || {};
    fn = B.asFn(fn);
    const form = opts.form || 'sop', pos = form === 'pos', n = fn.vars.length;
    const cells = [...new Set(asCells(cellsIn, n))].sort((a, b) => a - b);
    const g = opts.geometry || kmap(fn, { layout: opts.layout });
    const reasons = [];
    const what = pos ? '0' : '1';
    const out = { ok: false, cells, size: cells.length, powerOfTwo: false, rectangular: false, isCube: false, onlyTargets: false, prime: false, reasons };
    if (!cells.length) { reasons.push('The group is empty.'); out.say = reasons[0]; return out; }
    out.powerOfTwo = (cells.length & (cells.length - 1)) === 0;
    if (!out.powerOfTwo) reasons.push('A group must hold 1, 2, 4, 8, … cells; this one holds ' + cells.length + '.');
    // geometric rectangle, wraps allowed, the same in every map it touches
    const cs = cells.map((m) => g.cellOf(m));
    const maps = [...new Set(cs.map((x) => x.map))];
    const rowsSet = [...new Set(cs.map((x) => x.r))].sort((a, b) => a - b), colsSet = [...new Set(cs.map((x) => x.c))].sort((a, b) => a - b);
    const full = maps.length * rowsSet.length * colsSet.length === cells.length;
    const contiguous = runs(rowsSet, g.rows).length === 1 && runs(colsSet, g.cols).length === 1;
    out.rectangular = full && contiguous;
    const span = B.spanCube(cells, n);
    out.isCube = B.cubeSize(span) === cells.length;
    if (out.powerOfTwo) {
      if (!out.rectangular) reasons.push(full ? 'The cells are not side by side, even allowing the wrap round the edges.' : 'The cells do not make a rectangle' + (maps.length > 1 ? ' (or the same rectangle in each map)' : '') + ', even allowing the wrap round the edges.');
      else if (!out.isCube) reasons.push('The cells form a rectangle, but its rows or columns are not neighbours in the code order, so they share no common term.');
      else if (maps.length > 1) {
        const mcs = maps.map((i) => g.maps[i].code);
        const ok = B.popcount(mcs.reduce((a, b) => a | b, 0) ^ mcs.reduce((a, b) => a & b, (1 << g.mapVars.length) - 1)) === Math.log2(maps.length);
        if (!ok) { out.isCube = false; reasons.push('The maps used are not neighbours.'); }
      }
    }
    const bad = cells.filter((m) => B.value(fn, m) !== 'X' && B.value(fn, m) !== (pos ? 0 : 1));
    out.onlyTargets = !bad.length;
    if (bad.length) reasons.push('Cell' + (bad.length === 1 ? ' ' : 's ') + bad.join(', ') + (bad.length === 1 ? ' holds a ' : ' hold ') + (pos ? '1' : '0') + (bad.length === 1 ? '' : 's') + '; a group may hold only ' + what + 's and don\'t-cares.');
    if (out.isCube && out.onlyTargets && cells.every((m) => fn.dc.has(m))) reasons.push('The group holds only don\'t-cares, so it covers nothing that needs covering.');
    out.ok = out.powerOfTwo && out.rectangular && out.isCube && out.onlyTargets;
    if (out.ok) {
      out.cube = span;
      const t = B.term(span, fn.vars, form);
      out.term = t.text; out.expr = t.expr;
      // prime: can it double in some direction?
      const okSet = new Set(pos ? B.zeros(fn).concat([...fn.dc]) : [...fn.ones, ...fn.dc]);
      out.prime = true;
      for (let i = 0; i < n && out.prime; i++) {
        const b = 1 << (n - 1 - i);
        if (!(span.mask & b)) continue;
        const big = B.cube(n, span.mask & ~b, span.bits);
        if (B.cubeMinterms(big).every((m) => okSet.has(m))) {
          out.prime = false;
          const extra = B.cubeMinterms(big).filter((m) => !cells.includes(m));
          out.bigger = { cube: big, cells: B.cubeMinterms(big), term: B.term(big, fn.vars, form).text, adds: extra };
          reasons.push('A valid group, ' + t.text + ', but not prime: it can double to ' + out.bigger.term + ' by also taking cell' + (extra.length === 1 ? ' ' : 's ') + extra.join(', ') + ', dropping ' + fn.vars[i] + '.');
        }
      }
      if (out.prime) reasons.push('A prime implicant: ' + t.text + ' (' + cells.length + ' cell' + (cells.length === 1 ? '' : 's') + ', ' + t.lits + ' literal' + (t.lits === 1 ? '' : 's') + ').');
    }
    out.say = reasons.join(' ');
    return out;
  }
  B.checkGroup = checkGroup;

  /**
   * check a whole cover: verdict 'minimal' | 'not-minimal' (with a smaller cover) | 'wrong' (with the uncovered
   * cell or the covered wrong cell) | 'bad-group' (a group fails checkGroup).
   */
  B.checkCover = (fn, groups, opts) => {
    opts = opts || {};
    fn = B.asFn(fn);
    const form = opts.form || 'sop', pos = form === 'pos';
    const checks = groups.map((x) => checkGroup(fn, x, Object.assign({}, opts, { form })));
    const badIdx = checks.findIndex((c) => !c.ok && !(c.powerOfTwo && c.isCube && !c.onlyTargets));
    if (badIdx >= 0) return { verdict: 'bad-group', group: badIdx, checks, say: 'Group ' + (badIdx + 1) + ' is not a valid group: ' + checks[badIdx].say };
    const covered = new Set(checks.flatMap((c) => c.cells));
    const wrongCell = [...covered].find((m) => B.value(fn, m) === (pos ? 1 : 0));
    if (wrongCell != null) {
      const gi = checks.findIndex((c) => c.cells.includes(wrongCell));
      return { verdict: 'wrong', covered: wrongCell, group: gi, checks, say: 'Wrong: group ' + (gi + 1) + ' covers cell ' + wrongCell + ', which is a ' + (pos ? '1' : '0') + '.' };
    }
    const { on } = B._target(fn, form);
    const missing = on.filter((m) => !covered.has(m));
    if (missing.length) return { verdict: 'wrong', uncovered: missing[0], missing, checks, say: 'Wrong: cell ' + missing[0] + ' (' + B.bits(missing[0], fn.vars.length) + ') is a ' + (pos ? '0' : '1') + ' that no group covers' + (missing.length > 1 ? ' (and ' + (missing.length - 1) + ' more)' : '') + '.' };
    const terms = checks.map((c) => B.term(c.cube, fn.vars, form));
    const cost = B.coverCost(terms);
    const best = B.minimise(fn, { form });
    const expr = terms.length ? (pos ? B.AND(terms.map((t) => t.expr)) : B.OR(terms.map((t) => t.expr))) : B.C(pos ? 1 : 0);
    if (B.betterCost(best.cost, cost)) {
      const notPrime = checks.map((c, i) => (c.prime ? -1 : i)).filter((i) => i >= 0);
      const redundant = checks.map((c, i) => i).filter((i) => { const others = new Set(checks.filter((_, j) => j !== i).flatMap((c) => c.cells)); return on.filter((m) => checks[i].cells.includes(m)).every((m) => others.has(m)); });
      let why = '';
      if (redundant.length) why = ' Group ' + (redundant[0] + 1) + ' (' + terms[redundant[0]].text + ') is not needed: every ' + (pos ? '0' : '1') + ' in it is covered by another group.';
      else if (notPrime.length) why = ' Group ' + (notPrime[0] + 1) + ' can be made bigger: ' + checks[notPrime[0]].bigger.term + '.';
      return { verdict: 'not-minimal', cost, best: best.cost, smaller: best, expr, checks, redundant, notPrime,
        say: 'Correct, but not minimal: your cover has ' + cost.terms + ' terms and ' + cost.literals + ' literals; ' + best.text + ' needs ' + best.cost.terms + ' and ' + best.cost.literals + '.' + why };
    }
    return { verdict: 'minimal', cost, expr, checks, say: 'Correct and minimal: F = ' + B.toString(expr) + ' (' + cost.terms + ' terms, ' + cost.literals + ' literals).' };
  };

  // ---- several outputs ------------------------------------------------------------------------------------------------
  /** one map per output, each with the groups the shared minimisation chose, shared terms flagged */
  B.kmapMulti = (fns) => {
    const r = B.minimiseMulti(fns);
    const maps = {};
    for (const nm of Object.keys(fns)) {
      const g = kmap(B.asFn(fns[nm]));
      g.groups = r.outputs[nm].terms.map((t) => Object.assign(group(g, t.cube), { shared: r.shared.some((u) => u.term === t) }));
      maps[nm] = g;
    }
    return { maps, result: r, shared: r.shared.map((u) => ({ text: u.term.text, used: u.used })), trace: r.trace };
  };

  // ---- map-entered variables ------------------------------------------------------------------------------------------
  /**
   * mev(fn, {entered: k}) folds the last k variables into the cells: each cell of the smaller map holds 0, 1, X or
   * an expression of the entered variables. -> {mapVars, entered, cells:[{m, entry, text}], geometry}
   */
  function mev(fn, opts) {
    opts = opts || {};
    fn = B.asFn(fn);
    const n = fn.vars.length, k = opts.entered || 1;
    if (k < 1 || k >= n) throw new Error('enter between 1 and ' + (n - 1) + ' variables into the map');
    const mapVars = fn.vars.slice(0, n - k), entered = fn.vars.slice(n - k);
    const cells = [];
    for (let m = 0; m < 1 << (n - k); m++) {
      const ones = [], dc = [];
      for (let s = 0; s < 1 << k; s++) { const full = (m << k) | s; if (fn.ones.has(full)) ones.push(s); else if (fn.dc.has(full)) dc.push(s); }
      let entry, text;
      if (dc.length === 1 << k) { entry = 'X'; text = 'X'; }
      else if (ones.length + dc.length === 1 << k) { entry = 1; text = '1'; }
      else if (!ones.length) { entry = 0; text = '0'; }
      else { const r = B.minimise(B.fromMinterms(entered, ones, dc)); entry = r.expr; text = r.text; }
      cells.push({ m, entry, text });
    }
    const reduced = B.fromTable(mapVars, cells.map((c) => (c.entry === 'X' ? 'X' : c.entry === 1 ? 1 : 0)));
    const geometry = kmap(reduced);
    geometry.cells.forEach((c) => { c.entry = cells[c.m].text; });
    return { mapVars, entered, cells, geometry };
  }
  B.mev = mev;
  /**
   * minimise a map with entered variables: first the 1s with every entered cell taken as 0; then, for each
   * distinct entry e, the e cells as 1s with the 1 cells as don't-cares, the result ANDed with e. Traced.
   */
  B.mevMinimise = (fn, opts) => {
    const mp = mev(fn, opts), trace = [];
    const { mapVars } = mp;
    const entries = new Map();
    for (const c of mp.cells) if (typeof c.entry === 'object') { if (!entries.has(c.text)) entries.set(c.text, { expr: c.entry, cells: [] }); entries.get(c.text).cells.push(c.m); }
    trace.push({ kind: 'mev-map', cells: mp.cells.map((c) => ({ m: c.m, text: c.text })), say: 'Fold ' + mp.entered.join(', ') + ' into the cells: the map over ' + mapVars.join(', ') + ' has ' + mp.cells.length + ' cells, holding 0, 1, X or an expression of ' + mp.entered.join(', ') + '.' });
    const ones = mp.cells.filter((c) => c.entry === 1).map((c) => c.m), dcs = mp.cells.filter((c) => c.entry === 'X').map((c) => c.m);
    const parts = [];
    const first = B.minimise(B.fromMinterms(mapVars, ones, dcs));
    trace.push({ kind: 'mev-ones', cells: ones, text: first.text, say: 'Step 1: treat every entered cell as 0 and group the 1s (with the Xs): ' + first.text + '.' });
    if (ones.length) parts.push(first.expr);
    for (const [text, { expr, cells }] of entries) {
      const r = B.minimise(B.fromMinterms(mapVars, cells, ones.concat(dcs)));
      trace.push({ kind: 'mev-entry', entry: text, cells, text: r.text, say: 'For the cells holding ' + text + ': take them as 1s, the 1 cells as don\'t-cares and the rest as 0s; that gives ' + r.text + ', so add (' + r.text + ')·(' + text + ').' });
      parts.push(r.expr.op === 'const' && r.expr.v === 1 ? expr : r.expr.op === 'or' || expr.op === 'or' ? B.AND(r.expr, expr) : B.flat('and', [r.expr, expr]));
    }
    const expr = parts.length ? B.flat('or', parts) : B.C(0);
    const text = B.toString(expr);
    trace.push({ kind: 'mev-done', text, say: 'F = ' + text + '.' });
    return { expr, text, map: mp, trace };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
