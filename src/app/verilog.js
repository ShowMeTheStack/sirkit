// The Verilog page: files in tabs, an editor with highlighting, line numbers and error marks checked as you
// type, Run (the $display console and the waveform viewer), Synthesise (the module drawn by the layout
// engine, and opened in the circuit editor), export of the editor's circuit as structural Verilog, example
// projects, .v and .vcd files, share links and autosave. Everything engine-side goes through the small
// adapter below, so the page works with as much of Sirkit.Verilog as is there and says plainly what is not.
(function (S) {
  'use strict';
  /** 'a' or 'an' before a word as it is read aloud (an AND, an xor, an 8-bit, a NAND, a reg) */
  const an = (w) => (/^(?:[aeiou]|x(?:n?or)\b|nmos|rnmos|rtran|rcmos|rpmos|8|11(?!\d)|18(?!\d))/i.test(String(w)) ? 'an ' : 'a ');
  const { h, icon } = S.UI;
  const store = S.UI.storage;
  const LH = 20; // the editor's line height in px (kept in step with styles-verilog.css)

  // ---- the engine, as far as it goes ----------------------------------------------------------------------
  const VE = {
    V: () => S.Verilog || {},
    canCheck() { const V = VE.V(); return !!(V.compile || (V.lex && V.parse)); },
    canRun() { const V = VE.V(); return !!(V.compile && V.simulate); },
    canSynth() { const V = VE.V(); return !!(V.compile && (V.synthesise || V.synthesize)); },
    canExport() { return true; },
    /** modules as plain records {name, ports, insts, line} from whatever the engine gives */
    norm(mods) {
      const list = Array.isArray(mods) ? mods : mods instanceof Map ? [...mods.values()] : Object.values(mods || {});
      return list.filter(Boolean).map((m) => {
        const ast = m.ast || m.decl || m;
        const insts = new Set();
        const walk = (x) => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) { x.forEach(walk); return; } if (x.k === 'inst' && x.module) insts.add(x.module); for (const k of ['items', 'body', 'stmts', 'then', 'else', 'genItems', 'block']) if (x[k]) walk(x[k]); };
        walk(ast.items);
        return { name: m.name || ast.name, ports: (ast.ports || []).filter((p) => p && p.name), insts: [...insts], line: ast.line || 0, raw: m };
      }).filter((m) => m.name);
    },
    /** parse (and compile, when it can) the joined source: {modules, errors, compiled} */
    check(src) {
      const V = VE.V();
      if (V.compile) {
        try { const r = V.compile(src, {}); return { modules: VE.norm(r.modules), errors: (r.errors || []).map(VE.err), warnings: (r.warnings || []).map(VE.err), tops: r.tops || null, compiled: r }; }
        catch (e) { return { modules: [], errors: [VE.err(e)] }; }
      }
      if (V.lex && V.parse) {
        try { const l = V.lex(src, {}); const p = V.parse(l.toks, {}); return { modules: VE.norm(p.modules), errors: l.errors.concat(p.errors).map(VE.err) }; }
        catch (e) { return { modules: [], errors: [VE.err(e)] }; }
      }
      return null;
    },
    err: (e) => ({ line: +e.line || 0, col: +e.col || 0, msg: String(e.msg || e.message || e), file: e.file || null }),
    /** run the design from top: {output: [lines], waves: Map, widths: Map, end, errors} */
    run(src, top, until) {
      const V = VE.V();
      const r = V.compile(src, { top });
      if (r.errors && r.errors.length) return { errors: r.errors.map(VE.err) };
      let design = r;
      if (V.elaborate) {
        const tries = [() => V.elaborate(r, { top }), () => V.elaborate(top, r), () => V.elaborate(r.modules, top)];
        let last = null;
        for (const t of tries) { try { design = t(); if (design) break; } catch (e) { last = e; design = null; } }
        if (!design) return { errors: [VE.err(last || new Error('the design could not be elaborated'))] };
        if (design.errors && design.errors.length) return { errors: design.errors.map(VE.err) };
      }
      const res = V.simulate(design, { until, top });
      if (res.errors && res.errors.length && !res.waves) return { errors: res.errors.map(VE.err) };
      let output = res.output || res.display || res.lines || res.stdout || [];
      if (typeof output === 'string') output = output.replace(/\n$/, '').split('\n');
      let waves = res.waves || new Map();
      if (!(waves instanceof Map)) waves = new Map(Object.entries(waves));
      const widths = new Map();
      for (const sg of (design && design.signals) || []) for (const a of [sg.path].concat(sg.aliases || [])) widths.set(a, sg.width || 1);
      const wsrc = res.widths || res.signals;
      if (wsrc) for (const [k, v] of wsrc instanceof Map ? wsrc : Object.entries(wsrc)) widths.set(k, typeof v === 'number' ? v : (v && (v.width || v.w)) || 1);
      for (const [k, ch] of waves) if (!widths.has(k)) { const v = ch.length ? ch[ch.length - 1][1] : 0; widths.set(k, v && v.w ? v.w : typeof v === 'string' ? v.length : Array.isArray(v) ? v.length : 1); }
      // engine vectors become bit strings for the viewer
      const plain = new Map();
      for (const [k, ch] of waves) plain.set(k, ch.map(([t, v]) => [Number(t), v && typeof v.toBits === 'function' ? v.toBits() : v]));
      let end = res.time != null ? Number(res.time) : res.end != null ? Number(res.end) : 0;
      for (const ch of plain.values()) if (ch.length) end = Math.max(end, ch[ch.length - 1][0]);
      return { output, waves: plain, widths, end, vcd: typeof res.vcd === 'function' ? res.vcd : null, finished: res.finished, warnings: (res.warnings || []).map(VE.err), runtime: (res.errors || []).map(VE.err) };
    },
    /** a module as a circuit: {circuit} or {reasons} */
    synth(src, name) {
      const V = VE.V();
      const r = V.compile(src, { top: name });
      if (r.errors && r.errors.length) return { errors: r.errors.map(VE.err) };
      const fn = V.synthesise || V.synthesize;
      let out;
      try { out = fn(r, { top: name }); } catch (e) { return { reasons: [String(e.message || e)] }; }
      const say = (x) => (typeof x === 'string' ? x : (x.line ? 'line ' + x.line + ': ' : '') + (x.msg || x.message || String(x)));
      if (!out) return { reasons: ['the module could not be turned into a circuit'] };
      if (out.parts && out.nets) return { circuit: out, notes: (out.notes || []).map(say) };
      if (out.circuit) return { circuit: out.circuit, notes: (out.notes || out.warnings || []).map(say) };
      return { reasons: (out.reasons || out.errors || ['the module could not be turned into a circuit']).map(say) };
    },
    /** a drawn circuit as structural Verilog: the engine's writer, or a plain one here */
    fromCircuit(c) {
      const V = VE.V();
      if (V.fromCircuit) try { return V.fromCircuit(c); } catch (e) { /* the plain writer below */ }
      return writeStructural(c);
    },
  };

  /** structural Verilog for a Netlist.Circuit: ports, wires, gate primitives, and instances for the rest */
  function writeStructural(c) {
    const id = (s) => { let x = String(s).replace(/[^A-Za-z0-9_$]/g, '_'); if (!/^[A-Za-z_]/.test(x)) x = 'n_' + x; return x; };
    const rng = (w) => (w > 1 ? '[' + (w - 1) + ':0] ' : '');
    const ins = c.parts.filter((p) => p.type === 'IN' || p.type === 'CLOCK'), outs = c.parts.filter((p) => p.type === 'OUT');
    const netName = new Map();
    const used = new Set([...ins, ...outs].map((p) => id(p.params.name)));
    for (const p of ins) if (p.net.y) netName.set(p.net.y, id(p.params.name));
    for (const n of c.nets) if (!netName.has(n)) { let k = id(n.name || n.id), i = 2; while (used.has(k)) k = id(n.name || n.id) + '_' + i++; used.add(k); netName.set(n, k); }
    const nm = (p, pin) => (p.net[pin] ? netName.get(p.net[pin]) : null);
    const mod = id(c.title || 'circuit');
    let s = '// ' + (c.title || 'circuit') + ', written from the drawn circuit\nmodule ' + mod + ' (\n';
    const ports = ins.map((p) => '  input  wire ' + rng(p.params.w || 1) + id(p.params.name)).concat(outs.map((p) => '  output wire ' + rng(p.params.w || 1) + id(p.params.name)));
    s += ports.join(',\n') + '\n);\n';
    const wires = c.nets.filter((n) => !ins.some((p) => p.net.y === n));
    for (const n of wires) s += '  wire ' + rng(n.width || 1) + netName.get(n) + ';\n';
    if (wires.length) s += '\n';
    const G = { AND: 'and', OR: 'or', NAND: 'nand', NOR: 'nor', XOR: 'xor', XNOR: 'xnor', NOT: 'not', BUF: 'buf' };
    for (const p of c.parts) {
      if (p.type === 'IN' || p.type === 'CLOCK') continue;
      if (p.type === 'OUT') { const a = nm(p, 'a'); s += '  assign ' + id(p.params.name) + ' = ' + (a || "1'bz") + ';\n'; continue; }
      if (p.type === 'CONST') { const y = nm(p, 'y'); if (y) s += '  assign ' + y + ' = ' + (p.params.w || 1) + "'d" + (+p.params.value || 0) + ';\n'; continue; }
      if (G[p.type]) {
        const args = [nm(p, 'y') || ''].concat(p.pins.filter((q) => q.dir === 'in').map((q) => nm(p, q.name) || "1'bx"));
        s += '  ' + G[p.type] + ' ' + id(p.id) + ' (' + args.join(', ') + ');\n';
        continue;
      }
      const conns = p.pins.map((q) => '.' + id(q.name) + '(' + (nm(p, q.name) || '') + ')');
      s += '  ' + id(p.type.toLowerCase()) + ' ' + id(p.id) + ' (' + conns.join(', ') + ');  // ' + an(p.type) + p.type + ': supply this module\n';
    }
    return s + 'endmodule\n';
  }

  // ---- highlighting -----------------------------------------------------------------------------------------
  const KW = () => (S.Verilog && S.Verilog.KEYWORDS) || new Set('module endmodule input output inout wire reg integer assign always initial begin end if else case casez casex endcase default for while repeat forever posedge negedge or and not nand nor xor xnor buf parameter localparam function endfunction task endtask generate endgenerate genvar signed'.split(' '));
  const TOK = /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:[^"\\\n]|\\.)*"?|`[A-Za-z_]\w*|\$[A-Za-z_][\w$]*|\d*\s*'[sS]?[bBoOdDhH]\s*[0-9a-fA-FxXzZ_?]+|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b|[A-Za-z_][\w$]*|[^\s]/g;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function highlight(text, marks) {
    const n = text.length, cls = new Array(n).fill(''), err = new Uint8Array(n);
    const kw = KW();
    TOK.lastIndex = 0;
    let m;
    while ((m = TOK.exec(text))) {
      const t = m[0];
      const c = t.startsWith('//') || t.startsWith('/*') ? 'vk-com' : t[0] === '"' ? 'vk-str' : t[0] === '`' ? 'vk-dir' : t[0] === '$' ? 'vk-sys' : /^\d|'/.test(t) ? 'vk-num' : /^[A-Za-z_]/.test(t) ? (kw.has(t) ? 'vk-kw' : '') : /[=<>!&|^~+\-*/%?:]/.test(t) ? 'vk-op' : '';
      if (c) for (let i = m.index; i < m.index + t.length; i++) cls[i] = c;
    }
    for (const [a, b] of marks) for (let i = a; i < Math.min(b, n); i++) err[i] = 1;
    let out = '', i = 0;
    while (i < n) {
      let j = i + 1;
      while (j < n && cls[j] === cls[i] && err[j] === err[i] && text[j] !== '\n' && text[i] !== '\n') j++;
      const seg = esc(text.slice(i, j));
      const c = (cls[i] ? cls[i] : '') + (err[i] ? ' vk-err' : '');
      out += c.trim() && text[i] !== '\n' ? '<span class="' + c.trim() + '">' + seg + '</span>' : seg;
      i = j;
    }
    return out + '\n';
  }

  // ---- the page ---------------------------------------------------------------------------------------------
  const DEFAULT = () => { const ex = S.VerilogExamples[0]; return { files: ex.files.map((f) => ({ name: f.name, text: f.text })), active: 0, top: '', example: ex.id }; };
  const load = () => { const d = store.get('verilog', null); return d && Array.isArray(d.files) && d.files.length ? d : DEFAULT(); };

  class Page {
    constructor(app, main) {
      this.app = app;
      this.st = load();
      if (this.st.active >= this.st.files.length) this.st.active = 0;
      this.errors = []; this.modules = []; this.ranOnce = false; this.synthDone = false; this.view = 'run';
      this.build(main);
      this.openFile(this.st.active);
      this.check();
      S.VerilogPage = this;
    }
    save() { if (this.app.settings.autosave !== false) store.set('verilog', this.st); }
    // ---- frame
    build(main) {
      const btn = (cls, id, ic, label, title, fn) => { const b = h('button.btn' + cls, { type: 'button', id, title }, icon(ic), h('span.lbl', label)); b.addEventListener('click', fn); return b; };
      this.btnRun = btn('.primary', 'vlRun', 'run', 'Run', 'Run the top module (Ctrl+Enter)', () => this.run());
      this.btnSynth = btn('', 'vlSynth', 'build', 'Synthesise', 'Draw a module as a circuit', () => this.synth());
      this.topSel = h('select', { id: 'vlTop', 'aria-label': 'Top module', title: 'The module Run starts from' });
      this.topSel.addEventListener('change', () => { this.st.top = this.topSel.value; this.save(); });
      const exBtn = btn('', 'vlExamples', 'book', 'Examples', 'Example projects', () => this.examplesMenu(exBtn));
      const moreBtn = h('button.icon-btn.vl-more', { type: 'button', id: 'vlMore', title: 'Files, export and share', 'aria-label': 'More' }, icon('more'));
      moreBtn.addEventListener('click', () => this.moreMenu(moreBtn));
      this.tabs = h('div.vl-tabs', { id: 'vlTabs', role: 'tablist', 'aria-label': 'Files' });
      // the editor
      this.gut = h('div.vl-gut', { 'aria-hidden': 'true' });
      this.hl = h('pre.vl-hl.ed-hl', { 'aria-hidden': 'true' });
      this.ta = h('textarea.vl-ta', { id: 'vlCode', spellcheck: 'false', wrap: 'off', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Verilog source' });
      this.ta.addEventListener('input', () => this.onEdit());
      this.ta.addEventListener('keydown', (e) => this.taKey(e));
      this.code = h('div.vl-code', this.hl, this.ta);
      this.scroller = h('div.vl-scroll', { id: 'vlEd' }, h('div.vl-lines', this.gut, this.code));
      this.scroller.addEventListener('scroll', () => this.affordance(), { passive: true });
      // a click below the last line puts the caret at the end
      this.scroller.addEventListener('mousedown', (e) => { if (e.target !== this.ta && !this.gut.contains(e.target)) { e.preventDefault(); this.ta.focus(); const n = this.ta.value.length; this.ta.setSelectionRange(n, n); } });
      this.status = h('div.vl-status', { id: 'vlStatus', 'aria-live': 'polite' });
      this.probs = h('ul.vl-probs', { id: 'vlProbs' });
      // the results
      this.seg = h('div.seg.vl-seg', { role: 'tablist' });
      for (const [k, l] of [['run', 'Run'], ['circuit', 'Circuit']]) {
        const b = h('button', { type: 'button', role: 'tab', dataset: { view: k }, id: 'vlView-' + k }, l);
        b.addEventListener('click', () => this.show(k));
        this.seg.appendChild(b);
      }
      this.console = h('div.vl-console', { id: 'vlConsole', role: 'log', 'aria-label': 'Output' });
      this.waveBox = h('div.vl-wave', { id: 'vlWave' });
      this.runPane = h('div.vl-pane.vl-runpane', h('div.vl-sub', h('b', 'Console'), h('span.muted.vl-runinfo', { id: 'vlRunInfo' })), this.console, h('div.vl-sub', h('b', 'Waveforms'), h('span.muted', { id: 'vlWaveInfo' })), this.waveBox);
      this.synthSel = h('select', { id: 'vlSynthMod', 'aria-label': 'Module to draw' });
      this.synthSel.addEventListener('change', () => this.synth());
      this.circBox = h('div.vl-circ', { id: 'vlCirc' });
      this.openEd = h('button.btn.small', { type: 'button', id: 'vlOpenEditor', disabled: true }, icon('gate'), 'Open in the editor');
      this.openEd.addEventListener('click', () => this.openInEditor());
      // the circuit as blocks (registers, counters, sums of products) or every bit as gates and flip-flops
      this.levelSeg = h('div.seg.vl-level', { role: 'radiogroup', 'aria-label': 'How the circuit is drawn' });
      this.level = 'blocks';
      for (const [k, l, tip] of [['blocks', 'Blocks', 'Registers and counters as blocks'], ['gates', 'Gates', 'Every bit as gates and flip-flops']]) {
        const b = h('button', { type: 'button', role: 'radio', id: 'vlLevel-' + k, dataset: { level: k }, title: tip, 'aria-checked': String(k === this.level) }, l);
        b.classList.toggle('on', k === this.level);
        b.addEventListener('click', () => this.setLevel(k));
        this.levelSeg.appendChild(b);
      }
      this.circPane = h('div.vl-pane.vl-circpane', h('div.vl-sub', h('b', 'Module'), this.synthSel, this.levelSeg, this.openEd), this.circBox);
      this.root = h('div.vl', { id: 'verilogView' },
        this.app.workTabs ? null : null,
        h('div.vl-head', h('div', h('h1.page-title', 'Verilog'), h('p.lead.vl-lead', 'Write modules and testbenches, run them on the simulator, and see synthesisable code drawn as a circuit.')),
          h('div.vl-actions', this.btnRun, this.btnSynth, h('label.vl-toplab', h('span', 'Top'), this.topSel), exBtn, moreBtn)),
        this.notice = h('div.notice.vl-notice.hidden', { id: 'vlNotice' }),
        h('div.vl-grid',
          h('section.card.vl-edit', this.tabs, this.scroller, this.status, this.probs),
          h('section.card.vl-out', h('div.vl-outhead', this.seg), this.runPane, this.circPane)));
      main.appendChild(this.root);
      this.show('run');
      this.engineNotice();
      this.emptyRun();
      this.emptyCirc();
    }
    engineNotice() {
      const miss = [];
      if (!VE.canCheck()) miss.push('checking');
      if (!VE.canRun()) miss.push('running');
      if (!VE.canSynth()) miss.push('synthesis');
      this.notice.innerHTML = '';
      if (miss.length) { this.notice.append(icon('info'), h('span', 'The Verilog engine is still being built: ' + miss.join(', ') + (miss.length > 1 ? ' are' : ' is') + ' not ready yet. You can write, open and save files now.')); this.notice.classList.remove('hidden'); }
      else this.notice.classList.add('hidden');
      this.btnRun.disabled = !VE.canRun();
      this.btnSynth.disabled = !VE.canSynth();
      this.btnRun.title = VE.canRun() ? 'Run the top module (Ctrl+Enter)' : 'Running needs the Verilog simulator, which is still being built';
      this.btnSynth.title = VE.canSynth() ? 'Draw a module as a circuit' : 'Synthesis is still being built';
    }
    show(k) {
      this.view = k;
      for (const b of this.seg.children) { const on = b.dataset.view === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
      this.runPane.classList.toggle('hidden', k !== 'run');
      this.circPane.classList.toggle('hidden', k !== 'circuit');
      if (k === 'run' && this.wave && this.wave.render) try { this.wave.render(); } catch (e) { /* drawn next time */ }
    }
    // ---- files
    renderTabs() {
      this.tabs.innerHTML = '';
      this.st.files.forEach((f, i) => {
        const errs = this.errors.filter((e) => e.fi === i).length;
        const b = h('button.vl-tab' + (i === this.st.active ? '.on' : '') + (errs ? '.bad' : ''), { type: 'button', role: 'tab', 'aria-selected': String(i === this.st.active), dataset: { i: String(i) }, title: f.name + (errs ? ' · ' + errs + ' problem' + (errs > 1 ? 's' : '') : '') + ' (double-click to rename)' }, h('span.vl-tabname', f.name));
        b.addEventListener('click', () => this.openFile(i));
        b.addEventListener('dblclick', () => this.rename(i));
        if (this.st.files.length > 1) {
          const x = h('span.vl-tabx', { role: 'button', 'aria-label': 'Close ' + f.name, title: 'Delete this file' }, '×');
          x.addEventListener('click', (e) => { e.stopPropagation(); this.remove(i); });
          b.appendChild(x);
        }
        this.tabs.appendChild(b);
      });
      const add = h('button.vl-tab.vl-add', { type: 'button', id: 'vlAddFile', title: 'A new file', 'aria-label': 'New file' }, icon('plus'));
      add.addEventListener('click', () => this.newFile());
      this.tabs.appendChild(add);
      S.UI.scrollRow(this.tabs);
    }
    openFile(i) {
      this.st.active = Math.max(0, Math.min(i, this.st.files.length - 1));
      this.ta.value = this.st.files[this.st.active].text;
      this.renderTabs();
      this.paint();
      this.scroller.scrollTop = 0; this.scroller.scrollLeft = 0;
      this.save();
    }
    uniqueName(base) { let n = base, k = 2; while (this.st.files.some((f) => f.name === n)) n = base.replace(/(\.v)?$/, '_' + k++ + '.v'); return n; }
    async newFile() {
      const name = await S.UI.prompt('A new file', 'File name', this.uniqueName('untitled.v'), { ok: 'Create' });
      if (!name) return;
      const nm = this.uniqueName(/\.v$/.test(name) ? name.trim() : name.trim() + '.v');
      this.st.files.push({ name: nm, text: '// ' + nm + '\nmodule ' + nm.replace(/\.v$/, '').replace(/[^A-Za-z0-9_]/g, '_') + ' (\n  input  wire a,\n  output wire y\n);\n  assign y = ~a;\nendmodule\n' });
      this.openFile(this.st.files.length - 1);
      this.check();
    }
    async rename(i) {
      const f = this.st.files[i];
      const name = await S.UI.prompt('Rename the file', 'File name', f.name, { ok: 'Rename' });
      if (!name || name === f.name) return;
      f.name = this.uniqueName(/\.v[h]?$/.test(name) ? name.trim() : name.trim() + '.v');
      this.renderTabs(); this.save();
    }
    async remove(i) {
      const f = this.st.files[i];
      const ok = await S.UI.confirm('Delete ' + f.name + '?', 'The file and its text go. Undo is not possible.', 'Delete');
      if (!ok) return;
      this.st.files.splice(i, 1);
      this.openFile(Math.min(this.st.active, this.st.files.length - 1));
      this.check();
    }
    // ---- editing
    onEdit() {
      this.st.files[this.st.active].text = this.ta.value;
      this.paint();
      this.save();
      clearTimeout(this.ckTimer);
      this.ckTimer = setTimeout(() => this.check(), 280);
    }
    taKey(e) {
      if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const ta = this.ta, a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
        if (a === b && !e.shiftKey) { ta.value = v.slice(0, a) + '  ' + v.slice(b); ta.selectionStart = ta.selectionEnd = a + 2; }
        else {
          const ls = v.lastIndexOf('\n', a - 1) + 1, block = v.slice(ls, b);
          const nb = e.shiftKey ? block.replace(/^ {1,2}/gm, '') : block.replace(/^/gm, '  ');
          ta.value = v.slice(0, ls) + nb + v.slice(b);
          ta.selectionStart = ls; ta.selectionEnd = ls + nb.length;
        }
        this.onEdit();
      } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        // keep the indent of the line above
        const ta = this.ta, a = ta.selectionStart, v = ta.value;
        const ls = v.lastIndexOf('\n', a - 1) + 1, ind = /^[ \t]*/.exec(v.slice(ls, a))[0];
        if (ind) { e.preventDefault(); ta.value = v.slice(0, a) + '\n' + ind + v.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = a + 1 + ind.length; this.onEdit(); }
      }
    }
    /** the highlighted copy, the gutter and the size of the text box, with this file's error marks */
    paint() {
      const text = this.ta.value, lines = text.split('\n');
      const errs = this.errors.filter((e) => e.fi === this.st.active);
      const starts = [0];
      for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
      const marks = errs.map((e) => {
        const ln = Math.max(1, Math.min(e.ln, lines.length)), s = starts[ln - 1], line = lines[ln - 1] || '';
        if (!e.col) return [s, s + Math.max(1, line.length)];
        let c = Math.min(Math.max(1, e.col), line.length + 1) - 1;
        if (!line.slice(c).trim()) {
          // past the end of the line (a missing ';'): mark the last word before it
          const before = line.slice(0, c).replace(/\s+$/, ''), m = /[\w$`']+$|\S$/.exec(before);
          if (m) return [s + m.index, s + before.length];
        }
        const w = /^[\w$`']+/.exec(line.slice(c)) || /^\S/.exec(line.slice(c));
        return [s + c, s + c + Math.max(1, w ? w[0].length : 1)];
      });
      this.hl.innerHTML = highlight(text, marks);
      const bad = new Map();
      for (const e of errs) { const k = Math.max(1, Math.min(e.ln, lines.length)); if (!bad.has(k)) bad.set(k, e.msg); }
      let g = '';
      for (let i = 1; i <= lines.length; i++) g += bad.has(i) ? '<div class="vl-ln bad" title="' + esc(bad.get(i)).replace(/"/g, '&quot;') + '">' + i + '</div>' : '<div class="vl-ln">' + i + '</div>';
      this.gut.innerHTML = g;
      const longest = lines.reduce((m, l) => Math.max(m, l.replace(/\t/g, '    ').length), 0);
      const hpx = lines.length * LH + 20;
      this.code.style.height = this.ta.style.height = hpx + 'px';
      this.code.style.width = 'calc(' + (longest + 2) + 'ch + 26px)';
      this.affordance();
    }
    affordance() {
      const s = this.scroller, over = s.scrollWidth > s.clientWidth + 1;
      if (over) s.dataset.scrollAffordance = 'sideways'; else delete s.dataset.scrollAffordance;
      s.classList.toggle('more-right', over && s.scrollLeft + s.clientWidth < s.scrollWidth - 2);
    }
    /** the joined source of every file, and where each file starts */
    source() {
      let src = '', line = 1;
      const at = [];
      for (const f of this.st.files) {
        at.push(line);
        const t = f.text.endsWith('\n') ? f.text : f.text + '\n';
        src += t; line += t.split('\n').length - 1;
      }
      return { src, at };
    }
    locate(e, at) {
      let fi = this.st.active, ln = e.line;
      if (e.file != null) { const k = this.st.files.findIndex((f) => f.name === e.file); if (k >= 0) return Object.assign({}, e, { fi: k, ln }); }
      if (e.line > 0) for (let i = at.length - 1; i >= 0; i--) if (e.line >= at[i]) { fi = i; ln = e.line - at[i] + 1; break; }
      return Object.assign({}, e, { fi, ln: ln || 1 });
    }
    check() {
      this.engineNotice();
      const { src, at } = this.source();
      const r = VE.check(src);
      if (!r) { this.errors = []; this.modules = []; this.renderProblems(null); this.paint(); this.renderTops(); return; }
      this.errors = r.errors.map((e) => this.locate(e, at));
      this.modules = r.modules;
      this.tops = r.tops || null;
      this.renderProblems(r);
      this.renderTabs();
      this.paint();
      this.renderTops();
    }
    renderProblems(r) {
      this.probs.innerHTML = '';
      this.status.className = 'vl-status';
      if (!r) { this.status.textContent = this.st.files.length + ' file' + (this.st.files.length > 1 ? 's' : '') + '. Checking waits for the Verilog engine.'; return; }
      const nm = this.modules.length;
      if (!this.errors.length) {
        this.status.classList.add('ok');
        this.status.textContent = nm + ' module' + (nm === 1 ? '' : 's') + (nm ? ': ' + this.modules.map((m) => m.name).join(', ') : '') + '. No errors.';
        return;
      }
      this.status.classList.add('bad');
      this.status.textContent = this.errors.length + ' problem' + (this.errors.length > 1 ? 's' : '') + ' to fix';
      for (const e of this.errors) {
        const f = this.st.files[e.fi];
        const b = h('button.vl-prob', { type: 'button' }, h('span.vl-where', f.name + ':' + e.ln + (e.col ? ':' + e.col : '')), h('span', e.msg));
        b.addEventListener('click', () => this.goTo(e));
        this.probs.appendChild(h('li', b));
      }
    }
    goTo(e) {
      if (e.fi !== this.st.active) this.openFile(e.fi);
      const lines = this.ta.value.split('\n');
      let pos = 0;
      for (let i = 0; i < Math.min(e.ln - 1, lines.length); i++) pos += lines[i].length + 1;
      pos += Math.max(0, Math.min((e.col || 1) - 1, (lines[e.ln - 1] || '').length));
      this.ta.focus();
      this.ta.setSelectionRange(pos, pos);
      this.scroller.scrollTop = Math.max(0, (e.ln - 4) * LH);
      const x = ((e.col || 1) - 1) * 8;
      if (x < this.scroller.scrollLeft || x > this.scroller.scrollLeft + this.scroller.clientWidth - 80) this.scroller.scrollLeft = Math.max(0, x - 80);
    }
    /** the module Run starts from when none is chosen: one no other module uses, with no ports if possible */
    autoTop() {
      const used = new Set(this.modules.flatMap((m) => m.insts));
      const roots = this.tops && this.tops.length ? this.modules.filter((m) => this.tops.includes(m.name)) : this.modules.filter((m) => !used.has(m.name));
      const pick = roots.find((m) => !m.ports.length) || roots[roots.length - 1] || this.modules[this.modules.length - 1];
      return pick ? pick.name : '';
    }
    topName() { return this.st.top && this.modules.some((m) => m.name === this.st.top) ? this.st.top : this.autoTop(); }
    /** the module Synthesise draws by default: what the top instantiates first, or the top itself */
    dutName() {
      const top = this.modules.find((m) => m.name === this.topName());
      if (!top) return '';
      if (top.ports.length) return top.name;
      return top.insts.find((n) => this.modules.some((m) => m.name === n)) || top.name;
    }
    renderTops() {
      const names = this.modules.map((m) => m.name);
      const auto = this.autoTop();
      this.topSel.innerHTML = '';
      this.topSel.appendChild(h('option', { value: '' }, auto ? 'auto: ' + auto : 'auto'));
      for (const n of names) this.topSel.appendChild(h('option', { value: n, selected: this.st.top === n }, n));
      const cur = this.synthSel.value || this.dutName();
      this.synthSel.innerHTML = '';
      for (const n of names) this.synthSel.appendChild(h('option', { value: n, selected: n === cur }, n));
    }
    // ---- running
    emptyRun() {
      this.console.innerHTML = '';
      this.console.appendChild(h('div.vl-empty', VE.canRun() ? 'Run the design to see its $display and $monitor output here.' : 'Output appears here once the Verilog simulator is ready.'));
      this.waveBox.innerHTML = '';
      this.waveBox.appendChild(h('div.vl-empty', 'The signals of the top module appear here after a run.'));
      if (this.wave && this.wave.dispose) this.wave.dispose();
      this.wave = null;
      document.getElementById('vlRunInfo') && (document.getElementById('vlRunInfo').textContent = '');
    }
    emptyCirc() {
      this.circBox.innerHTML = '';
      this.circBox.appendChild(h('div.vl-empty', VE.canSynth() ? 'Synthesise a module to see it drawn as a circuit.' : 'Synthesis is still being built: a synthesisable module will be drawn here.'));
    }
    async run() {
      this.check();
      this.show('run');
      if (this.errors.length) { this.console.innerHTML = ''; this.console.appendChild(h('div.vl-line.err', 'Fix the ' + this.errors.length + ' problem' + (this.errors.length > 1 ? 's' : '') + ' in the code first.')); this.ranOnce = true; return; }
      if (!VE.canRun()) { this.ranOnce = true; S.UI.toast('Running needs the Verilog simulator, which is still being built.', 'err'); return; }
      const top = this.topName();
      const { src, at } = this.source();
      let r;
      const t0 = performance.now();
      try { r = VE.run(src, top, 1e6); } catch (e) { r = { errors: [VE.err(e)] }; }
      const ms = performance.now() - t0;
      this.console.innerHTML = '';
      this.ranOnce = true;
      if (r.errors && r.errors.length) {
        this.errors = r.errors.map((e) => this.locate(e, at));
        this.renderProblems({}); this.renderTabs(); this.paint();
        for (const e of r.errors) this.console.appendChild(h('div.vl-line.err', (e.line ? 'line ' + e.line + ': ' : '') + e.msg));
        return;
      }
      for (const l of r.output) this.console.appendChild(h('div.vl-line', String(l)));
      for (const w of (r.warnings || []).concat(r.runtime || [])) this.console.appendChild(h('div.vl-line.warn', w.msg));
      if (!r.output.length) this.console.appendChild(h('div.vl-empty', 'The run printed nothing.'));
      const info = document.getElementById('vlRunInfo');
      if (info) info.textContent = top + ', to ' + fmtT(r.end) + ' (' + Math.round(ms) + ' ms)';
      this.lastRun = r;
      this.drawWaves(r, top);
    }
    drawWaves(r, top) {
      this.waveBox.innerHTML = '';
      if (this.wave && this.wave.dispose) this.wave.dispose();
      this.wave = null;
      const names = [...r.waves.keys()];
      // the top module's own signals first (a.b names are inside instances)
      const strip = (n) => (n.startsWith(top + '.') ? n.slice(top.length + 1) : n);
      let shown = names.filter((n) => !strip(n).includes('.'));
      if (!shown.length) shown = names.slice();
      const clk = shown.filter((n) => /cl(oc)?k/i.test(strip(n)));
      shown = clk.concat(shown.filter((n) => !clk.includes(n))).slice(0, 16);
      const info = document.getElementById('vlWaveInfo');
      if (info) info.textContent = names.length ? shown.length + ' of ' + names.length + ' signals' : '';
      if (!names.length) { this.waveBox.appendChild(h('div.vl-empty', 'No signals changed during the run.')); return; }
      if (!S.Wave) { this.waveBox.appendChild(h('div.vl-empty', 'The waveform viewer is loading.')); return; }
      // names relative to the top module, which every signal shares
      const rel = (n) => strip(n);
      const waves = new Map(), widths = new Map();
      for (const [k, v] of r.waves) waves.set(rel(k), v);
      for (const [k, v] of r.widths) widths.set(rel(k), v);
      // a testbench's zero-delay pulses are not glitches of a technology, so only the narrowest are marked
      this.wave = new S.Wave(this.waveBox, { height: 260, glitch: 1e-6, empty: 'Add a signal of the run from the list.' });
      this.wave.setData({ waves, widths, end: r.end, violations: [], clock: clk[0] && rel(clk[0]) });
      this.wave.show(shown.map(rel));
    }
    // ---- synthesis
    async synth() {
      this.check();
      this.show('circuit');
      this.synthDone = true;
      if (this.errors.length) { this.circBox.innerHTML = ''; this.circBox.appendChild(h('div.vl-empty.err', 'Fix the problems in the code first.')); return; }
      if (!VE.canSynth()) { this.emptyCirc(); S.UI.toast('Synthesis is still being built.', 'err'); return; }
      const name = this.synthSel.value || this.dutName();
      const { src } = this.source();
      let r;
      try { r = VE.synth(src, name); } catch (e) { r = { reasons: [String(e.message || e)] }; }
      this.circBox.innerHTML = '';
      this.circuit = null; this.blockCircuit = null; this.gateCircuit = null; this.openEd.disabled = true;
      if (r.errors && r.errors.length) { for (const e of r.errors) this.circBox.appendChild(h('div.vl-line.err', (e.line ? 'line ' + e.line + ': ' : '') + e.msg)); return; }
      if (!r.circuit) {
        this.circBox.appendChild(h('div.vl-reasons', h('b', name + ' cannot be drawn as a circuit:'), h('ul', ...r.reasons.map((x) => h('li', x))), h('p.muted', 'Synthesis draws what hardware can build: assignments, gates, flip-flops on a clock edge. Delays, loops that never end and printing belong to testbenches.')));
        return;
      }
      this.blockCircuit = r.circuit; this.gateCircuit = null;
      this.blockCircuit.title = name;
      this.synthNotes = r.notes || [];
      this.useLevel();
      this.drawCircuit();
      this.openEd.disabled = !(S.Build && S.Build.openCircuit);
      this.openEd.title = this.openEd.disabled ? 'The circuit editor is not ready yet' : 'Open this circuit in the circuit editor';
    }
    /** the circuit at the level chosen: the block view as synthesised, or its gate-level twin (made once) */
    useLevel() {
      const b = this.blockCircuit;
      if (!b) return;
      if (this.level === 'gates' && typeof b.gateLevel === 'function' && !this.gateCircuit) {
        try { const g = b.gateLevel(); if (g && g.parts && g.nets) { g.title = b.title; this.gateCircuit = g; } } catch (e) { this.gateCircuit = null; }
      }
      this.circuit = this.level === 'gates' && this.gateCircuit ? this.gateCircuit : b;
      for (const x of this.levelSeg.children) { const on = x.dataset.level === (this.circuit === b ? 'blocks' : 'gates'); x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); }
      this.levelSeg.querySelector('[data-level="gates"]').disabled = typeof b.gateLevel !== 'function';
    }
    setLevel(k) {
      this.level = k;
      if (!this.blockCircuit) { for (const x of this.levelSeg.children) { const on = x.dataset.level === k; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); } return; }
      this.useLevel();
      this.drawCircuit();
    }
    drawCircuit() {
      if (!this.circuit) return;
      let res;
      try { res = S.Layout.layout(this.circuit); } catch (e) { this.circBox.innerHTML = ''; this.circBox.appendChild(h('div.vl-line.err', 'The circuit could not be laid out: ' + e.message)); return; }
      const n = this.circuit.parts.filter((p) => !['IN', 'OUT', 'CLOCK', 'CONST'].includes(p.type)).length;
      this.circBox.innerHTML = '';
      const wrap = h('div.sk-wrap.vl-sk');
      wrap.innerHTML = S.Render.svg(res, { style: this.app.settings.style });
      this.circBox.append(wrap);
      // a wide circuit keeps a readable size and scrolls sideways (and says so), rather than shrinking to nothing
      const svg = wrap.querySelector('svg'), natural = res.bounds.w, room = wrap.clientWidth - 18;
      let note = null;
      // on a desktop at its own size (pin names cannot grow much inside their parts), on a phone a little smaller
      const least = innerWidth < 600 ? 0.62 : 1;
      if (svg && room > 0 && natural * least > room) {
        svg.style.width = Math.round(natural * least) + 'px'; svg.style.maxWidth = 'none';
        wrap.classList.add('wide'); wrap.dataset.scrollAffordance = 'sideways';
        note = h('div.vl-scrollnote', 'Wider than the panel: scroll sideways ', h('span', '→'));
      }
      // names drawn too small at the size shown are drawn again larger
      const shown = svg ? svg.getBoundingClientRect().width / natural : 1, need = Math.max((innerWidth < 600 ? 10 : 11) / (Math.max(0.05, shown) * 12), innerWidth >= 600 && svg && svg.querySelector('.sk-pin-t') ? 1.1 : 1);
      if (svg && need > 1.02) { const st = svg.getAttribute('style'); wrap.innerHTML = S.Render.svg(res, { style: this.app.settings.style, textScale: Math.min(1.4, need) }); if (st) wrap.querySelector('svg').setAttribute('style', st); }
      wrap.remove();
      this.circBox.append(h('p.vl-cinfo.muted', n + ' part' + (n === 1 ? '' : 's') + ', ' + this.circuit.nets.length + ' nets' + (res.crossingCount ? ', ' + res.crossingCount + ' wire crossing' + (res.crossingCount > 1 ? 's' : '') : '')), note || '', wrap);
      if (this.synthNotes && this.synthNotes.length) this.circBox.appendChild(h('ul.vl-notes', ...this.synthNotes.slice(0, 8).map((x) => h('li', x))));
    }
    openInEditor() {
      if (!this.circuit || !(S.Build && S.Build.openCircuit)) return;
      S.Build.openCircuit(this.circuit, this.circuit.title || this.synthSel.value);
    }
    // ---- menus
    examplesMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      S.UI.showMenu([{ header: true, label: 'Example projects' }].concat(S.VerilogExamples.map((ex) => ({ label: ex.title, action: () => this.loadExample(ex.id, true) }))), r.left, r.bottom + 4, { anchor, keyboard: true });
    }
    async loadExample(id, ask) {
      const ex = S.VerilogExamples.find((x) => x.id === id);
      if (!ex) return;
      const same = this.st.example && this.st.files.every((f) => { const e2 = (S.VerilogExamples.find((x) => x.id === this.st.example) || { files: [] }).files.find((g) => g.name === f.name); return e2 && e2.text === f.text; });
      if (ask && !same) {
        const ok = await S.UI.confirm('Open "' + ex.title + '"?', 'Its files take the place of the ones open now. Save them first (More → Save all files) if you want to keep them.', 'Open the example');
        if (!ok) return;
      }
      this.st = { files: ex.files.map((f) => ({ name: f.name, text: f.text })), active: 0, top: ex.top || '', example: ex.id };
      this.save();
      this.emptyRun(); this.emptyCirc(); this.circuit = null; this.blockCircuit = null; this.gateCircuit = null; this.openEd.disabled = true;
      this.openFile(ex.files.length - 1 > 0 ? 0 : 0);
      this.check();
    }
    moreMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      const hasWaves = !!(this.lastRun && this.lastRun.waves && this.lastRun.waves.size);
      S.UI.showMenu([
        { label: 'New file', action: () => this.newFile() },
        { label: 'Open .v files…', action: () => this.openFiles() },
        { label: 'Save this file', sc: 'Ctrl S', action: () => this.saveFile() },
        { label: 'Save all files', action: () => this.saveAll() },
        { sep: true },
        { label: 'Verilog of the circuit in the editor', action: () => this.exportEditor() },
        { label: 'Save the waveforms (.vcd)', disabled: !hasWaves, action: () => this.saveVcd() },
        { sep: true },
        { label: 'Copy a share link', action: () => this.app.share('verilog', { files: this.st.files, top: this.st.top }) },
      ], r.right - 260, r.bottom + 4, { anchor, keyboard: true });
    }
    async openFiles() {
      const files = await S.UI.pickFiles('.v,.vh,.sv,.txt', true);
      for (const f of files) {
        const text = await f.text();
        const i = this.st.files.findIndex((x) => x.name === f.name);
        if (i >= 0) this.st.files[i].text = text; else this.st.files.push({ name: f.name, text });
      }
      if (files.length) { this.st.example = null; this.openFile(this.st.files.findIndex((x) => x.name === files[files.length - 1].name)); this.check(); S.UI.toast('Opened ' + files.length + ' file' + (files.length > 1 ? 's' : '') + '.', 'ok'); }
    }
    saveFile() { const f = this.st.files[this.st.active]; S.UI.download(f.name, f.text, 'text/x-verilog'); }
    saveAll() {
      if (this.st.files.length === 1) { this.saveFile(); return; }
      // one file, each part headed by its name, so it opens again as it was written
      const text = this.st.files.map((f) => '// ==== ' + f.name + ' ====\n' + f.text.replace(/\n?$/, '\n')).join('\n');
      S.UI.download('project.v', text, 'text/x-verilog');
    }
    saveVcd() {
      const r = this.lastRun;
      if (!r) return;
      const tryit = (f) => { try { return f(); } catch (e) { return null; } };
      // the file $dumpvars asked for, else every signal of the run
      const text = (r.vcd && tryit(r.vcd)) || (S.Verilog && S.Verilog.vcd && tryit(() => S.Verilog.vcd(r.waves, { widths: r.widths }))) || S.Eng.vcd(r.waves, r.widths, { top: this.topName() });
      S.UI.download((this.topName() || 'waves') + '.vcd', text, 'text/plain');
    }
    exportEditor() {
      const c = S.Build && S.Build.currentCircuit ? S.Build.currentCircuit() : null;
      if (!c || !c.parts.length) { S.UI.toast('The circuit editor has nothing drawn yet.', 'err'); return; }
      let text;
      try { text = VE.fromCircuit(c); } catch (e) { S.UI.toast('The circuit could not be written as Verilog: ' + e.message, 'err', 5000); return; }
      const name = this.uniqueName(String(c.title || 'circuit').replace(/[^A-Za-z0-9_]/g, '_') + '.v');
      this.st.files.push({ name, text });
      this.st.example = null;
      this.openFile(this.st.files.length - 1);
      this.check();
      S.UI.toast('The editor\'s circuit, as structural Verilog, is in ' + name + '.', 'ok');
    }
    // ---- keys
    onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); this.run(); return true; }
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.saveFile(); return true; }
      return false;
    }
    redraw() { this.drawCircuit(); if (this.lastRun && this.wave && this.wave.render) try { this.wave.render(); } catch (e) { /* none */ } }
    dispose() { clearTimeout(this.ckTimer); if (this.wave && this.wave.dispose) this.wave.dispose(); if (S.VerilogPage === this) S.VerilogPage = null; }
    get keys() { return [['Verilog', [['Ctrl  Enter', 'Run the top module'], ['Ctrl  S', 'Save the open file'], ['Tab  Shift Tab', 'Indent, outdent the selected lines']]]]; }
  }
  const fmtT = (t) => (t >= 1e6 ? (t / 1e6).toFixed(2) + ' ms' : t >= 1e3 ? (t / 1e3).toFixed(t % 1000 ? 2 : 0) + ' µs' : Math.round(t * 100) / 100 + ' ns');

  S.VerilogPageAPI = { VE, writeStructural, highlight };
  S.Pages.register('verilog', {
    title: 'Verilog', nav: 'verilog',
    open: (app, main) => new Page(app, main),
    load(data) { if (data && Array.isArray(data.files) && data.files.length) store.set('verilog', { files: data.files.map((f) => ({ name: String(f.name), text: String(f.text) })), active: 0, top: data.top || '', example: null }); },
  });

  // scenes for the diagram checker
  const ready = "Sirkit.VerilogPage && document.querySelector('#vlCode')";
  S.Checks.push(
    { group: 'verilog', name: 'verilog / an example open', hash: 'verilog', setup: "await Sirkit.VerilogPage.loadExample('counter');", ready, sel: '#main' },
    { group: 'verilog', name: 'verilog / after Run', hash: 'verilog', setup: "await Sirkit.VerilogPage.loadExample('counter'); await Sirkit.VerilogPage.run(); await new Promise((r) => setTimeout(r, 150));", ready: ready + ' && Sirkit.VerilogPage.ranOnce', sel: '#main' },
    { group: 'verilog', name: 'verilog / after Synthesise', hash: 'verilog', setup: "await Sirkit.VerilogPage.loadExample('mux3'); await Sirkit.VerilogPage.synth(); await new Promise((r) => setTimeout(r, 150));", ready: ready + ' && Sirkit.VerilogPage.synthDone', sel: '#main' },
    { group: 'verilog', name: 'verilog / synthesised, gate level', hash: 'verilog', setup: "await Sirkit.VerilogPage.loadExample('counter'); await Sirkit.VerilogPage.synth(); Sirkit.VerilogPage.setLevel('gates'); await new Promise((r) => setTimeout(r, 150));", ready: ready + ' && Sirkit.VerilogPage.synthDone', sel: '#main' },
  );
})(globalThis.Sirkit = globalThis.Sirkit || {});
