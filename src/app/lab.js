// The lab bench: a breadboard on a logic trainer. Above the board sit the outputs (eight LEDs, a seven-segment
// display, a logic probe and the eight channels of a logic analyser); below it the inputs (eight switches, two
// push-buttons, a clock generator and the supply, which feeds all four rails). DIP chips straddle the centre
// channel; jumpers join holes, strips, rails and the panel's terminals. The bench simulates as it is wired, and
// says in plain sentences what it sees: chips without power, open inputs, outputs that fight.
(function (S) {
  'use strict';
  const { h, icon } = S.UI;
  const store = S.UI.storage;
  const Lab = S.Lab = {};
  // the logic families, from the engines when they are loaded
  const FAMS = { CMOS: { label: 'CMOS (74HC)', floatHigh: false }, TTL: { label: 'TTL (74)', floatHigh: true }, 'LS-TTL': { label: 'LS-TTL (74LS)', floatHigh: true }, 'FPGA-like': { label: 'FPGA-like', floatHigh: false } };
  const famNames = () => (S.Eng && S.Eng.techNames ? S.Eng.techNames() : Object.keys(FAMS));
  const famLabel = (t) => { const p = S.Eng && S.Eng.techPresets ? S.Eng.techPresets()[t] : null; return (p && p.label) || (FAMS[t] && FAMS[t].label) || t; };
  const famFloat = (t) => { try { if (S.Eng && S.Eng.tech) return !!S.Eng.tech(t).floatHigh; } catch (e) { /* the stand-in below */ } return /TTL/.test(t); };
  const KEYS = [['Lab bench', [['Drag', 'A jumper from a hole or terminal to another'], ['0 … 7', 'Flip switch S0 … S7'], ['←  →', 'Move the selected chip'], ['Del', 'Pull out the selected chip or jumper'], ['Ctrl  Z  Y', 'Undo, redo'], ['+  −  F', 'Zoom in, out, fit']]]];

  // ---- the board's geometry (SVG units) ----------------------------------------------------------------------
  const NCOL = 50, P = 15, X0 = 56, W = 840, H = 500;
  const colX = (c) => X0 + (c - 1) * P;
  const ROWS = 'abcdefghij';
  const ROWY = { a: 165, b: 180, c: 195, d: 210, e: 225, f: 270, g: 285, h: 300, i: 315, j: 330 };
  const RAILY = { tp: 122, tn: 137, bp: 357, bn: 372 };
  const railHole = (c) => (c - 1) % 6 !== 5;
  const COLORS = [['red', 'Red'], ['black', 'Black'], ['blue', 'Blue'], ['green', 'Green'], ['yellow', 'Yellow'], ['orange', 'Orange'], ['white', 'White']];
  const OUT_Y = 100, IN_Y = 398; // the panel terminals
  const TERM = {};
  for (let i = 0; i < 8; i++) { TERM['led' + i] = [36 + i * 40, OUT_Y]; TERM['sw' + i] = [36 + i * 40, IN_Y]; TERM['ch' + i] = [598 + i * 30, OUT_Y]; }
  'abcdefg'.split('').forEach((s, k) => { TERM['seg-' + s] = [380 + k * 11, OUT_Y]; });
  TERM.probe = [513, OUT_Y]; TERM.pb0 = [368, IN_Y]; TERM.pb1 = [408, IN_Y]; TERM.clk = [486, IN_Y];
  const TERM_NAME = (k) => (/^led/.test(k) ? 'LED ' + k.slice(3) : /^sw/.test(k) ? 'switch S' + k.slice(2) : /^ch/.test(k) ? 'analyser channel ' + k.slice(2) : /^seg-/.test(k) ? 'display segment ' + k.slice(4) : k === 'probe' ? 'the probe' : k === 'clk' ? 'the clock' : /^pb/.test(k) ? 'button P' + k.slice(2) : k);

  /** where an endpoint is: a hole '12a', a rail hole 'Rtp12', or a panel terminal */
  function pointOf(key) {
    if (TERM[key]) return TERM[key];
    let m = /^R(tp|tn|bp|bn)(\d+)$/.exec(key);
    if (m) return [colX(+m[2]), RAILY[m[1]]];
    m = /^(\d+)([a-j])$/.exec(key);
    if (m) return [colX(+m[1]), ROWY[m[2]]];
    return null;
  }
  /** the net an endpoint belongs to before any jumper: its strip, its rail's supply, or itself */
  function baseNet(key) {
    let m = /^R(tp|tn|bp|bn)\d+$/.exec(key);
    if (m) return m[1][1] === 'p' ? 'VCC' : 'GND';
    m = /^(\d+)([a-j])$/.exec(key);
    if (m) return 'S' + m[1] + (m[2] <= 'e' ? 'T' : 'B');
    return key;
  }
  const stripName = (k) => { const m = /^S(\d+)([TB])$/.exec(k); return m ? 'column ' + m[1] + (m[2] === 'T' ? ' (top half)' : ' (bottom half)') : k === 'VCC' ? 'the +5 V rail' : k === 'GND' ? 'the ground rail' : TERM_NAME(k); };
  /** the holes a chip's pins sit in: pin k (from 1) of an n-pin chip with pin 1 at column c */
  function chipHoles(ch) {
    const def = S.LabChips.get(ch.num), n = def.dip, half = n / 2, out = {};
    for (let k = 1; k <= half; k++) { out[k] = (ch.col + k - 1) + 'f'; out[n + 1 - k] = (ch.col + k - 1) + 'e'; }
    return out;
  }
  const chipSpan = (ch) => [ch.col, ch.col + S.LabChips.get(ch.num).dip / 2 - 1];

  // ---- jumpers: slack wires lifted off the board -------------------------------------------------------------------
  // A jumper is a quadratic curve that bows to one side of the straight line between its ends, more for a longer
  // one, with a shadow that falls further below a longer (higher) wire. The bow picks its side and size so the
  // wire keeps clear of the board's labels, the chips and the panel's boxes.
  const box = (x, y, w, h) => ({ x, y, w, h });
  const NUM_COLS = Array.from({ length: NCOL }, (_, i) => i + 1).filter((c) => c % 5 === 0 || c === 1);
  const LABEL_BOXES = [].concat(
    ...NUM_COLS.map((c) => { const w = String(c).length * 5 + 2; return [box(colX(c) - w / 2, 145, w, 9), box(colX(c) - w / 2, 340, w, 9)]; }),
    ROWS.split('').map((r) => box(X0 - 23.5, ROWY[r] - 4.5, 7, 9)),
    Object.entries(RAILY).map(([r, y]) => box(colX(NCOL) + 15, y - 5, r[1] === 'p' ? 26 : 24, 11)));
  const PANEL_BOXES = [].concat(
    Array.from({ length: 8 }, (_, i) => [box(36 + i * 40 - 16, 14, 32, 78), box(36 + i * 40 - 16, 404, 32, 84)]).flat(),
    [box(372, 14, 80, 78), box(474, 14, 78, 78), box(582, 14, 242, 78), box(352, 404, 32, 84), box(392, 404, 32, 84), box(446, 404, 80, 84), box(560, 404, 264, 84)]);
  const near = (pt, b, d) => pt[0] >= b.x - d && pt[0] <= b.x + b.w + d && pt[1] >= b.y - d && pt[1] <= b.y + b.h + d;
  /** the curve of a jumper from p to q, clear of the obstacles where it can be: { d, lift } */
  function jumperCurve(p, q, obstacles) {
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    // one rule for every wire, so neighbours bow alike and lie side by side: a steep one bows right, a flat one up
    const pref = Math.abs(dy) > Math.abs(dx) ? (nx >= 0 ? 1 : -1) : (ny <= 0 ? 1 : -1);
    const base = Math.max(4, Math.min(16, 2.5 + L * 0.05));
    const obs = obstacles.filter((b) => !near(p, b, 6) && !near(q, b, 6));
    let best = null;
    search: for (const k of [1, 1.4, 0.6, 1.9, 0.3, 2.5, 3.2, 4]) for (const side of [pref, -pref]) {
      const a = base * k * side, cx = mx + nx * 2 * a, cy = my + ny * 2 * a;
      let hits = 0;
      for (let i = 1; i < 32; i++) {
        const t = i / 32, u = 1 - t, x = u * u * p[0] + 2 * u * t * cx + t * t * q[0], y = u * u * p[1] + 2 * u * t * cy + t * t * q[1];
        if (x < 4 || x > W - 4 || y < 4 || y > H - 4) hits++;
        for (const b of obs) if (near([x, y], b, 3)) hits++;
      }
      if (!best || hits < best.hits) best = { hits, cx, cy, a: Math.abs(a) };
      if (!hits) break search;
    }
    const r = (v) => Math.round(v * 10) / 10;
    return { d: `M${p[0]} ${p[1]}Q${r(best.cx)} ${r(best.cy)} ${q[0]} ${q[1]}`, lift: Math.min(5, 1.2 + best.a * 0.16 + L * 0.006) };
  }

  // ---- samples (all our own) ------------------------------------------------------------------------------------
  const SAMPLES = {
    parity: {
      title: 'Odd parity of three switches', blurb: 'A 7486 adds S0, S1 and S2 modulo 2: LED 0 lights when an odd number of switches are up. The two spare gates have their inputs tied to ground.',
      state: { chips: [{ id: 'U1', num: '7486', col: 10 }], sw: [0, 0, 0, 0, 0, 0, 0, 0], clockHz: 1,
        jumpers: [['10a', 'Rtp10', 'red'], ['16j', 'Rbn16', 'black'], ['sw0', '10j', 'yellow'], ['sw1', '11j', 'yellow'], ['12i', '13i', 'green'], ['sw2', '14j', 'yellow'], ['15i', '17i', 'blue'], ['17h', '17d', 'blue'], ['17a', 'led0', 'blue'],
          ['11a', 'Rtn11', 'black'], ['12b', '11b', 'black'], ['14a', 'Rtn14', 'black'], ['15a', 'Rtn15', 'black']] },
    },
    counter: {
      title: 'A counter on the analyser', blurb: 'A 74161 counts the 2 Hz clock. S0 is its clear, low to start with: raise it and LEDs L0–L3 and analyser channels 0–3 follow QA to QD; L4 is the ripple carry. The load inputs A–D are not used, so they are tied to ground.',
      state: { chips: [{ id: 'U1', num: '74161', col: 20 }], sw: [0, 0, 0, 0, 0, 0, 0, 0], clockHz: 2,
        jumpers: [['20a', 'Rtp20', 'red'], ['26a', 'Rtp26', 'red'], ['27a', 'Rtp27', 'red'], ['27j', 'Rbn27', 'black'], ['26j', 'Rbp26', 'red'], ['sw0', '20j', 'yellow'], ['clk', '21j', 'white'],
          ['22a', 'led0', 'green'], ['23a', 'led1', 'green'], ['24a', 'led2', 'green'], ['25a', 'led3', 'green'], ['21a', 'led4', 'orange'],
          ['22b', 'ch0', 'blue'], ['23b', 'ch1', 'blue'], ['24b', 'ch2', 'blue'], ['25b', 'ch3', 'blue'], ['21c', 'ch4', 'orange'],
          ['22j', 'Rbn22', 'black'], ['23j', 'Rbn23', 'black'], ['24i', '25i', 'black'], ['25j', 'Rbn25', 'black']] },
    },
    mistakes: {
      title: 'Spot the mistakes', blurb: 'An AND gate that never answers: read what the bench sees, then fix the board.',
      state: { chips: [{ id: 'U1', num: '7408', col: 8 }], sw: [1, 0, 1, 0, 0, 0, 0, 0], clockHz: 1,
        jumpers: [['14j', 'Rbn14', 'black'], ['sw0', '8j', 'yellow'], ['sw1', '8i', 'yellow'], ['sw2', '9j', 'yellow'], ['10i', '16i', 'blue'], ['16h', '16c', 'blue'], ['16a', 'led0', 'blue']] },
    },
  };
  const blank = () => ({ v: 1, chips: [], jumpers: [], sw: [0, 0, 0, 0, 0, 0, 0, 0], clockHz: 1, segLow: false, bounce: false, tech: null, chs: 8 });
  function fromSample(id) {
    const s = SAMPLES[id], st = Object.assign(blank(), JSON.parse(JSON.stringify(s.state)));
    st.jumpers = s.state.jumpers.map(([a, b, color], i) => ({ id: 'J' + (i + 1), a, b, color }));
    st.sample = id;
    return st;
  }

  // ---- the page ---------------------------------------------------------------------------------------------------
  class Bench {
    constructor(app, main) {
      this.app = app;
      Lab.page = this;
      this.state = this.normal(store.get('lab', null)) || blank();
      this.undo = []; this.redo = [];
      this.sel = null; this.color = store.get('labColor', 'red');
      this.view = { x: 0, y: 0, w: W, h: H };
      this.keys = KEYS;
      this.built(main);
      this.rebuild();
      requestAnimationFrame(() => this.fit());
      this.loop();
    }
    normal(st) {
      if (!st || typeof st !== 'object' || !Array.isArray(st.chips) || !Array.isArray(st.jumpers)) return null;
      return Object.assign(blank(), st, { chips: st.chips.filter((c) => S.LabChips.get(c.num)) });
    }
    // ---- the frame --------------------------------------------------------------------------------------------
    built(main) {
      const tb = h('div.lab-tools', { id: 'labTools' });
      const btn = (id, ic, label, fn, title) => { const b = h('button.btn.small', { type: 'button', id, title: title || label }, icon(ic), h('span.lbl', label)); b.addEventListener('click', fn); return b; };
      const samples = btn('labSamples', 'book', 'Experiments', () => {
        const r = samples.getBoundingClientRect();
        S.UI.showMenu([{ header: true, label: 'Experiments' }, ...Object.entries(SAMPLES).map(([id, s]) => ({ label: s.title, action: () => this.loadSample(id) })), { sep: true }, { label: 'An empty bench', action: () => this.loadSample(null) }], r.left, r.bottom + 4, { anchor: samples, keyboard: true });
      });
      this.btnUndo = btn('labUndo', 'undo', 'Undo', () => this.doUndo(), 'Undo (Ctrl+Z)');
      this.btnRedo = btn('labRedo', 'redo', 'Redo', () => this.doRedo(), 'Redo (Ctrl+Y)');
      this.btnDel = btn('labDelete', 'trash', 'Delete', () => this.deleteSel(), 'Delete the selected chip or jumper (Del)');
      const colors = h('div.lab-colors', { role: 'radiogroup', 'aria-label': 'Jumper colour' }, ...COLORS.map(([c, l]) => {
        const b = h('button.lab-color' + (c === this.color ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(c === this.color), title: l + ' jumper', 'aria-label': l, dataset: { color: c } });
        b.addEventListener('click', () => this.setColor(c));
        return b;
      }));
      this.colorsEl = colors;
      this.techSel = h('select#labTech', { 'aria-label': 'Logic family', title: 'The chips’ logic family: TTL inputs left open read 1, CMOS inputs float' }, ...famNames().map((t) => h('option', { value: t }, famLabel(t))));
      this.techSel.addEventListener('change', () => { this.commit(() => { this.state.tech = this.techSel.value; }); });
      this.hzSel = h('select#labHz', { 'aria-label': 'Clock frequency', title: 'The clock generator’s frequency' }, ...[0.5, 1, 2, 5, 10].map((f) => h('option', { value: String(f) }, f + ' Hz')));
      this.hzSel.addEventListener('change', () => this.commit(() => { this.state.clockHz = +this.hzSel.value; }));
      const more = btn('labFile', 'folder', 'File', () => {
        const r = more.getBoundingClientRect();
        S.UI.showMenu([
          { label: 'Save the bench (.json)', action: () => this.save() },
          { label: 'Open a bench…', action: () => this.open() },
          { label: 'Copy a share link', action: () => S.app.share('lab', this.snapshot()) },
          { sep: true },
          { label: 'Clear the bench', action: () => this.commit(() => { this.state.chips = []; this.state.jumpers = []; this.sel = null; }) },
        ], r.left, r.bottom + 4, { anchor: more, keyboard: true });
      });
      tb.append(samples, h('span.sep'), this.btnUndo, this.btnRedo, this.btnDel, h('span.sep'), h('span.lab-lbl', 'Jumper'), colors, h('span.sep'), h('label.lab-field', h('span', 'Family'), this.techSel), h('label.lab-field', h('span', 'Clock'), this.hzSel), h('span.grow'), more);

      // the chips to place
      const tray = h('div.lab-tray', { id: 'labTray', 'aria-label': 'Chips' }, h('div.lab-tray-t', 'Chips'),
        ...S.LabChips.order.map((n) => { const d = S.LabChips.get(n); const b = h('button.lab-chip-btn', { type: 'button', dataset: { chip: n }, title: 'Place a ' + n + ': ' + d.title }, h('b', n), h('span', d.title)); b.addEventListener('click', () => this.placeChip(n)); return b; }));

      // the board
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('class', 'lab-svg');
      this.svg.setAttribute('role', 'img');
      this.svg.setAttribute('aria-label', 'Breadboard');
      this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      const zoom = h('div.lab-zoom', ...[['zoomIn', 'Zoom in', () => this.zoom(1 / 1.3)], ['zoomOut', 'Zoom out', () => this.zoom(1.3)], ['fit', 'Fit the board', () => this.fit()]].map(([ic, l, f]) => { const b = h('button.icon-btn.zbtn', { type: 'button', title: l, 'aria-label': l }, icon(ic)); b.addEventListener('click', f); return b; }));
      this.boardBox = h('div.lab-board', { id: 'labBoard', tabindex: '0', 'aria-label': 'The breadboard: drag from a hole to a hole for a jumper' }, this.svg, zoom);
      this.hint = h('div.lab-hint', 'Drag from a hole or terminal to another for a jumper. Click a switch to flip it. Pick a chip on the left to place it.');

      // what the bench sees, and the selection
      this.seesEl = h('ul.lab-sees', { id: 'labSees', 'aria-live': 'polite' });
      this.infoEl = h('div.lab-info', { id: 'labInfo' });
      const side = h('div.lab-side', h('div.card.lab-card', h('h3', icon('eye'), 'What the bench sees'), this.seesEl), h('div.card.lab-card', this.infoEl));

      // the analyser
      this.anaBox = h('div.lab-ana-wave', { id: 'labAnalyser' });
      this.anaNote = h('span.muted.lab-ana-note');
      this.anaPause = h('button.btn.small', { type: 'button', id: 'labAnaPause' }, 'Hold');
      this.anaPause.addEventListener('click', () => { this.anaHeld = !this.anaHeld; this.anaPause.textContent = this.anaHeld ? 'Run' : 'Hold'; this.anaPause.setAttribute('aria-pressed', String(!!this.anaHeld)); });
      const vcd = h('button.btn.small', { type: 'button', id: 'labAnaVcd' }, icon('download'), 'VCD');
      vcd.addEventListener('click', () => this.exportVcd());
      const ana = h('div.card.lab-ana', h('div.lab-ana-head', h('h3', icon('wave'), 'Logic analyser'), this.anaNote, h('span.grow'), this.anaPause, vcd), this.anaBox);

      this.root = h('div.lab', { id: 'labView' },
        h('div.lab-head', h('h1.page-title', 'Lab bench'), h('p.lead', 'A breadboard with 74-series chips. Wire it as you would a real one: it only works when every chip has power and every input is driven.')),
        tb, h('div.lab-grid', tray, h('div.lab-mid', this.boardBox, this.hint, ana), side));
      main.appendChild(this.root);
      this.bindBoard();
      S.UI.scrollRow(tray);
      this.ro = new ResizeObserver(() => this.applyView());
      this.ro.observe(this.boardBox);
    }

    // ---- state changes ------------------------------------------------------------------------------------------
    snapshot() { return JSON.parse(JSON.stringify(this.state)); }
    commit(fn) {
      this.undo.push(JSON.stringify(this.state));
      if (this.undo.length > 200) this.undo.shift();
      this.redo = [];
      fn();
      delete this.state.sample;
      this.rebuild();
    }
    doUndo() { if (!this.undo.length) return; this.redo.push(JSON.stringify(this.state)); this.state = JSON.parse(this.undo.pop()); this.sel = null; this.rebuild(); }
    doRedo() { if (!this.redo.length) return; this.undo.push(JSON.stringify(this.state)); this.state = JSON.parse(this.redo.pop()); this.sel = null; this.rebuild(); }
    loadSample(id) {
      this.undo.push(JSON.stringify(this.state)); this.redo = [];
      this.state = id ? fromSample(id) : blank();
      this.sel = null; this.anaHeld = false;
      this.rebuild(); this.fit();
      if (id) S.UI.toast(SAMPLES[id].title + ': ' + SAMPLES[id].blurb, 'ok', 4500);
    }
    setColor(c) {
      this.color = c; store.set('labColor', c);
      for (const b of this.colorsEl.children) { const on = b.dataset.color === c; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
      if (this.sel && this.sel.kind === 'jumper') this.commit(() => { const j = this.state.jumpers.find((x) => x.id === this.sel.id); if (j) j.color = c; });
    }
    used() {
      const u = new Map();
      for (const j of this.state.jumpers) { u.set(j.a, j); u.set(j.b, j); }
      for (const ch of this.state.chips) for (const hole of Object.values(chipHoles(ch))) u.set(hole, ch);
      return u;
    }
    free(ch, except) {
      const [a, b] = chipSpan(ch);
      if (a < 1 || b > NCOL) return false;
      for (const o of this.state.chips) { if (o === except || o.id === (except && except.id)) continue; const [c, d] = chipSpan(o); if (a <= d + 1 && c <= b + 1) return false; }
      // a chip may not sit on a jumper's end
      const holes = Object.values(chipHoles(ch));
      return !this.state.jumpers.some((j) => holes.includes(j.a) || holes.includes(j.b));
    }
    newId(prefix, list) { let i = 1; while (list.some((x) => x.id === prefix + i)) i++; return prefix + i; }
    /** place a chip: at column col, or at the first place it fits */
    placeChip(num, col) {
      const def = S.LabChips.get(num);
      if (!def) return null;
      const ch = { id: this.newId('U', this.state.chips), num: String(num), col: col || 0 };
      if (col) { if (!this.free(ch)) { S.UI.toast('A ' + num + ' does not fit there: it needs ' + def.dip / 2 + ' free columns.', 'err'); return null; } }
      else {
        let c = 4;
        for (; c + def.dip / 2 - 1 <= NCOL; c++) { ch.col = c; if (this.free(ch)) break; }
        if (c + def.dip / 2 - 1 > NCOL) { S.UI.toast('There is no room left on the board for a ' + num + '.', 'err'); return null; }
      }
      this.commit(() => { this.state.chips.push(ch); this.sel = { kind: 'chip', id: ch.id }; });
      return ch.id;
    }
    addJumper(a, b, color) {
      if (a === b || !pointOf(a) || !pointOf(b)) return null;
      const u = this.used();
      for (const k of [a, b]) if (u.has(k)) { S.UI.toast((TERM[k] ? 'That terminal' : 'That hole') + ' (' + this.keyName(k) + ') already has a wire or a pin in it.', 'err'); return null; }
      const j = { id: this.newId('J', this.state.jumpers), a, b, color: color || this.color };
      this.commit(() => { this.state.jumpers.push(j); this.sel = { kind: 'jumper', id: j.id }; });
      return j.id;
    }
    deleteSel() {
      if (!this.sel) return;
      const s = this.sel;
      this.commit(() => {
        if (s.kind === 'chip') this.state.chips = this.state.chips.filter((c) => c.id !== s.id);
        else this.state.jumpers = this.state.jumpers.filter((j) => j.id !== s.id);
        this.sel = null;
      });
    }
    keyName(k) { if (TERM[k]) return TERM_NAME(k); const m = /^R(tp|tn|bp|bn)(\d+)$/.exec(k); if (m) return (m[1][1] === 'p' ? '+5 V' : 'ground') + ' rail, column ' + m[2]; return 'hole ' + k; }
    toggle(i) {
      const v = this.state.sw[i] ? 0 : 1;
      this.state.sw[i] = v; this.save2();
      if (this.sim) this.sim.set('S' + i, v);
      const g = this.svg.querySelector('.lab-sw[data-sw="' + i + '"]');
      if (g) { g.querySelector('.lab-sw-knob').setAttribute('cy', v ? 424 : 442); g.querySelector('.lab-swv').textContent = String(v); }
      this.paint();
    }
    press(i, on) {
      this.pb = this.pb || [0, 0]; this.pb[i] = on ? 1 : 0;
      if (this.sim) {
        const v = on ? 1 : 0, n = 'P' + i;
        // a bouncing contact makes and breaks a few times within a millisecond or two before it rests
        if (this.state.bounce) for (const [d, b] of [[0, v], [3e5, 1 - v], [2e5, v], [4e5, 1 - v], [3e5, v]]) { if (d) this.sim.run(d); this.sim.set(n, b); }
        else this.sim.set(n, v);
      }
      this.paint();
    }
    save2() { store.set('lab', this.state); }

    // ---- nets and the simulation ----------------------------------------------------------------------------------
    nets() {
      const parent = new Map();
      const find = (k) => { if (!parent.has(k)) parent.set(k, k); while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
      const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
      for (const j of this.state.jumpers) union(baseNet(j.a), baseNet(j.b));
      find('VCC'); find('GND');
      return find;
    }
    rebuild() {
      const st = this.state;
      const find = this.nets();
      const roots = new Map();
      const idx = (k) => { const r = find(k); if (!roots.has(r)) roots.set(r, roots.size); return roots.get(r); };
      this.find = find; this.netIdx = idx;
      const vcc = idx('VCC'), gnd = idx('GND'), short = vcc === gnd;
      const tech = st.tech || (S.app && S.app.settings.tech) || 'CMOS';
      const fh = S.app && S.app.settings.floatHigh != null ? S.app.settings.floatHigh : famFloat(tech);
      this.floatHigh = !!fh; this.tech = tech;
      const switches = [];
      for (let i = 0; i < 8; i++) switches.push({ name: 'S' + i, net: idx('sw' + i), v: st.sw[i] ? 1 : 0, key: 'sw' + i });
      for (let i = 0; i < 2; i++) switches.push({ name: 'P' + i, net: idx('pb' + i), v: (this.pb && this.pb[i]) || 0, key: 'pb' + i });
      const chips = st.chips.map((ch) => {
        const def = S.LabChips.get(ch.num), holes = chipHoles(ch), pins = {};
        let vccNet = -1, gndNet = -1;
        for (const q of def.pins) { const n = idx(baseNet(holes[q.num])); if (q.dir === 'power') { if (q.name === 'VCC') vccNet = n; else gndNet = n; } else pins[q.name] = n; }
        return { id: ch.id, num: ch.num, pins, vccNet, gndNet, powered: !short && vccNet === vcc && gndNet === gnd };
      });
      // the net of every endpoint, for the drawing; nets nobody joined to anything keep an index too
      for (const k of Object.keys(TERM)) idx(k);
      const names = [];
      for (const [r, i] of roots) names[i] = stripName(r);
      const spec = { nets: names, vcc, gnd, short, switches, clock: { net: idx('clk'), period: 1e9 / (st.clockHz || 1) }, chips };
      this.spec = spec;
      let sim = LabSimEngine(spec, { tech, floatHigh: this.floatHigh });
      this.sim = sim;
      this.t0 = performance.now();
      this.analyse();
      this.techSel.value = tech; this.hzSel.value = String(st.clockHz || 1);
      this.btnUndo.disabled = !this.undo.length; this.btnRedo.disabled = !this.redo.length; this.btnDel.disabled = !this.sel;
      this.save2();
      this.draw();
      this.anaKey = null;
      this.updateAnalyser(true);
    }
    /** what the bench sees in its wiring: power, open inputs, outputs that fight */
    analyse() {
      const spec = this.spec, out = [], st = this.state;
      const fam = /TTL/.test(this.tech);
      if (spec.short) out.push({ kind: 'bad', text: '+5 V and ground are joined by a wire: that is a short circuit, so the supply shuts down and nothing on the board works.' });
      const drivers = new Map();
      const addDrv = (n, who) => { if (n < 0) return; if (!drivers.has(n)) drivers.set(n, []); drivers.get(n).push(who); };
      addDrv(spec.vcc, '+5 V'); if (spec.gnd !== spec.vcc) addDrv(spec.gnd, 'ground');
      for (const s of spec.switches) if (this.state.jumpers.some((j) => j.a === s.key || j.b === s.key)) addDrv(s.net, s.name[0] === 'S' ? 'switch ' + s.name : 'button ' + s.name);
      if (this.state.jumpers.some((j) => j.a === 'clk' || j.b === 'clk')) addDrv(spec.clock.net, 'the clock');
      this.unpowered = new Set();
      for (const ch of spec.chips) {
        const def = S.LabChips.get(ch.num), vp = def.pins.find((q) => q.name === 'VCC').num, gp = def.pins.find((q) => q.name === 'GND').num;
        const name = ch.id + ' (' + ch.num + ')';
        if (!ch.powered && !spec.short) {
          this.unpowered.add(ch.id);
          if (ch.vccNet === spec.gnd && ch.gndNet === spec.vcc) out.push({ kind: 'bad', chip: ch.id, text: name + ' is powered backwards: pin ' + vp + ' (VCC) is on ground and pin ' + gp + ' (GND) on +5 V. A real chip would get hot; this one does nothing.' });
          else {
            const miss = [];
            if (ch.vccNet !== spec.vcc) miss.push('pin ' + vp + ' (VCC) is not wired to +5 V');
            if (ch.gndNet !== spec.gnd) miss.push('pin ' + gp + ' (GND) is not wired to ground');
            out.push({ kind: 'bad', chip: ch.id, text: name + ' has no power: ' + miss.join(' and ') + '. Without power its outputs float and it does nothing.' });
          }
        }
        if (ch.powered) for (const q of def.pins) if (q.dir === 'out' && ch.pins[q.name] >= 0) addDrv(ch.pins[q.name], ch.id + ' pin ' + q.num + ' (' + S.LabChips.pretty(q.name) + ')');
      }
      for (const ch of spec.chips) {
        if (!ch.powered) continue;
        const def = S.LabChips.get(ch.num), open = [];
        for (const q of def.pins) if (q.dir === 'in' && !(drivers.get(ch.pins[q.name]) || []).length) open.push(q.num + ' (' + S.LabChips.pretty(q.name) + ')');
        if (open.length) out.push({ kind: 'warn', chip: ch.id, text: ch.id + ' (' + ch.num + ') has ' + (open.length === 1 ? 'an input' : open.length + ' inputs') + ' that nothing drives: pin' + (open.length > 1 ? 's ' : ' ') + open.join(', ') + '. ' + (fam ? 'On TTL an open input reads 1' : 'On CMOS an open input floats and reads X') + '; tie unused inputs to a rail.' });
      }
      this.fights = new Set();
      for (const [n, who] of drivers) if (who.length > 1) {
        this.fights.add(n);
        out.push({ kind: 'bad', net: n, text: 'Two outputs drive ' + spec.nets[n] + ': ' + who.join(' and ') + '. When they disagree the wire reads X and the outputs fight.' });
      }
      if (!out.length) out.push({ kind: 'ok', text: spec.chips.length ? 'Nothing wrong: every chip has power and every input is driven.' : 'An empty bench. Place a chip from the list, or open an experiment.' });
      this.sees = out;
      this.drawSees();
    }
    drawSees() {
      this.seesEl.innerHTML = '';
      for (const s of this.sees) {
        const li = h('li.' + s.kind, icon(s.kind === 'ok' ? 'check' : s.kind === 'warn' ? 'info' : 'warn'), h('span', s.text));
        if (s.chip) { li.classList.add('link'); li.addEventListener('click', () => { this.sel = { kind: 'chip', id: s.chip }; this.draw(); }); }
        this.seesEl.appendChild(li);
      }
      if (this.liveFight) this.seesEl.appendChild(h('li.bad.live', icon('warn'), h('span', this.liveFight)));
    }
    loop() {
      let last = performance.now();
      const tick = (now) => {
        if (this.dead) return;
        const dt = Math.min(100, now - last); last = now;
        if (!document.hidden && this.sim) {
          try { this.sim.run(dt * 1e6); } catch (e) { /* a broken engine: keep the page */ }
          this.paint();
          if (!this.anaHeld && now - (this.anaAt || 0) > 200) { this.anaAt = now; this.updateAnalyser(); }
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }

    // ---- drawing ------------------------------------------------------------------------------------------------
    draw() {
      const st = this.state, sel = this.sel;
      let s = '';
      // the board itself
      s += '<g data-audit="ignore" class="lab-decor">';
      s += `<rect class="lab-boardbg" x="${X0 - 32}" y="108" width="${colX(NCOL) - X0 + 52}" height="280" rx="10"/>`;
      s += `<rect class="lab-channel" x="${X0 - 14}" y="241" width="${colX(NCOL) - X0 + 28}" height="12" rx="3"/>`;
      for (const [r, y] of Object.entries(RAILY)) s += `<line class="lab-rail ${r[1] === 'p' ? 'pos' : 'neg'}" x1="${X0 - 10}" y1="${y + (r === 'tp' || r === 'bp' ? -8 : 8)}" x2="${colX(NCOL) + 10}" y2="${y + (r === 'tp' || r === 'bp' ? -8 : 8)}"/>`;
      for (let c = 1; c <= NCOL; c++) {
        for (const r of ROWS) s += `<circle class="lab-hole" cx="${colX(c)}" cy="${ROWY[r]}" r="2.6"/>`;
        if (railHole(c)) for (const y of Object.values(RAILY)) s += `<circle class="lab-hole" cx="${colX(c)}" cy="${y}" r="2.6"/>`;
      }
      s += '</g>';
      // the hole labels: jumpers keep clear of them
      s += '<g class="lab-nums">';
      for (const c of NUM_COLS) s += `<text class="lab-num" data-audit="small-ok" x="${colX(c)}" y="152" text-anchor="middle">${c}</text><text class="lab-num" data-audit="small-ok" x="${colX(c)}" y="347" text-anchor="middle">${c}</text>`;
      for (const r of ROWS) s += `<text class="lab-num" data-audit="small-ok" x="${X0 - 20}" y="${ROWY[r] + 3}" text-anchor="middle">${r}</text>`;
      s += '</g>';
      // rail names
      for (const [r, y] of Object.entries(RAILY)) s += `<text class="lab-railt ${r[1] === 'p' ? 'pos' : 'neg'}" x="${colX(NCOL) + 16}" y="${y + 4}">${r[1] === 'p' ? '+5 V' : 'GND'}</text>`;
      // the panel: outputs above, inputs below
      s += '<g class="lab-panel">';
      for (let i = 0; i < 8; i++) {
        const [x] = TERM['led' + i];
        s += `<g class="lab-comp lab-led" data-led="${i}"><rect data-audit="node" class="lab-cbox" x="${x - 16}" y="14" width="32" height="78" rx="6"/><text class="lab-ct" x="${x}" y="30" text-anchor="middle">L${i}</text><circle class="lab-led-lamp" cx="${x}" cy="58" r="9"/></g>`;
        const [sx] = TERM['sw' + i];
        s += `<g class="lab-comp lab-sw" data-sw="${i}" role="button" aria-label="Switch S${i}"><rect data-audit="node" class="lab-cbox" x="${sx - 16}" y="404" width="32" height="84" rx="6"/><rect data-audit="ignore" class="lab-sw-track" x="${sx - 6}" y="416" width="12" height="34" rx="6"/><circle data-audit="ignore" class="lab-sw-knob" cx="${sx}" cy="${st.sw[i] ? 424 : 442}" r="5"/><text class="lab-ct lab-swv" x="${sx}" y="465" text-anchor="middle">${st.sw[i] ? 1 : 0}</text><text class="lab-ct" x="${sx}" y="481" text-anchor="middle">S${i}</text></g>`;
      }
      // the display
      s += `<g class="lab-comp lab-seg"><rect data-audit="node" class="lab-cbox" x="372" y="14" width="80" height="78" rx="6"/>${this.segPaths()}${'abcdefg'.split('').map((c, k) => `<text class="lab-ct lab-small" x="${380 + k * 11}" y="87" text-anchor="middle">${c}</text>`).join('')}</g>`;
      s += `<g class="lab-comp lab-probe"><rect data-audit="node" class="lab-cbox" x="474" y="14" width="78" height="78" rx="6"/><text class="lab-ct" x="513" y="30" text-anchor="middle">Probe</text><text class="lab-probe-v" x="513" y="62" text-anchor="middle">–</text></g>`;
      s += `<g class="lab-comp lab-chs"><rect data-audit="node" class="lab-cbox" x="582" y="14" width="242" height="78" rx="6"/><text class="lab-ct" x="703" y="34" text-anchor="middle">Logic analyser</text>${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<text class="lab-ct lab-small" x="${598 + k * 30}" y="84" text-anchor="middle">${k}</text>`).join('')}</g>`;
      for (let i = 0; i < 2; i++) { const [x] = TERM['pb' + i]; s += `<g class="lab-comp lab-pb" data-pb="${i}" role="button" aria-label="Button P${i}"><rect data-audit="node" class="lab-cbox" x="${x - 16}" y="404" width="32" height="84" rx="6"/><circle data-audit="ignore" class="lab-pb-cap" cx="${x}" cy="436" r="9"/><text class="lab-ct" x="${x}" y="481" text-anchor="middle">P${i}</text></g>`; }
      s += `<g class="lab-comp lab-clk"><rect data-audit="node" class="lab-cbox" x="446" y="404" width="80" height="84" rx="6"/><text class="lab-ct" x="486" y="424" text-anchor="middle">Clock</text><circle data-audit="ignore" class="lab-clk-lamp" cx="486" cy="444" r="5"/><text class="lab-ct lab-hz" x="486" y="470" text-anchor="middle">${st.clockHz || 1} Hz</text></g>`;
      s += `<g class="lab-comp lab-supply"><rect data-audit="node" class="lab-cbox" x="560" y="404" width="264" height="84" rx="6"/><text class="lab-ct" x="692" y="430" text-anchor="middle">Supply: 5 V</text><text class="lab-ct lab-small" x="692" y="452" text-anchor="middle">feeds both + rails and both − rails</text><text class="lab-ct lab-small lab-fam" x="692" y="472" text-anchor="middle">${this.familyText()}</text></g>`;
      s += '</g>';
      // terminals
      s += '<g class="lab-terms" data-audit="ignore">';
      for (const [k, [x, y]] of Object.entries(TERM)) s += `<circle class="lab-term" data-term="${k}" cx="${x}" cy="${y}" r="4"/>`;
      s += '</g>';
      // chips
      for (const ch of st.chips) {
        const def = S.LabChips.get(ch.num), [a, b] = chipSpan(ch), x1 = colX(a) - 6, x2 = colX(b) + 6;
        const off = this.unpowered && this.unpowered.has(ch.id), on = sel && sel.kind === 'chip' && sel.id === ch.id;
        s += `<g class="lab-ic${off ? ' off' : ''}${on ? ' sel' : ''}" data-chip="${ch.id}">`;
        s += '<g data-audit="ignore">';
        for (let c = a; c <= b; c++) s += `<rect class="lab-leg" x="${colX(c) - 2.5}" y="${ROWY.e - 1}" width="5" height="7"/><rect class="lab-leg" x="${colX(c) - 2.5}" y="${ROWY.f - 6}" width="5" height="7"/>`;
        s += '</g>';
        s += `<rect data-audit="node" class="lab-ic-body" x="${x1}" y="${ROWY.e + 5}" width="${x2 - x1}" height="${ROWY.f - ROWY.e - 10}" rx="3"/>`;
        s += `<path data-audit="ignore" class="lab-notch" d="M${x1} 241A6 6 0 0 1 ${x1} 253"/><circle data-audit="ignore" class="lab-pin1" cx="${x1 + 7}" cy="${ROWY.f - 12}" r="1.8"/>`;
        s += `<text class="lab-ic-t" x="${(x1 + x2) / 2 + 3}" y="${ROWY.e + 19}" text-anchor="middle">${def.num}</text><text class="lab-ic-id" x="${(x1 + x2) / 2 + 3}" y="${ROWY.e + 34}" text-anchor="middle">${ch.id}${off ? ' · no power' : ''}</text>`;
        s += '</g>';
      }
      // jumpers
      const obstacles = LABEL_BOXES.concat(PANEL_BOXES, st.chips.map((ch) => { const [a, b] = chipSpan(ch); return box(colX(a) - 6, ROWY.e + 5, colX(b) - colX(a) + 12, ROWY.f - ROWY.e - 10); }));
      const curves = st.jumpers.map((j) => { const p = pointOf(j.a), q = pointOf(j.b); return Object.assign({ j, p, q }, jumperCurve(p, q, obstacles)); });
      // their shadows on the board first, then the wires above them all
      s += '<g class="lab-jshadows" data-audit="ignore">';
      for (const c of curves) s += `<path class="lab-j-shadow" d="${c.d}" transform="translate(${(c.lift * 0.45).toFixed(1)} ${c.lift.toFixed(1)})"/>`;
      s += '</g><g class="lab-jumpers">';
      for (const { j, p: [x1, y1], q: [x2, y2], d } of curves) {
        const on = sel && sel.kind === 'jumper' && sel.id === j.id;
        s += `<g class="lab-j${on ? ' sel' : ''}" data-jumper="${j.id}"><path data-audit="ignore" class="lab-j-hit" d="${d}"/><path data-audit="edge-x" class="lab-wire c-${j.color}" d="${d}"/><path data-audit="ignore" class="lab-wire-shine" d="${d}"/><circle data-audit="ignore" class="lab-j-end c-${j.color}" cx="${x1}" cy="${y1}" r="3.2"/><circle data-audit="ignore" class="lab-j-end c-${j.color}" cx="${x2}" cy="${y2}" r="3.2"/></g>`;
      }
      s += '</g>';
      // a strip that fights, flashing
      s += '<g class="lab-fights" data-audit="ignore"></g>';
      s += '<line class="lab-ghost" data-audit="ignore" x1="0" y1="0" x2="0" y2="0" style="display:none"/>';
      this.svg.innerHTML = s;
      this.applyView();
      this.drawInfo();
      this.paint(true);
      this.btnDel.disabled = !this.sel;
    }
    familyText() { return (/TTL/.test(this.tech) ? 'TTL family: an open input reads 1' : 'CMOS family: an open input floats (X)'); }
    segPaths() {
      // a small seven-segment digit, drawn with plain filled bars
      const x = 412, y = 24, w = 18, t = 4, hh = 22;
      const bar = (k, d) => `<path data-audit="ignore" class="lab-segbar" data-seg="${k}" d="${d}"/>`;
      return bar('a', `M${x - w / 2} ${y}h${w}v${t}h${-w}z`) + bar('b', `M${x + w / 2} ${y + 2}h${t}v${hh}h${-t}z`) + bar('c', `M${x + w / 2} ${y + hh + 6}h${t}v${hh}h${-t}z`) +
        bar('d', `M${x - w / 2} ${y + 2 * hh + 6}h${w}v${t}h${-w}z`) + bar('e', `M${x - w / 2 - t} ${y + hh + 6}h${t}v${hh}h${-t}z`) + bar('f', `M${x - w / 2 - t} ${y + 2}h${t}v${hh}h${-t}z`) + bar('g', `M${x - w / 2} ${y + hh + 1}h${w}v${t}h${-w}z`);
    }
    /** the values on the panel: LEDs, the display, the probe, the switches, the clock lamp; strips that fight */
    paint() {
      const sim = this.sim;
      if (!sim || !this.svg.isConnected) return;
      const v = (k) => sim.value(this.netIdx(baseNet(k)));
      const wired = (k) => this.state.jumpers.some((j) => j.a === k || j.b === k);
      for (const g of this.svg.querySelectorAll('.lab-led')) { const k = 'led' + g.dataset.led; g.classList.toggle('lit', wired(k) && v(k) === '1'); }
      const low = !!this.state.segLow;
      for (const p of this.svg.querySelectorAll('.lab-segbar')) { const k = 'seg-' + p.dataset.seg, x = wired(k) ? v(k) : 'z'; p.classList.toggle('lit', low ? x === '0' : x === '1'); }
      const pv = this.svg.querySelector('.lab-probe-v');
      if (pv) {
        const n = this.netIdx(baseNet('probe')), val = wired('probe') ? sim.value(n) : 'z';
        const w = wired('probe') ? sim.waves(n) : [];
        let changes = 0; for (let i = w.length - 1; i > 0 && w[i][0] > sim.time - 1.2e9; i--) changes++;
        const txt = changes >= 2 ? 'PULSE' : val === '1' ? 'HI' : val === '0' ? 'LO' : val === 'x' ? 'X' : 'FLOAT';
        if (pv.textContent !== txt) { pv.textContent = txt; pv.setAttribute('class', 'lab-probe-v ' + txt.toLowerCase()); }
      }
      const lamp = this.svg.querySelector('.lab-clk-lamp');
      if (lamp) { const per = 1e9 / (this.state.clockHz || 1); lamp.classList.toggle('lit', (sim.time % per) >= per / 2); }
      // live contention: a strip whose drivers disagree now
      let fight = null;
      const fg = this.svg.querySelector('.lab-fights');
      if (fg && sim.drivers) {
        let s = '';
        for (const n of this.fights || []) {
          if (sim.value(n) !== 'x') continue;
          const ds = sim.drivers(n);
          if (ds.filter(([, d]) => d !== 'x').length < 2 && sim.engine === 'bench') continue;
          fight = fight || 'Right now the outputs on ' + this.spec.nets[n] + ' disagree, so it reads X.';
          const m = /^column (\d+) \((top|bottom)/.exec(this.spec.nets[n]);
          if (m) { const x = colX(+m[1]), y0 = m[2] === 'top' ? ROWY.a : ROWY.f; s += `<rect class="lab-fight" x="${x - 6}" y="${y0 - 7}" width="12" height="${ROWY.e - ROWY.a + 14}" rx="5"/>`; }
        }
        if (fg.innerHTML !== s) fg.innerHTML = s;
      }
      if (fight !== this.liveFight) { this.liveFight = fight; this.drawSees(); }
    }
    drawInfo() {
      const el = this.infoEl, sel = this.sel;
      el.innerHTML = '';
      if (sel && sel.kind === 'chip') {
        const ch = this.state.chips.find((c) => c.id === sel.id);
        if (!ch) { this.sel = null; return this.drawInfo(); }
        const def = S.LabChips.get(ch.num), holes = chipHoles(ch);
        el.append(h('h3', icon('chip'), ch.id + ': ' + def.num), h('p.muted', def.title + '. Pin 1 is at column ' + ch.col + ', bottom row f; the numbers run anticlockwise.'));
        const tbl = h('table.dtable.lab-pins', h('thead', h('tr', h('th', 'Pin'), h('th', 'Name'), h('th', 'Job'), h('th', 'Hole'))),
          h('tbody', ...def.pins.map((q) => h('tr', h('td', String(q.num)), h('td.mono', S.LabChips.pretty(q.name)), h('td', q.dir === 'power' ? 'power' : q.dir === 'out' ? 'output' : 'input'), h('td.mono', holes[q.num])))));
        el.append(h('div.dtable-wrap.lab-pins-wrap', tbl));
        const mv = h('div.lab-move', h('button.btn.small', { type: 'button', id: 'labLeft', onclick: () => this.moveChip(ch.id, -1) }, '← Move left'), h('button.btn.small', { type: 'button', id: 'labRight', onclick: () => this.moveChip(ch.id, 1) }, 'Move right →'));
        el.append(mv);
      } else if (sel && sel.kind === 'jumper') {
        const j = this.state.jumpers.find((x) => x.id === sel.id);
        if (!j) { this.sel = null; return this.drawInfo(); }
        el.append(h('h3', icon('link'), 'Jumper ' + j.id), h('p', 'From ' + this.keyName(j.a) + ' to ' + this.keyName(j.b) + '. Pick a colour above to recolour it, or press Delete to pull it out.'));
      } else {
        el.append(h('h3', icon('info'), 'How the bench works'), h('ul.lab-howto',
          h('li', 'Each column of five holes (a–e, or f–j) is one strip: everything in it is joined.'),
          h('li', 'The rails along the top and bottom carry +5 V (red) and ground (blue).'),
          h('li', 'A chip needs its VCC pin wired to +5 V and its GND pin to ground, or it does nothing.'),
          h('li', 'LEDs light on 1. The display lights a segment on 1, or on 0 for a common-anode display.')),
        h('label.lab-check', h('input', { type: 'checkbox', id: 'labSegLow', checked: !!this.state.segLow, onchange: (e) => this.commit(() => { this.state.segLow = e.target.checked; }) }), ' The display is common anode (segments light on 0, as a 7447 drives them)'),
        h('label.lab-check', h('input', { type: 'checkbox', id: 'labBounce', checked: !!this.state.bounce, onchange: (e) => this.commit(() => { this.state.bounce = e.target.checked; }) }), ' The buttons P0 and P1 bounce (each press and release makes and breaks a few times in the first millisecond or two)'));
      }
    }
    moveChip(id, d) {
      const ch = this.state.chips.find((c) => c.id === id);
      if (!ch) return;
      const t = Object.assign({}, ch, { col: ch.col + d });
      if (!this.free(t, ch)) { S.UI.toast('The chip cannot move there: something is in the way.', 'err'); return; }
      this.commit(() => { ch.col += d; });
    }

    // ---- the analyser -----------------------------------------------------------------------------------------
    channels() {
      const out = [];
      for (let k = 0; k < 8; k++) if (this.state.jumpers.some((j) => j.a === 'ch' + k || j.b === 'ch' + k)) out.push(k);
      return out;
    }
    updateAnalyser(force) {
      const chs = this.channels(), sim = this.sim;
      if (!sim) return;
      const span = Math.max(4, 8 / (this.state.clockHz || 1)) * 1e9;
      const end = sim.time, start = Math.max(0, end - span);
      const waves = new Map(), widths = new Map();
      const trim = (w) => { const out = []; let lastV = w[0] ? w[0][1] : 'z'; for (const [t, v] of w) { if (t < start) { lastV = v; continue; } out.push([t, v]); } out.unshift([start, lastV]); return out; };
      for (const k of chs) { waves.set('CH' + k, trim(sim.waves(this.netIdx(baseNet('ch' + k))))); widths.set('CH' + k, 1); }
      const clkWired = this.state.jumpers.some((j) => j.a === 'clk' || j.b === 'clk');
      if (clkWired) { waves.set('CLK', trim(sim.waves(this.netIdx('clk')))); widths.set('CLK', 1); }
      this.anaNote.textContent = chs.length ? chs.length + ' channel' + (chs.length > 1 ? 's' : '') + ', the last ' + (span / 1e9).toFixed(0) + ' s' : 'Wire a strip to a channel terminal (top right) to watch it here.';
      const names = [...waves.keys()];
      const key = names.join(',');
      // the waveform viewer, once it can show a span of seconds; until then the bench's own traces
      if (S.Wave && S.Wave.longTime) {
        if (!this.wv) this.wv = new S.Wave(this.anaBox, { height: 150 });
        this.wv.setData({ waves, widths, end, violations: [], clock: clkWired ? 'CLK' : null, start });
        if (key !== this.anaKey || force) { this.wv.show(names); this.anaKey = key; }
      } else this.miniWave(waves, start, end);
      this.lastWaves = { waves, widths };
    }
    /** the analyser's own traces: a row per channel, the clock first, a time axis in seconds */
    miniWave(waves, start, end) {
      const names = [...waves.keys()].sort((a, b) => (a === 'CLK' ? -1 : b === 'CLK' ? 1 : a.localeCompare(b)));
      const RH = 24, LW = 48, AX = 18, w = Math.max(280, Math.round(this.anaBox.clientWidth || 600)), hgt = AX + names.length * RH + 4;
      if (!names.length) { this.anaBox.innerHTML = ''; return; }
      const X = (t) => LW + ((t - start) / Math.max(1, end - start)) * (w - LW - 8);
      let s = `<svg class="lab-mini" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" role="img" aria-label="Logic analyser traces">`;
      s += '<g data-audit="ignore">';
      for (let t = Math.ceil(start / 1e9) * 1e9; t <= end; t += 1e9) s += `<line class="lab-mini-g" x1="${X(t)}" y1="${AX - 4}" x2="${X(t)}" y2="${hgt}"/>`;
      s += '</g>';
      let lastR = -1e9;
      for (let t = Math.ceil(start / 1e9) * 1e9; t <= end; t += 1e9) {
        const x = X(t), txt = Math.round(t / 1e9) + ' s';
        if (x - 12 < lastR || x + 12 > w) continue;
        lastR = x + 12;
        s += `<text class="lab-mini-ax" x="${x}" y="11" text-anchor="middle">${txt}</text>`;
      }
      names.forEach((n, i) => {
        const y0 = AX + i * RH, hi = y0 + 5, lo = y0 + RH - 6, mid = (hi + lo) / 2;
        s += `<text class="lab-mini-t" x="6" y="${mid + 4}">${n}</text>`;
        let d = '', prev = null, xs = '';
        const pts = waves.get(n);
        for (let k = 0; k < pts.length; k++) {
          const [t, v] = pts[k], x = X(t), y = v === '1' ? hi : v === '0' ? lo : mid;
          d += prev == null ? `M${x.toFixed(1)} ${y}` : `L${x.toFixed(1)} ${prev}L${x.toFixed(1)} ${y}`;
          if (v === 'x' || v === 'z') { const x2 = k + 1 < pts.length ? X(pts[k + 1][0]) : X(end); xs += `<rect class="lab-mini-${v}" x="${x.toFixed(1)}" y="${hi}" width="${Math.max(0, x2 - x).toFixed(1)}" height="${lo - hi}"/>`; }
          prev = y;
        }
        d += `L${X(end).toFixed(1)} ${prev}`;
        s += `<g data-audit="ignore">${xs}</g><path class="lab-mini-w${n === 'CLK' ? ' clk' : ''}" d="${d}"/>`;
      });
      this.anaBox.innerHTML = s + '</svg>';
    }
    exportVcd() {
      if (!this.lastWaves || !this.lastWaves.waves.size) { S.UI.toast('Wire a channel of the analyser first.', 'err'); return; }
      const all = new Map(), widths = new Map();
      for (const k of this.channels()) { all.set('CH' + k, this.sim.waves(this.netIdx(baseNet('ch' + k)))); widths.set('CH' + k, 1); }
      S.UI.download('bench.vcd', S.Eng.vcd(all, widths, { top: 'bench' }), 'text/plain');
    }

    // ---- the view ------------------------------------------------------------------------------------------------
    applyView() {
      const v = this.view, r = this.boardBox.getBoundingClientRect();
      this.svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h);
      // a close-up (zoomed in, or a phone showing part of the board) cuts at its edge on purpose
      const shown = r.width && r.height ? Math.min(r.width / v.w, r.height / v.h) : 1;
      const vw = r.width / shown, vh = r.height / shown, cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      const whole = cx - vw / 2 <= 0.5 && cx + vw / 2 >= W - 0.5 && cy - vh / 2 <= 0.5 && cy + vh / 2 >= H - 0.5;
      if (whole) delete this.svg.dataset.narrow; else this.svg.dataset.narrow = '1';
    }
    /** the whole board; on a narrow screen, the board's full height and its left part (pan for the rest) */
    fit() {
      const r = this.boardBox.getBoundingClientRect();
      if (r.width && r.width < 600) { const w = Math.min(W, H * r.width / r.height); this.view = { x: 0, y: 0, w, h: H }; }
      else this.view = { x: 0, y: 0, w: W, h: H };
      this.applyView();
    }
    zoom(f, cx, cy) {
      const v = this.view;
      const nw = Math.max(160, Math.min(W * 1.5, v.w * f)), nh = nw * H / W;
      cx = cx == null ? v.x + v.w / 2 : cx; cy = cy == null ? v.y + v.h / 2 : cy;
      this.view = { x: cx - (cx - v.x) * nw / v.w, y: cy - (cy - v.y) * nh / v.h, w: nw, h: nh };
      this.applyView();
    }
    toSvg(ev) { const m = this.svg.getScreenCTM().inverse(); const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m); return [p.x, p.y]; }
    /** the endpoint nearest a point of the drawing: a hole, a rail hole or a terminal (within 9 units) */
    endpointAt(x, y) {
      let best = null, bd = 9;
      for (const [k, [tx, ty]] of Object.entries(TERM)) { const d = Math.hypot(tx - x, ty - y); if (d < bd) { bd = d; best = k; } }
      const c = Math.round((x - X0) / P) + 1;
      if (c >= 1 && c <= NCOL) {
        for (const r of ROWS) { const d = Math.hypot(colX(c) - x, ROWY[r] - y); if (d < bd) { bd = d; best = c + r; } }
        if (railHole(c)) for (const [r, ry] of Object.entries(RAILY)) { const d = Math.hypot(colX(c) - x, ry - y); if (d < bd) { bd = d; best = 'R' + r + c; } }
      }
      return best;
    }
    /** where an endpoint is on the screen (for tests) */
    screenOf(key) { const [x, y] = pointOf(key), m = this.svg.getScreenCTM(); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; }
    bindBoard() {
      const svg = this.svg;
      let drag = null;
      svg.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        const [x, y] = this.toSvg(ev);
        const t = ev.target;
        const sw = t.closest && t.closest('.lab-sw'), pb = t.closest && t.closest('.lab-pb');
        const ep = this.endpointAt(x, y);
        if (ep && !(sw || pb) || (ep && TERM[ep] && Math.hypot(TERM[ep][0] - x, TERM[ep][1] - y) < 7)) {
          drag = { kind: 'wire', from: ep, x0: x, y0: y };
          svg.setPointerCapture(ev.pointerId);
          ev.preventDefault();
          return;
        }
        if (sw) { this.toggle(+sw.dataset.sw); return; }
        if (pb) { this.press(+pb.dataset.pb, true); drag = { kind: 'press', i: +pb.dataset.pb }; svg.setPointerCapture(ev.pointerId); return; }
        const chip = t.closest && t.closest('[data-chip]');
        if (chip) { this.sel = { kind: 'chip', id: chip.dataset.chip }; drag = { kind: 'chip', id: chip.dataset.chip, x0: x, moved: 0 }; svg.setPointerCapture(ev.pointerId); this.draw(); return; }
        const jg = t.closest && t.closest('[data-jumper]');
        if (jg) { this.sel = { kind: 'jumper', id: jg.dataset.jumper }; this.draw(); return; }
        if (this.sel) { this.sel = null; this.draw(); }
        drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, v: Object.assign({}, this.view) };
        svg.setPointerCapture(ev.pointerId);
      });
      svg.addEventListener('pointermove', (ev) => {
        if (!drag) return;
        if (drag.kind === 'wire') {
          const [x, y] = this.toSvg(ev), [fx, fy] = pointOf(drag.from);
          const g = svg.querySelector('.lab-ghost');
          g.style.display = ''; g.setAttribute('x1', fx); g.setAttribute('y1', fy); g.setAttribute('x2', x); g.setAttribute('y2', y);
          g.setAttribute('class', 'lab-ghost c-' + this.color);
        } else if (drag.kind === 'chip') {
          const [x] = this.toSvg(ev);
          const d = Math.round((x - drag.x0) / P);
          const g = svg.querySelector('[data-chip="' + drag.id + '"]');
          if (g) g.setAttribute('transform', 'translate(' + d * P + ' 0)');
          drag.moved = d;
        } else if (drag.kind === 'pan') {
          const r = svg.getBoundingClientRect(), s = drag.v.w / r.width;
          this.view = Object.assign({}, drag.v, { x: drag.v.x - (ev.clientX - drag.sx) * s, y: drag.v.y - (ev.clientY - drag.sy) * s });
          this.applyView();
        }
      });
      const end = (ev) => {
        if (!drag) return;
        const d = drag; drag = null;
        if (d.kind === 'wire') {
          svg.querySelector('.lab-ghost').style.display = 'none';
          const [x, y] = this.toSvg(ev), to = this.endpointAt(x, y);
          if (to && to !== d.from) this.addJumper(d.from, to);
        } else if (d.kind === 'press') this.press(d.i, false);
        else if (d.kind === 'chip') {
          if (d.moved) { const ch = this.state.chips.find((c) => c.id === d.id); const t = Object.assign({}, ch, { col: ch.col + d.moved }); if (this.free(t, ch)) this.commit(() => { ch.col += d.moved; }); else { S.UI.toast('The chip cannot go there: something is in the way.', 'err'); this.draw(); } }
          else this.draw();
        }
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
      svg.addEventListener('wheel', (ev) => { ev.preventDefault(); const [x, y] = this.toSvg(ev); this.zoom(ev.deltaY > 0 ? 1.15 : 1 / 1.15, x, y); }, { passive: false });
    }
    onKey(e, typing) {
      if (typing) return false;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) this.doRedo(); else this.doUndo(); return true; }
      if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); this.doRedo(); return true; }
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.save(); return true; }
      if (mod || e.altKey) return false;
      if (e.key === 'Delete' || e.key === 'Backspace') { if (this.sel) { e.preventDefault(); this.deleteSel(); return true; } return false; }
      if (e.key === 'Escape' && this.sel) { this.sel = null; this.draw(); return true; }
      if (/^[0-7]$/.test(e.key)) { e.preventDefault(); this.toggle(+e.key); return true; }
      if (e.key === '+' || e.key === '=') { this.zoom(1 / 1.3); return true; }
      if (e.key === '-') { this.zoom(1.3); return true; }
      if (e.key === 'f' || e.key === 'F') { this.fit(); return true; }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && this.sel && this.sel.kind === 'chip') { e.preventDefault(); this.moveChip(this.sel.id, e.key === 'ArrowLeft' ? -1 : 1); return true; }
      return false;
    }
    save() { S.UI.download('bench.json', JSON.stringify(Object.assign({ kind: 'sirkit-bench' }, this.snapshot()), null, 1), 'application/json'); }
    async open() {
      const [f] = await S.UI.pickFiles('.json,application/json');
      if (!f) return;
      try {
        const st = this.normal(JSON.parse(await f.text()));
        if (!st) throw new Error('This file is not a Sirkit bench.');
        this.undo.push(JSON.stringify(this.state)); this.redo = [];
        this.state = st; this.sel = null; this.rebuild(); this.fit();
        S.UI.toast('Opened ' + f.name + '.', 'ok');
      } catch (e) { S.UI.toast(e.message || 'That file could not be read.', 'err'); }
    }
    dispose() { this.dead = true; cancelAnimationFrame(this.raf); if (this.ro) this.ro.disconnect(); if (this.wv && this.wv.dispose) this.wv.dispose(); if (Lab.page === this) Lab.page = null; }
  }
  Lab.Bench = Bench;
  Lab.SAMPLES = SAMPLES;
  Lab.chipHoles = chipHoles;

  /** the simulator for a bench: Sirkit.Sim when it is loaded and powers the bench, else the bench's own */
  function LabSimEngine(spec, opts) {
    const eng = S.LabSim.onEngine(spec, opts);
    if (eng) {
      try { eng.run(0); if (spec.vcc >= 0 && !spec.short && eng.value(spec.vcc) !== '1') throw new Error('no supply'); return eng; } catch (e) { /* use our own */ }
    }
    return new S.LabSim.BenchSim(spec, opts);
  }

  S.Pages.register('lab', {
    title: 'Lab bench', nav: 'lab',
    open(app, main) { return new Bench(app, main); },
    load(data) { const st = Bench.prototype.normal(data); if (st) store.set('lab', st); },
  });

  const wait = (expr) => `await new Promise((r, j) => { let n = 0; const w = () => (${expr}) ? r() : ++n > 300 ? j(new Error('timed out')) : setTimeout(w, 30); w(); });`;
  S.Checks.push(
    { group: 'lab', name: 'lab bench, empty', hash: 'lab', setup: wait('Sirkit.Lab.page') + ' Sirkit.Lab.page.loadSample(null);', ready: 'Sirkit.Lab.page && !!document.querySelector(".lab-svg .lab-hole")', sel: '#main' },
    { group: 'lab', name: 'lab bench, parity experiment', hash: 'lab', setup: wait('Sirkit.Lab.page') + ' Sirkit.Lab.page.loadSample("parity"); Sirkit.Lab.page.toggle(0); Sirkit.UI.closeAllModals();', ready: 'Sirkit.Lab.page && !!document.querySelector(".lab-ic")', sel: '#main' },
    { group: 'lab', name: 'lab bench, counter on the analyser', hash: 'lab', setup: wait('Sirkit.Lab.page') + ' Sirkit.Lab.page.loadSample("counter"); Sirkit.Lab.page.toggle(0); await new Promise((r) => setTimeout(r, 2500)); Sirkit.Lab.page.updateAnalyser(true);', ready: 'Sirkit.Lab.page && Sirkit.Lab.page.channels().length === 5', sel: '#main' },
    { group: 'lab', name: 'lab bench, mistakes', hash: 'lab', setup: wait('Sirkit.Lab.page') + ' Sirkit.Lab.page.loadSample("mistakes");', ready: 'Sirkit.Lab.page && document.querySelectorAll("#labSees li").length > 1', sel: '#main' },
  );
})(globalThis.Sirkit = globalThis.Sirkit || {});
