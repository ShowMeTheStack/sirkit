// Memory on the stage: an array of words (a row per word, a cell per bit) with its addresses, a chip drawn as a box
// with named pins, and wires between pins as runs of straight lines.
// S.Kit.mem.array({x, y, words, width, data: [numbers], prefix, cw, ch, sel (a row), hot: [[r, c]], cls(r, c),
//   label(r) -> the row's address text, title}) -> {items, box, cell(r, c), row(r)}: bit width−1 at the left.
// S.Kit.mem.chip({key, x, y, w, h, title, sub, pins: {left: [..], right: [..], top: [..], bottom: [..]}, cls})
//   -> {items, box, pin(name) -> {x, y}}: pin labels inside the box, a short stub outside for each pin.
// S.Kit.mem.wire(key, points, cls) -> line items along the points (right angles), drawn as one wire.
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const M = (K.mem = {});
  const Geo = () => S.geom;

  M.array = function (o) {
    const P = o.prefix || 'mem', n = o.words, w = o.width, CW = o.cw || 30, CH = o.ch || 26, gap = o.gap === undefined ? 3 : o.gap;
    const lab = o.label === null ? null : o.label || ((r) => r.toString(2).padStart(Math.max(1, Math.ceil(Math.log2(n))), '0'));
    const labW = lab ? Math.max(...[...Array(n).keys()].map((r) => Geo().textWidth(lab(r), 13, { mono: true }))) + 14 : 0;
    const x0 = (o.x || 0) + labW, y0 = (o.y || 0) + (o.title ? 24 : 0);
    const hot = new Set((o.hot || []).map((p) => p.join(',')));
    const items = [];
    if (o.title) items.push({ key: P + ':title', kind: 'text', x: o.x || 0, y: (o.y || 0) + 12, text: o.title, cls: 'title' });
    for (let r = 0; r < n; r++) {
      const y = y0 + r * (CH + gap);
      if (lab) items.push({ key: P + ':a' + r, kind: 'text', x: x0 - 8, y: y + CH / 2 + 5, text: lab(r), anchor: 'end', cls: 'p4-mono' + (r === o.sel ? ' hot' : ''), size: 13 });
      const v = (o.data || [])[r];
      for (let c = 0; c < w; c++) {
        const bit = v === undefined || v === null ? '' : typeof v === 'string' ? v[c] : String((v >> (w - 1 - c)) & 1);
        const cls = ['p4-bit', bit === '1' ? 'one' : '', r === o.sel ? 'act' : '', hot.has(r + ',' + c) ? 'hot' : '', o.cls ? o.cls(r, c, bit) || '' : ''].filter(Boolean).join(' ');
        items.push({ key: P + ':' + r + ',' + c, kind: 'cell', x: x0 + c * (CW + gap), y, w: CW, h: CH, text: bit, cls, size: o.size || 14 });
      }
    }
    const W = w * (CW + gap) - gap, H = n * (CH + gap) - gap;
    return {
      items, box: { x: o.x || 0, y: o.y || 0, w: labW + W, h: H + (o.title ? 24 : 0) },
      cell: (r, c) => ({ x: x0 + c * (CW + gap), y: y0 + r * (CH + gap), w: CW, h: CH }),
      row: (r) => ({ x: x0, y: y0 + r * (CH + gap), w: W, h: CH }),
      grid: { x: x0, y: y0, w: W, h: H },
    };
  };

  M.chip = function (o) {
    const P = o.key || 'chip', x = o.x || 0, y = o.y || 0, w = o.w || 120, h = o.h || 100, stub = o.stub === undefined ? 14 : o.stub;
    const items = [{ key: P, kind: 'region', x, y, w, h, rx: 6, text: '', cls: 'p4-box' + (o.cls ? ' ' + o.cls : ''), audit: 'group' }];
    if (o.title) items.push({ key: P + ':t', kind: 'text', x: x + w / 2, y: y + h / 2 + (o.sub ? -2 : 5), text: o.title, anchor: 'middle', cls: 'strong', size: o.titleSize || 15 });
    if (o.sub) items.push({ key: P + ':s', kind: 'text', x: x + w / 2, y: y + h / 2 + 16, text: o.sub, anchor: 'middle', cls: 'p4-note', size: 12 });
    const pins = {};
    const sides = o.pins || {};
    const place = (list, side) => {
      (list || []).forEach((nm, i) => {
        const n = list.length;
        let px, py, tx, ty, anchor;
        if (side === 'left' || side === 'right') { py = y + (h * (i + 1)) / (n + 1); px = side === 'left' ? x : x + w; tx = side === 'left' ? x + 6 : x + w - 6; ty = py + 4; anchor = side === 'left' ? 'start' : 'end'; }
        else { px = x + (w * (i + 1)) / (n + 1); py = side === 'top' ? y : y + h; tx = px; ty = side === 'top' ? y + 15 : y + h - 6; anchor = 'middle'; }
        const end = { x: px + (side === 'left' ? -stub : side === 'right' ? stub : 0), y: py + (side === 'top' ? -stub : side === 'bottom' ? stub : 0) };
        const label = typeof nm === 'string' ? nm : nm.label, id = typeof nm === 'string' ? nm : nm.id;
        if (label) items.push({ key: P + ':pl:' + id, kind: 'text', x: tx, y: ty, text: label, anchor, cls: 'p4-note', size: 11 });
        if (stub) items.push({ key: P + ':ps:' + id, kind: 'line', x1: px, y1: py, x2: end.x, y2: end.y, cls: 'p4-wire', audit: 'edge-x' });
        pins[id] = end;
      });
    };
    place(sides.left, 'left'); place(sides.right, 'right'); place(sides.top, 'top'); place(sides.bottom, 'bottom');
    return { items, box: { x: x - stub, y: y - stub, w: w + 2 * stub, h: h + 2 * stub }, pin: (n) => pins[n] };
  };

  M.wire = function (key, pts, cls) {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) continue;
      out.push({ key: key + ':' + i, kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, cls: 'p4-wire' + (cls ? ' ' + cls : ''), audit: 'edge-x' });
    }
    return out;
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
