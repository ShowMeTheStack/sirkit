// Drawing a document: its wires routed on the grid by the layout engine's own router (so a wire never runs
// through a part, along another net or round a corner on it, and branches meet with a dot), the labels of nets
// and parts put where nothing else is, and the SVG of it all. The SVG speaks the diagram checker's language:
// parts are g[data-part] with their box and pins, wires path[data-net], junction dots circle[data-junction].
(function (S) {
  'use strict';
  const R = S.EdDraw = {};
  const D = new Proxy({}, { get: (_, k) => S.Doc[k] }); // model.js loads after this file
  const f = (v) => Math.round(v * 100) / 100;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const DIRS = { right: 0, bottom: 1, left: 2, top: 3 };
  const DX = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  /**
   * Route every wire of a document. Returns { nets: [{ id, width, paths: [{rail, pts}], junctions, ok }], failed,
   * labels } in pixels. The layout engine's own drawing is used while the document has not changed since.
   */
  // k: the text scale the labels will be drawn at (a canvas zoomed out draws its names larger), so they are placed
  // at the size they will have
  R.route = function (doc, k) {
    k = k || 1;
    const u = S.Symbols.U;
    if (D.routesValid(doc)) {
      const nets = doc.wires.map((w) => { const r = doc.routes[w.id]; return r ? { id: w.id, width: widthOf(doc, w), paths: r.paths, junctions: r.junctions, ok: true } : null; }).filter(Boolean);
      if (k === 1) return { nets, failed: [], labels: doc.labels || [], kept: true };
      // names drawn larger are placed again, at the size they will have
      for (const n of nets) { n.segments = []; for (const q of n.paths) for (let j = 1; j < q.pts.length; j++) n.segments.push([q.pts[j - 1][0], q.pts[j - 1][1], q.pts[j][0], q.pts[j][1]]); }
      return { nets, failed: [], labels: placeLabels(doc, doc.parts.map((dp) => ({ dp, g: D.geom(dp, doc) })), nets, k), kept: true };
    }
    const parts = doc.parts.map((dp) => ({ dp, g: D.geom(dp, doc) }));
    const byId = new Map(parts.map((p) => [p.dp.id, p]));
    const wires = doc.wires.map((w) => {
      const terms = [];
      for (const [pid, pn] of w.pins) {
        const p = byId.get(pid); if (!p) continue;
        const q = p.g.pins[pn]; if (!q) continue;
        const def = p.g.part.pins.find((x) => x.name === pn);
        terms.push({ x: p.dp.x + q.x, y: p.dp.y + q.y, side: q.side, out: def && def.dir === 'out' });
      }
      terms.sort((a, b) => b.out - a.out);
      return { w, terms };
    }).filter((x) => x.terms.length >= 2);
    if (!wires.length) return { nets: [], failed: [], labels: placeLabels(doc, parts, [], k) };
    const M = 6;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of parts) { x0 = Math.min(x0, p.dp.x); y0 = Math.min(y0, p.dp.y); x1 = Math.max(x1, p.dp.x + p.g.w); y1 = Math.max(y1, p.dp.y + p.g.h); }
    const ox = Math.floor(x0) - M, oy = Math.floor(y0) - M, gw = Math.ceil(x1) - ox + M + 1, gh = Math.ceil(y1) - oy + M + 1;
    const cell = (x, y) => (Math.round(y) - oy) * gw + (Math.round(x) - ox);
    const blocked = new Uint8Array(gw * gh), fixed = new Int32Array(gw * gh).fill(-1), resv = new Int32Array(gw * gh).fill(-1), clash = new Uint8Array(gw * gh);
    for (const p of parts) for (let y = Math.floor(p.dp.y) - 1; y <= Math.ceil(p.dp.y + p.g.h) + 1; y++) for (let x = Math.floor(p.dp.x) - 1; x <= Math.ceil(p.dp.x + p.g.w) + 1; x++) if (x >= ox && y >= oy && x < ox + gw && y < oy + gh) blocked[cell(x, y)] = 1;
    const pnets = wires.map((wr, i) => ({
      terms: wr.terms.map((t) => {
        const d = DIRS[t.side];
        const tt = { pin: cell(t.x, t.y), esc: cell(t.x + DX[d][0], t.y + DX[d][1]), out: d, x: t.x, y: t.y };
        fixed[tt.pin] = i; fixed[tt.esc] = i;
        const c2 = cell(t.x + 2 * DX[d][0], t.y + 2 * DX[d][1]);
        if (resv[c2] >= 0 && resv[c2] !== i) clash[c2] = 1; else resv[c2] = i;
        return tt;
      }),
      pre: [],
    }));
    for (let c = 0; c < clash.length; c++) if (clash[c]) resv[c] = -1;
    const hp = (n) => { const xs = n.terms.map((t) => t.x), ys = n.terms.map((t) => t.y); return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys); };
    const order = pnets.map((_, i) => i).sort((a, b) => (pnets[a].terms.length > 2) - (pnets[b].terms.length > 2) || hp(pnets[a]) - hp(pnets[b]));
    let r;
    try { r = S.Router.route({ gw, gh, blocked, fixed, resv, nets: pnets, cell: (x, y) => cell(x, y) }, { order, passes: wires.length > 60 ? 1 : 3 }); }
    catch (e) { r = { nets: pnets.map(() => ({ edges: [], ok: false })) }; }
    const px = (c) => [((c % gw) + ox) * u, (((c / gw) | 0) + oy) * u];
    const DXc = [1, gw, -1, -gw];
    const nets = [], failed = [];
    wires.forEach((wr, k) => {
      const rn = r.nets[k];
      const net = { id: wr.w.id, width: widthOf(doc, wr.w), paths: [], junctions: [], ok: rn.ok, segments: [] };
      if (!rn.ok) {
        failed.push(wr.w.id);
        // what could not be routed is drawn straight, dashed, so it can be seen and fixed
        const t0 = wr.terms[0];
        net.loose = wr.terms.slice(1).map((t) => [[t0.x * u, t0.y * u], [t.x * u, t0.y * u], [t.x * u, t.y * u]]);
        nets.push(net);
        return;
      }
      const adj = new Map();
      for (const [c, d] of rn.edges) { const c2 = c + DXc[d]; if (!adj.has(c)) adj.set(c, []); if (!adj.has(c2)) adj.set(c2, []); adj.get(c).push(c2); adj.get(c2).push(c); }
      const corner = (c) => { const a = adj.get(c); return a.length !== 2 || (a[0] - c) !== -(a[1] - c); };
      const vert = [...adj.keys()].filter(corner), isV = new Set(vert), seen = new Set();
      for (const v of vert) for (const w of adj.get(v)) {
        const ek = Math.min(v, w) + ',' + Math.max(v, w);
        if (seen.has(ek)) continue;
        const line = [v]; let a = v, b = w;
        for (;;) { seen.add(Math.min(a, b) + ',' + Math.max(a, b)); if (isV.has(b)) { line.push(b); break; } const nx = adj.get(b).find((c) => c !== a); a = b; b = nx; }
        const pts = line.map(px);
        net.paths.push({ rail: false, pts });
        for (let j = 1; j < pts.length; j++) net.segments.push([pts[j - 1][0], pts[j - 1][1], pts[j][0], pts[j][1]]);
      }
      net.junctions = [...adj.entries()].filter(([, a]) => a.length >= 3).map(([c]) => px(c));
      nets.push(net);
    });
    return { nets, failed, labels: placeLabels(doc, parts, nets, k) };
  };
  function widthOf(doc, w) {
    let wd = 1;
    for (const [pid, pn] of w.pins) { const dp = D.part(doc, pid); const q = dp && D.pinDef(doc, dp, pn); if (q && q.width > wd) wd = q.width; }
    return wd;
  }
  R.widthOf = widthOf;

  /** net names (on wires that ask for them), bus widths, and part labels, each where nothing else is */
  function placeLabels(doc, parts, nets, k) {
    k = k || 1;
    const u = S.Symbols.U, out = [], boxes = [];
    for (const p of parts) boxes.push({ x: p.dp.x * u - 3, y: p.dp.y * u - 3, w: p.g.w * u + 6, h: p.g.h * u + 6 });
    for (const n of nets) {
      for (const s of n.segments || []) boxes.push({ x: Math.min(s[0], s[2]) - 3, y: Math.min(s[1], s[3]) - 3, w: Math.abs(s[2] - s[0]) + 6, h: Math.abs(s[3] - s[1]) + 6, net: n.id });
      for (const j of n.junctions) boxes.push({ x: j[0] - 5, y: j[1] - 5, w: 10, h: 10, net: n.id });
    }
    for (const nt of doc.notes || []) boxes.push(noteBox(nt));
    const hit = (b, own) => boxes.some((o) => (own == null || o.net !== own || o.label) && b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    const TH = 13 * k, Sym = S.Symbols;
    for (const n of nets) {
      const w = doc.wires.find((x) => x.id === n.id);
      const hs = (n.segments || []).filter((s) => s[1] === s[3] && Math.abs(s[2] - s[0]) >= 3 * u);
      if (n.width > 1) {
        const text = String(n.width), tw = Sym.textWidth(text, 11) * k;
        for (const s of hs) {
          const a = Math.min(s[0], s[2]) + 12, b = Math.max(s[0], s[2]) - 12 - tw;
          let done = false;
          for (let x = Math.round((a + b) / 2 / 5) * 5, k = 0; k < 40 && !done; k++) {
            const xx = x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 5;
            if (xx < a || xx > b) continue;
            const slash = { x: xx - 6, y: s[1] - 6, w: 12, h: 12 }, tb = { x: xx + 4, y: s[1] - 6 - TH, w: tw + 2, h: TH };
            if (hit(tb) || hit(slash, n.id)) continue;
            out.push({ kind: 'bus', net: n.id, text, x: tb.x + 1, y: tb.y + TH / 2, anchor: 'start', size: 11, slash: [xx - 4, s[1] + 5, xx + 4, s[1] - 5] });
            boxes.push(Object.assign({ label: true }, tb), Object.assign({ label: true, net: n.id }, slash));
            done = true;
          }
          if (done) break;
        }
      }
      if (w && w.name && w.show) {
        const tw = Sym.textWidth(w.name, Sym.FONT.net) * k;
        let done = false;
        for (const s of hs) {
          const a = Math.min(s[0], s[2]) + 8 + tw / 2, b = Math.max(s[0], s[2]) - 8 - tw / 2;
          for (let x = a; x <= b && !done; x += 5) {
            const tb = { x: x - tw / 2 - 1, y: s[1] - 4 - TH, w: tw + 2, h: TH };
            if (hit(tb)) continue;
            out.push({ kind: 'net', net: n.id, text: w.name, x, y: tb.y + TH / 2, anchor: 'middle', size: Sym.FONT.net });
            boxes.push(Object.assign({ label: true }, tb));
            done = true;
          }
          if (done) break;
        }
      }
    }
    // part labels: above the part, else below
    for (const p of parts) {
      const t = p.dp.params && p.dp.params.label;
      if (!t) continue;
      const tw = Sym.textWidth(t, 11) * k, cx = (p.dp.x + p.g.w / 2) * u;
      for (const y of [p.dp.y * u - 6 - TH / 2, (p.dp.y + p.g.h) * u + 6 + TH / 2]) {
        const tb = { x: cx - tw / 2 - 1, y: y - TH / 2, w: tw + 2, h: TH };
        if (boxes.some((o) => !(o.x === p.dp.x * u - 3 && o.y === p.dp.y * u - 3) && tb.x < o.x + o.w && tb.x + tb.w > o.x && tb.y < o.y + o.h && tb.y + tb.h > o.y)) continue;
        out.push({ kind: 'part', part: p.dp.id, text: t, x: cx, y, anchor: 'middle', size: 11 });
        boxes.push(Object.assign({ label: true }, tb));
        break;
      }
    }
    return out;
  }
  function noteBox(nt) {
    const u = S.Symbols.U, lines = String(nt.text || '').split('\n');
    const w = Math.max(40, ...lines.map((l) => S.Symbols.textWidth(l, 12))) + 16, h = lines.length * 16 + 10;
    return { x: nt.x * u, y: nt.y * u, w, h };
  }
  R.noteBox = noteBox;

  // ---- the SVG -----------------------------------------------------------------------------------------------
  const FLIPTXT = (s) => s.replace(/<text([^>]*?) x="([-\d.]+)"([^>]*?)text-anchor="(start|end|middle)"([^>]*)>/g, (m, a, x, b, an, c) => `<text${a} x="${x}"${b}text-anchor="${an === 'start' ? 'end' : an === 'end' ? 'start' : 'middle'}"${c} transform="translate(${2 * +x} 0) scale(-1 1)">`);
  /** the symbol of a placed part, in pixels from its corner (turned and mirrored as the part is) */
  R.symbol = function (dp, g, style) {
    const u = S.Symbols.U;
    const base = g.base;
    let s = S.Symbols.draw(g.part, style, base.draw && base.draw.kind ? base.draw : undefined);
    if (dp.type === 'SWITCH' || dp.type === 'BUTTON') s = s.replace(/<path class="sk-glyph" d="M6 (\d+)H9V(\d+)H13V\d+H17V\d+H20"\/>/, (m, lo, hi) => { const y = (+lo + +hi) / 2; return dp.type === 'SWITCH' ? `<circle class="ed-pivot" cx="8" cy="${y + 3}" r="2"/><path class="ed-face ed-lever" d="M8 ${y + 3}L18 ${y - 3}"/>` : `<path class="sk-glyph" d="M6 ${y + 4}H20M13 ${y + 4}V${y - 1}"/><circle class="ed-face ed-btn" cx="13" cy="${y - 3}" r="3"/>`; });
    s = s + extraFace(dp, base, style);
    if (dp.flip) s = `<g transform="translate(${base.w * u} 0) scale(-1 1)">${FLIPTXT(s)}</g>`;
    const r = (dp.rot || 0) & 3;
    if (r) {
      const W = base.w * u, H = base.h * u;
      const tr = r === 1 ? `translate(${H} 0) rotate(90)` : r === 2 ? `translate(${W} ${H}) rotate(180)` : `translate(0 ${W}) rotate(270)`;
      s = `<g transform="${tr}">${s}</g>`;
    }
    return s;
  };
  // faces the plain block symbol does not draw: a switch's lever, a button, an LED's lamp, the segments
  function extraFace(dp, base, style) {
    const u = S.Symbols.U, W = base.w * u, H = base.h * u, t = dp.type;
    if (dp.type === 'IN' && S.Eng.isButton(dp)) return `<circle class="ed-face ed-btn" data-face="1" cx="${W - 15}" cy="${H / 2}" r="3.5"/>`;
    if (t === 'HEX' || t === 'PROBE') return S.Symbols.text('–', W / 2 + (t === 'HEX' ? 2 : 0), H / 2, t === 'HEX' ? 18 : 12, 'middle', 'sk-t ed-digit', ' data-digit="1"');
    if (t === 'LED') return `<circle class="ed-lamp ed-lamp-${esc(dp.params.color || 'red')}" data-face="1" cx="${W / 2 + 4}" cy="${H / 2}" r="5.5"/>`;
    if (t === 'SEG7') {
      const x0 = W / 2 - 6, y0 = 10, sw = 14, sh = Math.min(13, (H - 26) / 2);
      const seg = { a: [x0, y0, x0 + sw, y0], b: [x0 + sw, y0, x0 + sw, y0 + sh], c: [x0 + sw, y0 + sh, x0 + sw, y0 + 2 * sh], d: [x0, y0 + 2 * sh, x0 + sw, y0 + 2 * sh], e: [x0, y0 + sh, x0, y0 + 2 * sh], f: [x0, y0, x0, y0 + sh], g: [x0, y0 + sh, x0 + sw, y0 + sh] };
      return Object.entries(seg).map(([k, [a, b, c, d]]) => `<path class="ed-seg" data-seg="${k}" d="M${f(a)} ${f(b)}L${f(c)} ${f(d)}"/>`).join('');
    }
    return '';
  }

  /**
   * The whole drawing: { svg (inner markup), bounds } for a document and its routes. opts: style, sel (Set of
   * 'p:id' and 'w:id'), values (Map wire id → bit string), viol (Set of part ids)
   */
  R.markup = function (doc, routed, opts) {
    opts = opts || {};
    // opts.textScale: the names drawn larger, for a canvas zoomed out (pin names a little less)
    const Sym = S.Symbols, was = [Sym.textScale, Sym.pinCap];
    Sym.textScale = opts.textScale || 1; Sym.pinCap = opts.textScale > 1 ? Math.min(opts.textScale, 1.25) : 1.1;
    try { return markup(doc, routed, opts); } finally { Sym.textScale = was[0]; Sym.pinCap = was[1]; }
  };
  function markup(doc, routed, opts) {
    const u = S.Symbols.U, sel = opts.sel || new Set(), values = opts.values || new Map(), viol = opts.viol || new Set();
    let wires = '<g class="sk-wires">', loose = '';
    for (const n of routed.nets) {
      const v = values.get(n.id), cls = 'sk-wire' + (n.width > 1 ? ' sk-bus' : '') + (v ? ' ' + valClass(v) : '') + (sel.has('w:' + n.id) ? ' sel' : '');
      if (n.loose) { loose += `<path class="${cls} ed-loose" data-wire="${esc(n.id)}" d="${n.loose.map((pl) => 'M' + pl.map((p) => f(p[0]) + ' ' + f(p[1])).join('L')).join('')}"/>`; continue; }
      for (const rail of [false, true]) {
        const ps = n.paths.filter((q) => !!q.rail === rail);
        if (!ps.length) continue;
        wires += `<path data-audit="edge" data-net="${esc(n.id)}" data-wire="${esc(n.id)}"${rail ? ' data-rail="1"' : ''} class="${cls}" d="${ps.map((q) => 'M' + q.pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L')).join('')}"/>`;
      }
    }
    wires += '</g>';
    let parts = '<g class="sk-parts">';
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y, w, h) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + (w || 0)); y1 = Math.max(y1, y + (h || 0)); };
    const wired = new Map();
    for (const w of doc.wires) if (w.pins.length >= 2) for (const [pid, pn] of w.pins) wired.set(pid + '.' + pn, w.id);
    for (const dp of doc.parts) {
      const g = D.geom(dp, doc);
      const X = dp.x * u, Y = dp.y * u, W = g.w * u, H = g.h * u;
      grow(X, Y, W, H);
      const pins = Object.entries(g.pins).map(([name, q]) => { const net = wired.get(dp.id + '.' + name); return [name, f(q.x * u), f(q.y * u), net ? 'c' : (dp.open || []).includes(name) ? 'o' : 'u', net || null]; });
      // the pins of a part on the canvas may be left for later: the checker sees them as open on purpose while editing
      const audPins = opts.strictPins ? pins : pins.map((q) => (q[3] === 'u' ? [q[0], q[1], q[2], 'o', null] : q));
      const st = partState(dp, values, doc);
      parts += `<g class="sk-part sk-${esc(dp.type.toLowerCase())}${sel.has('p:' + dp.id) ? ' sel' : ''}${viol.has(dp.id) ? ' viol' : ''}${st}" data-audit="node" data-part="${esc(dp.id)}" data-box="${f(X)} ${f(Y)} ${f(W)} ${f(H)}" data-pins="${esc(JSON.stringify(audPins))}" transform="translate(${f(X)} ${f(Y)})">`;
      // pin names on the zoomable canvas are secondary labels: the audit lets them be small
      parts += R.symbol(dp, g, opts.style).replace(/data-audit="label" class="sk-t sk-pin-t"/g, 'data-audit="small-ok" class="sk-t sk-pin-t"') + '</g>';
    }
    parts += '</g>';
    let dots = '<g class="sk-dots">';
    for (const n of routed.nets) for (const j of n.junctions) { dots += `<circle data-audit="overlap-ok" data-junction="1" data-net="${esc(n.id)}" class="sk-dot${values.get(n.id) ? ' ' + valClass(values.get(n.id)) : ''}" cx="${f(j[0])}" cy="${f(j[1])}" r="3.4"/>`; grow(j[0] - 4, j[1] - 4, 8, 8); }
    dots += '</g>';
    for (const n of routed.nets) for (const p of n.paths) for (const q of p.pts) grow(q[0], q[1]);
    let labels = '<g class="sk-labels">';
    for (const l of routed.labels || []) {
      if (l.slash) labels += `<path data-audit="ignore" class="sk-slash" d="M${f(l.slash[0])} ${f(l.slash[1])}L${f(l.slash[2])} ${f(l.slash[3])}"/>`;
      labels += S.Symbols.text(l.text, f(l.x), f(l.y), l.kind === 'bus' ? Math.max(l.size, 11) : l.size, l.anchor, 'sk-t sk-' + l.kind + '-t', l.net ? ` data-net="${esc(l.net)}"` : '');
      const tw = S.Symbols.textWidth(l.text, l.size) * (S.Symbols.textScale || 1);
      grow(l.anchor === 'middle' ? l.x - tw / 2 : l.anchor === 'end' ? l.x - tw : l.x, l.y - 8, tw, 16);
    }
    labels += '</g>';
    let notes = '<g class="ed-notes">';
    for (const nt of doc.notes || []) {
      const b = noteBox(nt);
      grow(b.x, b.y, b.w, b.h);
      notes += `<g class="ed-note${sel.has('n:' + nt.id) ? ' sel' : ''}" data-note="${esc(nt.id)}"><rect data-audit="ignore" class="ed-note-box" x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" rx="5"/>`;
      String(nt.text || '').split('\n').forEach((line, i) => { if (line.trim()) notes += `<text class="ed-note-t" x="${f(b.x + 8)}" y="${f(b.y + 13 + i * 16)}" font-size="12" dominant-baseline="central">${esc(line)}</text>`; });
      notes += '</g>';
    }
    notes += '</g>';
    if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = 400; y1 = 300; }
    const pad = 14;
    return { svg: wires + `<g class="ed-loose-g" data-audit="ignore">${loose}</g>` + parts + dots + labels + notes, bounds: { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad } };
  }
  /** the classes a part shows while running: a switch's position, a lit lamp, the lit segments */
  R.stateClass = function (dp, on) {
    const t = dp.type;
    const first = () => { const q = S.Doc.partObj(dp).pins.find((x) => x.dir === 'in'); return q ? on(q.name) : null; };
    if (S.Eng.isInput(t)) { const v = on('y'); return v ? ' val-' + (v.length > 1 ? 'bus' : v) : ''; }
    if (t === 'LED' || t === 'OUT' || t === 'PROBE' || t === 'HEX') { let v = first(); if (v && t === 'LED' && dp.params.activeLow) v = v === '0' ? '1' : v === '1' ? '0' : v; return v ? ' val-' + (v.length > 1 ? 'bus' : v) : ''; }
    if (t === 'SEG7') { const low = dp.params.common === 'anode' || dp.params.common === 'low'; let s = ''; for (const k of 'abcdefg') { const v = on(k); if (low ? v === '0' : v === '1') s += ' seg-' + k; } return s; }
    return '';
  };
  function valClass(v) { return v.length > 1 ? (/^z+$/.test(v) ? 'vz' : /x/.test(v) ? 'vx' : 'vbus') : 'v' + v; }
  R.valClass = valClass;
  // what a part shows while running: a switch up or down, a lamp lit
  function partState(dp, values, doc) {
    const t = dp.type;
    if (!values.size) return '';
    const on = (pin) => { const w = D.wireAt(doc, dp.id, pin); const v = w && values.get(w.id); return v; };
    return R.stateClass(dp, on);
  }

  /** a standalone SVG file of the drawing, with its colours written in (for lab reports) */
  R.standalone = function (svgEl, bounds, title) {
    const clone = svgEl.cloneNode(true);
    clone.querySelectorAll('[data-ui], .ed-ui').forEach((e) => e.remove());
    const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'opacity', 'stroke-linejoin', 'stroke-linecap'];
    const src = [...svgEl.querySelectorAll('*')], dst = [...clone.querySelectorAll('*')];
    src.forEach((e, i) => { const cs = getComputedStyle(e); const d = dst[i]; if (!d) return; let st = ''; for (const p of props) { const v = cs.getPropertyValue(p); if (v) st += p + ':' + v + ';'; } d.setAttribute('style', st); d.removeAttribute('class'); });
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--sk-paper').trim() || '#fff';
    clone.setAttribute('viewBox', `${f(bounds.x)} ${f(bounds.y)} ${f(bounds.w)} ${f(bounds.h)}`);
    clone.setAttribute('width', f(bounds.w)); clone.setAttribute('height', f(bounds.h));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.removeAttribute('style'); clone.removeAttribute('class');
    clone.insertAdjacentHTML('afterbegin', `<title>${esc(title || 'circuit')}</title><rect x="${f(bounds.x)}" y="${f(bounds.y)}" width="${f(bounds.w)}" height="${f(bounds.h)}" fill="${bg}"/>`);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + clone.outerHTML;
  };
  /** a PNG (as a Blob) of a standalone SVG, at the given scale */
  R.png = function (svgText, bounds, scale) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(bounds.w * scale); cv.height = Math.ceil(bounds.h * scale);
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png');
      };
      img.onerror = () => reject(new Error('the drawing could not be made into an image'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
    });
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
