// Draws a laid-out schematic as SVG. Every element says what it is to the diagram audit: parts are "node",
// wires "edge", junction dots "overlap-ok", text "label"; the bus slash is decoration ("ignore").
// Colours come from the theme's tokens (classes styled in styles.css), so light and dark both work.
(function (S) {
  'use strict';
  const Sym = S.Symbols;
  const R = S.Render = {};
  const f = (v) => Math.round(v * 100) / 100;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  /**
   * the SVG text of a layout; opts.style 'shape' (default) or 'rect'; opts.textScale enlarges the text (a
   * schematic shown small, as in a topic's picture, can keep its names readable: 1.2 to 1.4 suit most), and
   * opts.pinCap lets pin names grow further than their usual 1.1 times
   */
  R.svg = function (res, opts) {
    opts = opts || {};
    const was = [Sym.textScale, Sym.pinCap];
    Sym.textScale = Math.max(0.5, Math.min(2, +opts.textScale || 1));
    // opts.pinCap: how far pin names may grow with the text (1.1 unless a picture has checked it has room)
    if (opts.pinCap) Sym.pinCap = Math.max(1, Math.min(1.5, +opts.pinCap));
    try { return draw(res, opts); } finally { Sym.textScale = was[0]; Sym.pinCap = was[1]; }
  };
  /**
   * draw a layout into an element (in a page) and, when the drawing is shown so small that its names fall under
   * 11px on screen (10px on a phone), draw it again with its text enlarged to suit (at most 1.4 times). A pin's
   * name grows only a little (it sits inside its part), so on a desktop a drawing with pin names is never shrunk
   * below its own size: one wider than its box scrolls sideways, with a fade at the edge and a note in the box
   */
  R.into = function (el, res, opts) {
    opts = Object.assign({}, opts || {});
    el.innerHTML = R.svg(res, opts);
    let svg = el.querySelector('svg');
    if (!svg || typeof innerWidth === 'undefined' || opts.textScale) return svg;
    const w = svg.getBoundingClientRect().width, b = res.bounds;
    if (!w || !b.w) return svg;
    const phone = innerWidth < 600, min = phone ? 10 : 11;
    const pins = !!svg.querySelector('.sk-pin-t');
    let scale = Math.min(w / b.w, (svg.getBoundingClientRect().height || Infinity) / b.h);
    const wide = !phone && pins && scale < 0.999;
    if (wide) scale = 1;
    let need = min / (scale * Sym.FONT.port);
    if (pins && !phone) need = Math.max(need, min / Sym.FONT.pin);
    if (need > 1.02) { el.innerHTML = R.svg(res, Object.assign(opts, { textScale: Math.min(1.4, need) })); svg = el.querySelector('svg'); }
    el.classList.toggle('sk-scroll', wide);
    if (wide) {
      svg.style.maxWidth = 'none';
      el.style.overflowX = 'auto';
      if (S.UI && S.UI.scrollRow) S.UI.scrollRow(el);
    } else el.style.overflowX = '';
    return svg;
  };
  function draw(res, opts) {
    const b = res.bounds;
    let s = `<svg class="sk" xmlns="http://www.w3.org/2000/svg" data-schematic="1" data-crossings="${res.crossingCount}" data-rail-crossings="${res.railCrossings || 0}" viewBox="${f(b.x)} ${f(b.y)} ${f(b.w)} ${f(b.h)}" width="${f(b.w)}" height="${f(b.h)}" role="img" aria-label="${esc(res.title || 'schematic')}">`;
    s += '<g class="sk-wires">';
    for (const n of res.nets) {
      // the rails of a net (literal rails, product rows, control rails, bus lines) are a path of their own
      for (const rail of [false, true]) {
        const ps = (n.paths || n.polylines.map((pts) => ({ rail: false, pts }))).filter((q) => q.rail === rail);
        if (!ps.length) continue;
        const d = ps.map((q) => 'M' + q.pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L')).join('');
        s += `<path data-audit="edge" data-net="${esc(n.id)}"${rail ? ' data-rail="1"' : ''} class="sk-wire${n.width > 1 ? ' sk-bus' : ''}" d="${d}"/>`;
      }
    }
    s += '</g><g class="sk-parts">';
    for (const p of res.parts) {
      const pins = p.pins.map((q) => [q.name, f(q.x - p.x), f(q.y - p.y), q.net ? 'c' : p.part.open.has(q.name) ? 'o' : 'u', q.net]);
      s += `<g class="sk-part sk-${p.type.toLowerCase()}" data-audit="node" data-part="${esc(p.id)}" data-box="${f(p.x)} ${f(p.y)} ${f(p.w)} ${f(p.h)}" data-pins="${esc(JSON.stringify(pins))}" transform="translate(${f(p.x)} ${f(p.y)})">`;
      s += Sym.draw(p.part, opts.style, p.geom) + '</g>';
    }
    s += '</g><g class="sk-dots">';
    for (const n of res.nets) for (const j of n.junctions) s += `<circle data-audit="overlap-ok" data-junction="1" data-net="${esc(n.id)}" class="sk-dot" cx="${f(j[0])}" cy="${f(j[1])}" r="3.4"/>`;
    s += '</g><g class="sk-labels">';
    for (const l of res.labels) {
      if (l.slash) s += `<path data-audit="ignore" class="sk-slash" d="M${l.slash[0]} ${l.slash[1]}L${l.slash[2]} ${l.slash[3]}"/>`;
      s += Sym.text(l.text, f(l.x), f(l.y), l.size, l.anchor, 'sk-t sk-' + l.kind + '-t', ` data-net="${esc(l.net)}"`);
    }
    s += '</g></svg>';
    return s;
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
