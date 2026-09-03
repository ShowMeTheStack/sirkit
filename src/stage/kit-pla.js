// Programmable logic arrays on the stage: an AND plane (each input as a true and a complement column, one row
// per product term, a dot where a term takes a literal) feeding an OR plane (one column per output, a dot where
// an output takes a term). The same drawing serves a PLA (both planes programmable), a PAL (the OR plane fixed)
// and a ROM (the AND plane a fixed decoder, one row per address). Wires carrying 1 are lit.
// S.Kit.pla.draw({x, y, prefix, inputs: [names], rows: [{label, lits: {name: 1 | 0}, unused} | for a ROM {label}],
//   outputs: [names], or: (row, output) -> bool, decoder: true for a ROM, fixedOr: true for a PAL,
//   env: {name: 0|1} (lights the wires), hotRow, hotOut, blown: true to draw unused fuse spots faintly})
//   -> {items, box, rowValue(r), outValue(k)}
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const PL = (K.pla = {});

  PL.draw = function (o) {
    const P = o.prefix || 'pla', x0 = (o.x || 0), y0 = (o.y || 0);
    const ins = o.inputs || [], rows = o.rows || [], outs = o.outputs || [];
    const colW = o.colW || 34, rowH = o.rowH || 34, top = 34;
    const env = o.env || null;
    const items = [];
    // the AND plane: two columns per input, or a decoder box for a ROM
    const andW = o.decoder ? 96 : ins.length * 2 * colW;
    const ax = x0 + 46, ay = y0 + top;
    const rowY = (r) => ay + 24 + r * rowH;
    const bottom = rowY(rows.length - 1) + 24;
    const colX = (i, comp) => ax + (2 * i + (comp ? 1 : 0)) * colW + colW / 2;
    const litVal = (name, comp) => (env ? (comp ? 1 - env[name] : env[name]) : null);
    const rowVal = rows.map((r, ri) => {
      if (!env) return null;
      if (o.decoder) return ri === ins.reduce((s, v) => s * 2 + env[v], 0) ? 1 : 0;
      if (r.unused) return 0;
      return Object.keys(r.lits).every((v) => (r.lits[v] ? env[v] : 1 - env[v]) === 1) ? 1 : 0;
    });
    const vcls = (v) => (v === 1 ? ' v1' : '');
    if (o.decoder) {
      items.push({ key: P + ':dec', kind: 'region', x: ax, y: ay, w: andW, h: bottom - ay, rx: 6, cls: 'p4-box', audit: 'group', text: '' });
      items.push({ key: P + ':dect', kind: 'text', x: ax + 14, y: ay + 18, text: 'decoder', cls: 'p4-note', size: 12 });
      ins.forEach((v, i) => {
        const ix = ax + 14 + i * 26;
        items.push({ key: P + ':in:' + v, kind: 'text', x: ix, y: y0 + 12, text: v, anchor: 'middle', cls: 'strong', size: 14 });
        items.push({ key: P + ':inl:' + v, kind: 'line', x1: ix, y1: y0 + 18, x2: ix, y2: ay, cls: 'p4-wire' + vcls(env && env[v]), audit: 'edge-x' });
      });
      rows.forEach((r, ri) => items.push({ key: P + ':rl:' + ri, kind: 'text', x: ax + andW - 8, y: rowY(ri) + 4, text: r.label, anchor: 'end', cls: 'p4-mono' + (ri === o.hotRow ? ' hot' : ''), size: 12 }));
    } else {
      ins.forEach((v, i) => {
        for (const comp of [false, true]) {
          const x = colX(i, comp), val = litVal(v, comp);
          items.push({ key: P + ':cl:' + v + (comp ? "'" : ''), kind: 'text', x, y: y0 + 12, text: v + (comp ? '′' : ''), anchor: 'middle', cls: 'strong', size: 14 });
          items.push({ key: P + ':c:' + v + (comp ? "'" : ''), kind: 'line', x1: x, y1: y0 + 18, x2: x, y2: bottom, cls: 'p4-wire' + vcls(val), audit: 'edge-x' });
        }
      });
      rows.forEach((r, ri) => items.push({ key: P + ':rl:' + ri, kind: 'text', x: x0 + 36, y: rowY(ri) + 4, text: r.label, anchor: 'end', cls: 'p4-mono' + (ri === o.hotRow ? ' hot' : ''), size: 12 }));
    }
    // product rows, each through an AND gate (a small box) into the OR plane
    const gx = ax + andW + 14, gw = o.decoder ? 0 : 30, ox = gx + gw + 30;
    const outX = (k) => ox + k * colW * 1.4 + colW / 2;
    const orRight = outX(outs.length - 1) + colW / 2 + 6;
    rows.forEach((r, ri) => {
      const y = rowY(ri), v = rowVal[ri];
      const lit = ri === o.hotRow ? ' hot' : '';
      if (!o.decoder) {
        items.push({ key: P + ':ra:' + ri, kind: 'line', x1: ax - 6, y1: y, x2: gx, y2: y, cls: 'p4-wire' + vcls(v) + lit, audit: 'edge-x' });
        items.push({ key: P + ':g:' + ri, kind: 'cell', x: gx, y: y - 11, w: gw, h: 22, text: '&', cls: 'p8-gate' + (v === 1 ? ' on' : ''), size: 12 });
        // the dots of the AND plane
        ins.forEach((nm, i) => {
          for (const comp of [false, true]) {
            // an unused row keeps every fuse: it takes A and A′ together, so it is always 0
            const used = r.unused || (r.lits[nm] !== undefined && (r.lits[nm] ? !comp : comp));
            if (!used && !o.blown) continue;
            items.push({ key: P + ':ad:' + ri + ':' + nm + (comp ? "'" : ''), kind: 'token', x: colX(i, comp), y, r: used ? 4.5 : 2.5, text: '', cls: 'p8-fuse' + (used ? '' : ' blown') + (used && env && litVal(nm, comp) === 1 ? ' on' : ''), audit: 'overlap-ok' });
          }
        });
      }
      items.push({ key: P + ':ro:' + ri, kind: 'line', x1: o.decoder ? ax + andW : gx + gw, y1: y, x2: orRight, y2: y, cls: 'p4-wire' + vcls(v) + lit, audit: 'edge-x' });
    });
    // the OR plane: a column per output down to its OR gate
    const outVal = outs.map((nm, k) => (env ? (rows.some((r, ri) => o.or(ri, k) && rowVal[ri] === 1) ? 1 : 0) : null));
    const gy = bottom + 12;
    outs.forEach((nm, k) => {
      const x = outX(k), v = outVal[k], hot = k === o.hotOut ? ' hot' : '';
      items.push({ key: P + ':oc:' + k, kind: 'line', x1: x, y1: ay + 6, x2: x, y2: gy, cls: 'p4-wire' + vcls(v) + hot, audit: 'edge-x' });
      items.push({ key: P + ':og:' + k, kind: 'cell', x: x - 15, y: gy, w: 30, h: 22, text: '≥1', cls: 'p8-gate' + (v === 1 ? ' on' : ''), size: 11 });
      items.push({ key: P + ':ol:' + k, kind: 'line', x1: x, y1: gy + 22, x2: x, y2: gy + 40, cls: 'p4-wire' + vcls(v), audit: 'edge-x' });
      items.push({ key: P + ':on:' + k, kind: 'text', x, y: gy + 56, text: nm, anchor: 'middle', cls: 'strong' + (v === 1 ? ' good' : ''), size: 14 });
      if (v !== null) items.push({ key: P + ':ov:' + k, kind: 'text', x, y: gy + 74, text: String(v), anchor: 'middle', cls: 'p4-mono' + (v === 1 ? ' good' : ''), size: 14 });
      rows.forEach((r, ri) => {
        const used = o.or(ri, k);
        if (!used && !o.blown) return;
        items.push({ key: P + ':od:' + ri + ':' + k, kind: 'token', x, y: rowY(ri), r: used ? 4.5 : 2.5, text: '', cls: 'p8-fuse' + (used ? '' : ' blown') + (o.fixedOr && used ? ' fixed' : '') + (used && rowVal[ri] === 1 ? ' on' : ''), audit: 'overlap-ok' });
      });
    });
    const W = orRight - x0 + 10, H = gy + 100 - y0;
    // the two planes, named
    items.push({ key: P + ':andn', kind: 'text', x: ax, y: gy + 94, text: o.decoder ? 'AND plane: fixed (a decoder)' : 'AND plane' + (o.fixedAnd ? ' (fixed)' : ' (programmable)'), cls: 'p4-note', size: 12 });
    items.push({ key: P + ':orn', kind: 'text', x: ox - 10, y: y0 + 12, text: 'OR plane' + (o.fixedOr ? ' (fixed)' : ' (programmable)'), cls: 'p4-note', size: 12 });
    return { items, box: { x: x0, y: y0, w: W, h: H }, rowValue: (r) => rowVal[r], outValue: (k) => outVal[k], rowY, outX };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
