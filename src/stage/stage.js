// The stage: draws a frame (a list of named items) as SVG and animates from one frame to the next.
// Items keep their identity by key, so a state that moves glides, an edge whose end moves follows it,
// a new item fades in (or grows out of the items it came from) and a removed one leaves the way its
// frame says (fading, or flying into the item it was merged into).
//
// Item kinds (positions in stage units; the camera fits the frame to the box it is shown in):
//   state   {x, y, r | w, h, rx, text, lines: [..], sub, accept, size}  a circle or a rounded box, centred
//           on (x, y); accept draws a second ring. A circle is a box with w = h = 2r, so one can morph into
//           the other (an NFA state into a subset-construction box).
//   edge    {from: key | {x, y}, to: key | {x, y}, bend, loop (angle), label, lx, ly, head, size}  an arrow
//           between two items, following them as they move; bend curves it sideways (px), loop makes a
//           self-loop pointing out at that angle; the label sits at (lx, ly) (or beside the middle)
//   cell    {x, y, w, h, text, lines, sub, rx, size, align}    a table or memory cell, top-left at (x, y); align 'left'
//   text    {x, y, text, anchor, size, bold, mono}
//   region  {x, y, w, h, text, rx}                             a shaded area behind things (a set, a group)
//   ellipse {x, y, rx, ry, text, tx, ty}                       a set in a Venn diagram
//   line    {x1, y1, x2, y2}
//   token   {x, y, r, text}                                    a small marker that travels
//   head    {x, y, text, side: 'below'|'above'}                 a pointer tag whose point touches (x, y)
//   bracket {x1, x2, y, side: 'below'|'above', text}            a brace under or over a stretch of cells
//   domino  {x, y, w, h, top, bottom}                          a two-part card, top-left at (x, y)
//   tile    {x, y, size, edges: [n, e, s, w]}                  a coloured square tile; edges are colour numbers 0..7
//   schem   {x, y, res, values, hot, style}                     a schematic: a layout from S.Layout.layout (res),
//           its top-left at (x, y); values {net id or net name: '0'|'1'|'x'|'z'} colour the wires, hot: [part ids]
//           lights parts; style 'shape' | 'rect' (else the reader's setting); textScale (1.2, say) draws its
//           names larger, for a schematic that is shown small, and pinCap lets its pin names grow past 1.1 times
//   wave    {x, y, w, h, t0, t1, changes: [[t, v]..], width}     one waveform row: a step line (width 1) or a bus
//           with its values written in; v is 0, 1, 'x', 'z', a number or a bit string
// Common to all: key (required, stable across frames), cls, dim, pulse (light up once), opacity, title,
//   layer ('back' | 'lines' | 'edges' | 'items' | 'labels' | 'heads' | 'top'), z (paint order within a layer;
//   ties go by the order in the frame),
//   pick (clickable as an answer), audit (a role for the diagram checker: 'group', 'overlap-ok', 'ignore'),
//   enter: 'fade' | 'drop' | 'grow' | 'fly' (from {x, y}) | 'from' (src: key or [keys]) | 'none',
//   exit: 'fade' | 'fall' | 'rise' | 'shrink' | 'into' (into: key). A frame's `exits` {key: {exit, into}}
//   says how items of the frame before leave (the kits fill it in for merges).
(function (S) {
  'use strict';
  const Geo = S.geom;
  const NS = 'http://www.w3.org/2000/svg';
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const NUMS = ['x', 'y', 'w', 'h', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'lx', 'ly', 'bend', 'loop', 'size', 'tx', 'ty'];
  const DIM = 0.42;
  /** Dimmed by dim: true or by the class dim */
  const isDim = (s) => !!(s && (s.dim || /(^|\s)dim(\s|$)/.test(s.cls || '')));
  const str = (v) => (v === undefined || v === null ? '' : String(v));

  // ---- bounds, without a browser (the camera, and the checks in node) -----------------------------------
  /** How a free text item is drawn, as the stylesheet draws its classes: size, bold, mono, capitals with spacing */
  function textLook(s) {
    const c = ' ' + (s.cls || '') + ' ';
    const title = c.includes(' title '), big = c.includes(' big ');
    return { size: s.size || (title ? 13 : big ? 20 : 14), bold: s.bold || title || big || /\s(strong|good|bad|hot)\s/.test(c), mono: s.mono || c.includes(' mono '), caps: title, spacing: title ? 0.06 : 0 };
  }
  S.textLook = textLook;
  /** The shape an item occupies, as {x, y, w, h} top-left, or null for items that follow others */
  function itemBox(s) {
    switch (s.kind) {
      case 'state': { const sh = Geo.shapeOf(s); const ring = s.accept ? 5 : 0; let b = { x: s.x - sh.w / 2 - ring, y: s.y - sh.h / 2 - ring, w: sh.w + 2 * ring, h: sh.h + 2 * ring }; if (s.sub) b = Geo.union([b, Geo.labelBox(s.sub, s.x, s.y + sh.h / 2 + 16, 12)]); return b; }
      case 'cell': case 'region': case 'domino': { let b = { x: s.x, y: s.y, w: s.w || 0, h: s.h || 0 }; if (s.kind === 'cell' && s.sub !== undefined && s.sub !== '') b = Geo.union([b, Geo.labelBox(s.sub, s.x + s.w / 2, s.y + s.h + 13, 11, { mono: true })]); return b; }
      case 'tile': return { x: s.x, y: s.y, w: s.size || 50, h: s.size || 50 };
      case 'schem': { const b = s.res && s.res.bounds; return b ? { x: s.x, y: s.y, w: b.w, h: b.h } : null; }
      case 'wave': return { x: s.x, y: s.y, w: s.w || 0, h: s.h || 24 };
      case 'ellipse': return { x: s.x - s.rx, y: s.y - s.ry, w: 2 * s.rx, h: 2 * s.ry };
      case 'line': return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
      case 'token': { const r = s.r || 9; return { x: s.x - r, y: s.y - r, w: 2 * r, h: 2 * r }; }
      case 'text': { const o = textLook(s), b = Geo.labelBox(s.text, s.x, s.y - o.size * 0.35, o.size, o); if (s.anchor === 'end') b.x -= b.w / 2; else if (s.anchor !== 'middle') b.x += b.w / 2; return b; }
      case 'head': { const w = Math.max(30, Geo.textWidth(s.text || '', 13, { bold: true }) + 16); return { x: s.x - w / 2, y: s.side === 'above' ? s.y - 34 : s.y, w, h: 34 }; }
      case 'bracket': { const lb = s.text ? Geo.labelBox(s.text, (s.x1 + s.x2) / 2, s.side === 'above' ? s.y - 24 : s.y + 24, 13) : null; return Geo.union([{ x: Math.min(s.x1, s.x2), y: s.side === 'above' ? s.y - 12 : s.y, w: Math.abs(s.x2 - s.x1), h: 12 }, lb]); }
      case 'edge': if (s.lx !== undefined && s.label) return Geo.labelBox(s.label, s.lx, s.ly, s.size || 14); return null;
    }
    return null;
  }
  /** The box around everything in a list of items, with a margin; null when there is nothing */
  S.stageBounds = function (items, opts) {
    opts = opts || {};
    const map = new Map();
    for (const s of items) if (s && s.key) map.set(s.key, s);
    const boxes = [];
    for (const s of map.values()) {
      boxes.push(itemBox(s));
      // a loop or a bent edge bulges out of its states: include its middle
      if (s.kind === 'edge') {
        const g = edgeGeom(s, (k) => (map.get(k) || null));
        if (g) { for (const p of Geo.sample(g, 8)) boxes.push({ x: p.x - 2, y: p.y - 2, w: 4, h: 4 }); }
      }
    }
    const u = Geo.union(boxes);
    if (!u) return null;
    const m = opts.margin === undefined ? 30 : opts.margin;
    let x = u.x - m, y = u.y - m, w = u.w + 2 * m, h = u.h + 2 * m;
    const minW = opts.minW || 420, minH = opts.minH || 240;
    if (w < minW) { x -= (minW - w) / 2; w = minW; }
    if (h < minH) { y -= (minH - h) / 2; h = minH; }
    return { x, y, w, h };
  };
  S.itemBox = itemBox;

  /** The geometry of an edge item, given a way to find the current numbers of the items it joins */
  function edgeGeom(s, find) {
    const end = (e) => {
      if (!e) return null;
      if (typeof e === 'string') { const o = find(e); if (!o) return null; return o.kind === 'cell' || o.kind === 'domino' ? { x: o.x + (o.w || 0) / 2, y: o.y + (o.h || 0) / 2, w: o.w, h: o.h, rx: o.rx === undefined ? 6 : o.rx } : o.kind === 'token' ? { x: o.x, y: o.y, r: o.r || 9 } : o; }
      return { x: e.x, y: e.y };
    };
    const a = end(s.from), b = end(s.to);
    if (!a || !b) return null;
    const A = a.w !== undefined || a.r !== undefined ? Geo.shapeOf(a) : { x: a.x, y: a.y };
    const B = b.w !== undefined || b.r !== undefined ? Geo.shapeOf(b) : { x: b.x, y: b.y };
    const loop = s.loop === undefined || s.loop === null || s.from !== s.to ? null : s.loop;
    if (loop === null && Math.hypot(A.x - B.x, A.y - B.y) < 1) return null;
    return Geo.edge(A, B, { bend: s.bend || 0, loop, gapA: s.gapA || 0, gapB: s.head === false ? 0 : (s.gapB === undefined ? 1.5 : s.gapB), loopSize: s.loopSize });
  }
  S.edgeGeom = edgeGeom;
  /** Where an edge's label goes when the kit did not place it: beside the middle, on the left-hand side */
  function defaultLabel(g, s) {
    if (g.loop) { const p = g.at(0.5); return { x: p.x + g.dir.x * 14, y: p.y + g.dir.y * 14 + (g.dir.y > 0.5 ? 6 : 0) }; }
    const m = g.at(0.5), t = g.tan(0.5);
    const off = (s.size || 14) * 0.9;
    return { x: m.x + t.y * off, y: m.y - t.x * off };
  }

  let seq = 0;
  class Stage {
    constructor(el, opts) {
      this.el = el;
      this.opts = opts || {};
      this.id = 'st' + (++seq);
      this.root = svg('svg', { class: 'stage-svg', role: 'img', 'aria-label': this.opts.label || 'Animation' });
      const defs = svg('defs');
      for (const [id, cls] of [['ah', 'arrowhead'], ['ahHot', 'arrowhead hot'], ['ahDim', 'arrowhead dim'], ['ahBad', 'arrowhead bad'], ['ahAlt', 'arrowhead alt'], ['ahGood', 'arrowhead good']]) {
        const m = svg('marker', { id: this.id + '-' + id, viewBox: '0 0 12 12', refX: '10.5', refY: '6', markerWidth: '9', markerHeight: '9', markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' });
        m.setAttribute('markerWidth', '13'); m.setAttribute('markerHeight', '13');
        m.appendChild(svg('path', { d: 'M1,1.5 L11,6 L1,10.5 L3.2,6 z', class: cls }));
        defs.appendChild(m);
      }
      this.root.appendChild(defs);
      this.layers = {};
      for (const l of ['back', 'lines', 'edges', 'items', 'labels', 'heads', 'top']) { const g = svg('g', { class: 'layer-' + l }); this.layers[l] = g; this.root.appendChild(g); }
      el.appendChild(this.root);
      this.items = new Map();      // key -> {spec, el, cur, from, to}
      this.view = null;            // the camera's box {x, y, w, h}
      this.anim = null;
      this.zoom = 1; this.panX = 0; this.panY = 0;
      this.onPick = null;          // a click on an item (answers to predictions)
      this.root.addEventListener('click', (e) => {
        if (this.justPanned) { this.justPanned = false; return; }
        const g = e.target.closest('[data-key]');
        if (g && this.onPick) this.onPick(g.dataset.key, e);
      });
    }

    /** Show a frame. opts: {duration (ms), instant} */
    show(frame, opts) {
      opts = opts || {};
      let dur = opts.instant ? 0 : (opts.duration === undefined ? 450 : opts.duration);
      try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) dur = Math.min(dur, 1); } catch (e) { /* no media queries */ }
      if (this.anim) this.finish();
      const next = new Map();
      for (const it of (frame && frame.items) || []) if (it && it.key) next.set(it.key, it.kind === 'arrow' ? Object.assign({}, it, { kind: 'edge' }) : it);
      this.next = next;
      // a frame may give a closer camera for narrow stages (a phone): one gadget at a time; what lies wholly
      // outside it is not drawn, and the svg says so (the diagram checker allows cuts at its edge then)
      const narrow = frame && frame.narrowView && this.root.clientWidth > 0 && this.root.clientWidth < 600;
      this.narrowBox = narrow ? frame.narrowView : null;
      if (narrow) this.root.dataset.narrow = '1'; else delete this.root.dataset.narrow;
      const tr = { start: performance.now(), dur, list: [] };
      for (const [k, spec] of next) {
        let o = this.items.get(k);
        if (!o) {
          o = { spec, key: k };
          o.el = this.make(spec);
          o.to = this.targetState(spec);
          o.cur = this.startState(spec, o.to);
          o.from = Object.assign({}, o.cur);
          o.entering = true;
          this.items.set(k, o);
          this.layers[layerOf(spec)].appendChild(o.el);
          this.update(o);
        } else {
          if (o.spec.kind !== spec.kind) { o.el.remove(); o.el = this.make(spec); this.layers[layerOf(spec)].appendChild(o.el); }
          o.from = Object.assign({}, o.cur);
          o.prevSpec = o.spec;
          o.spec = spec;
          o.to = this.targetState(spec);
          o.entering = false;
          this.update(o);
        }
        o.leaving = false;
        tr.list.push(o);
      }
      this.order(next);
      for (const [k, o] of this.items) {
        if (next.has(k)) continue;
        // a frame may say how things leave it: merged states fly into the state they became
        if (!o.leaving) { o.leaving = true; if (frame && frame.exits && frame.exits[k]) o.spec = Object.assign({}, o.spec, frame.exits[k]); o.from = Object.assign({}, o.cur); o.to = this.exitState(o.spec, o.cur); }
        tr.list.push(o);
      }
      const bounds = (narrow ? frame.narrowView : frame && frame.view) || S.stageBounds([...next.values()]) || { x: 0, y: 0, w: 800, h: 400 };
      tr.viewFrom = this.view || bounds;
      tr.viewTo = bounds;
      this.viewTarget = bounds;
      this.fitText();
      this.anim = tr;
      if (!dur) { this.finish(); return; }
      const step = (now) => {
        if (this.anim !== tr) return;
        const t = Math.min(1, (now - tr.start) / tr.dur);
        this.paint(tr, ease(t));
        if (t < 1) requestAnimationFrame(step); else this.finish();
      };
      requestAnimationFrame(step);
    }
    /**
     * Paint order follows the frame, not the order items first appeared: within each layer, by z (default 0),
     * then by place in the frame. Nodes are moved only when the order is wrong, so animations keep running.
     */
    order(next) {
      const by = new Map();
      let i = 0;
      for (const [k, spec] of next) {
        const o = this.items.get(k);
        if (!o) continue;
        const L = this.layers[layerOf(spec)];
        if (!by.has(L)) by.set(L, []);
        by.get(L).push({ el: o.el, z: +spec.z || 0, i: i++ });
      }
      for (const [L, list] of by) {
        list.sort((a, b) => a.z - b.z || a.i - b.i);
        const cur = [...L.children].filter((e) => list.some((x) => x.el === e));
        if (cur.length === list.length && cur.every((e, k) => e === list[k].el)) continue;
        for (const x of list) L.appendChild(x.el);
      }
    }
    finish() {
      const tr = this.anim;
      if (!tr) return;
      this.anim = null;
      this.paint(tr, 1);
      for (const o of tr.list) {
        if (o.leaving) { o.el.remove(); if (this.items.get(o.key) === o) this.items.delete(o.key); }
        o.entering = false;
      }
    }
    clear() { if (this.anim) this.anim = null; for (const o of this.items.values()) o.el.remove(); this.items.clear(); this.view = null; }

    // ---- the numbers that tween ----------------------------------------------------------------------------
    targetState(s) {
      // dim is an opacity the stage tweens itself: an inline opacity would hide a CSS one
      const st = { opacity: (s.opacity === undefined ? 1 : s.opacity) * (isDim(s) ? DIM : 1) };
      if (this.narrowBox && s.kind !== 'edge') { const b = itemBox(s), v = this.narrowBox; if (b && (b.x > v.x + v.w || b.x + b.w < v.x || b.y > v.y + v.h || b.y + b.h < v.y)) st.opacity = 0; }
      for (const k of NUMS) if (typeof s[k] === 'number') st[k] = s[k];
      return st;
    }
    /** Where an item is: its current numbers if it is on the stage, else where the next frame puts it */
    whereIs(key) {
      const o = this.items.get(key);
      if (o && o.cur) return o.cur;
      const s = this.next && this.next.get(key);
      return s ? this.targetState(s) : null;
    }
    startState(s, t) {
      const st = Object.assign({}, t);
      switch (s.enter) {
        case 'drop': st.y = (t.y || 0) - 50; st.opacity = 0; break;
        case 'rise': st.y = (t.y || 0) + 50; st.opacity = 0; break;
        case 'grow':
          if (s.kind === 'state' || s.kind === 'token') { if (st.r !== undefined) st.r = 0; if (st.w !== undefined) { st.w = 0; st.h = 0; } }
          else if (st.w !== undefined) { st.x += st.w / 2; st.w = 0; if (st.h !== undefined) { st.y += st.h / 2; st.h = 0; } }
          st.opacity = 0.2;
          break;
        case 'fly': if (s.from && typeof s.from === 'object' && s.kind !== 'edge') { st.x = s.from.x; st.y = s.from.y; } st.opacity = 0.2; break;
        case 'from': {
          // grow out of the items it came from: a merged state starts where its parts were
          const src = [].concat(s.src || []).map((k) => this.whereIs(k)).filter(Boolean);
          if (src.length) {
            st.x = src.reduce((a, c) => a + (c.x || 0), 0) / src.length;
            st.y = src.reduce((a, c) => a + (c.y || 0), 0) / src.length;
            for (const k of ['w', 'h', 'r', 'rx']) if (src[0][k] !== undefined && st[k] !== undefined) st[k] = src[0][k];
            st.opacity = 0.35;
          } else st.opacity = 0;
          break;
        }
        case 'none': break;
        default: st.opacity = 0;
      }
      return st;
    }
    exitState(s, cur) {
      const st = Object.assign({}, cur);
      switch (s.exit) {
        case 'fall': st.y = (cur.y || 0) + 60; st.opacity = 0; break;
        case 'rise': st.y = (cur.y || 0) - 60; st.opacity = 0; break;
        case 'shrink': if (st.r !== undefined) st.r = 0; else if (s.kind === 'state' && st.w !== undefined) { st.w = 0; st.h = 0; } else if (st.w !== undefined) { st.x += st.w / 2; st.w = 0; } st.opacity = 0; break;
        case 'into': { const t = s.into && this.whereIs(s.into); if (t) { st.x = t.x; st.y = t.y; } st.opacity = 0; break; }
        default: st.opacity = 0;
      }
      return st;
    }

    // ---- painting one moment of a transition ------------------------------------------------------------
    paint(tr, e) {
      for (const o of tr.list) {
        const c = {};
        for (const k in o.to) c[k] = lerp(o.from[k] === undefined ? o.to[k] : o.from[k], o.to[k], e);
        o.cur = c;
        if (o.spec.kind !== 'edge') this.place(o);
      }
      const v = { x: lerp(tr.viewFrom.x, tr.viewTo.x, e), y: lerp(tr.viewFrom.y, tr.viewTo.y, e), w: lerp(tr.viewFrom.w, tr.viewTo.w, e), h: lerp(tr.viewFrom.h, tr.viewTo.h, e) };
      this.view = v;
      this.applyView();
      for (const o of tr.list) if (o.spec.kind === 'edge') this.placeEdge(o);
    }

    /**
     * Text the camera would show smaller than opts.minText screen pixels (a number, or a function giving one)
     * is drawn larger, up to opts.textCap (default 1.3) times its own size, so a picture fitted into a small
     * stage stays readable. Measured at the reader's zoom 1, for the view the frame ends on.
     */
    fitText() {
      const min = typeof this.opts.minText === 'function' ? this.opts.minText() : this.opts.minText;
      const v = this.viewTarget, W = this.root.clientWidth, H = this.root.clientHeight;
      if (!min || !v || !W || !H) return;
      if (!this.ro && typeof ResizeObserver !== 'undefined') {
        let last = W + 'x' + H;
        this.ro = new ResizeObserver(() => { const k = this.root.clientWidth + 'x' + this.root.clientHeight; if (k !== last) { last = k; this.fitText(); } });
        this.ro.observe(this.root);
      }
      const need = min / Math.min(W / v.w, H / v.h), cap = this.opts.textCap || 1.3;
      this.root._needFs = need; this.root._capFs = cap;
      // free text, braces and schematics, and the text of cells and states while it fits its box; not edge labels
      // (beside lines that pass other things), nor code listings (whose tokens sit at fixed columns)
      const texts = [...this.root.querySelectorAll('.it-text text, .it-bracket text, .it-schem text, .it-cell .cell-text, .it-state .st-text')].filter((t) => !t.closest('.vc-tok, .vc-ln, .vc-note, [data-fit="no"]'));
      // put back what was there, read every size, then write: two style passes in all
      for (const t of texts) if (t._fsOver !== undefined) { if (t.style.fontSize === t._fsOver) t.style.fontSize = t._fsOrig; t._fsOver = undefined; }
      const base = texts.map((t) => parseFloat(getComputedStyle(t).fontSize) || 0);
      // the boxes of everything on the stage a growing text must keep clear of (made once, when first needed)
      let otherBoxes = null;
      const others = () => otherBoxes || (otherBoxes = [...(this.next || new Map()).values()].filter((x) => !/^(region|ellipse|line|edge|arrow)$/.test(x.kind)).map((x) => ({ key: x.key, b: itemBox(x), text: x.kind === 'text', anchor: x.anchor || 'start', boxed: x.kind === 'cell' || x.kind === 'state' })).filter((x) => x.b));
      const hit = (p, q, m) => { m = m === undefined ? 2 : m; return p.x < q.x + q.w + m && p.x + p.w + m > q.x && p.y < q.y + q.h + m && p.y + p.h + m > q.y; };
      // the text of a cell or a state grows only while it fits its box (one line of it, alone in the box)
      const room = (t, b) => {
        // free text grows only as far as the edge of the picture
        const ft = t.closest('.it-text');
        // on a narrow stage (a phone) free text keeps its size: the reader zooms, and the room is too tight to guess
        if (ft && this.root.clientWidth < 600) return 1;
        if (ft) {
          const o = this.items.get(ft.dataset.key), s = o && o.spec, len = t.getComputedTextLength ? t.getComputedTextLength() : 0;
          if (!s || !len) return cap;
          const R = v.x + v.w - 2 - s.x, L = s.x - v.x - 2, a = s.anchor || 'start';
          let k = Math.max(1, Math.min(cap, a === 'end' ? L / len : a === 'middle' ? (2 * Math.min(L, R)) / len : R / len));
          // and not into a neighbour it was clear of (a column heading beside the next one, a note beside a cell)
          const b0 = itemBox(s);
          if (b0 && k > 1) {
            // laid over a cell or a state (an index in its corner): it stays as it is, clear of that text
            if (others().some((x) => x.key !== s.key && x.boxed && hit(b0, x.b, 0))) return 1;
            const growBox = (bx, an, f) => { const w = bx.w * f, h = bx.h * f; return { x: an === 'end' ? bx.x + bx.w - w : an === 'middle' ? bx.x + (bx.w - w) / 2 : bx.x, y: bx.y + (bx.h - h) / 2, w, h }; };
            // a neighbouring text may grow too: keep clear of the most it could take
            const near = others().filter((x) => x.key !== s.key && !hit(b0, x.b, 0)).map((x) => (x.text ? growBox(x.b, x.anchor, cap) : x.b));
            while (k > 1 && near.some((q) => hit(growBox(b0, a, k), q))) k = Math.max(1, k - 0.05);
          }
          return k;
        }
        const g = t.closest('.it-cell, .it-state');
        if (!g) return cap;
        const o = this.items.get(g.dataset.key), s = o && o.spec;
        if (!s || t.parentNode.querySelectorAll('text').length !== 1 || s.sub) return 1;
        const len = t.getComputedTextLength ? t.getComputedTextLength() : 0;
        if (!len) return 1;
        const W = s.kind === 'state' ? (s.w ? s.w - 12 : 2 * (s.r || 30) * 0.72) : (s.w || 0) - 8, H = s.kind === 'state' ? (s.h || 2 * (s.r || 30)) - 6 : (s.h || 0) - 4;
        let k = Math.max(1, Math.min(cap, W / len, H / (b * 1.2)));
        // nor into another text laid over the box (an index in its corner)
        const cb = itemBox(s);
        if (cb && k > 1 && others().some((x) => x.key !== s.key && x.text && hit(cb, x.b))) k = 1;
        return k;
      };
      const grow = texts.map((t, i) => (base[i] && base[i] < need ? room(t, base[i]) : 1));
      texts.forEach((t, i) => {
        const b = base[i];
        if (!b || b >= need || grow[i] <= 1) return;
        t._fsOrig = t.style.fontSize;
        t.style.fontSize = Math.round(Math.min(need, b * grow[i]) * 100) / 100 + 'px';
        t._fsOver = t.style.fontSize;
      });
    }
    /** The camera's view, with the reader's own zoom and pan on top */
    applyView() {
      const v = this.view;
      if (!v) return;
      const z = this.zoom || 1;
      let w = v.w / z, hh = v.h / z, x = v.x + (v.w - w) / 2 + this.panX, y = v.y + (v.h - hh) / 2 + this.panY;
      // keep a strip on the right free for the zoom buttons: fit the view into the box less that strip
      const R = this.opts.reserveRight || 0, W = this.root.clientWidth, H = this.root.clientHeight;
      if (R && W > R * 3 && H > 0) {
        const s = Math.max(w / (W - R), hh / H);
        const nw = W * s, nh = H * s;
        x -= ((W - R) * s - w) / 2; y -= (nh - hh) / 2; w = nw; hh = nh;
      }
      this.root.setAttribute('viewBox', [x, y, w, hh].map((n) => Math.round(n * 10) / 10).join(' '));
    }
    setZoom(z, keepPan) {
      this.zoom = Math.max(1, Math.min(6, z));
      if (this.zoom === 1 || !keepPan) { this.panX = 0; this.panY = 0; }
      this.applyView();
      if (this.onZoom) this.onZoom(this.zoom);
    }
    fit() { this.setZoom(1); }
    /** Drag to pan and pinch or ctrl+wheel to zoom, once zoomed in */
    enableZoom() {
      const el = this.root;
      let drag = null;
      const pts = new Map();
      const unit = () => { const r = el.getBoundingClientRect(); const v = this.view || { w: r.width, h: r.height }; return Math.max(v.w / Math.max(1, r.width), v.h / Math.max(1, r.height)) / (this.zoom || 1); };
      el.addEventListener('wheel', (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        this.setZoom((this.zoom || 1) * (e.deltaY < 0 ? 1.15 : 1 / 1.15), true);
      }, { passive: false });
      el.addEventListener('pointerdown', (e) => {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) { const [a, b] = [...pts.values()]; drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y), z: this.zoom || 1 }; return; }
        if ((this.zoom || 1) > 1) drag = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY, moved: false };
      });
      el.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (!drag) return;
        if (drag.pinch && pts.size === 2) { const [a, b] = [...pts.values()]; this.setZoom(drag.z * Math.hypot(a.x - b.x, a.y - b.y) / drag.pinch, true); return; }
        if (drag.pinch) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 5) return;
        drag.moved = true;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
        const u = unit();
        this.panX = drag.px - dx * u; this.panY = drag.py - dy * u;
        this.applyView();
      });
      const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2 && drag && drag.pinch) drag = null; if (!pts.size) { if (drag && drag.moved) this.justPanned = true; drag = null; } };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    }

    // ---- making elements ---------------------------------------------------------------------------------
    make(s) {
      const g = svg('g', { 'data-key': s.key });
      const T_ = (cls, anchor) => svg('text', { class: cls, 'text-anchor': anchor || 'middle' });
      switch (s.kind) {
        case 'state': g.append(svg('rect', { class: 'st-shape' }), svg('rect', { class: 'st-ring' }), svg('g', { class: 'st-lines' }), T_('st-sub')); break;
        case 'edge': g.append(svg('path', { class: 'edge-path' }), T_('edge-label')); break;
        case 'cell': g.append(svg('rect', { class: 'cell-box' }), svg('g', { class: 'cell-lines' }), T_('cell-sub')); break;
        case 'text': g.append(T_('free-text', 'start')); break;
        case 'region': g.append(svg('rect', { class: 'region-box' }), T_('region-text', 'start')); break;
        case 'ellipse': g.append(svg('ellipse', { class: 'ell-shape' }), T_('ell-text')); break;
        case 'line': g.append(svg('line', { class: 'plain-line' })); break;
        case 'token': g.append(svg('circle', { class: 'token-dot' }), T_('token-text')); break;
        case 'head': g.append(svg('path', { class: 'head-tag' }), T_('head-text')); break;
        case 'bracket': g.append(svg('path', { class: 'bracket-path' }), T_('bracket-text')); break;
        case 'domino': g.append(svg('rect', { class: 'dom-box' }), svg('line', { class: 'dom-mid', 'data-audit': 'ignore' }), T_('dom-top'), T_('dom-bot')); break;
        case 'tile': for (let i = 0; i < 4; i++) g.appendChild(svg('path', { class: 'tile-tri', 'data-audit': 'overlap-ok' })); g.appendChild(svg('rect', { class: 'tile-box' })); break;
        case 'schem': g.appendChild(svg('g', { class: 'schem-body' })); break;
        case 'wave': g.append(svg('path', { class: 'wave-line' }), svg('g', { class: 'wave-vals' })); break;
      }
      return g;
    }
    /** What changes without tweening: text and classes */
    update(o) {
      const s = o.spec, g = o.el;
      g.setAttribute('class', 'it it-' + s.kind + (s.cls ? ' ' + s.cls : '') + (s.dim ? ' dim' : '') + (s.pick ? ' pickable' : '') + (s.accept ? ' accept' : ''));
      if (s.audit) g.setAttribute('data-audit', s.audit); else if (s.kind === 'region' || s.kind === 'ellipse') g.setAttribute('data-audit', 'group'); else g.removeAttribute('data-audit');
      if (s.pulse) { g.classList.remove('pulse'); void g.getBBox; requestAnimationFrame(() => g.classList.add('pulse')); }
      let tt = g.querySelector(':scope > title');
      if (s.title) { if (!tt) { tt = svg('title'); g.appendChild(tt); } tt.textContent = s.title; } else if (tt) tt.remove();
      const setLines = (box, lines, cls) => {
        while (box.childNodes.length < lines.length) box.appendChild(svg('text', { class: cls, 'text-anchor': 'middle' }));
        while (box.childNodes.length > lines.length) box.lastChild.remove();
        lines.forEach((l, i) => { box.childNodes[i].textContent = l; });
      };
      switch (s.kind) {
        case 'state': setLines(g.querySelector('.st-lines'), s.lines || [str(s.text)], 'st-text'); g.querySelector('.st-sub').textContent = str(s.sub); break;
        case 'edge': {
          const t = g.querySelector('.edge-label');
          const lines = str(s.label).split('\n');
          t.textContent = '';
          if (lines.length === 1) t.textContent = lines[0];
          else lines.forEach((l) => { const sp = svg('tspan'); sp.textContent = l; t.appendChild(sp); });
          if (s.labelCls) t.setAttribute('class', 'edge-label ' + s.labelCls); else t.setAttribute('class', 'edge-label');
          break;
        }
        case 'cell': setLines(g.querySelector('.cell-lines'), s.lines || [str(s.text)], 'cell-text'); g.querySelector('.cell-sub').textContent = str(s.sub); break;
        case 'text': { const t = g.querySelector('text'); t.textContent = str(s.text); t.setAttribute('text-anchor', s.anchor || 'start'); break; }
        case 'region': g.querySelector('.region-text').textContent = str(s.text); break;
        case 'ellipse': g.querySelector('.ell-text').textContent = str(s.text); break;
        case 'token': g.querySelector('.token-text').textContent = str(s.text); break;
        case 'head': g.querySelector('.head-text').textContent = str(s.text); break;
        case 'bracket': g.querySelector('.bracket-text').textContent = str(s.text); break;
        case 'domino': g.querySelector('.dom-top').textContent = str(s.top); g.querySelector('.dom-bot').textContent = str(s.bottom); break;
        case 'tile': [...g.querySelectorAll('.tile-tri')].forEach((p, i) => p.setAttribute('class', 'tile-tri tc' + (((s.edges || [])[i] | 0) % 8))); break;
        case 'schem': drawSchem(g.firstChild, s); break;
      }
      const sz = s.size;
      for (const t of g.querySelectorAll('text')) if (sz) t.style.fontSize = sz + 'px'; else t.style.removeProperty('font-size');
    }

    // ---- placing elements --------------------------------------------------------------------------------
    place(o) {
      const s = o.spec, c = o.cur, g = o.el;
      g.style.opacity = c.opacity === undefined ? 1 : Math.max(0, Math.min(1, c.opacity));
      const A = (el, attrs) => { for (const k in attrs) el.setAttribute(k, typeof attrs[k] === 'number' ? Math.round(attrs[k] * 100) / 100 : attrs[k]); };
      switch (s.kind) {
        case 'state': {
          const sh = Geo.shapeOf(c);
          A(g.querySelector('.st-shape'), { x: c.x - sh.w / 2, y: c.y - sh.h / 2, width: Math.max(0, sh.w), height: Math.max(0, sh.h), rx: Math.max(0, Math.min(sh.rx, sh.w / 2, sh.h / 2)) });
          const ring = g.querySelector('.st-ring');
          if (s.accept) { const d = 5; ring.style.display = ''; A(ring, { x: c.x - sh.w / 2 - d, y: c.y - sh.h / 2 - d, width: Math.max(0, sh.w + 2 * d), height: Math.max(0, sh.h + 2 * d), rx: Math.max(0, Math.min(sh.rx + d, sh.w / 2 + d, sh.h / 2 + d)) }); }
          else ring.style.display = 'none';
          const lines = g.querySelectorAll('.st-lines text');
          const fs = c.size || (lines.length > 1 ? 14 : 17), lh = fs * 1.22;
          lines.forEach((t, i) => A(t, { x: c.x, y: c.y + (i - (lines.length - 1) / 2) * lh + fs * 0.35 }));
          A(g.querySelector('.st-sub'), { x: c.x, y: c.y + sh.h / 2 + (s.accept ? 5 : 0) + 17 });
          break;
        }
        case 'cell': {
          A(g.querySelector('rect'), { x: c.x, y: c.y, width: Math.max(0, c.w), height: Math.max(0, c.h), rx: c.rx === undefined ? 6 : c.rx });
          const lines = g.querySelectorAll('.cell-lines text');
          const fs = c.size || (lines.length > 1 ? 13 : 16), lh = Math.max(fs * 1.2, Math.min((c.h - 6) / Math.max(1, lines.length), fs * 2));
          // align: 'left' starts the text near the left edge (code lines, item lists)
          const left = s.align === 'left';
          lines.forEach((t, i) => { t.setAttribute('text-anchor', left ? 'start' : 'middle'); A(t, { x: left ? c.x + 10 : c.x + c.w / 2, y: c.y + c.h / 2 + (i - (lines.length - 1) / 2) * lh + fs * 0.35 }); });
          A(g.querySelector('.cell-sub'), { x: c.x + c.w / 2, y: c.y + c.h + 14 });
          break;
        }
        case 'text': A(g.querySelector('text'), { x: c.x, y: c.y }); break;
        case 'region': {
          A(g.querySelector('rect'), { x: c.x, y: c.y, width: Math.max(0, c.w), height: Math.max(0, c.h), rx: c.rx === undefined ? 14 : c.rx });
          const t = g.querySelector('text');
          if (s.textPos === 'top') { t.setAttribute('text-anchor', 'middle'); A(t, { x: c.x + c.w / 2, y: c.y + 20 }); } else { t.setAttribute('text-anchor', 'start'); A(t, { x: c.x + 12, y: c.y + 20 }); }
          break;
        }
        case 'ellipse': {
          A(g.querySelector('ellipse'), { cx: c.x, cy: c.y, rx: Math.max(0, c.rx), ry: Math.max(0, c.ry) });
          A(g.querySelector('text'), { x: c.tx === undefined ? c.x : c.tx, y: c.ty === undefined ? c.y - c.ry + 22 : c.ty });
          break;
        }
        case 'line': A(g.querySelector('line'), { x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 }); break;
        case 'token': { const r = c.r === undefined ? 9 : c.r; A(g.querySelector('circle'), { cx: c.x, cy: c.y, r: Math.max(0, r) }); A(g.querySelector('text'), { x: c.x, y: c.y + 4 }); break; }
        case 'head': {
          // a tag with a point: the point touches (x, y), the tag holds the state's name
          const w = Math.max(30, Geo.textWidth(s.text || '', 13, { bold: true }) + 16), hh = 24, tip = 9;
          const up = s.side === 'above';
          const y0 = up ? c.y - tip - hh : c.y + tip, yT = c.y + (up ? -1 : 1);
          const x0 = c.x - w / 2, x1 = c.x + w / 2, yb = up ? y0 + hh : y0, yo = up ? y0 : y0 + hh;
          const d = `M${c.x},${yT} L${c.x + 8},${yb} L${x1 - 6},${yb} Q${x1},${yb} ${x1},${yb + (up ? -6 : 6)} L${x1},${yo + (up ? 6 : -6)} Q${x1},${yo} ${x1 - 6},${yo} L${x0 + 6},${yo} Q${x0},${yo} ${x0},${yo + (up ? 6 : -6)} L${x0},${yb + (up ? -6 : 6)} Q${x0},${yb} ${x0 + 6},${yb} L${c.x - 8},${yb} Z`;
          g.querySelector('path').setAttribute('d', d);
          A(g.querySelector('text'), { x: c.x, y: y0 + hh / 2 + 4.5 });
          break;
        }
        case 'bracket': {
          const up = s.side === 'above', dir = up ? -1 : 1, y = c.y, x1 = Math.min(c.x1, c.x2) + 2, x2 = Math.max(c.x1, c.x2) - 2, mx = (x1 + x2) / 2;
          g.querySelector('path').setAttribute('d', `M${x1},${y} L${x1},${y + 6 * dir} L${mx - 5},${y + 6 * dir} L${mx},${y + 11 * dir} L${mx + 5},${y + 6 * dir} L${x2},${y + 6 * dir} L${x2},${y}`);
          A(g.querySelector('text'), { x: mx, y: up ? y - 17 : y + 28 });
          break;
        }
        case 'domino': {
          A(g.querySelector('rect'), { x: c.x, y: c.y, width: Math.max(0, c.w), height: Math.max(0, c.h), rx: 8 });
          A(g.querySelector('line'), { x1: c.x + 6, x2: c.x + c.w - 6, y1: c.y + c.h / 2, y2: c.y + c.h / 2 });
          A(g.querySelector('.dom-top'), { x: c.x + c.w / 2, y: c.y + c.h / 4 + 6 });
          A(g.querySelector('.dom-bot'), { x: c.x + c.w / 2, y: c.y + c.h * 3 / 4 + 6 });
          break;
        }
        case 'schem': { const b = s.res && s.res.bounds; if (b) g.firstChild.setAttribute('transform', 'translate(' + Math.round((c.x - b.x) * 100) / 100 + ' ' + Math.round((c.y - b.y) * 100) / 100 + ')'); break; }
        case 'wave': placeWave(g, s, c); break;
        case 'tile': {
          const Z = c.size || 50, x = c.x, y = c.y, mx = x + Z / 2, my = y + Z / 2;
          const tri = [[[x, y], [x + Z, y]], [[x + Z, y], [x + Z, y + Z]], [[x + Z, y + Z], [x, y + Z]], [[x, y + Z], [x, y]]];
          g.querySelectorAll('.tile-tri').forEach((p, i) => p.setAttribute('d', `M${tri[i][0][0]},${tri[i][0][1]} L${tri[i][1][0]},${tri[i][1][1]} L${mx},${my} Z`));
          A(g.querySelector('.tile-box'), { x, y, width: Z, height: Z, rx: 3 });
          break;
        }
      }
    }
    placeEdge(o) {
      const s = o.spec, g = o.el;
      const geom = edgeGeom(Object.assign({}, s, o.cur), (k) => { const it = this.items.get(k); return it && !it.leaving ? Object.assign({ kind: it.spec.kind }, it.cur) : (it ? Object.assign({ kind: it.spec.kind }, it.cur) : null); });
      if (!geom) { g.style.opacity = 0; return; }
      // an edge is never more visible than the states it joins (so it fades with them)
      let op = o.cur.opacity === undefined ? 1 : o.cur.opacity;
      for (const k of [s.from, s.to]) if (typeof k === 'string') { const it = this.items.get(k); if (it && it.cur && it.cur.opacity !== undefined) op = Math.min(op, Math.min(1, it.cur.opacity / (isDim(it.spec) ? DIM : 1))); }
      g.style.opacity = Math.max(0, Math.min(1, op));
      const p = g.querySelector('path');
      p.setAttribute('d', geom.d);
      const c = s.cls || '';
      const head = /\bbad\b/.test(c) ? 'ahBad' : /\bhot\b|\btaken\b/.test(c) ? 'ahHot' : /\bgood\b|\bcert\b/.test(c) ? 'ahGood' : /\bdim\b|\bdead\b/.test(c) || s.dim ? 'ahDim' : /\balt\b/.test(c) ? 'ahAlt' : 'ah';
      if (s.head === false) p.removeAttribute('marker-end'); else p.setAttribute('marker-end', 'url(#' + this.id + '-' + head + ')');
      const t = g.querySelector('.edge-label');
      if (s.label) {
        const at = o.cur.lx !== undefined ? { x: o.cur.lx, y: o.cur.ly } : defaultLabel(geom, s);
        const n = t.childNodes.length && t.firstChild.nodeType === 1 ? t.childNodes.length : 1;
        const fs = s.size || 14, lh = fs * 1.2;
        t.setAttribute('x', Math.round(at.x * 100) / 100);
        t.setAttribute('y', Math.round((at.y + fs * 0.35 - (n - 1) * lh / 2) * 100) / 100);
        if (n > 1) [...t.childNodes].forEach((sp, i) => { sp.setAttribute('x', Math.round(at.x * 100) / 100); sp.setAttribute('dy', i ? lh : 0); });
      }
    }
  }
  // ---- schematics and waveforms ------------------------------------------------------------------------
  /** a schematic item's drawing: the layout drawn once (per layout and symbol style), then values and lit parts */
  function drawSchem(body, s) {
    const style = s.style || (S.app && S.app.settings && S.app.settings.style) || 'shape';
    if (!s.res) { body.innerHTML = ''; return; }
    const ts = s.textScale || 1, pc = s.pinCap || 0;
    if (body._res !== s.res || body._style !== style || body._ts !== ts || body._pc !== pc) {
      const svgText = S.Render.svg(s.res, { style, textScale: ts, pinCap: pc });
      body.innerHTML = svgText.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
      body._res = s.res; body._style = style; body._ts = ts; body._pc = pc;
    }
    const vals = s.values || {}, names = new Map((s.res.nets || []).map((n) => [n.id, n.name]));
    for (const p of body.querySelectorAll('path[data-net]')) {
      const id = p.dataset.net, v = vals[id] !== undefined ? vals[id] : vals[names.get(id)];
      p.classList.remove('v0', 'v1', 'vx', 'vz', 'vbus');
      if (v === undefined || v === null) continue;
      const t = String(v).toLowerCase();
      p.classList.add(t === '0' || t === '1' || t === 'x' || t === 'z' ? 'v' + t : 'vbus');
    }
    const hot = new Set(s.hot || []);
    for (const g of body.querySelectorAll('g[data-part]')) g.classList.toggle('sk-hot', hot.has(g.dataset.part));
  }
  /** the bits of a waveform value, most significant first: '0', '1', 'x', 'z' each */
  const bitsOf = (v, w) => {
    if (typeof v === 'number') return v.toString(2).padStart(w, '0').slice(-w);
    const t = String(v === undefined || v === null ? 'x' : v).toLowerCase();
    return t.length >= w ? t.slice(-w) : t.padStart(w, /^[xz]/.test(t) ? t[0] : '0');
  };
  const busText = (b) => (/z/.test(b) ? 'Z' : /x/.test(b) ? 'X' : b.length <= 4 ? String(parseInt(b, 2)) : parseInt(b, 2).toString(16).toUpperCase());
  function placeWave(g, s, c) {
    const w = s.width || 1, t0 = s.t0 || 0, t1 = s.t1 === undefined ? t0 + 1 : s.t1, H = c.h || 24, W = c.w || 0;
    const X = (t) => c.x + ((Math.max(t0, Math.min(t1, t)) - t0) / Math.max(1e-9, t1 - t0)) * W;
    const ch = (s.changes || []).filter((q) => q[0] <= t1).map((q) => [q[0], bitsOf(q[1], w)]);
    const segs = [];
    ch.forEach((q, i) => { const a = Math.max(t0, q[0]), b = i + 1 < ch.length ? Math.max(t0, ch[i + 1][0]) : t1; if (b > a || (i === ch.length - 1 && a <= t1)) segs.push({ a: X(a), b: X(b), v: q[1] }); });
    const top = c.y, bot = c.y + H, mid = c.y + H / 2, r2 = (v) => Math.round(v * 100) / 100;
    let d = '';
    const vals = g.querySelector('.wave-vals');
    vals.innerHTML = '';
    if (w === 1) {
      const yOf = (v) => (v === '1' ? top : v === '0' ? bot : mid);
      segs.forEach((sg, i) => { const y = yOf(sg.v); d += (i ? 'L' + r2(sg.a) + ' ' + r2(y) : 'M' + r2(sg.a) + ' ' + r2(y)) + 'L' + r2(sg.b) + ' ' + r2(y); });
    } else {
      const k = Math.min(4, H / 3);
      // the values are 12px, larger when the stage asks for it (fitText), but never taller than the row
      const root = g.ownerSVGElement || {}, fs = Math.round(Math.max(12, Math.min(root._needFs || 0, 12 * (root._capFs || 1), H - 4)) * 100) / 100;
      // the top edge left to right, then the bottom edge back, crossing at each change
      const up = [], dn = [];
      segs.forEach((sg, i) => {
        const a = sg.a + (i ? k : 0), b = sg.b - (i + 1 < segs.length ? k : 0);
        up.push([i ? sg.a : sg.a, i ? mid : top], [a, top], [b, top]);
        dn.push([i ? sg.a : sg.a, i ? mid : bot], [a, bot], [b, bot]);
        const tx = busText(sg.v), tw = S.geom.textWidth(tx, fs, { mono: true });
        if (b - a > tw + 10) { const t = svg('text', { class: 'wave-val', x: r2((a + b) / 2), y: r2(mid + fs * 0.35), 'text-anchor': 'middle' }); if (fs !== 12) t.style.fontSize = fs + 'px'; t.textContent = tx; vals.appendChild(t); }
      });
      if (segs.length) { const end = segs[segs.length - 1].b; up.push([end, top]); dn.push([end, bot]); }
      d = up.map((p, i) => (i ? 'L' : 'M') + r2(p[0]) + ' ' + r2(p[1])).join('') + dn.map((p, i) => (i ? 'L' : 'M') + r2(p[0]) + ' ' + r2(p[1])).join('');
    }
    const path = g.querySelector('.wave-line');
    path.setAttribute('d', d);
    path.setAttribute('class', 'wave-line' + (w > 1 ? ' bus' : ''));
  }

  function layerOf(s) {
    switch (s.kind) {
      case 'region': case 'ellipse': return s.layer || 'back';
      case 'line': case 'bracket': return s.layer || 'lines';
      case 'edge': return s.layer || 'edges';
      case 'head': case 'token': return 'heads';
      case 'text': return s.layer || 'labels';
    }
    return s.layer || 'items';
  }

  S.Stage = Stage;
})(globalThis.Sirkit = globalThis.Sirkit || {});
