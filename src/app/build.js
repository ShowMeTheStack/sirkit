// The workbench's circuit editor page (#build): the palette, the canvas, the problems list and the selection,
// the simulation controls (run, pause, one event, one clock edge, rewind, speed, the time), the technology, the
// waveform viewer docked under the canvas, files (.json circuits, SVG and PNG pictures, VCD), samples, share
// links and autosave. Sirkit.Build is what other pages use to hand it a circuit.
(function (S) {
  'use strict';
  const { h, icon } = S.UI;
  const D = new Proxy({}, { get: (_, k) => S.Doc[k] }); // model.js loads after this file
  const store = S.UI.storage;
  const SPEEDS = [[5, 'Slow (5 ns a second)'], [25, '25 ns a second'], [100, '100 ns a second'], [500, '500 ns a second'], [2500, 'Fast (2.5 µs a second)']];

  // ---- samples: every one our own ----------------------------------------------------------------------------
  const G = (c, type, ...ins) => { const g = c.gate(type, ins.length); ins.forEach((s, i) => c.connect(s, g.pin('i' + i))); return g.pin('y'); };
  const SAMPLES = [
    { id: 'fa', title: 'Full adder (gates)', demo: 'fa' },
    { id: 'hazard', title: 'A static-1 hazard: F = AB + A′C', build() {
      const c = new S.Netlist.Circuit('hazard');
      const a = c.input('A').pin('y'), b = c.input('B').pin('y'), ci = c.input('C').pin('y');
      const na = G(c, 'NOT', a);
      c.connect(G(c, 'OR', G(c, 'AND', a, b), G(c, 'AND', na, ci)), c.output('F'));
      return c;
    }, inputs: { B: 1, C: 1 }, probes: ['A', 'F'], note: 'Set B and C to 1, then flip A: F should stay 1, but the inverter delays one path, and F drops for a moment. Watch the glitch mark on the waveform.' },
    { id: 'rca4', title: '4-bit ripple-carry adder', demo: 'rca4' },
    { id: 'mux41', title: '4:1 multiplexer (gates)', demo: 'mux41' },
    { id: 'srnor', title: 'SR latch from NOR gates', demo: 'srnor' },
    { id: 'dlatch', title: 'Gated D latch', demo: 'dlatch' },
    { id: 'sync4', title: 'Synchronous 4-bit counter (T flip-flops)', demo: 'sync4', probes: ['CLK'], inputs: { EN: 1 } },
    { id: 'ripple4', title: 'Ripple counter (watch the delay)', demo: 'ripple4', probes: ['CLK'] },
    { id: 'mod6', title: 'Mod-6 counter (D flip-flops)', demo: 'mod6', probes: ['CLK'] },
    { id: 'johnson4', title: 'Johnson counter', demo: 'johnson4', probes: ['CLK'] },
    { id: 'mealy', title: 'A Mealy sequence detector', demo: 'mealy' },
    { id: 'counter', title: 'A counter part on a hex display', build() {
      const c = new S.Netlist.Circuit('counter');
      const k = c.clock('CLK'), clr = c.input('CLR');
      const ctr = c.add('COUNTER', { w: 4, clr: true }, 'ctr1');
      c.connect(k.pin('y'), ctr.pin('clk'));
      c.connect(clr.pin('y'), ctr.pin('clr'));
      const q = c.connect(ctr.pin('q'), c.output('Q', 4));
      c.name(ctr.pin('q'), 'Q', false);
      const hx = D.addPart(c, 'HEX', {}, 'hex1'), hp = hx.pins.find((x) => x.dir === 'in').name;
      q.pins.push({ part: hx, pin: hp }); hx.net[hp] = q;
      return c;
    }, probes: ['CLK', 'Q'], note: 'The counter starts from the power-up state in Settings (0, unless you choose X). Each rising edge of CLK counts one more, shown on the hex digit; CLR clears it.' },
  ];
  function sampleDoc(s) {
    let c;
    if (s.demo) { const d = S.Demo && S.Demo.byId(s.demo); if (!d) return null; c = d.build(); } else c = s.build();
    c.title = s.title;
    const doc = D.fromCircuit(c, { title: s.title });
    if (s.note) { const right = Math.max(...doc.parts.map((p) => p.x + D.geom(p, doc).w)); doc.notes.push({ id: 'note1', x: right + 4, y: Math.min(...doc.parts.map((p) => p.y)), text: wrap(s.note, 34) }); }
    doc.sample = s.id;
    doc.routeSig = D.sig(doc);
    return doc;
  }
  const wrap = (t, n) => { const out = []; let line = ''; for (const w of t.split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line.trim()); line = w; } else line += ' ' + w; } if (line.trim()) out.push(line.trim()); return out.join('\n'); };

  class BuildPage {
    constructor(app, main, rest) {
      this.app = app;
      this.inputs = new Map(store.get('build.inputs', []));
      this.probeWires = new Set(store.get('build.probes', []));
      this.speed = store.get('build.speed', 100);
      this.running = false;
      main.classList.add('main-build');
      const root = this.root = h('div.build', { id: 'build' });
      this.crumbs = h('div.bd-crumbs');
      root.appendChild(app.workTabs('build', this.crumbs));
      this.bar = this.toolbar();
      root.appendChild(this.bar);
      this.palHost = h('aside.bd-pal', { 'aria-label': 'Parts' });
      this.canvasHost = h('div.bd-canvas');
      this.waveHost = h('div.bd-wave');
      this.split = h('div.bd-split', { role: 'separator', 'aria-orientation': 'horizontal', title: 'Drag to give the waveform more or less room' });
      this.side = h('aside.bd-side', { 'aria-label': 'Problems and selection' });
      const center = h('div.bd-center', this.canvasHost, this.split, this.waveHost);
      this.mainEl = h('div.bd-main', this.palHost, center, this.side);
      root.appendChild(this.mainEl);
      const scrim = h('div.bd-scrim');
      scrim.addEventListener('click', () => this.drawer(false));
      root.appendChild(scrim);
      main.appendChild(root);
      // the document: what the page was handed, else what was being worked on, else a first sample
      let doc = BuildPage.pending || null;
      BuildPage.pending = null;
      if (!doc) doc = store.get('build', null);
      let first = false;
      if (!doc || !doc.parts) { doc = sampleDoc(SAMPLES[0]) || D.blank('untitled'); first = true; }
      this.editor = new S.Editor(this.canvasHost, {
        doc,
        onChange: (d, why) => this.changed(why),
        onSelect: () => this.renderSide(),
        onEdit: (dp) => S.ParamDialog(this.editor, dp),
        onToggle: (dp, down) => this.toggle(dp, down),
        onProbe: (wid) => this.probe(wid),
        onDropWire: (wid, x, y) => { const el = document.elementFromPoint(x, y); if (el && el.closest('.bd-wave') && !this.probeWires.has(wid)) this.probe(wid); },
        onWire: () => {},
      });
      if (first) for (const n of ['A', 'B', 'Cin']) this.probeWires.add(this.wireOfPort(n));
      this.palette = new S.Palette(this.palHost, { editor: () => this.editor, onPlace: () => { if (matchMedia('(max-width: 820px)').matches) this.drawer(false); } });
      this.wave = new S.Wave(this.waveHost, { onChange: (names) => this.waveChanged(names) });
      const hgt = store.get('build.waveH', 230);
      this.waveHost.style.height = hgt + 'px';
      S.UI.splitter(this.split, (e) => { const r = center.getBoundingClientRect(); const hh = Math.max(90, Math.min(r.height - 160, r.bottom - e.clientY)); this.waveHost.style.height = hh + 'px'; this.wave.render(); }, () => store.set('build.waveH', parseInt(this.waveHost.style.height, 10)));
      this.restartSim();
      this.renderSide();
      this.updateBar();
      S.Build.page = this;
    }
    dispose() { this.pause(); this.editor.dispose(); this.wave.dispose(); if (S.Build.page === this) S.Build.page = null; document.getElementById('main').classList.remove('main-build'); }
    redraw() {
      const st = this.app.settings, sig = [st.tech, st.floatHigh, st.powerUp].join('|');
      if (this._simSig && sig !== this._simSig) this.restartSim();
      this.editor.render(); this.palette.render(); this.wave.render();
    }

    // ---- the toolbar ----------------------------------------------------------------------------------------
    toolbar() {
      const bar = h('div.bd-bar', { role: 'toolbar', 'aria-label': 'Circuit tools' });
      const B = (ic, label, title, fn, id, cls) => { const b = h('button.btn.small' + (cls || ''), { type: 'button', title, id, 'aria-label': title }, icon(ic), label ? h('span.lbl', label) : null); b.addEventListener('click', fn); return b; };
      this.btnParts = B('kit', 'Parts', 'Show the parts', () => this.drawer(), 'btnParts', '.only-phone');
      const file = B('file', 'File', 'New, open, save, samples, export, share', (e) => this.fileMenu(e.currentTarget), 'btnFile');
      this.btnUndo = B('undo', '', 'Undo (Ctrl+Z)', () => this.editor.undo(), 'btnUndo', '.icon');
      this.btnRedo = B('redo', '', 'Redo (Ctrl+Y)', () => this.editor.redo(), 'btnRedo', '.icon');
      const rot = B('rotate', '', 'Turn a quarter (R)', () => this.editor.rotateSel(), 'btnRotate', '.icon.no-phone');
      const mir = B('mirror', '', 'Mirror (M)', () => this.editor.flipSel(), 'btnMirror', '.icon.no-phone');
      const al = B('align', '', 'Line up the selection', (e) => this.alignMenu(e.currentTarget), 'btnAlign', '.icon.no-phone');
      const blk = B('block', 'Block', 'Make a block of the selection (B)', () => this.editor.makeBlock(), 'btnBlock', '.no-phone');
      const tidy = B('tidy', 'Tidy up', 'Place and route everything again, neatly', () => this.editor.tidy(), 'btnTidy', '.no-phone');
      const note = B('note', '', 'Add a note', () => this.editor.addNote('A note'), 'btnNote', '.icon.no-phone');
      const more = B('more', '', 'More tools', (e) => this.moreMenu(e.currentTarget), 'btnMore', '.icon.only-phone');
      const del = B('trash', '', 'Delete the selection (Del)', () => this.editor.deleteSel(), 'btnDelete', '.icon');
      this.btnRun = B('run', 'Run', 'Run or pause (Enter)', () => this.toggleRun(), 'btnRun', '.primary');
      const stepE = B('stepInto', '', 'One event (.)', () => this.stepEvent(), 'btnStepEvent', '.icon');
      const stepC = B('edge', '', 'To the next clock edge (E)', () => this.stepEdge(), 'btnStepEdge', '.icon');
      const rew = B('rewind', '', 'Rewind to the start, switches as they are (Backspace)', () => this.rewind(), 'btnRewind', '.icon');
      const rst = B('restart', '', 'Reset: the switches back to their starting values, time to 0', () => this.reset(), 'btnReset', '.icon.no-phone');
      this.speedSel = h('select.bd-speed', { 'aria-label': 'Speed', title: 'How fast simulated time passes', id: 'simSpeed' }, ...SPEEDS.map(([v, l]) => h('option', { value: String(v), selected: v === this.speed }, l)));
      this.speedSel.addEventListener('change', () => { this.speed = +this.speedSel.value; store.set('build.speed', this.speed); });
      this.timeEl = h('span.bd-time', { id: 'simTime', 'aria-live': 'off' }, '0 ns');
      this.techSel = h('select.bd-tech', { 'aria-label': 'Technology', title: 'Technology: the delays and timing of every part', id: 'simTech' }, ...S.Eng.techNames().map((n) => h('option', { value: n, selected: n === this.app.settings.tech }, (S.Eng.techPresets()[n] && S.Eng.techPresets()[n].name) || n)));
      this.techSel.addEventListener('change', () => { this.app.settings.tech = this.techSel.value; this.app.saveSettings(); this.restartSim(); S.UI.toast('Technology: ' + (S.Eng.tech(this.techSel.value).label || this.techSel.value) + '. The simulation starts again with its delays.', 'ok', 3000); });
      const sep = () => h('span.sep');
      this.btnProblems = B('warn', '', 'Problems and the selection', () => this.toggleSide(), 'btnSide', '.icon');
      bar.append(this.btnParts, file, sep(), this.btnUndo, this.btnRedo, sep(), rot, mir, al, blk, tidy, note, del, more, sep(),
        h('span.bd-sim', this.btnRun, stepE, stepC, rew, rst, this.speedSel, this.timeEl, this.techSel), this.btnProblems);
      return bar;
    }
    updateBar() {
      this.btnUndo.disabled = !this.editor.canUndo; this.btnRedo.disabled = !this.editor.canRedo;
      this.btnRun.innerHTML = ''; this.btnRun.append(icon(this.running ? 'pause' : 'run'), h('span.lbl', this.running ? 'Pause' : 'Run'));
      this.btnRun.setAttribute('aria-pressed', String(this.running));
      const t = this.sim ? this.sim.time : 0;
      this.timeEl.textContent = (t >= 10000 ? (t / 1000).toFixed(2) + ' µs' : (Math.round(t * 10) / 10) + ' ns');
      const crumbs = this.editor.path;
      this.crumbs.innerHTML = '';
      if (crumbs.length) {
        const top = h('button.chip', { type: 'button', id: 'crumbTop' }, this.editor.root.title || 'circuit');
        top.addEventListener('click', () => this.editor.closeBlock(crumbs.length));
        this.crumbs.append(icon('block'), top);
        crumbs.forEach((b, i) => { const c = h('button.chip' + (i === crumbs.length - 1 ? '.on' : ''), { type: 'button' }, b); c.addEventListener('click', () => this.editor.closeBlock(crumbs.length - 1 - i)); this.crumbs.append(' › ', c); });
        this.crumbs.append(h('span.muted.bd-crumb-note', ' Editing a block: every use of it follows. Values show at the top level.'));
      }
    }
    fileMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      S.UI.showMenu([
        { label: 'New circuit', action: () => this.newDoc() },
        { label: 'Open a file (.json)…', sc: 'Ctrl+O', action: () => this.openFile() },
        { label: 'Save to a file (.json)', sc: 'Ctrl+S', action: () => this.saveFile() },
        { label: 'Samples', items: SAMPLES.map((s) => ({ label: s.title, action: () => this.loadSample(s.id) })) },
        { sep: true },
        { label: 'Export picture (.svg)', action: () => this.exportSVG() },
        { label: 'Export picture (.png)', action: () => this.exportPNG() },
        { label: 'Export waves (.vcd)', action: () => this.wave.exportVCD((this.editor.root.title || 'circuit') + '.vcd') },
        { label: 'As Verilog (.v)', action: () => this.exportVerilog() },
        { sep: true },
        { label: 'Copy a share link', action: () => this.share() },
      ], r.left, r.bottom + 4, { anchor, keyboard: true });
    }
    /** on a phone, the tools that do not fit the bar */
    moreMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      const ed = this.editor;
      S.UI.showMenu([
        { label: 'Turn a quarter', sc: 'R', action: () => ed.rotateSel() }, { label: 'Mirror', sc: 'M', action: () => ed.flipSel() },
        { label: 'Line up', items: [['Left edges', 'left'], ['Top edges', 'top'], ['Centres', 'center'], ['Middles', 'middle']].map(([l, a]) => ({ label: l, action: () => ed.align(a) })) },
        { label: 'Make a block', sc: 'B', action: () => ed.makeBlock() }, { label: 'Tidy up', action: () => ed.tidy() }, { label: 'Add a note', action: () => ed.addNote('A note') },
        { sep: true },
        { label: 'Speed', items: SPEEDS.map(([v, l]) => ({ label: l, checked: v === this.speed, action: () => { this.speed = v; this.speedSel.value = String(v); store.set('build.speed', v); } })) },
        { label: 'Technology', items: S.Eng.techNames().map((n) => ({ label: (S.Eng.techPresets()[n] && S.Eng.techPresets()[n].label) || n, checked: n === this.app.settings.tech, action: () => { this.techSel.value = n; this.techSel.dispatchEvent(new Event('change')); } })) },
        { label: 'Problems and the selection', action: () => this.toggleSide() },
      ], r.left, r.bottom + 4, { anchor, keyboard: true });
    }
    alignMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      const a = (label, how) => ({ label, action: () => this.editor.align(how) });
      S.UI.showMenu([a('Left edges', 'left'), a('Right edges', 'right'), a('Centres, one above another', 'center'), a('Top edges', 'top'), a('Bottom edges', 'bottom'), a('Middles, side by side', 'middle'), a('Spread out downwards', 'distribute')], r.left, r.bottom + 4, { anchor, keyboard: true });
    }
    drawer(on) { const open = on == null ? !this.root.classList.contains('pal-open') : on; this.root.classList.toggle('pal-open', open); this.btnParts.setAttribute('aria-expanded', String(open)); }
    toggleSide() { this.root.classList.toggle(matchMedia('(max-width: 1200px)').matches ? 'side-open' : 'side-hidden'); this.editor.applyView(); this.wave.render(); }

    // ---- the side panel: problems and the selection ----------------------------------------------------------
    renderSide() {
      if (!this.side || !this.editor) return;
      const ed = this.editor, doc = ed.doc;
      this.side.innerHTML = '';
      const sel = ed.selParts(), wires = ed.selWires();
      const sec = (title, ...kids) => h('section.bd-sec', h('h3', title), ...kids);
      if (sel.length === 1) {
        const dp = sel[0], def = S.Eng.def(dp.type) || {};
        const facts = Object.entries(dp.params || {}).filter(([k, v]) => v !== '' && v != null && !['contents'].includes(k)).map(([k, v]) => h('span', k + ' ' + (typeof v === 'boolean' ? (v ? 'yes' : 'no') : v)));
        const edit = h('button.btn.small', { type: 'button', id: 'btnEditPart' }, icon('edit'), dp.type === 'BLOCK' ? 'Open' : 'Edit');
        edit.addEventListener('click', () => (dp.type === 'BLOCK' ? ed.openBlock(dp.id) : S.ParamDialog(ed, dp)));
        this.side.appendChild(sec('Selected', h('div.bd-selpart', h('b', (def.label || dp.type) + ' '), h('code', dp.id)), h('div.bd-facts', ...facts), h('div.bd-acts', edit)));
      } else if (wires.length === 1 && !sel.length) {
        const w = wires[0], name = this.circuit && this.circuit.netOfWire.get(w.id);
        const v = ed.values.get(w.id);
        const lab = h('button.btn.small', { type: 'button', id: 'btnLabelWire' }, icon('label'), w.name ? 'Rename' : 'Label');
        lab.addEventListener('click', () => ed.labelWire(w.id));
        const pr = h('button.btn.small', { type: 'button', id: 'btnProbe' }, icon('probe'), this.probeWires.has(w.id) ? 'Remove probe' : 'Probe');
        pr.addEventListener('click', () => this.probe(w.id));
        this.side.appendChild(sec('Selected wire', h('div.bd-selpart', h('b', name || w.id), v ? h('span.bd-val', ' = ' + S.Eng.format(v, this.app.settings.radix)) : null), h('div.bd-facts', h('span', w.pins.length + ' pins: ' + w.pins.map(([a, b]) => a + '.' + b).join(', '))), h('div.bd-acts', lab, pr)));
      } else if (sel.length + wires.length > 1) {
        this.side.appendChild(sec('Selected', h('p.muted', sel.length + ' parts and ' + wires.length + ' wires. Drag to move them; R turns, M mirrors, B makes a block, Ctrl+D duplicates.')));
      }
      const probs = D.problems(doc);
      if (ed.routed && ed.routed.failed.length) probs.unshift(...ed.routed.failed.map((id) => ({ kind: 'route', msg: 'The wire ' + id + ' has no clear path (it is drawn dashed): move the parts apart a little.', wire: id, parts: [] })));
      for (const [id, vs] of ed.viol) probs.unshift({ kind: 'timing', msg: vs[vs.length - 1].say, parts: [id] });
      this.btnProblems.classList.toggle('has', probs.length > 0);
      this.btnProblems.title = probs.length ? probs.length + ' problems' : 'No problems';
      const list = h('ul.bd-probs', { id: 'problems' });
      for (const p of probs.slice(0, 40)) {
        const li = h('li', h('button', { type: 'button', dataset: { kind: p.kind } }, h('span.pk', { 'aria-hidden': 'true' }, p.kind === 'timing' ? '⏱' : '!'), h('span', p.msg)));
        li.firstChild.addEventListener('click', () => {
          ed.sel = new Set((p.parts || []).map((id) => 'p:' + id).concat(p.wire ? ['w:' + p.wire] : []));
          ed.render();
          const first = p.parts && p.parts[0] && D.part(doc, p.parts[0]);
          if (first) { const g = D.geom(first, doc), u = S.Symbols.U, { w, h: hh } = ed.size(); ed.view.x = (first.x + g.w / 2) * u - w / ed.view.z / 2; ed.view.y = (first.y + g.h / 2) * u - hh / ed.view.z / 2; ed.applyView(); }
        });
        list.appendChild(li);
      }
      this.side.appendChild(sec('Problems' + (probs.length ? ' (' + probs.length + ')' : ''), probs.length ? list : h('p.bd-ok', icon('check'), ' None: every input is driven, every wire has one driver, widths agree.')));
      const stat = S.Eng.status();
      this.side.appendChild(h('p.bd-engine.muted', 'Simulator: ' + (this.sim && this.sim.engine === 'Sirkit.Sim' ? 'Sirkit.Sim' : 'the built-in stand-in') + '. ' + (stat.find((x) => x.name === 'Parts library').live ? '' : 'Parts: stand-ins until the parts library arrives.')));
    }

    // ---- changes ------------------------------------------------------------------------------------------------
    changed(why) {
      if (!this.palette) return;
      this.updateBar();
      this.palette.render();
      if (why !== 'open-block' && why !== 'close-block') this.restartSim();
      this.renderSide();
      this.autosave();
    }
    autosave() {
      if (!this.app.settings.autosave) return;
      clearTimeout(this._save);
      this._save = setTimeout(() => { store.set('build', this.editor.root); store.set('build.probes', [...this.probeWires]); store.set('build.inputs', [...this.inputs]); }, 300);
    }
    wireOfPort(name) { const doc = this.editor.root; const p = doc.parts.find((x) => x.params && x.params.name === name); if (!p) return null; const w = D.wireAt(doc, p.id, p.type === 'OUT' ? 'a' : 'y'); return w ? w.id : null; }

    // ---- simulation -----------------------------------------------------------------------------------------------
    restartSim() {
      const wasRunning = this.running;
      this.pause();
      let c;
      try { c = D.toCircuit(this.editor.root); } catch (e) { this.sim = null; S.UI.toast('This circuit cannot be simulated: ' + e.message, 'err', 5000); return; }
      this.circuit = c;
      this._simSig = [this.app.settings.tech, this.app.settings.floatHigh, this.app.settings.powerUp].join('|');
      const fl = this.app.settings.floatHigh;
      try { this.sim = S.Eng.createSim(c, { tech: this.app.settings.tech, floatHigh: fl == null ? undefined : fl, powerUp: this.app.settings.powerUp === 'X' ? 'X' : this.app.settings.powerUp === 'random' ? 'random' : 0 }); } catch (e) { this.sim = null; S.UI.toast('The simulator could not start: ' + e.message, 'err', 5000); return; }
      // switches keep their positions; a part's starting value otherwise
      for (const p of this.editor.root.parts) if (S.Eng.isInput(p.type)) {
        const v = this.inputs.has(p.id) ? this.inputs.get(p.id) : +p.params.value || 0;
        if (this.inputs.has(p.id) || v) try { this.sim.set(p.params.name, v); } catch (e) { /* no such input */ }
      }
      // let the circuit settle from power-up before anyone looks at it
      try { if (this.sim.settle) this.sim.settle(200); else this.sim.run(40); } catch (e) { /* nothing to run */ }
      this.prevVals = new Map();
      // probes that name wires no longer there go
      const wires = new Set(this.editor.root.wires.map((w) => w.id));
      for (const w of [...this.probeWires]) if (!wires.has(w)) this.probeWires.delete(w);
      this.wave.show([...this.probeWires].map((w) => c.netOfWire.get(w)).filter(Boolean));
      this.editor.live = true;
      this.refresh();
      if (wasRunning) this.play();
    }
    /** the values of the wires (top level), the waves and the violations, from the simulator to the screen */
    refresh() {
      const sim = this.sim, ed = this.editor;
      if (!sim) return;
      const vals = new Map(), changed = new Set();
      if (!ed.path.length) for (const w of ed.root.wires) {
        const name = this.circuit.netOfWire.get(w.id);
        if (!name) continue;
        const net = this.circuit.nets.find((n) => n.name === name);
        let v;
        try { v = S.Eng.bits(sim.get(name), (net && net.width) || 1); } catch (e) { v = null; }
        if (v == null) continue;
        vals.set(w.id, v);
        if (this.prevVals && this.prevVals.has(w.id) && this.prevVals.get(w.id) !== v) changed.add(w.id);
      }
      this.prevVals = vals;
      ed.probes = new Set(this.probeWires);
      ed.setValues(vals, changed);
      // an open input is in the problems list already; the timing sentences are the rest
      const vs = (sim.violations || []).filter((v) => v.kind !== 'float');
      if (vs.length !== (this._nv || 0)) { this._nv = vs.length; ed.setViolations(vs.map((v) => Object.assign({}, v, { part: String(v.part || '') }))); this.renderSide(); }
      const widths = new Map(this.circuit.nets.map((n) => [n.name, n.width || 1]));
      const clk = this.circuit.parts.find((p) => p.type === 'CLOCK');
      this.wave.setData({ waves: sim.waves || new Map(), widths, end: sim.time, violations: vs, clock: clk ? clk.params.name : null });
      this.updateBar();
      if (S.Build.onRefresh) S.Build.onRefresh(this);
    }
    play() {
      if (!this.sim || this.running) return;
      this.running = true;
      let last = performance.now();
      const tick = (now) => {
        if (!this.running) return;
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        try { this.sim.run(dt * this.speed); } catch (e) { this.pause(); S.UI.toast('The simulation stopped: ' + e.message, 'err', 5000); return; }
        this.refresh();
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
      this.updateBar();
    }
    pause() { this.running = false; cancelAnimationFrame(this.raf); if (this.btnRun) this.updateBar(); }
    toggleRun() { if (this.running) this.pause(); else this.play(); }
    stepEvent() { if (!this.sim) return; this.pause(); let moved = false; try { moved = this.sim.stepEvent(); } catch (e) { S.UI.toast(e.message, 'err'); } this.refresh(); if (moved === false) S.UI.toast('Nothing is waiting to happen: the circuit has settled.', '', 2200); }
    stepEdge() {
      if (!this.sim) return;
      this.pause();
      if (!this.circuit.parts.some((p) => p.type === 'CLOCK')) { S.UI.toast('There is no clock: add one from Inputs/Outputs.', '', 2500); return; }
      try { this.sim.clockEdge(); } catch (e) { S.UI.toast(e.message, 'err'); }
      this.refresh();
    }
    rewind() { this.pause(); this._nv = 0; this.restartSim(); }
    reset() { this.inputs.clear(); this.rewind(); this.autosave(); S.UI.toast('Reset: every switch at its starting value, time at 0.', '', 2000); }
    toggle(dp, down) {
      if (!this.sim) return;
      const w = +dp.params.w || 1;
      const cur = this.inputs.has(dp.id) ? this.inputs.get(dp.id) : +dp.params.value || 0;
      const set = (v) => { this.inputs.set(dp.id, v); try { this.sim.set(dp.params.name, v); this.afterInput(); } catch (e) { S.UI.toast(e.message, 'err'); } this.refresh(); this.autosave(); };
      if (S.Eng.isButton(dp)) { set(down ? 1 : 0); return; }
      if (w > 1) {
        S.UI.prompt('Set ' + dp.params.name, 'Value (decimal, or 0x for hex, 0b for binary)', String(cur), { ok: 'Set' }).then((t) => {
          if (t == null) return;
          const s = String(t).trim(), v = /^0x/i.test(s) ? parseInt(s.slice(2), 16) : /^0b/i.test(s) ? parseInt(s.slice(2), 2) : parseInt(s, 10);
          if (!isFinite(v) || v < 0 || v >= 2 ** w) { S.UI.toast('A ' + w + '-bit value is 0 to ' + (2 ** w - 1) + '.', 'err'); return; }
          set(v);
        });
        return;
      }
      set(cur ? 0 : 1);
    }
    /** after an input changes while paused, let the change go through the gates (a clocked circuit: a short while) */
    afterInput() {
      if (this.running || !this.sim) return;
      const clocked = this.circuit.parts.some((p) => p.type === 'CLOCK');
      if (!clocked && this.sim.settle) this.sim.settle(2000); else this.sim.run(clocked ? 25 : 80);
    }
    probe(wid) {
      if (this.probeWires.has(wid)) this.probeWires.delete(wid); else this.probeWires.add(wid);
      const name = this.circuit && this.circuit.netOfWire.get(wid);
      if (name) { if (this.probeWires.has(wid)) this.wave.add(name); else this.wave.remove(name); }
      this.editor.probes = new Set(this.probeWires);
      this.editor.placeTags();
      this.renderSide();
      this.autosave();
    }
    waveChanged(names) {
      // the waveform's list is the probes: a signal removed there is no longer probed
      const byName = new Map([...(this.circuit ? this.circuit.netOfWire : new Map())].map(([w, n]) => [n, w]));
      const now = new Set(names.map((n) => byName.get(n)).filter(Boolean));
      this.probeWires = now;
      this.editor.probes = new Set(now);
      this.editor.placeTags();
      this.autosave();
    }

    // ---- files ------------------------------------------------------------------------------------------------------
    newDoc() { this.inputs.clear(); this.probeWires.clear(); this.editor.setDoc(D.blank('untitled')); }
    loadSample(id) {
      const s = SAMPLES.find((x) => x.id === id);
      const doc = s && sampleDoc(s);
      if (!doc) return false;
      this.inputs.clear(); this.probeWires.clear();
      this.editor.setDoc(doc);
      for (const p of this.editor.root.parts) if (S.Eng.isInput(p.type) && s.inputs && s.inputs[p.params.name] != null) this.inputs.set(p.id, s.inputs[p.params.name]);
      for (const n of s.probes || []) { const w = this.wireOfPort(n); if (w) this.probeWires.add(w); }
      for (const p of this.editor.root.parts) if (S.Eng.isInput(p.type) || p.type === 'OUT') { const w = D.wireAt(this.editor.root, p.id, p.type === 'OUT' ? 'a' : 'y'); if (w && this.probeWires.size < 8) this.probeWires.add(w.id); }
      this.restartSim();
      this.autosave();
      return true;
    }
    async openFile() {
      const [file] = await S.UI.pickFiles('.json,application/json');
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const doc = data.doc || data;
        if (!doc.parts || !doc.wires) throw new Error('This file is not a Sirkit circuit.');
        this.inputs.clear(); this.probeWires = new Set(data.probes || []);
        this.editor.setDoc(doc);
        S.UI.toast('Opened ' + file.name + '.', 'ok');
      } catch (e) { S.UI.toast(e.message.startsWith('This') ? e.message : 'This file could not be read as a circuit: ' + e.message, 'err', 5000); }
    }
    saveFile() {
      const name = (this.editor.root.title || 'circuit').replace(/[^\w-]+/g, '_') + '.json';
      S.UI.download(name, JSON.stringify({ sirkit: 1, doc: this.editor.root, probes: [...this.probeWires] }, null, 1), 'application/json');
    }
    exportSVG() {
      const ed = this.editor;
      const svg = S.EdDraw.standalone(ed.svg, ed.bounds, ed.doc.title);
      S.UI.download((ed.doc.title || 'circuit').replace(/[^\w-]+/g, '_') + '.svg', svg, 'image/svg+xml');
    }
    async exportPNG() {
      const ed = this.editor;
      const svg = S.EdDraw.standalone(ed.svg, ed.bounds, ed.doc.title);
      try { const blob = await S.EdDraw.png(svg, ed.bounds, 2); S.UI.download((ed.doc.title || 'circuit').replace(/[^\w-]+/g, '_') + '.png', blob); } catch (e) { S.UI.toast(e.message, 'err'); }
    }
    exportVerilog() {
      const c = D.toCircuit(this.editor.root);
      let text = null;
      if (S.Verilog && S.Verilog.fromCircuit) try { text = S.Verilog.fromCircuit(c); } catch (e) { text = null; }
      if (text == null && S.VerilogPage && S.VerilogPage.fromCircuit) try { text = S.VerilogPage.fromCircuit(c); } catch (e) { text = null; }
      if (text == null) { S.UI.toast('Writing Verilog needs the Verilog engine, which is still being built.', 'err', 4000); return; }
      S.UI.download((this.editor.root.title || 'circuit').replace(/[^\w-]+/g, '_') + '.v', text, 'text/plain');
    }
    share() { this.app.share('build', { doc: this.editor.root, probes: [...this.probeWires] }); }

    // ---- keys -----------------------------------------------------------------------------------------------------
    onKey(e, typing) {
      if (typing) return false;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.saveFile(); return true; }
      if (mod && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); this.openFile(); return true; }
      if (this.editor.key(e)) { return true; }
      if (mod || e.altKey) return false;
      const k = e.key;
      if (k === 'Enter') { const tag = e.target.tagName; if (tag === 'BUTTON' || tag === 'A') return false; e.preventDefault(); this.toggleRun(); return true; }
      if (k === '.') { e.preventDefault(); this.stepEvent(); return true; }
      if (k === 'e' || k === 'E') { e.preventDefault(); this.stepEdge(); return true; }
      if (k === 'Backspace') { e.preventDefault(); this.rewind(); return true; }
      if (k === 'w' || k === 'W') { const w = this.editor.selWires()[0]; if (w) { e.preventDefault(); this.probe(w.id); return true; } }
      return false;
    }
  }
  BuildPage.pending = null;

  S.Build = {
    page: null,
    samples: SAMPLES,
    sampleDoc: (id) => sampleDoc(SAMPLES.find((s) => s.id === id)),
    /** open a Netlist.Circuit in the editor, laid out by the layout engine (undoable there) */
    openCircuit(circuit, title) {
      const doc = D.fromCircuit(circuit, { title: title || circuit.title });
      if (S.Build.page && location.hash.replace(/^#/, '') === 'build') { S.Build.page.inputs.clear(); S.Build.page.probeWires.clear(); S.Build.page.editor.setDoc(doc); S.Build.page.loadPortsAsProbes(); return; }
      BuildPage.pending = doc;
      store.set('build', doc);
      store.set('build.probes', []); store.set('build.inputs', []);
      location.hash = 'build';
    },
    /** the editor's circuit as a Netlist.Circuit (blocks flattened) */
    currentCircuit() { const doc = S.Build.page ? S.Build.page.editor.root : store.get('build', null); return doc ? D.toCircuit(doc) : null; },
    currentDoc() { return S.Build.page ? S.Build.page.editor.root : store.get('build', null); },
  };
  BuildPage.prototype.loadPortsAsProbes = function () {
    for (const p of this.editor.root.parts) if (S.Eng.isPort(p.type)) { const w = D.wireAt(this.editor.root, p.id, p.type === 'OUT' ? 'a' : 'y'); if (w && this.probeWires.size < 8) this.probeWires.add(w.id); }
    this.restartSim();
  };

  S.Pages.register('build', {
    title: 'Circuit editor', nav: 'build',
    open(app, main, rest) { return new BuildPage(app, main, rest); },
    load(data) { BuildPage.pending = data.doc || data; store.set('build.probes', data.probes || []); store.set('build.inputs', []); },
    keys: null,
  });

  // the editor's drawings for the diagram checker: every sample, tidy, at rest and running
  for (const s of SAMPLES) S.Checks.push({ group: 'build', name: 'editor / ' + s.title, hash: 'build', setup: `Sirkit.Build.page.loadSample(${JSON.stringify(s.id)}); Sirkit.Build.page.editor.strict = true; Sirkit.Build.page.editor.sel.clear(); Sirkit.Build.page.editor.render(); Sirkit.Build.page.stepEdge && Sirkit.Build.page.circuit.parts.some((p) => p.type === 'CLOCK') && Sirkit.Build.page.stepEdge(); await new Promise((r) => setTimeout(r, 120)); Sirkit.Build.page.editor.fit();`, ready: 'Sirkit.Build.page && Sirkit.Build.page.editor', sel: '#main' });
})(globalThis.Sirkit = globalThis.Sirkit || {});
