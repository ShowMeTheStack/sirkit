// The answer areas of the exercise kinds that need more than a text box, each embedding the right editor: a
// circuit editor with a restricted palette and the given ports (circuit; the circuit stage of fsm), a K-map to
// circle groups on (kmap), term lists and the prime implicant chart (qm), proof steps with their laws (proof),
// tables (truthtable, fsm), a waveform drawn slot by slot (waveform), code (verilog, cpu), and the lab's
// observations beside a link to the bench (lab). Each is S.ExerciseViews.kind = (x, host, draft, page) ->
// { get(), mark(result)?, after(result, resultBox)? }; lessons.js calls it. S.ExWidgets holds the pieces the
// lesson blocks share (src/app/exercises-blocks.js).
(function (S) {
  'use strict';
  const { h, icon } = S.UI;
  const store = S.UI.storage;
  const K = () => S.Check;
  const W = (S.ExWidgets = S.ExWidgets || {});
  const V = (S.ExerciseViews = S.ExerciseViews || {});
  const inline = (t) => S.UI.inline(t);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const GATES = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR'];
  const FFS = ['DFF', 'JKFF', 'TFF'];
  const LABEL = { AND: 'AND', OR: 'OR', NOT: 'NOT', NAND: 'NAND', NOR: 'NOR', XOR: 'XOR', XNOR: 'XNOR', BUF: 'Buffer', DFF: 'D flip-flop', JKFF: 'JK flip-flop', TFF: 'T flip-flop', MUX: 'Multiplexer', DECODER: 'Decoder', IN: 'Input', OUT: 'Output', CLOCK: 'Clock', CONST: 'Constant' };

  // ---- circuits ---------------------------------------------------------------------------------------------------
  /** an editor document from any circuit form */
  W.docOf = function (spec, o) {
    o = o || {};
    if (spec && spec.parts && spec.wires) return clone(spec);
    const c = K().circuitOf(spec, { outputs: o.outputs });
    return S.Doc.fromCircuit(c, { title: o.title || c.title });
  };
  /** a document holding only the ports (inputs on the left, outputs on the right, a clock when sequential) */
  W.portsDoc = function (ins, outs, clock) {
    const doc = S.Doc.blank('answer');
    const add = (type, name, x, y) => doc.parts.push({ id: S.Doc.newId(doc, type), type, params: Object.assign(S.Eng.defaults(type), { name }), x, y, rot: 0, flip: false });
    ins.forEach((n, i) => add('IN', n, 2, 2 + 5 * i));
    if (clock) add('CLOCK', 'CLK', 2, 2 + 5 * ins.length);
    outs.forEach((n, i) => add('OUT', n, 34, 2 + 5 * i));
    return doc;
  };
  /**
   * A live circuit: an editor (editable or not) whose switches answer clicks while it simulates.
   * o: { doc, editable, parts: [types for the palette], inputs: {A: 1}, height, onChange(doc), tryIt }
   */
  W.liveCircuit = function (host, o) {
    const box = h('div.exc-live');
    const tools = h('div.exc-tools');
    const canvas = h('div.exc-canvas', { style: { height: (o.height || 320) + 'px' } });
    const status = h('span.muted.exc-status');
    box.append(tools, canvas);
    host.appendChild(box);
    const inputs = new Map(Object.entries(o.inputs || {}));
    let sim = null, circuit = null, clockBtn = null;
    const self = { box, sim: () => sim };
    const ed = new S.Editor(canvas, {
      doc: o.doc, readOnly: !o.editable,
      onChange: () => { schedule(); if (o.onChange) o.onChange(ed.root); },
      onToggle: (dp, down) => {
        const w = +dp.params.w || 1, name = dp.params.name;
        const cur = inputs.has(name) ? inputs.get(name) : 0;
        const v = S.Eng.isButton(dp) ? (down ? 1 : 0) : w > 1 ? (cur + 1) % (1 << w) : cur ? 0 : 1;
        inputs.set(name, v);
        if (sim) { try { sim.set(name, v); settle(); } catch (e) { /* gone */ } }
        paint();
      },
    });
    self.editor = ed;
    // the canvas is as tall as the circuit needs at its full width (within reason), so its names stay readable
    const sizeCanvas = () => {
      const b = ed.bounds, w = canvas.clientWidth;
      if (!b || !b.w || !w || !canvas.isConnected) return;
      const z = Math.min(1.2, (w - 48) / b.w), want = Math.round(b.h * z + 48);
      const hh = Math.max(o.height || 320, Math.min(want, Math.round(innerHeight * 0.75)));
      if (Math.abs(hh - canvas.clientHeight) > 2) { canvas.style.height = hh + 'px'; ed.fit(); }
    };
    requestAnimationFrame(() => requestAnimationFrame(sizeCanvas));
    canvas.addEventListener('keydown', (e) => { if (o.editable && ed.key(e)) e.stopPropagation(); });
    const settle = () => { try { if (sim.settle) sim.settle(500); else sim.run(60); } catch (e) { /* nothing to run */ } };
    function rebuild() {
      sim = null;
      try { circuit = S.Doc.toCircuit(ed.root); sim = S.Eng.createSim(circuit, { tech: 'CMOS', powerUp: 0 }); } catch (e) { status.textContent = 'Not simulating: ' + e.message; ed.live = false; ed.setValues(new Map()); return; }
      for (const [k, v] of inputs) try { sim.set(k, v); } catch (e) { /* no such input */ }
      settle();
      status.textContent = '';
      ed.live = true;
      if (clockBtn) clockBtn.style.display = K().isSequential(circuit) ? '' : 'none';
      paint();
    }
    function paint() {
      if (!sim) return;
      const vals = new Map();
      for (const w of ed.root.wires) {
        const name = circuit.netOfWire.get(w.id);
        if (!name) continue;
        const net = circuit.nets.find((n) => n.name === name);
        try { const v = S.Eng.bits(sim.get(name), (net && net.width) || 1); if (v != null) vals.set(w.id, v); } catch (e) { /* not a net */ }
      }
      ed.setValues(vals);
    }
    const schedule = S.UI.debounce(rebuild, 120);
    const btn = (id, ic, label, fn, title) => { const b = h('button.btn.small', { type: 'button', title: title || label, dataset: { act: id } }, icon(ic), h('span', label)); b.addEventListener('click', fn); return b; };
    if (o.editable) {
      const pal = h('div.exc-pal', { role: 'group', 'aria-label': 'Parts' });
      for (const t of o.parts || GATES) {
        const [type, n] = t.split(':');
        const b = h('button.chip.exc-part', { type: 'button', dataset: { type }, title: 'Add ' + (/^(AND|OR|XOR|XNOR|Input|Output)$/.test(LABEL[type] || type) ? 'an ' : 'a ') + (LABEL[type] || type) + (n ? ' with ' + n + ' inputs' : '') }, (LABEL[type] || type) + (n ? ' ' + n : ''));
        b.addEventListener('click', () => ed.addPart(type, n ? { n: +n } : {}));
        pal.appendChild(b);
      }
      tools.append(pal, h('span.grow'), btn('undo', 'undo', 'Undo', () => ed.undo(), 'Undo (Ctrl+Z)'), btn('delete', 'trash', 'Delete', () => ed.deleteSel(), 'Delete the selection (Del)'), btn('tidy', 'refresh', 'Tidy', () => ed.tidy && ed.tidy(), 'Tidy the drawing'));
    }
    clockBtn = btn('clock', 'stepOver', 'Clock', () => { if (sim && sim.clockEdge) { try { sim.clockEdge(); } catch (e) { status.textContent = e.message; } paint(); } }, 'One rising clock edge');
    const tryBtn = btn('try', 'gate', 'Try it in the workbench', () => W.openInWorkbench(ed.root, Object.fromEntries(inputs)));
    const foot = h('div.exc-foot', status, h('span.grow'), clockBtn, o.tryIt === false ? null : tryBtn);
    box.appendChild(foot);
    rebuild();
    self.doc = () => clone(ed.root);
    self.set = (env) => { for (const [k, v] of Object.entries(env)) inputs.set(k, v); rebuild(); };
    self.dispose = () => ed.dispose();
    self.redraw = () => { ed.render(); };
    return self;
  };
  /** open a document in the workbench with its inputs set by name */
  W.openInWorkbench = function (doc, env) {
    const ids = [];
    for (const p of doc.parts) if (S.Eng.isInput(p.type) && env && env[p.params.name] !== undefined) ids.push([p.id, +env[p.params.name]]);
    store.set('build', doc); store.set('build.inputs', ids); store.set('build.probes', []);
    location.hash = 'build';
  };

  // ---- tables ------------------------------------------------------------------------------------------------------
  /** a table to fill from a spec {rows, cols, corner, cell(r, c) -> key, kind}: {el, get, mark} */
  W.fillTable = function (SP, draft, o) {
    o = o || {};
    const inputs = {};
    const tbl = h('table.fill-table', h('thead', h('tr', h('th', SP.corner || ''), ...SP.cols.map((c, i) => h('th', (SP.colNames || [])[i] || c)))));
    const body = h('tbody');
    SP.rows.forEach((r, ri) => {
      const tr = h('tr', h('th.mono', r));
      SP.cols.forEach((c, ci) => {
        const key = SP.cell(ri, ci);
        if (key === null) { tr.appendChild(h('td.none')); return; }
        const i = h('input.mono', { type: 'text', 'aria-label': r + ', ' + c, spellcheck: 'false', autocomplete: 'off', placeholder: o.placeholder || (SP.kind === 'bit' ? '0/1' : '–'), maxlength: SP.kind === 'bit' ? '1' : null, dataset: { key } });
        if (draft && draft[key] !== undefined) i.value = draft[key];
        inputs[key] = i;
        tr.appendChild(h('td', i));
      });
      body.appendChild(tr);
    });
    tbl.appendChild(body);
    return {
      el: h('div.fit-table.ans-table', tbl), inputs,
      get: () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value])),
      mark(r) { for (const [k, i] of Object.entries(inputs)) { i.classList.toggle('right', !!(r.cells && r.cells[k])); i.classList.toggle('wrong', !!(r.cells && !r.cells[k])); } },
    };
  };
  /** a grid of rows × named fields whose answer keys are row|field (row may itself be state|input) */
  W.gridSpec = (rows, cols, corner, labels) => ({ rows: labels || rows, cols, corner, cell: (r, c) => rows[r] + '|' + cols[c], kind: 'text' });
  const textLine = (draft, placeholder, id) => { const i = h('input.mono', { type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder, 'aria-label': 'Your answer', id }); if (typeof draft === 'string') i.value = draft; return i; };
  W.codeArea = function (text, placeholder, rows) {
    const ta = h('textarea.mono.prog-answer.exc-code', { spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Your answer', placeholder: placeholder || '', rows: String(rows || 10), wrap: 'off' });
    ta.value = text || '';
    ta.addEventListener('keydown', (e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); document.execCommand('insertText', false, '  '); } });
    requestAnimationFrame(() => S.UI.autosize && S.UI.autosize(ta, 520));
    return ta;
  };
  const note = (t) => h('p.muted.ans-note', inline(t));
  const sigma = (fn) => S.Bool.sigma(fn);

  // ---- circuit -------------------------------------------------------------------------------------------------------
  function circuitArea(x, host, draft, page, o) {
    let R = null;
    try { R = o.ref || K().reference(x); } catch (e) { /* the starting doc then has no ports */ }
    const start = draft && draft.parts ? draft : x.start ? W.docOf(x.start, { outputs: x.outputs }) : W.portsDoc(x.inputs || (R ? R.ports.inputs : []), x.outputs || (R ? R.ports.outputs : ['F']), R && R.seq);
    const parts = (x.parts ? x.parts.slice() : o.parts || (R && R.seq ? GATES.concat(FFS) : GATES));
    // gates with more inputs, when the palette allows the gate at all
    const palette = parts.flatMap((t) => (GATES.includes(t) && t !== 'NOT' ? [t, t + ':3'] : [t]));
    const limits = [];
    if (x.parts) limits.push('only ' + x.parts.join(', ') + ' parts');
    if (x.maxGates) limits.push('at most ' + x.maxGates + ' gates');
    if (x.maxLevels) limits.push('at most ' + x.maxLevels + ' levels of logic');
    if (limits.length) host.appendChild(note('This exercise allows ' + limits.join(', ') + '.'));
    const live = W.liveCircuit(host, { doc: start, editable: true, parts: palette, height: 360 });
    page.editors.push(live);
    host.appendChild(note('Click a part to add it; drag from pin to pin to wire. While it simulates, click the inputs to flip them. Double-click a part to change it.'));
    return {
      get: () => live.doc(),
      after(r, box) {
        const d = r.detail;
        if (!d || !d.inputs || !d.want) return;
        const outs = Object.keys(d.want);
        box.appendChild(h('div.fit-table.exc-cex', h('table.dtable', h('thead', h('tr', ...Object.keys(d.inputs).map((k) => h('th', k)), ...outs.map((k) => h('th', k + ' (should be)')), ...outs.map((k) => h('th', k + ' (yours)')))),
          h('tbody', h('tr', ...Object.values(d.inputs).map((v) => h('td', String(v))), ...outs.map((k) => h('td', String(d.want[k]))), ...outs.map((k) => h('td' + (String(d.got[k]) !== String(d.want[k]) && d.want[k] !== '-' ? '.bad' : ''), String(d.got[k]))))))));
        if (d.say) box.appendChild(h('div.ex-d', 'The inputs, clock by clock: ' + d.say + '.'));
        const show = h('button.btn.small', { type: 'button', id: 'exShowRun' }, icon('eye'), 'Show these inputs on my circuit');
        show.addEventListener('click', () => live.set(d.inputs));
        const open = h('button.btn.small', { type: 'button', id: 'exOpenRun' }, icon('gate'), 'Open the run in the workbench');
        open.addEventListener('click', () => W.openInWorkbench(live.doc(), d.inputs));
        box.appendChild(h('div.ex-tools', show, open));
      },
    };
  }
  V.circuit = (x, host, draft, page) => circuitArea(x, host, draft, page, {});

  // ---- K-map ---------------------------------------------------------------------------------------------------------
  V.kmap = function (x, host, draft) {
    const B = S.Bool, fn = K().fnOf(x), form = x.form || 'sop';
    let groups = Array.isArray(draft) ? draft.filter((g) => Array.isArray(g)) : [];
    host.appendChild(h('p.ans-expr.mono', 'F = ' + sigma(fn)));
    const map = h('div.exc-kmap', { id: 'exKmap' });
    const list = h('ul.exc-groups', { id: 'exGroups' });
    const clear = h('button.btn.small', { type: 'button', id: 'exClearGroups' }, icon('trash'), 'Clear the groups');
    clear.addEventListener('click', () => { groups = []; draw(); host.dispatchEvent(new Event('input', { bubbles: true })); });
    host.append(map, note('Drag from one cell to the opposite corner of a group to circle it (dragging past an edge wraps round). Circle ' + (form === 'pos' ? 'the 0s' : 'the 1s') + '.'), list, h('div.ex-tools', clear));
    function draw() {
      const gs = groups.map((cells) => ({ cells, check: B.checkGroup(fn, cells, { form }) }));
      S.FuncKmap.draw(map, { fn, form, groups: gs, onGroup: (cells) => { if (cells.length) { groups.push(cells); draw(); host.dispatchEvent(new Event('input', { bubbles: true })); } } });
      list.innerHTML = '';
      gs.forEach((g, i) => {
        const rm = h('button.icon-btn', { type: 'button', 'aria-label': 'Remove group ' + (i + 1), title: 'Remove this group' }, icon('x'));
        rm.addEventListener('click', () => { groups.splice(i, 1); draw(); host.dispatchEvent(new Event('input', { bubbles: true })); });
        list.appendChild(h('li' + (g.check.ok ? '' : '.bad'), h('b', 'Group ' + (i + 1) + ': '), h('span.mono', g.check.ok ? g.check.term : 'cells ' + g.cells.join(', ')), ' ', h('span.muted', g.check.ok ? (g.check.prime ? '' : '(can be bigger)') : '(not a valid group)'), rm));
      });
    }
    draw();
    return { get: () => groups.map((g) => g.slice()), set: (gs) => { groups = gs.map((g) => { if (Array.isArray(g)) return g; const c = K().cubeOf(g, fn.vars, form); return c.cells || B.cubeMinterms(c); }); draw(); } };
  };

  // ---- Quine–McCluskey -----------------------------------------------------------------------------------------------
  V.qm = function (x, host, draft) {
    const fn = K().fnOf(x);
    host.appendChild(h('p.ans-expr.mono', 'F = ' + sigma(fn)));
    if (x.ask === 'chart') {
      const t = W.fillTable(K().tableSpec(Object.assign({}, x, { table: 'qmchart' })), draft, { placeholder: 'X' });
      host.append(t.el, note('Write X where the prime implicant covers the minterm; leave the other cells empty.'));
      return t;
    }
    const ta = W.codeArea(typeof draft === 'string' ? draft : '', "one term per line: B'C' or -00-", 5);
    ta.id = 'ansTerms';
    ta.classList.add('wrap');
    host.append(h('label.ans-line.col', h('span', x.ask === 'essentials' ? 'The essential prime implicants' : x.ask === 'cover' ? 'A minimal cover' : 'The prime implicants'), ta), note("Write each term as a product (B'C') or as a cube over " + fn.vars.join('') + " (-00-), one per line or separated by commas."));
    return { get: () => ta.value };
  };

  // ---- proof ---------------------------------------------------------------------------------------------------------
  V.proof = function (x, host, draft) {
    const B = S.Bool;
    const laws = x.laws ? x.laws.map((l) => B.laws.find((q) => q.id === l || q.name === l)).filter(Boolean) : B.laws;
    const rows = h('ol.exc-proof', { id: 'exProof' });
    host.append(h('p.ans-expr.mono', B.toString(B.parse(x.start)) + (x.goal ? '   ⟶   ' + B.toString(B.parse(x.goal)) : x.maxLiterals ? '   ⟶   ' + x.maxLiterals + ' literals' : '')), rows);
    const add = (st) => {
      const e = textLine(st && st.expr || '', 'the expression after this step');
      const sel = h('select', { 'aria-label': 'The law' }, h('option', { value: '' }, 'which law?'), ...laws.map((l) => h('option', { value: l.id }, l.name)));
      if (st && st.law) sel.value = st.law;
      const rm = h('button.icon-btn', { type: 'button', 'aria-label': 'Remove this step', title: 'Remove this step' }, icon('x'));
      const li = h('li.exc-step', h('span.eq', '='), e, sel, rm);
      rm.addEventListener('click', () => { li.remove(); host.dispatchEvent(new Event('input', { bubbles: true })); });
      e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); rows.lastChild.querySelector('input').focus(); } });
      rows.appendChild(li);
    };
    const steps = Array.isArray(draft) && draft.length ? draft : [null];
    steps.forEach(add);
    const more = h('button.btn.small', { type: 'button', id: 'exAddStep' }, icon('plus'), 'Add a step');
    more.addEventListener('click', () => { add(); rows.lastChild.querySelector('input').focus(); });
    host.append(h('div.ex-tools', more), note('Each step must equal the line before and follow from its law in one step (reordering terms is free).' + (x.maxSteps ? ' At most ' + x.maxSteps + ' steps.' : '')));
    return {
      get: () => [...rows.children].map((li) => ({ expr: li.querySelector('input').value, law: li.querySelector('select').value })).filter((s) => s.expr.trim()),
      mark(r) { [...rows.children].forEach((li, i) => li.classList.toggle('bad', !r.ok && r.detail && r.detail.step === i)); },
    };
  };

  // ---- simplify and convert ------------------------------------------------------------------------------------------
  V.simplify = function (x, host, draft) {
    const fn = K().fnOf(x);
    const i = textLine(draft, "an expression, like A'B + C", 'ansText');
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btnCheck').click(); } });
    host.append(h('p.ans-expr.mono', 'F = ' + (x.expr || x.ref || sigma(fn))), h('label.ans-line', h('span', 'F ='), i), note("Write NOT as A' (or ~A), AND by putting letters together, OR as +, XOR as ^." + (x.maxLiterals ? ' At most ' + x.maxLiterals + ' literals.' : '')));
    return { get: () => i.value };
  };
  V.convert = function (x, host, draft) {
    const i = textLine(draft && typeof draft === 'object' ? draft.result : draft, x.placeholder || 'the result', 'ansText');
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btnCheck').click(); } });
    const work = W.codeArea(draft && typeof draft === 'object' ? draft.working || '' : '', 'your working (kept with your answer, not marked)', 4);
    work.id = 'ansWorking';
    const det = h('details.exc-work', h('summary', 'Show your working'), work);
    host.append(h('label.ans-line', h('span', 'Result'), i), det);
    return { get: () => (work.value.trim() ? { result: i.value, working: work.value } : i.value) };
  };
  V.truthtable = function (x, host, draft) {
    const SP = K().tableSpec(Object.assign({}, x, { table: x.table || 'truth' }));
    const t = W.fillTable(SP, draft);
    if (x.expr || x.outputs) host.appendChild(h('p.ans-expr.mono', x.outputs ? Object.entries(x.outputs).map(([k, v]) => k + ' = ' + v).join(';  ') : 'F = ' + x.expr));
    host.append(t.el, note('Write 0 or 1 in each cell. Rows are the inputs ' + SP.corner.split('').join(', ') + ' in order, counting up in binary.'));
    return t;
  };

  // ---- timing ---------------------------------------------------------------------------------------------------------
  W.schematic = function (spec, o) {
    const box = h('div.ls-schem.sk-wrap');
    try {
      const c = K().circuitOf(spec, o || {});
      const res = S.Layout.layout(c);
      // drawn again once it is on the page, with its names enlarged when it is shown small
      const draw = () => { S.Render.into(box, res, { style: (S.app && S.app.settings.style) || 'shape' }); };
      draw(); box._redraw = draw;
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => { if (box.isConnected) draw(); });
    } catch (e) { box.appendChild(h('p.muted', 'This circuit cannot be drawn: ' + e.message)); }
    return box;
  };
  V.timing = function (x, host, draft) {
    const unit = { fmax: 'MHz' }[x.ask] || 'ns';
    host.appendChild(h('figure.ls-fig.schematic', W.schematic(x.circuit), h('figcaption', 'Timing preset: ' + (x.tech || 'CMOS') + '.')));
    const i = textLine(draft, 'a number', 'ansText');
    i.setAttribute('inputmode', 'decimal');
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btnCheck').click(); } });
    host.append(h('label.ans-line', h('span', 'Your answer'), i, h('span.muted', unit)));
    return { get: () => i.value };
  };

  // ---- waveform -----------------------------------------------------------------------------------------------------
  /** waves as SVG: rows {name, levels: '01?..', edit} one character per slot; clicking an editable slot cycles it */
  W.waveSvg = function (rows, o) {
    o = o || {};
    const n = Math.max(...rows.map((r) => r.levels.length)), SW = o.slot || 44, LW = 56, RH = 40, top = o.clocked ? 22 : 8;
    // the last clock's label (↑10) is centred on the right edge: leave room for its half
    const width = LW + n * SW + (o.clocked ? Math.max(8, 4 * String(n).length + 10) : 8), height = top + rows.length * RH + 6;
    let s = `<svg class="exc-wave" viewBox="0 0 ${width} ${height}" width="${width}" style="max-width: 100%" role="img" aria-label="Waveforms">`;
    for (let k = 0; k <= n; k++) s += `<path class="exc-grid" d="M${LW + k * SW} ${top - 4}V${height - 4}"/>`;
    if (o.clocked) for (let k = 1; k <= n; k++) s += `<text class="exc-clk" x="${LW + k * SW}" y="12" text-anchor="middle">↑${k}</text>`;
    rows.forEach((r, ri) => {
      const y0 = top + ri * RH, hi = y0 + 8, lo = y0 + RH - 10;
      s += `<text class="exc-sig" x="${LW - 8}" y="${(hi + lo) / 2 + 4}" text-anchor="end">${r.name}</text>`;
      let d = '', last = null;
      for (let k = 0; k < n; k++) {
        const v = r.levels[k], x0 = LW + k * SW;
        if (v === '0' || v === '1') { const y = v === '1' ? hi : lo; d += (last === null || last === '?' ? 'M' + x0 + ' ' + y : (last !== v ? 'L' + x0 + ' ' + y : '')) + 'L' + (x0 + SW) + ' ' + y; }
        last = v === '0' || v === '1' ? v : '?';
        if (r.edit && r.edit[k]) s += `<rect class="exc-slot${v === '0' || v === '1' ? '' : ' blank'}" data-row="${ri}" data-slot="${k}" x="${x0 + 2}" y="${hi - 4}" width="${SW - 4}" height="${lo - hi + 8}" rx="4"/>`;
        else if (!(v === '0' || v === '1')) s += `<text class="exc-q" x="${x0 + SW / 2}" y="${(hi + lo) / 2 + 4}" text-anchor="middle">?</text>`;
      }
      if (d) s += `<path class="exc-lvl" d="${d}"/>`;
    });
    return s + '</svg>';
  };
  V.waveform = function (x, host, draft) {
    const outs = x.outputs || Object.keys(K().waveExpected(x));
    const n = Math.max(...Object.values(x.inputs).map((s) => s.length));
    const given = x.given || {};
    const cur = Object.fromEntries(outs.map((o) => [o, (draft && draft[o]) || (given[o] || '').padEnd(n, '?').replace(/[^01]/g, '?')]));
    const fixed = Object.fromEntries(outs.map((o) => [o, [...(given[o] || '')].map((c) => c === '0' || c === '1')]));
    host.appendChild(h('figure.ls-fig.schematic', W.schematic(x.circuit, { outputs: x.outputs })));
    const box = h('div.exc-wavebox', { id: 'exWave' });
    host.append(box, note('Click a slot of an output to set it: once for 1, again for 0.' + (x.clocked ? ' Each slot is one clock cycle; its value is the one before the rising edge at its end.' : x.slotNs ? ' Each slot lasts ' + x.slotNs + ' ns, with ' + (x.tech || 'CMOS') + ' gate delays; its value is the level at its end.' : '')));
    const draw = () => {
      const rows = Object.entries(x.inputs).map(([k, s]) => ({ name: k, levels: s.padEnd(n, s[s.length - 1]) })).concat(outs.map((o) => ({ name: o, levels: cur[o], edit: [...Array(n)].map((_, k) => !fixed[o][k]) })));
      box.innerHTML = W.waveSvg(rows, { clocked: x.clocked });
    };
    box.addEventListener('click', (e) => {
      const r = e.target.closest('[data-slot]');
      if (!r) return;
      const o = outs[+r.dataset.row - Object.keys(x.inputs).length], k = +r.dataset.slot, v = cur[o][k];
      cur[o] = cur[o].slice(0, k) + (v === '1' ? '0' : '1') + cur[o].slice(k + 1);
      draw();
    });
    draw();
    return { get: () => Object.assign({}, cur), set: (v) => { Object.assign(cur, v); draw(); } };
  };

  // ---- state machines -------------------------------------------------------------------------------------------------
  W.fsmSvg = function (m) {
    const model = S.FsmPage && S.FsmPage.fromMachine ? S.FsmPage.fromMachine(m) : null;
    const d = h('div.exc-fsm');
    if (model) d.innerHTML = S.FsmDiagram.svg(model, {});
    return d;
  };
  V.fsm = function (x, host, draft, page) {
    const Kc = K(), m = Kc.machineOf(x.machine);
    const stages = x.stages || [x.stage || 'table'];
    const multi = !!x.stages;
    const D0 = (() => { try { return Kc.fsmDesign(x); } catch (e) { return null; } })();
    if (!(stages.length === 1 && stages[0] === 'table')) host.appendChild(h('figure.ls-fig', W.fsmSvg(m), h('figcaption', (m.type === 'moore' ? 'Moore' : 'Mealy') + ' machine; inputs ' + m.inputs.join(', ') + ', outputs ' + m.outputs.join(', ') + '.')));
    const syms = S.Fsm.symbols(m);
    const areas = {};
    for (const st of stages) {
      const sec = h('section.exc-stage', { dataset: { stage: st } }, multi ? h('h3', Kc.fsmStageName[st].replace(/^./, (c) => c.toUpperCase())) : null);
      const dr = multi ? (draft || {})[st] : draft;
      const rowsSI = m.states.flatMap((s) => syms.map((i) => s + '|' + i));
      const labSI = m.states.flatMap((s) => syms.map((i) => s + ', ' + m.inputs.join('') + ' = ' + i));
      let a;
      if (st === 'table') {
        const rows = m.type === 'moore' ? m.states.map((s) => s + '|-').concat(rowsSI) : rowsSI;
        const spec = { rows: m.type === 'moore' ? m.states.map((s) => s + ' output').concat(labSI) : labSI, cols: ['next', 'out'], corner: 'state, input', cell: (r, c) => (m.type === 'moore' ? (r < m.states.length ? (c === 1 ? rows[r] + '|out' : null) : (c === 0 ? rows[r] + '|next' : null)) : rows[r] + '|' + ['next', 'out'][c]), kind: 'text' };
        a = W.fillTable(spec, dr && typeof dr === 'object' ? dr : null);
        sec.append(a.el, note('States: ' + m.states.join(', ') + '. Write the next state and the output ' + m.outputs.join('') + ' for each state and input.'));
      } else if (st === 'reduce' || st === 'implication') {
        const i = textLine(dr, st === 'reduce' ? '{S0, S2}, {S1}' : '(S0, S1), (S1, S2)');
        sec.append(h('label.ans-line', h('span', st === 'reduce' ? 'Classes' : 'Pairs crossed out'), i));
        a = { get: () => i.value };
      } else if (st === 'assign') {
        a = W.fillTable(W.gridSpec(m.states, ['code'], 'state'), dr && typeof dr === 'object' ? Object.fromEntries(Object.entries(dr).map(([k, v]) => [k + '|code', v])) : null, { placeholder: '00' });
        sec.append(a.el);
        const g = a.get; a = Object.assign({}, a, { get: () => Object.fromEntries(Object.entries(g()).map(([k, v]) => [k.replace(/\|code$/, ''), v.trim()]).filter(([, v]) => v)) });
      } else if (st === 'transition' || st === 'excitation') {
        const cols = st === 'transition' ? ['next', 'out'] : D0 ? D0.stages.excitation.inputs : [];
        a = W.fillTable({ rows: labSI, cols, corner: 'state, input', cell: (r, c) => rowsSI[r] + '|' + cols[c], kind: 'text' }, dr, { placeholder: st === 'transition' ? '' : '0/1/X' });
        sec.append(a.el, note(st === 'transition' ? 'The next state as its code, and the output.' : 'Write X for a don\'t-care.'));
      } else if (st === 'equations') {
        // the names follow the design: the codes the student types in the assignment stage rename the state
        // variables (Q2..Q0 for typed codes, Y0..Y2 for the exercise's own one-hot ones)
        const eqBox = h('div.exc-eqs'), kept = Object.assign({}, dr || {});
        let lines = [], shown = '';
        const designNow = () => {
          const asg = areas.assign && areas.assign.get();
          if (asg && Object.keys(asg).length) {
            try { if (S.Fsm.check.assignment(D0.machine, asg).ok) return Kc.fsmDesign(x, asg); } catch (e) { /* not codes yet */ }
          }
          return D0;
        };
        const build = () => {
          const dd = designNow(), names = dd ? dd.functions.map((f) => f.name) : [];
          const key = names.join(',') + '|' + (dd ? dd.vars.join(',') : '');
          if (key === shown) return;
          shown = key;
          for (const [nm, i] of lines) if (i.value.trim()) kept[nm] = i.value; else delete kept[nm];
          eqBox.innerHTML = '';
          const ex = dd && dd.vars.length > 1 ? dd.vars[0] + ' ' + (m.inputs[0] || '') + "' + " + dd.vars[dd.vars.length - 1] : "Q1X' + Q0";
          lines = names.map((nm) => { const i = textLine(kept[nm], ex); i.dataset.eq = nm; eqBox.appendChild(h('label.ans-line', h('span.mono', nm + ' ='), i)); return [nm, i]; });
          eqBox.appendChild(note('Over ' + (dd ? dd.vars.concat(m.inputs).join(', ') : 'the state variables and inputs') + '.'));
        };
        sec.appendChild(eqBox);
        build();
        if (stages.includes('assign')) host.addEventListener('input', S.UI.debounce(build, 250));
        a = { get: () => Object.fromEntries(lines.map(([nm, i]) => [nm, i.value]).filter(([, v]) => v.trim())) };
      } else if (st === 'circuit') {
        a = circuitArea({ inputs: m.inputs, outputs: m.outputs }, sec, dr && dr.parts ? dr : null, page, { ref: { ports: { inputs: m.inputs, outputs: m.outputs }, seq: true }, parts: GATES.concat(FFS) });
      }
      areas[st] = a;
      host.appendChild(sec);
    }
    return {
      get: () => (multi ? Object.fromEntries(stages.map((st) => [st, areas[st].get()])) : areas[stages[0]].get()),
      mark(r) { for (const st of stages) if (areas[st].mark) areas[st].mark(r.stage === st || !multi ? r : {}); },
      after(r, box) { const a = areas[r.stage || stages[0]]; if (a && a.after) a.after(r, box); },
    };
  };

  // ---- Verilog and the processor ------------------------------------------------------------------------------------------
  V.verilog = function (x, host, draft) {
    const ta = W.codeArea(typeof draft === 'string' ? draft : x.start || 'module ' + (x.module || 'top') + '(\n);\n\nendmodule\n', 'module …', 12);
    ta.id = 'ansProgram';
    const out = h('pre.ls-code.exc-console', { id: 'exConsole', hidden: true });
    const tryB = h('button.btn.small', { type: 'button', id: 'exCompile' }, icon('run'), 'Compile');
    tryB.addEventListener('click', () => {
      const c = S.Verilog.compile(ta.value, {});
      out.hidden = false;
      out.textContent = c.errors.length ? c.errors.map((e) => 'line ' + e.line + ': ' + e.msg).join('\n') : c.warnings.length ? 'Compiles, with warnings:\n' + c.warnings.map((e) => 'line ' + e.line + ': ' + e.msg).join('\n') : 'Compiles cleanly.' + (x.module ? ' Check it to run the testbench.' : '');
    });
    host.append(ta, h('div.ex-tools', tryB), out, note('Check my answer runs your module against a testbench you do not see' + (x.ports ? '; the ports: ' + x.ports : '') + '.'));
    return { get: () => ta.value };
  };
  V.cpu = function (x, host, draft) {
    const ta = W.codeArea(typeof draft === 'string' ? draft : x.start || '', 'LDA #0 …', 12);
    ta.id = 'ansProgram';
    const out = h('pre.ls-code.exc-console', { id: 'exConsole', hidden: true });
    const tests = x.tests || [{ input: [] }];
    const run = h('button.btn.small', { type: 'button', id: 'exRun' }, icon('run'), 'Run on the first test');
    run.addEventListener('click', () => {
      out.hidden = false;
      const p = S.Cpu.assemble(ta.value);
      if (p.errors.length) { out.textContent = p.errors.map((e) => 'line ' + e.line + ': ' + e.msg).join('\n'); return; }
      try { const mc = S.Cpu.machine(p, { input: tests[0].input || [] }); const r = mc.run(x.maxCycles || 20000); out.textContent = 'Input: ' + (tests[0].input || []).join(', ') + '\nOutput: ' + r.output.join(', ') + '\n' + (r.halted ? 'Halted after ' + r.cycles + ' cycles.' : 'Still running after ' + r.cycles + ' cycles.'); } catch (e) { out.textContent = e.message; }
    });
    host.append(ta, h('div.ex-tools', run), out, note(tests.length + ' test' + (tests.length > 1 ? 's' : '') + ': ' + tests.map((t) => 'input ' + ((t.input || []).join(', ') || 'none')).join('; ') + '.'));
    return { get: () => ta.value };
  };

  // ---- lab ----------------------------------------------------------------------------------------------------------------
  V.lab = function (x, host, draft) {
    const lab = S.Content.labs && S.Content.labs.get(x.lab);
    if (!lab) { host.appendChild(h('p.muted', 'There is no lab ' + x.lab + '.')); return { get: () => null }; }
    host.append(h('p', h('b', 'Aim. '), inline(lab.aim)), h('p', h('a.btn.primary', { href: '#lab=' + lab.id, id: 'exOpenBench' }, icon('bench'), 'Open the bench'), ' ', h('span.muted', 'Wire it there; your bench is kept, and checked from here.')));
    let t = null;
    if (lab.observe) {
      t = W.fillTable(K().tableSpec({ table: 'labobs', lab }), draft && draft.observe);
      host.append(h('h3', 'Observations'), t.el);
    }
    return { get: () => ({ bench: store.get('lab', null), observe: t ? t.get() : {} }), mark: (r) => { if (t && r.cells) t.mark(r); } };
  };

  // ---- what the diagram checker looks at: the first exercise of each kind here, the first lesson with a running
  // block and the first lab, whatever the content holds once it has loaded --------------------------------------------
  setTimeout(() => {
    const C = S.Content;
    if (!C || !S.Checks || S.Checks.some((c) => c.group === 'exercises')) return;
    const ex = "document.querySelector('#exerciseView')";
    for (const kind of Object.keys(V)) {
      const xs = [...C.exercises.values()].filter((x) => x.kind === kind);
      for (const x of xs.slice(0, kind === 'qm' || kind === 'fsm' || kind === 'circuit' ? 2 : 1)) S.Checks.push({ group: 'exercises', name: 'exercise ' + x.id + ' (' + kind + ')', hash: 'exercise=' + x.id, ready: ex, setup: 'await new Promise((r) => setTimeout(r, 300));', sel: '#main' });
    }
    const keys = Object.keys(S.LessonBlocks || {});
    const l = [...C.lessons.values()].find((y) => (y.blocks || []).some((b) => b && typeof b === 'object' && keys.some((k) => b[k] !== undefined)));
    if (l) S.Checks.push({ group: 'exercises', name: 'lesson ' + l.id + ' (running blocks)', hash: 'lesson=' + l.id, ready: "document.querySelector('#lessonView')", setup: 'await new Promise((r) => setTimeout(r, 400));', sel: '#main' });
    const lab = C.labs && [...C.labs.values()][0];
    if (lab) S.Checks.push({ group: 'exercises', name: 'lab ' + lab.id + ' beside the bench', hash: 'lab=' + lab.id, ready: "document.querySelector('#labExp') && Sirkit.Lab.page", setup: 'await new Promise((r) => setTimeout(r, 300));', sel: '#main' });
  }, 0);
})(globalThis.Sirkit = globalThis.Sirkit || {});
