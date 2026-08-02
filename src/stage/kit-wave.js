// Waveforms on the stage: one row per signal, its name on the left, a step line for a single bit or a bus with
// its values written in, a time axis under them and an optional cursor. S.Kit.wave.draw(opts) returns
// {items, box, xOf(t)}. opts: {x, y, w (the plot's width), rowH, gap, t0, t1, signals: [{name, changes:
// [[t, v]..], width, cls}], prefix, cursor (a time), ticks (how many labels on the axis), unit ('ns')}
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const W = (K.wave = {});
  const Geo = () => S.geom;

  W.draw = function (o) {
    const P = o.prefix || 'wv', x0 = o.x || 0, y0 = o.y || 0, rowH = o.rowH || 26, gap = o.gap || 16;
    const sigs = o.signals || [];
    const t0 = o.t0 || 0;
    const t1 = o.t1 !== undefined ? o.t1 : Math.max(t0 + 1, ...sigs.flatMap((s) => (s.changes || []).map((c) => c[0] + 1)));
    const nameW = Math.max(30, ...sigs.map((s) => Geo().textWidth(s.name, 14, { bold: true }))) + 14;
    const px = x0 + nameW, w = o.w || 480;
    const xOf = (t) => px + ((t - t0) / Math.max(1e-9, t1 - t0)) * w;
    const items = [];
    sigs.forEach((s, i) => {
      const y = y0 + i * (rowH + gap);
      items.push({ key: P + ':n:' + s.name, kind: 'text', x: px - 12, y: y + rowH / 2 + 5, text: s.name, anchor: 'end', cls: 'strong' + (s.cls ? ' ' + s.cls : '') });
      items.push({ key: P + ':w:' + s.name, kind: 'wave', x: px, y, w, h: rowH, t0, t1, changes: s.changes || [], width: s.width || 1, cls: s.cls || '', audit: 'edge' });
    });
    const yAxis = y0 + sigs.length * (rowH + gap) - gap + 22;
    const n = o.ticks === undefined ? 4 : o.ticks;
    for (let k = 0; k <= n && n > 0; k++) {
      const t = t0 + ((t1 - t0) * k) / n, label = (Math.round(t * 10) / 10) + (k === n && o.unit !== '' ? ' ' + (o.unit || 'ns') : '');
      items.push({ key: P + ':t:' + k, kind: 'text', x: xOf(t), y: yAxis, text: label, anchor: k === 0 ? 'start' : k === n ? 'end' : 'middle', cls: 'wave-t' });
    }
    if (o.cursor !== undefined && o.cursor !== null) {
      const cx = xOf(Math.max(t0, Math.min(t1, o.cursor)));
      // a cursor is drawn over the rows on purpose
      items.push({ key: P + ':cursor', kind: 'line', x1: cx, y1: y0 - 8, x2: cx, y2: yAxis - 14, cls: 'cursor', audit: 'ignore', layer: 'top' });
    }
    return { items, xOf, box: { x: x0, y: y0 - 8, w: nameW + w, h: yAxis - y0 + 14 } };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
