// Part symbols: their size and pin positions on the routing grid (shared by both styles, so a circuit lays
// out the same either way), and their SVG. Distinctive shapes by default (the AND's D, the OR's curved
// shield, the XOR's extra arc, inversion bubbles); the rectangular style ("&", "≥1", "=1") is a setting.
// Sizes are in grid units of U pixels; drawing is in pixels, with the part's top-left corner at 0,0.
(function (S) {
  'use strict';
  const Sym = S.Symbols = {};
  const U = Sym.U = 10;
  const N = S.Netlist;
  const FONT = Sym.FONT = { pin: 10, port: 12, title: 12, net: 11 };

  /** a safe (slightly generous) estimate of a text's width in pixels */
  const textWidth = Sym.textWidth = (s, size) => {
    let w = 0;
    for (const ch of String(s).replace(/'$/, '')) w += /[il1.,:;|!']/.test(ch) ? 0.34 : /[mwMW@]/.test(ch) ? 0.92 : /[A-Z0-9≥=&]/.test(ch) ? 0.7 : 0.58;
    return Math.ceil(w * size + 1);
  };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  /** a text element; a trailing ' is drawn as a bar over the name (Q' → Q̄) */
  let upright = false;
  // Sym.textScale enlarges every text drawn (S.Render.svg sets it for one drawing: opts.textScale)
  Sym.textScale = 1;
  // how far a pin's name may grow with it (it sits inside its part's body)
  Sym.pinCap = 1.1;
  Sym.text = (s, x, y, size, anchor, cls, extra) => {
    // a pin's or a port's name sits inside its part's body, sized for it: it grows only a little
    if (Sym.textScale !== 1) size = Math.round(size * (/sk-(pin|port)-t/.test(cls || '') ? Math.min(Sym.textScale, Sym.pinCap || 1.1) : Sym.textScale) * 10) / 10;
    if (upright) extra = (extra || '') + ` transform="rotate(-90 ${x} ${y})"`;
    s = String(s);
    const bar = /^[^']+'$/.test(s);
    const body = bar ? '<tspan class="sk-bar">' + esc(s.slice(0, -1)) + '</tspan>' : esc(s);
    return `<text data-audit="label" class="${cls || 'sk-t'}" x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor || 'middle'}" dominant-baseline="central"${extra || ''}>${body}</text>`;
  };

  const gateInputs = (part) => part.pins.filter((p) => p.dir === 'in').length;
  const bubbled = (t) => t === 'NAND' || t === 'NOR' || t === 'XNOR' || t === 'NOT';

  /** size and pins of a part, in grid units: {w, h, pins: {name: {x, y, side}}, kind, ...} */
  function geom(part) {
    if (part._geom) return part._geom;
    const t = part.type, p = part.params || {};
    let g;
    if (N.GATES.has(t)) {
      if (t === 'NOT' || t === 'BUF') g = { kind: 'gate', w: 3, h: 2, pins: { i0: { x: 0, y: 1, side: 'left' }, y: { x: 3, y: 1, side: 'right' } } };
      else {
        const n = gateInputs(part), h = Math.max(4, 2 * n), body = 3 + h / 2 + (t === 'XOR' || t === 'XNOR' ? 1 : 0);
        const w = body + (bubbled(t) ? 1 : 0);
        const pins = { y: { x: w, y: h / 2, side: 'right' } };
        for (let i = 0; i < n; i++) pins['i' + i] = { x: 0, y: (h - 2 * n) / 2 + 2 * i + 1, side: 'left' };
        g = { kind: 'gate', w, h, body, pins };
      }
    } else if (t === 'IN' || t === 'OUT' || t === 'CLOCK') {
      const tw = textWidth(p.name, FONT.port) + (t === 'CLOCK' ? 18 : 0);
      const w = Math.ceil((tw + 22) / U);
      g = { kind: 'port', w, h: 2, pins: t === 'OUT' ? { a: { x: 0, y: 1, side: 'left' } } : { y: { x: w, y: 1, side: 'right' } } };
    } else if (t === 'CONST') {
      g = { kind: 'const', w: 2, h: 2, pins: { y: { x: 2, y: 1, side: 'right' } } };
    } else if (t === 'TRI') {
      // a buffer triangle with its enable coming down onto the upper edge
      g = { kind: 'tri', w: 4, h: 4, pins: { a: { x: 0, y: 2, side: 'left' }, y: { x: 4, y: 2, side: 'right' }, en: { x: 2, y: 0, side: 'top' } } };
    } else if (t === 'MUX') {
      const ins = part.pins.filter((q) => q.side === 'left'), bot = part.pins.filter((q) => q.side === 'bottom'), top = part.pins.filter((q) => q.side === 'top');
      const n = ins.length, h = 2 * n + 2, w = Math.max(4, 2 * bot.length + 2);
      const pins = { y: { x: w, y: h / 2, side: 'right' } };
      ins.forEach((q, i) => { pins[q.name] = { x: 0, y: 2 + 2 * i, side: 'left' }; });
      bot.forEach((q, i) => { pins[q.name] = { x: (w - 2 * (bot.length - 1)) / 2 + 2 * i, y: h, side: 'bottom' }; });
      top.forEach((q, i) => { pins[q.name] = { x: w / 2, y: 0, side: 'top' }; });
      g = { kind: 'mux', w, h, pins };
    } else g = blockGeom(part);
    part._geom = g;
    return g;
  }
  function blockGeom(part, sides, spread) {
    spread = spread || 2;
    const p = part.params || {};
    const sideOf = (q) => (sides && sides[q.name]) || (q.clock && sides && sides.clock) || q.side;
    const side = (s) => part.pins.filter((q) => sideOf(q) === s);
    const L = side('left'), R = side('right'), T = side('top'), B = side('bottom');
    const lab = (q) => (q.clock ? 8 : q.label ? textWidth(q.label, FONT.pin) : 0);
    const title = blockTitle(part);
    const rows = Math.max(L.length, R.length, 1);
    const y0 = T.length ? 3 : 2;
    const h = y0 + 2 * (rows - 1) + (B.length ? 3 : 2);
    const maxL = Math.max(0, ...L.map(lab)), maxR = Math.max(0, ...R.map(lab));
    const tw = title ? textWidth(title, FONT.title) * 1.08 : 0;
    const across = Math.max(0, ...T.map(lab), ...B.map(lab));
    let wpx = 8 + maxL + (title ? 10 + tw + 10 : 14) + maxR + 8;
    wpx = Math.max(wpx, ((Math.max(T.length, B.length) - 1) * spread + 4) * U, across + 2 * maxL + 30);
    let w = Math.max(4, Math.ceil(wpx / U));
    if (w % 2) w++;
    const pins = {};
    L.forEach((q, i) => { pins[q.name] = { x: 0, y: y0 + (rows - L.length) + 2 * i, side: 'left' }; });
    R.forEach((q, i) => { pins[q.name] = { x: w, y: y0 + (rows - R.length) + 2 * i, side: 'right' }; });
    const at = (n, i) => Math.round((w - spread * (n - 1)) / 2) + spread * i;
    T.forEach((q, i) => { pins[q.name] = { x: at(T.length, i), y: 0, side: 'top' }; });
    B.forEach((q, i) => { pins[q.name] = { x: at(B.length, i), y: h, side: 'bottom' }; });
    return { kind: 'block', w, h, pins, title };
  }
  function blockTitle(part) {
    const p = part.params || {};
    if (p.title != null) return p.title;
    switch (part.type) {
      case 'FA': return 'FA';
      case 'DECODER': return (p.k || 2) + ':' + (1 << (p.k || 2));
      case 'REG': return p.name || 'REG';
      case 'COUNTER': return p.name || 'CTR';
      case 'ALU': return 'ALU';
      default: return '';
    }
  }
  Sym.geom = geom;

  /**
   * A variant of a part's symbol for one layout (never cached on the part):
   *   sides:  {pin: side} for a block (and {clock: side} for its clock pin)
   *   inRows: rows of a gate's inputs, i0 first: the gate is stretched so its inputs meet wires on those rows
   *           (a body of the usual size, with its input edge carried on as a straight spine)
   *   orient: 'down' turns a gate or a multiplexer so signals flow downwards (inputs on top), and makes a port
   *           a flag pointing down (an input with its pin below, an output with its pin above)
   */
  Sym.variant = function (part, o) {
    o = o || {};
    const t = part.type;
    let g;
    if ((t === 'IN' || t === 'OUT' || t === 'CLOCK') && o.orient === 'down') {
      const tw = textWidth(part.params.name, FONT.port) + (t === 'CLOCK' ? 18 : 0);
      let w = Math.max(4, Math.ceil((tw + 12) / U)); if (w % 2) w++;
      g = { kind: 'port', down: true, w, h: 3, pins: t === 'OUT' ? { a: { x: w / 2, y: 0, side: 'top' } } : { y: { x: w / 2, y: 3, side: 'bottom' } } };
      return g;
    }
    if ((t === 'IN' || t === 'CLOCK') && o.orient === 'up') {
      // a flag pointing up, from below: its pin on top
      const tw = textWidth(part.params.name, FONT.port) + (t === 'CLOCK' ? 18 : 0);
      let w = Math.max(4, Math.ceil((tw + 12) / U)); if (w % 2) w++;
      return { kind: 'port', up: true, w, h: 3, pins: { y: { x: w / 2, y: 0, side: 'top' } } };
    }
    if (t === 'MUX' && o.inRows) {
      // a multiplexer as tall as the rows its inputs come in on
      const base = geom(part), ins = part.pins.filter((q) => q.side === 'left'), rows = o.inRows;
      const r0 = Math.min(...rows), h = Math.max(...rows) - r0 + 4;
      const pins = {};
      ins.forEach((q, i) => { pins[q.name] = { x: 0, y: rows[i] - r0 + 2, side: 'left' }; });
      pins.y = { x: base.w, y: Math.round(h / 2), side: 'right' };
      for (const [k, q] of Object.entries(base.pins)) if (q.side === 'bottom' || q.side === 'top') pins[k] = { x: q.x, y: q.side === 'bottom' ? h : 0, side: q.side };
      return { kind: 'mux', w: base.w, h, pins, top: r0 - 2 };
    }
    if ((t === 'IN' || t === 'OUT' || t === 'CLOCK') && o.orient === 'left') {
      // a flag pointing left: an input entering from the right, an output leaving to the left
      g = Object.assign({}, geom(part), { left: true });
      g.pins = t === 'OUT' ? { a: { x: g.w, y: 1, side: 'right' } } : { y: { x: 0, y: 1, side: 'left' } };
      return g;
    }
    if (t === 'CONST' && o.orient === 'down') return { kind: 'const', w: 2, h: 2, pins: { y: { x: 1, y: 2, side: 'bottom' } } };
    if (o.sides && !N.GATES.has(t) && t !== 'MUX' && t !== 'TRI') {
      g = blockGeom(part, o.sides, o.spread);
      if (o.rows) {
        // side pins on given rows (a decoder whose outputs meet the registers they load)
        g = Object.assign({}, g, { pins: Object.assign({}, g.pins) });
        for (const [k, r] of Object.entries(o.rows)) g.pins[k] = Object.assign({}, g.pins[k], { y: r });
        const hasBottom = Object.values(g.pins).some((q) => q.side === 'bottom');
        g.h = Math.max(g.h, Math.max(...Object.values(o.rows)) + (hasBottom ? 4 : 2));
        for (const q of Object.values(g.pins)) if (q.side === 'bottom') q.y = g.h;
      }
    }
    else if (o.inRows && N.GATES.has(t) && t !== 'NOT' && t !== 'BUF') {
      const n = o.inRows.length, rows = o.inRows.slice();
      const hb = Math.min(8, Math.max(4, 2 * n));
      const r0 = Math.min(...rows), r1 = Math.max(...rows);
      let ys = rows.map((r) => r - r0 + 1), h = r1 - r0 + 2;
      let outY = Math.round((Math.min(...ys) + Math.max(...ys)) / 2 + 1e-9);
      if (o.outRow != null) outY = o.outRow - r0 + 1;
      let by = outY - hb / 2;
      if (by < 0) { ys = ys.map((y) => y - by); outY -= by; h -= by; by = 0; }
      if (by + hb > h) h = by + hb;
      const xor = t === 'XOR' || t === 'XNOR';
      const body = 3 + hb / 2 + (xor ? 1 : 0), w = body + (bubbled(t) ? 1 : 0);
      const pins = { y: { x: w, y: outY, side: 'right' } };
      ys.forEach((y, i) => { pins['i' + i] = { x: 0, y, side: 'left' }; });
      g = { kind: 'gate', w, h, body, hb, by, pins, top: rows[0] - ys[0] };
    } else g = Object.assign({}, geom(part));
    if (o.orient === 'down' && (g.kind === 'gate' || g.kind === 'mux' || g.kind === 'tri')) {
      const rot = { left: 'top', right: 'bottom', top: 'right', bottom: 'left' };
      const pins = {};
      for (const [k, q] of Object.entries(g.pins)) pins[k] = { x: g.h - q.y, y: q.x, side: rot[q.side] };
      g = Object.assign({}, g, { base: g, w: g.h, h: g.w, pins, down: true });
    }
    return g;
  };

  // ---- drawing ------------------------------------------------------------------------------------------------
  const lead = (x1, y1, x2, y2) => `<path class="sk-lead" d="M${x1} ${y1}H${x2}${y2 !== y1 ? 'V' + y2 : ''}"/>`;
  const vlead = (x, y1, y2) => `<path class="sk-lead" d="M${x} ${y1}V${y2}"/>`;
  const bubble = (cx, cy) => `<circle class="sk-body" cx="${cx}" cy="${cy}" r="4"/>`;

  function drawGate(part, g, rect) {
    const t = part.type, W = g.w * U;
    const by = (g.by || 0) * U, H = (g.hb || g.h) * U;
    const allPins = Object.entries(g.pins).filter(([n]) => n !== 'y').map(([, q]) => q.y * U);
    if (g.hb && !rect) return drawStretched(part, g, allPins, by, H, W);
    const pins = allPins;
    let s = '';
    const bub = bubbled(t);
    if (t === 'NOT' || t === 'BUF') {
      const tip = t === 'NOT' ? 21 : 27;
      if (rect) {
        s += `<rect class="sk-body" x="0" y="0" width="${tip}" height="${H}"/>` + Sym.text('1', tip / 2, H / 2, 10, 'middle', 'sk-sym');
      } else s += `<path class="sk-body" d="M0 0L${tip} ${H / 2}L0 ${H}Z"/>`;
      if (bub) s += bubble(tip + 4, H / 2) + lead(tip + 8, H / 2, W, H / 2);
      else s += lead(tip, H / 2, W, H / 2);
      return s;
    }
    const xor = t === 'XOR' || t === 'XNOR';
    const x0 = xor ? U : 0, B = (g.body - (xor ? 1 : 0)) * U;
    const end = x0 + B;
    if (rect) {
      // a rectangle as tall as its inputs need, the output from the middle of the body
      const top = g.hb ? Math.min(by, Math.min(...pins) - U) : 0, bot = g.hb ? Math.max(by + H, Math.max(...pins) + U) : H;
      s += `<rect class="sk-body" x="${x0}" y="${top}" width="${B}" height="${bot - top}"/>`;
      s += Sym.text({ AND: '&', NAND: '&', OR: '≥1', NOR: '≥1', XOR: '=1', XNOR: '=1' }[t], x0 + B / 2, top + Math.min((bot - top) / 2, 12), 11, 'middle', 'sk-sym');
      for (const y of pins) if (x0 > 0) s += lead(0, y, x0, y);
      const oy = by + H / 2;
      if (bub) s += bubble(end + 4, oy) + (W > end + 8 ? lead(end + 8, oy, W, oy) : '');
      else if (W > end) s += lead(end, oy, W, oy);
      return s;
    } else if (t === 'AND' || t === 'NAND') {
      const r = H / 2;
      s += `<path class="sk-body" d="M0 0H${B - r}A${r} ${r} 0 0 1 ${B - r} ${H}H0Z"/>`;
    } else {
      const d = Math.max(6, H * 0.14);
      const back = (x) => `M${x} 0Q${x + 2 * d} ${H / 2} ${x} ${H}`;
      s += `<path class="sk-body" d="${back(x0)}C${x0 + 0.62 * B} ${H} ${x0 + 0.9 * B} ${0.78 * H} ${end} ${H / 2}C${x0 + 0.9 * B} ${0.22 * H} ${x0 + 0.62 * B} 0 ${x0} 0Z"/>`;
      if (xor) s += `<path class="sk-body sk-open" d="${back(0)}"/>`;
      // input leads reach the back curve (an XOR's reach the extra arc)
      for (const y of pins) { const tt = y / H, x = 2 * tt * (1 - tt) * 2 * d; if (x > 1) s += lead(0, y, x, y); }
    }
    if (bub) s += bubble(end + 4, H / 2) + (W > end + 8 ? lead(end + 8, H / 2, W, H / 2) : '');
    else if (W > end) s += lead(end, H / 2, W, H / 2);
    return s;
  }

  // a gate stretched to meet wires on far-apart rows: the usual body round the output, its input edge carried on
  // above and below as a straight spine that the inputs end on
  function drawStretched(part, g, pins, by, H, W) {
    const t = part.type, bub = bubbled(t), xor = t === 'XOR' || t === 'XNOR';
    const x0 = xor ? U : 0, B = (g.body - (xor ? 1 : 0)) * U, end = x0 + B, cy = by + H / 2;
    let s = '<g transform="translate(0 ' + by + ')">';
    const sub = Object.assign({}, g, { hb: 0, by: 0, h: H / U, pins: { y: g.pins.y } });
    // the plain body, drawn at the body's height
    const inner = drawGate(part, Object.assign({}, sub, { pins: Object.assign({ y: { x: g.w, y: H / U / 2, side: 'right' } }) }), false);
    s += inner + '</g>';
    const lo = Math.min(...pins), hi = Math.max(...pins);
    if (lo < by) s += `<path class="sk-body sk-open" d="M${x0} ${lo}V${by}"/>`;
    if (hi > by + H) s += `<path class="sk-body sk-open" d="M${x0} ${by + H}V${hi}"/>`;
    if (xor) { if (lo < by) s += `<path class="sk-body sk-open" d="M0 ${lo}V${by}"/>`; if (hi > by + H) s += `<path class="sk-body sk-open" d="M0 ${by + H}V${hi}"/>`; }
    for (const y of pins) {
      if (y >= by && y <= by + H) {
        if (t === 'OR' || t === 'NOR' || xor) { const d = Math.max(6, H * 0.14), tt = (y - by) / H, x = 2 * tt * (1 - tt) * 2 * d; if (x > 1) s += lead(0, y, x, y); }
      } else if (x0 > 0) s += lead(0, y, x0, y);
    }
    return s;
  }

  function drawPort(part, g) {
    if (g.up) {
      const W = g.w * U, H = g.h * U, tip = 7;
      let s = `<path class="sk-body sk-port" d="M0 ${tip}L${W / 2} 0L${W} ${tip}V${H}H0Z"/>`;
      let tx = W / 2;
      if (part.type === 'CLOCK') { s += `<path class="sk-glyph" d="M6 ${tip + 15}H9V${tip + 7}H13V${tip + 15}H17V${tip + 7}H20"/>`; tx = 20 + (W - 20) / 2; }
      return s + Sym.text(part.params.name, tx, tip + (H - tip) / 2, FONT.port, 'middle', 'sk-t sk-port-t');
    }
    if (g.left) {
      const W = g.w * U, H = g.h * U, tip = 7;
      return `<path class="sk-body sk-port" d="M${tip} 0H${W}V${H}H${tip}L0 ${H / 2}Z"/>` + Sym.text(part.params.name, tip + (W - tip) / 2, H / 2, FONT.port, 'middle', 'sk-t sk-port-t');
    }
    if (g.down) {
      const W = g.w * U, H = g.h * U, tip = 7;
      let s = `<path class="sk-body sk-port" d="M0 0H${W}V${H - tip}L${W / 2} ${H}L0 ${H - tip}Z"/>`;
      let tx = W / 2;
      if (part.type === 'CLOCK') { s += `<path class="sk-glyph" d="M6 15H9V7H13V15H17V7H20"/>`; tx = 20 + (W - 20) / 2; }
      return s + Sym.text(part.params.name, tx, (H - tip) / 2 + 1, FONT.port, 'middle', 'sk-t sk-port-t');
    }
    const p = part.params, W = g.w * U, H = g.h * U;
    const tip = 7, out = part.type === 'OUT';
    let s = `<path class="sk-body sk-port" d="M0 0H${W - tip}L${W} ${H / 2}L${W - tip} ${H}H0Z"/>`;
    let tx = (W - tip) / 2;
    if (part.type === 'CLOCK') {
      s += `<path class="sk-glyph" d="M6 14H9V6H13V14H17V6H20"/>`;
      tx = 20 + (W - tip - 20) / 2;
    }
    s += Sym.text(p.name, tx, H / 2, FONT.port, 'middle', 'sk-t sk-port-t');
    if (out && p.w > 1) { /* a bus output: the wire shows its width */ }
    return s;
  }

  // a tristate buffer: the triangle (a bubble at the tip when it inverts), the enable a lead from the top onto
  // its upper edge (a bubble where it meets the edge when active low); the rectangular form is a box marked 1
  // and the three-state sign
  function drawTri(part, g, rect) {
    const p = part.params || {}, W = g.w * U, H = g.h * U, ex = g.pins.en.x * U;
    const tip = 28, y0 = 8, y1 = H - 8, cy = H / 2;
    let s = '', edge;
    if (rect) {
      s += `<rect class="sk-body" x="0" y="${y0}" width="${tip}" height="${y1 - y0}"/>` + Sym.text('1', 9, cy, 10, 'middle', 'sk-sym');
      s += `<path class="sk-body sk-open" d="M${tip - 12} ${cy - 3}H${tip - 4}L${tip - 8} ${cy + 4}Z"/>`;
      edge = y0;
    } else {
      s += `<path class="sk-body" d="M0 ${y0}L${tip} ${cy}L0 ${y1}Z"/>`;
      edge = y0 + (cy - y0) * ex / tip;
    }
    if (p.enLow) s += bubble(ex, edge - 4) + vlead(ex, 0, edge - 8);
    else s += vlead(ex, 0, edge);
    if (p.invert) s += bubble(tip + 4, cy) + (W > tip + 8 ? lead(tip + 8, cy, W, cy) : '');
    else s += lead(tip, cy, W, cy);
    return s;
  }

  function drawMux(part, g) {
    const W = g.w * U, H = g.h * U, k = U;
    let s = `<path class="sk-body" d="M0 0L${W} ${k}V${H - k}L0 ${H}Z"/>`;
    for (const q of part.pins) {
      const pp = g.pins[q.name];
      if (pp.side === 'left') s += Sym.text(q.label, 7, pp.y * U, FONT.pin, 'middle', 'sk-t sk-pin-t');
      if (pp.side === 'bottom') { const ey = H - k * pp.x * U / W; s += vlead(pp.x * U, ey, H); }
      if (pp.side === 'top') { const ey = k * pp.x * U / W; s += vlead(pp.x * U, 0, ey); }
    }
    return s;
  }

  function drawBlock(part, g) {
    const W = g.w * U, H = g.h * U;
    let s = `<rect class="sk-body" x="0" y="0" width="${W}" height="${H}" rx="2"/>`;
    for (const q of part.pins) {
      const pp = g.pins[q.name];
      const x = pp.x * U, y = pp.y * U;
      if (q.clock) {
        const tri = { left: `M0 ${y - 5}L8 ${y}L0 ${y + 5}`, bottom: `M${x - 5} ${H}L${x} ${H - 8}L${x + 5} ${H}`, top: `M${x - 5} 0L${x} 8L${x + 5} 0`, right: `M${W} ${y - 5}L${W - 8} ${y}L${W} ${y + 5}` }[pp.side];
        s += `<path class="sk-body sk-open" d="${tri}"/>`;
        continue;
      }
      if (!q.label) continue;
      if (pp.side === 'left') s += Sym.text(q.label, 5, y, FONT.pin, 'start', 'sk-t sk-pin-t');
      else if (pp.side === 'right') s += Sym.text(q.label, W - 5, y, FONT.pin, 'end', 'sk-t sk-pin-t');
      else if (pp.side === 'top') s += Sym.text(q.label, x, 9, FONT.pin, 'middle', 'sk-t sk-pin-t');
      else s += Sym.text(q.label, x, H - 9, FONT.pin, 'middle', 'sk-t sk-pin-t');
    }
    if (g.title) s += Sym.text(g.title, W / 2, H / 2, FONT.title, 'middle', 'sk-t sk-title');
    return s;
  }

  /** the SVG of a part's symbol, in its own pixel coordinates; style 'shape' (default) or 'rect' */
  Sym.draw = (part, style, gIn) => {
    const g = gIn || geom(part), rect = style === 'rect';
    if (g.down && g.base) {
      // drawn as the plain symbol, turned a quarter (its text kept upright)
      upright = true;
      const inner = Sym.draw(part, style, g.base);
      upright = false;
      return `<g transform="translate(${g.w * U} 0) rotate(90)">${inner}</g>`;
    }
    if (g.kind === 'gate') return drawGate(part, g, rect);
    if (g.kind === 'port') return drawPort(part, g);
    if (g.kind === 'const') return `<rect class="sk-body sk-const" x="1" y="1" width="${g.w * U - 2}" height="${g.h * U - 2}" rx="3"/>` + Sym.text(String(part.params.value), g.w * U / 2, g.h * U / 2, 11, 'middle', 'sk-t sk-const-t');
    if (g.kind === 'mux') return drawMux(part, g);
    if (g.kind === 'tri') return drawTri(part, g, rect);
    return drawBlock(part, g);
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
