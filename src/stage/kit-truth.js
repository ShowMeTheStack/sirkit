// Truth tables and Karnaugh maps on the stage.
// S.Kit.truth.draw({vars, outputs: {F: expression | (env) => 0|1|'x'}, x, y, prefix, hot: row, done: rows,
//   dim: rows, maxRows}) -> {items, key(row, col), box, rows}: one row per input combination in binary order,
//   the inputs then the outputs, the row being looked at lit (hot), rows already seen marked.
// S.Kit.kmap.draw({vars (2 to 4), value(m) -> 0|1|'x' (or ones, dc: lists of minterms), x, y, prefix,
//   groups: [{cells: [minterms], cls}], hot: [minterms], cell: 44}) -> {items, box, cellBox(m)}: the cells in
//   Gray-code order with the variables round the edges, the minterm number small in each cell, and each group
//   drawn as rounded outlines (one piece per stretch when it wraps round an edge).
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const TT = (K.truth = {});
  const KM = (K.kmap = {});

  /** the value of an output for an assignment: an expression (text) or a function */
  const outFn = (f) => {
    if (typeof f === 'function') return f;
    const e = S.Netlist.parse(f);
    return (env) => S.Netlist.evaluate(e, env);
  };
  TT.rows = function (vars, outputs) {
    const fs = Object.entries(outputs || {}).map(([k, f]) => [k, outFn(f)]);
    const n = vars.length, rows = [];
    for (let m = 0; m < 1 << n; m++) {
      const env = {};
      vars.forEach((v, i) => { env[v] = (m >> (n - 1 - i)) & 1; });
      rows.push({ m, env, out: Object.fromEntries(fs.map(([k, f]) => [k, f(env)])) });
    }
    return rows;
  };
  TT.draw = function (o) {
    const vars = o.vars, outs = Object.keys(o.outputs || {});
    const rows = TT.rows(vars, o.outputs);
    const done = new Set(o.done || []), dim = new Set(o.dim || []);
    const t = K.table.draw({
      prefix: o.prefix || 'tt', x: o.x || 0, y: o.y || 0, size: o.size || 15, mono: true, minW: 40, minH: o.rowH || 32, ch: o.rowH || 32, maxRows: o.maxRows,
      colHead: vars.concat(outs), rows: rows.map((r) => vars.map((v) => String(r.env[v])).concat(outs.map((k) => String(r.out[k] === 'x' ? 'X' : r.out[k])))),
      hot: o.hot === undefined || o.hot === null ? [] : outs.map((_, i) => [o.hot, vars.length + i]),
      act: o.hot === undefined || o.hot === null ? [] : vars.map((_, i) => [o.hot, i]),
      cls: (r, c) => (c >= vars.length ? 'out' : '') + (done.has(r) ? ' read' : '') + (dim.has(r) ? ' dim' : ''),
      title: o.title,
    });
    return Object.assign(t, { rows });
  };

  const GRAY = [[0], [0, 1], [0, 1, 3, 2]];
  /** rows and columns of a map: which variables go down the side, which across the top */
  KM.shape = function (n) {
    const rv = n <= 2 ? 1 : n === 3 ? 1 : 2, cv = n - rv;
    return { rv, cv, rows: GRAY[rv], cols: GRAY[cv] };
  };
  /** the minterm in row r, column c */
  KM.minterm = (n, r, c) => { const s = KM.shape(n); return (s.rows[r] << s.cv) | s.cols[c]; };
  KM.place = function (n, m) {
    const s = KM.shape(n);
    return { r: s.rows.indexOf(m >> s.cv), c: s.cols.indexOf(m & ((1 << s.cv) - 1)) };
  };
  const bits = (v, k) => v.toString(2).padStart(k, '0');
  /** contiguous stretches of a set of indices on a ring of size n: [[start, length]] */
  const runs = (idx, n) => {
    const on = new Set(idx);
    if (on.size === n) return [[0, n]];
    const out = [];
    for (let i = 0; i < n; i++) if (on.has(i) && !on.has((i - 1 + n) % n)) { let k = 0; while (on.has((i + k) % n) && k < n) k++; out.push([i, k]); }
    // a stretch that wraps is drawn as two pieces, one at each edge
    return out.flatMap(([a, k]) => (a + k > n ? [[a, n - a], [0, a + k - n]] : [[a, k]]));
  };
  KM.draw = function (o) {
    const n = o.vars.length;
    if (n < 2 || n > 4) throw new Error('a map here has 2 to 4 variables');
    const P = o.prefix || 'km', s = KM.shape(n), C = o.cell || 46, x0 = (o.x || 0) + 46, y0 = (o.y || 0) + 46;
    const ones = new Set(o.ones || []), dc = new Set(o.dc || []);
    const value = o.value || ((m) => (ones.has(m) ? 1 : dc.has(m) ? 'x' : 0));
    const rowName = o.vars.slice(0, s.rv).join(''), colName = o.vars.slice(s.rv).join('');
    const hot = new Set(o.hot || []);
    const items = [];
    items.push({ key: P + ':corner', kind: 'text', x: x0 - 8, y: y0 - 10, text: rowName + ' \\ ' + colName, anchor: 'end', cls: 'kmap-corner', size: 13 });
    s.cols.forEach((g, c) => items.push({ key: P + ':ch:' + c, kind: 'text', x: x0 + c * C + C / 2, y: y0 - 10, text: bits(g, s.cv), anchor: 'middle', cls: 'mono', size: 13 }));
    s.rows.forEach((g, r) => items.push({ key: P + ':rh:' + r, kind: 'text', x: x0 - 10, y: y0 + r * C + C / 2 + 5, text: bits(g, s.rv), anchor: 'end', cls: 'mono', size: 13 }));
    for (let r = 0; r < s.rows.length; r++) for (let c = 0; c < s.cols.length; c++) {
      const m = KM.minterm(n, r, c), v = value(m);
      items.push({ key: P + ':c:' + m, kind: 'cell', x: x0 + c * C, y: y0 + r * C, w: C, h: C, rx: 0, text: v === 'x' || v === 'X' ? 'X' : String(v), sub: '', cls: 'kcell v' + String(v).toLowerCase() + (hot.has(m) ? ' hot' : ''), size: 17, pick: true });
      items.push({ key: P + ':m:' + m, kind: 'text', x: x0 + c * C + C - 4, y: y0 + r * C + 12, text: String(m), anchor: 'end', cls: 'kmap-m', size: 9 });
    }
    (o.groups || []).forEach((g, gi) => {
      const pl = g.cells.map((m) => KM.place(n, m));
      const rr = runs([...new Set(pl.map((p) => p.r))], s.rows.length), cc = runs([...new Set(pl.map((p) => p.c))], s.cols.length);
      const inset = 4 + (gi % 3) * 3;
      let k = 0;
      for (const [r, rl] of rr) for (const [c, cl] of cc) {
        items.push({ key: P + ':g' + gi + ':' + k++, kind: 'region', x: x0 + c * C + inset, y: y0 + r * C + inset, w: cl * C - 2 * inset, h: rl * C - 2 * inset, rx: 12, text: '', cls: 'kgroup g' + (gi % 6) + (g.cls ? ' ' + g.cls : ''), audit: 'overlap-ok', layer: 'top' });
      }
    });
    const box = { x: o.x || 0, y: o.y || 0, w: 46 + s.cols.length * C, h: 46 + s.rows.length * C };
    return { items, box, cellBox: (m) => { const p = KM.place(n, m); return { x: x0 + p.c * C, y: y0 + p.r * C, w: C, h: C }; } };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
