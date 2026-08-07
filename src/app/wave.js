// The waveform viewer: a list of signals beside their waves on a shared time axis. Signals are added (by
// name, or dropped from the circuit), removed, reordered by dragging, gathered into groups; a bus shows its
// value in binary, hex, decimal or signed. The time axis zooms and pans; two cursors give the values at each
// and the time between them. Glitches (pulses narrower than the threshold) and timing violations are marked
// with a sentence each. Exports VCD, SVG and PNG.
(function (S) {
  'use strict';
  const { h, icon } = S.UI;
  const NS = 'http://www.w3.org/2000/svg';
  const f = (v) => Math.round(v * 100) / 100;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const RADIX = ['hex', 'bin', 'dec', 'signed'];
  const RH = 28, AXIS = 24, NAMEW = 168;

  class Wave {
    /** opts: { height, onChange(names), glitch (ns), empty (text) } */
    constructor(host, opts) {
      this.opts = opts || {};
      this.host = host;
      this.rows = []; // {name, radix, group}
      this.groups = new Map(); // name → {open}
      this.data = { waves: new Map(), widths: new Map(), end: 0, violations: [], clock: null };
      this.t0 = 0; this.t1 = 0; this.follow = true;
      this.cur = [null, null];
      this.selRows = new Set();
      this.root = h('div.wv' + (this.opts.compact ? '.compact' : ''));
      const tb = h('div.wv-tools');
      const btn = (ic, title, fn, id) => { const b = h('button.icon-btn.small', { type: 'button', title, 'aria-label': title, id }, icon(ic)); b.addEventListener('click', fn); return b; };
      this.addSel = h('select.wv-add', { 'aria-label': 'Add a signal', title: 'Add a signal' });
      this.addSel.addEventListener('change', () => { if (this.addSel.value) this.add(this.addSel.value); this.addSel.value = ''; });
      this.info = h('span.wv-info', { 'aria-live': 'polite' });
      tb.append(this.addSel,
        btn('zoomIn', 'Zoom in on time', () => this.zoom(0.5), 'wvZoomIn'), btn('zoomOut', 'Zoom out', () => this.zoom(2), 'wvZoomOut'), btn('fit', 'Show the whole run', () => this.fitTime(), 'wvFit'),
        btn('layers', 'Group the selected signals', () => this.groupSel(), 'wvGroup'),
        btn('download', 'Export: VCD, SVG or PNG', (e) => this.exportMenu(e.currentTarget), 'wvExport'), this.info);
      this.names = h('div.wv-names', { role: 'list', 'aria-label': 'Signals' });
      this.svg = document.createElementNS(NS, 'svg');
      this.svg.setAttribute('class', 'wv-svg');
      this.svg.setAttribute('role', 'img');
      this.svg.setAttribute('aria-label', 'waveforms');
      this.plot = h('div.wv-plot', this.svg);
      this.body = h('div.wv-body', this.names, this.plot);
      this.empty = h('div.wv-empty', icon('wave'), h('span', this.opts.empty || 'No signals yet. Probe a wire (select it and press W), drag a wire here, or add one from the list.'));
      this.notes = h('div.wv-notes', { 'aria-live': 'polite' });
      this.root.append(tb, this.body, this.empty, this.notes);
      host.appendChild(this.root);
      this.bind();
      this.ro = new ResizeObserver(() => this.render());
      this.ro.observe(this.plot);
      this.render();
    }
    dispose() { this.ro.disconnect(); this.root.remove(); }
    get signals() { return this.rows.map((r) => r.name); }
    /** the run to show: waves Map name → [[t, v]...], widths Map name → bits, end time, violations, the clock's name */
    setData(d) {
      this.data = Object.assign({ waves: new Map(), widths: new Map(), end: 0, violations: [], clock: null }, d);
      if (!(this.data.waves instanceof Map)) this.data.waves = new Map(Object.entries(this.data.waves || {}));
      if (!(this.data.widths instanceof Map)) this.data.widths = new Map(Object.entries(this.data.widths || {}));
      const end = this.data.end || this.lastTime();
      if (this.follow || this.t1 <= this.t0) { const span = Math.max(this.t1 - this.t0, 0); this.t0 = 0; this.t1 = Math.max(end, span, 1); }
      this.fillAdd();
      this.render();
    }
    lastTime() { let t = 0; for (const w of this.data.waves.values()) if (w.length) t = Math.max(t, w[w.length - 1][0]); return t; }
    show(names) { this.rows = names.filter((n, i) => names.indexOf(n) === i).map((name) => ({ name, radix: (S.app && S.app.settings.radix) || 'hex', group: null })); this.render(); this.changed(); }
    add(name, group) { if (this.rows.some((r) => r.name === name)) return; this.rows.push({ name, radix: (S.app && S.app.settings.radix) || 'hex', group: group || null }); this.render(); this.changed(); }
    remove(name) { this.rows = this.rows.filter((r) => r.name !== name); this.selRows.delete(name); this.render(); this.changed(); }
    changed() { this.fillAdd(); if (this.opts.onChange) this.opts.onChange(this.signals, this.rows); }
    fillAdd() {
      const have = new Set(this.signals);
      const opts = [...this.data.waves.keys()].filter((n) => !have.has(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      this.addSel.innerHTML = '';
      this.addSel.append(h('option', { value: '' }, opts.length ? '+ Add a signal' : 'Every signal is shown'), ...opts.map((n) => h('option', { value: n }, n)));
      this.addSel.disabled = !opts.length;
    }
    widthOf(n) { if (this.data.widths.has(n)) return this.data.widths.get(n); const w = this.data.waves.get(n); if (w && w.length) { const v = w[w.length - 1][1]; if (Array.isArray(v)) return v.length; if (typeof v === 'string' && v.length > 1 && /^[01xzXZ]+$/.test(v)) return v.length; } return 1; }
    valueAt(n, t) {
      const w = this.data.waves.get(n);
      if (!w || !w.length) return null;
      let lo = 0, hi = w.length - 1;
      if (t < w[0][0]) return null;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (w[m][0] <= t) lo = m; else hi = m - 1; }
      return S.Eng.bits(w[lo][1], this.widthOf(n));
    }
    zoom(f, at) {
      const span = this.t1 - this.t0, c = at == null ? (this.t0 + this.t1) / 2 : at;
      const ns = Math.max(0.5, Math.min(span * f, Math.max(this.lastTime(), 1) * 4));
      this.t0 = Math.max(0, c - (c - this.t0) * ns / span); this.t1 = this.t0 + ns;
      this.follow = this.t1 >= this.lastTime() && this.t0 <= 0;
      this.render();
    }
    fitTime() { this.t0 = 0; this.t1 = Math.max(this.data.end || this.lastTime(), 1); this.follow = true; this.render(); }
    cursorAt(t, which) { this.cur[which || 0] = t; this.render(); }
    xOf(t, W) { return ((t - this.t0) / (this.t1 - this.t0)) * W; }
    tOf(x, W) { return this.t0 + (x / W) * (this.t1 - this.t0); }

    /** the visible rows, with group headers */
    visibleRows() {
      const out = [];
      const seenG = new Set();
      // the clock comes first
      const rows = this.rows.slice().sort((a, b) => (b.name === this.data.clock) - (a.name === this.data.clock));
      for (const r of rows) {
        if (r.group) {
          if (!seenG.has(r.group)) { seenG.add(r.group); out.push({ header: r.group }); }
          const g = this.groups.get(r.group);
          if (g && !g.open) continue;
        }
        out.push(r);
      }
      return out;
    }

    // ---- drawing ---------------------------------------------------------------------------------------------
    render() {
      const W = Math.max(120, this.plot.clientWidth || 600);
      const vis = this.visibleRows();
      this.empty.style.display = this.rows.length ? 'none' : '';
      this.body.style.display = this.rows.length ? '' : 'none';
      const H = AXIS + vis.length * RH + 6;
      this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      this.svg.setAttribute('width', W); this.svg.setAttribute('height', H);
      this.svg.innerHTML = this.drawSvg(W, H, vis, false);
      this.drawNames(vis);
      const [a, b] = this.cur;
      const fmt = (t) => (Math.round(t * 100) / 100) + ' ns';
      this.info.textContent = a != null ? 'A ' + fmt(a) + (b != null ? ' · B ' + fmt(b) + ' · Δt ' + fmt(Math.abs(b - a)) : ' · shift-click for B') : 'Click the waves to place a cursor';
      // the sentences of what went wrong, in time order
      const vs = (this.data.violations || []).slice().sort((x, y) => x.t - y.t);
      const gl = this.glitches(vis);
      this.notes.innerHTML = '';
      for (const v of vs.slice(0, 6)) { const n = h('button.wv-note.bad', { type: 'button' }, h('b', (v.kind || 'timing') + ' at ' + fmt(v.t)), ' ' + (v.say || '')); n.addEventListener('click', () => this.cursorAt(v.t)); this.notes.appendChild(n); }
      for (const g of gl.slice(0, 4)) { const n = h('button.wv-note.warn', { type: 'button' }, h('b', 'glitch on ' + g.name + ' at ' + fmt(g.t)), ' a pulse of ' + fmt(g.w) + ', narrower than ' + fmt(this.glitchMax()) + ': two paths of different delay disagreed for a moment.'); n.addEventListener('click', () => this.cursorAt(g.t)); this.notes.appendChild(n); }
      if (vs.length > 6) this.notes.appendChild(h('span.muted', ' and ' + (vs.length - 6) + ' more timing problems.'));
    }
    glitchMax() { if (this.opts.glitch) return this.opts.glitch; const t = S.Eng.tech((S.app && S.app.settings.tech) || 'CMOS'); return Math.max(1, t.tpd * 2.2); }
    glitches(vis) {
      const out = [], lim = this.glitchMax();
      for (const r of vis) {
        if (!r.name || r.name === this.data.clock || this.widthOf(r.name) > 1) continue;
        const w = this.data.waves.get(r.name) || [];
        for (let i = 1; i + 1 < w.length; i++) {
          const a = S.Eng.bits(w[i - 1][1], 1), b = S.Eng.bits(w[i][1], 1), c = S.Eng.bits(w[i + 1][1], 1);
          if (a === c && b !== a && /[01]/.test(a) && /[01]/.test(b) && w[i + 1][0] - w[i][0] < lim && w[i][0] > 0) out.push({ name: r.name, t: w[i][0], w: w[i + 1][0] - w[i][0] });
        }
      }
      return out;
    }
    drawSvg(W, H, vis, standalone) {
      const span = this.t1 - this.t0;
      let s = '';
      // the time axis: a tick every round step, labels far enough apart to read
      // 1, 2 and 5 times a power of ten, from a hundredth of a nanosecond to many seconds
      const steps = [];
      for (let e = -2; e <= 12; e++) for (const m of [1, 2, 5]) steps.push(m * 10 ** e);
      const big = document.documentElement.dataset.projector === 'on', fs = big ? 15 : 10.5;
      const step = steps.find((x) => (x / span) * W >= (big ? 110 : 76)) || steps[steps.length - 1];
      s += '<g class="wv-axis">';
      let lastR = -Infinity;
      for (let t = Math.ceil(this.t0 / step) * step; t <= this.t1 + 1e-9; t += step) {
        const x = this.xOf(t, W);
        s += `<path data-audit="ignore" class="wv-grid" d="M${f(x)} ${AXIS - 4}V${H}"/>`;
        const tr = (v) => +v.toPrecision(6), txt = t >= 1e9 ? tr(t / 1e9) + ' s' : t >= 1e6 ? tr(t / 1e6) + ' ms' : t >= 1000 ? tr(t / 1000) + ' µs' : tr(t) + ' ns', tw = S.Symbols.textWidth(txt, fs);
        const anchor = x < tw / 2 + 2 ? 'start' : x > W - tw / 2 - 2 ? 'end' : 'middle';
        const left = anchor === 'start' ? Math.max(2, x) : anchor === 'end' ? Math.min(W - 2, x) - tw : x - tw / 2;
        // a label that would run into the one before it is left out (its grid line stays)
        if (left < lastR + 6) continue;
        lastR = left + tw;
        s += `<text class="wv-tick" data-audit="small-ok" x="${f(Math.max(2, Math.min(W - 2, x)))}" y="${AXIS / 2}" text-anchor="${anchor}" dominant-baseline="central">${txt}</text>`;
      }
      s += '</g>';
      const lim = this.glitchMax();
      vis.forEach((r, i) => {
        const y0 = AXIS + i * RH, top = y0 + 5, bot = y0 + RH - 5, mid = (top + bot) / 2;
        if (r.header) { s += `<path data-audit="ignore" class="wv-sep" d="M0 ${f(y0 + RH / 2)}H${W}"/>`; return; }
        const w = this.data.waves.get(r.name) || [];
        const width = this.widthOf(r.name);
        const segs = [];
        for (let k = 0; k < w.length; k++) {
          const ta = w[k][0], tb = k + 1 < w.length ? w[k + 1][0] : Math.max(this.t1, ta);
          if (tb < this.t0 || ta > this.t1) continue;
          segs.push({ a: Math.max(0, this.xOf(ta, W)), b: Math.min(W, this.xOf(tb, W)), v: S.Eng.bits(w[k][1], width), t: ta, tb });
        }
        if (!segs.length) return;
        s += `<g class="wv-row${r.name === this.data.clock ? ' clock' : ''}" data-sig="${esc(r.name)}">`;
        if (width === 1) {
          let d = '', xs = '';
          let prevY = null;
          for (const g of segs) {
            const y = g.v === '1' ? top : g.v === '0' ? bot : mid;
            if (g.v === 'x') xs += `<rect data-audit="ignore" class="wv-xfill" x="${f(g.a)}" y="${f(top)}" width="${f(Math.max(0, g.b - g.a))}" height="${f(bot - top)}"/>`;
            if (g.v === 'z') xs += `<path data-audit="ignore" class="wv-z" d="M${f(g.a)} ${f(mid)}H${f(g.b)}"/>`;
            d += prevY == null ? `M${f(g.a)} ${f(y)}` : `L${f(g.a)} ${f(y)}`;
            d += `L${f(g.b)} ${f(y)}`;
            prevY = y;
          }
          s += xs + `<path class="wv-line" data-audit="edge" d="${d}"/>`;
          // glitches: a pulse narrower than the limit gets a mark above it
          for (let k = 1; k + 1 < segs.length; k++) {
            const a = segs[k - 1].v, b = segs[k].v, c = segs[k + 1].v;
            if (r.name !== this.data.clock && a === c && a !== b && /[01]/.test(a + b) && segs[k].tb - segs[k].t < lim && segs[k].t > 0) {
              const x = (segs[k].a + segs[k].b) / 2;
              s += `<path data-audit="ignore" class="wv-glitch" d="M${f(x - 4)} ${f(y0 + 1)}L${f(x + 4)} ${f(y0 + 1)}L${f(x)} ${f(y0 + 6)}Z"><title>A glitch: a pulse ${f(segs[k].tb - segs[k].t)} ns wide</title></path>`;
            }
          }
        } else {
          // a bus: a band that crosses over at each change, its value written in where it fits
          let d = '';
          const k0 = 3;
          for (const g of segs) {
            const a = g.a, b = g.b, cut = Math.min(k0, (b - a) / 2);
            if (/^z+$/.test(g.v)) { d += `M${f(a)} ${f(mid)}L${f(b)} ${f(mid)}`; continue; }
            d += `M${f(a)} ${f(mid)}L${f(a + cut)} ${f(top)}L${f(b - cut)} ${f(top)}L${f(b)} ${f(mid)}L${f(b - cut)} ${f(bot)}L${f(a + cut)} ${f(bot)}Z`;
            if (/x/.test(g.v)) s += `<rect data-audit="ignore" class="wv-xfill" x="${f(a + cut)}" y="${f(top)}" width="${f(Math.max(0, b - a - 2 * cut))}" height="${f(bot - top)}"/>`;
          }
          s += `<path class="wv-bus" data-audit="edge" d="${d}"/>`;
          for (const g of segs) {
            if (/^z+$/.test(g.v)) continue;
            const txt = S.Eng.format(g.v, r.radix), tw = S.Symbols.textWidth(txt, 11);
            if (g.b - g.a - 2 * k0 < tw + 8) continue;
            const cx = Math.max(g.a + k0 + tw / 2 + 3, Math.min(g.b - k0 - tw / 2 - 3, (Math.max(g.a, 0) + Math.min(g.b, W)) / 2));
            s += `<text class="wv-val" x="${f(cx)}" y="${f(mid)}" text-anchor="middle" dominant-baseline="central">${esc(txt)}</text>`;
          }
        }
        s += '</g>';
      });
      // violations, as a red line down through the rows with a mark at the top
      for (const v of this.data.violations || []) {
        if (v.t < this.t0 || v.t > this.t1) continue;
        const x = this.xOf(v.t, W);
        s += `<path data-audit="ignore" class="wv-violation" d="M${f(x)} ${AXIS}V${H}"><title>${esc(v.say || v.kind)}</title></path>`;
        s += `<circle data-audit="ignore" class="wv-vmark" cx="${f(x)}" cy="${AXIS + 1}" r="3.5"><title>${esc(v.say || v.kind)}</title></circle>`;
      }
      // the cursors
      this.cur.forEach((t, k) => { if (t == null || t < this.t0 || t > this.t1) return; const x = this.xOf(t, W); s += `<path data-audit="ignore" class="wv-cursor c${k}" d="M${f(x)} ${AXIS - 6}V${H}"/>`; });
      if (standalone) {
        // names on the left, in the file only
        let names = '';
        vis.forEach((r, i) => { names += `<text class="wv-name-t" x="6" y="${AXIS + i * RH + RH / 2}" dominant-baseline="central">${esc(r.header ? '▾ ' + r.header : r.name)}</text>`; });
        return `<g transform="translate(${NAMEW} 0)">${s}</g>${names}`;
      }
      return s;
    }
    drawNames(vis) {
      this.names.innerHTML = '';
      this.names.appendChild(h('div.wv-name.head', { style: { height: AXIS + 'px' } }, this.cur[0] != null ? 'value at A' : ''));
      for (const r of vis) {
        if (r.header) {
          const g = this.groups.get(r.header) || { open: true };
          const b = h('button.wv-name.group', { type: 'button', style: { height: RH + 'px' }, 'aria-expanded': String(g.open) }, (g.open ? '▾ ' : '▸ ') + r.header);
          b.addEventListener('click', () => { g.open = !g.open; this.groups.set(r.header, g); this.render(); });
          this.names.appendChild(b);
          continue;
        }
        const width = this.widthOf(r.name);
        const v = this.cur[0] != null ? this.valueAt(r.name, this.cur[0]) : null;
        const vb = this.cur[1] != null ? this.valueAt(r.name, this.cur[1]) : null;
        const fmt = (x) => (x == null ? '' : S.Eng.format(x, r.radix));
        const row = h('div.wv-name' + (this.selRows.has(r.name) ? '.sel' : '') + (r.name === this.data.clock ? '.clock' : ''), { role: 'listitem', style: { height: RH + 'px' }, dataset: { sig: r.name }, title: r.name + (width > 1 ? ' (' + width + ' bits)' : '') + ': drag to reorder; ctrl-click to select for a group' },
          h('span.wv-label', r.name),
          width > 1 ? (() => { const b = h('button.wv-radix', { type: 'button', title: 'Show the value in another base' }, r.radix === 'signed' ? '±' : r.radix.slice(0, 3)); b.addEventListener('click', (e) => { e.stopPropagation(); r.radix = RADIX[(RADIX.indexOf(r.radix) + 1) % RADIX.length]; this.render(); }); return b; })() : null,
          v != null ? h('span.wv-at', { title: vb != null ? 'A: ' + fmt(v) + ', B: ' + fmt(vb) : 'at cursor A' }, fmt(v)) : null,
          (() => { const b = h('button.wv-x', { type: 'button', title: 'Remove ' + r.name, 'aria-label': 'Remove ' + r.name }, '×'); b.addEventListener('click', (e) => { e.stopPropagation(); this.remove(r.name); }); return b; })());
        this.dragRow(row, r);
        this.names.appendChild(row);
      }
    }
    dragRow(el, r) {
      el.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) { if (this.selRows.has(r.name)) this.selRows.delete(r.name); else this.selRows.add(r.name); this.render(); return; }
        const y0 = e.clientY, i0 = this.rows.indexOf(r);
        let moved = false;
        const mv = (ev) => {
          const dy = ev.clientY - y0;
          if (Math.abs(dy) < 4 && !moved) return;
          moved = true;
          const i1 = Math.max(0, Math.min(this.rows.length - 1, i0 + Math.round(dy / RH)));
          if (this.rows.indexOf(r) !== i1) { this.rows.splice(this.rows.indexOf(r), 1); this.rows.splice(i1, 0, r); this.render(); }
        };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) this.changed(); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
    }
    groupSel() {
      const names = [...this.selRows];
      if (names.length < 2) { S.UI.toast('Ctrl-click two or more signal names, then group them.', '', 3000); return; }
      S.UI.prompt('Group signals', 'Name of the group', 'group' + (this.groups.size + 1), { ok: 'Group' }).then((g) => {
        if (!g) return;
        this.groups.set(g, { open: true });
        // the group's signals move together, where the first of them was
        const first = this.rows.findIndex((r) => this.selRows.has(r.name));
        const moving = this.rows.filter((r) => this.selRows.has(r.name));
        this.rows = this.rows.filter((r) => !this.selRows.has(r.name));
        for (const r of moving) r.group = g;
        this.rows.splice(Math.min(first, this.rows.length), 0, ...moving);
        this.selRows.clear();
        this.render(); this.changed();
      });
    }
    bind() {
      let drag = null;
      this.svg.addEventListener('pointerdown', (e) => {
        const r = this.svg.getBoundingClientRect();
        drag = { x: e.clientX, t0: this.t0, t1: this.t1, moved: false, shift: e.shiftKey };
        try { this.svg.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
        drag.W = r.width;
      });
      this.svg.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        if (Math.abs(dx) < 4 && !drag.moved) return;
        drag.moved = true;
        const dt = (dx / drag.W) * (drag.t1 - drag.t0);
        this.t0 = Math.max(0, drag.t0 - dt); this.t1 = this.t0 + (drag.t1 - drag.t0);
        this.follow = false;
        this.render();
      });
      this.svg.addEventListener('pointerup', (e) => {
        const d = drag; drag = null;
        if (!d || d.moved) return;
        const r = this.svg.getBoundingClientRect();
        const t = this.tOf(e.clientX - r.left, r.width);
        // snap to a change nearby
        let best = t, bd = (6 / r.width) * (this.t1 - this.t0);
        for (const w of this.data.waves.values()) for (const [tt] of w) if (Math.abs(tt - t) < bd) { bd = Math.abs(tt - t); best = tt; }
        this.cur[d.shift ? 1 : 0] = Math.round(best * 100) / 100;
        this.render();
      });
      this.plot.addEventListener('wheel', (e) => {
        if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) { const span = this.t1 - this.t0; const dt = (e.deltaX / this.plot.clientWidth) * span; this.t0 = Math.max(0, this.t0 + dt); this.t1 = this.t0 + span; this.follow = false; this.render(); e.preventDefault(); return; }
        if (!e.ctrlKey && !e.altKey && !e.metaKey) return; // the page scrolls
        e.preventDefault();
        const r = this.svg.getBoundingClientRect();
        this.zoom(Math.exp(e.deltaY * 0.004), this.tOf(e.clientX - r.left, r.width));
      }, { passive: false });
    }
    // ---- export -----------------------------------------------------------------------------------------------
    exportMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      S.UI.showMenu([
        { label: 'Value change dump (.vcd)', action: () => this.exportVCD() },
        { label: 'Picture (.svg)', action: () => this.exportSVG() },
        { label: 'Picture (.png)', action: () => this.exportPNG() },
      ], r.left, r.bottom + 4);
    }
    exportVCD(name) {
      const waves = new Map(), widths = new Map();
      for (const n of this.signals.length ? this.signals : [...this.data.waves.keys()]) { if (this.data.waves.has(n)) { waves.set(n, this.data.waves.get(n)); widths.set(n, this.widthOf(n)); } }
      S.UI.download(name || 'waves.vcd', S.Eng.vcd(waves, widths), 'text/plain');
    }
    svgText() {
      const W = Math.max(400, this.plot.clientWidth || 600), vis = this.visibleRows(), H = AXIS + vis.length * RH + 6;
      const inner = this.drawSvg(W, H, vis, true);
      const tmp = document.createElementNS(NS, 'svg');
      tmp.setAttribute('class', 'wv-svg');
      tmp.style.position = 'absolute'; tmp.style.left = '-9999px';
      tmp.innerHTML = inner;
      this.root.appendChild(tmp);
      const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-family', 'font-size', 'font-weight', 'opacity'];
      for (const e of tmp.querySelectorAll('*')) { const cs = getComputedStyle(e); let st = ''; for (const p of props) st += p + ':' + cs.getPropertyValue(p) + ';'; e.setAttribute('style', st); e.removeAttribute('class'); e.removeAttribute('data-audit'); }
      const bg = getComputedStyle(this.root).getPropertyValue('--surface').trim() || '#fff';
      const out = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W + NAMEW}" height="${H}" viewBox="0 0 ${W + NAMEW} ${H}"><rect width="100%" height="100%" fill="${bg}"/>${tmp.innerHTML}</svg>`;
      tmp.remove();
      return { text: out, w: W + NAMEW, h: H };
    }
    exportSVG(name) { S.UI.download(name || 'waves.svg', this.svgText().text, 'image/svg+xml'); }
    async exportPNG(name) {
      const s = this.svgText();
      try { const blob = await S.EdDraw.png(s.text, { x: 0, y: 0, w: s.w, h: s.h }, 2); S.UI.download(name || 'waves.png', blob); } catch (e) { S.UI.toast(e.message, 'err'); }
    }
  }
  S.Wave = Wave;
  // ticks for any span, from nanoseconds to seconds
  Wave.longTime = true;
})(globalThis.Sirkit = globalThis.Sirkit || {});
