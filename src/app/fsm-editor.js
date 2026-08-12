// The state-diagram editor of the state-machine workbench: circles for states (a Moore state shows its output
// under its name), arrows between them labelled input/output (Mealy) or input (Moore), self-loops on the
// freest side, a start arrow. Double-click empty space for a new state, drag a state to move it, drag from its
// rim (or in arrow mode, from anywhere on it) to another state for an arrow (back onto itself for a loop),
// double-click a state or a label to edit it, Delete removes what is selected. Every change goes through
// onChange, which keeps the undo history.
//
// The model: { type: 'mealy'|'moore', inputs: ['X'], outputs: ['Z'], start: 'S0',
//   states: [{ name, x, y, out }], arrows: [{ from, to, label }] }  (a label: '0/1' or '0/1, 1/0'; Moore: '0' or '0, 1')
(function (S) {
  'use strict';
  const { h } = S.UI;
  const R = 28, NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const f1 = (v) => Math.round(v * 10) / 10;
  /** text width, a little generous */
  const tw = (s, size) => { let w = 0; for (const ch of String(s)) w += /[il1.,:;|!' ]/.test(ch) ? 0.34 : /[mwMW]/.test(ch) ? 0.9 : /[A-Z0-9/]/.test(ch) ? 0.66 : 0.56; return w * size + 2; };

  /** where the drawing puts every arrow and its label: [{ a, path, head, label: {x, y, w, h}, loop }] */
  function geometry(model) {
    const byName = new Map(model.states.map((s) => [s.name, s]));
    const out = [];
    const angleOf = (s) => {
      // directions of the straight arrows at a state, for choosing the side of its loop
      const as = [];
      for (const a of model.arrows) {
        if (a.from === a.to) continue;
        const o = a.from === s.name ? byName.get(a.to) : a.to === s.name ? byName.get(a.from) : null;
        if (o) as.push(Math.atan2(o.y - s.y, o.x - s.x));
      }
      if (s.name === model.start) as.push(Math.PI);
      return as;
    };
    for (const a of model.arrows) {
      const p = byName.get(a.from), q = byName.get(a.to);
      if (!p || !q) continue;
      const label = String(a.label || '').trim() || '?';
      const lw = tw(label, 14) + 6, lh = 19;
      if (p === q) {
        const used = angleOf(p);
        const cands = [-Math.PI / 2, Math.PI / 2, 0, Math.PI];
        let best = cands[0], bd = -1;
        for (const c of cands) { const d = Math.min(...used.map((u) => Math.abs(Math.atan2(Math.sin(u - c), Math.cos(u - c)))), 9); if (d > bd + 0.01) { bd = d; best = c; } }
        const ux = Math.cos(best), uy = Math.sin(best), vx = -uy, vy = ux;
        const s0 = { x: p.x + R * (ux * 0.72 + vx * 0.69), y: p.y + R * (uy * 0.72 + vy * 0.69) };
        const s1 = { x: p.x + R * (ux * 0.72 - vx * 0.69), y: p.y + R * (uy * 0.72 - vy * 0.69) };
        const L = 62;
        const c0 = { x: s0.x + ux * L + vx * 26, y: s0.y + uy * L + vy * 26 }, c1 = { x: s1.x + ux * L - vx * 26, y: s1.y + uy * L - vy * 26 };
        const tip = { x: p.x + ux * (R + 46), y: p.y + uy * (R + 46) };
        const dir = { x: s1.x - c1.x, y: s1.y - c1.y };
        const lx = tip.x + ux * (Math.abs(ux) * lw / 2 + Math.abs(uy) * lh / 2 + 6), ly = tip.y + uy * (Math.abs(ux) * lw / 2 + Math.abs(uy) * lh / 2 + 6);
        out.push({ a, loop: true, path: `M${f1(s0.x)} ${f1(s0.y)}C${f1(c0.x)} ${f1(c0.y)} ${f1(c1.x)} ${f1(c1.y)} ${f1(s1.x)} ${f1(s1.y)}`, head: head(s1, dir), label: { x: lx, y: ly, w: lw, h: lh, text: label } });
        continue;
      }
      const both = model.arrows.some((b) => b.from === a.to && b.to === a.from);
      const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      // the normal on the left of the direction of travel; a pair of opposite arrows bends apart
      const nx = uy, ny = -ux;
      const bend = both ? 30 : 0;
      const mid = { x: (p.x + q.x) / 2 + nx * bend, y: (p.y + q.y) / 2 + ny * bend };
      const ctrl = { x: 2 * mid.x - (p.x + q.x) / 2, y: 2 * mid.y - (p.y + q.y) / 2 };
      const from = toward(p, ctrl), to = toward(q, ctrl);
      const end = { x: to.x, y: to.y };
      const path = both ? `M${f1(from.x)} ${f1(from.y)}Q${f1(ctrl.x)} ${f1(ctrl.y)} ${f1(end.x)} ${f1(end.y)}` : `M${f1(from.x)} ${f1(from.y)}L${f1(end.x)} ${f1(end.y)}`;
      const dir = both ? { x: end.x - ctrl.x, y: end.y - ctrl.y } : { x: ux, y: uy };
      // the label beside the middle of the arrow, on the side it bends to (a straight arrow: above, or right)
      let sx = nx, sy = ny;
      if (!both && (sy > 0.01 || (Math.abs(sy) <= 0.01 && sx < 0))) { sx = -sx; sy = -sy; }
      const curveMid = both ? { x: 0.25 * from.x + 0.5 * ctrl.x + 0.25 * end.x, y: 0.25 * from.y + 0.5 * ctrl.y + 0.25 * end.y } : { x: (from.x + end.x) / 2, y: (from.y + end.y) / 2 };
      const off = Math.abs(sx) * lw / 2 + Math.abs(sy) * lh / 2 + 5;
      out.push({ a, path, head: head(end, dir), label: { x: curveMid.x + sx * off, y: curveMid.y + sy * off, w: lw, h: lh, text: label } });
    }
    return out;
  }
  const toward = (s, t) => { const dx = t.x - s.x, dy = t.y - s.y, l = Math.hypot(dx, dy) || 1; return { x: s.x + (dx / l) * R, y: s.y + (dy / l) * R }; };
  function head(tip, dir) {
    const l = Math.hypot(dir.x, dir.y) || 1, ux = dir.x / l, uy = dir.y / l, k = 10, w = 5;
    const bx = tip.x - ux * k, by = tip.y - uy * k;
    return `${f1(tip.x)},${f1(tip.y)} ${f1(bx - uy * w)},${f1(by + ux * w)} ${f1(bx + uy * w)},${f1(by - ux * w)}`;
  }

  /** the bounds of a drawing: every state, loop and label, with a margin */
  function bounds(model, geo) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const s of model.states) { grow(s.x - R, s.y - R); grow(s.x + R, s.y + R); }
    const st = model.states.find((s) => s.name === model.start);
    if (st) grow(st.x - R - 34, st.y);
    for (const g of geo) { grow(g.label.x - g.label.w / 2, g.label.y - g.label.h / 2); grow(g.label.x + g.label.w / 2, g.label.y + g.label.h / 2); if (g.loop) { const nums = g.path.match(/-?\d+(\.\d+)?/g).map(Number); for (let i = 0; i < nums.length; i += 2) grow(nums[i], nums[i + 1]); } }
    if (!isFinite(x0)) return { x: 0, y: 0, w: 600, h: 360 };
    const m = 24;
    return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
  }

  /** the SVG of a diagram; opts: { sel, hot: {states: Set, arrows: Set}, editable } */
  function svg(model, opts) {
    opts = opts || {};
    const geo = geometry(model), b = opts.view || bounds(model, geo);
    const sel = opts.sel || {}, hot = opts.hot || {};
    let s = `<svg class="fsm-svg" xmlns="${NS}" viewBox="${f1(b.x)} ${f1(b.y)} ${f1(b.w)} ${f1(b.h)}" role="img" aria-label="${esc(model.type === 'moore' ? 'Moore' : 'Mealy')} state diagram">`;
    s += '<g class="fsm-edges">';
    const st = model.states.find((x) => x.name === model.start);
    if (st) s += `<path class="fsm-edge start" data-audit="edge" d="M${f1(st.x - R - 32)} ${f1(st.y)}L${f1(st.x - R - 1)} ${f1(st.y)}"/><polygon class="fsm-head" data-audit="overlap-ok" points="${head({ x: st.x - R, y: st.y }, { x: 1, y: 0 })}"/>`;
    geo.forEach((g, i) => {
      const k = model.arrows.indexOf(g.a);
      const cls = (sel.arrow === k ? ' sel' : '') + (hot.arrows && hot.arrows.has(k) ? ' hot' : '');
      s += `<g class="fsm-arrow${cls}" data-arrow="${k}"><path class="fsm-hit" data-audit="ignore" d="${g.path}"/><path class="fsm-edge" data-audit="edge" d="${g.path}"/><polygon class="fsm-head" data-audit="overlap-ok" points="${g.head}"/></g>`;
      void i;
    });
    s += '</g><g class="fsm-labels">';
    geo.forEach((g) => {
      const k = model.arrows.indexOf(g.a), L = g.label;
      const cls = (sel.arrow === k ? ' sel' : '') + (hot.arrows && hot.arrows.has(k) ? ' hot' : '');
      s += `<text class="fsm-label${cls}" data-label="${k}" x="${f1(L.x)}" y="${f1(L.y)}" text-anchor="middle" dominant-baseline="central">${esc(L.text)}</text>`;
    });
    s += '</g><g class="fsm-states">';
    for (const x of model.states) {
      const cls = (sel.state === x.name ? ' sel' : '') + (hot.states && hot.states.has(x.name) ? ' hot' : '') + (hot.now === x.name ? ' now' : '');
      s += `<g class="fsm-state${cls}" data-state="${esc(x.name)}"><circle class="fsm-ring" data-audit="overlap-ok" cx="${f1(x.x)}" cy="${f1(x.y)}" r="${R + 7}"/><circle class="fsm-circle" data-audit="node" cx="${f1(x.x)}" cy="${f1(x.y)}" r="${R}"/>`;
      if (model.type === 'moore') {
        s += `<text class="fsm-name" x="${f1(x.x)}" y="${f1(x.y - 7)}" text-anchor="middle" dominant-baseline="central">${esc(x.name)}</text>`;
        s += `<path class="fsm-sep" data-audit="ignore" d="M${f1(x.x - 15)} ${f1(x.y + 2)}H${f1(x.x + 15)}"/>`;
        s += `<text class="fsm-out" x="${f1(x.x)}" y="${f1(x.y + 12)}" text-anchor="middle" dominant-baseline="central">${esc(x.out == null || x.out === '' ? '?' : x.out)}</text>`;
      } else s += `<text class="fsm-name" x="${f1(x.x)}" y="${f1(x.y)}" text-anchor="middle" dominant-baseline="central">${esc(x.name)}</text>`;
      s += '</g>';
    }
    s += '</g></svg>';
    return s;
  }

  /**
   * The editor: new S.FsmEditor(box, { get(), change(model, what), select(sel) }). It reads the model through
   * get() and never changes it in place: every edit is a new model passed to change().
   */
  class FsmEditor {
    constructor(box, hooks) {
      this.box = box; this.hooks = hooks; this.sel = {}; this.hot = null; this.mode = 'select';
      this.wrap = h('div.fsm-canvas', { tabindex: '0', 'aria-label': 'State diagram: double-click empty space for a state, drag from a state\'s rim to another for an arrow' });
      this.hint = h('div.fsm-hint');
      box.append(this.wrap, this.hint);
      this.wrap.addEventListener('pointerdown', (e) => this.down(e));
      // double-clicks are found here, since every click redraws the diagram under the pointer
      this.lastDown = { t: 0, x: 0, y: 0 };
      this.render();
    }
    get model() { return this.hooks.get(); }
    pt(e) {
      const svgEl = this.wrap.querySelector('svg');
      const m = svgEl.getScreenCTM().inverse();
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
      return { x: p.x, y: p.y };
    }
    stateAt(p, slack) { return this.model.states.slice().reverse().find((s) => Math.hypot(s.x - p.x, s.y - p.y) <= R + (slack || 0)); }
    render() {
      const m = this.model;
      const geo = geometry(m);
      let b = bounds(m, geo);
      // the view keeps a sensible size while you work, so states do not jump about
      const narrow = this.wrap.clientWidth && this.wrap.clientWidth < 600;
      const minW = narrow ? 320 : 560, minH = narrow ? 260 : 340;
      if (b.w < minW) { b.x -= (minW - b.w) / 2; b.w = minW; }
      if (b.h < minH) { b.y -= (minH - b.h) / 2; b.h = minH; }
      if (this.dragging && this.view) b = this.view;
      this.view = b;
      this.wrap.innerHTML = svg(m, { sel: this.sel, hot: this.hot, view: b });
      if (this.ghost) {
        const g = document.createElementNS(NS, 'path');
        g.setAttribute('class', 'fsm-ghost'); g.setAttribute('data-audit', 'ignore'); g.setAttribute('d', this.ghost);
        this.wrap.querySelector('svg').appendChild(g);
      }
      this.hint.textContent = !m.states.length ? 'Double-click (or press Add state) to place the first state.' : this.mode === 'arrow' ? 'Arrow mode: drag from one state to another, or back onto itself for a loop.' : 'Drag a state to move it; drag from its rim to another state for an arrow; double-click to rename or relabel.';
    }
    select(sel) { this.sel = sel || {}; this.render(); if (this.hooks.select) this.hooks.select(this.sel); }
    setHot(hot) { this.hot = hot; this.render(); }
    down(e) {
      if (e.button) return;
      const now = Date.now(), L = this.lastDown;
      const twice = now - L.t < 450 && Math.hypot(e.clientX - L.x, e.clientY - L.y) < 8;
      this.lastDown = { t: twice ? 0 : now, x: e.clientX, y: e.clientY };
      if (twice) { e.preventDefault(); this.dbl(e); return; }
      const p = this.pt(e);
      const lab = e.target.closest && e.target.closest('[data-label]');
      const arr = e.target.closest && e.target.closest('[data-arrow]');
      const s = this.stateAt(p, 7);
      if (s) {
        const rim = Math.hypot(s.x - p.x, s.y - p.y) > R - 8 || this.mode === 'arrow' || e.shiftKey;
        e.preventDefault();
        this.wrap.setPointerCapture(e.pointerId);
        this.select({ state: s.name });
        if (rim) this.dragArrow(e, s); else this.dragState(e, s, p);
        return;
      }
      if (lab || arr) { const k = +(lab || arr).dataset[lab ? 'label' : 'arrow']; if (this.sel.arrow !== k) this.select({ arrow: k }); return; }
      if (this.sel.state || this.sel.arrow != null) this.select({});
    }
    dragState(e, s, p0) {
      const m0 = this.model, ox = s.x - p0.x, oy = s.y - p0.y;
      let moved = false;
      this.dragging = true;
      const move = (ev) => {
        const p = this.pt(ev);
        const x = Math.round((p.x + ox) / 4) * 4, y = Math.round((p.y + oy) / 4) * 4;
        if (!moved && Math.hypot(x - s.x, y - s.y) < 3) return;
        moved = true;
        const m = JSON.parse(JSON.stringify(m0));
        const t = m.states.find((q) => q.name === s.name); t.x = x; t.y = y;
        this.hooks.change(m, 'move', true);
      };
      const up = () => {
        this.wrap.removeEventListener('pointermove', move); this.wrap.removeEventListener('pointerup', up); this.wrap.removeEventListener('pointercancel', up);
        this.dragging = false;
        if (moved) this.hooks.change(this.model, 'move', false); else this.render();
      };
      this.wrap.addEventListener('pointermove', move); this.wrap.addEventListener('pointerup', up); this.wrap.addEventListener('pointercancel', up);
    }
    dragArrow(e, s) {
      this.dragging = true;
      const move = (ev) => {
        const p = this.pt(ev), t = this.stateAt(p, 4);
        if (t && t !== s) { const a = toward(s, t), b = toward(t, s); this.ghost = `M${f1(a.x)} ${f1(a.y)}L${f1(b.x)} ${f1(b.y)}`; }
        else if (t === s) this.ghost = `M${f1(s.x - 14)} ${f1(s.y - R + 3)}C${f1(s.x - 30)} ${f1(s.y - R - 50)} ${f1(s.x + 30)} ${f1(s.y - R - 50)} ${f1(s.x + 14)} ${f1(s.y - R + 3)}`;
        else { const a = toward(s, p); this.ghost = `M${f1(a.x)} ${f1(a.y)}L${f1(p.x)} ${f1(p.y)}`; }
        this.render();
      };
      const up = (ev) => {
        this.wrap.removeEventListener('pointermove', move); this.wrap.removeEventListener('pointerup', up); this.wrap.removeEventListener('pointercancel', up);
        this.dragging = false;
        const p = this.pt(ev), t = this.stateAt(p, 4);
        const drew = !!this.ghost;
        this.ghost = null;
        if (t && (t !== s || drew)) this.addArrow(s.name, t.name); else this.render();
      };
      this.wrap.addEventListener('pointermove', move); this.wrap.addEventListener('pointerup', up); this.wrap.addEventListener('pointercancel', up);
    }
    /** a new arrow (or, if one joins these states already, that arrow) and its label asked for */
    async addArrow(from, to) {
      const m = JSON.parse(JSON.stringify(this.model));
      let k = m.arrows.findIndex((a) => a.from === from && a.to === to);
      const free = this.freeInputs(m, from);
      if (k < 0) { m.arrows.push({ from, to, label: m.type === 'mealy' ? (free[0] || '0') + '/' + '0'.repeat(m.outputs.length || 1) : (free[0] || '0') }); k = m.arrows.length - 1; }
      this.sel = { arrow: k };
      this.hooks.change(m, 'arrow');
      await this.editLabel(k);
    }
    freeInputs(m, from) {
      const syms = S.FsmPage.symbols(m.inputs.length), used = new Set();
      for (const a of m.arrows) if (a.from === from) for (const x of S.FsmPage.parseLabel(m, a.label).items) used.add(x.input);
      return syms.filter((x) => !used.has(x));
    }
    async editLabel(k) {
      const m = this.model, a = m.arrows[k];
      if (!a) return;
      const hint = m.type === 'mealy' ? 'Input/output, like 1/0; several separated by commas (0/1, 1/0); a dash for any input bit (1-/0).' : 'The input that takes this arrow, like 1; several separated by commas.';
      const v = await S.UI.prompt('Label the arrow ' + a.from + ' → ' + a.to, 'Label', a.label, { hint });
      if (v == null) return;
      const n = JSON.parse(JSON.stringify(this.model));
      n.arrows[k].label = v.trim();
      this.hooks.change(n, 'label');
    }
    async editState(name) {
      const m = this.model, s = m.states.find((x) => x.name === name);
      if (!s) return;
      const nm = h('input', { type: 'text', value: s.name, 'aria-label': 'Name', id: 'fsmStateName', spellcheck: 'false' });
      const out = m.type === 'moore' ? h('input', { type: 'text', value: s.out == null ? '' : s.out, 'aria-label': 'Output', id: 'fsmStateOut', spellcheck: 'false' }) : null;
      const start = h('input', { type: 'checkbox', checked: m.start === name, id: 'fsmStateStart' });
      const err = h('div.fsm-err');
      const body = h('div.fsm-dlg', h('label', { for: 'fsmStateName' }, 'Name'), nm,
        out ? [h('label', { for: 'fsmStateOut' }, 'Output (' + m.outputs.join(', ') + ')'), out] : null,
        h('label.fsm-chk', start, ' The start state'), err);
      const ok = () => {
        const n = nm.value.trim();
        if (!/^[A-Za-z_][\w]*$/.test(n)) { err.textContent = 'A name is a letter followed by letters, digits or _.'; return undefined; }
        if (n !== name && m.states.some((x) => x.name === n)) { err.textContent = 'There is already a state called ' + n + '.'; return undefined; }
        if (out && out.value.trim() && !new RegExp('^[01-]{' + m.outputs.length + '}$').test(out.value.trim())) { err.textContent = 'The output is ' + m.outputs.length + ' bit' + (m.outputs.length > 1 ? 's' : '') + ' of 0, 1 or - (don\'t care).'; return undefined; }
        return { n, out: out ? out.value.trim() : null, start: start.checked };
      };
      const r = await S.UI.modal({ title: 'State ' + name, body, buttons: [{ label: 'Cancel', value: null }, { label: 'OK', value: ok, primary: true, keepOpen: true }], enterValue: ok, cancelValue: null });
      if (!r) return;
      const c = JSON.parse(JSON.stringify(this.model));
      S.FsmPage.renameState(c, name, r.n);
      const t = c.states.find((x) => x.name === r.n);
      if (out) t.out = r.out;
      if (r.start) c.start = r.n; else if (c.start === r.n && c.states.length > 1 && !r.start) c.start = c.states.find((x) => x.name !== r.n).name;
      this.sel = { state: r.n };
      this.hooks.change(c, 'state');
    }
    dbl(e) {
      const p = this.pt(e);
      const lab = e.target.closest && e.target.closest('[data-label]');
      if (lab) { this.editLabel(+lab.dataset.label); return; }
      const s = this.stateAt(p, 2);
      if (s) { this.editState(s.name); return; }
      const arr = e.target.closest && e.target.closest('[data-arrow]');
      if (arr) { this.editLabel(+arr.dataset.arrow); return; }
      this.addState(p.x, p.y);
    }
    addState(x, y) {
      const m = JSON.parse(JSON.stringify(this.model));
      let i = 0; while (m.states.some((s) => s.name === 'S' + i)) i++;
      if (x == null) {
        // the next free place on a loose grid
        const taken = (px, py) => m.states.some((s) => Math.hypot(s.x - px, s.y - py) < 2.6 * R);
        outer: for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) { const px = 90 + c * 150, py = 90 + r * 130; if (!taken(px, py)) { x = px; y = py; break outer; } }
      }
      const st = { name: 'S' + i, x: Math.round(x / 4) * 4, y: Math.round(y / 4) * 4 };
      if (m.type === 'moore') st.out = '0'.repeat(m.outputs.length || 1);
      m.states.push(st);
      if (!m.start) m.start = st.name;
      this.sel = { state: st.name };
      this.hooks.change(m, 'add');
    }
    deleteSelected() {
      const m = JSON.parse(JSON.stringify(this.model));
      if (this.sel.state) {
        const n = this.sel.state;
        m.states = m.states.filter((s) => s.name !== n);
        m.arrows = m.arrows.filter((a) => a.from !== n && a.to !== n);
        if (m.start === n) m.start = m.states[0] ? m.states[0].name : null;
      } else if (this.sel.arrow != null) m.arrows.splice(this.sel.arrow, 1);
      else return false;
      this.sel = {};
      this.hooks.change(m, 'delete');
      return true;
    }
  }

  S.FsmEditor = FsmEditor;
  S.FsmDiagram = { svg, geometry, bounds, R };
})(globalThis.Sirkit = globalThis.Sirkit || {});
