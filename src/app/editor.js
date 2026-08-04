// The circuit editor's canvas: a document drawn on a grid that pans and zooms (wheel, pinch, keys) with a
// minimap, parts dragged from the palette, wires drawn from pin to pin (or branched from a wire) and routed as
// they are drawn, selection by click or box, copy and paste, turning and mirroring, alignment, blocks made from
// a selection and opened by a double-click, tidy-up by the layout engine, undo and redo of everything. While
// a simulation runs, wires take the colour of their values and switches and buttons answer clicks.
(function (S) {
  'use strict';
  const { h, icon } = S.UI;
  const D = new Proxy({}, { get: (_, k) => S.Doc[k] }), R = new Proxy({}, { get: (_, k) => S.EdDraw[k] }); // loaded later
  const NS = 'http://www.w3.org/2000/svg';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const U = () => S.Symbols.U;

  class Editor {
    /**
     * host: the element to fill. opts: { doc, onChange(doc, why), onSelect(sel), onEdit(part), onToggle(part, down),
     * onWire(wireId) , readOnly }
     */
    constructor(host, opts) {
      this.opts = opts || {};
      this.host = host;
      this.root = opts.doc ? clone(opts.doc) : D.blank();
      this.path = [];
      this.sel = new Set();
      this.values = new Map();
      this.viol = new Map();
      this.probes = new Set();
      this.view = { x: 0, y: 0, z: 1 };
      this.hist = [JSON.stringify(this.root)]; this.hi = 0;
      this.wrap = h('div.ed-wrap', { tabindex: '0', 'aria-label': 'Circuit canvas: drag parts here, drag from pin to pin to wire them' });
      this.svg = document.createElementNS(NS, 'svg');
      this.svg.setAttribute('class', 'sk ed-svg');
      this.svg.setAttribute('data-schematic', '1');
      this.svg.setAttribute('role', 'img');
      this.svg.setAttribute('aria-label', 'circuit');
      this.layer = document.createElementNS(NS, 'g');
      this.ui = document.createElementNS(NS, 'g');
      this.ui.setAttribute('class', 'ed-ui');
      this.ui.setAttribute('data-audit', 'ignore');
      this.svg.append(this.layer, this.ui);
      this.tags = h('div.ed-tags', { 'aria-hidden': 'true' });
      this.mini = document.createElementNS(NS, 'svg');
      this.mini.setAttribute('class', 'ed-mini');
      this.mini.setAttribute('data-audit', 'ignore');
      this.zoomBox = h('div.ed-zoom',
        this.zbtn('zoomIn', 'Zoom in (+)', () => this.zoomBy(1.25)),
        this.zbtn('zoomOut', 'Zoom out (−)', () => this.zoomBy(0.8)),
        this.zbtn('fit', 'Fit the circuit (F)', () => this.fit()));
      this.empty = h('div.ed-empty', icon('gate'), h('b', 'An empty canvas'), h('span', 'Drag a part here from the palette, or open a sample.'));
      this.wrap.append(this.svg, this.tags, this.mini, this.zoomBox, this.empty);
      host.appendChild(this.wrap);
      this.bind();
      this.ro = new ResizeObserver(() => { const w = this.wrap.clientWidth, hh = this.wrap.clientHeight; if (w !== this._w || hh !== this._h) { const first = !this._w; this._w = w; this._h = hh; if (first) this.fit(); else this.applyView(); } });
      this.ro.observe(this.wrap);
      this.render();
    }
    zbtn(ic, title, fn) { const b = h('button.icon-btn.zbtn', { type: 'button', title, 'aria-label': title }, icon(ic)); b.addEventListener('click', fn); return b; }
    dispose() { this.ro.disconnect(); this.disposed = true; clearTimeout(this.flashT); }

    // ---- the document --------------------------------------------------------------------------------------
    get doc() { let d = this.root; for (const b of this.path) { const bl = d.blocks && d.blocks[b] || this.root.blocks[b]; if (!bl) break; d = bl.doc; } return d; }
    /** replace the whole document (opening a file, a sample); undoable */
    setDoc(doc, opts) {
      this.root = clone(doc);
      this.root.blocks = this.root.blocks || {}; this.root.notes = this.root.notes || [];
      this.path = []; this.sel.clear();
      if (!opts || opts.history !== false) this.commit('open'); else { this.hist = [JSON.stringify(this.root)]; this.hi = 0; this.render(); }
      if (!opts || opts.fit !== false) requestAnimationFrame(() => this.fit());
    }
    /** record the state after a change, and redraw */
    commit(why) {
      // a block being edited: its ports follow its IN and OUT parts, and every use of it follows its ports
      if (this.path.length) this.syncBlocks();
      const js = JSON.stringify(this.root);
      if (js !== this.hist[this.hi]) {
        this.hist.splice(this.hi + 1);
        this.hist.push(js);
        if (this.hist.length > 300) this.hist.shift();
        this.hi = this.hist.length - 1;
      }
      this.render();
      if (this.opts.onChange) this.opts.onChange(this.root, why);
    }
    restore(js) {
      this.root = JSON.parse(js);
      while (this.path.length && !this.root.blocks[this.path[this.path.length - 1]]) this.path.pop();
      const ids = new Set(this.doc.parts.map((p) => 'p:' + p.id).concat(this.doc.wires.map((w) => 'w:' + w.id)));
      for (const k of [...this.sel]) if (!ids.has(k)) this.sel.delete(k);
      this.render();
      if (this.opts.onChange) this.opts.onChange(this.root, 'undo');
    }
    undo() { if (this.hi > 0) { this.hi--; this.restore(this.hist[this.hi]); return true; } return false; }
    redo() { if (this.hi < this.hist.length - 1) { this.hi++; this.restore(this.hist[this.hi]); return true; } return false; }
    get canUndo() { return this.hi > 0; }
    get canRedo() { return this.hi < this.hist.length - 1; }
    syncBlocks() {
      // from the innermost block out: ports, then the pins of every instance in every document
      let d = this.root;
      const chain = [];
      for (const b of this.path) { chain.push(b); d = this.root.blocks[b] && this.root.blocks[b].doc; if (!d) return; }
      for (const name of chain) {
        const bl = this.root.blocks[name];
        Object.assign(bl, D.blockPorts(bl.doc));
        const names = new Set(bl.inputs.concat(bl.outputs).map((x) => (typeof x === 'string' ? x : x.name)));
        const fix = (doc) => {
          for (const p of doc.parts) if (p.type === 'BLOCK' && p.params.block === name) {
            for (const w of doc.wires) w.pins = w.pins.filter(([pid, pn]) => pid !== p.id || names.has(pn));
            delete p.g;
          }
          doc.wires = doc.wires.filter((w) => w.pins.length >= 2);
        };
        fix(this.root);
        for (const b of Object.values(this.root.blocks)) fix(b.doc);
      }
    }

    // ---- view ----------------------------------------------------------------------------------------------
    size() { return { w: this.wrap.clientWidth || 800, h: this.wrap.clientHeight || 500 }; }
    /** zoomed out on a desktop, the names are drawn larger so they stay readable (in steps, at most 1.4 times); a
     * phone pinches to zoom instead */
    textScaleFor(z) { return !z || z >= 0.97 || innerWidth < 600 ? 1 : Math.min(1.4, Math.ceil(1.02 / z * 20) / 20); }
    applyView() {
      const { w, h: hh } = this.size(), v = this.view;
      if (this.layer && this.textScaleFor(v.z) !== (this.ts || 1)) { this.render(); return; }
      this.svg.setAttribute('viewBox', `${v.x} ${v.y} ${w / v.z} ${hh / v.z}`);
      this.svg.setAttribute('width', w); this.svg.setAttribute('height', hh);
      const g = U() * v.z;
      this.wrap.style.backgroundSize = g + 'px ' + g + 'px';
      this.wrap.style.backgroundPosition = (-v.x * v.z % g) + 'px ' + (-v.y * v.z % g) + 'px';
      this.placeTags();
      this.drawMini();
    }
    /** show the whole drawing */
    fit(pad) {
      const b = this.bounds || { x: 0, y: 0, w: 400, h: 300 };
      const { w, h: hh } = this.size();
      pad = pad == null ? 24 : pad;
      const z = Math.max(0.25, Math.min(2.2, Math.min((w - 2 * pad) / b.w, (hh - 2 * pad) / b.h)));
      this.view = { z, x: b.x + b.w / 2 - w / z / 2, y: b.y + b.h / 2 - hh / z / 2 };
      this.applyView();
    }
    zoomBy(f, cx, cy) {
      const { w, h: hh } = this.size(), v = this.view;
      if (cx == null) { cx = w / 2; cy = hh / 2; }
      const z = Math.max(0.2, Math.min(4, v.z * f));
      const px = v.x + cx / v.z, py = v.y + cy / v.z;
      this.view = { z, x: px - cx / z, y: py - cy / z };
      this.applyView();
    }
    panBy(dx, dy) { this.view.x -= dx / this.view.z; this.view.y -= dy / this.view.z; this.applyView(); }
    /** a client point in drawing pixels */
    toDrawing(cx, cy) { const r = this.svg.getBoundingClientRect(); return { x: this.view.x + (cx - r.left) / this.view.z, y: this.view.y + (cy - r.top) / this.view.z }; }
    /** a drawing point (grid units, or pixels with px) on the screen */
    toScreen(x, y, px) { const r = this.svg.getBoundingClientRect(), u = px ? 1 : U(); return [r.left + (x * u - this.view.x) * this.view.z, r.top + (y * u - this.view.y) * this.view.z]; }
    pinScreen(pid, pin) { const dp = D.part(this.doc, pid); const p = dp && D.pinAt(this.doc, dp, pin); if (!p) throw new Error('no pin ' + pid + '.' + pin); return this.toScreen(p.x, p.y); }
    partScreen(pid) { const dp = D.part(this.doc, pid); const g = D.geom(dp, this.doc); return this.toScreen(dp.x + g.w / 2, dp.y + g.h / 2); }

    // ---- drawing -------------------------------------------------------------------------------------------
    render() {
      if (this.disposed) return;
      const doc = this.doc;
      this.ts = this.textScaleFor(this.view && this.view.z);
      this.routed = R.route(doc, this.ts);
      const viol = new Set(this.viol.keys());
      const m = R.markup(doc, this.routed, { style: S.app ? S.app.settings.style : 'shape', sel: this.sel, values: this.values, viol, strictPins: this.strict, textScale: this.ts });
      this.layer.innerHTML = m.svg;
      this.bounds = m.bounds;
      this.svg.setAttribute('aria-label', (doc.title || 'circuit') + ': ' + doc.parts.length + ' parts, ' + doc.wires.length + ' wires');
      this.empty.style.display = doc.parts.length ? 'none' : '';
      this.drawUi();
      this.applyView();
      if (this.opts.onSelect) this.opts.onSelect(this.sel);
    }
    /** colour the wires by value without drawing everything again: values is a Map wire id → bit string */
    setValues(values, changed) {
      const before = this.values;
      this.values = values || new Map();
      if (!this.values.size || !before.size) { this.render(); return; }
      const cls = ['v0', 'v1', 'vx', 'vz', 'vbus'];
      for (const p of this.layer.querySelectorAll('path[data-wire], circle[data-junction]')) {
        const id = p.dataset.wire || p.dataset.net, v = this.values.get(id);
        p.classList.remove(...cls);
        if (v) p.classList.add(R.valClass(v));
        if (changed && changed.has(id) && S.app && S.app.settings.animate && !S.UI.reducedMotion() && p.tagName === 'path') { p.classList.remove('flash'); void p.getBBox; p.classList.add('flash'); }
      }
      for (const g of this.layer.querySelectorAll('g[data-part]')) {
        const dp = D.part(this.doc, g.dataset.part);
        if (!dp || !['IN', 'SWITCH', 'BUTTON', 'OUT', 'LED', 'SEG7', 'HEX', 'PROBE'].includes(dp.type)) continue;
        g.setAttribute('class', g.getAttribute('class').replace(/ (val-\w+|seg-\w)/g, '') + this.partStateClass(dp));
        const dig = g.querySelector('[data-digit]');
        if (dig) { const q = D.partObj(dp, this.doc).pins.find((x) => x.dir === 'in'); const w = q && D.wireAt(this.doc, dp.id, q.name); const v = w && this.values.get(w.id); dig.textContent = v ? (dp.type === 'HEX' ? S.Eng.format(v, 'hex').slice(-1) : S.Eng.format(v, 'hex')) : '–'; }
      }
      this.placeTags();
    }
    partStateClass(dp) {
      const on = (pin) => { const w = D.wireAt(this.doc, dp.id, pin); return w && this.values.get(w.id); };
      return R.stateClass(dp, on);
    }
    setViolations(list) { this.viol = new Map(); for (const v of list || []) { const id = String(v.part || '').split('/')[0]; if (!this.viol.has(id)) this.viol.set(id, []); this.viol.get(id).push(v); } this.render(); }
    /** the HTML tags over the drawing: bus values, probes, violation marks */
    placeTags() {
      this.tags.innerHTML = '';
      if (!this.routed) return;
      const radix = (S.app && S.app.settings.radix) || 'hex';
      for (const n of this.routed.nets) {
        const v = this.values.get(n.id), probe = this.probes.has(n.id);
        if (!(v && v.length > 1) && !(probe && this.view.z >= 0.7)) continue;
        // a bus's value sits on its longest straight stretch; a probe's mark near where the wire starts
        let best = null;
        const bus = v && v.length > 1;
        for (const p of n.paths) for (let i = 1; i < p.pts.length; i++) { const a = p.pts[i - 1], b = p.pts[i], len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]); if (!best || (bus ? len > best.len : false)) best = { len, x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 }; }
        if (!best) continue;
        const [sx, sy] = this.toScreen(best.x, best.y, true);
        const r = this.svg.getBoundingClientRect();
        const t = h('span.ed-tag' + (probe ? '.probe' : '') + (bus ? '.bus' : ''), { style: { left: (sx - r.left) + 'px', top: (sy - r.top) + 'px' }, title: probe ? 'Probed: in the waveform' : '' }, probe ? icon('probe') : null, bus ? S.Eng.format(v, radix) : '');
        this.tags.appendChild(t);
      }
      for (const [id, vs] of this.viol) {
        const dp = D.part(this.doc, id);
        if (!dp) continue;
        const g = D.geom(dp, this.doc);
        const [sx, sy] = this.toScreen(dp.x + g.w, dp.y);
        const r = this.svg.getBoundingClientRect();
        const t = h('button.ed-viol', { type: 'button', title: vs[vs.length - 1].say, 'aria-label': 'Timing problem: ' + vs[vs.length - 1].say, style: { left: (sx - r.left) + 'px', top: (sy - r.top) + 'px' } }, '!');
        t.addEventListener('click', () => S.UI.toast(vs[vs.length - 1].say, 'err', 6000));
        this.tags.appendChild(t);
      }
    }
    drawUi() {
      let s = '';
      const u = U();
      for (const k of this.sel) {
        if (!k.startsWith('p:')) continue;
        const dp = D.part(this.doc, k.slice(2)); if (!dp) continue;
        const g = D.geom(dp, this.doc);
        s += `<rect class="ed-selbox" x="${dp.x * u - 4}" y="${dp.y * u - 4}" width="${g.w * u + 8}" height="${g.h * u + 8}" rx="4"/>`;
      }
      this.ui.innerHTML = s;
    }
    drawMini() {
      const b = this.bounds, { w, h: hh } = this.size(), v = this.view;
      const vw = w / v.z, vh = hh / v.z;
      const big = b && (b.w > vw * 1.02 || b.h > vh * 1.02 || b.x < v.x - 1 || b.y < v.y - 1 || b.x + b.w > v.x + vw + 1 || b.y + b.h > v.y + vh + 1);
      this.mini.style.display = big && this.doc.parts.length > 1 ? '' : 'none';
      if (!big) return;
      const x0 = Math.min(b.x, v.x), y0 = Math.min(b.y, v.y), x1 = Math.max(b.x + b.w, v.x + vw), y1 = Math.max(b.y + b.h, v.y + vh);
      this.mini.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
      const u = U();
      let s = '';
      for (const dp of this.doc.parts) { const g = D.geom(dp, this.doc); s += `<rect class="mm-part" x="${dp.x * u}" y="${dp.y * u}" width="${g.w * u}" height="${g.h * u}"/>`; }
      s += `<rect class="mm-view" x="${v.x}" y="${v.y}" width="${vw}" height="${vh}"/>`;
      this.mini.innerHTML = s;
      this.miniBox = { x0, y0, x1, y1 };
    }

    // ---- hit testing -----------------------------------------------------------------------------------------
    /** the pin nearest a drawing point (pixels), within reach: {part, pin, x, y} */
    pinNear(pt, reach) {
      const u = U(), lim = (reach || 0.8) * u;
      let best = null, bd = lim;
      for (const dp of this.doc.parts) {
        const g = D.geom(dp, this.doc);
        if (pt.x < dp.x * u - lim || pt.x > (dp.x + g.w) * u + lim || pt.y < dp.y * u - lim || pt.y > (dp.y + g.h) * u + lim) continue;
        for (const [name, q] of Object.entries(g.pins)) { const x = (dp.x + q.x) * u, y = (dp.y + q.y) * u, d = Math.hypot(x - pt.x, y - pt.y); if (d < bd) { bd = d; best = { part: dp.id, pin: name, x, y }; } }
      }
      return best;
    }
    partAt(pt) {
      const u = U();
      for (let i = this.doc.parts.length - 1; i >= 0; i--) { const dp = this.doc.parts[i], g = D.geom(dp, this.doc); if (pt.x >= dp.x * u && pt.x <= (dp.x + g.w) * u && pt.y >= dp.y * u && pt.y <= (dp.y + g.h) * u) return dp; }
      return null;
    }
    noteAt(pt) { for (const nt of this.doc.notes || []) { const b = R.noteBox(nt); if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) return nt; } return null; }
    /** the wire under a point, and the point on it */
    wireAt(pt, reach) {
      const lim = (reach || 5) / Math.max(0.5, this.view.z);
      let best = null, bd = lim;
      for (const n of this.routed.nets) for (const p of n.paths) for (let i = 1; i < p.pts.length; i++) {
        const [ax, ay] = p.pts[i - 1], [bx, by] = p.pts[i];
        const cx = Math.max(Math.min(ax, bx), Math.min(Math.max(ax, bx), pt.x)), cy = Math.max(Math.min(ay, by), Math.min(Math.max(ay, by), pt.y));
        const d = Math.hypot(cx - pt.x, cy - pt.y);
        if (d < bd) { bd = d; best = { wire: n.id, x: Math.round(cx / U()) * U(), y: Math.round(cy / U()) * U() }; }
      }
      return best;
    }

    // ---- input -----------------------------------------------------------------------------------------------
    bind() {
      const w = this.wrap, sv = this.svg;
      this.bindMenu(sv);
      const pointers = new Map();
      let act = null, spaceDown = false;
      w.addEventListener('keydown', (e) => { if (e.key === ' ') spaceDown = true; });
      w.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });
      w.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX) && !e.shiftKey && e.deltaMode !== 0) { const r = w.getBoundingClientRect(); this.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), e.clientX - r.left, e.clientY - r.top); }
        else if (e.shiftKey) this.panBy(-e.deltaY, 0);
        else if (Math.abs(e.deltaX) > 0 && Math.abs(e.deltaY) < 1) this.panBy(-e.deltaX, -e.deltaY);
        else { const r = w.getBoundingClientRect(); this.zoomBy(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top); }
      }, { passive: false });
      this.mini.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        const go = (ev) => { const r = this.mini.getBoundingClientRect(), mb = this.miniBox; if (!mb) return; const { w: cw, h: ch } = this.size(); const x = mb.x0 + (ev.clientX - r.left) / r.width * (mb.x1 - mb.x0), y = mb.y0 + (ev.clientY - r.top) / r.height * (mb.y1 - mb.y0); this.view.x = x - cw / this.view.z / 2; this.view.y = y - ch / this.view.z / 2; this.applyView(); };
        go(e);
        const mv = (ev) => go(ev), up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
      sv.addEventListener('pointerdown', (e) => {
        if (e.button === 2) return;
        w.focus({ preventScroll: true });
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { sv.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
        if (pointers.size === 2) { act = { kind: 'pinch', d0: this.pdist(pointers), z0: this.view.z, mid: this.pmid(pointers) }; return; }
        const pt = this.toDrawing(e.clientX, e.clientY);
        const touch = e.pointerType === 'touch';
        if (e.button === 1 || spaceDown) { act = { kind: 'pan', x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
        const ro = this.opts.readOnly;
        const pin = ro ? null : this.pinNear(pt, touch ? 1.3 : 0.8);
        const part = this.partAt(pt);
        // a second press in the same place soon after the first: a double-click (the drawing may have been
        // redrawn under the pointer between the two, which loses the browser's own dblclick)
        const now = performance.now(), lc = this._lastDown;
        this._lastDown = { t: now, x: e.clientX, y: e.clientY };
        const toggles = part && !pin && this.live && S.Eng.isInput(part.type) && this.opts.onToggle;
        if (lc && now - lc.t < 450 && Math.hypot(e.clientX - lc.x, e.clientY - lc.y) < 8 && !pin && !toggles) { this._lastDown = null; act = null; this.dbl(pt); return; }
        // a running simulation: switches and buttons answer the pointer (but a press on a pin still draws a wire)
        if (part && !pin && this.live && S.Eng.isInput(part.type) && this.opts.onToggle) {
          if (S.Eng.isButton(part)) { this.opts.onToggle(part, true); act = { kind: 'button', part }; return; }
          act = { kind: 'maybe-toggle', part, x: e.clientX, y: e.clientY, pt };
          return;
        }
        if (pin && !(part && !this.onPinEdge(part, pin) && !e.altKey)) { act = { kind: 'wire', from: { part: pin.part, pin: pin.pin }, x0: pin.x, y0: pin.y, cur: pt }; return; }
        if (part) {
          const k = 'p:' + part.id;
          if (e.shiftKey || e.metaKey || e.ctrlKey) { if (this.sel.has(k)) this.sel.delete(k); else this.sel.add(k); this.render(); act = null; return; }
          if (!this.sel.has(k)) { this.sel = new Set([k]); this.render(); }
          if (ro) return;
          act = { kind: 'move', start: pt, orig: this.selParts().map((p) => ({ p, x: p.x, y: p.y })), notes: this.selNotes().map((n) => ({ n, x: n.x, y: n.y })), moved: false };
          return;
        }
        const nt = this.noteAt(pt);
        if (nt) {
          const k = 'n:' + nt.id;
          if (!this.sel.has(k)) { this.sel = new Set([k]); this.render(); }
          if (ro) return;
          act = { kind: 'move', start: pt, orig: this.selParts().map((p) => ({ p, x: p.x, y: p.y })), notes: this.selNotes().map((n) => ({ n, x: n.x, y: n.y })), moved: false };
          return;
        }
        const wr = this.wireAt(pt);
        if (wr) {
          act = { kind: 'wire-or-select', wire: wr.wire, x0: wr.x, y0: wr.y, cur: pt, sx: e.clientX, sy: e.clientY, add: e.shiftKey };
          return;
        }
        if (touch) { act = { kind: 'pan', x: e.clientX, y: e.clientY, tap: true, sx: e.clientX, sy: e.clientY }; return; }
        act = { kind: 'box', start: pt, cur: pt, add: e.shiftKey };
        if (!e.shiftKey && this.sel.size) { this.sel.clear(); this.render(); }
      });
      sv.addEventListener('pointermove', (e) => {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (!act) { this.hover(this.toDrawing(e.clientX, e.clientY)); return; }
        const pt = this.toDrawing(e.clientX, e.clientY);
        if (act.kind === 'pinch' && pointers.size >= 2) { const d = this.pdist(pointers), m = this.pmid(pointers), r = w.getBoundingClientRect(); this.zoomBy(act.z0 * d / act.d0 / this.view.z, m.x - r.left, m.y - r.top); this.panBy(m.x - act.mid.x, m.y - act.mid.y); act.mid = m; return; }
        if (act.kind === 'pan') { this.panBy(e.clientX - act.x, e.clientY - act.y); act.x = e.clientX; act.y = e.clientY; return; }
        if (act.kind === 'maybe-toggle' && Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) { this.sel = new Set(['p:' + act.part.id]); act = { kind: 'move', start: act.pt, orig: [{ p: act.part, x: act.part.x, y: act.part.y }], notes: [], moved: false }; }
        if (act.kind === 'move') {
          const u = U(), dx = Math.round((pt.x - act.start.x) / u), dy = Math.round((pt.y - act.start.y) / u);
          if (!dx && !dy && !act.moved) return;
          act.moved = true;
          for (const o of act.orig) { o.p.x = o.x + dx; o.p.y = o.y + dy; delete o.p.g; }
          for (const o of act.notes) { o.n.x = o.x + dx; o.n.y = o.y + dy; }
          this.lazyRender();
          return;
        }
        if (act.kind === 'wire-or-select') {
          if (Math.hypot(e.clientX - act.sx, e.clientY - act.sy) < 6) return;
          act = { kind: 'wire', from: { wire: act.wire }, x0: act.x0, y0: act.y0, cur: pt };
        }
        if (act.kind === 'wire') { act.cur = pt; this.ghostWire(act); return; }
        if (act.kind === 'box') { act.cur = pt; this.ghostBox(act); }
      });
      const end = (e) => {
        pointers.delete(e.pointerId);
        const a = act;
        if (!a) return;
        if (a.kind === 'pinch') { if (pointers.size < 2) act = null; return; }
        act = null;
        const pt = this.toDrawing(e.clientX, e.clientY);
        if (a.kind === 'button') { this.opts.onToggle(a.part, false); return; }
        if (a.kind === 'maybe-toggle') { this.opts.onToggle(a.part); return; }
        if (a.kind === 'pan') { if (a.tap && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 6 && this.sel.size) { this.sel.clear(); this.render(); } return; }
        if (a.kind === 'move') { if (a.moved) this.commit('move'); else this.render(); return; }
        if (a.kind === 'wire-or-select') {
          const k = 'w:' + a.wire;
          if (a.add) { if (this.sel.has(k)) this.sel.delete(k); else this.sel.add(k); } else this.sel = new Set([k]);
          this.render();
          if (this.opts.onWire) this.opts.onWire(a.wire);
          return;
        }
        if (a.kind === 'wire') {
          this.ui.querySelectorAll('.ed-ghost').forEach((x) => x.remove());
          // a wire dragged out of the canvas and dropped somewhere that takes it (the waveform viewer)
          const r = this.wrap.getBoundingClientRect();
          if (a.from.wire && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) { if (this.opts.onDropWire) this.opts.onDropWire(a.from.wire, e.clientX, e.clientY); this.render(); return; }
          this.finishWire(a, pt);
          return;
        }
        if (a.kind === 'box') { this.ui.querySelectorAll('.ed-marquee').forEach((x) => x.remove()); this.boxSelect(a); }
      };
      sv.addEventListener('pointerup', end);
      sv.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); act = null; this.ui.querySelectorAll('.ed-ghost,.ed-marquee').forEach((x) => x.remove()); });
      sv.addEventListener('dblclick', (e) => { e.preventDefault(); });
    }
    /** a double-click on the drawing: edit a part (open a block), a note, or label a wire */
    dbl(pt) {
      {
        const part = this.partAt(pt);
        if (part) { if (part.type === 'BLOCK') this.openBlock(part.id); else if (this.opts.onEdit) this.opts.onEdit(part); return; }
        const nt = this.noteAt(pt);
        if (nt) { this.editNote(nt); return; }
        const wr = this.wireAt(pt);
        if (wr) { this.sel = new Set(['w:' + wr.wire]); this.render(); this.labelWire(wr.wire); }
      }
    }
    bindMenu(sv) {
      sv.addEventListener('contextmenu', (e) => { e.preventDefault(); this.contextMenu(e); });
    }
    pdist(m) { const [a, b] = [...m.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; }
    pmid(m) { const [a, b] = [...m.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    onPinEdge(part, pin) { return true; }
    lazyRender() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); }); }
    hover(pt) {
      const pin = this.opts.readOnly ? null : this.pinNear(pt);
      const k = pin ? pin.part + '.' + pin.pin : '';
      if (k === this._hov) return;
      this._hov = k;
      this.ui.querySelectorAll('.ed-pinhot').forEach((x) => x.remove());
      this.wrap.classList.toggle('on-pin', !!pin);
      if (pin) { const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'ed-pinhot'); c.setAttribute('cx', pin.x); c.setAttribute('cy', pin.y); c.setAttribute('r', 4.5); this.ui.appendChild(c); }
    }
    ghostWire(a) {
      this.ui.querySelectorAll('.ed-ghost').forEach((x) => x.remove());
      const target = this.pinNear(a.cur, 1.1);
      let d;
      if (target) {
        // over a pin: the route it would really take
        const tmp = this.withConnection(a.from, target);
        if (tmp) {
          const r = R.route(tmp.doc), n = r.nets.find((x) => x.id === tmp.wire);
          if (n && n.ok) d = n.paths.map((q) => 'M' + q.pts.map((p) => p[0] + ' ' + p[1]).join('L')).join('');
        }
      }
      if (!d) { const x1 = a.cur.x, y1 = a.cur.y; d = `M${a.x0} ${a.y0}H${x1}V${y1}`; }
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', 'ed-ghost' + (target ? ' on' : ''));
      p.setAttribute('d', d);
      this.ui.appendChild(p);
    }
    ghostBox(a) {
      this.ui.querySelectorAll('.ed-marquee').forEach((x) => x.remove());
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('class', 'ed-marquee');
      r.setAttribute('x', Math.min(a.start.x, a.cur.x)); r.setAttribute('y', Math.min(a.start.y, a.cur.y));
      r.setAttribute('width', Math.abs(a.cur.x - a.start.x)); r.setAttribute('height', Math.abs(a.cur.y - a.start.y));
      this.ui.appendChild(r);
    }
    boxSelect(a) {
      const u = U(), x0 = Math.min(a.start.x, a.cur.x), x1 = Math.max(a.start.x, a.cur.x), y0 = Math.min(a.start.y, a.cur.y), y1 = Math.max(a.start.y, a.cur.y);
      if (x1 - x0 < 3 && y1 - y0 < 3) { this.render(); return; }
      const sel = a.add ? new Set(this.sel) : new Set();
      for (const dp of this.doc.parts) { const g = D.geom(dp, this.doc); if (dp.x * u >= x0 && (dp.x + g.w) * u <= x1 && dp.y * u >= y0 && (dp.y + g.h) * u <= y1) sel.add('p:' + dp.id); }
      for (const nt of this.doc.notes || []) { const b = R.noteBox(nt); if (b.x >= x0 && b.x + b.w <= x1 && b.y >= y0 && b.y + b.h <= y1) sel.add('n:' + nt.id); }
      // wires whose every pin is inside
      const ps = new Set([...sel].filter((k) => k.startsWith('p:')).map((k) => k.slice(2)));
      for (const w of this.doc.wires) if (w.pins.every(([pid]) => ps.has(pid))) sel.add('w:' + w.id);
      this.sel = sel;
      this.render();
    }

    // ---- wiring ----------------------------------------------------------------------------------------------
    /** a copy of the document with one more connection, and the wire it is on (or null if it is no connection) */
    withConnection(from, to) {
      const doc = clone(this.doc);
      const res = Editor.connectIn(doc, from, to);
      return res ? { doc, wire: res } : null;
    }
    /** join a pin (or a wire) to a pin, in a document: returns the wire id, or null */
    static connectIn(doc, from, to) {
      const wa = from.wire ? doc.wires.find((w) => w.id === from.wire) : D.wireAt(doc, from.part, from.pin);
      const wb = D.wireAt(doc, to.part, to.pin);
      if (!from.wire && from.part === to.part && from.pin === to.pin) return null;
      if (wa && wb) {
        if (wa === wb) return null;
        wa.pins.push(...wb.pins); doc.wires.splice(doc.wires.indexOf(wb), 1);
        if (!wa.name && wb.name) { wa.name = wb.name; wa.show = wb.show; }
        return wa.id;
      }
      if (wa) { wa.pins.push([to.part, to.pin]); return wa.id; }
      if (wb) { wb.pins.push([from.part, from.pin]); return wb.id; }
      const w = { id: D.newWireId(doc), pins: [[from.part, from.pin], [to.part, to.pin]] };
      doc.wires.push(w);
      return w.id;
    }
    finishWire(a, pt) {
      const target = this.pinNear(pt, 1.1);
      if (!target) { this.render(); return; }
      const id = Editor.connectIn(this.doc, a.from, target);
      if (!id) { this.render(); return; }
      this.sel = new Set(['w:' + id]);
      this.commit('wire');
      const r = this.routed.nets.find((n) => n.id === id);
      if (r && !r.ok) S.UI.toast('That wire has no clear path yet: move the parts apart and it will route itself.', 'err', 4000);
    }
    /** connect two pins by name (for keyboards and tests): connect(['and1','y'], ['out_F','a']) */
    connect(a, b) {
      const id = Editor.connectIn(this.doc, a.length ? { part: a[0], pin: a[1] } : a, { part: b[0], pin: b[1] });
      if (id) this.commit('wire');
      return id;
    }

    // ---- editing ---------------------------------------------------------------------------------------------
    selParts() { return this.doc.parts.filter((p) => this.sel.has('p:' + p.id)); }
    selNotes() { return (this.doc.notes || []).filter((n) => this.sel.has('n:' + n.id)); }
    selWires() { return this.doc.wires.filter((w) => this.sel.has('w:' + w.id)); }
    /** place a new part; x, y in grid units (its top-left corner), or at the middle of the view */
    addPart(type, params, x, y) {
      const doc = this.doc;
      const dp = { id: D.newId(doc, type === 'BLOCK' ? (params.block || 'blk') : type), type, params: Object.assign(S.Eng.defaults(type), params || {}), x: 0, y: 0, rot: 0, flip: false };
      if (S.Eng.isPort(type) && (!params || !params.name)) dp.params.name = this.freeName(type);
      const g = D.geom(dp, doc);
      if (x == null) { const { w, h: hh } = this.size(); x = (this.view.x + w / this.view.z / 2) / U() - g.w / 2; y = (this.view.y + hh / this.view.z / 2) / U() - g.h / 2; }
      dp.x = Math.round(x); dp.y = Math.round(y);
      // nudged off anything it would sit on
      for (let k = 0; k < 40 && this.overlaps(dp, g); k++) dp.y += 2;
      doc.parts.push(dp);
      this.sel = new Set(['p:' + dp.id]);
      this.commit('add');
      return dp;
    }
    overlaps(dp, g) {
      for (const o of this.doc.parts) { if (o === dp) continue; const og = D.geom(o, this.doc); if (dp.x - 1 < o.x + og.w + 1 && dp.x + g.w + 1 > o.x - 1 && dp.y - 1 < o.y + og.h + 1 && dp.y + g.h + 1 > o.y - 1) return true; }
      return false;
    }
    freeName(type) {
      const used = new Set(this.doc.parts.filter((p) => p.params && p.params.name).map((p) => p.params.name));
      const pool = type === 'OUT' ? 'FGHPQRSTUVWXYZ' : type === 'CLOCK' ? null : type === 'BUTTON' ? null : 'ABCDEJKLMN';
      if (type === 'BUTTON') { let i = 1; while (used.has('PB' + i)) i++; return 'PB' + i; }
      if (type === 'CLOCK') { if (!used.has('CLK')) return 'CLK'; let i = 2; while (used.has('CLK' + i)) i++; return 'CLK' + i; }
      for (const c of pool) if (!used.has(c)) return c;
      let i = 1; while (used.has(pool[0] + i)) i++; return pool[0] + i;
    }
    /** drop a part from the palette at a client point */
    dropAt(type, params, cx, cy) {
      const r = this.wrap.getBoundingClientRect();
      if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
      const pt = this.toDrawing(cx, cy);
      const tmp = { id: 'tmp', type, params: Object.assign(S.Eng.defaults(type), params || {}), x: 0, y: 0 };
      const g = D.geom(tmp, this.doc);
      return this.addPart(type, params, pt.x / U() - g.w / 2, pt.y / U() - g.h / 2);
    }
    deleteSel() {
      if (!this.sel.size) return false;
      const doc = this.doc, ps = new Set(this.selParts().map((p) => p.id)), ws = new Set(this.selWires().map((w) => w.id)), ns = new Set(this.selNotes().map((n) => n.id));
      doc.parts = doc.parts.filter((p) => !ps.has(p.id));
      doc.wires = doc.wires.filter((w) => !ws.has(w.id));
      for (const w of doc.wires) w.pins = w.pins.filter(([pid]) => !ps.has(pid));
      doc.wires = doc.wires.filter((w) => w.pins.length >= 2);
      doc.notes = (doc.notes || []).filter((n) => !ns.has(n.id));
      this.sel.clear();
      this.commit('delete');
      return true;
    }
    rotateSel(dir) { const ps = this.selParts(); if (!ps.length) return false; for (const p of ps) { p.rot = ((p.rot || 0) + (dir || 1) + 4) & 3; delete p.g; } this.commit('rotate'); return true; }
    flipSel() { const ps = this.selParts(); if (!ps.length) return false; for (const p of ps) { p.flip = !p.flip; delete p.g; } this.commit('mirror'); return true; }
    nudge(dx, dy) { const ps = this.selParts(), ns = this.selNotes(); if (!ps.length && !ns.length) return false; for (const p of ps) { p.x += dx; p.y += dy; delete p.g; } for (const n of ns) { n.x += dx; n.y += dy; } this.commit('move'); return true; }
    /** line the selection up: 'left', 'right', 'top', 'bottom', 'center' (vertical centres), 'middle' */
    align(how) {
      const ps = this.selParts();
      if (ps.length < 2) { S.UI.toast('Select two or more parts to line them up.', '', 2500); return false; }
      const gs = ps.map((p) => [p, D.geom(p, this.doc)]);
      const minX = Math.min(...ps.map((p) => p.x)), maxR = Math.max(...gs.map(([p, g]) => p.x + g.w)), minY = Math.min(...ps.map((p) => p.y)), maxB = Math.max(...gs.map(([p, g]) => p.y + g.h));
      for (const [p, g] of gs) {
        if (how === 'left') p.x = minX; else if (how === 'right') p.x = maxR - g.w; else if (how === 'top') p.y = minY; else if (how === 'bottom') p.y = maxB - g.h;
        else if (how === 'center') p.x = Math.round((minX + maxR) / 2 - g.w / 2); else if (how === 'middle') p.y = Math.round((minY + maxB) / 2 - g.h / 2);
        delete p.g;
      }
      if (how === 'distribute') {
        const s = gs.slice().sort((a, b) => a[0].y - b[0].y);
        let y = s[0][0].y;
        for (const [p, g] of s) { p.y = y; y += g.h + 3; }
      }
      this.commit('align');
      return true;
    }
    selectAll() { this.sel = new Set(this.doc.parts.map((p) => 'p:' + p.id).concat(this.doc.wires.map((w) => 'w:' + w.id), (this.doc.notes || []).map((n) => 'n:' + n.id))); this.render(); }
    copy() {
      const ps = this.selParts(), ids = new Set(ps.map((p) => p.id));
      if (!ps.length && !this.selNotes().length) return false;
      const wires = this.doc.wires.map((w) => ({ id: w.id, name: w.name, show: w.show, pins: w.pins.filter(([pid]) => ids.has(pid)) })).filter((w) => w.pins.length >= 2);
      const blocks = {};
      for (const p of ps) if (p.type === 'BLOCK' && this.root.blocks[p.params.block]) blocks[p.params.block] = this.root.blocks[p.params.block];
      Editor.clip = clone({ parts: ps, wires, notes: this.selNotes(), blocks });
      S.UI.storage.set('clip', Editor.clip);
      return true;
    }
    paste(dx, dy) {
      const clip = Editor.clip || S.UI.storage.get('clip', null);
      if (!clip || (!clip.parts.length && !(clip.notes || []).length)) return false;
      const doc = this.doc, map = new Map(), used = new Set(doc.parts.map((p) => p.id));
      for (const [k, b] of Object.entries(clip.blocks || {})) if (!this.root.blocks[k]) this.root.blocks[k] = clone(b);
      this.sel = new Set();
      const off = dx == null ? 2 : dx;
      for (const p of clip.parts) {
        const id = D.newId(doc, p.type === 'BLOCK' ? p.params.block : p.type, used);
        used.add(id); map.set(p.id, id);
        const np = Object.assign(clone(p), { id, x: p.x + off, y: p.y + (dy == null ? 2 : dy) });
        if (np.params && np.params.name && S.Eng.isPort(np.type) && doc.parts.some((q) => q.params && q.params.name === np.params.name)) np.params.name = this.freeName(np.type);
        doc.parts.push(np);
        this.sel.add('p:' + id);
      }
      for (const w of clip.wires) { const nw = { id: D.newWireId(doc), pins: w.pins.map(([pid, pn]) => [map.get(pid), pn]) }; if (w.name) { nw.name = w.name; nw.show = w.show; } doc.wires.push(nw); this.sel.add('w:' + nw.id); }
      for (const n of clip.notes || []) { const nn = Object.assign(clone(n), { id: 'note' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), x: n.x + off, y: n.y + off }); (doc.notes = doc.notes || []).push(nn); this.sel.add('n:' + nn.id); }
      this.commit('paste');
      return true;
    }
    duplicate() { if (!this.copy()) return false; return this.paste(3, 3); }
    /** let the layout engine place and route everything again */
    tidy() {
      const doc = this.doc;
      if (!doc.parts.length) return false;
      let t;
      try { t = D.tidy(doc); } catch (e) { S.UI.toast('Tidy up could not lay this out: ' + e.message, 'err', 5000); return false; }
      doc.parts = t.parts; doc.wires = t.wires; doc.routes = t.routes; doc.labels = t.labels; doc.routeSig = t.routeSig;
      // notes go to the right of the drawing, one under another
      let ny = 0;
      const right = Math.max(...doc.parts.map((p) => p.x + D.geom(p, doc).w)) + 4;
      for (const n of doc.notes || []) { n.x = right; n.y = ny; ny += 2 + String(n.text).split('\n').length * 2; }
      doc.routeSig = D.sig(doc);
      this.commit('tidy');
      requestAnimationFrame(() => this.fit());
      return true;
    }
    labelWire(id) {
      const w = this.doc.wires.find((x) => x.id === id);
      if (!w) return;
      S.UI.prompt('Label this wire', 'Name (shown on the wire and in the waveform)', w.name || '', { ok: 'Label', hint: 'Letters, digits and _; leave empty to remove the label.' }).then((v) => {
        if (v == null) return;
        v = v.trim();
        if (v && !/^[A-Za-z_][\w.]*$/.test(v)) { S.UI.toast('A label is a letter or _ followed by letters, digits, _ or dots.', 'err'); return; }
        if (v) { w.name = v; w.show = true; } else { delete w.name; delete w.show; }
        this.commit('label');
      });
    }
    addNote(text, x, y) {
      const doc = this.doc;
      const { w, h: hh } = this.size();
      const n = { id: 'note' + ((doc.notes || []).length + 1), text: text || 'A note', x: x != null ? x : Math.round((this.view.x + w / this.view.z / 2) / U()), y: y != null ? y : Math.round((this.view.y + hh / this.view.z / 3) / U()) };
      while ((doc.notes || []).some((o) => o.id === n.id)) n.id += 'b';
      (doc.notes = doc.notes || []).push(n);
      this.sel = new Set(['n:' + n.id]);
      this.commit('note');
      return n;
    }
    editNote(n) {
      const ta = h('textarea', { rows: '4', style: { width: '100%' }, 'aria-label': 'Note' }, n.text);
      S.UI.modal({ title: 'Note', body: h('div', ta), buttons: [{ label: 'Delete', value: 'del' }, { label: 'Cancel', value: null }, { label: 'OK', value: () => ta.value, primary: true }] }).then((v) => {
        if (v === 'del') { this.doc.notes = this.doc.notes.filter((x) => x !== n); this.commit('note'); }
        else if (v != null) { n.text = v; this.commit('note'); }
      });
    }

    // ---- blocks --------------------------------------------------------------------------------------------------
    /**
     * Make a block of the selection: its parts move into a new block, every wire that crossed the edge of the
     * selection becomes a port (an input where it is driven from outside, an output where from inside)
     */
    async makeBlock(name) {
      const doc = this.doc, ps = this.selParts();
      if (!ps.length) { S.UI.toast('Select the parts the block should hold first.', '', 3000); return false; }
      if (name == null) name = await S.UI.prompt('Make a block', 'Name of the new block', this.freeBlockName(), { ok: 'Make block', hint: 'The selection becomes one part with this name; it appears under My blocks.' });
      if (name == null) return false;
      name = String(name).trim().replace(/[^\w-]/g, '_');
      if (!name) return false;
      if (this.root.blocks[name]) { S.UI.toast('There is a block called ' + name + ' already.', 'err'); return false; }
      const ids = new Set(ps.map((p) => p.id));
      const inner = D.blank(name);
      inner.parts = clone(ps);
      const x0 = Math.min(...ps.map((p) => p.x)), y0 = Math.min(...ps.map((p) => p.y));
      const pinDir = (pid, pn) => { const dp = D.part(doc, pid); const q = dp && D.pinDef(doc, dp, pn); return q ? q.dir : 'in'; };
      const pinW = (pid, pn) => { const dp = D.part(doc, pid); const q = dp && D.pinDef(doc, dp, pn); return (q && q.width) || 1; };
      const ports = [];
      const used = new Set(ps.filter((p) => p.params && p.params.name).map((p) => p.params.name));
      const keep = [];
      for (const w of doc.wires) {
        const inP = w.pins.filter(([pid]) => ids.has(pid)), outP = w.pins.filter(([pid]) => !ids.has(pid));
        if (!inP.length) { keep.push(w); continue; }
        if (!outP.length) { inner.wires.push(clone(w)); continue; }
        const drivenInside = inP.some(([pid, pn]) => pinDir(pid, pn) === 'out');
        let pname = w.name || (outP.map(([pid]) => D.part(doc, pid)).find((p) => p && (S.Eng.isPort(p.type) || p.type === 'CLOCK')) || {}).params?.name || (drivenInside ? 'y' : 'a') + (ports.filter((p) => p.out === drivenInside).length + 1);
        while (used.has(pname)) pname += '_';
        used.add(pname);
        const width = Math.max(...inP.map(([pid, pn]) => pinW(pid, pn)));
        const port = { name: pname, out: drivenInside, width, wire: w, inP, outP };
        ports.push(port);
      }
      // the block's own ports, at its left and right
      const minX = Math.min(...ps.map((p) => p.x)) - 10, maxX = Math.max(...ps.map((p) => p.x + D.geom(p, doc).w)) + 4;
      let li = 0, ri = 0;
      for (const pt of ports) {
        const pp = { id: (pt.out ? 'out_' : 'in_') + pt.name, type: pt.out ? 'OUT' : 'IN', params: { name: pt.name, w: pt.width }, x: pt.out ? maxX : minX, y: y0 + 3 * (pt.out ? ri++ : li++), rot: 0, flip: false };
        inner.parts.push(pp);
        inner.wires.push({ id: 'w' + (inner.wires.length + 1) + '_' + pt.name, pins: [[pp.id, pt.out ? 'a' : 'y']].concat(pt.inP) });
      }
      let tidied = inner;
      try { tidied = D.tidy(inner); } catch (e) { /* kept as drawn */ }
      const ports2 = D.blockPorts(tidied);
      this.root.blocks[name] = { doc: tidied, inputs: ports2.inputs, outputs: ports2.outputs };
      // in place of the selection: one block part, wired where the selection was
      const bp = { id: D.newId(doc, name), type: 'BLOCK', params: { block: name }, x: x0, y: y0, rot: 0, flip: false };
      doc.parts = doc.parts.filter((p) => !ids.has(p.id));
      doc.parts.push(bp);
      doc.wires = keep;
      for (const pt of ports) doc.wires.push(Object.assign({}, pt.wire, { pins: pt.outP.concat([[bp.id, pt.name]]) }));
      this.sel = new Set(['p:' + bp.id]);
      this.commit('block');
      S.UI.toast('Made the block ' + name + ' (' + ports2.inputs.length + ' in, ' + ports2.outputs.length + ' out). Double-click it to open it.', 'ok', 3500);
      return bp;
    }
    freeBlockName() { let i = 1; while (this.root.blocks['block' + i]) i++; return 'block' + i; }
    openBlock(id) {
      const dp = D.part(this.doc, id);
      if (!dp || dp.type !== 'BLOCK' || !this.root.blocks[dp.params.block]) return false;
      this.path.push(dp.params.block);
      this.sel.clear();
      this.render();
      requestAnimationFrame(() => this.fit());
      if (this.opts.onChange) this.opts.onChange(this.root, 'open-block');
      return true;
    }
    closeBlock(levels) {
      if (!this.path.length) return false;
      this.path.splice(this.path.length - (levels || 1));
      this.sel.clear();
      this.render();
      requestAnimationFrame(() => this.fit());
      if (this.opts.onChange) this.opts.onChange(this.root, 'close-block');
      return true;
    }

    contextMenu(e) {
      const pt = this.toDrawing(e.clientX, e.clientY);
      const part = this.partAt(pt), wr = !part && this.wireAt(pt);
      if (part && !this.sel.has('p:' + part.id)) { this.sel = new Set(['p:' + part.id]); this.render(); }
      if (wr && !this.sel.has('w:' + wr.wire)) { this.sel = new Set(['w:' + wr.wire]); this.render(); }
      const items = [];
      if (part) {
        items.push({ label: part.type === 'BLOCK' ? 'Open the block' : 'Edit…', sc: 'double-click', action: () => (part.type === 'BLOCK' ? this.openBlock(part.id) : this.opts.onEdit && this.opts.onEdit(part)) });
        items.push({ label: 'Turn a quarter', sc: 'R', action: () => this.rotateSel() }, { label: 'Mirror', sc: 'M', action: () => this.flipSel() });
        items.push({ label: 'Duplicate', sc: 'Ctrl+D', action: () => this.duplicate() }, { label: 'Make a block', sc: 'B', action: () => this.makeBlock() });
      }
      if (wr) {
        items.push({ label: 'Label the wire…', sc: 'L', action: () => this.labelWire(wr.wire) });
        if (this.opts.onProbe) items.push({ label: this.probes.has(wr.wire) ? 'Remove the probe' : 'Probe it in the waveform', sc: 'W', action: () => this.opts.onProbe(wr.wire) });
      }
      if (!part && !wr) items.push({ label: 'Add a note here', action: () => this.addNote('A note', Math.round(pt.x / U()), Math.round(pt.y / U())) }, { label: 'Paste', sc: 'Ctrl+V', action: () => this.paste() }, { label: 'Tidy up', action: () => this.tidy() });
      if (part || wr) items.push({ sep: true }, { label: 'Delete', sc: 'Del', action: () => this.deleteSel() });
      S.UI.showMenu(items, e.clientX, e.clientY);
    }

    /** keys while the canvas (or the page) has focus; returns true when handled */
    key(e) {
      const k = e.key, mod = e.ctrlKey || e.metaKey;
      if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return true; }
      if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); this.redo(); return true; }
      if (mod && (k === 'c' || k === 'C')) { if (this.copy()) { e.preventDefault(); S.UI.toast('Copied ' + this.selParts().length + ' parts.', '', 1500); } return true; }
      if (mod && (k === 'x' || k === 'X')) { if (this.copy()) { e.preventDefault(); this.deleteSel(); } return true; }
      if (mod && (k === 'v' || k === 'V')) { e.preventDefault(); this.paste(); return true; }
      if (mod && (k === 'd' || k === 'D')) { e.preventDefault(); this.duplicate(); return true; }
      if (mod && (k === 'a' || k === 'A')) { e.preventDefault(); this.selectAll(); return true; }
      if (mod || e.altKey) return false;
      if (k === 'Delete' || k === 'Backspace' && this.sel.size) { if (this.deleteSel()) { e.preventDefault(); return true; } return false; }
      if (k === 'Escape') { if (this.sel.size) { this.sel.clear(); this.render(); return true; } if (this.path.length) { this.closeBlock(); return true; } return false; }
      if (k === 'r' || k === 'R') { e.preventDefault(); return this.rotateSel(e.shiftKey ? -1 : 1) || true; }
      if (k === 'm' || k === 'M') { e.preventDefault(); return this.flipSel() || true; }
      if (k === 'b' || k === 'B') { e.preventDefault(); this.makeBlock(); return true; }
      if (k === 'l' || k === 'L') { const w = this.selWires()[0]; if (w) { e.preventDefault(); this.labelWire(w.id); return true; } return false; }
      if (k === '+' || k === '=') { e.preventDefault(); this.zoomBy(1.25); return true; }
      if (k === '-' || k === '_') { e.preventDefault(); this.zoomBy(0.8); return true; }
      if (k === 'f' || k === 'F' || k === '0') { e.preventDefault(); this.fit(); return true; }
      if (k.startsWith('Arrow')) {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
        e.preventDefault();
        if (!this.nudge(d[0], d[1])) this.panBy(-d[0] * 40, -d[1] * 40);
        return true;
      }
      return false;
    }
  }
  Editor.clip = null;
  S.Editor = Editor;
})(globalThis.Sirkit = globalThis.Sirkit || {});
