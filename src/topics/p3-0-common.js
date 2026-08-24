// Part 3, shared by the map topics: reading a function from Σm/ΠM notation or an expression, small text
// helpers, and a solved map: its prime groups appearing, essentials found by their lone cells, the rest
// chosen, and each chosen group flying out of the map as its term.
(function (S) {
  'use strict';
  const B = () => S.Bool;
  const K = () => S.Kit.km;
  const P3 = (S.P3 = S.P3 || {});

  // ---- shared helpers ----------------------------------------------------------------------------------
  const NAMES = 'ABCDEF'.split('');
  /** a function from "Σm(…) + d(…)", "ΠM(…)", or an expression over A, B, C, …; n = number of variables */
  P3.readFn = function (text, n) {
    const t = String(text || '').trim();
    if (!t) throw new Error('write a function, such as Σm(1, 3, 5) or A\'B + C');
    if (/^(Σ|Π|sum|prod|m\s*\(|M\s*\()/i.test(t)) return B().parseList(t, NAMES.slice(0, n));
    const r = B().tryParse(t);
    if (!r.ok) throw new Error(r.error.msg);
    const vs = B().vars(r.expr);
    const bad = vs.find((v) => !NAMES.slice(0, n).includes(v));
    if (bad) throw new Error(bad + ' is not one of the ' + n + ' variables ' + NAMES.slice(0, n).join(', '));
    return B().fromExpr(r.expr, NAMES.slice(0, n));
  };
  P3.fnCheck = (n) => (v, inp) => { try { P3.readFn(v, typeof n === 'number' ? n : inp.n === undefined ? 4 : +inp.n); return null; } catch (e) { return 'Function: ' + e.message; } };
  P3.nInput = (def, opts) => ({ id: 'n', kind: 'choice', label: 'Variables', def: String(def), options: (opts || ['2', '3', '4']).map((v) => ({ value: v, label: v + ' (' + NAMES.slice(0, +v).join(', ') + ')' })) });
  P3.list = (xs) => (xs.length ? xs.join(', ') : 'none');
  P3.plural = (k, w) => k + ' ' + w + (k === 1 ? '' : 's');
  /** a stage item for a short note under a picture */
  P3.note = (key, text, x, y, cls) => ({ key, kind: 'text', x, y, text, anchor: 'middle', cls: cls || 'km-note', size: 14 });
  /** what a group of cells is, in words: its size and its term */
  P3.termOf = (cells, vs, form) => { const Bo = B(); const c = Bo.spanCube(cells, vs.length); return Bo.term(c, vs, form || 'sop'); };


  // ---- a solved map ------------------------------------------------------------------------------------
  /**
   * P3.solver(fn, form, opts) reads Bool.kmapSolve's trace into steps, each with the state of the picture
   * after it, and draws any state: the map with its groups, a column listing the prime implicants (each a
   * chip in its group's tone, with what became of it), and the expression growing under the map as groups
   * are chosen. -> {res, g, primes, steps: [{kind, say, st, meta}], scene(st, opts) -> items, box}
   * A state is {shown: [labels], status: {label: 'ess'|'chosen'|'skip'}, hot, marks, miss, fx: [labels], final}.
   * opts: {prefix, layout ('maps'|'mirror'), x, y, cell, panel: false}
   */
  P3.solver = function (fn, form, opts) {
    opts = opts || {};
    const Bo = B(), pos = form === 'pos';
    const res = Bo.kmapSolve(fn, form);
    const g = Bo.kmap(fn, { layout: opts.layout });
    const P = opts.prefix || 'km', x0 = opts.x || 0, y0 = opts.y || 0;
    const useful = res.primes.filter((p) => !p.dcOnly);
    const tone = new Map(useful.map((p, i) => [p.label, i % 6]));
    const byLabel = new Map(useful.map((p) => [p.label, p]));
    const Fm = K().frame(g, { cell: opts.cell });
    const what = pos ? '0' : '1';
    const steps = [];
    const st = { shown: [], status: {}, hot: [], marks: {}, miss: [], fx: [], final: false };
    const snap = () => JSON.parse(JSON.stringify(st));
    for (const t of res.trace) {
      st.hot = []; st.miss = [];
      if (t.kind === 'kmap-cells') steps.push({ kind: t.kind, say: t.say, st: snap() });
      else if (t.kind === 'trivial') steps.push({ kind: t.kind, say: t.say, st: snap() });
      else if (t.kind === 'kmap-primes') {
        for (const p of useful) { st.shown.push(p.label); steps.push({ kind: 'prime', say: p.label + ' = ' + p.text + ': ' + P3.plural(p.group.cells.length, 'cell') + ' (' + p.group.cells.join(', ') + ')' + (p.group.wrapRows || p.group.wrapCols ? ', wrapping round the edge' : '') + (p.group.spansMaps ? ', the same block in ' + p.group.maps.length + ' maps' : '') + '. It cannot double without taking a ' + (pos ? '1' : '0') + '.', st: snap(), meta: { prime: p.label } }); }
        const dco = res.primes.filter((p) => p.dcOnly);
        steps.push({ kind: 'primes', say: 'So there are ' + P3.plural(useful.length, 'prime implicant') + ': ' + useful.map((p) => p.text).join(', ') + '.' + (dco.length ? ' (A group of don\'t-cares alone, ' + dco.map((p) => p.text).join(', ') + ', covers nothing that matters and is left out.)' : '') + ' Which of them are needed?', st: snap() });
      } else if (t.kind === 'kmap-essential') {
        st.status[t.group] = 'ess'; st.hot = [t.cell]; st.marks[t.cell] = '★'; st.fx.push(t.group);
        steps.push({ kind: 'ess', say: t.say + ' Every cover must use it.', st: snap(), meta: { cell: t.cell, label: t.group } });
      } else if (t.kind === 'kmap-left') {
        st.miss = t.cells.slice();
        steps.push({ kind: 'left', say: t.say, st: snap(), meta: { cells: t.cells, candidates: t.candidates } });
      } else if (t.kind === 'kmap-choose') {
        st.status[t.group] = 'chosen'; st.fx.push(t.group); st.hot = t.cells.slice();
        steps.push({ kind: 'choose', say: t.say, st: snap(), meta: { label: t.group } });
      } else if (t.kind === 'kmap-skip') {
        for (const p of useful) if (!st.status[p.label]) st.status[p.label] = 'skip';
        steps.push({ kind: 'skip', say: t.say, st: snap() });
      } else if (t.kind === 'kmap-pos') {
        steps.push({ kind: 'pos', say: t.say, st: snap() });
      } else if (t.kind === 'result') {
        for (const p of useful) if (!st.status[p.label]) st.status[p.label] = 'skip';
        st.final = true;
        steps.push({ kind: 'result', say: t.say, st: snap() });
      }
    }
    const fmt = (p) => p.text;
    const sv0 = { primes: useful };
    // the expression row sits under the map; when it is wider than the map it shifts left, so that on a phone
    // the camera can show the map and the row without the list of primes
    const rowHalf = P3.chipsWidth(res.cover.map((p) => p.text), 16, 'F =') / 2;
    const rowCentre = Math.min(x0 + (Fm.x0 - x0) + (Fm.W - (Fm.x0 - x0)) / 2, x0 + Fm.W + 24 - rowHalf);
    function scene(s, o) {
      o = o || {};
      const shown = s.final ? s.fx : s.shown.filter((l) => s.status[l] !== 'skip' || o.keepSkipped);
      const groups = shown.map((l) => ({ key: l, cells: byLabel.get(l).group.cells, tone: tone.get(l), cls: s.status[l] === 'ess' || s.status[l] === 'chosen' ? 'strong' : s.status[l] === 'skip' ? 'ghost' : '' }));
      const miss = new Set(s.miss || []);
      const map = K().draw({ geometry: g, prefix: P, x: x0, y: y0, cell: opts.cell, groups: (o.groups || groups), hot: s.hot, marks: s.marks, cls: (m) => (miss.has(m) ? 'miss' : o.cls ? o.cls(m) : ''), text: o.text, bars: o.bars, dim: o.dim });
      const items = map.items;
      // the column of prime implicants (two columns when there are many)
      if (opts.panel !== false && s.shown.length) {
        const px = x0 + Fm.W + 54, py = y0 + Fm.y0 - y0 - 6;
        const cols = s.shown.length > 5 ? 2 : 1, per = Math.ceil(s.shown.length / cols);
        const colW = Math.max(...sv0.primes.map((p) => K().chipWidth(fmt(p), 16))) + 110;
        items.push({ key: P + ':pt', kind: 'text', x: px, y: py - 14, text: 'Prime implicants', cls: 'title' });
        s.shown.forEach((l, i) => {
          const p = byLabel.get(l), stt = s.status[l], cx = px + Math.floor(i / per) * colW, cy = py + (i % per) * 46;
          items.push(K().chip(P + ':pl:' + l, fmt(p), cx, cy, { tone: tone.get(l), cls: (stt === 'ess' ? 'ess' : '') + (stt === 'skip' ? ' plain' : ''), dim: stt === 'skip', size: 16, h: 34 }));
          const w = K().chipWidth(fmt(p), 16);
          const tag = stt === 'ess' ? '★ essential' : stt === 'chosen' ? '✓ chosen' : stt === 'skip' ? 'not needed' : '';
          if (tag) items.push({ key: P + ':ps:' + l, kind: 'text', x: cx + w + 10, y: cy + 22, text: tag, cls: stt === 'skip' ? 'km-note' : 'good', size: 13 });
        });
      }
      // the expression under the map
      if (s.fx.length || o.fxAlways) {
        const terms = s.fx.map((l) => ({ key: l, text: fmt(byLabel.get(l)), tone: tone.get(l), src: map.pieces(l)[0] }));
        const cx = rowCentre;
        const row = K().chips(P + ':fx', terms, cx, y0 + Fm.H + 30 + (o.bars ? 46 : 0), { lead: 'F =', join: pos ? '·' : '+', size: 16 });
        items.push(...row.items);
      }
      return items;
    }
    return { res, g, frame: Fm, primes: useful, byLabel, tone, steps, scene, rowCentre, rowHalf };
  };
  /** how wide a row of term chips is */
  P3.chipsWidth = (texts, size, lead) => texts.reduce((a, t) => a + K().chipWidth(t, size || 16), 0) + 30 * Math.max(0, texts.length - 1) + (lead ? S.geom.textWidth(lead, (size || 16) + 1, { bold: true }) + 12 : 0);
  /** on a phone, the camera shows the map and the expression under it (the list of primes is left out) */
  P3.narrow = function (sv) {
    const Fm = sv.frame, x1 = Math.min(-12, sv.rowCentre - sv.rowHalf - 12), x2 = Fm.W + 36;
    return { x: x1, y: -12, w: x2 - x1, h: Fm.H + 92 };
  };


  /** frames for a whole solve: one per step */
  P3.solveFrames = function (sv, o) {
    const nv = P3.narrow(sv);
    return sv.steps.map((s) => ({ items: sv.scene(s.st, o), say: s.say, meta: Object.assign({ kind: s.kind }, s.meta || {}), mark: s.kind === 'result' ? 'cover' : undefined, narrowView: nv }));
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
