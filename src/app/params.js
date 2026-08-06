// The edit dialog of a part, made from its parameters in the parts registry (name, type, choices, default,
// label): numbers, choices, switches, names and memory contents (with a hex editor). Each field says what is
// wrong with it as it is typed; OK applies the change as one undoable step.
(function (S) {
  'use strict';
  const { h } = S.UI;
  const D = S.Doc;
  const WORDS = { rise: 'Rising', fall: 'Falling', up: 'Up', down: 'Down', pin: 'Set by a pin', cathode: 'Common cathode (lights on 1)', anode: 'Common anode (lights on 0)', push: 'Push-pull', oc: 'Open collector', tri: 'Tristate' };
  const nice = (c) => WORDS[c] || (typeof c === 'string' ? c.charAt(0).toUpperCase() + c.slice(1) : String(c));
  const choicesOf = (p) => (p.choices || []).map((c) => (Array.isArray(c) ? c : typeof c === 'object' ? [c.value, c.label] : [c, nice(c)]));
  const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

  /** open the dialog for a part of the editor's document; resolves true when it changed */
  S.ParamDialog = function (editor, dp) {
    const doc = editor.doc;
    const def = S.Eng.def(dp.type) || {};
    const params = S.Eng.paramsOf(dp.type);
    const vals = {}, fields = {}, errs = {};
    const form = h('div.pd-form');
    const title = (def.label || dp.type) + ' ' + dp.id;
    for (const p of params) {
      let v = p.name === 'ftype' ? dp.type : dp.params[p.name];
      if (v === undefined) v = p.default;
      vals[p.name] = v;
      const id = 'pd-' + p.name;
      let ctl;
      const t = p.type || (typeof p.default === 'boolean' ? 'bool' : typeof p.default === 'number' ? 'number' : 'text');
      if (t === 'bool') {
        ctl = h('input', { type: 'checkbox', id, checked: !!v });
        ctl.addEventListener('change', () => { vals[p.name] = ctl.checked; check(); });
      } else if (t === 'enum' || p.choices) {
        ctl = h('select', { id }, ...choicesOf(p).map(([cv, cl]) => h('option', { value: String(cv), selected: String(cv) === String(v) }, cl)));
        ctl.addEventListener('change', () => { const c = choicesOf(p).find(([cv]) => String(cv) === ctl.value); vals[p.name] = c ? c[0] : ctl.value; check(); });
      } else if (t === 'hex' || t === 'memory') {
        ctl = hexEditor(p, () => vals, (text) => { vals[p.name] = text; check(); }, v || '');
      } else {
        const num = t === 'int' || t === 'number';
        ctl = h('input', { type: 'text', id, inputmode: num ? (t === 'int' ? 'numeric' : 'decimal') : null, value: v == null ? '' : String(v), spellcheck: 'false', autocomplete: 'off', placeholder: p.optional || (num && p.default == null) ? 'blank: the technology’s' : '' });
        ctl.addEventListener('input', () => { vals[p.name] = ctl.value; check(); });
      }
      const err = h('div.pd-err', { id: id + '-err', role: 'alert' });
      errs[p.name] = err;
      fields[p.name] = ctl;
      const row = h('div.pd-row' + (t === 'hex' || t === 'memory' ? '.wide' : '') + (t === 'bool' ? '.bool' : ''), h('label', { for: id }, p.label || p.name), ctl, err);
      form.appendChild(row);
    }
    if (!params.length) form.appendChild(h('p.muted', 'This part has nothing to set.'));
    const note = h('p.pd-note.muted');
    form.appendChild(note);
    let ok = true;
    function parsed() {
      const out = {};
      for (const p of params) {
        const t = p.type || 'text';
        let v = vals[p.name];
        if (t === 'int' || t === 'number') {
          if (v === '' || v == null) { if (p.optional || p.default == null) { out[p.name] = null; continue; } }
          const n = typeof v === 'number' ? v : String(v).trim().startsWith('0x') ? parseInt(v, 16) : Number(String(v).trim());
          out[p.name] = n;
        } else if (p.num || (p.choices && typeof p.default === 'number')) out[p.name] = Number(v);
        else out[p.name] = v;
      }
      return out;
    }
    function check() {
      const v = parsed();
      ok = true;
      for (const p of params) {
        const t = p.type || 'text', x = v[p.name];
        let msg = '';
        if (t === 'int' || t === 'number') {
          if (x == null && (p.optional || p.default == null)) msg = '';
          else if (vals[p.name] === '' || vals[p.name] == null || !isFinite(x)) msg = 'Give a number.';
          else if (t === 'int' && !Number.isInteger(x)) msg = 'Give a whole number.';
          else if (p.min != null && x < p.min) msg = 'At least ' + p.min + '.';
          else if (p.max != null && x > p.max) msg = 'At most ' + p.max + '.';
        } else if (t === 'text' && p.name === 'name') {
          if (!x || !String(x).trim()) msg = 'A port needs a name.';
          else if (!IDENT.test(String(x).trim())) msg = 'A name is a letter or _ then letters, digits or _.';
          else if (doc.parts.some((o) => o !== dp && o.params && o.params.name === String(x).trim() && S.Eng.isPort(o.type))) msg = 'Another port is called ' + x + ' already.';
        } else if (p.required && (!x || !String(x).trim())) msg = 'This is needed.';
        if (!msg && p.name === 'duty' && dp.type === 'CLOCK' && x != null) { const frac = p.max != null && p.max <= 1 || p.default != null && p.default < 1; if (frac ? x <= 0 || x >= 1 : x <= 0 || x >= 100) msg = frac ? 'A fraction between 0 and 1 (0.5 is a square wave).' : 'Between 1 and 99 %.'; }
        if (!msg && p.name === 'phase' && dp.type === 'CLOCK' && v.period && x != null && x >= v.period) msg = 'Less than the period (' + v.period + ' ns).';
        if (!msg && p.name === 'value' && v.w && x >= 2 ** v.w) msg = 'A ' + v.w + '-bit value is at most ' + (2 ** v.w - 1) + '.';
        if (!msg && p.name === 'mod' && x && v.w && x > 2 ** v.w) msg = 'A ' + v.w + '-bit counter counts to ' + 2 ** v.w + ' at most.';
        if (!msg && p.validate) { try { msg = p.validate(x, v) || ''; } catch (e) { msg = ''; } }
        errs[p.name].textContent = msg;
        if (fields[p.name] && fields[p.name].classList) fields[p.name].classList.toggle('bad', !!msg);
        if (msg) ok = false;
      }
      // what the change does to the wires: pins that go away take their wires with them
      const newType = v.ftype || dp.type;
      let pins = [];
      try { const np = Object.assign({}, dp.params, v); delete np.ftype; pins = S.Eng.pinsOf(newType, np).map((q) => q.name); } catch (e) { pins = []; }
      const lost = doc.wires.flatMap((w) => w.pins.filter(([pid, pn]) => pid === dp.id && !pins.includes(pn)).map(([, pn]) => pn));
      note.textContent = lost.length ? 'This removes the pin' + (lost.length > 1 ? 's ' : ' ') + lost.join(', ') + ' and the wire' + (lost.length > 1 ? 's' : '') + ' on ' + (lost.length > 1 ? 'them' : 'it') + '.' : '';
      return ok;
    }
    check();
    return S.UI.modal({
      title: 'Edit ' + title, wide: params.some((p) => p.type === 'hex' || p.type === 'memory'), cls: 'pd-modal', body: form,
      buttons: [{ label: 'Cancel', value: false }, { label: 'OK', primary: true, keepOpen: true, value: () => (check() ? true : undefined) }],
      enterValue: () => (check() ? true : undefined), cancelValue: false,
    }).then((yes) => {
      if (!yes) return false;
      const v = parsed();
      const newType = v.ftype || dp.type;
      delete v.ftype;
      for (const [k, x] of Object.entries(v)) { if (x == null || x === '') delete dp.params[k]; else dp.params[k] = typeof x === 'string' && k === 'name' ? x.trim() : x; }
      dp.type = newType;
      delete dp.g;
      let pins = [];
      try { pins = S.Eng.pinsOf(dp.type, dp.params).map((q) => q.name); } catch (e) { pins = []; }
      for (const w of doc.wires) w.pins = w.pins.filter(([pid, pn]) => pid !== dp.id || pins.includes(pn));
      doc.wires = doc.wires.filter((w) => w.pins.length >= 2);
      editor.commit('edit');
      return true;
    });
  };

  /** memory contents: a grid of words in hex with their addresses, or the plain text */
  function hexEditor(p, getVals, onChange, text) {
    const box = h('div.hexed');
    const grid = h('div.hex-grid', { role: 'grid' });
    const ta = h('textarea.hex-text', { rows: '5', spellcheck: 'false', 'aria-label': 'Contents as text' }, text);
    const head = h('div.hex-head');
    let page = 0;
    const words = () => S.Eng.hexWords(ta.value);
    const size = () => { const v = getVals(); return 2 ** Math.min(10, +v.aw || 3); };
    const digits = () => Math.ceil((+getVals().dw || 4) / 4);
    // plain hex words, eight to a line (the address of each is on the grid)
    const toText = (ws) => { const n = size(), out = []; let last = n - 1; while (last > 0 && !ws[last]) last--; for (let a = 0; a <= last; a += 8) out.push(Array.from({ length: Math.min(8, last - a + 1) }, (_, i) => (ws[a + i] || 0).toString(16).toUpperCase().padStart(digits(), '0')).join(' ')); return out.join('\n'); };
    function draw() {
      grid.innerHTML = '';
      const ws = words(), n = size(), per = 128, pages = Math.ceil(n / per);
      page = Math.min(page, pages - 1);
      head.innerHTML = '';
      head.append(h('span.muted', n + ' words of ' + (getVals().dw || 4) + ' bits, in hex'));
      if (pages > 1) for (let i = 0; i < pages; i++) { const b = h('button.chip' + (i === page ? '.on' : ''), { type: 'button' }, (i * per).toString(16).toUpperCase() + '–' + ((i + 1) * per - 1).toString(16).toUpperCase()); b.addEventListener('click', () => { page = i; draw(); }); head.appendChild(b); }
      for (let a = page * per; a < Math.min(n, (page + 1) * per); a += 8) {
        const row = h('div.hex-row', h('span.hex-addr', a.toString(16).toUpperCase().padStart(3, '0')));
        for (let i = 0; i < 8 && a + i < n; i++) {
          const inp = h('input.hex-cell', { type: 'text', value: (ws[a + i] || 0).toString(16).toUpperCase().padStart(digits(), '0'), maxlength: String(digits()), 'aria-label': 'Word ' + (a + i).toString(16), spellcheck: 'false', dataset: { addr: String(a + i) } });
          inp.addEventListener('input', () => {
            const ok = /^[0-9a-f]*$/i.test(inp.value) && inp.value.length && parseInt(inp.value, 16) < 2 ** (+getVals().dw || 4);
            inp.classList.toggle('bad', !ok);
            if (!ok) return;
            const w2 = words(); w2[a + i] = parseInt(inp.value, 16); ta.value = toText(w2); onChange(ta.value);
          });
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const nx = grid.querySelector('[data-addr="' + (a + i + 1) + '"]'); if (nx) { nx.focus(); nx.select(); } } });
          row.appendChild(inp);
        }
        grid.appendChild(row);
      }
    }
    ta.addEventListener('input', () => { onChange(ta.value); draw(); });
    const det = h('details.hex-raw', h('summary', 'As text (paste hex words, from address 0 on)'), ta);
    box.append(head, grid, det);
    draw();
    box.refresh = draw;
    // the grid follows the address and data widths as they are changed in the same dialog
    setTimeout(() => { const f = box.closest('.pd-form'); if (f) f.addEventListener('input', (e) => { if (e.target.id === 'pd-aw' || e.target.id === 'pd-dw') draw(); }); }, 0);
    return box;
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
