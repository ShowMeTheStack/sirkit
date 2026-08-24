// Quine–McCluskey and gate-level pictures: the tabulation as columns of rows grouped by their number of 1s
// (merges growing out of their two sources, check marks, primes labelled), the prime implicant chart (X marks,
// essential columns circled, rows and columns struck out), chips for products and sums, bars for costs, and
// bubbles placed on the pins of a laid-out schematic.
//   S.Kit.qm.tab(opts)   -> {items, box, colBox(c), rowKey(c, str)}
//   S.Kit.qm.chart(opts) -> {items, box, rowKey(label), colKey(m), cellKey(label, m)}
//   S.Kit.qm.chips(list, opts) -> {items, box}       a wrapped row of chips
//   S.Kit.qm.bars(opts)  -> {items, box}             a small grouped bar chart
//   S.Kit.qm.pin(item, res, part, pinName | {net}) -> {x, y, side} on the stage
(function (S) {
  'use strict';
  const Geo = S.geom;
  const K = (S.Kit = S.Kit || {});
  const Q = (K.qm = {});
  const mono = (t, size) => Geo.textWidth(t, size || 14, { mono: true });

  // ---- the tabulation ---------------------------------------------------------------------------------------
  /**
   * opts: {columns: [[{ones, rows: [{str, minterms, dc}]}]] (the final snapshot of every column), n (variables),
   *   shown: Set of 'c:str' drawn, checked: Set, hot: Set (lit rows), src: Set (rows being merged), prime: Map
   *   'c:str' -> label, dim: Set, flat0: true (column 0 as one plain list, before grouping), bands: Set of column
   *   indexes whose groups are drawn, x, y, prefix, enterFrom: Map 'c:str' -> [src keys], links: [[srcId, dstId]]}
   */
  Q.tab = function (o) {
    const P = o.prefix || 'qt', n = o.n, RH = 30, colGap = 70;
    const shown = o.shown || new Set(), checked = o.checked || new Set(), hot = o.hot || new Set(), src = o.src || new Set();
    const prime = o.prime || new Map(), dim = o.dim || new Set(), bands = o.bands || new Set();
    const items = [], colBoxes = [];
    let x = o.x || 0;
    const y0 = (o.y || 0) + 34;
    const id = (c, str) => c + ':' + str;
    const rowKey = (c, str) => P + ':r:' + c + ':' + str;
    o.columns.forEach((groups, c) => {
      const all = groups.flatMap((g) => g.rows);
      const mtW = Math.max(52, ...all.map((r) => mono(r.minterms.join(','), 13) + 18));
      const cbW = mono('0'.repeat(n), 15) + 22, ckW = 30;
      const W = mtW + cbW + ckW;
      const flat = c === 0 && o.flat0;
      const title = c === 0 ? 'Column 1 · single ' + (o.what || 'minterms') : 'Column ' + (c + 1) + ' · ' + (c === 1 ? 'pairs' : c === 2 ? 'quads' : 'groups of ' + (1 << c));
      const anyShown = all.some((r) => shown.has(id(c, r.str)));
      if (anyShown) items.push({ key: P + ':ch:' + c, kind: 'text', x: x + W / 2, y: y0 - 16, text: title, anchor: 'middle', cls: 'title' });
      let y = y0;
      const place = [];
      if (flat) {
        const rows = all.slice().sort((a, b) => a.minterms[0] - b.minterms[0]);
        rows.forEach((r) => { place.push({ r, y }); y += RH; });
      } else {
        groups.forEach((g, gi) => {
          const gy = y;
          y += 22;
          g.rows.forEach((r) => { place.push({ r, y }); y += RH; });
          y += 6;
          const vis = g.rows.some((r) => shown.has(id(c, r.str)));
          if (bands.has(c) && vis) {
            items.push({ key: P + ':band:' + c + ':' + g.ones, kind: 'region', x: x - 8, y: gy, w: W + 16, h: y - gy, rx: 10, cls: 'qm-band b' + (g.ones % 2), audit: 'group' });
            items.push({ key: P + ':bl:' + c + ':' + g.ones, kind: 'text', x: x - 1, y: gy + 15, text: g.ones + ' one' + (g.ones === 1 ? '' : 's'), cls: 'qm-band-label', size: 11 });
          }
          y += gi < groups.length - 1 ? 8 : 0;
        });
      }
      for (const { r, y: ry } of place) {
        const k = id(c, r.str);
        if (!shown.has(k)) continue;
        const st = (prime.has(k) ? ' prime' : '') + (hot.has(k) ? ' hot' : '') + (src.has(k) ? ' src-a' : '') + (dim.has(k) ? ' dim' : '') + (r.dc ? ' dconly' : '');
        const from = o.enterFrom && o.enterFrom.get(k);
        const base = rowKey(c, r.str);
        const m = { key: base, kind: 'cell', x, y: ry, w: mtW, h: RH, rx: 0, text: r.minterms.join(','), cls: 'mono qm-m' + st, size: 13 };
        const b = { key: base + ':b', kind: 'cell', x: x + mtW, y: ry, w: cbW, h: RH, rx: 0, text: r.str, cls: 'mono qm-cube' + st, size: 15 };
        if (from) { m.enter = 'from'; m.src = from; b.enter = 'from'; b.src = from.map((s) => s + ':b'); }
        items.push(m, b);
        if (checked.has(k)) items.push({ key: base + ':ok', kind: 'text', x: x + mtW + cbW + ckW / 2, y: ry + RH / 2 + 6, text: '✓', anchor: 'middle', cls: 'qm-check', size: 17, enter: 'grow' });
        else if (prime.has(k)) items.push({ key: base + ':p', kind: 'cell', x: x + mtW + cbW + 5, y: ry + 4, w: Math.max(32, Geo.textWidth(prime.get(k), 13, { bold: true }) + 12), h: RH - 8, rx: 11, text: prime.get(k), cls: 'qm-plabel', size: 13 });
      }
      colBoxes.push({ x: x - 10, y: y0 - 34, w: W + 20 + 40, h: y - y0 + 40 });
      x += W + colGap;
    });
    for (const [a, b2] of o.links || []) items.push({ key: P + ':ln:' + a + '>' + b2, kind: 'edge', from: rowKey(...split(a)) + ':b', to: rowKey(...split(b2)), bend: -18, cls: 'prov', audit: 'ignore', layer: 'top', gapB: 2 });
    const box = Geo.union(colBoxes.filter((b, c) => o.columns[c].some((g) => g.rows.some((r) => shown.has(id(c, r.str)))))) || { x: 0, y: 0, w: 10, h: 10 };
    return { items, box, colBox: (c) => colBoxes[c], rowKey };
  };
  const split = (s) => { const i = s.indexOf(':'); return [+s.slice(0, i), s.slice(i + 1)]; };

  // ---- the prime implicant chart ------------------------------------------------------------------------------
  /**
   * opts: {rows: [{label, text, minterms}], cols: [m], x, y, prefix, gone: {rows: Set, cols: Set} (struck out),
   *   chosen: Set of row labels (taken into the cover), hotCols: Set (circled), hotRows: Set, hotCells: Set
   *   'label:m', what ('m' or 'M'), lits: true (write the literal count)}
   */
  Q.chart = function (o) {
    const P = o.prefix || 'pc', C = 40, RH = 38;
    const gone = o.gone || { rows: new Set(), cols: new Set() };
    const chosen = o.chosen || new Set(), hotCols = o.hotCols || new Set(), hotRows = o.hotRows || new Set(), hotCells = o.hotCells || new Set();
    const labW = Math.max(150, ...o.rows.map((r) => Geo.textWidth(r.label + '  ' + r.text, 15, { bold: true }) + 30));
    const x0 = (o.x || 0) + labW, y0 = (o.y || 0) + 40;
    const items = [];
    const rowKey = (l) => P + ':row:' + l, colKey = (m) => P + ':col:' + m, cellKey = (l, m) => P + ':x:' + l + ':' + m;
    o.cols.forEach((m, j) => {
      const g = gone.cols.has(m);
      items.push({ key: colKey(m), kind: 'cell', x: x0 + j * C, y: y0 - 38, w: C, h: 34, rx: 0, text: String(m), cls: 'head mono pc-col' + (g ? ' gone' : '') + (hotCols.has(m) ? ' hot' : ''), size: 15, pick: true });
    });
    o.rows.forEach((r, i) => {
      const ch = chosen.has(r.label), g = gone.rows.has(r.label) && !ch;
      const y = y0 + i * RH;
      items.push({ key: rowKey(r.label), kind: 'cell', x: o.x || 0, y, w: labW - 6, h: RH - 4, rx: 8, text: r.label + '  ' + r.text, cls: 'pc-row' + (g ? ' gone' : '') + (ch ? ' good' : '') + (hotRows.has(r.label) ? ' hot' : ''), size: 15, align: 'left', pick: true });
      o.cols.forEach((m, j) => {
        const on = r.minterms.includes(m);
        const cg = g || gone.cols.has(m);
        items.push({ key: P + ':bg:' + r.label + ':' + m, kind: 'cell', x: x0 + j * C, y, w: C, h: RH - 4, rx: 0, text: '', cls: 'pc-cell' + (cg ? ' gone' : '') + (ch && on && !gone.cols.has(m) ? ' covered' : ''), audit: 'overlap-ok' });
        if (on) items.push({ key: cellKey(r.label, m), kind: 'text', x: x0 + j * C + C / 2, y: y + RH / 2 + 4, text: '×', anchor: 'middle', cls: 'pc-x' + (cg ? ' dim' : '') + (hotCells.has(r.label + ':' + m) ? ' hot' : ''), size: 20 });
      });
    });
    // a circle round each lit column
    for (const m of hotCols) {
      const j = o.cols.indexOf(m);
      if (j < 0) continue;
      items.push({ key: P + ':ring:' + m, kind: 'region', x: x0 + j * C + 3, y: y0 - 36, w: C - 6, h: o.rows.length * RH + 34, rx: (C - 6) / 2, cls: 'pc-ring', audit: 'overlap-ok', layer: 'top', enter: 'grow' });
    }
    const box = { x: o.x || 0, y: (o.y || 0), w: labW + o.cols.length * C, h: 40 + o.rows.length * RH };
    return { items, box, rowKey, colKey, cellKey, colX: (m) => x0 + o.cols.indexOf(m) * C + C / 2, rowY: (l) => y0 + o.rows.findIndex((r) => r.label === l) * RH + (RH - 4) / 2, labW };
  };

  // ---- chips -------------------------------------------------------------------------------------------------------
  /** list: [{id, text, cls, sub}]; opts {x, y, maxW, prefix, size, gap, h, mono} -> {items, box} */
  Q.chips = function (list, o) {
    o = o || {};
    const P = o.prefix || 'chip', size = o.size || 15, h = o.h || 34, gap = o.gap || 10, maxW = o.maxW || 800;
    const items = [];
    let x = o.x || 0, y = o.y || 0, right = x;
    const x0 = x, rowH = h + (list.some((c) => c.sub) ? 20 : 0) + gap;
    for (const c of list) {
      const w = Math.max(o.minW || 40, Geo.textWidth(c.text, size, { mono: o.mono, bold: true }) + 22, c.sub !== undefined ? mono(String(c.sub), size) + 18 : 0);
      if (x > x0 && x + w > x0 + maxW) { x = x0; y += rowH; }
      const it = { key: P + ':' + c.id, kind: 'cell', x, y, w, h, rx: h / 2, text: c.text, cls: 'chip' + (o.mono ? ' mono' : '') + (c.cls ? ' ' + c.cls : ''), size };
      if (c.sub !== undefined) it.sub = c.sub;
      if (c.enter) Object.assign(it, c.enter);
      items.push(it);
      x += w + gap;
      right = Math.max(right, x - gap);
    }
    return { items, box: { x: x0, y: o.y || 0, w: right - x0, h: y - (o.y || 0) + h + (list.some((c) => c.sub) ? 20 : 0) } };
  };

  // ---- bars ---------------------------------------------------------------------------------------------------------
  /**
   * opts: {x, y, metrics: [{id, label}], series: [{id, label, cls, values: {metric: n}}], unit (px per 1), prefix,
   *   hot: series id (lit), show: Set of series ids drawn} -> {items, box}
   */
  Q.bars = function (o) {
    const P = o.prefix || 'bar', BH = 22, unit = o.unit || 14, labW = 104;
    const show = o.show || new Set(o.series.map((s) => s.id));
    const items = [];
    let y = o.y || 0;
    const x = o.x || 0;
    for (const m of o.metrics) {
      items.push({ key: P + ':m:' + m.id, kind: 'text', x, y: y + 15, text: m.label, cls: 'strong', size: 14 });
      y += 26;
      for (const s of o.series) {
        if (show.has(s.id)) {
          const v = s.values[m.id];
          items.push({ key: P + ':b:' + m.id + ':' + s.id, kind: 'cell', x: x + labW, y, w: Math.max(6, v * unit), h: BH, rx: 4, text: '', cls: 'qm-bar ' + s.cls + (o.hot === s.id ? ' best' : ''), enter: 'grow', audit: 'overlap-ok' });
          items.push({ key: P + ':v:' + m.id + ':' + s.id, kind: 'text', x: x + labW + Math.max(6, v * unit) + 8, y: y + 16, text: String(v), cls: 'mono', size: 13 });
          items.push({ key: P + ':l:' + m.id + ':' + s.id, kind: 'text', x: x + labW - 10, y: y + 16, text: s.label, anchor: 'end', cls: 'qm-bar-name ' + s.cls, size: 12 });
        }
        y += BH + 5;
      }
      y += 12;
    }
    const maxV = Math.max(1, ...o.series.flatMap((s) => o.metrics.map((m) => s.values[m.id])));
    return { items, box: { x, y: o.y || 0, w: labW + maxV * unit + 40, h: y - (o.y || 0) } };
  };

  // ---- schematics -----------------------------------------------------------------------------------------------------
  /** the laid-out part of a netlist part */
  Q.partOf = (res, part) => res.parts.find((p) => p.part === part || p.id === part || p.id === (part && part.id));
  /**
   * where a pin of a part sits on the stage, given the schematic item (its x, y) and the layout. pin: a name, or
   * {net: id} for the pin on that net.
   */
  Q.pin = function (item, res, part, pin) {
    const p = Q.partOf(res, part);
    if (!p) return null;
    const q = typeof pin === 'string' ? p.pins.find((x) => x.name === pin) : p.pins.find((x) => x.net === pin.net);
    if (!q) return null;
    return { x: item.x + q.x - res.bounds.x, y: item.y + q.y - res.bounds.y, side: q.side, net: q.net };
  };
  /** a hollow inversion bubble just off a pin (outside the part, along its wire) */
  Q.bubble = function (key, at, opts) {
    opts = opts || {};
    const d = opts.inset === undefined ? 6 : opts.inset;
    const dx = at.side === 'right' ? d : at.side === 'left' ? -d : 0, dy = at.side === 'bottom' ? d : at.side === 'top' ? -d : 0;
    return Object.assign({ key, kind: 'token', x: at.x + dx, y: at.y + dy, r: 5.5, text: '', cls: 'bubble', audit: 'overlap-ok' }, opts.item || {});
  };
  /** the parts of a circuit of given types, in the order the netlist has them */
  Q.parts = (c, types) => c.parts.filter((p) => !types || types.includes(p.type));
})(globalThis.Sirkit = globalThis.Sirkit || {});
