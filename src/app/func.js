// The function workbench (#func): one Boolean function held as one object, with every view kept in step: an
// editable truth table with don't-cares, the Σm and ΠM lists, an expression in the student's own notation, and
// tabs for the K-map (circle groups by dragging, each checked as it is drawn, then the whole cover), the
// Quine–McCluskey tables and chart, the algebra proof game, prove or refute, conversions, the cost of each
// circuit style, static hazards and the circuit itself, which opens in the editor.
(function (S) {
  'use strict';
  const { h, icon } = S.UI;
  const store = S.UI.storage;
  const B = () => S.Bool;
  const E = () => S.FuncEng;
  const TABS = [['kmap', 'K-map'], ['qm', 'Tabulation'], ['proof', 'Algebra'], ['prove', 'Prove'], ['convert', 'Convert'], ['cost', 'Cost'], ['hazards', 'Hazards'], ['circuit', 'Circuit']];
  const STYLES = [['and-or', 'AND-OR (from the minimal SOP)'], ['nand-nand', 'NAND-NAND (from the minimal SOP)'], ['or-and', 'OR-AND (from the minimal POS)'], ['nor-nor', 'NOR-NOR (from the minimal POS)'], ['multi', 'As the expression is written'], ['nand', 'NAND only, multi-level'], ['nor', 'NOR only, multi-level']];
  // our own sample functions
  const SAMPLES = {
    vote: { title: 'Two out of three', vars: ['A', 'B', 'C'], ones: [3, 5, 6, 7], dc: [] },
    alarm: { title: 'A door alarm with unused codes', vars: ['A', 'B', 'C', 'D'], ones: [0, 2, 5, 7, 8, 10, 13], dc: [6, 15] },
    five: { title: 'Five inputs', vars: ['A', 'B', 'C', 'D', 'E'], ones: [0, 4, 9, 13, 16, 20, 22, 25, 27, 29, 30], dc: [2, 18] },
    six: { title: 'Six inputs', vars: ['A', 'B', 'C', 'D', 'E', 'F'], ones: [0, 1, 8, 9, 18, 22, 26, 30, 33, 41, 49, 57, 63], dc: [] },
    glitch: { title: 'A function with a hazard', expr: "B'C + AB" },
    cyclic: { title: 'A cyclic chart', vars: ['A', 'B', 'C'], ones: [1, 2, 3, 4, 5, 6], dc: [] },
  };
  const PROOFS = [
    { start: "(P + Q)(P + Q') + P'QR", goal: 'P + QR' },
    { start: "XY + X'Z + YZ", goal: "XY + X'Z" },
    { start: "(A' + B')' + A'B + AB'", goal: 'A + B' },
    { start: "M'N + MN + M'N'", goal: "M' + N" },
  ];
  let pending = null;
  /** what the page keeps of a cover check (the rest is recomputed) */
  const compact = (c) => ({ verdict: c.verdict, say: c.say, uncovered: c.uncovered, covered: c.covered, smaller: c.smaller ? { cover: c.smaller.cover.map((t) => ({ minterms: t.minterms })) } : null });

  const defaults = () => ({ vars: ['A', 'B', 'C'], ones: [3, 5, 6, 7], dc: [], expr: null, groups: [], check: null, showAns: false, form: 'sop', tab: 'kmap', style: 'prime', build: 'and-or', haz: 'sop', proof: null, prove: { a: '', b: '' } });

  class FuncPage {
    constructor(app, main, rest) {
      this.app = app; this.main = main;
      const saved = pending || store.get('func', null);
      pending = null;
      this.st = Object.assign(defaults(), saved || {});
      const t = /^func\/(\w+)/.exec(rest || '');
      if (t && TABS.some(([id]) => id === t[1])) this.st.tab = t[1];
      this.keys = [['Function workbench', [['1 … 8', 'Switch tabs'], ['H', 'A hint (algebra)'], ['Ctrl  Z', 'Undo a proof step'], ['Backspace', 'Remove the last K-map group']]]];
      this.build();
      this.render();
    }
    get fn() { return B().fromMinterms(this.st.vars, this.st.ones, this.st.dc); }
    exprOf() {
      if (this.st.expr) { const r = B().tryParse(this.st.expr); if (r.ok) return r.expr; }
      return B().minimise(this.fn, { form: 'sop' }).expr;
    }
    fmt(e) { return B().toString(e, this.st.style); }
    save() { if (this.app.settings.autosave !== false) store.set('func', this.st); }

    // ---- the frame -------------------------------------------------------------------------------------------
    build() {
      const m = this.main;
      m.appendChild(this.app.workTabs('func'));
      const share = h('button.btn.small', { type: 'button', id: 'fnShare', title: 'Copy a link to this function' }, icon('share'), 'Share');
      share.addEventListener('click', () => this.app.share('func', this.st));
      const sample = h('select', { id: 'fnSample', 'aria-label': 'Examples' }, h('option', { value: '' }, 'Examples…'), ...Object.entries(SAMPLES).map(([k, v]) => h('option', { value: k }, v.title)));
      sample.addEventListener('change', () => { if (sample.value) this.sample(sample.value); sample.value = ''; });
      const nv = h('select', { id: 'fnVars', 'aria-label': 'Number of variables', title: 'A new, empty function of this many variables' }, h('option', { value: '' }, 'New…'), ...[1, 2, 3, 4, 5, 6].map((k) => h('option', { value: k }, k + ' variable' + (k > 1 ? 's' : ''))));
      nv.addEventListener('change', () => { if (nv.value) this.blank(+nv.value); nv.value = ''; });
      const style = h('select', { id: 'fnStyle', 'aria-label': 'Notation' }, ...[['prime', "A'B + C"], ['dot', 'A̅·B + C'], ['c', '~A & B | C']].map(([v, l]) => h('option', { value: v, selected: this.st.style === v }, l)));
      style.addEventListener('change', () => { this.st.style = style.value; this.save(); this.render(); });
      m.appendChild(h('div.fn-head', h('h1.page-title', 'Function workbench'), h('div.fn-acts', sample, nv, h('label.fn-inl', 'Notation ', style), share)));
      // the function, three ways
      this.inExpr = h('input', { type: 'text', id: 'fnExpr', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Expression' });
      this.inSig = h('input', { type: 'text', id: 'fnSigma', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Minterm list' });
      this.inPi = h('input', { type: 'text', id: 'fnPi', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Maxterm list' });
      this.err = h('div.fn-err', { id: 'fnErr', role: 'alert' });
      this.inExpr.addEventListener('change', () => this.fromExpr(this.inExpr.value));
      this.inExpr.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.fromExpr(this.inExpr.value); });
      for (const [inp, kind] of [[this.inSig, 'sigma'], [this.inPi, 'pi']]) {
        const go = () => this.fromList(inp.value, kind);
        inp.addEventListener('change', go);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      }
      this.facts = h('div.fn-facts', { id: 'fnFacts' });
      m.appendChild(h('section.card.fn-def',
        h('label.fn-field.wide', h('span', 'F ='), this.inExpr),
        h('label.fn-field', h('span', 'Σ'), this.inSig),
        h('label.fn-field', h('span', 'Π'), this.inPi),
        this.err, this.facts));
      // the table beside the tabs
      this.table = h('div.fn-table', { id: 'fnTable' });
      this.tabBar = h('div.fn-tabs', { role: 'tablist', 'aria-label': 'Views' });
      for (const [id, label] of TABS) {
        const b = h('button', { type: 'button', role: 'tab', dataset: { tab: id }, id: 'fnTab-' + id }, label);
        b.addEventListener('click', () => this.setTab(id));
        this.tabBar.appendChild(b);
      }
      S.UI.scrollRow(this.tabBar);
      this.view = h('div.fn-view', { id: 'fnView' });
      m.appendChild(h('div.fn-grid', h('section.card.fn-left', h('div.fn-sub', 'Truth table', h('span.muted', ' click F to cycle 0, 1, ×')), this.table), h('section.card.fn-right', this.tabBar, this.view)));
    }
    setTab(id) { this.st.tab = id; this.save(); this.render(); }
    sample(k) {
      const s = SAMPLES[k];
      if (s.expr) { this.fromExpr(s.expr); return; }
      Object.assign(this.st, { vars: s.vars.slice(), ones: s.ones.slice(), dc: s.dc.slice(), expr: null, groups: [], proof: null });
      this.changed();
    }
    blank(n) { Object.assign(this.st, { vars: B().nameVars(n), ones: [], dc: [], expr: null, groups: [], proof: null }); this.changed(); }
    fromExpr(text) {
      text = text.trim();
      if (!text) return;
      const r = B().tryParse(text);
      if (!r.ok) { this.showErr(r.error.msg, r.error.pos); return; }
      let vs = B().vars(r.expr);
      if (vs.length > 6) { this.showErr('The workbench takes up to 6 variables; this expression has ' + vs.length + '.'); return; }
      if (!vs.length) vs = this.st.vars.slice(0, 1).length ? this.st.vars.slice() : ['A'];
      const fn = B().fromExpr(r.expr, vs);
      const same = vs.join() === this.st.vars.join();
      Object.assign(this.st, { vars: vs, ones: [...fn.ones], dc: same ? this.st.dc.filter((m) => !fn.ones.has(m)) : [], expr: text });
      if (!same) this.st.groups = [];
      this.changed(true);
    }
    fromList(text, kind) {
      try {
        let fn = B().parseList(text, this.st.vars);
        if (kind === 'pi' && !/Π|M|prod/.test(text)) throw new Error('write the maxterms as ΠM(…) or M(…)');
        Object.assign(this.st, { ones: [...fn.ones], dc: [...fn.dc], expr: null });
        this.changed();
      } catch (e) { this.showErr(String(e.message || e).replace(/^./, (c) => c.toUpperCase()) + '.'); }
    }
    showErr(msg, pos) { this.err.textContent = msg + (pos != null ? ' (at column ' + (pos + 1) + ')' : ''); }
    /** the function changed: the views follow (the typed expression is kept when it was the source) */
    changed(fromExpr) {
      if (!fromExpr) this.st.expr = null;
      this.st.check = null;
      this.save();
      this.render();
    }
    cycle(m) {
      const o = new Set(this.st.ones), d = new Set(this.st.dc);
      if (o.has(m)) { o.delete(m); d.add(m); } else if (d.has(m)) d.delete(m); else o.add(m);
      this.st.ones = [...o].sort((a, b) => a - b); this.st.dc = [...d].sort((a, b) => a - b);
      this.changed();
    }

    // ---- drawing ---------------------------------------------------------------------------------------------
    render() {
      const fn = this.fn, Bo = B();
      this.err.textContent = '';
      if (document.activeElement !== this.inExpr) this.inExpr.value = this.st.expr || this.fmt(Bo.minimise(fn, { form: 'sop' }).expr);
      if (document.activeElement !== this.inSig) this.inSig.value = Bo.sigma(fn);
      if (document.activeElement !== this.inPi) this.inPi.value = Bo.pi(fn);
      this.facts.innerHTML = '';
      const sop = Bo.minimise(fn, { form: 'sop' }), pos = Bo.minimise(fn, { form: 'pos' });
      this.facts.append(h('span', h('b', String(fn.vars.length)), ' variables (' + fn.vars.join(', ') + ')'), h('span', h('b', String(fn.ones.size)), ' ones, ', h('b', String(fn.dc.size)), " don't-cares"),
        h('span', 'Minimal SOP ', h('code', { id: 'fnMinSop' }, this.fmt(sop.expr))), h('span', 'Minimal POS ', h('code', { id: 'fnMinPos' }, this.fmt(pos.expr))));
      this.renderTable();
      for (const b of this.tabBar.children) { const on = b.dataset.tab === this.st.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); if (on && this.tabBar.scrollWidth > this.tabBar.clientWidth) this.tabBar.scrollLeft = Math.max(0, b.offsetLeft - 40); }
      this.view.innerHTML = '';
      const t = this.st.tab;
      try { this['tab_' + t](this.view); } catch (e) { this.view.appendChild(S.UI.empty('warn', 'This view could not be drawn', String(e.message || e))); if (typeof console !== 'undefined') console.error(e); }
      requestAnimationFrame(() => S.UI.fitTables(this.main));
    }
    renderTable(hl) {
      const fn = this.fn, n = fn.vars.length, Bo = B();
      if (hl !== undefined) this.hlRow = hl;
      const rows = [];
      for (let m = 0; m < 1 << n; m++) {
        const v = Bo.value(fn, m);
        const cell = h('td.fv' + (v === 'X' ? '.dc' : v ? '.one' : ''), { tabindex: '0', role: 'button', 'aria-label': 'F at row ' + m + ' is ' + (v === 'X' ? "don't care" : v) + '; press to change', dataset: { m: String(m) } }, v === 'X' ? '×' : String(v));
        cell.addEventListener('click', () => this.cycle(m));
        cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.cycle(m); setTimeout(() => { const c = this.table.querySelector('td[data-m="' + m + '"]'); if (c) c.focus(); }, 0); } });
        rows.push(h('tr' + (this.hlRow === m ? '.hl' : ''), h('th', String(m)), ...Bo.bits(m, n).split('').map((b) => h('td', b)), cell));
      }
      this.table.innerHTML = '';
      this.table.appendChild(h('div.dtable-wrap.fn-tt', h('table.dtable', h('thead', h('tr', h('th', 'm'), ...fn.vars.map((v) => h('th', v)), h('th', 'F'))), h('tbody', ...rows))));
    }

    // ---- K-map ----------------------------------------------------------------------------------------------
    checkOf(cells) { return B().checkGroup(this.fn, cells, { form: this.st.form }); }
    addGroup(cells) {
      if (!cells.length) return;
      this.st.groups.push(cells);
      this.st.check = null;
      const c = this.checkOf(cells);
      this.lastSay = { ok: c.ok, say: 'Group ' + this.st.groups.length + ': ' + c.say };
      this.save(); this.render();
    }
    tab_kmap(v) {
      const Bo = B(), fn = this.fn, st = this.st;
      if (fn.vars.length > 6) { v.appendChild(S.UI.empty('info', 'Up to six variables', 'K-maps here take 1 to 6 variables.')); return; }
      const seg = h('div.seg', { role: 'group', 'aria-label': 'Group what' }, ...[['sop', 'Group 1s (SOP)'], ['pos', 'Group 0s (POS)']].map(([k, l]) => { const b = h('button' + (st.form === k ? '.on' : ''), { type: 'button', id: 'fnForm-' + k }, l); b.addEventListener('click', () => { st.form = k; st.groups = []; st.check = null; this.lastSay = null; this.save(); this.render(); }); return b; }));
      const chk = h('button.btn.small.primary', { type: 'button', id: 'fnCheck' }, icon('check'), 'Check my cover');
      chk.addEventListener('click', () => { st.check = compact(Bo.checkCover(fn, st.groups, { form: st.form })); st.showAns = false; this.save(); this.render(); });
      const ans = h('button.btn.small' + (st.showAns ? '.on' : ''), { type: 'button', id: 'fnAnswer', 'aria-pressed': String(!!st.showAns) }, icon('eye'), st.showAns ? 'Hide the answer' : 'Show an answer');
      ans.addEventListener('click', () => { st.showAns = !st.showAns; this.save(); this.render(); });
      const clr = h('button.btn.small', { type: 'button', id: 'fnClear' }, icon('trash'), 'Clear');
      clr.addEventListener('click', () => { st.groups = []; st.check = null; this.lastSay = null; this.save(); this.render(); });
      v.appendChild(h('div.fn-tools', seg, chk, ans, clr));
      v.appendChild(h('p.fn-hint.muted', 'Press on a cell and drag to the opposite corner to circle a group. Drag past an edge to wrap round' + (fn.vars.length > 4 ? ', or into the next map to take the same cells there' : '') + '.'));
      const groups = st.groups.map((cells) => ({ cells, check: this.checkOf(cells) }));
      const ck = st.check;
      const best = Bo.minimise(fn, { form: st.form });
      const suggest = st.showAns ? best.cover.map((t) => t.minterms) : ck && ck.verdict === 'not-minimal' ? ck.smaller.cover.map((t) => t.minterms) : [];
      const holder = h('div.km-wrap', { id: 'fnKmap' });
      v.appendChild(holder);
      this.km = S.FuncKmap.draw(holder, { fn, form: st.form, groups, suggest, miss: ck && ck.uncovered, bad: ck && ck.covered, onGroup: (cells) => this.addGroup(cells) });
      // the verdict on the whole cover, or what the last circle was
      if (ck) {
        const cls = ck.verdict === 'minimal' ? 'good' : ck.verdict === 'not-minimal' ? 'warn' : 'bad';
        v.appendChild(h('div.fn-verdict.' + cls, { id: 'fnVerdict', dataset: { verdict: ck.verdict } }, icon(cls === 'good' ? 'check' : cls === 'warn' ? 'hint' : 'warn'), h('span', ck.say + (ck.verdict === 'not-minimal' ? ' The dashed outlines show a smaller cover.' : ''))));
      } else if (st.showAns) v.appendChild(h('div.fn-verdict.info', icon('eye'), h('span', 'One minimal cover: F = ' + this.fmt(best.expr) + ' (' + best.cost.terms + ' terms, ' + best.cost.literals + ' literals), shown dashed.')));
      else if (this.lastSay) v.appendChild(h('div.fn-verdict.' + (this.lastSay.ok ? 'good' : 'bad'), { id: 'fnSay' }, icon(this.lastSay.ok ? 'check' : 'warn'), h('span', this.lastSay.say)));
      if (groups.length) {
        const list = h('ol.fn-groups', { id: 'fnGroups' });
        groups.forEach((gr, i) => {
          const x = h('button.icon-btn.small', { type: 'button', title: 'Remove this group', 'aria-label': 'Remove group ' + (i + 1) }, icon('x'));
          x.addEventListener('click', () => { st.groups.splice(i, 1); st.check = null; this.lastSay = null; this.save(); this.render(); });
          const c = gr.check;
          list.appendChild(h('li' + (c.ok ? (c.prime ? '.ok' : '.np') : '.bad'), h('i.sw.g' + (i % 8)), h('span.gt', c.ok ? h('code', this.fmt(c.expr)) : h('b', 'Not a group'), ' ', h('span.muted', '{' + gr.cells.join(', ') + '}'), h('span.gs', c.ok && c.prime ? ' prime' : c.ok ? ' not prime' : ''), h('span.gw', c.say)), x));
        });
        v.appendChild(list);
      }
    }

    // ---- Quine–McCluskey -------------------------------------------------------------------------------------
    tab_qm(v) {
      const Bo = B(), fn = this.fn, st = this.st;
      const seg = h('div.seg', ...[['sop', 'Minterms (SOP)'], ['pos', 'Maxterms (POS)']].map(([k, l]) => { const b = h('button' + (st.form === k ? '.on' : ''), { type: 'button' }, l); b.addEventListener('click', () => { st.form = k; this.save(); this.render(); }); return b; }));
      v.appendChild(h('div.fn-tools', seg));
      const r = Bo.minimise(fn, { form: st.form, method: 'qm' });
      const cols = r.columns || [];
      if (!cols.length) { v.appendChild(h('p', r.trace.map((t) => t.say).join(' '))); return; }
      const strip = h('div.qm-cols');
      cols.forEach((groups, ci) => {
        const body = [];
        groups.forEach((g, gi) => {
          g.rows.forEach((row, ri) => body.push(h('tr' + (ri === 0 && gi > 0 ? '.gsep' : '') + (row.dc ? '.dcrow' : ''), h('td.qm-ms', row.minterms.join(',')), h('td.qm-cube', row.str), h('td.qm-chk', row.checked ? '✓' : h('b.prime', '★')))));
        });
        strip.appendChild(h('div.qm-col', h('div.qm-h', 'Column ' + (ci + 1)), h('div.dtable-wrap', h('table.dtable.qm', h('thead', h('tr', h('th', st.form === 'pos' ? 'M' : 'm'), h('th', 'term'), h('th', ''))), h('tbody', ...body)))));
      });
      v.appendChild(h('div.fn-sub', 'The tabulation ', h('span.muted', '✓ merged into the next column, ★ a prime implicant')));
      v.appendChild(strip);
      // the chart
      const chartT = r.trace.find((t) => t.kind === 'chart');
      if (chartT) {
        const ess = new Set(r.essentials.map((p) => p.label)), chosen = new Set(r.cover.map((p) => p.label));
        const byLabel = new Map(r.primes.map((p) => [p.label, p]));
        const only = new Set(chartT.cols.filter((m) => chartT.marks.filter((ms) => ms.includes(m)).length === 1));
        const thead = h('tr', h('th', 'prime'), h('th', 'term'), ...chartT.cols.map((m) => h('th' + (only.has(m) ? '.only' : ''), String(m))));
        const rows = chartT.rows.map((lb, i) => h('tr' + (ess.has(lb) ? '.ess' : chosen.has(lb) ? '.chosen' : ''), h('th', lb), h('td.qm-term', this.fmt(byLabel.get(lb).expr)), ...chartT.cols.map((m) => h('td', chartT.marks[i].includes(m) ? '×' : ''))));
        v.appendChild(h('div.fn-sub', 'The prime implicant chart ', h('span.muted', 'essential rows shaded, columns covered once marked')));
        v.appendChild(h('div.dtable-wrap', { id: 'fnChart' }, h('table.dtable.qm-chart', h('thead', thead), h('tbody', ...rows))));
      }
      const steps = r.trace.filter((t) => !/^qm-(group|merge|duplicate)$/.test(t.kind));
      v.appendChild(h('ol.fn-steps', ...steps.map((t) => h('li', t.say))));
    }

    // ---- the algebra proof game --------------------------------------------------------------------------------
    newProof(start, goal) {
      const r = B().tryParse(start);
      if (!r.ok) { S.UI.toast(r.error.msg, 'err'); return; }
      let g;
      if (goal && goal.trim()) { const q = B().tryParse(goal); if (!q.ok) { S.UI.toast('The goal: ' + q.error.msg, 'err'); return; } if (!B().prove(r.expr, q.expr).equal) { S.UI.toast('The goal is not equal to the start, so no proof can reach it.', 'err'); return; } g = goal.trim(); }
      this.st.proof = { start: start.trim(), goal: g || null, steps: [], sel: [], msg: null, view: null };
      this.save(); this.render();
    }
    proofState() {
      const p = this.st.proof, Bo = B();
      let e = Bo.parse(p.start);
      const hist = [e];
      for (let i = 0; i < p.steps.length; i++) {
        const s = p.steps[i];
        try { e = E().step(e, s.path, s.law, s.opts).expr; hist.push(e); } catch (x) { p.steps.length = i; break; }
      }
      const minLits = Bo.minimise(Bo.fromExpr(hist[0]), { form: 'sop' }).cost.literals;
      const goal = p.goal ? { kind: 'expr', expr: Bo.parse(p.goal) } : { kind: 'lits', n: minLits };
      return { cur: e, hist, goal, done: E().reached(e, goal) };
    }
    move(lawId) {
      const p = this.st.proof, ps = this.proofState();
      try {
        const hinted = p.hint && p.hint.law === lawId && p.hint.path.join() === p.sel.join() ? p.hint.opts : null;
        const r = E().step(ps.cur, p.sel, lawId, hinted);
        p.steps.push({ law: lawId, path: p.sel.slice(), opts: r.opts || null });
        p.msg = { ok: true, say: E().lawName(lawId) + ': ' + this.fmt(r.node) + ' becomes ' + this.fmt(r.result) + '.' };
        p.sel = []; p.view = null; p.hint = null;
      } catch (e) {
        if (!(e instanceof E().Refuse)) throw e;
        p.msg = { ok: false, say: 'Refused: ' + e.message };
      }
      this.save(); this.render();
    }
    tab_proof(v) {
      const st = this.st;
      if (!st.proof) st.proof = { start: PROOFS[0].start, goal: PROOFS[0].goal, steps: [], sel: [], msg: null };
      const p = st.proof, ps = this.proofState(), Bo = B();
      // the start and the goal
      const sIn = h('input', { type: 'text', id: 'pfStart', value: p.start, spellcheck: 'false', 'aria-label': 'Start' });
      const gIn = h('input', { type: 'text', id: 'pfGoal', value: p.goal || '', placeholder: 'empty: as few literals as possible', spellcheck: 'false', 'aria-label': 'Goal' });
      const go = h('button.btn.small', { type: 'button', id: 'pfNew' }, icon('restart'), 'Start this proof');
      go.addEventListener('click', () => this.newProof(sIn.value, gIn.value));
      const mine = h('button.btn.small', { type: 'button', id: 'pfMine', title: 'Simplify the workbench function as written' }, 'Use F');
      mine.addEventListener('click', () => this.newProof(this.st.expr || this.fmt(this.exprOf()), ''));
      const pick = h('select', { 'aria-label': 'Example proofs' }, h('option', { value: '' }, 'Examples…'), ...PROOFS.map((x, i) => h('option', { value: i }, x.start + '  =  ' + x.goal)));
      pick.addEventListener('change', () => { if (pick.value !== '') { const x = PROOFS[+pick.value]; this.newProof(x.start, x.goal); } });
      v.appendChild(h('div.pf-setup', h('label.fn-field.wide', h('span', 'Start'), sIn), h('label.fn-field.wide', h('span', 'Goal'), gIn), h('div.pf-btns', go, mine, pick)));
      // the expression now, every subterm clickable (or a step being replayed)
      const viewing = p.view != null ? p.view : null;
      const shown = viewing != null ? ps.hist[viewing] : ps.cur;
      const goalTxt = ps.goal.kind === 'lits' ? 'as few literals as possible (' + ps.goal.n + ')' : this.fmt(ps.goal.expr);
      v.appendChild(h('div.pf-goal', 'Goal: ', h('b', goalTxt), h('span.muted', ' · now ' + Bo.literals(ps.cur) + ' literals')));
      const ex = h('div.pf-expr' + (viewing != null ? '.replay' : ''), { id: 'pfExpr', 'aria-label': 'The expression; click a part to select it' });
      ex.appendChild(this.exprDom(shown, [], viewing != null ? null : p.sel));
      v.appendChild(ex);
      if (ps.done && viewing == null) v.appendChild(h('div.fn-verdict.good', { id: 'pfDone' }, icon('check'), h('span', 'Proved in ' + p.steps.length + ' step' + (p.steps.length === 1 ? '' : 's') + ': ' + this.fmt(ps.hist[0]) + ' = ' + this.fmt(ps.cur) + '.')));
      else if (p.msg && viewing == null) v.appendChild(h('div.fn-verdict.' + (p.msg.ok ? 'good' : 'bad'), { id: 'pfMsg' }, icon(p.msg.ok ? 'check' : 'warn'), h('span', p.msg.say)));
      // the laws
      const sel = Bo.at(ps.cur, p.sel);
      v.appendChild(h('div.fn-sub', 'Laws ', h('span.muted', sel && p.sel.length ? 'applied to (click again to widen) ' : 'applied to the whole expression; click a part to narrow it (click again to widen), now ', h('code', this.fmt(sel || ps.cur)))));
      const laws = h('div.pf-laws', { id: 'pfLaws' }), xors = h('div.pf-laws');
      for (const l of E().lawList()) {
        const b = h('button.pf-law', { type: 'button', dataset: { law: l.id }, disabled: viewing != null }, h('b', l.name), h('span', l.form));
        b.addEventListener('click', () => this.move(l.id));
        (/^xor/.test(l.id) ? xors : laws).appendChild(b);
      }
      v.appendChild(laws);
      if (xors.children.length) {
        const more = h('details.pf-more', { open: p.xorOpen || /^xor/.test((p.hint && p.hint.law) || '') }, h('summary', 'XOR laws (' + xors.children.length + ')'), xors);
        more.addEventListener('toggle', () => { p.xorOpen = more.open; this.save(); });
        laws.after(more);
      }
      // tools
      const hint = h('button.btn.small', { type: 'button', id: 'pfHint', disabled: ps.done }, icon('hint'), 'Hint');
      hint.addEventListener('click', () => this.hint());
      const undo = h('button.btn.small', { type: 'button', id: 'pfUndo', disabled: !p.steps.length }, icon('undo'), 'Undo step');
      undo.addEventListener('click', () => { p.steps.pop(); p.msg = null; p.view = null; p.sel = []; this.save(); this.render(); });
      const back = h('button.icon-btn', { type: 'button', id: 'pfPrev', title: 'Replay: one step back', 'aria-label': 'Replay one step back', disabled: !p.steps.length }, icon('stepBack'));
      back.addEventListener('click', () => { p.view = Math.max(0, (p.view == null ? ps.hist.length - 1 : p.view) - 1); this.save(); this.render(); });
      const fwd = h('button.icon-btn', { type: 'button', id: 'pfNext', title: 'Replay: one step on', 'aria-label': 'Replay one step on', disabled: p.view == null }, icon('stepInto'));
      fwd.addEventListener('click', () => { p.view = p.view + 1 >= ps.hist.length - 1 ? null : p.view + 1; this.save(); this.render(); });
      const exp = h('button.btn.small', { type: 'button', id: 'pfExport', disabled: !p.steps.length }, icon('download'), 'Export');
      exp.addEventListener('click', () => S.UI.download('proof.txt', this.proofText(), 'text/plain'));
      v.appendChild(h('div.fn-tools', hint, undo, h('span.sep'), back, h('span.pf-pos', viewing != null ? 'step ' + viewing + ' of ' + p.steps.length : p.steps.length + ' step' + (p.steps.length === 1 ? '' : 's')), fwd, exp));
      // the proof so far
      const ol = h('ol.pf-steps', { id: 'pfSteps', start: '0' }, h('li' + (viewing === 0 ? '.on' : ''), h('code', this.fmt(ps.hist[0])), h('span.muted', ' start')));
      p.steps.forEach((s, i) => ol.appendChild(h('li' + (viewing === i + 1 ? '.on' : ''), '= ', h('code', this.fmt(ps.hist[i + 1])), h('span.muted', ' by ' + E().lawName(s.law)))));
      v.appendChild(ol);
    }
    /** the expression as nested spans, each subterm selectable */
    exprDom(e, path, sel) {
      const Bo = B(), style = this.st.style === 'c' ? 'c' : 'prime';
      const PREC = { or: 1, xor: 2, and: 3, not: 4, var: 5, const: 5 };
      const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
      const wrapIn = (x, p, parentOp) => {
        const inner = node(x, p);
        const needB = PREC[x.op] < PREC[parentOp] || x.op === parentOp;
        return needB ? h('span.pf-br', '(', inner, ')') : inner;
      };
      const node = (x, p) => {
        const kids = [];
        if (x.op === 'var') kids.push(x.name);
        else if (x.op === 'const') kids.push(String(x.v));
        else if (x.op === 'not') {
          if (style === 'c') kids.push('~', PREC[x.a.op] >= 4 ? node(x.a, p.concat(0)) : h('span.pf-br', '(', node(x.a, p.concat(0)), ')'));
          else kids.push(PREC[x.a.op] >= 4 ? node(x.a, p.concat(0)) : h('span.pf-br', '(', node(x.a, p.concat(0)), ')'), "'");
        } else {
          const opTxt = x.op === 'or' ? (style === 'c' ? ' | ' : ' + ') : x.op === 'xor' ? (style === 'c' ? ' ^ ' : ' ⊕ ') : style === 'c' ? ' & ' : '';
          x.args.forEach((a, i) => { if (i) kids.push(h('span.pf-op', opTxt || (x.op === 'and' && needsDot(x.args[i - 1], a) ? '·' : ''))); kids.push(wrapIn(a, p.concat(i), x.op)); });
        }
        const s = h('span.pf-t' + (sel && same(sel, p) ? '.sel' : ''), { dataset: { path: p.join('.') }, title: Bo.toString(x) }, ...kids);
        if (sel) s.addEventListener('click', (ev) => { ev.stopPropagation(); const pf = this.st.proof; pf.sel = same(pf.sel, p) && p.length ? p.slice(0, -1) : p; pf.msg = null; this.save(); this.render(); });
        return s;
      };
      const needsDot = (a, b) => /[0-9]$/.test(Bo.toString(a)) && /^[0-9]/.test(Bo.toString(b));
      return node(e, path);
    }
    hint() {
      const p = this.st.proof, ps = this.proofState();
      const m = ps.done ? null : E().hintStep(ps.cur, ps.goal);
      if (!m || m.none) { p.msg = { ok: false, say: (m && m.say) || 'No single law shortens this now; try distributing or factoring to make one apply.' }; }
      else { p.sel = m.path; p.hint = m; p.msg = { ok: true, say: 'Hint: try ' + E().lawName(m.law) + ' on the part now selected, ' + this.fmt(B().at(ps.cur, m.path)) + '.' }; }
      this.save(); this.render();
    }
    proofText() {
      const p = this.st.proof, ps = this.proofState();
      const out = ['Proof: ' + this.fmt(ps.hist[0]) + ' = ' + this.fmt(ps.cur), ''];
      out.push('    ' + this.fmt(ps.hist[0]));
      const form = (id) => (E().lawList().find((l) => l.id === id) || {}).form || '';
      p.steps.forEach((s, i) => out.push('  = ' + this.fmt(ps.hist[i + 1]) + '    (' + E().lawName(s.law) + ': ' + form(s.law) + ')'));
      out.push('', ps.done ? 'The goal is reached.' : 'The goal is not reached yet.');
      return out.join('\n') + '\n';
    }

    // ---- prove or refute ---------------------------------------------------------------------------------------
    tab_prove(v) {
      const st = this.st, Bo = B();
      const a = h('input', { type: 'text', id: 'pvA', value: st.prove.a || this.st.expr || this.fmt(this.exprOf()), spellcheck: 'false', 'aria-label': 'Left side' });
      const b = h('input', { type: 'text', id: 'pvB', value: st.prove.b || '', spellcheck: 'false', placeholder: "for example A'B' + AB", 'aria-label': 'Right side' });
      const go = h('button.btn.small.primary', { type: 'button', id: 'pvGo' }, icon('check'), 'Prove or refute');
      const dual = h('button.btn.small', { type: 'button', id: 'pvDual' }, 'Dualise');
      const run = (kind) => { st.prove = { a: a.value, b: b.value, kind }; this.save(); this.render(); };
      go.addEventListener('click', () => run('prove'));
      dual.addEventListener('click', () => run('dual'));
      for (const x of [a, b]) x.addEventListener('keydown', (e) => { if (e.key === 'Enter') run('prove'); });
      v.appendChild(h('div.pf-setup', h('label.fn-field.wide', h('span', 'Left'), a), h('label.fn-field.wide', h('span', 'Right'), b), h('div.pf-btns', go, dual)));
      if (!st.prove.kind || !st.prove.b) { v.appendChild(h('p.muted', 'Type two expressions: the tool compares them on every row, and shows a row where they differ if they are not equal.')); return; }
      const pa = Bo.tryParse(st.prove.a), pb = Bo.tryParse(st.prove.b);
      if (!pa.ok || !pb.ok) { v.appendChild(h('div.fn-verdict.bad', icon('warn'), h('span', (pa.ok ? 'Right: ' + pb.error.msg : 'Left: ' + pa.error.msg)))); return; }
      if (st.prove.kind === 'dual') {
        const d = Bo.dualise(pa.expr, pb.expr);
        v.appendChild(h('div.fn-verdict.' + (d.holds && d.dualHolds ? 'good' : 'warn'), { id: 'pvRes' }, icon('info'), h('span', d.say)));
        return;
      }
      const r = Bo.prove(pa.expr, pb.expr);
      v.appendChild(h('div.fn-verdict.' + (r.equal ? 'good' : 'bad'), { id: 'pvRes', dataset: { equal: String(r.equal) } }, icon(r.equal ? 'check' : 'warn'), h('span', r.say)));
      if (r.vars.length <= 6) {
        const fa = Bo.compile(pa.expr, r.vars), fb = Bo.compile(pb.expr, r.vars), rows = [];
        for (let m = 0; m < 1 << r.vars.length; m++) {
          const x = fa(m), y = fb(m);
          rows.push(h('tr' + (r.counterexample && r.counterexample.m === m ? '.hl' : x !== y ? '.diff' : ''), ...Bo.bits(m, r.vars.length).split('').map((q) => h('td', q)), h('td.b', String(x)), h('td.b', String(y))));
        }
        v.appendChild(h('div.dtable-wrap.pv-tt', h('table.dtable', h('thead', h('tr', ...r.vars.map((x) => h('th', x)), h('th', 'Left'), h('th', 'Right'))), h('tbody', ...rows))));
      }
    }

    // ---- convert -------------------------------------------------------------------------------------------------
    tab_convert(v) {
      const Bo = B(), fn = this.fn, e = this.exprOf();
      const rows = [
        ['Canonical SOP (sum of minterms)', Bo.canonicalSOP(fn)],
        ['Canonical POS (product of maxterms)', Bo.canonicalPOS(fn)],
        ['Minimal SOP', Bo.minimise(fn, { form: 'sop' }).expr],
        ['Minimal POS', Bo.minimise(fn, { form: 'pos' }).expr],
        ["Complement F' (De Morgan, pushed to the literals)", Bo.complementExpr(e).expr],
        ["Complement F', minimal SOP", Bo.minimise(Bo.complement(fn), { form: 'sop' }).expr],
        ['Dual (AND and OR swapped, 0 and 1 swapped)', Bo.dualExpr(e)],
      ];
      const list = h('div.cv-list', { id: 'cvList' });
      for (const [title, x] of rows) {
        const use = h('button.btn.small', { type: 'button', title: 'Make this the workbench function' }, 'Use');
        use.addEventListener('click', () => this.fromExpr(Bo.toString(x)));
        list.appendChild(h('div.cv-row', h('div.cv-t', title), h('code.cv-x', this.fmt(x)), use));
      }
      v.appendChild(list);
      const toPi = Bo.convertList(fn, 'pi');
      v.appendChild(h('div.fn-sub', 'Σm to ΠM'));
      v.appendChild(h('ol.fn-steps', ...toPi.trace.map((t) => h('li', t.say))));
    }

    // ---- cost ----------------------------------------------------------------------------------------------------
    tab_cost(v) {
      const Bo = B(), fn = this.fn, e = this.exprOf();
      const tech = S.Eng && S.Eng.tech ? S.Eng.tech(this.app.settings.tech) : { tpd: 10, label: 'CMOS' };
      const techName = (S.Eng && S.Eng.techPresets && (S.Eng.techPresets()[this.app.settings.tech] || {}).label) || this.app.settings.tech;
      const sop = Bo.minimise(fn, { form: 'sop' }), pos = Bo.minimise(fn, { form: 'pos' });
      const rows = [];
      const styles = [['multi', 'The expression as written', e], ['and-or', 'AND-OR', sop.expr], ['nand-nand', 'NAND-NAND', sop.expr], ['or-and', 'OR-AND', pos.expr], ['nor-nor', 'NOR-NOR', pos.expr], ['nand', 'NAND only', e], ['nor', 'NOR only', e]];
      let best = null;
      for (const [style, label, x] of styles) {
        let c = null;
        try { c = E().circuitCost(E().build(fn, e, style).circuit, tech.tpd); } catch (err) { c = null; }
        rows.push({ label, lits: Bo.literals(x), c });
        if (c && (!best || c.inputs < best.c.inputs || (c.inputs === best.c.inputs && c.delay < best.c.delay))) best = rows[rows.length - 1];
      }
      v.appendChild(h('p.muted', 'Each style built as a gate circuit. Inverters count as gates and as a level; delays are ' + tech.tpd + ' ns a gate (' + techName + ', the technology chosen in Settings).'));
      v.appendChild(h('div.dtable-wrap', { id: 'costTable' }, h('table.dtable.cost', h('thead', h('tr', h('th', 'style'), h('th', 'literals'), h('th', 'gates'), h('th', 'of them NOT'), h('th', 'gate inputs'), h('th', 'levels'), h('th', 'worst delay'))),
        h('tbody', ...rows.map((r) => h('tr' + (r === best ? '.best' : ''), h('th', r.label), h('td', String(r.lits)), ...(r.c ? [h('td', String(r.c.gates)), h('td', String(r.c.inverters)), h('td', String(r.c.inputs)), h('td', String(r.c.levels)), h('td', r.c.delay + ' ns')] : [h('td', { colspan: '5' }, 'not built (XOR or a constant)')])))))));
      if (best) v.appendChild(h('p', 'Fewest gate inputs: ', h('b', best.label), ' (' + best.c.inputs + ' gate inputs, ' + best.c.delay + ' ns). SOP has ' + sop.cost.literals + ' literals and POS ' + pos.cost.literals + '.'));
    }

    // ---- hazards --------------------------------------------------------------------------------------------------
    tab_hazards(v) {
      const Bo = B(), fn = this.fn, st = this.st, form = st.haz || 'sop';
      const seg = h('div.seg', ...[['sop', 'Static-1 (SOP)'], ['pos', 'Static-0 (POS)']].map(([k, l]) => { const b = h('button' + (form === k ? '.on' : ''), { type: 'button', id: 'hzForm-' + k }, l); b.addEventListener('click', () => { st.haz = k; this.save(); this.render(); }); return b; }));
      v.appendChild(h('div.fn-tools', seg));
      const mine = st.expr ? E().coverOf(this.exprOf(), fn.vars, form) : null;
      const r = E().hazards(fn, form, mine || undefined);
      const coverExpr = r.cover.length ? (form === 'pos' ? Bo.AND(r.cover.map((t) => t.expr)) : Bo.OR(r.cover.map((t) => t.expr))) : Bo.C(form === 'pos' ? 1 : 0);
      v.appendChild(h('p', 'Looking at ', h('code', this.fmt(coverExpr)), mine ? ' (your expression).' : ' (the minimal ' + form.toUpperCase() + ').'));
      const holder = h('div.km-wrap.small', { id: 'hzKmap' });
      v.appendChild(holder);
      if (fn.vars.length <= 6) S.FuncKmap.draw(holder, { fn, form, groups: r.cover.map((t) => ({ cells: t.minterms, check: { ok: true, prime: true } })), suggest: r.fixes.map((t) => t.minterms), haz: r.hazards.map((x) => [x.a, x.b]) });
      v.appendChild(h('div.fn-verdict.' + (r.hazards.length ? 'warn' : 'good'), { id: 'hzSay' }, icon(r.hazards.length ? 'warn' : 'check'), h('span', r.say + (r.hazards.length ? ' Cells on either side of each are marked; the dashed outlines are the consensus terms that fix them.' : ''))));
      if (r.hazards.length) {
        v.appendChild(h('ol.fn-steps', { id: 'hzList' }, ...r.hazards.map((x) => h('li', x.say))));
        const use = h('button.btn.small.primary', { type: 'button', id: 'hzUse' }, 'Use the hazard-free form');
        use.addEventListener('click', () => this.fromExpr(Bo.toString(r.fixed)));
        v.appendChild(h('p', 'Hazard-free: ', h('code', this.fmt(r.fixed)), ' ', use));
      }
    }

    // ---- the circuit ----------------------------------------------------------------------------------------------
    tab_circuit(v) {
      const st = this.st, fn = this.fn;
      const sel = h('select', { id: 'bdStyle', 'aria-label': 'Circuit style' }, ...STYLES.map(([k, l]) => h('option', { value: k, selected: st.build === k }, l)));
      sel.addEventListener('change', () => { st.build = sel.value; this.save(); this.render(); });
      const open = h('button.btn.small.primary', { type: 'button', id: 'bdOpen' }, icon('gate'), 'Open in the editor');
      v.appendChild(h('div.fn-tools', h('label.fn-inl', 'Style ', sel), open));
      let built;
      try { built = E().build(fn, this.exprOf(), st.build, 'F'); } catch (e) { v.appendChild(h('div.fn-verdict.warn', icon('warn'), h('span', String(e.message || e)))); open.disabled = true; return; }
      open.addEventListener('click', () => this.openCircuit(built.circuit));
      v.appendChild(h('p.muted', 'F = ', h('code', this.fmt(built.expr))));
      const wrap = h('div.sk-wrap.fn-sk', { id: 'bdPreview' });
      v.appendChild(wrap);
      try { S.Render.into(wrap, S.Layout.layout(built.circuit), { style: this.app.settings.style }); } catch (e) { wrap.textContent = 'The drawing failed: ' + e.message; }
    }
    openCircuit(c) {
      const title = 'F = ' + B().toString(this.exprOf());
      if (S.Build && S.Build.openCircuit) S.Build.openCircuit(c, title);
      else location.hash = 'build';
    }

    // ---- keys -----------------------------------------------------------------------------------------------------
    onKey(e, typing) {
      if (typing) return false;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && this.st.tab === 'proof' && this.st.proof && this.st.proof.steps.length) { e.preventDefault(); this.st.proof.steps.pop(); this.st.proof.msg = null; this.save(); this.render(); return true; }
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (/^[1-8]$/.test(e.key)) { e.preventDefault(); this.setTab(TABS[+e.key - 1][0]); return true; }
      if ((e.key === 'h' || e.key === 'H') && this.st.tab === 'proof') { e.preventDefault(); this.hint(); return true; }
      if (e.key === 'Backspace' && this.st.tab === 'kmap' && this.st.groups.length) { e.preventDefault(); this.st.groups.pop(); this.st.check = null; this.lastSay = null; this.save(); this.render(); return true; }
      return false;
    }
    redraw() { this.render(); }
    dispose() { if (S.Func.page === this) S.Func.page = null; }
  }

  S.Func = {
    page: null, samples: SAMPLES,
    /** load a function: {vars, ones, dc} or {expr}, with any other state */
    set(data) { if (S.Func.page) { S.Func.page.lastSay = null; Object.assign(S.Func.page.st, defaults(), data); S.Func.page.save(); S.Func.page.render(); } else pending = data; },
  };
  S.Pages.register('func', {
    title: 'Function workbench', nav: 'build',
    open(app, main, rest) { if (!S.Bool || !S.Bool.parse) { main.appendChild(S.UI.empty('warn', 'The Boolean engine is not loaded', 'The function workbench needs Sirkit.Bool.')); return {}; } const p = new FuncPage(app, main, rest); S.Func.page = p; return p; },
    load(data) { pending = Object.assign(defaults(), data); store.set('func', pending); },
  });

  // scenes for the diagram checker
  const scene = (name, data, tab, extra) => S.Checks.push({ group: 'func', name: 'function workbench / ' + name, hash: 'func', sel: '#main',
    setup: 'Sirkit.Func.set(' + JSON.stringify(Object.assign({ tab }, data)) + ');' + (extra || ''), ready: '!!document.querySelector("#fnView") && !!Sirkit.Func.page' });
  scene('3 variables', { vars: ['A', 'B', 'C'], ones: [3, 5, 6, 7], dc: [], groups: [[3, 7], [5, 7], [6, 7]] }, 'kmap');
  scene('4 variables, don\'t-cares, groups checked', { vars: ['A', 'B', 'C', 'D'], ones: [0, 2, 5, 7, 8, 10, 13], dc: [6, 15], groups: [[0, 2, 8, 10], [5, 7, 13, 15], [6, 7]] }, 'kmap', 'document.getElementById("fnCheck").click();');
  scene('5-variable map', Object.assign({}, SAMPLES.five, { groups: [[9, 13, 25, 29]] }), 'kmap');
  scene('6-variable map with an answer', Object.assign({}, SAMPLES.six, { showAns: true }), 'kmap');
  scene('tabulation', SAMPLES.alarm, 'qm');
  scene('proof, mid-way', { vars: ['P', 'Q', 'R'], ones: [4, 5, 6, 7, 3], dc: [], proof: { start: PROOFS[0].start, goal: PROOFS[0].goal, steps: [{ law: S.FuncEng.engineLaws() ? 'distributive-or' : 'factor', path: [0] }], sel: [0], msg: null } }, 'proof');
  scene('hazards', { vars: ['A', 'B', 'C'], ones: [1, 5, 6, 7], dc: [], expr: "B'C + AB" }, 'hazards');
  scene('cost', SAMPLES.alarm, 'cost');
  scene('circuit', SAMPLES.vote, 'circuit');
})(globalThis.Sirkit = globalThis.Sirkit || {});
