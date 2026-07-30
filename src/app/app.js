// The Sirkit app: the top bar, routing between the home page, the topics, Learn, Courses, the workbench (the
// circuit editor, the function workbench and the state-machine workbench), Verilog and the lab bench, the
// layout gallery (#demo), settings, About, keyboard shortcuts and share links. Pages register themselves with
// S.Pages (ui.js); this file only frames them.
(function (S) {
  'use strict';
  const { h, icon } = S.UI;
  const store = S.UI.storage;
  const TITLE = 'Sirkit: digital design you can build, run and see inside';
  const NAV = [['topics', 'Topics', 'library'], ['learn', 'Learn', 'learn'], ['courses', 'Courses', 'route'], ['build', 'Workbench', 'gate'], ['verilog', 'Verilog', 'code'], ['lab', 'Lab', 'bench']];
  // other names a link may use for a page
  const ALIAS = { topic: 'topics', part: 'topics', lesson: 'learn', exercise: 'learn', tour: 'learn', course: 'courses', circuit: 'build', function: 'func', machine: 'fsm' };
  const PARTS = [
    ['Numbers and codes', 'Bases, complements, signed numbers, BCD, Gray and error-detecting codes.'],
    ['Boolean algebra and gates', 'Axioms and theorems, duality, canonical forms, gate symbols in both styles.'],
    ['Minimisation', 'K-maps up to six variables, Quine–McCluskey, costs, NAND/NOR, XOR and hazards.'],
    ['Combinational logic', 'Analysis and design, adders and lookahead, comparators, decoders, multiplexers, buses.'],
    ['Storage', 'Latches and flip-flops, timing, setup and hold, metastability.'],
    ['State machines', 'Mealy and Moore, reduction, assignment, design with D, JK and T.'],
    ['Registers and counters', 'Shift registers, ripple and synchronous counters, ring and Johnson counters.'],
    ['Memory and programmable logic', 'RAM and ROM, Hamming codes, PLA, PAL and a tiny FPGA.'],
    ['Register-transfer design', 'ASM charts, datapath and controller, three ways to build control.'],
    ['Asynchronous circuits', 'Flow tables, races, race-free assignment, hazards.'],
    ['Digital integrated circuits', 'Noise margins, fan-out, TTL and CMOS, switch-level gates.'],
    ['Verilog', 'Structural, dataflow and behavioural models, testbenches, synthesis.'],
    ['A small processor', 'An instruction set, a datapath, a controller and programs that run on the gates.'],
    ['Lab bench', 'A breadboard with 74-series chips, a clock, LEDs and a logic analyser.'],
  ];

  class App {
    constructor() {
      S.app = this;
      this.settings = Object.assign({ theme: 'auto', projector: false, style: 'shape', tech: 'CMOS', floatHigh: null, animate: true, autosave: true, radix: 'hex', grid: true, powerUp: '0' }, store.get('settings', {}));
      // the gallery's own switch (kept for its checker)
      if (store.get('style', null)) this.settings.style = store.get('style', 'shape');
      this.applyTheme();
      try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (this.settings.theme === 'auto') this.applyTheme(); }); } catch (e) { /* old browsers */ }
      this.buildTop();
      window.addEventListener('hashchange', () => this.route());
      document.addEventListener('keydown', (e) => this.onKey(e));
      this.route();
    }
    saveSettings() { store.set('settings', this.settings); }
    get theme() { return document.documentElement.dataset.theme; }
    applyTheme() {
      let t = this.settings.theme;
      if (t === 'auto') { try { t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { t = 'light'; } }
      document.documentElement.dataset.theme = t;
      document.documentElement.dataset.projector = this.settings.projector ? 'on' : 'off';
      document.documentElement.dataset.symbols = this.settings.style;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', t === 'dark' ? '#161a2d' : '#ffffff');
      if (this.btnTheme) { this.btnTheme.innerHTML = ''; this.btnTheme.appendChild(icon(t === 'dark' ? 'sun' : 'moon')); }
      if (this.btnProj) { this.btnProj.classList.toggle('on', !!this.settings.projector); this.btnProj.setAttribute('aria-pressed', String(!!this.settings.projector)); }
    }
    setTheme(t) { this.settings.theme = t; this.saveSettings(); this.applyTheme(); this.redraw(); }
    toggleTheme() { this.setTheme(this.theme === 'dark' ? 'light' : 'dark'); }
    setProjector(on) { this.settings.projector = on; this.saveSettings(); this.applyTheme(); this.redraw(); }
    setStyle(s) { this.settings.style = s; store.set('style', s); this.saveSettings(); this.applyTheme(); this.redraw(); }
    redraw() {
      if (this.page && this.page.redraw) this.page.redraw();
      if (this.cards && location.hash.startsWith('#demo')) for (const c of this.cards) if (this.layouts.has(c.d.id)) this.drawCard(c);
    }

    // ---- the frame of the page -------------------------------------------------------------------------
    buildTop() {
      const menu = document.getElementById('btnMenu');
      menu.appendChild(icon('menu'));
      menu.setAttribute('aria-expanded', 'false');
      menu.addEventListener('click', () => { const on = document.getElementById('app').classList.toggle('menu-open'); menu.setAttribute('aria-expanded', String(on)); });
      document.getElementById('brand').addEventListener('click', (e) => { e.preventDefault(); location.hash = ''; });
      const nav = document.getElementById('topNav');
      for (const [id, label, ic] of NAV) {
        const b = h('button', { type: 'button', dataset: { route: id }, title: label }, icon(ic), h('span', label));
        b.addEventListener('click', () => { document.getElementById('app').classList.remove('menu-open'); location.hash = id; });
        nav.appendChild(b);
      }
      const tools = document.getElementById('topTools');
      this.btnProj = h('button.icon-btn', { type: 'button', title: 'Projector mode: large type and strong lines for a classroom (Shift+P)', 'aria-label': 'Projector mode', id: 'btnProjector' }, icon('screen'));
      this.btnProj.addEventListener('click', () => this.setProjector(!this.settings.projector));
      this.btnTheme = h('button.icon-btn', { type: 'button', title: 'Light or dark (T)', 'aria-label': 'Light or dark', id: 'btnTheme' });
      this.btnTheme.addEventListener('click', () => this.toggleTheme());
      const about = h('button.icon-btn', { type: 'button', title: 'Help, settings and About', 'aria-label': 'Help and About', id: 'btnAbout' }, icon('help'));
      about.addEventListener('click', () => this.aboutMenu(about));
      tools.append(this.btnProj, this.btnTheme, about);
      this.applyTheme();
    }
    aboutMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      S.UI.showMenu([
        { label: 'Keyboard shortcuts', sc: '?', action: () => this.shortcuts() },
        { label: 'Settings…', action: () => this.settingsDialog() },
        { label: 'The layout gallery', action: () => { location.hash = 'demo'; } },
        { sep: true },
        { label: 'About Sirkit', action: () => this.about() },
        { label: 'About the author', action: () => S.authorDialog && S.authorDialog() },
      ], r.right - 220, r.bottom + 4, { anchor, keyboard: true });
    }

    /** the page a hash names: [page id, the rest] */
    pageOf(hash) {
      const m = /^([a-z]+)(?:[=/?](.*))?$/i.exec(hash);
      if (!m) return [null, ''];
      const id = ALIAS[m[1]] || m[1];
      return [id, hash];
    }
    route() {
      let hash = '';
      try { hash = decodeURIComponent(location.hash.replace(/^#\/?/, '')); } catch (e) { hash = location.hash.replace(/^#\/?/, ''); }
      window.__sirkitReady = false;
      const appEl = document.getElementById('app');
      appEl.classList.remove('menu-open');
      if (this.page && this.page.dispose) try { this.page.dispose(); } catch (e) { /* gone */ }
      this.page = null; this.cards = null;
      if (this.hero) { this.hero.stop(); this.hero = null; }
      const main = document.getElementById('main');
      main.innerHTML = '';
      main.scrollTop = 0;
      document.title = TITLE;
      if (hash.startsWith('share=')) { this.openShared(hash.slice(6)); return; }
      if (hash === 'demo' || hash.startsWith('demo=')) { this.setNav(null, true); this.gallery(hash.slice(5)); return; }
      const [id, rest] = this.pageOf(hash);
      const pg = id && S.Pages.get(id);
      if (pg) {
        this.setNav(pg.nav || id, !pg.side);
        try { this.page = pg.open(this, main, rest) || {}; }
        catch (e) { main.innerHTML = ''; main.appendChild(S.UI.empty('warn', 'This page could not open', String(e.message || e))); if (typeof console !== 'undefined') console.error(e); }
        if (pg.title) document.title = pg.title + ' · Sirkit';
        if (!this.page || !this.page.async) window.__sirkitReady = true;
        return;
      }
      this.setNav('', true);
      this.renderHome(main, hash ? 'There is no page called "' + hash + '". It may have been renamed: start from here.' : null);
      window.__sirkitReady = true;
    }
    setNav(navOf, noSide) {
      for (const b of document.querySelectorAll('#topNav button')) { const on = b.dataset.route === navOf; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
      document.getElementById('app').classList.toggle('no-side', !!noSide);
    }

    /** the tabs of the workbench, shared by the circuit editor and the two workbenches */
    workTabs(active, extra) {
      const tabs = [['build', 'Circuit', 'gate'], ['func', 'Function', 'fn'], ['fsm', 'State machine', 'fsm']];
      return h('div.work-tabs', { role: 'tablist', 'aria-label': 'Workbench' },
        ...tabs.map(([id, label, ic]) => { const b = h('button' + (id === active ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(id === active), id: 'wt-' + id }, icon(ic), h('span', label)); b.addEventListener('click', () => { location.hash = id; }); return b; }),
        extra || null);
    }

    // ---- home --------------------------------------------------------------------------------------------
    renderHome(main, notice) {
      const box = h('div.home');
      if (notice) box.appendChild(h('div.notice', icon('info'), h('span', notice)));
      const art = h('div.hero-art.sk-hero', { id: 'heroArt' });
      const start = h('button.btn.primary', { type: 'button', id: 'btnStart' }, icon('gate'), 'Build a circuit');
      start.addEventListener('click', () => { location.hash = 'build'; });
      const learn = h('button.btn', { type: 'button', id: 'btnToLearn' }, icon('learn'), 'Start learning');
      learn.addEventListener('click', () => { location.hash = 'learn'; });
      box.appendChild(h('section.hero',
        h('div.hero-text', h('h1', 'Digital design you can build, run and see inside.'),
          h('p.lead', 'Wires carry 0, 1, X and Z and change colour as they switch. Gates take their time, so glitches and setup violations really happen, on the circuit and on the waveform. Every K-map group, algebra step and state-machine stage is something you do and the tool checks.'),
          h('div.cta', start, learn),
          h('p.hero-stats', 'Draw it, write it in ', h('b', 'Verilog'), ', or derive it from a ', h('b', 'truth table'), ' or a ', h('b', 'state diagram'), ': all three run on one simulator.')),
        h('div.hero-show', art, h('div.hero-cap', { id: 'heroCap', 'aria-live': 'off' }))));
      const tool = (id, ic, title, text, hash) => { const b = h('button.tool-card', { type: 'button', id }, h('span.tc-icon', icon(ic)), h('span.tc-text', h('b', title), h('span', text))); b.addEventListener('click', () => { location.hash = hash; }); return b; };
      box.appendChild(h('section.home-tools',
        tool('toBuild', 'gate', 'Circuit editor', 'Drag parts, wire them, double-click to edit, and simulate with a waveform.', 'build'),
        tool('toFunc', 'fn', 'Function workbench', 'Truth table, K-map, QM, algebra proofs and the circuit, all in step.', 'func'),
        tool('toFsm', 'fsm', 'State machines', 'Draw a Mealy or Moore machine and take it to a circuit, every stage checked.', 'fsm'),
        tool('toVerilog', 'code', 'Verilog', 'Write modules and testbenches, run them, and see them drawn as circuits.', 'verilog'),
        tool('toLab', 'bench', 'Lab bench', 'A breadboard with 74-series chips, switches, LEDs and a logic analyser.', 'lab'),
        tool('toTopics', 'library', 'Topics', 'The course, part by part, with pictures that run.', 'topics')));
      PARTS.forEach(([title, blurb], i) => {
        box.appendChild(h('section.part', { id: 'part-' + (i + 1) }, h('div.part-head', h('span.num', String(i + 1)), h('h2', title)), h('p.part-blurb', blurb)));
      });
      main.appendChild(box);
      requestAnimationFrame(() => { if (art.isConnected) this.hero = this.heroDemo(art); });
    }

    /**
     * The picture on the home page: a full adder drawn by the layout engine, its inputs counting through all
     * eight rows, every wire coloured by its value as the simulator settles it.
     */
    heroDemo(el) {
      const d = S.Demo && S.Demo.byId('fa');
      if (!d) return { stop() {} };
      let c, res, sim;
      try { c = d.build(); res = S.Layout.layout(c); } catch (e) { return { stop() {} }; }
      el.innerHTML = S.Render.svg(res, { style: this.settings.style, textScale: 1.15 });
      const svg = el.querySelector('svg');
      svg.classList.add('live');
      const cap = document.getElementById('heroCap');
      try { sim = S.Eng.createSim(c, { tech: 'CMOS' }); } catch (e) { return { stop() {} }; }
      const netName = new Map(c.nets.map((n) => [n.id, n.name || n.id]));
      const paint = () => {
        for (const p of svg.querySelectorAll('path[data-net]')) {
          const v = S.Eng.bits(sim.get(netName.get(p.dataset.net)), 1);
          p.classList.remove('v0', 'v1', 'vx', 'vz'); p.classList.add('v' + v);
        }
      };
      let k = 0, timer = null, stopped = false;
      const still = S.UI.reducedMotion();
      const step = () => {
        if (stopped || !el.isConnected) return;
        const a = (k >> 2) & 1, b = (k >> 1) & 1, ci = k & 1;
        try { sim.set('A', a); sim.set('B', b); sim.set('Cin', ci); sim.run(60); } catch (e) { /* a missing input */ }
        paint();
        const s = S.Eng.bits(sim.get('S'), 1), co = S.Eng.bits(sim.get('Cout'), 1);
        if (cap) { cap.innerHTML = ''; cap.append(h('b', 'A full adder'), ', inputs A = ' + a + ', B = ' + b + ', Cin = ' + ci + ': the sum S is ' + s + ' and the carry Cout is ' + co + '. Bright wires carry 1.'); }
        k = (k + 1) % 8;
        if (!still) timer = setTimeout(step, 1500);
      };
      step();
      return { stop() { stopped = true; clearTimeout(timer); } };
    }

    // ---- the layout gallery (phase one, kept as #demo) ----------------------------------------------------------
    layoutOf(d) {
      this.layouts = this.layouts || new Map();
      if (!this.layouts.has(d.id)) {
        const t0 = performance.now();
        const res = S.Layout.layout(d.build());
        res.ms = performance.now() - t0;
        this.layouts.set(d.id, res);
      }
      return this.layouts.get(d.id);
    }
    gallery(only) {
      const m = document.getElementById('main');
      const list = S.Demo.list().filter((d) => !only || only.split(',').includes(d.id));
      const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
      m.innerHTML = '';
      const head = el('div', 'gallery-head', '<h1>Layout engine: generated circuits</h1>');
      const sum = el('span', 'sum', 'Laying out ' + list.length + ' circuits…');
      const sw = h('button.btn.small', { type: 'button', id: 'btnSymbols' }, this.settings.style === 'rect' ? 'Distinctive symbols' : 'Rectangular symbols');
      sw.addEventListener('click', () => { this.setStyle(this.settings.style === 'rect' ? 'shape' : 'rect'); sw.textContent = this.settings.style === 'rect' ? 'Distinctive symbols' : 'Rectangular symbols'; });
      head.append(sum, sw); m.append(head);
      let group = null, box = null;
      const cards = [];
      for (const d of list) {
        if (d.group !== group) { group = d.group; m.append(el('h2', 'group-title', group)); box = el('div', 'gallery'); m.append(box); }
        const card = el('section', 'card');
        card.dataset.id = d.id;
        card.append(el('h3', '', d.title), el('div', 'sk-wrap'), el('p', 'meta', '…'));
        box.append(card);
        cards.push({ d, card });
      }
      this.cards = cards;
      let i = 0, total = 0;
      const next = () => {
        if (this.cards !== cards) return;
        if (i >= cards.length) { sum.textContent = cards.length + ' circuits, ' + total + ' wire crossings in all'; window.__sirkitReady = true; return; }
        const c = cards[i++];
        this.drawCard(c);
        total += this.layoutOf(c.d).crossingCount;
        setTimeout(next, 0);
      };
      next();
    }
    drawCard(c) {
      const res = this.layoutOf(c.d);
      // shown at natural size: a touch larger text brings pin names up to 11px
      const wrap = c.card.querySelector('.sk-wrap');
      wrap.innerHTML = S.Render.svg(res, { style: this.settings.style, textScale: 1.1 });
      S.UI.scrollRow(wrap);
      const meta = c.card.querySelector('.meta');
      const over = res.crossingCount > c.d.maxCross;
      meta.className = 'meta' + (over ? ' over' : '');
      meta.textContent = res.crossingCount + (res.crossingCount === 1 ? ' crossing' : ' crossings') + ' (at most ' + c.d.maxCross + ')' + (res.railCrossings ? ', and ' + res.railCrossings + ' over rails' : '') + (res.style && res.style !== 'columns' ? ' · ' + res.style : '') + (wrap.scrollWidth > wrap.clientWidth + 1 ? ' · wider than the page: scroll sideways →' : '');
    }

    // ---- share links -------------------------------------------------------------------------------------
    /** copy a link that opens this design: kind is the page that opens it (build, func, fsm, verilog, lab) */
    async share(kind, data) {
      const code = await S.Share.pack({ kind, data });
      const url = location.href.replace(/#.*$/, '') + '#share=' + code;
      S.Share.copy(url, url.length > 6000 ? 'Copied. The link is long (' + Math.round(url.length / 1000) + ' KB): some apps cut long links, so a saved file is safer.' : 'Link copied: whoever opens it gets this design.');
      return url;
    }
    async openShared(code) {
      try {
        const { kind, data } = await S.Share.unpack(code);
        const pg = S.Pages.get(kind);
        if (!pg || !pg.load) throw new Error('This link is for a part of Sirkit this version does not have.');
        pg.load(data);
        history.replaceState(null, '', '#' + kind);
        this.route();
        S.UI.toast('Opened the shared ' + ({ build: 'circuit', func: 'function', fsm: 'state machine', verilog: 'Verilog', lab: 'breadboard' }[kind] || 'design') + '.', 'ok');
      } catch (e) {
        history.replaceState(null, '', '#');
        this.route();
        S.UI.toast(e.message, 'err', 5000);
      }
    }

    // ---- keyboard -----------------------------------------------------------------------------------------
    onKey(e) {
      if (S.UI.anyModalOpen()) return;
      if (e.key === 'Escape' && document.getElementById('app').classList.contains('menu-open')) { document.getElementById('app').classList.remove('menu-open'); return; }
      const tag = (e.target && e.target.tagName) || '';
      const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
      if (this.page && this.page.onKey && this.page.onKey(e, typing)) return;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((tag === 'BUTTON' || tag === 'A') && (e.key === ' ' || e.key === 'Enter')) return;
      const k = e.key;
      if (k === '?') { e.preventDefault(); this.shortcuts(); }
      else if (k === 'P' && e.shiftKey) { e.preventDefault(); this.setProjector(!this.settings.projector); }
      else if (k === 't' || k === 'T') { e.preventDefault(); this.toggleTheme(); }
    }
    shortcuts() {
      const groups = [
        ['Editing a circuit', [['Drag', 'Place a part from the palette, move parts'], ['Pin to pin', 'Draw a wire (from a wire: a branch)'], ['Double-click', 'Edit a part (a block: open it)'], ['R  M', 'Turn a quarter, mirror'], ['Del', 'Delete what is selected'], ['Ctrl  C  V  D', 'Copy, paste, duplicate'], ['Ctrl  Z  Y', 'Undo, redo'], ['Ctrl  A', 'Select everything'], ['B', 'Make a block of the selection'], ['L', 'Label the selected wire']]],
        ['Looking', [['Wheel  pinch', 'Zoom'], ['Space drag', 'Pan (or drag empty canvas)'], ['+  −', 'Zoom in, out'], ['F  0', 'Fit the circuit to the canvas'], ['Arrows', 'Nudge the selection']]],
        ['Simulating', [['Enter', 'Run or pause'], ['.', 'One event'], ['E', 'To the next clock edge'], ['Backspace', 'Rewind to the start'], ['W', 'Probe the selected wire']]],
        ['Everywhere', [['T', 'Light or dark'], ['Shift  P', 'Projector mode'], ['Ctrl  S', 'Save to a file'], ['Esc', 'Close a dialog, drop the selection'], ['?', 'This list']]],
      ];
      const pg = this.page && this.page.keys;
      if (pg) groups.unshift(...pg);
      const body = h('div.keys', ...groups.map(([title, rows]) => h('section', h('h4', title), h('table', ...rows.map(([k, v]) => h('tr', h('td', ...k.split('  ').map((x, i) => [i ? ' ' : '', h('kbd', x)])), h('td', v)))))));
      S.UI.modal({ title: 'Keyboard shortcuts', body, wide: true, cls: 'keys-modal', buttons: [{ label: 'OK', value: true, primary: true }], enterValue: true });
    }
    settingsDialog() {
      const s = this.settings;
      const row = (title, sub, ctl) => h('div.settings-row', h('div.what', h('b', title), h('span', sub)), ctl);
      const chk = (key, after) => { const c = h('input', { type: 'checkbox', checked: !!s[key], id: 'set-' + key }); c.addEventListener('change', () => { s[key] = c.checked; this.saveSettings(); this.applyTheme(); if (after) after(); }); return c; };
      const sel = (key, opts, after) => { const c = h('select', { id: 'set-' + key, 'aria-label': key }, ...opts.map(([v, l]) => h('option', { value: v, selected: String(s[key]) === String(v) }, l))); c.addEventListener('change', () => { s[key] = c.value; this.saveSettings(); this.applyTheme(); if (after) after(); }); return c; };
      const techs = S.Eng.techNames().map((n) => [n, (S.Eng.techPresets()[n] && S.Eng.techPresets()[n].label) || n]);
      const fl = h('select', { id: 'set-floatHigh', 'aria-label': 'Floating inputs' }, ...[['', 'As the technology does'], ['1', 'Read 1 (like TTL)'], ['0', 'Read Z, then X (like CMOS)']].map(([v, l]) => h('option', { value: v, selected: (s.floatHigh == null ? '' : s.floatHigh ? '1' : '0') === v }, l)));
      fl.addEventListener('change', () => { s.floatHigh = fl.value === '' ? null : fl.value === '1'; this.saveSettings(); this.redraw(); });
      S.UI.modal({ title: 'Settings', wide: true, body: h('div',
        row('Theme', 'Light, dark, or whatever the system uses', sel('theme', [['auto', 'Like the system'], ['light', 'Light'], ['dark', 'Dark']])),
        row('Gate symbols', 'Distinctive shapes, or the rectangular style with &, ≥1 and =1', sel('style', [['shape', 'Distinctive'], ['rect', 'Rectangular']], () => this.setStyle(s.style))),
        row('Technology', 'Delays and timing of new simulations; each part can override them', sel('tech', techs, () => this.redraw())),
        row('Floating inputs', 'What an input that nothing drives reads', fl),
        row('Flip-flops start at', 'What storage holds when the power comes on', sel('powerUp', [['0', '0'], ['X', 'X (unknown, as in real hardware)'], ['random', 'Random 0 or 1']], () => this.redraw())),
        row('Animate wires', 'Wires flash as their value changes', chk('animate')),
        row('Keep my work', 'Save the workbench in this browser as I go', chk('autosave')),
        row('Projector mode', 'Large type and strong lines for a classroom (Shift+P)', chk('projector', () => this.setProjector(s.projector))),
        h('p.muted.engines', 'Engines: ' + S.Eng.status().map((x) => x.name + (x.live ? '' : ' (stand-in)')).join(', ') + '.')),
      buttons: [{ label: 'Close', value: true, primary: true }] });
    }
    about() {
      const more = h('a', { href: '#' }, 'About the author');
      more.addEventListener('click', (e) => { e.preventDefault(); S.UI.closeAllModals(); setTimeout(() => S.authorDialog && S.authorDialog(), 50); });
      S.UI.modal({
        title: 'About Sirkit',
        body: h('div', h('p', h('b', 'Sirkit'), ' @@VERSION@@ is digital design you can build, run and see inside: Boolean algebra and minimisation, combinational and sequential circuits, state machines, Verilog, a small processor and a lab bench of 74-series chips. Wires carry 0, 1, X and Z, gates have delays, and every algebra step, K-map group and design stage is checked as you make it. Every example, circuit and exercise in it was made for Sirkit.'),
          h('p', 'It runs entirely in your browser from one file: no server, no account, nothing sent anywhere. What you build is kept in this browser and can be saved as a file or shared as a link.'),
          h('p', 'Its sister tool ', h('a', { href: 'https://tooring.jyotiprakash.org', target: '_blank', rel: 'noopener' }, 'Tooring'), ' does the same for the theory of computation.'),
          h('p', 'Free software under the GNU General Public License, version 3 or later. Every copy and every derived work must keep this attribution: Based on Sirkit by Jyotiprakash Mishra (https://sirkit.jyotiprakash.org).'),
          h('p', 'Copyright © 2026 Jyotiprakash Mishra. The name Sirkit is not licensed for derived works.'), h('p', more)),
        buttons: [{ label: 'OK', value: true, primary: true }],
      });
    }
  }

  S.App = App;
  if (typeof document !== 'undefined' && document.getElementById && document.getElementById('app')) {
    const start = () => { try { new App(); } catch (e) { document.body.innerHTML = '<pre style="padding:20px;white-space:pre-wrap">Sirkit could not start: ' + String(e.stack || e.message).replace(/</g, '&lt;') + '</pre>'; throw e; } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
