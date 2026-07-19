// State reduction. The implication table (pairs crossed out round by round, each with its reason) and
// partition refinement (blocks split until every block's members agree on where they go) must reach the same
// classes on a completely specified machine. For a machine with unspecified entries the uncrossed pairs are
// compatibles, not equivalences: the maximal compatibles (the cliques of the merger diagram) are found and a
// smallest closed cover of them is merged.
(function (S) {
  'use strict';
  const F = S.Fsm = S.Fsm || {};
  const U = F.util = F.util || {};
  const pk = (a, b) => a + '|' + b;

  /** the implication table of a machine: { pairs, rounds, classes (complete machines), compatible, trace } */
  F.implication = function (m) {
    const syms = F.symbols(m), st = m.states, trace = [], pairs = new Map();
    const complete = F.complete(m);
    const showIn = (x) => U.showIn(m, x);
    trace.push({ kind: 'table', states: st.slice(), say: 'Draw the implication table: one cell for each of the ' + (st.length * (st.length - 1)) / 2 + ' pairs of states.' });
    // round 0: different outputs
    for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
      const a = st[i], b = st[j], cell = { a, b, crossed: null, reason: null, implied: [] };
      pairs.set(pk(a, b), cell);
      if (m.type === 'moore' && !U.agree(m.out[a], m.out[b])) { cell.crossed = 0; cell.reason = a + ' outputs ' + m.out[a] + ' but ' + b + ' outputs ' + m.out[b]; }
      for (const x of syms) {
        if (m.type === 'mealy' && !cell.crossed && !U.agree(m.out[a][x], m.out[b][x])) { cell.crossed = 0; cell.reason = 'on ' + showIn(x) + ' ' + a + ' outputs ' + m.out[a][x] + ' but ' + b + ' outputs ' + m.out[b][x]; }
        const p = m.next[a][x], q = m.next[b][x];
        if (p == null || q == null || p === q) continue;
        const [u, v] = st.indexOf(p) < st.indexOf(q) ? [p, q] : [q, p];
        if ((u === a && v === b)) continue; // implies itself
        if (!cell.implied.some((e) => e[1] === u && e[2] === v)) cell.implied.push([x, u, v]);
      }
      if (cell.crossed === 0) trace.push({ kind: 'cross', round: 0, pair: [a, b], say: 'Cross out (' + a + ', ' + b + '): ' + cell.reason + '.' });
      else trace.push({ kind: 'cell', pair: [a, b], implied: cell.implied.map((e) => [e[1], e[2]]), say: cell.implied.length ? 'Cell (' + a + ', ' + b + ') holds the implied pairs ' + cell.implied.map((e) => '(' + e[1] + ', ' + e[2] + ')').join(', ') + '.' : 'Cell (' + a + ', ' + b + ') has the same outputs and implies nothing else: a tick.' });
    }
    const rounds = [[...pairs.values()].filter((c) => c.crossed === 0).map((c) => [c.a, c.b])];
    for (let r = 1; ; r++) {
      const now = [];
      for (const c of pairs.values()) {
        if (c.crossed != null) continue;
        const hit = c.implied.find((e) => { const d = pairs.get(pk(e[1], e[2])); return d && d.crossed != null && d.crossed < r; });
        if (hit) now.push([c, hit]);
      }
      if (!now.length) { trace.push({ kind: 'round', round: r, crossed: [], say: 'Round ' + r + ' crosses out nothing more, so the table is finished.' }); break; }
      for (const [c, e] of now) {
        c.crossed = r; c.reason = 'on ' + showIn(e[0]) + ' it leads to (' + e[1] + ', ' + e[2] + '), which is crossed out';
        trace.push({ kind: 'cross', round: r, pair: [c.a, c.b], because: [e[1], e[2]], say: 'Round ' + r + ': cross out (' + c.a + ', ' + c.b + '): ' + c.reason + '.' });
      }
      rounds.push(now.map(([c]) => [c.a, c.b]));
    }
    const left = [...pairs.values()].filter((c) => c.crossed == null).map((c) => [c.a, c.b]);
    const out = { pairs, rounds, left, complete, trace };
    if (complete) {
      out.classes = classesFrom(st, left);
      trace.push({ kind: 'classes', classes: out.classes, say: left.length ? 'The pairs left, ' + left.map((p) => '(' + p.join(', ') + ')').join(', ') + ', give the classes ' + showClasses(out.classes) + '.' : 'No pair is left: every state is distinct.' });
    } else trace.push({ kind: 'compatible', pairs: left, say: 'The machine has unspecified entries, so the pairs left, ' + (left.map((p) => '(' + p.join(', ') + ')').join(', ') || 'none') + ', are compatible pairs, not equivalences.' });
    return out;
  };
  const showClasses = (cl) => cl.map((c) => '{' + c.join(', ') + '}').join(' ');
  F.showClasses = showClasses;
  function classesFrom(states, pairs) {
    const parent = new Map(states.map((s) => [s, s]));
    const find = (s) => (parent.get(s) === s ? s : find(parent.get(s)));
    for (const [a, b] of pairs) { const x = find(a), y = find(b); if (x !== y) parent.set(y, x); }
    const groups = new Map();
    for (const s of states) { const r = find(s); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(s); }
    return [...groups.values()];
  }

  /** partition refinement: { classes, rounds: [[blocks], ...], trace } (completely specified machines) */
  F.partition = function (m) {
    if (!F.complete(m)) throw new Error('partition refinement needs a completely specified machine');
    const syms = F.symbols(m), trace = [];
    const sig0 = (s) => (m.type === 'moore' ? m.out[s] : syms.map((x) => m.out[s][x]).join(','));
    const group = (keyOf) => { const g = new Map(); for (const s of m.states) { const k = keyOf(s); if (!g.has(k)) g.set(k, []); g.get(k).push(s); } return [...g.values()]; };
    let blocks = group(sig0);
    const rounds = [blocks];
    trace.push({ kind: 'blocks', round: 0, blocks, say: 'P0 groups the states by their outputs: ' + showClasses(blocks) + '.' });
    for (let r = 1; ; r++) {
      const idx = new Map(); blocks.forEach((b, i) => b.forEach((s) => idx.set(s, i)));
      const name = (i) => 'B' + (i + 1);
      const nb = [];
      for (const b of blocks) {
        const g = new Map();
        for (const s of b) { const k = syms.map((x) => idx.get(m.next[s][x])).join(','); if (!g.has(k)) g.set(k, []); g.get(k).push(s); }
        const parts = [...g.values()];
        if (parts.length > 1) {
          // say why the first two parts differ
          const a = parts[0][0], c = parts[1][0], x = syms.find((y) => idx.get(m.next[a][y]) !== idx.get(m.next[c][y]));
          trace.push({ kind: 'split', round: r, block: b, into: parts, say: 'Round ' + r + ': {' + b.join(', ') + '} splits into ' + showClasses(parts) + ': on ' + U.showIn(m, x) + ' ' + a + ' goes to ' + m.next[a][x] + ' in ' + name(idx.get(m.next[a][x])) + ' but ' + c + ' goes to ' + m.next[c][x] + ' in ' + name(idx.get(m.next[c][x])) + '.' });
        }
        nb.push(...parts);
      }
      if (nb.length === blocks.length) { trace.push({ kind: 'stable', round: r, blocks, say: 'Round ' + r + ' splits nothing, so P' + (r - 1) + ' = ' + showClasses(blocks) + ' is final.' }); break; }
      blocks = nb; rounds.push(blocks);
      trace.push({ kind: 'blocks', round: r, blocks, say: 'P' + r + ' = ' + showClasses(blocks) + '.' });
    }
    return { classes: blocks, rounds, trace };
  };

  /** the machine with each class merged into its first state */
  F.mergeClasses = function (m, classes) {
    const rep = new Map();
    for (const c of classes) { const sorted = m.states.filter((s) => c.includes(s)); for (const s of c) rep.set(s, sorted[0]); }
    const r = { type: m.type, inputs: m.inputs.slice(), outputs: m.outputs.slice(), states: m.states.filter((s) => rep.get(s) === s), start: rep.get(m.start), next: {}, out: {}, name: m.name };
    for (const s of r.states) {
      r.next[s] = {};
      for (const x of F.symbols(m)) r.next[s][x] = m.next[s][x] == null ? null : rep.get(m.next[s][x]);
      r.out[s] = m.type === 'moore' ? m.out[s] : Object.assign({}, m.out[s]);
    }
    return { machine: r, map: rep };
  };

  /**
   * Reduce a machine. opts.method 'implication' (default) or 'partition'; opts.reachable drops unreachable
   * states first. A machine with unspecified entries is reduced by a closed cover of compatibles.
   */
  F.reduce = function (m, opts) {
    opts = opts || {};
    const trace = [];
    let src = m;
    if (opts.reachable) {
      const keep = F.reachable(m);
      if (keep.length < m.states.length) {
        const drop = m.states.filter((s) => !keep.includes(s));
        src = F.clone(m); src.states = keep; for (const s of drop) { delete src.next[s]; delete src.out[s]; }
        trace.push({ kind: 'unreachable', states: drop, say: 'Drop ' + drop.join(', ') + ', which cannot be reached from ' + m.start + '.' });
      }
    }
    if (!F.complete(src)) {
      const c = F.compatibles(src), cover = F.closedCover(src, c);
      const merged = F.mergeCover(src, cover.blocks);
      return { machine: merged.machine, classes: cover.blocks, map: merged.map, compatibles: c, cover, trace: trace.concat(c.trace, cover.trace, merged.trace) };
    }
    const res = opts.method === 'partition' ? F.partition(src) : F.implication(src);
    const { machine, map } = F.mergeClasses(src, res.classes);
    trace.push(...res.trace);
    const merged = res.classes.filter((c) => c.length > 1);
    trace.push({ kind: 'reduced', say: merged.length ? 'Keep the first state of each class (' + merged.map((c) => c.slice(1).join(', ') + ' → ' + c[0]).join('; ') + '): ' + machine.states.length + ' states instead of ' + src.states.length + '.' : 'No two states are equivalent; the machine is already minimal.' });
    return { machine, classes: res.classes, map, table: opts.method === 'partition' ? null : res, partition: opts.method === 'partition' ? res : null, trace };
  };

  // ---- compatibles (incompletely specified machines and flow tables) -------------------------------------
  /** compatible pairs and maximal compatibles (the cliques of the merger diagram) */
  F.compatibles = function (m) {
    const t = F.implication(m), st = m.states, trace = t.trace.slice();
    const ok = new Set(t.left.map((p) => pk(p[0], p[1])));
    const comp = (a, b) => a === b || ok.has(pk(a, b)) || ok.has(pk(b, a));
    const maximal = [];
    // Bron–Kerbosch on the merger diagram
    const bk = (R, P, X) => {
      if (!P.length && !X.length) { maximal.push(st.filter((s) => R.includes(s))); return; }
      for (const v of P.slice()) {
        bk(R.concat([v]), P.filter((u) => u !== v && comp(u, v)), X.filter((u) => comp(u, v)));
        P = P.filter((u) => u !== v); X = X.concat([v]);
      }
    };
    bk([], st.slice(), []);
    maximal.sort((a, b) => b.length - a.length || st.indexOf(a[0]) - st.indexOf(b[0]));
    trace.push({ kind: 'merger', edges: t.left, maximal, say: 'The merger diagram joins every compatible pair; its largest fully joined groups are the maximal compatibles ' + showClasses(maximal) + '.' });
    return { table: t, pairs: t.left, comp, maximal, trace };
  };
  /** what a set of states must be merged with: for each input, the set of its specified next states */
  const implies = (m, block) => F.symbols(m).map((x) => [...new Set(block.map((s) => m.next[s][x]).filter((n) => n != null))]).filter((s) => s.length > 1);
  /** a smallest closed cover of compatibles: every state in some block, and every implied set inside a block */
  F.closedCover = function (m, c) {
    const st = m.states, trace = [];
    // every compatible (subset of a maximal compatible), largest first
    const all = new Map();
    const addSubsets = (blk) => {
      const n = blk.length;
      for (let mask = 1; mask < 1 << n; mask++) { const sub = blk.filter((_, i) => mask & (1 << i)); all.set(sub.join(','), sub); }
    };
    for (const b of c.maximal) if (b.length <= 12) addSubsets(b);
    const cands = [...all.values()].sort((a, b) => b.length - a.length);
    const closed = (blocks) => blocks.every((b) => implies(m, b).every((need) => blocks.some((o) => need.every((s) => o.includes(s)))));
    let best = null, budget = 200000;
    const search = (chosen, k, from) => {
      if (best || budget-- < 0) return;
      const covered = new Set(chosen.flat());
      if (chosen.length === k) { if (covered.size === st.length && closed(chosen)) best = chosen.slice(); return; }
      // the first uncovered state must be covered by the next block chosen
      const need = st.find((s) => !covered.has(s));
      for (let i = from; i < cands.length; i++) {
        const b = cands[i];
        if (need && !b.includes(need)) continue;
        if (!need && true) { /* all covered: extra blocks only for closure */ }
        chosen.push(b); search(chosen, k, need ? 0 : i + 1); chosen.pop();
        if (best) return;
      }
    };
    for (let k = 1; k <= st.length && !best; k++) search([], k, 0);
    if (!best) best = st.map((s) => [s]);
    best.sort((a, b) => st.indexOf(a[0]) - st.indexOf(b[0]));
    trace.push({ kind: 'cover', blocks: best, say: 'The smallest closed cover is ' + showClasses(best) + ': it covers every state, and every set of next states it implies lies inside one of its blocks.' });
    return { blocks: best, trace };
  };
  /** the machine from a cover of compatibles: one state per block, named by joining its members */
  F.mergeCover = function (m, blocks) {
    const name = (b) => (b.length === 1 ? b[0] : b.every((s) => s.length === 1) ? b.join('') : b.join('_'));
    const names = blocks.map(name), trace = [];
    const blockFor = (set, prefer) => { if (prefer >= 0 && set.every((s) => blocks[prefer].includes(s))) return prefer; return blocks.findIndex((b) => set.every((s) => b.includes(s))); };
    const r = { type: m.type, inputs: m.inputs.slice(), outputs: m.outputs.slice(), states: names.slice(), start: null, next: {}, out: {}, name: m.name };
    const map = new Map();
    for (const s of m.states) map.set(s, names[blocks.findIndex((b) => b.includes(s))]);
    r.start = map.get(m.start);
    const mergeOut = (zs) => { const w = m.outputs.length; let o = ''; for (let i = 0; i < w; i++) { const v = zs.map((z) => z && z[i]).find((c) => c === '0' || c === '1'); o += v || '-'; } return o; };
    blocks.forEach((b, i) => {
      const q = names[i];
      r.next[q] = {};
      if (m.type === 'moore') r.out[q] = mergeOut(b.map((s) => m.out[s])); else r.out[q] = {};
      for (const x of F.symbols(m)) {
        const ns = [...new Set(b.map((s) => m.next[s][x]).filter((n) => n != null))];
        const j = ns.length ? blockFor(ns, ns.every((s) => b.includes(s)) ? i : -1) : -1;
        r.next[q][x] = j < 0 ? null : names[j];
        if (m.type === 'mealy') r.out[q][x] = mergeOut(b.map((s) => m.out[s][x]));
      }
      trace.push({ kind: 'merge', block: b, name: q, say: 'Merge ' + b.join(', ') + ' into the row ' + q + '.' });
    });
    return { machine: r, map, trace };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
