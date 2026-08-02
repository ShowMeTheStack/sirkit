// Tables and grids on the stage: truth tables, state tables, excitation and implication tables, QM columns.
// Headers, cell highlights, arrows from the cells an entry came from (provenance), and elision of the middle of a
// large table. S.Kit.table.html builds the same table as HTML with sticky headers, for panels that scroll.
(function (S) {
  'use strict';
  const Geo = S.geom;
  const K = (S.Kit = S.Kit || {});
  const TB = (K.table = {});

  const cellText = (v) => (v === null || v === undefined ? '' : typeof v === 'object' && !Array.isArray(v) ? v : { text: v });
  const linesOf = (v) => { const c = cellText(v); if (c.lines) return c.lines.map(String); const t = Array.isArray(c) ? c.join(', ') : String(c.text === undefined ? '' : c.text); return t.split('\n'); };

  /** Which rows (or columns) to show when there are more than max: the first ones, a gap, the last ones */
  TB.keep = function (n, max, focus) {
    if (!max || n <= max) return [...Array(n).keys()];
    const head = Math.ceil((max - 1) / 2), tail = max - 1 - head;
    let lo = [...Array(head).keys()], hi = [...Array(tail).keys()].map((i) => n - tail + i);
    // keep the focused row in view, in place of the nearest kept one
    if (focus !== undefined && focus >= head && focus < n - tail) lo = lo.slice(0, -1).concat([focus]);
    return lo.concat([-1], hi);
  };

  /**
   * A table. opts: {rows: [[cell]] where a cell is text, [items], or {text | lines, cls}; colHead, rowHead,
   *   corner, x, y, prefix, cw (fixed column width), ch (row height), hot: [[r, c]], act: [[r, c]],
   *   cls(r, c, v) -> classes, skip(r, c) -> true for no cell at all (a triangle), maxRows, maxCols,
   *   focus: [r, c] kept in view when elided, arrows: [{from: [r, c], to: [r, c], cls}], title, size}
   * Returns {items, key(r, c), box}.
   */
  TB.draw = function (opts) {
    const P = opts.prefix || 'tb';
    const rows = opts.rows || [];
    const nR = rows.length, nC = Math.max(0, ...rows.map((r) => r.length), (opts.colHead || []).length);
    const fs = opts.size || 15;
    const rk = TB.keep(nR, opts.maxRows, opts.focus && opts.focus[0]), ck = TB.keep(nC, opts.maxCols, opts.focus && opts.focus[1]);
    // column widths and row heights from what is in them
    const cw = ck.map((c) => {
      if (opts.cw) return opts.cw;
      if (c < 0) return 34;
      let w = Geo.textWidth((opts.colHead || [])[c] || '', 14, { bold: true }) + 18;
      for (const r of rk) if (r >= 0 && !(opts.skip && opts.skip(r, c))) for (const l of linesOf(rows[r][c])) w = Math.max(w, Geo.textWidth(l, fs, { mono: opts.mono }) + 20);
      return Math.max(opts.minW || 44, Math.ceil(w));
    });
    const rh = rk.map((r) => (opts.ch ? opts.ch : r < 0 ? 30 : Math.max(opts.minH || 40, Math.max(1, ...((rows[r] || []).map((v) => linesOf(v).length))) * (fs * 1.2) + 16)));
    const rowHeadW = opts.rowHead ? Math.max(40, ...opts.rowHead.map((t) => Geo.textWidth(t, 14, { bold: true }) + 22), Geo.textWidth(opts.corner || '', 13, { bold: true }) + 18) : 0;
    const headH = opts.colHead ? 34 : 0;
    const x0 = (opts.x || 0) + rowHeadW, y0 = (opts.y || 0) + headH;
    const cx = [], ry = [];
    cw.reduce((x, w, i) => { cx[i] = x; return x + w; }, x0);
    rh.reduce((y, h, i) => { ry[i] = y; return y + h; }, y0);
    const W = cw.reduce((a, b) => a + b, 0), H = rh.reduce((a, b) => a + b, 0);
    const hot = new Set((opts.hot || []).map((p) => p.join(','))), act = new Set((opts.act || []).map((p) => p.join(',')));
    const key = (r, c) => P + ':' + r + ',' + c;
    const items = [];
    if (opts.title) items.push({ key: P + ':title', kind: 'text', x: opts.x || 0, y: (opts.y || 0) - 12, text: opts.title, cls: 'title' });
    if (opts.corner && opts.rowHead && opts.colHead) items.push({ key: P + ':corner', kind: 'cell', x: opts.x || 0, y: opts.y || 0, w: rowHeadW, h: headH, text: opts.corner, cls: 'head', rx: 0, size: 13 });
    if (opts.colHead) ck.forEach((c, i) => items.push({ key: P + ':ch:' + c, kind: 'cell', x: cx[i], y: opts.y || 0, w: cw[i], h: headH, text: c < 0 ? '⋯' : opts.colHead[c], cls: 'head' + (c < 0 ? ' elide' : ''), rx: 0 }));
    if (opts.rowHead) rk.forEach((r, j) => items.push({ key: P + ':rh:' + r, kind: 'cell', x: opts.x || 0, y: ry[j], w: rowHeadW, h: rh[j], text: r < 0 ? '⋮' : opts.rowHead[r], cls: 'head' + (r < 0 ? ' elide' : ''), rx: 0 }));
    rk.forEach((r, j) => ck.forEach((c, i) => {
      if (r < 0 || c < 0) {
        if (r < 0 && c < 0) return;
        items.push({ key: P + ':el:' + r + ',' + c, kind: 'cell', x: cx[i], y: ry[j], w: cw[i], h: rh[j], text: r < 0 ? '⋮' : '⋯', cls: 'elide' });
        return;
      }
      if (opts.skip && opts.skip(r, c)) return;
      const v = rows[r] ? rows[r][c] : undefined;
      const ct = cellText(v);
      const lines = linesOf(v);
      const empty = lines.length === 1 && lines[0] === '';
      const cls = ['tcell', opts.mono ? 'mono' : '', hot.has(r + ',' + c) ? 'hot' : '', act.has(r + ',' + c) ? 'act' : '', ct && ct.cls ? ct.cls : '', opts.cls ? opts.cls(r, c, v) || '' : ''].filter(Boolean).join(' ');
      const it = { key: key(r, c), kind: 'cell', x: cx[i], y: ry[j], w: cw[i], h: rh[j], rx: 0, cls, pick: true };
      if (lines.length > 1) it.lines = lines; else it.text = empty ? (opts.emptyText || '') : lines[0];
      if (opts.size) it.size = opts.size;
      items.push(it);
    }));
    for (const a of opts.arrows || []) {
      if (!rk.includes(a.from[0]) || !rk.includes(a.to[0]) || !ck.includes(a.from[1]) || !ck.includes(a.to[1])) continue;
      // provenance arrows are drawn over the table on purpose: they may pass over other cells
      // a short arrow between neighbours bows out further, so it reads as an arrow and not a hook
      const fi = ck.indexOf(a.from[1]), fj = rk.indexOf(a.from[0]), ti = ck.indexOf(a.to[1]), tj = rk.indexOf(a.to[0]);
      const dist = Math.hypot(cx[fi] + cw[fi] / 2 - cx[ti] - cw[ti] / 2, ry[fj] + rh[fj] / 2 - ry[tj] - rh[tj] / 2);
      const b0 = a.bend === undefined ? 26 : a.bend;
      const bend = dist < 90 ? Math.sign(b0 || 1) * Math.max(Math.abs(b0), 44) : b0;
      items.push({ key: P + ':ar:' + a.from.join(',') + '>' + a.to.join(','), kind: 'edge', from: key(a.from[0], a.from[1]), to: key(a.to[0], a.to[1]), bend, gapA: -Math.min(cw[fi], rh[fj]) * 0.32, gapB: -Math.min(cw[ti], rh[tj]) * 0.32 + 1.5, cls: 'prov ' + (a.cls || ''), audit: 'ignore', layer: 'top' });
    }
    const box = { x: opts.x || 0, y: (opts.y || 0) - (opts.title ? 26 : 0), w: rowHeadW + W, h: headH + H + (opts.title ? 26 : 0) };
    return { items, key, box, cellBox: (r, c) => { const i = ck.indexOf(c), j = rk.indexOf(r); return i < 0 || j < 0 ? null : { x: cx[i], y: ry[j], w: cw[i], h: rh[j] }; } };
  };

  /**
   * The same table as an HTML element with sticky headers (for side panels). spec: {colHead, rowHead,
   * rows, corner, hl: ['r,c' or 'r'] lit cells or rows, maxRows}
   */
  TB.html = function (spec) {
    const doc = globalThis.document;
    const el = (t, cls, txt) => { const e = doc.createElement(t); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
    const wrap = el('div', 'dtable-wrap'), tbl = el('table', 'dtable');
    wrap.appendChild(tbl);
    const hl = new Set((spec.hl || []).map(String));
    if (spec.colHead) {
      const tr = el('tr');
      if (spec.rowHead) tr.appendChild(el('th', '', spec.corner || ''));
      for (const h of spec.colHead) tr.appendChild(el('th', '', h));
      const th = el('thead'); th.appendChild(tr); tbl.appendChild(th);
    }
    const tb = el('tbody');
    const rows = spec.rows || [];
    const keep = TB.keep(rows.length, spec.maxRows);
    for (const r of keep) {
      const tr = el('tr', r < 0 ? 'elide' : '');
      if (r < 0) { const td = el('td', '', '⋮ ' + (rows.length - keep.length + 1) + ' more rows'); td.colSpan = (spec.colHead || rows[0] || []).length + (spec.rowHead ? 1 : 0); tr.appendChild(td); tb.appendChild(tr); continue; }
      if (hl.has(String(r)) || (spec.rowIds && hl.has(String(spec.rowIds[r])))) tr.classList.add('hl');
      if (spec.rowHead) tr.appendChild(el('th', '', spec.rowHead[r]));
      rows[r].forEach((v, c) => {
        const t = v === null || v === undefined || v === '' ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? (v.text || '') : String(v);
        const td = el('td', t === '' ? 'empty' : '', t === '' ? (spec.emptyText || '–') : t);
        td.dataset.rc = r + ',' + c;
        if (hl.has(r + ',' + c)) td.classList.add('hl');
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    return wrap;
  };

  TB.demos = [
    { name: 'table: a triangle with provenance arrows', frames: () => {
      const n = 4;
      const rows = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (c < n - r ? (r === 0 ? 'A' : r === 1 ? 'S, B' : r === 2 ? '∅' : 'S') : null)));
      const sk = (r, c) => c >= n - r;
      return [
        { items: TB.draw({ rows, skip: sk, rowHead: ['1', '2', '3', '4'], colHead: ['b', 'a', 'a', 'b'], corner: 'len', hot: [[1, 1]], arrows: [{ from: [0, 1], to: [1, 1], bend: -30 }, { from: [0, 2], to: [1, 1], cls: 'b', bend: 30 }], cls: (r, c) => (r === 0 && c === 1 ? 'src-a' : r === 0 && c === 2 ? 'src-b' : '') }).items, say: 'A cell is filled from the two cells it splits into.' },
      ];
    } },
    { name: 'table: a large table with elision', frames: () => {
      const rows = Array.from({ length: 20 }, (_, r) => Array.from({ length: 14 }, (_, c) => ((r * 7 + c * 3) % 5 ? '' : 'x')));
      return [{ items: TB.draw({ rows, rowHead: rows.map((_, r) => 'q' + r), colHead: rows[0].map((_, c) => 'c' + c), maxRows: 9, maxCols: 9, act: [[3, 2]], title: 'a table too big to show whole' }).items, say: 'The middle rows and columns are left out; the ⋮ and ⋯ show where.' }];
    } },
  ];
})(globalThis.Sirkit = globalThis.Sirkit || {});
