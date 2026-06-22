// Quine–McCluskey: the tabulation (groups by number of 1s, merging columns with check marks), the prime
// implicant chart (essentials, row and column dominance, cyclic cores), Petrick's method, an exact
// branch-and-bound cover, the minimise() entry point for SOP and POS, and multiple-output minimisation with
// shared terms. Every step goes into the trace.
// A cover is minimal when it has the fewest terms, and among those the fewest literals.
(function (S) {
  'use strict';
  const B = S.Bool = S.Bool || {};
  const sorted = (s) => [...s].sort((a, b) => a - b);
  const pop = (m) => B.popcount(m);
  const mlist = (ms, pos) => ms.map((m) => (pos ? 'M' : 'm') + m).join(', ');

  /** a term record for a cube in the given form */
  function term(c, vs, form, label) {
    const expr = form === 'pos' ? B.cubeSum(c, vs) : B.cubeProduct(c, vs);
    return { cube: c, str: B.cubeStr(c), expr, text: B.toString(expr), minterms: B.cubeMinterms(c), lits: B.cubeLits(c), label: label || null };
  }
  B.term = term;
  /** the target (1s for SOP, 0s for POS) and the don't-cares */
  function target(fn, form) { return { on: form === 'pos' ? B.zeros(fn) : B.minterms(fn), dc: B.dontCares(fn) }; }
  B._target = target;
  /** cost of a two-level cover: terms, literals, gate inputs (a one-literal term needs no gate) */
  function coverCost(cover) {
    const lits = cover.reduce((s, t) => s + t.lits, 0);
    const gi = cover.reduce((s, t) => s + (t.lits > 1 ? t.lits : 0), 0) + (cover.length > 1 ? cover.length : 0);
    return { terms: cover.length, literals: lits, gateInputs: gi };
  }
  B.coverCost = coverCost;
  const better = (a, b) => a.terms < b.terms || (a.terms === b.terms && a.literals < b.literals);
  B.betterCost = better;

  // ---- exact cover ---------------------------------------------------------------------------------------------
  /**
   * The cheapest set of rows covering every column (fewest rows, then fewest literals), by branch and bound.
   * cols: column ids; rows: [{cover: iterable of column ids, lits}]. -> {chosen:[row index], cost, nodes, complete}
   */
  function exactCover(cols, rows, limit) {
    limit = limit || 3e6;
    const ci = new Map(cols.map((c, i) => [c, i]));
    const rc = rows.map((r) => [...r.cover].filter((c) => ci.has(c)).map((c) => ci.get(c)));
    const byCol = cols.map(() => []);
    rc.forEach((cs, r) => cs.forEach((c) => byCol[c].push(r)));
    for (const l of byCol) l.sort((a, b) => rc[b].length - rc[a].length || rows[a].lits - rows[b].lits);
    const maxCover = Math.max(1, ...rc.map((x) => x.length));
    const count = new Array(cols.length).fill(0);
    let uncovered = cols.length, nodes = 0, complete = true;
    let best = null, bestT = Infinity, bestL = Infinity;
    const chosen = [];
    let lits = 0;
    if (byCol.some((l) => !l.length)) return { chosen: null, cost: null, nodes: 0, complete: true };
    (function go() {
      if (++nodes > limit) { complete = false; return; }
      if (!uncovered) {
        if (chosen.length < bestT || (chosen.length === bestT && lits < bestL)) { best = chosen.slice(); bestT = chosen.length; bestL = lits; }
        return;
      }
      const lb = chosen.length + Math.ceil(uncovered / maxCover);
      if (lb > bestT) return;
      let pick = -1, few = Infinity;
      for (let c = 0; c < cols.length; c++) if (!count[c] && byCol[c].length < few) { few = byCol[c].length; pick = c; }
      for (const r of byCol[pick]) {
        if (chosen.length + 1 === bestT && lits + rows[r].lits >= bestL && uncovered > rc[r].length) continue;
        chosen.push(r); lits += rows[r].lits;
        for (const c of rc[r]) if (!count[c]++) uncovered--;
        go();
        for (const c of rc[r]) if (!--count[c]) uncovered++;
        chosen.pop(); lits -= rows[r].lits;
        if (!complete) return;
      }
    })();
    return { chosen: best, cost: best ? { terms: bestT, literals: bestL } : null, nodes, complete };
  }
  B.exactCover = exactCover;

  // ---- the tabulation ---------------------------------------------------------------------------------------------
  /**
   * prime implicants by tabulation, traced. -> {primes:[term + {dcOnly}], columns, trace}
   * columns[k] is the k-th table: groups by number of 1s, each row {str, minterms, checked}.
   */
  function tabulate(fn, form, trace) {
    const vs = fn.vars, n = vs.length, pos = form === 'pos';
    const { on, dc } = target(fn, form);
    const dcs = new Set(dc), what = pos ? 'maxterm' : 'minterm';
    trace.push({ kind: 'qm-start', on, dc, say: 'List the ' + what + 's ' + (on.length ? on.join(', ') : '(none)') + (dc.length ? ' and the don\'t-cares ' + dc.join(', ') : '') + ' in binary.' });
    let col = [...on, ...dc].sort((a, b) => a - b).map((m) => ({ cube: B.minCube(m, n), minterms: [m], checked: false }));
    const columns = [];
    const groupUp = (rows) => {
      const g = new Map();
      for (const r of rows) { const k = pop(r.cube.bits); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
      return [...g].sort((a, b) => a[0] - b[0]).map(([ones, rs]) => ({ ones, rows: rs }));
    };
    const snap = (groups) => groups.map((g) => ({ ones: g.ones, rows: g.rows.map((r) => ({ str: B.cubeStr(r.cube), minterms: r.minterms.slice(), checked: r.checked, dc: r.minterms.every((m) => dcs.has(m)) })) }));
    let groups = groupUp(col);
    if (col.length) trace.push({ kind: 'qm-group', column: 0, groups: snap(groups), say: 'Group them by their number of 1s: ' + groups.map((g) => g.rows.length + ' with ' + g.ones + ' one' + (g.ones === 1 ? '' : 's')).join(', ') + '.' });
    const all = [];
    for (let c = 0; groups.length; c++) {
      const next = new Map();
      for (let gi = 0; gi + 1 < groups.length; gi++) {
        if (groups[gi + 1].ones !== groups[gi].ones + 1) continue;
        for (const a of groups[gi].rows) for (const b of groups[gi + 1].rows) {
          if (a.cube.mask !== b.cube.mask) continue;
          const diff = a.cube.bits ^ b.cube.bits;
          if (pop(diff) !== 1) continue;
          const nc = B.cube(n, a.cube.mask & ~diff, a.cube.bits & ~diff);
          const k = B.cubeKey(nc), v = vs[n - 1 - Math.log2(diff)];
          a.checked = true; b.checked = true;
          const ms = sorted(new Set(a.minterms.concat(b.minterms)));
          if (next.has(k)) {
            trace.push({ kind: 'qm-duplicate', column: c, a: B.cubeStr(a.cube), b: B.cubeStr(b.cube), result: B.cubeStr(nc), say: B.cubeStr(a.cube) + ' and ' + B.cubeStr(b.cube) + ' give ' + B.cubeStr(nc) + ' again; it is already in the next column, so it is not written twice.' });
            continue;
          }
          next.set(k, { cube: nc, minterms: ms, checked: false });
          trace.push({ kind: 'qm-merge', column: c, a: B.cubeStr(a.cube), b: B.cubeStr(b.cube), am: a.minterms.slice(), bm: b.minterms.slice(), result: B.cubeStr(nc), minterms: ms, var: v,
            say: B.cubeStr(a.cube) + ' (' + a.minterms.join(',') + ') and ' + B.cubeStr(b.cube) + ' (' + b.minterms.join(',') + ') differ only in ' + v + ': they merge into ' + B.cubeStr(nc) + ' and both get a check mark.' });
        }
      }
      columns.push(snap(groups));
      const unchecked = groups.flatMap((g) => g.rows).filter((r) => !r.checked);
      for (const r of unchecked) all.push(r);
      trace.push({ kind: 'qm-column', column: c, groups: snap(groups), unchecked: unchecked.map((r) => B.cubeStr(r.cube)),
        say: 'Column ' + (c + 1) + ' is done' + (unchecked.length ? '; the rows left without a check mark are prime implicants: ' + unchecked.map((r) => B.cubeStr(r.cube)).join(', ') + '.' : '; every row merged with another.') });
      groups = groupUp([...next.values()]);
      if (groups.length) trace.push({ kind: 'qm-group', column: c + 1, groups: snap(groups), say: 'Column ' + (c + 2) + ' holds the ' + next.size + ' merged term' + (next.size === 1 ? '' : 's') + ', grouped again by number of 1s.' });
    }
    const primes = all.map((r) => Object.assign(term(r.cube, vs, form), { dcOnly: r.minterms.every((m) => dcs.has(m)) }));
    primes.sort((a, b) => a.lits - b.lits || b.cube.mask - a.cube.mask || a.cube.bits - b.cube.bits);
    primes.forEach((p, i) => { p.label = 'P' + (i + 1); });
    trace.push({ kind: 'qm-primes', primes: primes.map((p) => ({ label: p.label, str: p.str, text: p.text, minterms: p.minterms, dcOnly: p.dcOnly })),
      say: 'The prime implicants: ' + (primes.length ? primes.map((p) => p.label + ' = ' + p.str + ' (' + p.text + ')').join(', ') : 'none') + '.' });
    const useless = primes.filter((p) => p.dcOnly);
    if (useless.length) trace.push({ kind: 'qm-dc-only', primes: useless.map((p) => p.label), say: useless.map((p) => p.label).join(', ') + (useless.length > 1 ? ' cover' : ' covers') + ' only don\'t-cares, so ' + (useless.length > 1 ? 'they are' : 'it is') + ' left out of the chart.' });
    return { primes, columns };
  }
  B.tabulate = (fn, form) => { const trace = []; const r = tabulate(B.asFn(fn), form || 'sop', trace); r.trace = trace; return r; };

  // ---- the chart ---------------------------------------------------------------------------------------------------
  /**
   * Reduce the prime implicant chart: essentials, then row and column dominance, repeated; a cyclic core goes to
   * Petrick's method (or branch and bound when the expansion grows too big). -> {cover:[prime], essentials, trace}
   */
  function chart(on, primes, form, trace, words) {
    words = words || {};
    const pos = form === 'pos', what = words.cell || (pos ? 'maxterm' : 'minterm'), row = words.row || 'row';
    const name = (p) => p.label + ' (' + p.text + ')';
    let rows = primes.filter((p) => !p.dcOnly && p.minterms.some((m) => on.includes(m)));
    let cols = on.slice();
    const covers = (p, m) => B.covers(p.cube, m);
    trace.push({ kind: 'chart', rows: rows.map((p) => p.label), cols: cols.slice(), marks: rows.map((p) => cols.filter((m) => covers(p, m))),
      say: 'The chart has a ' + row + ' for each prime implicant and a column for each ' + what + '; an X marks a ' + what + ' the prime covers.' });
    const chosen = [], essentials = [];
    let round = 0;
    while (cols.length) {
      round++;
      let changed = false;
      // essential (or, after the first round, secondary essential) rows
      for (const m of cols.slice()) {
        if (!cols.includes(m)) continue;
        const rs = rows.filter((p) => covers(p, m));
        if (rs.length === 1) {
          const p = rs[0];
          const took = cols.filter((c) => covers(p, c));
          chosen.push(p); if (round === 1) essentials.push(p);
          trace.push({ kind: round === 1 ? 'essential' : 'secondary-essential', prime: p.label, because: m, removes: took,
            say: (round === 1 ? what.charAt(0).toUpperCase() + what.slice(1) : 'Now ' + what) + ' ' + m + ' is covered only by ' + name(p) + ', so ' + p.label + ' is ' + (round === 1 ? 'essential' : 'needed (secondary essential)') + '; it also covers ' + took.join(', ') + ', so those columns go.' });
          cols = cols.filter((c) => !covers(p, c));
          rows = rows.filter((q) => q !== p);
          changed = true;
        }
      }
      if (!cols.length) break;
      // rows that cover nothing left
      const empty = rows.filter((p) => !cols.some((m) => covers(p, m)));
      if (empty.length) { trace.push({ kind: 'row-empty', rows: empty.map((p) => p.label), say: empty.map((p) => p.label).join(', ') + ' cover' + (empty.length === 1 ? 's' : '') + ' nothing that is left; remove ' + (empty.length === 1 ? 'it' : 'them') + '.' }); rows = rows.filter((p) => !empty.includes(p)); changed = true; }
      // row dominance: drop i when some j covers all its columns at no greater cost
      for (const p of rows.slice()) {
        if (!rows.includes(p)) continue;
        const pc = cols.filter((m) => covers(p, m));
        const q = rows.find((r) => r !== p && r.lits <= p.lits && pc.every((m) => covers(r, m)) && (cols.filter((m) => covers(r, m)).length > pc.length || r.lits < p.lits || rows.indexOf(r) < rows.indexOf(p)));
        if (q) {
          trace.push({ kind: 'row-dominance', removed: p.label, by: q.label, say: q.label + ' covers every remaining column of ' + p.label + ' (' + pc.join(', ') + ') with no more literals, so ' + p.label + ' is dominated: remove its ' + row + '.' });
          rows = rows.filter((r) => r !== p); changed = true;
        }
      }
      // column dominance: drop column a when every row covering column b also covers a
      for (const a of cols.slice()) {
        if (!cols.includes(a)) continue;
        const ra = rows.filter((p) => covers(p, a));
        const b = cols.find((c) => c !== a && cols.includes(c) && rows.filter((p) => covers(p, c)).every((p) => ra.includes(p)) && (rows.filter((p) => covers(p, c)).length < ra.length || c < a));
        if (b != null) {
          trace.push({ kind: 'col-dominance', removed: a, by: b, say: 'Every prime covering ' + what + ' ' + b + ' also covers ' + a + ', so covering ' + b + ' covers ' + a + ' too: remove column ' + a + '.' });
          cols = cols.filter((c) => c !== a); changed = true;
        }
      }
      if (!changed) break;
    }
    if (cols.length) {
      trace.push({ kind: 'cyclic', rows: rows.map((p) => p.label), cols: cols.slice(), marks: rows.map((p) => cols.filter((m) => covers(p, m))),
        say: 'No ' + row + ' is essential and nothing dominates: the chart is cyclic, with ' + rows.length + ' ' + row + 's and ' + cols.length + ' columns left. A choice is needed.' });
      const pick = rows.length <= 16 ? petrick(cols, rows, trace, what) : null;
      const sel = pick || (() => {
        const r = exactCover(cols, rows.map((p) => ({ cover: p.minterms, lits: p.lits })));
        trace.push({ kind: 'search', chosen: r.chosen.map((i) => rows[i].label), say: 'A search over the choices finds the cheapest completion: ' + r.chosen.map((i) => name(rows[i])).join(', ') + '.' });
        return r.chosen.map((i) => rows[i]);
      })();
      for (const p of sel) chosen.push(p);
    }
    return { cover: chosen, essentials };
  }

  /** Petrick's method on a cyclic core; null when the expansion grows past the limit */
  function petrick(cols, rows, trace, what) {
    const idx = new Map(rows.map((p, i) => [p, i]));
    const sums = cols.map((m) => rows.filter((p) => B.covers(p.cube, m)).map((p) => idx.get(p)));
    const lbl = (i) => rows[i].label;
    trace.push({ kind: 'petrick-start', sums: sums.map((s) => s.map(lbl)),
      say: 'Petrick\'s method: each ' + what + ' needs one of its primes, so P = ' + sums.map((s) => '(' + s.map(lbl).join(' + ') + ')').join('') + ' must be 1.' });
    let prods = [[]];
    const show = (ps) => ps.slice(0, 12).map((p) => p.map(lbl).join('')).join(' + ') + (ps.length > 12 ? ' + … (' + ps.length + ' products)' : '');
    for (let k = 0; k < sums.length; k++) {
      const next = new Map();
      for (const p of prods) for (const r of sums[k]) {
        const q = p.includes(r) ? p : p.concat(r).sort((a, b) => a - b);
        next.set(q.join(','), q);
      }
      // absorption: X + XY = X
      let list = [...next.values()].sort((a, b) => a.length - b.length);
      const kept = [];
      for (const q of list) if (!kept.some((k2) => k2.every((x) => q.includes(x)))) kept.push(q);
      const absorbed = list.length - kept.length;
      prods = kept;
      if (prods.length > 4000) { trace.push({ kind: 'petrick-too-big', say: 'The expansion passes 4000 products, so the rest of the choice is made by a search instead.' }); return null; }
      if (k > 0) trace.push({ kind: 'petrick-multiply', step: k, products: prods.map((p) => p.map(lbl)), absorbed,
        say: 'Multiply in (' + sums[k].map(lbl).join(' + ') + '): P = ' + show(prods) + (absorbed ? ', after ' + absorbed + ' product' + (absorbed === 1 ? ' is' : 's are') + ' absorbed (X + XY = X).' : '.') });
    }
    const cost = (p) => ({ terms: p.length, literals: p.reduce((s, i) => s + rows[i].lits, 0) });
    let best = prods[0];
    for (const p of prods) if (better(cost(p), cost(best))) best = p;
    const ties = prods.filter((p) => { const a = cost(p), b = cost(best); return a.terms === b.terms && a.literals === b.literals; });
    trace.push({ kind: 'petrick-choose', products: prods.map((p) => p.map(lbl)), chosen: best.map(lbl), ties: ties.length,
      say: 'Each product is a way to finish the cover. The cheapest is ' + best.map(lbl).join('') + ' (' + best.length + ' term' + (best.length === 1 ? '' : 's') + ', ' + cost(best).literals + ' literals)' + (ties.length > 1 ? '; ' + (ties.length - 1) + ' other choice' + (ties.length === 2 ? ' costs' : 's cost') + ' the same.' : '.') });
    return best.map((i) => rows[i]);
  }

  // ---- minimise --------------------------------------------------------------------------------------------------------
  function result(fn, form, method, cover, primes, essentials, trace) {
    const vs = fn.vars, pos = form === 'pos';
    cover = cover.slice().sort((a, b) => a.lits - b.lits || b.cube.mask - a.cube.mask || a.cube.bits - b.cube.bits);
    let expr;
    if (!cover.length) expr = B.C(pos ? 1 : 0);
    else expr = pos ? B.AND(cover.map((t) => t.expr)) : B.OR(cover.map((t) => t.expr));
    const cost = coverCost(cover);
    const text = B.toString(expr);
    trace.push({ kind: 'result', text, cover: cover.map((t) => t.str), cost, say: 'F = ' + text + ': ' + cost.terms + ' term' + (cost.terms === 1 ? '' : 's') + ', ' + cost.literals + ' literal' + (cost.literals === 1 ? '' : 's') + '.' });
    return { form, method, vars: vs.slice(), expr, text, cover, primes, essentials, cost, trace };
  }
  B._result = result;

  /**
   * minimise(fn | expression, {form:'sop'|'pos', method:'qm'|'kmap'})
   *   -> {expr, text, cover, primes, essentials, cost:{terms, literals, gateInputs}, trace}
   * cover and primes are terms {cube, str, expr, text, minterms, lits, label}. For POS the cubes are cubes of 0s.
   */
  B.minimise = (fn, opts) => {
    opts = opts || {};
    fn = B.asFn(fn, opts.vars);
    const form = opts.form || 'sop', method = opts.method || 'qm';
    if (method === 'kmap') return B.kmapSolve(fn, form);
    const trace = [];
    const { on } = target(fn, form);
    if (!on.length) {
      trace.push({ kind: 'trivial', say: form === 'pos' ? 'F has no 0s: F = 1.' : 'F has no 1s: F = 0.' });
      return result(fn, form, 'qm', [], [], [], trace);
    }
    const { primes, columns } = tabulate(fn, form, trace);
    const { cover, essentials } = chart(on, primes, form, trace);
    const r = result(fn, form, 'qm', cover, primes, essentials, trace);
    r.columns = columns;
    return r;
  };
  B.minimize = B.minimise;
  B._chart = chart;

  /** SOP against POS for the same function, with the costs side by side */
  B.compareForms = (fn) => {
    fn = B.asFn(fn);
    const s = B.minimise(fn, { form: 'sop' }), p = B.minimise(fn, { form: 'pos' });
    const winner = s.cost.gateInputs < p.cost.gateInputs ? 'sop' : p.cost.gateInputs < s.cost.gateInputs ? 'pos' : better(s.cost, p.cost) ? 'sop' : better(p.cost, s.cost) ? 'pos' : 'tie';
    return { sop: s, pos: p, winner, say: 'SOP: ' + s.text + ' (' + s.cost.literals + ' literals, ' + s.cost.gateInputs + ' gate inputs). POS: ' + p.text + ' (' + p.cost.literals + ' literals, ' + p.cost.gateInputs + ' gate inputs). ' + (winner === 'tie' ? 'They cost the same.' : (winner === 'sop' ? 'SOP' : 'POS') + ' is cheaper.') };
  };

  // ---- multiple outputs ------------------------------------------------------------------------------------------------
  /**
   * minimiseMulti({F: fn, G: fn, ...}) for functions over the same variables, SOP.
   * Candidate terms are the primes of every product of the outputs (so a term can be shared even when it is not
   * prime for one output alone); the choice minimises distinct terms, then gate inputs.
   * -> {outputs:{name: {expr, text, terms}}, terms:[{term, used:[names]}], shared, cost, separate, trace}
   */
  B.minimiseMulti = (fns, opts) => {
    opts = opts || {};
    const names = Object.keys(fns), list = names.map((k) => B.asFn(fns[k]));
    const vs = list[0].vars, n = vs.length, k = names.length;
    if (list.some((f) => f.vars.join() !== vs.join())) throw new Error('all outputs must use the same variables');
    const trace = [];
    const care = list.map((f) => new Set([...f.ones, ...f.dc]));
    trace.push({ kind: 'mo-start', outputs: names, say: 'Minimise ' + names.join(', ') + ' together, so that a product term can feed more than one OR gate.' });
    // primes of each product of outputs
    const cand = new Map();
    for (let s = 1; s < 1 << k; s++) {
      const idx = names.map((_, i) => i).filter((i) => (s >> i) & 1);
      const ones = [], dc = [];
      for (let m = 0; m < 1 << n; m++) {
        if (!idx.every((i) => care[i].has(m))) continue;
        if (idx.every((i) => list[i].ones.has(m))) ones.push(m); else dc.push(m);
      }
      if (!ones.length) continue;
      const g = B.fromMinterms(vs, ones, dc);
      const { primes } = tabulate(g, 'sop', []);
      const fresh = primes.filter((p) => !p.dcOnly && !cand.has(B.cubeKey(p.cube)));
      for (const p of fresh) cand.set(B.cubeKey(p.cube), p);
      if (idx.length > 1) trace.push({ kind: 'mo-product', outputs: idx.map((i) => names[i]), ones, primes: primes.filter((p) => !p.dcOnly).map((p) => p.text),
        say: 'The product ' + idx.map((i) => names[i]).join('·') + ' is 1 at ' + ones.join(', ') + '; its primes ' + primes.filter((p) => !p.dcOnly).map((p) => p.text).join(', ') + ' could be shared by ' + idx.map((i) => names[i]).join(' and ') + '.' });
      else trace.push({ kind: 'mo-primes', outputs: [names[idx[0]]], primes: primes.filter((p) => !p.dcOnly).map((p) => p.text), say: 'The primes of ' + names[idx[0]] + ' alone: ' + primes.filter((p) => !p.dcOnly).map((p) => p.text).join(', ') + '.' });
    }
    const terms = [...cand.values()].map((p) => Object.assign({}, p, { tag: names.map((_, i) => i).filter((i) => p.minterms.every((m) => care[i].has(m))) }));
    terms.forEach((t, i) => { t.label = 'T' + (i + 1); });
    // branch and bound over the (output, minterm) pairs
    const pairs = [];
    list.forEach((f, i) => B.minterms(f).forEach((m) => pairs.push([i, m])));
    const candOf = pairs.map(([i, m]) => terms.map((t, ti) => ti).filter((ti) => terms[ti].tag.includes(i) && B.covers(terms[ti].cube, m)));
    const used = new Set(), cov = new Array(pairs.length).fill(0);
    let best = null, bestT = Infinity, bestL = Infinity, nodes = 0, complete = true;
    const limit = opts.limit || 400000;
    const coverOf = (ti) => pairs.map((p, pi) => pi).filter((pi) => candOf[pi].includes(ti));
    const tc = terms.map((_, ti) => coverOf(ti));
    let uncovered = pairs.length, lits = 0;
    const maxC = Math.max(1, ...tc.map((x) => x.length));
    (function go() {
      if (++nodes > limit) { complete = false; return; }
      if (!uncovered) { if (used.size < bestT || (used.size === bestT && lits < bestL)) { best = [...used]; bestT = used.size; bestL = lits; } return; }
      if (used.size + Math.ceil(uncovered / maxC) > bestT) return;
      let pick = -1, few = Infinity;
      for (let pi = 0; pi < pairs.length; pi++) if (!cov[pi] && candOf[pi].length < few) { few = candOf[pi].length; pick = pi; }
      const opts2 = candOf[pick].slice().sort((a, b) => tc[b].length - tc[a].length);
      for (const ti of opts2) {
        if (used.has(ti)) continue;
        used.add(ti); lits += terms[ti].lits;
        for (const pi of tc[ti]) if (!cov[pi]++) uncovered--;
        go();
        for (const pi of tc[ti]) if (!--cov[pi]) uncovered++;
        used.delete(ti); lits -= terms[ti].lits;
        if (!complete) return;
      }
    })();
    const chosen = (best || []).map((ti) => terms[ti]);
    // each output uses the fewest chosen terms that cover it
    const outputs = {};
    names.forEach((nm, i) => {
      const on = B.minterms(list[i]);
      const mine = chosen.filter((t) => t.tag.includes(i) && t.minterms.some((m) => on.includes(m)));
      const r = on.length ? exactCover(on, mine.map((t) => ({ cover: t.minterms, lits: t.lits }))) : { chosen: [] };
      const ts = r.chosen.map((j) => mine[j]).sort((a, b) => a.lits - b.lits || b.cube.mask - a.cube.mask || a.cube.bits - b.cube.bits);
      const expr = ts.length ? B.OR(ts.map((t) => t.expr)) : B.C(0);
      outputs[nm] = { expr, text: B.toString(expr), terms: ts };
      trace.push({ kind: 'mo-output', output: nm, terms: ts.map((t) => t.text), say: nm + ' = ' + B.toString(expr) + '.' });
    });
    const usage = chosen.map((t) => ({ term: t, used: names.filter((nm) => outputs[nm].terms.includes(t)) })).filter((u) => u.used.length);
    const shared = usage.filter((u) => u.used.length > 1);
    if (shared.length) trace.push({ kind: 'mo-shared', terms: shared.map((u) => ({ text: u.term.text, used: u.used })), say: 'Shared: ' + shared.map((u) => u.term.text + ' feeds ' + u.used.join(' and ')).join('; ') + '.' });
    const andGates = usage.filter((u) => u.term.lits > 1).length;
    const orIn = names.reduce((s, nm) => s + (outputs[nm].terms.length > 1 ? outputs[nm].terms.length : 0), 0);
    const cost = { terms: usage.length, literals: usage.reduce((s, u) => s + u.term.lits, 0), gates: andGates + names.filter((nm) => outputs[nm].terms.length > 1).length,
      gateInputs: usage.reduce((s, u) => s + (u.term.lits > 1 ? u.term.lits : 0), 0) + orIn };
    // compare with minimising each output alone
    const sep = names.map((nm, i) => B.minimise(list[i]));
    const sepTerms = new Map();
    sep.forEach((r) => r.cover.forEach((t) => sepTerms.set(B.cubeKey(t.cube), t)));
    const separate = { terms: sepTerms.size, perOutput: Object.fromEntries(names.map((nm, i) => [nm, sep[i].text])) };
    trace.push({ kind: 'mo-done', cost, separate, complete,
      say: 'Together: ' + cost.terms + ' distinct product term' + (cost.terms === 1 ? '' : 's') + '. Minimised one at a time they need ' + separate.terms + '.' + (complete ? '' : ' (The search stopped at its budget; the result is good but may not be the very best.)') });
    return { outputs, terms: usage, shared, cost, separate, candidates: terms, complete, trace };
  };
  B.minimizeMulti = B.minimiseMulti;
})(globalThis.Sirkit = globalThis.Sirkit || {});
