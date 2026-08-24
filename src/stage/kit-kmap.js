// Karnaugh maps drawn from Sirkit.Bool's geometry, for 1 to 6 variables: cells in Gray order with their
// codes along the edges and the minterm number in each corner, the variable names split by the corner's
// diagonal, optional bars marking where each variable is 1, several maps side by side (5 variables) or in a
// 2×2 grid (6 variables), and groups as rounded translucent rectangles. A group that wraps round an edge is
// drawn as one piece at each edge, each running a little past the border so the two open ends face outward
// and match; a set of cells that is not a group (a demonstration of a wrong circle) is drawn as its runs.
// S.Kit.km.draw(opts) -> {items, box, cell(m), centre(m), pieces(key), geometry}
//   opts: {fn | geometry, prefix, x, y, cell (px), text(m) -> what a cell shows, cls(m) -> extra classes,
//          hot, dim, done (lists of minterms), marks {m: '★'}, groups: [{key, cells | cube, tone (0..5), cls,
//          label}], bars, numbers (default true), numSize (of those numbers), title}
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const KM = (K.km = {});
  const B = () => S.Bool;
  const Geo = () => S.geom;
  const EXT = 8;      // how far a cut piece runs past the border

  /** where each map of a geometry sits, and the size of a cell */
  KM.frame = function (g, o) {
    o = o || {};
    const n = g.n, C = o.cell || (n <= 2 ? 64 : n <= 4 ? 58 : n === 5 ? 48 : 42);
    const many = g.maps.length > 1;
    const left = 70, top = 64 + (many ? 30 : 0);
    const gapX = many ? 34 : 0, gapY = many ? 46 : 0;
    const mw = g.cols * C, mh = g.rows * C;
    const nc = Math.max(...g.maps.map((m) => m.mc)) + 1, nr = Math.max(...g.maps.map((m) => m.mr)) + 1;
    const x0 = (o.x || 0) + left, y0 = (o.y || 0) + top;
    const origin = (mi) => { const mp = g.maps[mi]; return { x: x0 + mp.mc * (mw + gapX), y: y0 + mp.mr * (mh + gapY) }; };
    const W = left + nc * mw + (nc - 1) * gapX, H = top + nr * mh + (nr - 1) * gapY;
    return { C, x0, y0, mw, mh, gapX, gapY, origin, W, H, many };
  };

  /** cells as rectangles: a cube's pieces from the geometry (wraps split), or the runs of any set of cells */
  KM.pieces = function (g, cells) {
    const Bo = B(), n = g.n;
    const set = [...new Set(cells)].sort((a, b) => a - b);
    const span = Bo.spanCube(set, n);
    if (set.length && Bo.cubeSize(span) === set.length) {
      const gr = Bo.kmapGroup(g, span);
      const pcs = gr.pieces.map((p) => Object.assign({}, p));
      // a piece is cut where its group carries on round the edge of the same map
      for (const p of pcs) {
        const same = pcs.filter((q) => q !== p && q.map === p.map);
        p.cutL = gr.wrapCols && p.c === 0 && p.w < g.cols && same.some((q) => q.c + q.w === g.cols && q.r === p.r);
        p.cutR = gr.wrapCols && p.c + p.w === g.cols && p.w < g.cols && same.some((q) => q.c === 0 && q.r === p.r);
        p.cutT = gr.wrapRows && p.r === 0 && p.h < g.rows && same.some((q) => q.r + q.h === g.rows && q.c === p.c);
        p.cutB = gr.wrapRows && p.r + p.h === g.rows && p.h < g.rows && same.some((q) => q.r === 0 && q.c === p.c);
      }
      return { cube: span, legal: true, pieces: pcs, group: gr };
    }
    // not a cube: rows of runs, merged downwards where they line up
    const pcs = [];
    for (const mp of g.maps) {
      const here = set.map((m) => g.cellOf(m)).filter((c) => c.map === mp.i);
      const runs = [];
      for (let r = 0; r < g.rows; r++) {
        const cs = here.filter((c) => c.r === r).map((c) => c.c).sort((a, b) => a - b);
        for (let i = 0; i < cs.length; ) { let j = i; while (j + 1 < cs.length && cs[j + 1] === cs[j] + 1) j++; runs.push({ map: mp.i, r, c: cs[i], h: 1, w: cs[j] - cs[i] + 1 }); i = j + 1; }
      }
      for (const run of runs) {
        const up = pcs.find((p) => p.map === run.map && p.c === run.c && p.w === run.w && p.r + p.h === run.r);
        if (up) up.h++; else pcs.push(run);
      }
    }
    return { cube: null, legal: false, pieces: pcs };
  };

  const bits = (v, k) => (k ? v.toString(2).padStart(k, '0') : '');

  KM.draw = function (o) {
    const Bo = B();
    const g = o.geometry || Bo.kmap(o.fn, { layout: o.layout });
    const P = o.prefix || 'km', n = g.n;
    const F = KM.frame(g, o), C = F.C;
    const hot = new Set(o.hot || []), dim = new Set(o.dim || []), done = new Set(o.done || []);
    const marks = o.marks || {};
    const items = [];
    const rk = g.rowVars.length, ck = g.colVars.length;
    const showNums = o.numbers !== false;
    const fs = C >= 54 ? 20 : C >= 46 ? 18 : 16;
    // the minterm numbers in the corners grow a little with the cells (o.numSize sets them), and a mark in the
    // other corner keeps clear of the value in a small cell
    const ns = o.numSize || Math.max(10, Math.min(12, Math.round(C * 0.4) / 2)), mks = C >= 50 ? 13 : 11;
    for (const mp of g.maps) {
      const O = F.origin(mp.i);
      const first = mp.mc === 0, top = mp.mr === 0;
      if (F.many) {
        const lbl = g.mapVars.join('') + ' = ' + bits(mp.code, g.mapVars.length);
        items.push({ key: P + ':ml:' + mp.i, kind: 'text', x: O.x + F.mw / 2, y: O.y - (top ? 58 : 14), text: lbl, anchor: 'middle', cls: 'km-maplabel', size: 14 });
      }
      if (top) g.colLabels.forEach((t, c) => items.push({ key: P + ':ch:' + mp.i + ':' + c, kind: 'text', x: O.x + c * C + C / 2, y: O.y - 20, text: t, anchor: 'middle', cls: 'km-code', size: 13 }));
      if (first) g.rowLabels.forEach((t, r) => items.push({ key: P + ':rh:' + mp.i + ':' + r, kind: 'text', x: O.x - 19, y: O.y + r * C + C / 2 + 5, text: t, anchor: 'end', cls: 'km-code', size: 13 }));
      if (first && top) {
        // the corner: a diagonal with the column variables above it and the row variables below
        items.push({ key: P + ':diag:' + mp.i, kind: 'line', x1: O.x - 62, y1: O.y - 58, x2: O.x - 12, y2: O.y - 8, cls: 'km-diag', audit: 'ignore' });
        if (ck) items.push({ key: P + ':cv:' + mp.i, kind: 'text', x: O.x - 14, y: O.y - 40, text: g.colVars.join(''), anchor: 'end', cls: 'km-var', size: 13 });
        if (rk) items.push({ key: P + ':rv:' + mp.i, kind: 'text', x: O.x - 60, y: O.y - 12, text: g.rowVars.join(''), anchor: 'start', cls: 'km-var', size: 13 });
      }
    }
    for (const cell of g.cells) {
      const O = F.origin(cell.map), m = cell.m;
      const v = o.text ? o.text(m) : cell.value;
      const vt = v === 'X' || v === 'x' ? 'X' : String(v);
      const vc = vt === '1' ? 'v1' : vt === '0' ? 'v0' : vt === 'X' ? 'vx' : 've';
      const cls = ['km-cell', vc, hot.has(m) ? 'hot' : '', done.has(m) ? 'done' : '', o.cls ? o.cls(m) || '' : ''].filter(Boolean).join(' ');
      items.push({ key: P + ':c:' + m, kind: 'cell', x: O.x + cell.c * C, y: O.y + cell.r * C, w: C, h: C, rx: 0, text: vt, cls, size: vt.length > 2 ? 14 : fs, dim: dim.has(m), pick: true, title: 'm' + m + ' = ' + cell.bits });
      if (showNums) items.push({ key: P + ':n:' + m, kind: 'text', x: O.x + cell.c * C + 4, y: O.y + cell.r * C + 2 + ns, text: String(m), anchor: 'start', cls: 'km-num', size: ns, audit: 'small-ok', dim: dim.has(m), layer: 'top', z: 5 });
      if (marks[m]) items.push({ key: P + ':mk:' + m, kind: 'text', x: O.x + cell.c * C + C - 3, y: O.y + cell.r * C + 1 + mks, text: marks[m], anchor: 'end', cls: 'km-mark', size: mks });
    }
    // a mirrored 5-variable map: cells the same distance either side of the middle line are neighbours
    if (g.layout === 'mirror') {
      const O = F.origin(0), mx = O.x + (g.cols / 2) * C;
      items.push({ key: P + ':mirror', kind: 'line', x1: mx, y1: O.y - 6, x2: mx, y2: O.y + F.mh + 6, cls: 'km-mirror', audit: 'ignore', layer: 'top' });
      items.push({ key: P + ':mirrorl', kind: 'text', x: mx, y: O.y + F.mh + 22, text: 'mirror line', anchor: 'middle', cls: 'km-note', size: 12 });
    }
    // where each variable is 1: bars below and to the right (single maps)
    if (o.bars && !F.many) {
      const O = F.origin(0);
      const runsOf = (codes, k, i) => { const on = codes.map((c, j) => ((c >> (k - 1 - i)) & 1 ? j : -1)).filter((j) => j >= 0); return on.length && on[on.length - 1] - on[0] === on.length - 1 ? [on[0], on.length] : null; };
      g.colVars.forEach((v, i) => {
        const r = runsOf(g.colCodes, ck, i); if (!r) return;
        const y = O.y + F.mh + 14 + i * 20;
        items.push({ key: P + ':bar:' + v, kind: 'line', x1: O.x + r[0] * C + 6, y1: y, x2: O.x + (r[0] + r[1]) * C - 6, y2: y, cls: 'km-bar' });
        items.push({ key: P + ':barl:' + v, kind: 'text', x: O.x + (r[0] + r[1]) * C + 4, y: y + 5, text: v, anchor: 'start', cls: 'km-var', size: 13 });
      });
      g.rowVars.forEach((v, i) => {
        const r = runsOf(g.rowCodes, rk, i); if (!r) return;
        const x = O.x + F.mw + 14 + i * 32;
        items.push({ key: P + ':bar:' + v, kind: 'line', x1: x, y1: O.y + r[0] * C + 6, x2: x, y2: O.y + (r[0] + r[1]) * C - 6, cls: 'km-bar' });
        items.push({ key: P + ':barl:' + v, kind: 'text', x: x + 7, y: O.y + (r[0] + r[1] / 2) * C + 5, text: v, anchor: 'start', cls: 'km-var', size: 13 });
      });
    }
    // groups
    const pieceKeys = {};
    (o.groups || []).forEach((gr, gi) => {
      const cells = gr.cells || Bo.cubeMinterms(gr.cube);
      const pc = KM.pieces(g, cells);
      const key = gr.key || 'g' + gi, tone = gr.tone === undefined ? gi % 6 : gr.tone;
      const inset = gr.inset !== undefined ? gr.inset : 5 + (gi % 3) * 4;
      pieceKeys[key] = [];
      pc.pieces.forEach((p, k) => {
        const O = F.origin(p.map);
        let x = O.x + p.c * C + inset, y = O.y + p.r * C + inset, w = p.w * C - 2 * inset, h = p.h * C - 2 * inset;
        if (p.cutL) { x -= inset + EXT; w += inset + EXT; }
        if (p.cutR) w += inset + EXT;
        if (p.cutT) { y -= inset + EXT; h += inset + EXT; }
        if (p.cutB) h += inset + EXT;
        const pk = P + ':g:' + key + ':' + k;
        pieceKeys[key].push(pk);
        const cut = p.cutL || p.cutR || p.cutT || p.cutB;
        items.push({ key: pk, kind: 'region', x, y, w, h, rx: Math.min(16, C / 3), text: '', cls: 'km-group t' + tone + (cut ? ' cut' : '') + (pc.legal ? '' : ' bad') + (gr.cls ? ' ' + gr.cls : ''), audit: 'overlap-ok', layer: 'top', enter: gr.enter || 'grow', dim: gr.dim });
      });
    });
    const box = { x: o.x || 0, y: (o.y || 0), w: F.W + (o.bars ? 50 : 0), h: F.H + (o.bars ? 50 : 0) };
    const cellBox = (m) => { const c = g.cellOf(m), O = F.origin(c.map); return { x: O.x + c.c * C, y: O.y + c.r * C, w: C, h: C }; };
    return { items, box, geometry: g, frame: F, cell: cellBox, centre: (m) => { const b = cellBox(m); return { x: b.x + C / 2, y: b.y + C / 2 }; }, pieces: (k) => pieceKeys[k] || [] };
  };

  /** a chip holding a term, sized to its text; it can grow out of a group's piece (src) */
  KM.chip = function (key, text, x, y, opts) {
    opts = opts || {};
    const size = opts.size || 17, w = Math.max(40, Geo().textWidth(text, size, { mono: true }) + 22), h = opts.h || 36;
    const it = { key, kind: 'cell', x: opts.anchor === 'middle' ? x - w / 2 : x, y, w, h, rx: 10, text, size, cls: 'km-chip mono' + (opts.tone !== undefined ? ' t' + opts.tone : '') + (opts.cls ? ' ' + opts.cls : '') };
    if (opts.src) { it.enter = 'from'; it.src = opts.src; }
    if (opts.dim) it.dim = true;
    return it;
  };
  KM.chipWidth = (text, size) => Math.max(40, Geo().textWidth(text, size || 17, { mono: true }) + 22);

  /** a row of chips (terms joined by + or ·), centred at cx; returns {items, w} */
  KM.chips = function (prefix, terms, cx, y, opts) {
    opts = opts || {};
    const size = opts.size || 17, gap = opts.gap || 30, join = opts.join || '+';
    const ws = terms.map((t) => KM.chipWidth(t.text, size));
    const lead = opts.lead ? Geo().textWidth(opts.lead, size + 1, { bold: true }) + 12 : 0;
    const W = lead + ws.reduce((a, b) => a + b, 0) + gap * Math.max(0, terms.length - 1);
    let x = cx - W / 2;
    const items = [];
    if (opts.lead) items.push({ key: prefix + ':lead', kind: 'text', x, y: y + 24, text: opts.lead, anchor: 'start', cls: 'km-lead', size: size + 1 });
    x += lead;
    terms.forEach((t, i) => {
      items.push(KM.chip(prefix + ':' + (t.key || i), t.text, x, y, { size, tone: t.tone, src: t.src, cls: t.cls, dim: t.dim }));
      x += ws[i];
      if (i + 1 < terms.length) items.push({ key: prefix + ':op:' + (t.key || i), kind: 'text', x: x + gap / 2, y: y + 24, text: join, anchor: 'middle', cls: 'km-op', size: size + 2 });
      x += gap;
    });
    return { items, w: W };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
