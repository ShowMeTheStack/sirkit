// Lesson blocks that run: a live circuit, the function workbench's view of a function, a K-map with its groups,
// a waveform from a simulation, Verilog with Run, and a state diagram. lessons.js looks a block up here by its
// key (S.LessonBlocks[key](block, page, app) -> element); the fields are listed at the top of lessons.js.
(function (S) {
  'use strict';
  const { h, icon } = S.UI;
  const store = S.UI.storage;
  const Bk = (S.LessonBlocks = S.LessonBlocks || {});
  const W = () => S.ExWidgets;
  const inline = (t) => S.UI.inline(t);
  const figure = (el, caption, cls) => h('figure.ls-fig' + (cls ? '.' + cls : ''), el, caption ? h('figcaption', inline(caption)) : null);
  const failed = (what, e) => h('p.muted', what + ' cannot be shown: ' + (e.message || e));

  Bk.circuit = function (b, page) {
    const host = h('div.ls-live');
    try {
      const live = W().liveCircuit(host, { doc: W().docOf(b.circuit, { outputs: b.outputs }), editable: !!b.editable, parts: b.parts, inputs: b.inputs, height: b.height || 280 });
      page.editors.push(live);
    } catch (e) { host.appendChild(failed('This circuit', e)); }
    return figure(host, b.caption, 'live');
  };

  Bk.func = function (b) {
    const B = S.Bool, box = h('div.ls-func');
    try {
      const fn = S.Check.fnOf(b.func);
      const n = fn.vars.length;
      const head = h('tr', ...fn.vars.map((v) => h('th', v)), h('th', 'F'));
      const rows = [];
      for (let m = 0; m < 1 << n; m++) rows.push(h('tr', ...fn.vars.map((_, i) => h('td', String((m >> (n - 1 - i)) & 1))), h('td.f', String(B.value(fn, m)).replace('X', '×'))));
      const sop = B.minimise(fn, { form: 'sop' }), pos = B.minimise(fn, { form: 'pos' });
      box.append(h('div.fit-table', h('table.ls-table.ls-tt', h('thead', head), h('tbody', rows))),
        h('div.ls-func-forms', h('div', h('b', 'Σ '), h('span.mono', 'F = ' + B.sigma(fn))), h('div', h('b', 'Π '), h('span.mono', 'F = ' + B.pi(fn))),
          h('div', h('b', 'Minimal SOP '), h('span.mono', 'F = ' + sop.text)), h('div', h('b', 'Minimal POS '), h('span.mono', 'F = ' + pos.text))));
      const open = h('button.btn.small', { type: 'button', dataset: { act: 'open-func' } }, icon('gate'), 'Open in the function workbench');
      open.addEventListener('click', () => { if (S.Func) S.Func.set({ vars: fn.vars.slice(), ones: [...fn.ones], dc: [...fn.dc] }); location.hash = 'func'; });
      box.appendChild(h('div.ls-fig-tools', open));
    } catch (e) { box.appendChild(failed('This function', e)); }
    return figure(box, b.caption, 'func');
  };

  Bk.kmap = function (b) {
    const B = S.Bool, box = h('div.ls-kmap');
    try {
      const o = b.kmap, fn = S.Check.fnOf(o), form = o.form || 'sop';
      let groups = [];
      if (o.groups === 'minimal') groups = B.minimise(fn, { form }).cover.map((t) => B.cubeMinterms(t.cube));
      else if (Array.isArray(o.groups)) groups = o.groups.map((g) => { const c = S.Check.cubeOf(g, fn.vars, form); return c.cells || B.cubeMinterms(c); });
      S.FuncKmap.draw(box, { fn, form, groups: groups.map((cells) => ({ cells, check: B.checkGroup(fn, cells, { form }) })) });
    } catch (e) { box.appendChild(failed('This map', e)); }
    return figure(box, b.caption, 'kmap');
  };

  Bk.waveform = function (b) {
    const box = h('div.ls-wave');
    try {
      const w = b.waveform, want = S.Check.waveExpected(w);
      const n = Math.max(...Object.values(w.inputs).map((s) => s.length));
      const rows = Object.entries(w.inputs).map(([k, s]) => ({ name: k, levels: s.padEnd(n, s[s.length - 1]) })).concat(Object.entries(want).map(([k, s]) => ({ name: k, levels: s })));
      box.innerHTML = W().waveSvg(rows, { clocked: w.clocked });
    } catch (e) { box.appendChild(failed('This waveform', e)); }
    return figure(box, b.caption, 'wave');
  };

  Bk.verilog = function (b) {
    const src = typeof b.verilog === 'string' ? b.verilog : b.verilog.src, top = typeof b.verilog === 'object' ? b.verilog.top : undefined;
    const code = h('pre.ls-code.ls-vl', src);
    const out = h('pre.ls-code.exc-console', { hidden: true });
    const tools = h('div.ls-fig-tools');
    if (b.run !== false) {
      const run = h('button.btn.small.primary', { type: 'button', dataset: { act: 'run' } }, icon('run'), 'Run');
      run.addEventListener('click', () => {
        out.hidden = false;
        try {
          const r = S.Verilog.run(src, { top, until: 100000 });
          out.textContent = r.errors && r.errors.length ? r.errors.map((e) => (e.line ? 'line ' + e.line + ': ' : '') + (e.msg || e)).join('\n') : (r.output || []).join('\n') || '(nothing printed)';
        } catch (e) { out.textContent = e.message; }
      });
      tools.appendChild(run);
    }
    const open = h('button.btn.small', { type: 'button', dataset: { act: 'open-verilog' } }, icon('code'), 'Open on the Verilog page');
    open.addEventListener('click', () => { store.set('verilog', { files: [{ name: 'lesson.v', text: src }], active: 0, top: top || '', example: null }); location.hash = 'verilog'; });
    tools.appendChild(open);
    return figure(h('div', code, tools, out), b.caption, 'verilog');
  };

  Bk.fsm = function (b) {
    let el;
    try { el = W().fsmSvg(S.Check.machineOf(b.fsm.machine || b.fsm)); } catch (e) { el = failed('This state machine', e); }
    return figure(el, b.caption, 'fsm');
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
