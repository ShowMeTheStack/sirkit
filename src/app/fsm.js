// The state-machine workbench (#fsm): a Mealy or Moore state diagram drawn by hand, run on an input sequence,
// and taken step by step to a circuit: the state table, the reduced table (implication table or partition
// refinement), a state assignment with the cost of each kind, the excitation table for D, JK, T or SR
// flip-flops, a K-map and an equation for each flip-flop input and output, and the circuit, which opens in the
// circuit editor. At every stage the student fills in and checks, or reveals; the checks come from Sirkit.Fsm.
(function (S) {
  'use strict';
  const { h, icon } = S.UI;
  const store = S.UI.storage;
  const F = () => S.Fsm;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const STAGES = [['table', 'State table'], ['reduce', 'Reduce'], ['assign', 'Assign codes'], ['excite', 'Excitation'], ['equations', 'Equations'], ['circuit', 'Circuit']];

  // ---- samples (our own machines) --------------------------------------------------------------------------
  const SAMPLES = {
    fall: { title: 'Falling-edge watcher (Moore)', model: { type: 'moore', inputs: ['X'], outputs: ['Z'], start: 'IDLE', states: [{ name: 'IDLE', x: 100, y: 120, out: '0' }, { name: 'HIGH', x: 300, y: 120, out: '0' }, { name: 'FELL', x: 200, y: 290, out: '1' }],
      arrows: [{ from: 'IDLE', to: 'IDLE', label: '0' }, { from: 'IDLE', to: 'HIGH', label: '1' }, { from: 'HIGH', to: 'HIGH', label: '1' }, { from: 'HIGH', to: 'FELL', label: '0' }, { from: 'FELL', to: 'IDLE', label: '0' }, { from: 'FELL', to: 'HIGH', label: '1' }] },
      say: 'Z is 1 for one clock after X falls from 1 to 0.' },
    det1001: { title: 'Detector for 1001, overlapping (Mealy)', model: { type: 'mealy', inputs: ['X'], outputs: ['Z'], start: 'S0', states: [{ name: 'S0', x: 120, y: 110 }, { name: 'S1', x: 340, y: 110 }, { name: 'S2', x: 340, y: 300 }, { name: 'S3', x: 120, y: 300 }],
      arrows: [{ from: 'S0', to: 'S0', label: '0/0' }, { from: 'S0', to: 'S1', label: '1/0' }, { from: 'S1', to: 'S1', label: '1/0' }, { from: 'S1', to: 'S2', label: '0/0' }, { from: 'S2', to: 'S1', label: '1/0' }, { from: 'S2', to: 'S3', label: '0/0' }, { from: 'S3', to: 'S0', label: '0/0' }, { from: 'S3', to: 'S1', label: '1/1' }] },
      say: 'Z is 1 on the clock that completes 1001; the last 1 can start the next match.' },
    spare: { title: 'Two ones in a row, with spare states (Mealy)', model: { type: 'mealy', inputs: ['X'], outputs: ['Z'], start: 'A', states: [{ name: 'A', x: 120, y: 110 }, { name: 'B', x: 340, y: 110 }, { name: 'D', x: 340, y: 300 }, { name: 'C', x: 120, y: 300 }],
      arrows: [{ from: 'A', to: 'A', label: '0/0' }, { from: 'A', to: 'B', label: '1/0' }, { from: 'B', to: 'C', label: '0/0' }, { from: 'B', to: 'D', label: '1/1' }, { from: 'D', to: 'D', label: '1/1' }, { from: 'D', to: 'C', label: '0/0' }, { from: 'C', to: 'A', label: '0/0' }, { from: 'C', to: 'B', label: '1/0' }] },
      say: 'Z is 1 on the second of two 1s in a row. A and C behave alike, and so do B and D: reduction finds it.' },
    blank: { title: 'Empty diagram', model: { type: 'mealy', inputs: ['X'], outputs: ['Z'], start: null, states: [], arrows: [] }, say: '' },
  };

  // ---- the model as a machine --------------------------------------------------------------------------------
  const symbols = (k) => { const out = []; for (let v = 0; v < 1 << k; v++) { let s = ''; for (let i = k - 1; i >= 0; i--) s += (v >> i) & 1; out.push(s); } return out; };
  /** the inputs a pattern like 1- stands for */
  const expand = (pat) => (pat.includes('-') ? ['0', '1'].flatMap((b) => expand(pat.replace('-', b))) : [pat]);
  /** an arrow's label: { items: [{ input, out }], errors } */
  function parseLabel(m, label) {
    const k = m.inputs.length, w = m.outputs.length, items = [], errors = [];
    for (const part of String(label || '').split(',').map((x) => x.trim()).filter(Boolean)) {
      let inp = part, out = null;
      if (m.type === 'mealy') {
        const mm = /^([01-]+)\s*\/\s*([01-]+)$/.exec(part);
        if (!mm) { errors.push('"' + part + '" is not input/output, like 1/0'); continue; }
        inp = mm[1]; out = mm[2];
        if (out.length !== w) { errors.push('"' + part + '" has ' + out.length + ' output bit' + (out.length > 1 ? 's' : '') + ' but there ' + (w === 1 ? 'is 1 output' : 'are ' + w + ' outputs')); continue; }
      } else if (!/^[01-]+$/.test(part)) { errors.push('"' + part + '" is not an input value like 1'); continue; }
      if (inp.length !== k) { errors.push('"' + part + '" has ' + inp.length + ' input bit' + (inp.length > 1 ? 's' : '') + ' but there ' + (k === 1 ? 'is 1 input' : 'are ' + k + ' inputs')); continue; }
      for (const x of expand(inp)) items.push({ input: x, out });
    }
    return { items, errors };
  }
  /** the diagram as a Sirkit.Fsm machine: { machine, problems, missing } */
  function toMachine(model) {
    const problems = [], missing = [];
    if (!model.states.length) return { machine: null, problems: ['The diagram has no states yet.'], missing };
    const table = {};
    for (const s of model.states) table[s.name] = model.type === 'moore' ? { out: s.out || '-'.repeat(model.outputs.length), next: {} } : {};
    const seen = new Map();
    for (const a of model.arrows) {
      const r = parseLabel(model, a.label);
      for (const e of r.errors) problems.push('The arrow ' + a.from + ' → ' + a.to + ': ' + e + '.');
      for (const it of r.items) {
        const key = a.from + '|' + it.input;
        if (seen.has(key) && seen.get(key) !== a.to) { problems.push(a.from + ' has two arrows for input ' + it.input + ' (to ' + seen.get(key) + ' and to ' + a.to + ').'); continue; }
        seen.set(key, a.to);
        if (model.type === 'moore') table[a.from].next[it.input] = a.to; else table[a.from][it.input] = [a.to, it.out];
      }
    }
    if (model.type === 'moore') for (const s of model.states) if (s.out != null && s.out !== '' && !new RegExp('^[01-]{' + model.outputs.length + '}$').test(s.out)) problems.push(s.name + ' has the output "' + s.out + '", which is not ' + model.outputs.length + ' bit' + (model.outputs.length > 1 ? 's' : '') + '.');
    for (const s of model.states) for (const x of symbols(model.inputs.length)) if (!seen.has(s.name + '|' + x)) missing.push(s.name + ' on ' + x);
    if (problems.length) return { machine: null, problems, missing };
    try {
      return { machine: F().create({ type: model.type, inputs: model.inputs, outputs: model.outputs, start: model.start || model.states[0].name, states: model.states.map((s) => s.name), table }), problems, missing };
    } catch (e) { return { machine: null, problems: [String(e.message || e)], missing }; }
  }
  /** a diagram for a machine, the states placed on a circle */
  function fromMachine(m) {
    const n = m.states.length, cx = 260, cy = 220, r = n <= 2 ? 120 : Math.max(130, 46 * n);
    const model = { type: m.type, inputs: m.inputs.slice(), outputs: m.outputs.slice(), start: m.start, states: [], arrows: [] };
    m.states.forEach((s, i) => { const a = -Math.PI + (2 * Math.PI * i) / n; model.states.push({ name: s, x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)), out: m.type === 'moore' ? m.out[s] : undefined }); });
    for (const e of F().diagram(m).edges) model.arrows.push({ from: e.from, to: e.to, label: e.label });
    return model;
  }
  function renameState(model, from, to) {
    if (from === to) return;
    for (const s of model.states) if (s.name === from) s.name = to;
    for (const a of model.arrows) { if (a.from === from) a.from = to; if (a.to === from) a.to = to; }
    if (model.start === from) model.start = to;
  }

  // ---- the page -------------------------------------------------------------------------------------------
  class FsmPage {
    constructor(app, main) {
      this.app = app; this.main = main;
      const saved = store.get('fsm', null);
      this.model = saved && saved.model ? saved.model : clone(SAMPLES.det1001.model);
      this.flow = Object.assign({ stage: 0, ff: 'D', assign: 'binary', method: 'implication', codes: {}, answers: {} }, saved && saved.flow);
      this.undo = []; this.redo = []; this.committed = JSON.stringify(this.model);
      this.verdicts = {};
      this.build();
      this.recompute();
      S.FsmPage.page = this;
    }
    // ---- frame ------------------------------------------------------------------------------------------
    build() {
      const main = this.main;
      main.appendChild(this.app.workTabs('fsm'));
      const root = this.root = h('div.fsm', { id: 'fsmView' });
      root.appendChild(h('div.fsm-head', h('div', h('h1.page-title', 'State machine workbench'), h('p.lead', 'Draw a Mealy or a Moore machine, run it on an input sequence, then design its circuit stage by stage. Each stage can be filled in and checked, or revealed.'))));
      // the machine's kind, inputs and outputs, and the tools
      this.typeSeg = h('div.seg', { role: 'group', 'aria-label': 'Kind of machine' }, ...[['mealy', 'Mealy'], ['moore', 'Moore']].map(([k, l]) => { const b = h('button', { type: 'button', dataset: { kind: k }, id: 'fsmKind-' + k }, l); b.addEventListener('click', () => this.setType(k)); return b; }));
      this.inField = h('input', { type: 'text', id: 'fsmInputs', spellcheck: 'false', 'aria-label': 'Inputs', size: '8' });
      this.outField = h('input', { type: 'text', id: 'fsmOutputs', spellcheck: 'false', 'aria-label': 'Outputs', size: '8' });
      this.inField.addEventListener('change', () => this.setPorts());
      this.outField.addEventListener('change', () => this.setPorts());
      this.sample = h('select', { id: 'fsmSample', 'aria-label': 'Examples' }, h('option', { value: '' }, 'Examples…'), ...Object.entries(SAMPLES).map(([k, v]) => h('option', { value: k }, v.title)));
      this.sample.addEventListener('change', () => { if (this.sample.value) this.loadSample(this.sample.value); this.sample.value = ''; });
      const tb = (id, ic, label, fn, title) => { const b = h('button.btn.small', { type: 'button', id, title: title || label }, icon(ic), h('span.lbl', label)); b.addEventListener('click', fn); return b; };
      this.btnArrow = tb('fsmArrowMode', 'route', 'Arrow mode', () => { this.editor.mode = this.editor.mode === 'arrow' ? 'select' : 'arrow'; this.btnArrow.classList.toggle('on', this.editor.mode === 'arrow'); this.editor.render(); }, 'Arrow mode: drag from any point of a state (A)');
      this.btnUndo = tb('fsmUndo', 'undo', 'Undo', () => this.doUndo(), 'Undo (Ctrl+Z)');
      this.btnRedo = tb('fsmRedo', 'redo', 'Redo', () => this.doRedo(), 'Redo (Ctrl+Y)');
      this.btnDel = tb('fsmDelete', 'trash', 'Delete', () => this.editor.deleteSelected(), 'Delete the selected state or arrow (Del)');
      root.appendChild(h('div.fsm-bar.card',
        h('div.fsm-ports', this.typeSeg, h('label', 'Inputs ', this.inField), h('label', 'Outputs ', this.outField)),
        h('div.fsm-tools', tb('fsmAddState', 'plus', 'Add state', () => this.editor.addState(), 'Add a state (N)'), this.btnArrow, this.btnDel, this.btnUndo, this.btnRedo,
          tb('fsmText', 'edit', 'As text', () => this.textDialog(), 'Edit the machine as a table in text'),
          tb('fsmShare', 'share', 'Share', () => this.app.share('fsm', this.data()), 'Copy a link to this machine'), this.sample)));
      // the diagram and the runner
      const canvasCard = h('div.card.fsm-card');
      this.canvasBox = h('div.fsm-canvas-box');
      this.problems = h('div.fsm-problems', { id: 'fsmProblems', 'aria-live': 'polite' });
      canvasCard.append(this.canvasBox, this.problems);
      this.editor = new S.FsmEditor(this.canvasBox, { get: () => this.model, change: (m, what, transient) => this.change(m, what, transient), select: () => this.syncButtons() });
      this.runBox = h('div.card.fsm-run', { id: 'fsmRun' });
      root.appendChild(h('div.fsm-grid', canvasCard, this.runBox));
      // the design flow
      this.stepper = h('div.fsm-steps', { role: 'tablist', 'aria-label': 'Design stages' });
      this.stageBody = h('div.fsm-stage', { id: 'fsmStage' });
      root.appendChild(h('section.card.fsm-flow', h('div.fsm-flow-head', h('h2', 'Design the circuit'), this.stepper), this.stageBody));
      main.appendChild(root);
      this.buildRunner();
    }
    syncButtons() {
      const m = this.model;
      for (const b of this.typeSeg.children) b.classList.toggle('on', b.dataset.kind === m.type);
      if (document.activeElement !== this.inField) this.inField.value = m.inputs.join(', ');
      if (document.activeElement !== this.outField) this.outField.value = m.outputs.join(', ');
      this.btnUndo.disabled = !this.undo.length; this.btnRedo.disabled = !this.redo.length;
      this.btnDel.disabled = !(this.editor.sel.state || this.editor.sel.arrow != null);
    }
    data() { return { model: this.model, flow: { stage: this.flow.stage, ff: this.flow.ff, assign: this.flow.assign, method: this.flow.method, codes: this.flow.codes } }; }
    save() { if (this.app.settings.autosave !== false) store.set('fsm', this.data()); }

    // ---- changes and history -------------------------------------------------------------------------------
    change(m, what, transient) {
      this.model = m;
      if (transient) { this.editor.render(); return; }
      const now = JSON.stringify(m);
      if (now !== this.committed) { this.undo.push(this.committed); if (this.undo.length > 200) this.undo.shift(); this.redo = []; this.committed = now; }
      this.editor.render();
      this.recompute();
      this.save();
    }
    doUndo() { if (!this.undo.length) return; this.redo.push(this.committed); this.committed = this.undo.pop(); this.model = JSON.parse(this.committed); this.editor.sel = {}; this.editor.render(); this.recompute(); this.save(); }
    doRedo() { if (!this.redo.length) return; this.undo.push(this.committed); this.committed = this.redo.pop(); this.model = JSON.parse(this.committed); this.editor.sel = {}; this.editor.render(); this.recompute(); this.save(); }
    setType(k) {
      if (k === this.model.type) return;
      const m = clone(this.model);
      const mm = toMachine(m).machine;
      if (mm && m.states.length) {
        // convert the machine itself, so it keeps doing the same thing
        const conv = k === 'moore' ? F().toMoore(mm).machine : F().toMealy(mm).machine;
        const nm = fromMachine(conv);
        // keep the places of the states that survive; a state split in two gets its twin beside it
        for (const st of nm.states) {
          const o = m.states.find((x) => x.name === st.name) || m.states.find((x) => st.name.startsWith(x.name + '_'));
          if (!o) continue;
          const twins = nm.states.filter((q) => q.name.startsWith(o.name + '_'));
          const i = Math.max(0, twins.indexOf(st));
          st.x = o.x + i * 120; st.y = o.y + i * 40;
        }
        this.spread(nm);
        this.change(nm, 'type');
        S.UI.toast(k === 'moore' ? 'Converted to Moore: each state now shows the output it gives.' : 'Converted to Mealy: each arrow carries the output of the state it enters.', 'ok');
      } else {
        m.type = k;
        for (const s of m.states) if (k === 'moore' && s.out == null) s.out = '0'.repeat(m.outputs.length);
        for (const a of m.arrows) a.label = k === 'moore' ? String(a.label).replace(/\/[01-]+/g, '') : String(a.label).split(',').map((x) => x.trim() + '/' + '0'.repeat(m.outputs.length)).join(', ');
        this.change(m, 'type');
      }
    }
    /** push apart states that sit on each other */
    spread(m) {
      for (let it = 0; it < 30; it++) {
        let moved = false;
        for (const a of m.states) for (const b of m.states) {
          if (a === b) continue;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 110) { const dx = (b.x - a.x) || 1, dy = (b.y - a.y) || 0.5, l = Math.hypot(dx, dy); b.x = Math.round(b.x + (dx / l) * (110 - d) / 2 + 1); b.y = Math.round(b.y + (dy / l) * (110 - d) / 2); moved = true; }
        }
        if (!moved) break;
      }
      const x0 = Math.min(...m.states.map((s) => s.x)), y0 = Math.min(...m.states.map((s) => s.y));
      for (const s of m.states) { s.x += 100 - x0; s.y += 110 - y0; }
    }
    setPorts() {
      const names = (v, def) => { const a = v.split(/[\s,]+/).filter(Boolean); return a.length ? a : [def]; };
      const ins = names(this.inField.value, 'X'), outs = names(this.outField.value, 'Z');
      const bad = ins.concat(outs).find((x) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(x));
      if (bad) { S.UI.toast('"' + bad + '" is not a name: use a letter followed by letters or digits.', 'err'); this.syncButtons(); return; }
      if (new Set(ins.concat(outs)).size !== ins.length + outs.length) { S.UI.toast('The inputs and outputs need different names.', 'err'); this.syncButtons(); return; }
      if (ins.length > 4) { S.UI.toast('Up to four inputs here.', 'err'); this.syncButtons(); return; }
      const m = clone(this.model);
      const dk = ins.length - m.inputs.length, dw = outs.length - m.outputs.length;
      m.inputs = ins; m.outputs = outs;
      const fit = (s, n) => (s.length >= n ? s.slice(0, n) : s + '-'.repeat(n - s.length));
      if (dk || dw) {
        for (const a of m.arrows) {
          a.label = String(a.label).split(',').map((p) => { const [i, o] = p.trim().split('/'); return fit(i || '', ins.length) + (m.type === 'mealy' ? '/' + fit(o || '', outs.length).replace(/-/g, '0') : ''); }).join(', ');
        }
        if (m.type === 'moore') for (const s of m.states) s.out = fit(s.out || '', outs.length).replace(/-/g, '0');
        S.UI.toast('The labels were padded or cut to the new number of ' + (dk ? 'inputs' : 'outputs') + ': check them.', 'ok', 4000);
      }
      this.change(m, 'ports');
    }
    loadSample(k) {
      const smp = SAMPLES[k];
      if (!smp) return;
      this.flow = Object.assign(this.flow, { stage: 0, codes: {}, answers: {} });
      this.verdicts = {};
      this.editor.sel = {};
      this.change(clone(smp.model), 'sample');
      if (smp.say) S.UI.toast(smp.title + ': ' + smp.say, 'ok', 3500);
    }
    async textDialog() {
      const mm = toMachine(this.model).machine;
      const ta = h('textarea', { id: 'fsmTextArea', spellcheck: 'false', rows: '10', style: { width: '100%' } });
      ta.value = mm ? F().format(mm) : 'mealy\ninputs X\noutputs Z\nstart S0\nS0: 0 -> S0/0, 1 -> S1/0\nS1: 0 -> S0/0, 1 -> S1/1';
      const err = h('div.fsm-err');
      const body = h('div', h('p.muted', 'One row per state. Mealy: S0: 0 -> S1/0, 1 -> S2/1. Moore: S0/1: 0 -> S1, 1 -> S2 (the state\'s output after the slash).'), ta, err);
      const ok = () => { try { return F().parse(ta.value); } catch (e) { err.textContent = e.message; return undefined; } };
      const m = await S.UI.modal({ title: 'The machine as text', body, wide: true, buttons: [{ label: 'Cancel', value: null }, { label: 'Use this machine', value: ok, primary: true, keepOpen: true }], cancelValue: null });
      if (!m) return;
      const nm = fromMachine(m);
      // keep the places of states that keep their names
      for (const s of nm.states) { const o = this.model.states.find((x) => x.name === s.name); if (o) { s.x = o.x; s.y = o.y; } }
      this.change(nm, 'text');
    }

    // ---- the machine and its design ----------------------------------------------------------------------
    recompute() {
      const r = toMachine(this.model);
      this.machine = r.machine;
      this.design = null; this.designError = null;
      this.problems.innerHTML = '';
      if (r.problems.length) for (const p of r.problems.slice(0, 4)) this.problems.appendChild(h('div.fsm-problem', icon('warn'), h('span', p)));
      else if (r.missing.length) this.problems.appendChild(h('div.fsm-note', icon('info'), h('span', 'Unspecified (don\'t care): ' + r.missing.slice(0, 6).join(', ') + (r.missing.length > 6 ? ' and ' + (r.missing.length - 6) + ' more' : '') + '.')));
      else if (this.machine) this.problems.appendChild(h('div.fsm-note.ok', icon('check'), h('span', this.machine.states.length + ' states, ' + this.machine.inputs.length + ' input' + (this.machine.inputs.length > 1 ? 's' : '') + ' (' + this.machine.inputs.join(', ') + '), ' + this.machine.outputs.length + ' output' + (this.machine.outputs.length > 1 ? 's' : '') + ' (' + this.machine.outputs.join(', ') + '), every transition given.')));
      if (this.machine) {
        try { this.design = F().design(this.machine, this.designOpts()); } catch (e) { this.designError = String(e.message || e); }
      }
      this.syncButtons();
      this.renderSteps();
      this.renderStage();
      this.renderRun();
    }
    designOpts() {
      const f = this.flow;
      let assign = f.assign;
      if (assign === 'custom') {
        const red = this.reduced();
        const codes = red && red.states.every((s) => /^[01]+$/.test(f.codes[s] || '')) ? Object.fromEntries(red.states.map((s) => [s, f.codes[s]])) : null;
        assign = codes && F().check.assignment(red, codes).ok ? { codes } : 'binary';
      }
      if (assign === 'onehot' && f.ff !== 'D') assign = 'binary';
      return { ff: f.ff, assign, method: f.method };
    }
    reduced() { try { return this.machine ? F().reduce(this.machine, { method: this.flow.method }).machine : null; } catch (e) { return null; } }

    // ---- the runner ------------------------------------------------------------------------------------------
    buildRunner() {
      const box = this.runBox;
      this.seqField = h('input', { type: 'text', id: 'fsmSeq', spellcheck: 'false', 'aria-label': 'Input sequence', value: store.get('fsm.seq', '0110010011') });
      const go = h('button.btn.small.primary', { type: 'button', id: 'fsmRunBtn' }, icon('run'), 'Run');
      go.addEventListener('click', () => { this.runAt = 0; store.set('fsm.seq', this.seqField.value); this.renderRun(true); });
      this.seqField.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
      this.runOut = h('div.fsm-run-out', { id: 'fsmRunOut' });
      box.append(h('h3', 'Run it'), h('p.muted.small', 'An input sequence, one symbol per clock (with two or more inputs, separate the symbols with spaces).'), h('div.fsm-run-in', this.seqField, go), this.runOut);
    }
    renderRun(fresh) {
      const box = this.runOut;
      if (!box) return;
      box.innerHTML = '';
      if (!this.machine) { box.appendChild(h('p.muted', 'Finish the diagram to run it.')); this.editor.setHot(null); return; }
      const m = this.machine, seq = this.seqField.value.trim();
      const xs = F().seqOf(m, seq.replace(/\s+/g, m.inputs.length === 1 ? '' : ' '));
      const bad = xs.find((x) => !new RegExp('^[01]{' + m.inputs.length + '}$').test(x));
      if (bad != null) { box.appendChild(h('p.fsm-err', '"' + bad + '" is not an input of ' + m.inputs.length + ' bit' + (m.inputs.length > 1 ? 's' : '') + '.')); return; }
      const r = F().run(m, xs);
      this.run = r;
      if (fresh || this.runAt == null) this.runAt = 0;
      this.runAt = Math.min(this.runAt, r.trace.length - 1);
      const outs = r.outputs.join(m.outputs.length > 1 ? ' ' : '');
      box.appendChild(h('div.fsm-run-sum', h('span', 'Outputs '), h('b.mono', { id: 'fsmRunOutputs' }, outs || '—')));
      const nav = h('div.fsm-run-nav');
      const b = (ic, l, d) => { const x = h('button.btn.small', { type: 'button', title: l, 'aria-label': l, id: d < 0 ? 'fsmRunBack' : 'fsmRunNext' }, ic); x.addEventListener('click', () => { this.runAt = Math.max(0, Math.min(r.trace.length - 1, this.runAt + d)); this.renderRun(); }); return x; };
      nav.append(b('‹', 'Step back', -1), h('span.mono', 'step ' + this.runAt + ' of ' + (r.trace.length - 1)), b('›', 'Next step', 1));
      box.appendChild(nav);
      const t = r.trace[this.runAt];
      box.appendChild(h('p.fsm-say', { id: 'fsmRunSay' }, t.say));
      const list = h('ol.fsm-run-list');
      r.trace.forEach((x, i) => { const li = h('li' + (i === this.runAt ? '.on' : ''), x.say); li.addEventListener('click', () => { this.runAt = i; this.renderRun(); }); list.appendChild(li); });
      box.appendChild(list);
      // light the state now and the arrow just taken
      const hot = { states: new Set([t.state]), arrows: new Set(), now: t.kind === 'step' ? t.next : t.state };
      if (t.kind === 'step') {
        const k = this.model.arrows.findIndex((a) => a.from === t.state && a.to === t.next && parseLabel(this.model, a.label).items.some((it) => it.input === t.input));
        if (k >= 0) hot.arrows.add(k);
        hot.states = new Set([t.next]);
      }
      this.editor.setHot(hot);
    }

    // ---- the stages ---------------------------------------------------------------------------------------
    renderSteps() {
      this.stepper.innerHTML = '';
      STAGES.forEach(([id, label], i) => {
        const v = this.verdicts[id];
        const b = h('button' + (i === this.flow.stage ? '.on' : '') + (v === true ? '.done' : v === false ? '.bad' : ''), { type: 'button', role: 'tab', 'aria-selected': String(i === this.flow.stage), id: 'fsmStep-' + id }, h('span.n', String(i + 1)), h('span.t', label));
        b.addEventListener('click', () => this.go(i));
        this.stepper.appendChild(b);
      });
    }
    go(i) { this.flow.stage = Math.max(0, Math.min(STAGES.length - 1, i)); this.renderSteps(); this.renderStage(); this.save(); }
    renderStage() {
      const box = this.stageBody;
      box.innerHTML = '';
      const id = STAGES[this.flow.stage][0];
      if (!F() || !F().design) { box.appendChild(S.UI.empty('warn', 'The state-machine engine is not loaded', 'The design stages need Sirkit.Fsm.')); return; }
      if (!this.machine) { box.appendChild(S.UI.empty('fsm', 'Finish the diagram first', 'Every arrow needs a label the machine can read; the problems are listed under the diagram.')); return; }
      if (!this.design) { box.appendChild(S.UI.empty('warn', 'This machine cannot be designed yet', this.designError || '')); return; }
      this['stage_' + id](box);
      const nav = h('div.fsm-stage-nav');
      if (this.flow.stage > 0) { const p = h('button.btn.small', { type: 'button', id: 'fsmPrev' }, '← ' + STAGES[this.flow.stage - 1][1]); p.addEventListener('click', () => this.go(this.flow.stage - 1)); nav.appendChild(p); }
      if (this.flow.stage < STAGES.length - 1) { const n = h('button.btn.small', { type: 'button', id: 'fsmNext' }, STAGES[this.flow.stage + 1][1] + ' →'); n.addEventListener('click', () => this.go(this.flow.stage + 1)); nav.appendChild(n); }
      box.appendChild(nav);
      S.UI.fitTables(box);
    }
    verdict(id, res, el) {
      this.verdicts[id] = res.ok;
      el.className = 'fsm-verdict ' + (res.ok ? 'good' : 'bad');
      el.textContent = res.say + (res.errors && res.errors.length > 1 ? ' (' + (res.errors.length - 1) + ' more to fix)' : '');
      this.renderSteps();
    }
    acts(onCheck, onReveal, extra) {
      const v = h('div.fsm-verdict', { id: 'fsmVerdict', 'aria-live': 'polite' });
      const c = h('button.btn.small.primary', { type: 'button', id: 'fsmCheck' }, icon('check'), 'Check');
      c.addEventListener('click', () => onCheck(v));
      const r = h('button.btn.small', { type: 'button', id: 'fsmReveal' }, icon('eye'), 'Reveal');
      r.addEventListener('click', () => onReveal(v));
      return [h('div.fsm-acts', c, r, extra || null), v];
    }
    say(text) { return h('p.fsm-lead', text); }
    sel(id, opts, value, onChange) { const s = h('select', { id, 'aria-label': id }, ...opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l))); s.addEventListener('change', () => onChange(s.value)); return s; }
    seg(id, opts, value, onChange) { return h('div.seg', { id, role: 'group' }, ...opts.map(([v, l]) => { const b = h('button' + (v === value ? '.on' : ''), { type: 'button', dataset: { v } }, l); b.addEventListener('click', () => onChange(v)); return b; })); }

    // 1. the state table, read off the diagram
    stage_table(box) {
      const m = this.machine, syms = F().symbols(m), A = this.flow.answers.table = this.flow.answers.table || {};
      box.appendChild(this.say('Read the state table off the diagram: for each present state and each input, the next state' + (m.type === 'mealy' ? ' and the output.' : '; and each state\'s output.') + ' A dash means unspecified.'));
      const opts = [['', '·'], ['-', '-']].concat(m.states.map((s) => [s, s]));
      const tbl = h('table.dtable.fsm-tbl', { id: 'fsmTableFill' });
      const head = h('tr', h('th', 'Present'), ...syms.map((x) => h('th', { colspan: m.type === 'mealy' ? '2' : '1' }, (m.inputs.length === 1 ? m.inputs[0] : m.inputs.join('')) + ' = ' + x)), m.type === 'moore' ? h('th', 'Output') : null);
      const sub = m.type === 'mealy' ? h('tr', h('th', ''), ...syms.flatMap(() => [h('th.sub', 'next'), h('th.sub', 'out')])) : null;
      tbl.appendChild(h('thead', head, sub));
      const body = h('tbody');
      for (const s of m.states) {
        const row = A[s] = A[s] || {};
        const tr = h('tr', h('th', s + (s === m.start ? ' ⟵' : '')));
        for (const x of syms) {
          const c = row[x] = row[x] || {};
          const se = h('select', { 'aria-label': s + ' next on ' + x, dataset: { s, x, f: 'next' } }, ...opts.map(([v, l]) => h('option', { value: v, selected: (c.next || '') === v }, l)));
          se.addEventListener('change', () => { c.next = se.value; });
          tr.appendChild(h('td', se));
          if (m.type === 'mealy') { const inp = h('input.cell', { type: 'text', value: c.out || '', size: String(m.outputs.length + 1), 'aria-label': s + ' output on ' + x, dataset: { s, x, f: 'out' } }); inp.addEventListener('input', () => { c.out = inp.value.trim(); }); tr.appendChild(h('td', inp)); }
        }
        if (m.type === 'moore') { const inp = h('input.cell', { type: 'text', value: row.out || '', size: String(m.outputs.length + 1), 'aria-label': s + ' output', dataset: { s, f: 'mout' } }); inp.addEventListener('input', () => { row.out = inp.value.trim(); }); tr.appendChild(h('td', inp)); }
        body.appendChild(tr);
      }
      tbl.appendChild(body);
      box.appendChild(h('div.dtable-wrap', tbl));
      const [acts, v] = this.acts((el) => {
        const table = {};
        for (const s of m.states) {
          const row = A[s] || {};
          if (m.type === 'moore') { table[s] = { out: row.out || '', next: {} }; for (const x of syms) table[s].next[x] = (row[x] || {}).next || null; }
          else { table[s] = {}; for (const x of syms) { const c = row[x] || {}; table[s][x] = [c.next || null, c.out || '']; } }
        }
        const blank = m.states.some((s) => syms.some((x) => !((A[s] || {})[x] || {}).next));
        if (blank) { this.verdict('table', { ok: false, say: 'Fill every next state first (a dash where the diagram gives none).' }, el); return; }
        let got;
        try { got = F().create({ type: m.type, inputs: m.inputs, outputs: m.outputs, start: m.start, states: m.states, table }); }
        catch (e) { this.verdict('table', { ok: false, say: 'The table cannot be read: ' + e.message + '.' }, el); return; }
        this.verdict('table', F().check.table(m, got), el);
      }, (el) => {
        for (const s of m.states) { A[s] = {}; for (const x of syms) A[s][x] = { next: m.next[s][x] || '-', out: m.type === 'mealy' ? m.out[s][x] : undefined }; if (m.type === 'moore') A[s].out = m.out[s]; }
        this.verdicts.table = true;
        this.renderStage();
        const vv = document.getElementById('fsmVerdict'); if (vv) { vv.className = 'fsm-verdict good'; vv.textContent = 'Revealed: ' + this.design.stages.table.say; }
        this.renderSteps();
      });
      box.append(acts, v);
    }

    // 2. reduction
    stage_reduce(box) {
      const m = this.machine, A = this.flow.answers;
      const method = this.flow.method;
      box.appendChild(h('div.fsm-opts', h('span.muted', 'Method '), this.seg('fsmMethod', [['implication', 'Implication table'], ['partition', 'Partition refinement']], method, (v) => { if (v === 'partition' && !F().complete(m)) { S.UI.toast('Partition refinement needs every transition and output given; this machine has unspecified entries.', 'err'); return; } this.flow.method = v; this.recompute(); this.save(); })));
      box.appendChild(this.say('Which states are equivalent? Write the classes, one group per pair of braces or separated by |, like {' + m.states.slice(0, 2).join(', ') + '} {' + m.states.slice(2).join(', ') + '}' + (F().complete(m) ? '.' : '. (This machine has unspecified entries: the classes are compatibles.)')));
      const inp = h('input', { type: 'text', id: 'fsmClasses', spellcheck: 'false', value: A.classes || '', 'aria-label': 'Classes', style: { width: '100%' } });
      inp.addEventListener('input', () => { A.classes = inp.value; });
      box.appendChild(inp);
      const reveal = h('div.fsm-reveal', { id: 'fsmReduceReveal' });
      const [acts, v] = this.acts((el) => {
        const txt = inp.value.trim();
        const groups = (txt.includes('{') ? [...txt.matchAll(/\{([^}]*)\}/g)].map((g) => g[1]) : txt.split('|')).map((g) => g.split(/[\s,]+/).filter(Boolean)).filter((g) => g.length);
        const unknown = groups.flat().find((s) => !m.states.includes(s));
        if (unknown) { this.verdict('reduce', { ok: false, say: 'There is no state ' + unknown + '.' }, el); return; }
        if (!groups.length) { this.verdict('reduce', { ok: false, say: 'Write the classes first.' }, el); return; }
        if (!F().complete(m)) {
          const want = this.design.stages.reduced.classes;
          const same = want.length === groups.length && want.every((w) => groups.some((g) => g.length === w.length && g.every((s) => w.includes(s))));
          this.verdict('reduce', same ? { ok: true, say: 'Right: the smallest closed cover is ' + F().showClasses(want) + '.' } : { ok: false, say: 'Not the smallest closed cover of compatibles: it has ' + want.length + ' blocks. Reveal the implication table to see the compatible pairs.' }, el);
          return;
        }
        this.verdict('reduce', F().check.reduced(m, groups), el);
      }, () => { this.showReduction(reveal, true); A.classes = F().showClasses(this.design.stages.reduced.classes); inp.value = A.classes; this.verdicts.reduce = true; this.renderSteps(); });
      box.append(acts, v, reveal);
      if (this.verdicts.reduce) this.showReduction(reveal, false);
    }
    showReduction(box, fresh) {
      const m = this.machine;
      box.innerHTML = '';
      if (this.flow.method === 'partition' && F().complete(m)) {
        const p = F().partition(m);
        box.appendChild(h('h4', 'Partition refinement'));
        box.appendChild(h('ol.fsm-trace', ...p.trace.map((t) => h('li', t.say))));
      } else {
        const t = F().implication(m), st = m.states;
        box.appendChild(h('h4', 'The implication table'));
        const tbl = h('table.fsm-imp', { id: 'fsmImp' });
        for (let i = 1; i < st.length; i++) {
          const tr = h('tr', h('th', st[i]));
          for (let j = 0; j < i; j++) {
            const c = t.pairs.get(st[j] + '|' + st[i]);
            const txt = c.crossed != null ? '✕' : c.implied.length ? c.implied.map((e) => e[1] + e[2]).join(' ') : '✓';
            tr.appendChild(h('td' + (c.crossed != null ? '.x' : '.ok'), { title: c.reason ? '(' + st[j] + ', ' + st[i] + ') crossed out: ' + c.reason : '' }, txt, c.crossed != null ? h('sub', String(c.crossed)) : null));
          }
          for (let j = i; j < st.length - 1; j++) tr.appendChild(h('td.blank'));
          tbl.appendChild(tr);
        }
        tbl.appendChild(h('tr', h('th'), ...st.slice(0, -1).map((s) => h('th', s))));
        box.appendChild(h('div.fit-table', tbl));
        box.appendChild(h('ol.fsm-trace', ...t.trace.filter((x) => x.kind === 'cross' || x.kind === 'classes' || x.kind === 'compatible' || x.kind === 'round').map((x) => h('li', x.say))));
      }
      const r = this.design.stages.reduced;
      box.appendChild(h('p.fsm-say', r.say));
      if (fresh) S.UI.fitTables(box);
    }

    // 3. state assignment
    stage_assign(box) {
      const d = this.design, red = d.machine, f = this.flow;
      box.appendChild(this.say('Give each of the ' + red.states.length + ' states of the reduced machine a code. Binary counts in order, Gray changes one bit at a time, adjacency follows the usual rules of thumb, one-hot uses a flip-flop per state; or write your own.'));
      box.appendChild(h('div.fsm-opts', this.seg('fsmAssignKind', [['binary', 'Binary'], ['gray', 'Gray'], ['heuristic', 'Adjacency'], ['onehot', 'One-hot'], ['custom', 'My own']], f.assign, (v) => { f.assign = v; if (v === 'onehot' && f.ff !== 'D') { f.ff = 'D'; S.UI.toast('One-hot designs here use D flip-flops.', 'ok'); } this.recompute(); this.save(); })));
      const tbl = h('table.dtable.fsm-codes', { id: 'fsmCodes' }, h('thead', h('tr', h('th', 'State'), h('th', 'Code (' + d.vars.join(' ') + ')'))));
      const body = h('tbody');
      for (const s of red.states) {
        let cell;
        if (f.assign === 'custom') { const inp = h('input.cell', { type: 'text', value: f.codes[s] || '', size: '6', 'aria-label': 'Code of ' + s, dataset: { s } }); inp.addEventListener('input', () => { f.codes[s] = inp.value.trim(); }); cell = inp; } else cell = h('span.mono', d.codes[s]);
        body.appendChild(h('tr', h('th', s), h('td', cell)));
      }
      tbl.appendChild(body);
      box.appendChild(h('div.dtable-wrap.narrow', tbl));
      if (d.unused.length) box.appendChild(h('p.muted', 'Unused codes ' + d.unused.join(', ') + ' are don\'t cares in the equations.'));
      if (f.assign === 'custom') {
        const [acts, v] = this.acts((el) => {
          const res = F().check.assignment(red, Object.fromEntries(red.states.map((s) => [s, f.codes[s] || ''])));
          this.verdict('assign', res, el);
          if (res.ok) { this.recompute(); const vv = document.getElementById('fsmVerdict'); if (vv) this.verdict('assign', res, vv); }
        }, () => { for (const s of red.states) f.codes[s] = d.codes[s]; this.verdicts.assign = true; this.renderStage(); this.renderSteps(); });
        box.append(acts, v);
      } else this.verdicts.assign = true;
      // what each kind costs
      const cmp = F().compareAssignments(red, { ff: f.ff, method: f.method });
      const ct = h('table.dtable', { id: 'fsmCompare' }, h('thead', h('tr', h('th', 'Assignment'), h('th', 'Flip-flops'), h('th', 'AND gates'), h('th', 'Gate inputs'), h('th', 'Literals'))));
      const cb = h('tbody');
      for (const r of cmp.results) if (r.cost) cb.appendChild(h('tr' + (r.kind === cmp.best ? '.best' : ''), h('th', { binary: 'Binary', gray: 'Gray', heuristic: 'Adjacency', onehot: 'One-hot' }[r.kind] + (r.kind === cmp.best ? ' ★' : '')), h('td', String(r.cost.flipflops)), h('td', String(r.cost.terms)), h('td', String(r.cost.gateInputs)), h('td', String(r.cost.literals))));
      ct.appendChild(cb);
      box.append(h('h4', 'The cost of each kind, with ' + f.ff + ' flip-flops'), h('div.dtable-wrap', ct));
    }

    // 4. the transition and excitation table
    stage_excite(box) {
      const d = this.design, m = d.machine, f = this.flow;
      const A = f.answers.excite = f.answers.excite && f.answers.excite.key === this.exciteKey() ? f.answers.excite : { key: this.exciteKey(), rows: {} };
      box.appendChild(h('div.fsm-opts', h('span.muted', 'Flip-flops '), this.seg('fsmFF', [['D', 'D'], ['JK', 'JK'], ['T', 'T'], ['SR', 'SR']], f.ff, (v) => { if (v !== 'D' && f.assign === 'onehot') { S.UI.toast('One-hot designs here use D flip-flops: pick another assignment first.', 'err'); return; } f.ff = v; this.recompute(); this.save(); })));
      const E = F().EXCITATION[f.ff];
      box.appendChild(this.say('For every present code and input write the next code' + ' and the output, then the ' + f.ff + ' inputs that make each flip-flop go there (X for a don\'t care). ' + F().CHARACTERISTIC[f.ff] + '; for each change of Q the excitation table gives ' + ['00', '01', '10', '11'].map((k) => [k, E.rows[k]]).map(([k, v]) => k[0] + '→' + k[1] + ': ' + v.join('')).join(', ') + '.'));
      const ins = d.stages.excitation.inputs;
      const tbl = h('table.dtable.fsm-tbl', { id: 'fsmExcite' }, h('thead', h('tr', h('th', 'Present'), h('th', m.inputs.join('')), h('th', 'Next'), h('th', 'Out'), ...ins.map((n) => h('th', n)))));
      const body = h('tbody');
      for (const r of d.rows) {
        const key = r.code + '|' + r.input, a = A.rows[key] = A.rows[key] || {};
        const cell = (fld, size, label) => { const i = h('input.cell', { type: 'text', value: a[fld] == null ? '' : a[fld], size: String(size), 'aria-label': label, dataset: { k: key, f: fld } }); i.addEventListener('input', () => { a[fld] = i.value.trim(); }); return h('td', i); };
        body.appendChild(h('tr', h('th', r.code + ' ' + r.state), h('td.mono', r.input), cell('next', d.vars.length + 1, 'next code of ' + r.code + ' on ' + r.input), cell('out', m.outputs.length + 1, 'output of ' + r.code + ' on ' + r.input), ...ins.map((n) => cell(n, 2, n + ' for ' + r.code + ' on ' + r.input))));
      }
      tbl.appendChild(body);
      box.appendChild(h('div.dtable-wrap', tbl));
      const [acts, v] = this.acts((el) => {
        const ans = {};
        for (const r of d.rows) { const a = A.rows[r.code + '|' + r.input] || {}; (ans[r.code] = ans[r.code] || {})[r.input] = Object.assign({}, a, { next: a.next || '', out: a.out === '' ? null : a.out }); }
        const missing = d.rows.find((r) => r.nextCode != null && !(A.rows[r.code + '|' + r.input] || {}).next);
        if (missing) { this.verdict('excite', { ok: false, say: 'Fill the next code of ' + missing.code + ' on input ' + missing.input + ' first.' }, el); return; }
        const t = F().check.transition(d, ans);
        if (!t.ok) { this.verdict('excite', t, el); return; }
        const blank = d.rows.find((r) => r.nextCode != null && ins.some((n) => !(A.rows[r.code + '|' + r.input] || {})[n]));
        if (blank) { this.verdict('excite', { ok: false, say: 'The next codes are right. Now fill the ' + f.ff + ' inputs (row ' + blank.code + ', input ' + blank.input + ' is empty).' }, el); return; }
        const e = F().check.excitationTable(d, ans);
        this.verdict('excite', e.ok ? { ok: true, say: 'The transition and excitation tables are right.' } : e, el);
      }, () => {
        for (const r of d.rows) A.rows[r.code + '|' + r.input] = Object.assign({ next: r.nextCode == null ? '-' : r.nextCode, out: r.out == null ? '' : r.out }, r.exc);
        this.verdicts.excite = true; this.renderStage(); this.renderSteps();
      });
      box.append(acts, v);
    }
    exciteKey() { const d = this.design; return d.ff + '|' + JSON.stringify(d.codes); }

    // 5. K-maps and equations
    stage_equations(box) {
      const d = this.design, A = this.flow.answers.eq = this.flow.answers.eq && this.flow.answers.eq.key === this.exciteKey() ? this.flow.answers.eq : { key: this.exciteKey(), text: {}, shown: {} };
      box.appendChild(this.say(d.stages.kmaps.say + ' Write each equation as a sum of products (A\'B + C, or ~A&B | C).'));
      const grid = h('div.fsm-eqs');
      for (const fn of d.functions) {
        const card = h('div.fsm-eq', { dataset: { fn: fn.name } });
        const map = h('div.fsm-kmap');
        map.innerHTML = kmapSvg(fn, A.shown[fn.name] ? fn.min.cubes : null);
        const inp = h('input', { type: 'text', spellcheck: 'false', value: A.text[fn.name] || '', 'aria-label': 'Equation for ' + fn.name, dataset: { fn: fn.name } });
        inp.addEventListener('input', () => { A.text[fn.name] = inp.value; });
        const v = h('div.fsm-verdict.small');
        const chk = h('button.btn.small', { type: 'button', title: 'Check ' + fn.name }, icon('check'), 'Check');
        chk.addEventListener('click', () => {
          if (!inp.value.trim()) { v.className = 'fsm-verdict small bad'; v.textContent = 'Write ' + fn.name + ' first.'; return; }
          const r = F().check.equation(d, fn.name, inp.value);
          v.className = 'fsm-verdict small ' + (r.ok ? 'good' : 'bad'); v.textContent = r.say;
          A.ok = A.ok || {}; A.ok[fn.name] = r.ok;
          if (d.functions.every((g) => A.ok[g.name])) { this.verdicts.equations = true; this.renderSteps(); }
        });
        const rev = h('button.btn.small', { type: 'button', title: 'Reveal ' + fn.name }, icon('eye'), 'Reveal');
        rev.addEventListener('click', () => { A.shown[fn.name] = true; A.text[fn.name] = fn.min.text; A.ok = A.ok || {}; A.ok[fn.name] = true; this.renderStage(); });
        card.append(h('div.fsm-eq-head', h('b', fn.name), h('span.muted', ' over ' + fn.vars.join(', '))), map, h('div.fsm-eq-row', h('span.mono', fn.name + ' ='), inp), h('div.fsm-acts', chk, rev), v);
        if (A.shown[fn.name]) { v.className = 'fsm-verdict small good'; v.textContent = fn.text + ' (' + fn.min.literals + ' literal' + (fn.min.literals === 1 ? '' : 's') + ').'; }
        grid.appendChild(card);
      }
      box.appendChild(grid);
      const all = h('button.btn.small', { type: 'button', id: 'fsmRevealAll' }, icon('eye'), 'Reveal every equation');
      all.addEventListener('click', () => { for (const fn of d.functions) { A.shown[fn.name] = true; A.text[fn.name] = fn.min.text; (A.ok = A.ok || {})[fn.name] = true; } this.verdicts.equations = true; this.renderStage(); this.renderSteps(); });
      box.appendChild(h('div.fsm-acts', all));
    }

    // 6. the circuit
    stage_circuit(box) {
      const d = this.design;
      box.appendChild(this.say(d.stages.circuit.say + ' Cost: ' + d.cost.say + '.'));
      const wrap = h('div.sk-wrap.fsm-circuit', { id: 'fsmCircuit' });
      try { const res = S.Layout.layout(d.circuit), st = this.app.settings.style; S.Render.into(wrap, res, { style: st }); requestAnimationFrame(() => { if (wrap.isConnected) S.Render.into(wrap, res, { style: st }); }); } catch (e) { wrap.appendChild(h('p.fsm-err', 'The circuit could not be drawn: ' + e.message)); }
      box.appendChild(h('div.fsm-circuit-box', wrap));
      const open = h('button.btn.primary', { type: 'button', id: 'fsmOpenCircuit' }, icon('gate'), 'Open in the circuit editor');
      open.addEventListener('click', () => this.openCircuit());
      const ver = F().verify(d, d.circuit);
      box.appendChild(h('div.fsm-acts', open, h('span.fsm-verdict.' + (ver.ok ? 'good' : 'bad'), ver.ok ? 'Checked: from every state and input the circuit gives the table\'s output and next code.' : ver.problems[0].say)));
      try {
        const u = F().unusedStates(d);
        box.appendChild(h('h4', 'Unused states'));
        box.appendChild(h('ol.fsm-trace', ...u.trace.map((t) => h('li', t.say))));
      } catch (e) { /* none to show */ }
    }
    openCircuit() {
      const d = this.design;
      if (!d) return;
      const c = F().design(this.machine, this.designOpts()).circuit;
      const title = (this.machine.type === 'moore' ? 'Moore' : 'Mealy') + ' machine (' + d.ff + ' flip-flops)';
      if (S.Build && S.Build.openCircuit) { S.Build.openCircuit(c, title); return; }
      S.UI.toast('The circuit editor is not available in this build.', 'err');
    }

    onKey(e, typing) {
      if (typing) return false;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) this.doRedo(); else this.doUndo(); return true; }
      if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); this.doRedo(); return true; }
      if (mod || e.altKey) return false;
      if (e.key === 'Delete' || e.key === 'Backspace') { if (this.editor.deleteSelected()) { e.preventDefault(); return true; } return false; }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); this.editor.addState(); return true; }
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); this.btnArrow.click(); return true; }
      if (e.key === 'Escape') { this.editor.select({}); return true; }
      return false;
    }
    redraw() { this.editor.render(); if (this.flow.stage === 5) this.renderStage(); }
    dispose() { this.save(); if (S.FsmPage.page === this) S.FsmPage.page = null; }
  }
  FsmPage.prototype.keys = [['State diagram', [['Double-click', 'A new state (on a state: rename it)'], ['Drag the rim', 'An arrow to another state, or a loop'], ['N', 'Add a state'], ['A', 'Arrow mode'], ['Del', 'Delete the selected state or arrow'], ['Ctrl  Z  Y', 'Undo, redo']]]];

  // ---- a K-map of one function -------------------------------------------------------------------------------
  const GRAY = { 1: ['0', '1'], 2: ['00', '01', '11', '10'] };
  function kmapSvg(fn, cubes) {
    const n = fn.vars.length;
    if (n > 4) {
      return '<p class="muted small">' + n + ' variables: too many for one map here; the minimiser\'s result is used.</p>';
    }
    const rv = Math.floor(n / 2), cv = n - rv;
    const rows = rv ? GRAY[rv] : [''], cols = GRAY[cv];
    const C = 34, x0 = 54, y0 = 48;
    const W = x0 + cols.length * C + 12, H = y0 + rows.length * C + 12;
    const name = (vs) => vs.join('');
    let s = `<svg class="kmap" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="K-map of ${fn.name}">`;
    s += `<text class="km-axis" x="${x0 - 6}" y="${y0 - 30}" text-anchor="end" dominant-baseline="central">${name(fn.vars.slice(0, rv))}</text>`;
    s += `<text class="km-axis" x="${x0 + 4}" y="${y0 - 30}" text-anchor="start" dominant-baseline="central">${name(fn.vars.slice(rv))}</text>`;
    cols.forEach((c, j) => { s += `<text class="km-head" x="${x0 + j * C + C / 2}" y="${y0 - 8}" text-anchor="middle" dominant-baseline="central">${c}</text>`; });
    rows.forEach((r, i) => { if (r) s += `<text class="km-head" x="${x0 - 8}" y="${y0 + i * C + C / 2}" text-anchor="end" dominant-baseline="central">${r}</text>`; });
    rows.forEach((r, i) => cols.forEach((c, j) => {
      const mt = parseInt(r + c, 2);
      const v = fn.ones.includes(mt) ? '1' : fn.dc.includes(mt) ? 'X' : '0';
      s += `<rect class="km-cell${v === '1' ? ' one' : v === 'X' ? ' dc' : ''}" data-audit="node" x="${x0 + j * C}" y="${y0 + i * C}" width="${C}" height="${C}"/>`;
      s += `<text class="km-v${v === '0' ? ' zero' : ''}" x="${x0 + j * C + C / 2}" y="${y0 + i * C + C / 2}" text-anchor="middle" dominant-baseline="central">${v}</text>`;
    }));
    if (cubes) cubes.forEach((cube, k) => {
      const rowsIn = rows.map((r, i) => [r, i]).filter(([r]) => fits(cube.slice(0, rv), r)).map(([, i]) => i);
      const colsIn = cols.map((c, j) => [c, j]).filter(([c]) => fits(cube.slice(rv), c)).map(([, j]) => j);
      const pad = 3 + (k % 3) * 2;
      for (const rr of runs(rowsIn)) for (const cc of runs(colsIn)) {
        s += `<rect class="km-group g${k % 6}" data-audit="overlap-ok" x="${x0 + cc[0] * C + pad}" y="${y0 + rr[0] * C + pad}" width="${(cc[1] - cc[0] + 1) * C - 2 * pad}" height="${(rr[1] - rr[0] + 1) * C - 2 * pad}" rx="9"/>`;
      }
    });
    return s + '</svg>';
  }
  const fits = (pat, code) => { for (let i = 0; i < pat.length; i++) if (pat[i] !== '-' && pat[i] !== code[i]) return false; return true; };
  /** the runs of consecutive indexes: [[a, b], ...] */
  const runs = (xs) => { const out = []; for (const x of xs) { const last = out[out.length - 1]; if (last && last[1] === x - 1) last[1] = x; else out.push([x, x]); } return out; };

  // ---- registration --------------------------------------------------------------------------------------------
  S.FsmPage = {
    page: null, SAMPLES, symbols, parseLabel, toMachine, fromMachine, renameState, kmapSvg,
    /** load a sample into the open page (for the checks and the tests) */
    loadSample(k) { if (S.FsmPage.page) S.FsmPage.page.loadSample(k); },
  };
  S.Pages.register('fsm', {
    title: 'State machine workbench', nav: 'build',
    open(app, main) { return new FsmPage(app, main); },
    load(data) { if (data && data.model) store.set('fsm', { model: data.model, flow: data.flow || {} }); },
  });
  const scene = (name, sample, stage, extra) => S.Checks.push({ group: 'fsm', name, hash: 'fsm', sel: '#main',
    setup: `if (!Sirkit.FsmPage.page) { location.hash = 'fsm'; await new Promise((r) => { const w = () => (Sirkit.FsmPage.page ? r() : setTimeout(w, 30)); w(); }); } Sirkit.FsmPage.loadSample('${sample}'); const p = Sirkit.FsmPage.page; ${extra || ''} p.go(${stage}); await new Promise((r) => setTimeout(r, 60));`,
    ready: 'Sirkit.FsmPage.page && document.querySelector("#fsmStage")' });
  scene('fsm: Moore sample, state table', 'fall', 0);
  scene('fsm: Mealy 1001 detector, state table', 'det1001', 0, "document.getElementById('fsmReveal').click();");
  scene('fsm: reduce, implication table', 'spare', 1, "p.go(1); document.getElementById('fsmReveal').click();");
  scene('fsm: assignment and costs', 'det1001', 2);
  scene('fsm: excitation (JK)', 'fall', 3, "p.flow.ff = 'JK'; p.recompute(); p.go(3); document.getElementById('fsmReveal').click();");
  scene('fsm: equations and K-maps', 'det1001', 4, "p.go(4); document.getElementById('fsmRevealAll').click();");
  scene('fsm: circuit', 'fall', 5);
})(globalThis.Sirkit = globalThis.Sirkit || {});
