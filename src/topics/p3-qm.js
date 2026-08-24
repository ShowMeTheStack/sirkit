// Quine–McCluskey: the tabulation (columns of rows grouped by their number of 1s, each merge growing out of its
// two sources and checking them off, the rows left unchecked becoming the prime implicants), the prime
// implicant chart (essential columns circled, row and column dominance striking rows and columns out) and
// Petrick's method on a cyclic core (one sum multiplied in per step, absorbed products crossed out).
(function (S) {
  'use strict';
  const B = S.Bool, K = S.Kit, Geo = S.geom;

  S.family({ id: 'p3-qm', part: 'minimise', order: 60, title: 'Quine–McCluskey', blurb: 'Minimisation by table instead of by eye: merge terms that differ in one bit until nothing merges, then choose the cheapest set of prime implicants with a chart.' });

  /** a function from a Σm or ΠM list over n variables (n from the input) */
  const fnOf = (inp) => B.parseList(inp.fn, +inp.n);
  const listCheck = (max) => (v, inp) => {
    let f;
    try { f = B.parseList(String(v), +inp.n); } catch (e) { return 'Function: ' + e.message; }
    const all = f.ones.size + f.dc.size;
    if (!f.ones.size) return 'Function: list at least one minterm';
    if (all > max) return 'Function: at most ' + max + ' minterms and don\'t-cares together, so the picture stays readable';
    if (all === 1 << f.vars.length) return 'Function: every row is listed, so F = 1 and there is nothing to merge';
    return null;
  };
  const nInput = { id: 'n', kind: 'choice', label: 'Variables', def: '4', options: [{ value: '3', label: '3 (A, B, C)' }, { value: '4', label: '4 (A, B, C, D)' }] };
  const formInput = { id: 'form', kind: 'choice', label: 'Form', def: 'sop', options: [{ value: 'sop', label: 'SOP (merge the 1s)' }, { value: 'pos', label: 'POS (merge the 0s)' }] };
  const defOf = (f, extra) => ({ sections: [{ id: 'fn', kind: 'math', title: 'The function', text: ['F(' + f.vars.join(', ') + ') = ' + B.sigma(f), '    = ' + B.pi(f)].concat(extra || []).join('\n') }] });

  // ---------------------------------------------------------------------------------------------------
  // The tabulation
  // ---------------------------------------------------------------------------------------------------
  const otherCubes = (res, n) => {
    // distractors: the same bits with the dash moved to another place
    const out = [];
    const bits = res.replace(/-/g, '0');
    for (let i = 0; i < n && out.length < 3; i++) {
      if (res[i] === '-') continue;
      const c = res.split('');
      const d = c.indexOf('-');
      c[d] = bits[d] === '0' ? '1' : '0';
      c[i] = '-';
      const s = c.join('');
      if (s !== res && !out.includes(s)) out.push(s);
    }
    while (out.length < 3) out.push(res.replace(/-/g, '0').slice(0, n - out.length - 1) + '-'.repeat(out.length + 1));
    return out;
  };
  S.topic({
    id: 'qm-tabulation', family: 'p3-qm', order: 10, title: 'The Quine–McCluskey tabulation',
    blurb: 'Group the minterms by how many 1s they hold; any two in neighbouring groups that differ in one bit merge, the bit becoming a dash. Repeat column after column. What never merges is a prime implicant.',
    inputs: [
      { id: 'fn', kind: 'text', label: 'Function', def: 'Σm(0, 2, 3, 7, 8, 10, 11, 13, 15)', check: listCheck(12) },
      nInput, formInput,
    ],
    check: (inp) => { const f = fnOf(inp); const r = B.tabulate(f, inp.form); const big = Math.max(...r.columns.map((c) => c.reduce((s, g) => s + g.rows.length, 0))); return big > 18 ? 'This function gives a column of ' + big + ' rows; pick a smaller one (at most 18 rows in a column)' : (inp.form === 'pos' && !B.zeros(f).length) ? 'There are no 0s to merge' : null; },
    presets: [
      { label: 'Three columns, with repeats', values: { fn: 'Σm(0, 2, 3, 7, 8, 10, 11, 13, 15)', n: '4', form: 'sop' } },
      { label: 'Three variables, all pairs', values: { fn: 'Σm(0, 1, 2, 5, 6, 7)', n: '3', form: 'sop' } },
      { label: 'Don\'t-cares join in', values: { fn: 'Σm(1, 2, 3, 5, 7, 9, 13) + d(14, 15)', n: '4', form: 'sop' } },
      { label: 'A prime of don\'t-cares only', values: { fn: 'Σm(10, 11, 12, 13) + d(6)', n: '4', form: 'sop' } },
      { label: 'POS: merging the 0s', values: { fn: 'Σm(0, 1, 2, 3, 6, 7, 9, 13)', n: '4', form: 'pos' } },
      { label: 'Nothing merges', values: { fn: 'Σm(0, 3, 5, 6)', n: '3', form: 'sop' } },
    ],
    counters: [{ id: 'merges', label: 'merges' }, { id: 'primes', label: 'prime implicants' }],
    run(inp) {
      const f = fnOf(inp), n = f.vars.length, form = inp.form, pos = form === 'pos';
      const r = B.tabulate(f, form);
      const cols = r.columns;
      const label = new Map(r.primes.map((p) => [p.str, p.label]));
      const st = { shown: new Set(), checked: new Set(), prime: new Map(), bands: new Set(), dim: new Set() };
      const id = (c, s) => c + ':' + s;
      const F = new S.Frames(['merges', 'primes']);
      const full = K.qm.tab(Object.assign({ columns: cols, n, shown: new Set(cols.flatMap((g, c) => g.flatMap((x) => x.rows.map((rw) => id(c, rw.str))))) }));
      const chipX = full.box.x + full.box.w + 30, chipY = full.box.y - 2;
      const what = pos ? 'maxterms' : 'minterms';
      const scene = (o) => {
        o = o || {};
        const t = K.qm.tab({ columns: cols, n, shown: st.shown, checked: st.checked, prime: st.prime, bands: st.bands, dim: st.dim, flat0: o.flat0, hot: o.hot, src: o.src, enterFrom: o.enterFrom, links: o.links, what });
        const items = t.items;
        if (o.chips) items.push(...K.qm.chips(o.chips, { x: chipX, y: chipY + 30, maxW: 1, prefix: 'pr', mono: true, size: 15, gap: 8 }).items, { key: 'pr:title', kind: 'text', x: chipX, y: chipY + 14, text: 'Prime implicants', cls: 'title' });
        return { items, t };
      };
      const narrow = (cs) => { const bx = Geo.union(cs.filter((c) => c < cols.length).map((c) => full.colBox(c))); return { x: bx.x - 10, y: bx.y - 10, w: Math.max(bx.w + 20, 360), h: bx.h + 20 }; };
      const def = (extra) => defOf(f, extra);
      const tr = r.trace;
      let primeLines = [];
      for (let i = 0; i < tr.length; i++) {
        const s = tr[i];
        if (s.kind === 'qm-start') {
          cols[0].forEach((g) => g.rows.forEach((rw) => st.shown.add(id(0, rw.str))));
          F.add({ items: scene({ flat0: true }).items, say: s.say + ' Each row holds the number and its bits, ' + f.vars.join('') + ' from left to right.', narrowView: narrow([0]), def: def() });
        } else if (s.kind === 'qm-group') {
          st.bands.add(s.column);
          F.add({ items: scene().items, say: s.say + (s.column === 0 ? ' Only rows in neighbouring groups can differ in exactly one bit, so only those pairs are compared.' : ''), narrowView: narrow([Math.max(0, s.column - 1), s.column]), meta: { group: s.column } });
        } else if (s.kind === 'qm-merge' || s.kind === 'qm-duplicate') {
          const a = id(s.column, s.a), b = id(s.column, s.b), res = id(s.column + 1, s.result);
          st.checked.add(a); st.checked.add(b);
          const fresh = !st.shown.has(res);
          st.shown.add(res);
          if (s.kind === 'qm-merge') F.count('merges');
          const t = K.qm.tab({ columns: cols, n, shown: new Set() });
          F.add({ items: scene({ src: new Set([a, b]), hot: new Set([res]), enterFrom: fresh ? new Map([[res, [t.rowKey(s.column, s.a), t.rowKey(s.column, s.b)]]]) : null, links: [[a, res], [b, res]] }).items,
            say: s.say, narrowView: narrow([s.column, s.column + 1]), meta: { merge: s, dup: s.kind === 'qm-duplicate' } });
        } else if (s.kind === 'qm-column') {
          const un = s.unchecked.map((x) => id(s.column, x));
          un.forEach((k) => st.prime.set(k, label.get(k.slice(k.indexOf(':') + 1))));
          F.count('primes', un.length);
          F.add({ items: scene({ hot: new Set(un) }).items, say: s.say + (un.length ? ' They get labels: ' + s.unchecked.map((x) => label.get(x) + ' = ' + x).join(', ') + '.' : ''), narrowView: narrow([s.column, s.column + 1]), meta: { colDone: s.column } });
        } else if (s.kind === 'qm-primes') {
          primeLines = s.primes.map((p) => p.label + ' = ' + p.str + ' = ' + p.text + '   covers ' + p.minterms.join(', '));
          const chips = s.primes.map((p) => ({ id: p.label, text: p.label + ' = ' + p.text, sub: p.str, cls: p.dcOnly ? 'dconly' : 'good' }));
          F.add({ items: scene({ chips, hot: new Set([...st.prime.keys()]) }).items, say: s.say, def: def(['', 'Prime implicants:'].concat(primeLines)), hl: { fn: primeLines.map((_, k) => String(k + 3)) }, meta: { primes: s.primes.length }, mark: 'primes' });
        } else if (s.kind === 'qm-dc-only') {
          for (const [k, l] of st.prime) if (s.primes.includes(l)) st.dim.add(k);
          const chips = r.primes.map((p) => ({ id: p.label, text: p.label + ' = ' + p.text, sub: p.str, cls: p.dcOnly ? 'gone' : 'good' }));
          F.add({ items: scene({ chips }).items, say: s.say + ' A prime is only worth a gate if it covers a ' + (pos ? '0' : '1') + ' that must be covered.', def: def(['', 'Prime implicants:'].concat(primeLines)) });
        }
      }
      const useful = r.primes.filter((p) => !p.dcOnly);
      const last = F.last();
      F.add({ items: last.items, say: 'The tabulation is finished: ' + useful.length + ' useful prime implicant' + (useful.length === 1 ? '' : 's') + ' (' + useful.map((p) => p.text).join(', ') + '). Every minimal ' + (pos ? 'POS' : 'SOP') + ' is built from these; the prime implicant chart decides which ones to take.', def: last.def, mark: 'done' });
      return { frames: F.list, def: def(['', 'Prime implicants:'].concat(r.primes.map((p) => p.label + ' = ' + p.str + ' = ' + p.text + '   covers ' + p.minterms.join(', ')))) };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.merge && !fr[i + 1].meta.dup && !(fr[i].meta && fr[i].meta.merge), pick: 'option',
        ask: (fr, i) => { const m = fr[i + 1].meta.merge; return 'Next, ' + m.a + ' and ' + m.b + ' are compared. What do they merge into?'; },
        options: (fr, i) => { const m = fr[i + 1].meta.merge; const o = [m.result].concat(otherCubes(m.result, m.result.length)).slice(0, 4); return o.sort(); },
        answer: (fr, i) => fr[i + 1].meta.merge.result, explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.primes !== undefined, pick: 'option', once: true, ask: 'How many prime implicants does the tabulation find in all?',
        options: (fr, i) => { const k = fr[i + 1].meta.primes; return [...new Set([Math.max(1, k - 2), Math.max(1, k - 1), k, k + 1, k + 2])].map(String); }, answer: (fr, i) => String(fr[i + 1].meta.primes), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'Why are only rows in neighbouring groups compared?', options: ['To save paper', 'Two terms that differ in exactly one bit have counts of 1s that differ by exactly one', 'Rows in the same group always merge', 'The groups are in Gray order'], answer: 1, why: 'Changing one bit changes the number of 1s by one, so a mergeable pair always sits in groups k and k + 1.' },
      { q: '0110 and 0100 merge into…', options: ['01-0', '0-10', '-110', '01--'], answer: 0, why: 'They differ only in the third bit, which becomes a dash: 01-0.' },
      { q: 'Can 0-10 and 01-0 merge?', options: ['Yes, into 0--0', 'No: their dashes are in different places', 'Yes, into 0-1-', 'Only if they are don\'t-cares'], answer: 1, why: 'Two terms merge only when their dashes line up and exactly one other bit differs.' },
      { q: 'A row with no check mark at the end of its column is…', options: ['an error', 'a prime implicant', 'an essential prime implicant', 'a don\'t-care'], answer: 1, why: 'It merged with nothing, so it cannot be made bigger: it is prime. Whether it is essential is decided later, in the chart.' },
      { q: 'Why may don\'t-cares be listed in the tabulation?', options: ['They must be covered', 'They can make bigger groups, which means fewer literals', 'They change the function', 'They are never listed'], answer: 1, why: 'A don\'t-care can join a merge, giving a larger cube, but it never has to be covered by itself.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The prime implicant chart
  // ---------------------------------------------------------------------------------------------------
  const chartRun = (inp, opts) => {
    opts = opts || {};
    const f = fnOf(inp), form = inp.form || 'sop', pos = form === 'pos';
    const r = B.minimise(f, { form });
    const tr = r.trace;
    const ci = tr.findIndex((t) => t.kind === 'chart');
    const ch = tr[ci];
    const primes = r.primes.filter((p) => ch.rows.includes(p.label));
    const rows = primes.map((p) => ({ label: p.label, text: p.text, minterms: p.minterms.filter((m) => ch.cols.includes(m)), lits: p.lits }));
    const cols = ch.cols;
    const st = { gone: { rows: new Set(), cols: new Set() }, chosen: new Set(), order: [] };
    const chart = (o) => K.qm.chart(Object.assign({ rows, cols, gone: st.gone, chosen: st.chosen }, o || {}));
    const base = chart();
    const coverY = base.box.y + base.box.h + 30;
    const coverChips = () => {
      if (!st.order.length) return [];
      const list = st.order.map((l) => { const p = primes.find((x) => x.label === l); return { id: l, text: p.text, sub: l, cls: 'good', enter: { enter: 'from', src: 'pc:row:' + l } }; });
      const out = K.qm.chips(list, { x: base.box.x + 92, y: coverY, prefix: 'cv', maxW: Math.max(420, base.box.w - 90), size: 15 }).items;
      out.push({ key: 'cv:label', kind: 'text', x: base.box.x, y: coverY + 22, text: 'F = ' + (pos ? 'Π' : 'Σ') + ' of', cls: 'strong', size: 15 });
      return out;
    };
    const F = new S.Frames([{ id: 'terms', label: 'primes taken' }]);
    const draw = (o, extra) => chart(o).items.concat(coverChips(), extra || []);
    const def = { sections: [{ id: 'fn', kind: 'math', title: 'The function', text: ['F = ' + B.sigma(f), 'Prime implicants:'].concat(primes.map((p) => p.label + ' = ' + p.text + '  (' + p.minterms.join(', ') + ')')).join('\n') }] };
    const lit = (labels) => ({ fn: labels.map((l) => String(2 + primes.findIndex((p) => p.label === l))) });
    for (let i = ci; i < tr.length; i++) {
      const s = tr[i];
      if (s.kind === 'chart') F.add({ items: draw(), say: s.say + ' ' + rows.length + ' rows, ' + cols.length + ' columns.', meta: { chart: true } });
      else if (s.kind === 'essential' || s.kind === 'secondary-essential') {
        st.chosen.add(s.prime); st.order.push(s.prime); F.count('terms');
        F.add({ items: draw({ hotCols: new Set([s.because]), hotCells: new Set([s.prime + ':' + s.because]), hotRows: new Set([s.prime]) }), say: s.say, hl: lit([s.prime]), meta: { took: s.prime } });
        s.removes.forEach((m) => st.gone.cols.add(m));
        st.gone.rows.add(s.prime);
        st.chosen.add(s.prime);
      } else if (s.kind === 'row-empty') {
        s.rows.forEach((l) => st.gone.rows.add(l));
        F.add({ items: draw({ hotRows: new Set(s.rows) }), say: s.say });
      } else if (s.kind === 'row-dominance') {
        const c = chart();
        const ya = c.rowY(s.by), yb = c.rowY(s.removed);
        const arrow = { key: 'dom:' + s.removed, kind: 'edge', from: { x: base.box.x - 4, y: ya }, to: { x: base.box.x - 4, y: yb }, bend: (ya < yb ? -1 : 1) * Math.min(60, 20 + Math.abs(yb - ya) / 3), cls: 'hot', audit: 'ignore', layer: 'top' };
        F.add({ items: draw({ hotRows: new Set([s.by, s.removed]) }, [arrow]), say: s.say, hl: lit([s.by, s.removed]), meta: { rowdom: s } });
        st.gone.rows.add(s.removed);
      } else if (s.kind === 'col-dominance') {
        const c = chart();
        const xa = c.colX(s.by), xb = c.colX(s.removed), y = base.box.y + 2;
        const arrow = { key: 'cdom:' + s.removed, kind: 'edge', from: { x: xa, y }, to: { x: xb, y }, bend: (xa < xb ? -1 : 1) * Math.min(50, 16 + Math.abs(xb - xa) / 4), cls: 'alt', audit: 'ignore', layer: 'top' };
        F.add({ items: draw({ hotCols: new Set([s.by]) }, [arrow]), say: s.say, meta: { coldom: s } });
        st.gone.cols.add(s.removed);
      } else if (s.kind === 'cyclic') {
        F.add({ items: draw({ hotRows: new Set(s.rows) }), say: s.say, meta: { cyclic: s } });
      } else if (s.kind === 'petrick-start') {
        F.add({ items: draw({ hotRows: new Set(tr.find((t) => t.kind === 'cyclic').rows) }), say: s.say + ' (Its own topic works this out step by step.)' });
      } else if (s.kind === 'petrick-choose' || s.kind === 'search') {
        for (const l of s.chosen) { st.chosen.add(l); st.order.push(l); F.count('terms'); }
        const take = primes.filter((p) => s.chosen.includes(p.label));
        take.forEach((p) => p.minterms.forEach((m) => st.gone.cols.add(m)));
        s.chosen.forEach((l) => st.gone.rows.add(l));
        F.add({ items: draw({ hotRows: new Set(s.chosen) }), say: s.say, hl: lit(s.chosen) });
      } else if (s.kind === 'result') {
        for (const p of primes) if (!st.chosen.has(p.label)) st.gone.rows.add(p.label);
        F.add({ items: draw(), say: s.say + ' Every column is covered by a chosen row.', mark: 'cover' });
      }
    }
    return { frames: F.list, def };
  };
  const ess = (fr, i) => fr.slice(i + 1).filter((f) => f.meta && f.meta.took && !/secondary|Now/.test(f.say)).map((f) => 'pc:col:' + /^(?:Minterm|Maxterm) (\d+)/.exec(f.say)[1]);
  S.topic({
    id: 'qm-chart', family: 'p3-qm', order: 20, title: 'The prime implicant chart',
    blurb: 'Rows are prime implicants, columns are the minterms to cover. A column with a single × makes its row essential; dominated rows and columns are struck out until the cover is decided.',
    inputs: [{ id: 'fn', kind: 'text', label: 'Function', def: 'Σm(2, 3, 4, 5, 7, 8, 10, 11)', check: listCheck(14) }, nInput, formInput],
    check: (inp) => { const f = fnOf(inp); const r = B.minimise(f, { form: inp.form }); const t = r.trace.find((x) => x.kind === 'chart'); if (!t) return 'There is nothing to choose: ' + r.text; if (t.rows.length > 9 || t.cols.length > 12) return 'The chart would have ' + t.rows.length + ' rows and ' + t.cols.length + ' columns; pick a function with at most 9 primes and 12 minterms'; return null; },
    presets: [
      { label: 'Dominance, then a secondary essential', values: { fn: 'Σm(2, 3, 4, 5, 7, 8, 10, 11)', n: '4', form: 'sop' } },
      { label: 'Essentials do it all', values: { fn: 'Σm(0, 2, 3, 7, 8, 10, 11, 13, 15)', n: '4', form: 'sop' } },
      { label: 'Column dominance, with don\'t-cares', values: { fn: 'Σm(5, 6, 7, 9, 10, 12) + d(8, 13, 14)', n: '4', form: 'sop' } },
      { label: 'A row that covers nothing left', values: { fn: 'Σm(0, 1, 7, 10, 11, 14, 15) + d(5, 6)', n: '4', form: 'sop' } },
      { label: 'Cyclic: no essential at all', values: { fn: 'Σm(0, 1, 2, 5, 6, 7)', n: '3', form: 'sop' } },
      { label: 'POS: a chart of maxterms', values: { fn: 'Σm(0, 1, 3, 7, 8, 9, 15)', n: '4', form: 'pos' } },
    ],
    counters: [{ id: 'terms', label: 'primes taken' }],
    run: (inp) => chartRun(inp),
    predict: [
      { at: (f, i, fr) => f.meta && f.meta.chart && ess(fr, i).length, pick: 'item', ask: 'Click the column of a minterm that only one prime covers.', answer: ess, explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => f.meta && f.meta.chart && !ess(fr, i).length, pick: 'option', ask: 'Does any column have a single ×?', options: ['Yes', 'No'], answer: 'No', explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.rowdom && !(f.meta && f.meta.rowdom), pick: 'item', once: true, ask: 'One remaining row covers nothing another row does not already cover. Click the row that will be removed.', answer: (fr, i) => 'pc:row:' + fr[i + 1].meta.rowdom.removed, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A column has exactly one ×. The row with that × is…', options: ['dominated', 'essential', 'redundant', 'cyclic'], answer: 1, why: 'No other prime covers that minterm, so every cover must include this row.' },
      { q: 'Row P covers {3, 7} of the remaining columns and row Q covers {3, 7, 11}, with equal cost. Then…', options: ['P dominates Q', 'Q dominates P, so P can be removed', 'both are essential', 'the chart is cyclic'], answer: 1, why: 'Q does everything P does and more, at no extra cost, so P is never needed.' },
      { q: 'Every row covering column 4 also covers column 9. Which column can be removed?', options: ['4', '9', 'both', 'neither'], answer: 1, why: 'Covering 4 forces a row that also covers 9, so column 9 takes care of itself.' },
      { q: 'What makes a chart cyclic?', options: ['It has a loop of wires', 'No row is essential and nothing dominates, yet columns remain', 'All rows are essential', 'It has don\'t-cares'], answer: 1, why: 'Then a choice has to be made: Petrick\'s method, or a search, finds the cheapest.' },
      { q: 'Why are don\'t-cares not columns of the chart?', options: ['They need not be covered', 'They are covered twice', 'They have no binary form', 'They are always essential'], answer: 0, why: 'A don\'t-care may help form a prime, but nothing requires it to be covered.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Petrick's method
  // ---------------------------------------------------------------------------------------------------
  const lblNum = (l) => +l.slice(1);
  const pText = (p) => p.join('');
  S.topic({
    id: 'qm-petrick', family: 'p3-qm', order: 30, title: 'Petrick\'s method',
    blurb: 'When the chart is cyclic, write what a cover needs as a product of sums, one sum per column. Multiply it out, letting X + XY = X absorb products as you go: each product left is a complete cover, and the cheapest wins.',
    inputs: [{ id: 'fn', kind: 'text', label: 'Function', def: 'Σm(0, 1, 2, 5, 6, 7)', check: listCheck(14) }, Object.assign({}, nInput, { def: '3' })],
    check: (inp) => { const r = B.minimise(fnOf(inp)); const p = r.trace.find((t) => t.kind === 'petrick-start'); if (!p) return 'This function has no cyclic core (the chart is decided without a choice); try a preset'; if (p.sums.length > 10) return 'The core has ' + p.sums.length + ' columns; pick a smaller one (at most 10)'; return null; },
    presets: [
      { label: 'The six-cycle of three variables', values: { fn: 'Σm(0, 1, 2, 5, 6, 7)', n: '3' } },
      { label: 'Four variables, after dominance', values: { fn: 'Σm(1, 2, 3, 4, 6, 8, 10, 12)', n: '4' } },
      { label: 'A core of five columns', values: { fn: 'Σm(0, 1, 2, 3, 6, 8, 9, 11, 12, 15)', n: '4' } },
      { label: 'Equal-cost ties', values: { fn: 'Σm(0, 2, 4, 5, 6, 10) + d(1, 7, 13)', n: '4' } },
    ],
    counters: [{ id: 'products', label: 'products' }, { id: 'absorbed', label: 'absorbed' }],
    run(inp) {
      const f = fnOf(inp), r = B.minimise(f), tr = r.trace;
      const cyc = tr.find((t) => t.kind === 'cyclic'), ps = tr.find((t) => t.kind === 'petrick-start');
      const byL = new Map(r.primes.map((p) => [p.label, p]));
      const rows = cyc.rows.map((l, i) => ({ label: l, text: byL.get(l).text, minterms: cyc.marks[i] }));
      const ch = K.qm.chart({ rows, cols: cyc.cols, prefix: 'pc' });
      const sx = ch.box.x + ch.box.w + 60, sy = ch.box.y;
      const sums = ps.sums.map((s) => s.slice().sort((a, b) => lblNum(a) - lblNum(b)));
      const sumChips = (hot, done) => K.qm.chips(sums.map((s, k) => ({ id: 's' + k, text: '(' + s.join(' + ') + ')', cls: k === hot ? 'hot' : done && k < done ? 'read' : '' })), { x: sx, y: sy + 30, maxW: 470, prefix: 'sum', size: 15, gap: 6 });
      const sumBox = sumChips(-1, 0).box;
      const py = sumBox.y + sumBox.h + 56;
      const cost = (p) => ({ terms: p.length, lits: p.reduce((s, l) => s + byL.get(l).lits, 0) });
      const prodChips = (list, o) => {
        o = o || {};
        const show = list.slice(0, 18);
        const cs = show.map((p) => ({ id: pText(p), text: pText(p), cls: (o.bad && o.bad.has(pText(p)) ? 'gone' : o.good && o.good.has(pText(p)) ? 'good' : '') + (o.pick ? ' pickable' : ''), sub: o.cost ? cost(p).terms + ' terms, ' + cost(p).lits + ' lits' : undefined }));
        if (list.length > show.length) cs.push({ id: 'more', text: '+ ' + (list.length - show.length) + ' more', cls: 'read' });
        return K.qm.chips(cs, { x: sx, y: py + 30, maxW: 470, prefix: 'prod', size: 15, gap: 10, minW: 56 }).items;
      };
      const head = (t, y, k) => ({ key: k, kind: 'text', x: sx, y, text: t, cls: 'title' });
      const F = new S.Frames(['products', 'absorbed']);
      const base = (o) => K.qm.chart(Object.assign({ rows, cols: cyc.cols, prefix: 'pc' }, o || {})).items.concat([head('What a cover needs', sy + 14, 'h:s')]);
      const def = { sections: [{ id: 'p', kind: 'math', title: 'The cyclic core', text: rows.map((rw) => rw.label + ' = ' + rw.text + ' covers ' + rw.minterms.join(', ')).join('\n') }] };
      F.add({ items: K.qm.chart({ rows, cols: cyc.cols, prefix: 'pc' }).items, say: cyc.say, def });
      F.add({ items: base().concat(sumChips(-1, 0).items), say: ps.say + ' Read each sum as "this prime or that one".' });
      // multiply out, keeping what absorption leaves
      let prods = sums[0].map((l) => [l]);
      F.set('products', prods.length);
      F.add({ items: base({ hotCols: new Set([cyc.cols[0]]) }).concat(sumChips(0, 0).items, prodChips(prods), [head('P so far', py + 14, 'h:p')]), say: 'Start with the first sum: P = ' + prods.map(pText).join(' + ') + '.', meta: { prods: prods.length } });
      for (let k = 1; k < sums.length; k++) {
        const next = new Map();
        for (const p of prods) for (const l of sums[k]) { const q = p.includes(l) ? p : p.concat(l).sort((a, b) => lblNum(a) - lblNum(b)); next.set(pText(q), q); }
        const list = [...next.values()].sort((a, b) => a.length - b.length || (pText(a) < pText(b) ? -1 : 1));
        const kept = [], gone = new Set();
        for (const q of list) { if (kept.some((x) => x.every((y) => q.includes(y)))) gone.add(pText(q)); else kept.push(q); }
        F.count('absorbed', gone.size);
        F.set('products', kept.length);
        const trs = tr.find((t) => t.kind === 'petrick-multiply' && t.step === k);
        F.add({ items: base({ hotCols: new Set([cyc.cols[k]]) }).concat(sumChips(k, k).items, prodChips(kept.concat(list.filter((q) => gone.has(pText(q)))), { bad: gone }), [head('P so far', py + 14, 'h:p')]),
          say: (trs ? trs.say : 'Multiply in (' + sums[k].join(' + ') + ').') + (gone.size ? ' Crossed out: ' + [...gone].slice(0, 6).join(', ') + (gone.size > 6 ? ', …' : '') + ' — each contains a smaller product.' : ''), meta: { prods: kept.length } });
        prods = kept;
      }
      const choose = tr.find((t) => t.kind === 'petrick-choose');
      const best = cost(choose.chosen);
      const ties = new Set(prods.filter((p) => { const c = cost(p); return c.terms === best.terms && c.lits === best.lits; }).map(pText));
      F.add({ items: base().concat(sumChips(-1, sums.length).items, prodChips(prods, { cost: true }), [head('Each product is a complete cover', py + 14, 'h:p')]), say: 'Every column\'s sum is multiplied in: ' + prods.length + ' product' + (prods.length === 1 ? '' : 's') + ' remain, and each one is a set of primes that covers the core. Now compare their costs.', meta: { ties: [...ties] } });
      F.add({ items: base({ chosen: new Set(choose.chosen) }).concat(sumChips(-1, sums.length).items, prodChips(prods, { cost: true, good: new Set([pText(choose.chosen)]) }), [head('Each product is a complete cover', py + 14, 'h:p')]), say: choose.say + ' ' + r.trace[r.trace.length - 1].say, mark: 'choice' });
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => f.meta && f.meta.ties, pick: 'item', ask: 'Click the cheapest product (fewest terms, then fewest literals).', answer: (fr, i) => fr[i].meta.ties.map((t) => 'prod:' + t), explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => i === 1, pick: 'option', ask: 'How many terms will the first sum start P with?', options: ['1', '2', '3', '4', '5'], answer: (fr) => String(fr[2].meta.prods), explain: (fr) => fr[2].say },
    ],
    quiz: [
      { q: 'In Petrick\'s method, each sum (P1 + P3) stands for…', options: ['a minterm that P1 or P3 must cover', 'a gate', 'a prime that must be dropped', 'a don\'t-care'], answer: 0, why: 'There is one sum per column: at least one of the primes covering that minterm must be chosen.' },
      { q: 'P1 + P1P3 simplifies to…', options: ['P1P3', 'P1', 'P3', '1'], answer: 1, why: 'Absorption, X + XY = X: any cover containing P1 and P3 is no better than P1 alone.' },
      { q: '(P1 + P2)(P1 + P3) multiplies out to…', options: ['P1 + P2P3', 'P1P2P3', 'P1 + P2 + P3', 'P2P3'], answer: 0, why: 'P1 + P1P3 + P1P2 + P2P3, and absorption leaves P1 + P2P3.' },
      { q: 'Two products both have 3 terms; one has 6 literals, the other 7. Which cover is chosen?', options: ['The one with 7', 'The one with 6', 'Either; terms are all that count', 'Neither'], answer: 1, why: 'Ties in the number of terms are broken by the number of literals (fewer gate inputs).' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
