// Asynchronous circuits on the stage: transition and flow tables with their stable entries circled, the cube of
// secondary-variable codes with the orders a race can take drawn on it, the merger diagram (rows joined when
// they are compatible, maximal compatibles lit), and a row of chips that tracks the design flow.
//
//   S.Kit.flow.table({ x, y, rows, cols, cell(r, c) -> {text, stable, cls}, rowHead, colHead, corner, hot, act })
//   S.Kit.flow.cube({ x, y, n, size, hot, cls: {code: cls}, arrows: [{from, to, cls, label}], sub: {code: text} })
//   S.Kit.flow.graph({ x, y, R, nodes: [{id, label, cls}], edges: [{a, b, cls}] })
//   S.Kit.flow.chips({ x, y, steps: [text], at })
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const FL = (K.flow = {});
  const Geo = () => S.geom;
  const r2 = (v) => Math.round(v * 100) / 100;

  /** codes of n bits in Gray order (00 01 11 10), the order of a table's columns */
  FL.gray = (n) => {
    if (n <= 0) return [''];
    const g = FL.gray(n - 1);
    return g.map((c) => '0' + c).concat(g.slice().reverse().map((c) => '1' + c));
  };

  /**
   * A transition or flow table. Stable entries are circled (a circle drawn over the cell with the entry in it).
   * o: {x, y, prefix, rows: [row ids], cols: [column ids], rowHead, colHead, corner, cell(r, c) -> {text, stable,
   * cls} | text, hot: [[r, c]], act: [[r, c]], title, size, extra: [{head, cell(r) -> text}] (columns on the
   * right, such as the outputs), minW}. Returns {items, box, key(r, c), cellBox(r, c)}.
   */
  FL.table = function (o) {
    const P = o.prefix || 'ft';
    const R = o.rows, C = o.cols, extra = o.extra || [];
    const val = (r, c) => { const v = o.cell(R[r], C[c], r, c); return v && typeof v === 'object' ? v : { text: v === null || v === undefined ? '' : String(v) }; };
    const rows = R.map((rr, r) => C.map((cc, c) => { const v = val(r, c); return { text: v.stable ? '' : v.text, cls: [v.cls || '', v.stable ? 'stable-cell' : ''].join(' ').trim() }; }).concat(extra.map((e) => { const v = e.cell(rr, r); return v && typeof v === 'object' ? v : { text: v === null || v === undefined ? '' : String(v), cls: 'out-col' }; })));
    const colHead = (o.colHead || C).concat(extra.map((e) => e.head));
    // a circled entry needs room for its ring
    let minW = o.minW || 54;
    R.forEach((rr, r) => C.forEach((cc, c) => { const v = val(r, c); if (v.stable) minW = Math.max(minW, Math.ceil(Geo().textWidth(v.text, 15, { mono: true }) + 30)); }));
    const t = K.table.draw({ x: o.x || 0, y: o.y || 0, prefix: P, rows, rowHead: o.rowHead || R, colHead, corner: o.corner, hot: o.hot, act: o.act, title: o.title, size: o.size || 15, minW, minH: o.minH || 42, mono: true });
    const items = t.items;
    R.forEach((rr, r) => C.forEach((cc, c) => {
      const v = val(r, c);
      if (!v.stable) return;
      const b = t.cellBox(r, c);
      if (!b) return;
      const rad = Math.min(b.w, b.h) / 2 - 5;
      const w = Math.max(2 * rad, Geo().textWidth(v.text, 15, { mono: true }) + 18);
      items.push({ key: P + ':o:' + r + ',' + c, kind: 'state', x: r2(b.x + b.w / 2), y: r2(b.y + b.h / 2), w: Math.min(w, b.w - 6), h: 2 * rad, rx: rad, text: v.text, size: 15, cls: 'stable-ring ' + (v.cls || '') });
    }));
    return { items, box: t.box, key: t.key, cellBox: t.cellBox };
  };

  // ---- the cube of codes ------------------------------------------------------------------------------------
  /** where each code of n bits (1 to 3) sits: a line, a square (00 01 / 10 11) or a cube */
  FL.cubePos = function (n, size) {
    const s = size || 120, pos = {};
    if (n === 1) { pos['0'] = { x: 0, y: 0 }; pos['1'] = { x: s, y: 0 }; return pos; }
    if (n === 2) { pos['00'] = { x: 0, y: 0 }; pos['01'] = { x: s, y: 0 }; pos['10'] = { x: 0, y: s }; pos['11'] = { x: s, y: s }; return pos; }
    // the first bit picks the front or the back square; the back one is up and to the right
    const dx = s * 0.55, dy = -s * 0.42;
    for (let v = 0; v < 8; v++) {
      const b = v.toString(2).padStart(3, '0');
      pos[b] = { x: (+b[2]) * s + (+b[0]) * dx, y: (+b[1]) * s + (+b[0]) * dy };
    }
    return pos;
  };
  /**
   * The codes of the secondary variables as corners of a square or a cube; the single-change edges faint, and
   * arrows for the changes being shown. o: {x, y, n, size, prefix, r, hot, cls: {code: cls}, sub: {code: text},
   * arrows: [{from, to, cls, label, bend}], names: {code: label}, faint (draw the cube's edges, default true)}
   */
  FL.cube = function (o) {
    const P = o.prefix || 'cb', n = o.n, s = o.size || 120, r = o.r || 24;
    const pos0 = FL.cubePos(n, s), pos = {};
    for (const [k, p] of Object.entries(pos0)) pos[k] = { x: (o.x || 0) + p.x + r, y: (o.y || 0) + p.y + r + (n === 3 ? s * 0.42 : 0) };
    const items = [];
    const codes = Object.keys(pos);
    if (o.faint !== false) for (const a of codes) for (const b of codes) {
      if (a >= b) continue;
      let d = 0; for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
      if (d !== 1) continue;
      if ((o.arrows || []).some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a))) continue;
      items.push({ key: P + ':k:' + a + b, kind: 'edge', from: P + ':s:' + a, to: P + ':s:' + b, head: false, cls: 'cube-edge', audit: 'edge-x' });
    }
    for (const c of codes) {
      const lab = o.names && o.names[c] !== undefined ? o.names[c] : c;
      const it = { key: P + ':s:' + c, kind: 'state', x: r2(pos[c].x), y: r2(pos[c].y), r, text: lab, size: lab.length > 3 ? 13 : 15, cls: 'cube-node ' + ((o.cls && o.cls[c]) || '') + (o.hot === c ? ' hot' : '') };
      // a second line inside the circle (the code under a row's name)
      if (o.sub && o.sub[c]) { it.lines = [lab, o.sub[c]]; it.size = 13; delete it.text; }
      items.push(it);
    }
    for (const e of o.arrows || []) {
      const it = { key: P + ':a:' + e.from + '>' + e.to, kind: 'edge', from: P + ':s:' + e.from, to: P + ':s:' + e.to, cls: 'race-arrow ' + (e.cls || ''), audit: 'edge-x', bend: e.bend || 0 };
      if (e.label) it.label = e.label;
      items.push(it);
    }
    const xs = codes.map((c) => pos[c].x), ys = codes.map((c) => pos[c].y);
    const box = { x: Math.min(...xs) - r, y: Math.min(...ys) - r, w: Math.max(...xs) - Math.min(...xs) + 2 * r, h: Math.max(...ys) - Math.min(...ys) + 2 * r };
    return { items, pos, box };
  };

  // ---- a graph on a circle (the merger diagram) ----------------------------------------------------------------
  /** o: {x, y (top-left of the box), R, r, prefix, nodes: [{id, label, cls}], edges: [{a, b, cls}], start (deg)} */
  FL.graph = function (o) {
    const P = o.prefix || 'mg', n = o.nodes.length, r = o.r || 22;
    const R = o.R || Math.max(70, (n * (2 * r + 30)) / (2 * Math.PI));
    const cx = (o.x || 0) + R + r, cy = (o.y || 0) + R + r;
    const a0 = ((o.start === undefined ? -90 : o.start) * Math.PI) / 180;
    const pos = {};
    o.nodes.forEach((nd, i) => { const a = a0 + (2 * Math.PI * i) / n; pos[nd.id] = { x: r2(cx + R * Math.cos(a)), y: r2(cy + R * Math.sin(a)) }; });
    const items = [];
    for (const e of o.edges) items.push({ key: P + ':e:' + e.a + '-' + e.b, kind: 'edge', from: P + ':s:' + e.a, to: P + ':s:' + e.b, head: false, cls: 'merge-edge ' + (e.cls || ''), audit: 'edge-x' });
    for (const nd of o.nodes) items.push({ key: P + ':s:' + nd.id, kind: 'state', x: pos[nd.id].x, y: pos[nd.id].y, r, text: nd.label === undefined ? nd.id : nd.label, cls: 'merge-node ' + (nd.cls || ''), pick: !!o.pick });
    return { items, pos, box: { x: cx - R - r, y: cy - R - r, w: 2 * (R + r), h: 2 * (R + r) } };
  };

  // ---- the design flow as chips ------------------------------------------------------------------------------
  /** o: {x, y, steps: [text], at (index of the current step), prefix}; done steps tick, later ones wait */
  FL.chips = function (o) {
    const P = o.prefix || 'fc', items = [];
    let x = o.x || 0;
    const y = o.y || 0, h = 34;
    o.steps.forEach((t, i) => {
      const w = Geo().textWidth(t, 13, { bold: true }) + 22;
      items.push({ key: P + ':' + i, kind: 'cell', x, y, w, h, text: t, size: 13, cls: 'flow-chip ' + (i < o.at ? 'done' : i === o.at ? 'now' : 'later') });
      if (i + 1 < o.steps.length) items.push({ key: P + ':ar:' + i, kind: 'edge', from: P + ':' + i, to: P + ':' + (i + 1), cls: 'flow-arrow' });
      x += w + 26;
    });
    return { items, box: { x: o.x || 0, y, w: x - 26 - (o.x || 0), h } };
  };

  /** a text line of equations or notes, as a free text item */
  FL.line = (key, x, y, text, cls, size) => ({ key, kind: 'text', x, y, text, cls: /title/.test(cls || '') ? 'title' : 'fl-line ' + (cls || '') + (/note/.test(cls || '') ? '' : ' mono'), size: /title/.test(cls || '') ? undefined : size || 15 });
})(globalThis.Sirkit = globalThis.Sirkit || {});
