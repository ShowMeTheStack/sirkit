// State diagrams of Mealy and Moore machines (Sirkit.Fsm): states as circles (a long name or a Moore output makes
// an oval), a start arrow, transitions as straight or curved arrows with their labels merged per edge ("0/0, 1/0"),
// self-loops where there is the most room, and labels placed where they collide with nothing. The layout is
// automatic (layered from the start state with crossing reduction, or a stress layout with a crossing-reducing
// pass, whichever routes with fewer crossings), or fixed by the caller. Highlights: the present state, the edge
// just taken, states dimmed or marked; merges for state reduction. S.Kit.fsm.draw(machine, opts) -> {items, pos,
// routes, box}; S.Kit.fsm.table(machine, opts) draws the state table.
(function (S) {
  'use strict';
  const Geo = S.geom;
  const K = (S.Kit = S.Kit || {});
  const G = (K.fsm = {});
  const R = 26, LABEL = 15, SUB = 14, SUB_DY = 18;

  /**
   * The diagram form of a Sirkit.Fsm machine: {states, start, trans: [{from, to, label}], labelOf}. Transitions
   * between one pair of states share one edge; its label lists the inputs (Mealy: input/output). With one input
   * each symbol is written out ("0/0, 1/0"); with more, the inputs that act alike are merged into cubes ("1-/0").
   * A Moore state shows its output after its name ("S2/1"). A machine already in diagram form is kept.
   */
  G.machine = function (m) {
    if (m && m.trans && m.states) return m;
    const F = S.Fsm, syms = F.symbols(m), k = m.inputs.length;
    const trans = [];
    const cubesOf = (xs) => {
      if (k === 1 || xs.length === 1) return xs;
      if (xs.length === syms.length) return ['-'.repeat(k)];
      return F.util.qm(k, xs.map((x) => parseInt(x, 2)), []).cubes;
    };
    for (const s of m.states) {
      const by = new Map();
      for (const x of syms) { const n = m.next[s][x]; if (n == null) continue; if (!by.has(n)) by.set(n, []); by.get(n).push(x); }
      for (const [n, xs] of by) {
        const parts = [];
        if (m.type === 'mealy') {
          const byOut = new Map();
          for (const x of xs) { const z = m.out[s][x]; if (!byOut.has(z)) byOut.set(z, []); byOut.get(z).push(x); }
          for (const [z, ys] of byOut) for (const c of cubesOf(ys)) parts.push(c + '/' + z);
        } else parts.push(...cubesOf(xs));
        const one = parts.join(', ');
        trans.push({ from: s, to: n, label: Geo.textWidth(one, 15) > 76 && parts.length > 1 ? parts.join('\n') : one, inputs: xs });
      }
    }
    const out = { states: m.states.slice(), start: m.start, trans, type: m.type };
    if (m.type === 'moore') out.labelOf = (q) => q + '/' + m.out[q];
    return out;
  };

  /** Edges grouped per ordered pair with their labels merged */
  G.edges = function (m) {
    const by = new Map();
    for (const t of m.trans) {
      const k = t.from + '>' + t.to;
      if (!by.has(k)) by.set(k, { from: t.from, to: t.to, labels: [] });
      if (!by.get(k).labels.includes(t.label)) by.get(k).labels.push(t.label);
    }
    for (const e of by.values()) e.label = e.labels.join('\n');
    return [...by.values()];
  };

  // ---- sizes ---------------------------------------------------------------------------------------------------
  /** The shape a state is drawn as: a circle, or a rounded box when it has lines (subset construction) */
  G.shape = function (q, opts) {
    const lines = opts && opts.boxes && opts.boxes[q];
    const text = (opts && opts.labelOf ? opts.labelOf(q) : q);
    const r = (opts && opts.r) || R;
    if (lines) {
      const ls = [].concat(lines);
      // box states carry the class set, drawn in the monospaced font (styles.css): measure them so
      const w = Math.max(64, ...ls.map((l) => Geo.textWidth(l, 14, { mono: true }) * 1.04 + 26));
      return { w, h: Math.max(44, ls.length * 17 + 18), rx: 14, lines: ls };
    }
    const tw = Geo.textWidth(text, 17, { bold: true });
    // a long name makes the state an oval-ended box rather than squeezing the text
    if (tw > 2 * r - 10) { const w = tw + 22; return { w, h: 2 * r, rx: r, lines: [String(text)] }; }
    return { r, w: 2 * r, h: 2 * r, rx: r, lines: [String(text)] };
  };

  // ---- layout ------------------------------------------------------------------------------------------------------
  /** Breadth-first layers from the start state (states it cannot reach go after, from their own roots) */
  function layers(m) {
    const out = new Map(), adj = new Map(m.states.map((q) => [q, []]));
    for (const t of m.trans) if (adj.has(t.from) && t.from !== t.to) adj.get(t.from).push(t.to);
    const bfs = (root, base) => {
      const qu = [root]; out.set(root, base);
      while (qu.length) { const q = qu.shift(); for (const r of adj.get(q) || []) if (!out.has(r)) { out.set(r, out.get(q) + 1); qu.push(r); } }
    };
    if (m.start && adj.has(m.start)) bfs(m.start, 0);
    for (const q of m.states) if (!out.has(q)) bfs(q, Math.max(0, ...out.values()) + 1);
    return out;
  }
  /** Count crossings of straight edges, and edges running through states, for positions pos */
  function score(m, pos, sizes) {
    const segs = [];
    for (const t of m.trans) if (t.from !== t.to && pos[t.from] && pos[t.to]) segs.push([pos[t.from], pos[t.to], t.from, t.to]);
    let cross = 0, through = 0;
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i], b = segs[j];
      if (a[2] === b[2] || a[2] === b[3] || a[3] === b[2] || a[3] === b[3]) continue;
      if (Geo.segCross(a[0], a[1], b[0], b[1])) cross++;
    }
    for (const s of segs) for (const q of m.states) {
      if (q === s[2] || q === s[3]) continue;
      const p = pos[q], sz = sizes[q];
      if (Geo.segDist(p, s[0], s[1]) < Math.max(sz.w, sz.h) / 2 + 10) through++;
    }
    // states too close to each other
    let close = 0;
    const qs = m.states;
    for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) {
      const a = pos[qs[i]], b = pos[qs[j]];
      if (Math.abs(a.x - b.x) < (sizes[qs[i]].w + sizes[qs[j]].w) / 2 + 40 && Math.abs(a.y - b.y) < (sizes[qs[i]].h + sizes[qs[j]].h) / 2 + 40) close++;
    }
    return { cross, through, close, total: cross * 10 + through * 3 + close * 30 };
  }
  G.score = (m, pos, opts) => score(G.machine(m), pos, sizesOf(G.machine(m), opts));
  const sizesOf = (m, opts) => { const s = {}; const o = Object.assign({}, opts || {}); if (!o.labelOf && m.labelOf) o.labelOf = m.labelOf; for (const q of m.states) s[q] = G.shape(q, o); return s; };

  function layered(m, sizes, opts) {
    const L = layers(m);
    const nL = Math.max(0, ...L.values()) + 1;
    const rows = Array.from({ length: nL }, () => []);
    for (const q of m.states) rows[L.get(q)].push(q);
    // neighbours in both directions, for barycentres
    const nb = new Map(m.states.map((q) => [q, []]));
    for (const t of m.trans) if (t.from !== t.to && nb.has(t.from) && nb.has(t.to)) { nb.get(t.from).push(t.to); nb.get(t.to).push(t.from); }
    const idx = new Map();
    const reindex = () => rows.forEach((r) => r.forEach((q, i) => idx.set(q, i - (r.length - 1) / 2)));
    reindex();
    for (let it = 0; it < 8; it++) {
      const order = it % 2 ? rows.map((_, i) => nL - 1 - i) : rows.map((_, i) => i);
      for (const li of order) {
        const bc = new Map(rows[li].map((q) => {
          const ns = nb.get(q).filter((r) => L.get(r) !== li);
          return [q, ns.length ? ns.reduce((a, r) => a + idx.get(r), 0) / ns.length : idx.get(q)];
        }));
        rows[li].sort((a, b) => bc.get(a) - bc.get(b));
        reindex();
      }
    }
    const maxW = Math.max(...m.states.map((q) => sizes[q].w)), maxH = Math.max(...m.states.map((q) => sizes[q].h));
    const gx = (opts.gapX || 150) + Math.max(0, maxW - 2 * R), gy = (opts.gapY || 120) + Math.max(0, maxH - 2 * R);
    const pos = {};
    rows.forEach((r, li) => r.forEach((q, i) => { pos[q] = { x: li * gx, y: (i - (r.length - 1) / 2) * gy }; }));
    // a layer of one state between two of one state lines up; nudge such a straight chain apart when an
    // edge skips a layer through the middle one
    return pos;
  }

  function stress(m, sizes, init, opts, fixed) {
    const qs = m.states, n = qs.length;
    const id = new Map(qs.map((q, i) => [q, i]));
    const D = Array.from({ length: n }, () => new Array(n).fill(Infinity));
    for (let i = 0; i < n; i++) D[i][i] = 0;
    for (const t of m.trans) { const a = id.get(t.from), b = id.get(t.to); if (a !== undefined && b !== undefined && a !== b) { D[a][b] = 1; D[b][a] = 1; } }
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (D[i][k] + D[k][j] < D[i][j]) D[i][j] = D[i][k] + D[k][j];
    let maxd = 1;
    for (const r of D) for (const v of r) if (v < Infinity) maxd = Math.max(maxd, v);
    const maxW = Math.max(...qs.map((q) => sizes[q].w));
    const unit = (opts.gapX || 150) * 0.95 + Math.max(0, maxW - 2 * R) * 0.7;
    const P = qs.map((q) => ({ x: init[q].x, y: init[q].y + (id.get(q) % 2 ? 3 : -3) }));
    for (let it = 0; it < 220; it++) {
      for (let i = 0; i < n; i++) {
        if (fixed && fixed[qs[i]]) continue;
        let sx = 0, sy = 0, sw = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const d = (D[i][j] === Infinity ? maxd + 1 : D[i][j]) * unit;
          const w = 1 / (d * d);
          const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, l = Math.hypot(dx, dy) || 0.01;
          sx += w * (P[j].x + d * dx / l); sy += w * (P[j].y + d * dy / l); sw += w;
        }
        if (sw) { P[i].x = sx / sw; P[i].y = sy / sw; }
      }
    }
    const pos = {};
    qs.forEach((q, i) => { pos[q] = fixed && fixed[q] ? { x: fixed[q].x, y: fixed[q].y } : { x: P[i].x, y: P[i].y }; });
    improve(m, pos, sizes, fixed);
    return pos;
  }
  /** Swap pairs of states while it lowers the score (fewer crossings, fewer edges through states) */
  function improve(m, pos, sizes, fixed) {
    let best = score(m, pos, sizes).total;
    const qs = m.states.filter((q) => !(fixed && fixed[q]));
    for (let round = 0; round < 4 && best > 0; round++) {
      let better = false;
      for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) {
        const a = qs[i], b = qs[j];
        [pos[a], pos[b]] = [pos[b], pos[a]];
        const s = score(m, pos, sizes).total;
        if (s < best) { best = s; better = true; } else [pos[a], pos[b]] = [pos[b], pos[a]];
      }
      if (!better) break;
    }
  }

  /**
   * Positions for a machine's states. opts: {mode: 'auto'|'layered'|'stress', fixed: {q: {x, y}}, gapX, gapY,
   * boxes, labelOf}. Every state given in fixed (or in the machine's own pos) stays where it is.
   * Returns {pos: {q: {x, y}}, mode, crossings}.
   */
  G.layout = function (m, opts) {
    m = G.machine(m);
    opts = opts || {};
    const sizes = sizesOf(m, opts);
    const fixed = Object.assign({}, m.pos || {}, opts.fixed || {});
    const nFixed = m.states.filter((q) => fixed[q]).length;
    if (m.states.length && nFixed === m.states.length) { const pos = {}; for (const q of m.states) pos[q] = { x: fixed[q].x, y: fixed[q].y }; return { pos, mode: 'fixed', crossings: score(m, pos, sizes).cross }; }
    const lay = layered(m, sizes, opts);
    if (nFixed) {
      // place the new states around the ones the student put down
      const init = {};
      for (const q of m.states) init[q] = fixed[q] || { x: lay[q].x + 40, y: lay[q].y + 30 };
      const pos = stress(m, sizes, init, opts, fixed);
      return { pos, mode: 'stress', crossings: score(m, pos, sizes).cross };
    }
    const mode = opts.mode || 'auto';
    if (mode === 'layered') { improveLayered(m, lay, sizes); return { pos: lay, mode, crossings: score(m, lay, sizes).cross }; }
    if (mode === 'stress') { const st = stress(m, sizes, lay, opts, null); return { pos: st, mode, crossings: score(m, st, sizes).cross }; }
    // several candidates, each judged by how its edges look once routed (bends included): crossings and
    // edges through states first, then labels in trouble, then size. The layered one wins ties.
    const cands = [];
    const l1 = clonePos(lay); improveLayered(m, l1, sizes); cands.push(['layered', l1]);
    const l2 = clonePos(lay); transpose(m, l2, sizes); improveLayered(m, l2, sizes); cands.push(['layered', l2]);
    if (m.states.length > 2) {
      cands.push(['stress', stress(m, sizes, lay, opts, null)]);
      const ring = {};
      m.states.forEach((q, i) => { const a = 2 * Math.PI * i / m.states.length; ring[q] = { x: Math.cos(a) * 200, y: Math.sin(a) * 200 }; });
      cands.push(['stress', stress(m, sizes, ring, opts, null)]);
    }
    let best = null;
    for (const [name, pos] of cands) {
      const sc = routedScore(m, pos, sizes) + (name === 'layered' ? 0 : 0.5);
      if (!best || sc < best.sc - 1e-9) best = { sc, name, pos };
    }
    return { pos: best.pos, mode: best.name, crossings: score(m, best.pos, sizes).cross };
  };
  const clonePos = (p) => { const o = {}; for (const k in p) o[k] = { x: p[k].x, y: p[k].y }; return o; };
  /** Swap neighbours within a layer (same x) while that lowers the crossings */
  function transpose(m, pos, sizes) {
    const cols = new Map();
    for (const q of m.states) { const k = Math.round(pos[q].x); if (!cols.has(k)) cols.set(k, []); cols.get(k).push(q); }
    let best = score(m, pos, sizes).total;
    for (let round = 0; round < 4; round++) {
      let better = false;
      for (const qs of cols.values()) {
        qs.sort((a, b) => pos[a].y - pos[b].y);
        for (let i = 0; i + 1 < qs.length; i++) {
          const a = qs[i], b = qs[i + 1];
          [pos[a], pos[b]] = [pos[b], pos[a]];
          const sc = score(m, pos, sizes).total;
          if (sc < best) { best = sc; better = true; [qs[i], qs[i + 1]] = [b, a]; } else [pos[a], pos[b]] = [pos[b], pos[a]];
        }
      }
      if (!better) break;
    }
  }
  /** How good a placement looks once its edges are routed: crossings and edges through states weigh most */
  function routedScore(m, pos, sizes) {
    const rs = G.route(m, pos, sizes, {});
    let cross = 0, through = 0, lab = 0;
    const pts = rs.map((r) => r.pts);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      if (rs[i].loop === undefined && rs[j].loop === undefined && (rs[i].from === rs[j].to && rs[i].to === rs[j].from)) continue;
      cross += Geo.polyCross(pts[i], pts[j]);
    }
    const boxes = m.states.map((q) => ({ q, b: boxOf(pos[q], sizes[q], 4) }));
    for (const r of rs) for (const sb of boxes) if (sb.q !== r.from && sb.q !== r.to && Geo.polyBox(r.pts, sb.b)) through++;
    const lbs = rs.map((r) => Geo.labelBox(r.label, r.lx, r.ly, LABEL));
    for (let i = 0; i < lbs.length; i++) {
      for (const sb of boxes) if (Geo.boxHit(lbs[i], sb.b, 0)) lab++;
      for (let j = i + 1; j < lbs.length; j++) if (Geo.boxHit(lbs[i], lbs[j], 0)) lab++;
      for (let j = 0; j < rs.length; j++) if (j !== i && Geo.polyBox(rs[j].pts, lbs[i])) lab++;
    }
    const u = Geo.union(m.states.map((q) => boxOf(pos[q], sizes[q], 0)));
    return cross * 10 + through * 10 + lab * 4 + (u ? (u.w * u.h) / 2e6 : 0);
  }
  /** In a layered picture, a state that an edge would run straight through moves half a step aside */
  function improveLayered(m, pos, sizes) {
    for (let round = 0; round < 3; round++) {
      const s0 = score(m, pos, sizes);
      if (!s0.through) return;
      for (const q of m.states) {
        const keep = pos[q];
        let best = s0.total, at = keep;
        for (const dy of [-50, 50, -80, 80]) {
          pos[q] = { x: keep.x, y: keep.y + dy };
          const s = score(m, pos, sizes).total;
          if (s < best) { best = s; at = pos[q]; }
        }
        pos[q] = at;
      }
    }
  }

  // ---- routing and labels ---------------------------------------------------------------------------------------
  const shapeAt = (p, sz) => ({ x: p.x, y: p.y, w: sz.w, h: sz.h, rx: sz.rx });
  const boxOf = (p, sz, pad) => ({ x: p.x - sz.w / 2 - (pad || 0), y: p.y - sz.h / 2 - (pad || 0), w: sz.w + 2 * (pad || 0), h: sz.h + 2 * (pad || 0) });

  /**
   * Route every edge and place every label (opts.obstacles: more boxes for edges and labels to keep clear of). Returns [{from, to, label, bend, loop, lx, ly, geom}].
   * Two edges between the same pair arc apart; an edge that would run through a state or cross another
   * one bends round it; self-loops point where there is the most room; labels go where they touch nothing.
   */
  G.route = function (m, pos, sizes, opts) {
    opts = opts || {};
    const es = G.edges(m);
    const out = [];
    const stateBoxes = m.states.map((q) => ({ q, b: boxOf(pos[q], sizes[q], 6) })).concat((opts.obstacles || []).map((b) => ({ q: null, b })));
    const has = (a, b) => es.some((e) => e.from === a && e.to === b);
    // straight and curved edges first, the shortest first, so long ones bend round what is placed
    const plain = es.filter((e) => e.from !== e.to).sort((a, b) => Math.hypot(pos[a.from].x - pos[a.to].x, pos[a.from].y - pos[a.to].y) - Math.hypot(pos[b.from].x - pos[b.to].x, pos[b.from].y - pos[b.to].y));
    const placed = [];
    for (const e of plain) {
      const A = shapeAt(pos[e.from], sizes[e.from]), B = shapeAt(pos[e.to], sizes[e.to]);
      const twin = has(e.to, e.from);
      const tries = twin ? [22, 40, 64, 96] : [0, 26, -26, 50, -50, 80, -80, 115, -115, 160, -160];
      let best = null;
      for (const bend of tries) {
        const g = Geo.edge(A, B, { bend, gapB: 1.5 });
        const pts = Geo.sample(g, 48);
        let s = Math.abs(bend) / 100;
        for (const sb of stateBoxes) if (sb.q !== e.from && sb.q !== e.to && Geo.polyBox(pts, sb.b)) s += 100;
        for (const p of placed) s += 12 * Geo.polyCross(pts, p.pts);
        if (!best || s < best.s) best = { s, bend, g, pts };
        if (s < 1) break;
      }
      const r = { from: e.from, to: e.to, label: e.label, bend: best.bend, geom: best.g, pts: best.pts, twin };
      placed.push(r); out.push(r);
    }
    // a second and third look: each edge re-chooses its bend against all the others
    for (let pass = 0; pass < 2; pass++) {
      let changed = false;
      for (const r of placed) {
        const A = shapeAt(pos[r.from], sizes[r.from]), B = shapeAt(pos[r.to], sizes[r.to]);
        const tries = r.twin ? [r.bend] : [0, 26, -26, 50, -50, 80, -80, 115, -115, 160, -160];
        const cost = (pts, bend) => { let s = Math.abs(bend) / 100; for (const sb of stateBoxes) if (sb.q !== r.from && sb.q !== r.to && Geo.polyBox(pts, sb.b)) s += 100; for (const o of placed) if (o !== r) s += 12 * Geo.polyCross(pts, o.pts); return s; };
        let best = { s: cost(r.pts, r.bend), bend: r.bend, g: r.geom, pts: r.pts };
        for (const bend of tries) {
          if (bend === r.bend) continue;
          const g = Geo.edge(A, B, { bend, gapB: 1.5 }), pts = Geo.sample(g, 48), sc = cost(pts, bend);
          if (sc < best.s - 0.05) best = { s: sc, bend, g, pts };
        }
        if (best.bend !== r.bend) { r.bend = best.bend; r.geom = best.g; r.pts = best.pts; changed = true; }
      }
      if (!changed) break;
    }
    // two edges between one pair of states must bend to the same side of their own direction (so they arc apart):
    // choose that side, and how far, for the pair together
    for (let pass = 0; pass < 2; pass++) {
      for (const r of placed) {
        if (!r.twin) continue;
        const q = placed.find((o) => o.from === r.to && o.to === r.from);
        if (!q || placed.indexOf(q) < placed.indexOf(r)) continue;
        const geo = (e, bend) => { const g = Geo.edge(shapeAt(pos[e.from], sizes[e.from]), shapeAt(pos[e.to], sizes[e.to]), { bend, gapB: 1.5 }); return { g, pts: Geo.sample(g, 48) }; };
        const cost = (e, pts, bend) => { let c = Math.abs(bend) / 100; for (const sb of stateBoxes) if (sb.q !== e.from && sb.q !== e.to && Geo.polyBox(pts, sb.b)) c += 100; for (const o of placed) if (o !== r && o !== q) c += 12 * Geo.polyCross(pts, o.pts); return c; };
        let best = null;
        const mags = [0, 22, -22, 40, -40, 64, -64, 96, -96];
        const gs = new Map();
        const gOf = (e, b) => { const k = (e === r ? 'r' : 'q') + b; if (!gs.has(k)) gs.set(k, geo(e, b)); return gs.get(k); };
        for (const br of mags) for (const bq of mags) {
          // apart: both to the same side of their own direction, or one straight and the other bent
          if (br === 0 && bq === 0) continue;
          if (br && bq && Math.sign(br) !== Math.sign(bq)) continue;
          if (br && bq && br !== bq && Math.abs(Math.abs(br) - Math.abs(bq)) > 30) continue;
          const a = gOf(r, br), b = gOf(q, bq);
          const c = cost(r, a.pts, br) + cost(q, b.pts, bq) + 12 * Geo.polyCross(a.pts, b.pts) + (br && bq ? 0 : 0.3);
          if (!best || c < best.c - 0.05) best = { c, br, bq, a, b };
        }
        r.bend = best.br; q.bend = best.bq; r.geom = best.a.g; r.pts = best.a.pts; q.geom = best.b.g; q.pts = best.b.pts;
      }
    }
    // self-loops: the direction farthest from the edges at that state, and clear of other states
    for (const e of es.filter((x) => x.from === x.to)) {
      const p = pos[e.from], sz = sizes[e.from];
      const dirs = [];
      for (const r of out) {
        if (r.from === e.from) { const q = r.pts[Math.min(2, r.pts.length - 1)]; dirs.push(Math.atan2(q.y - p.y, q.x - p.x)); }
        if (r.to === e.from) { const q = r.pts[Math.max(0, r.pts.length - 3)]; dirs.push(Math.atan2(q.y - p.y, q.x - p.x)); }
      }
      if (opts.startDir !== undefined && e.from === m.start) dirs.push(opts.startDir);
      let best = null;
      for (let k = 0; k < 8; k++) {
        const th = -Math.PI / 2 + k * Math.PI / 4;
        let gap = Math.PI;
        for (const d of dirs) { let x = Math.abs(th - d) % (2 * Math.PI); if (x > Math.PI) x = 2 * Math.PI - x; gap = Math.min(gap, x); }
        const g = Geo.edge(shapeAt(p, sz), null, { loop: th });
        const pts = Geo.sample(g, 32);
        let s = -gap * 10 + (k === 0 ? -1.2 : k === 4 ? -0.6 : 0);
        for (const sb of stateBoxes) if (sb.q !== e.from && Geo.polyBox(pts, sb.b)) s += 100;
        for (const r of out) s += 15 * Geo.polyCross(pts, r.pts);
        // and room for its label at the far end of the loop
        const lines = String(e.label).split('\n'), lw = Math.max(...lines.map((l) => Geo.textWidth(l, LABEL))) + 8, lh = lines.length * LABEL * 1.2 + 4;
        const apex = g.at(0.5), off = Math.abs(g.dir.x) * lw / 2 + Math.abs(g.dir.y) * lh / 2 + 4;
        const lb = { x: apex.x + g.dir.x * off - lw / 2, y: apex.y + g.dir.y * off - lh / 2, w: lw, h: lh };
        for (const r of out) if (Geo.polyBox(r.pts, lb)) s += 25;
        for (const sb of stateBoxes) if (Geo.boxHit(lb, sb.b, 2)) s += 8;
        if (!best || s < best.s) best = { s, th, g, pts };
      }
      const r = { from: e.from, to: e.to, label: e.label, loop: best.th, geom: best.g, pts: best.pts };
      out.push(r);
    }
    // labels: the spot along each edge, either side, with the fewest collisions
    const labelBoxes = [];
    const extra = (opts.avoid || []).slice();
    for (const r of out) {
      const lines = String(r.label).split('\n');
      const w = Math.max(...lines.map((l) => Geo.textWidth(l, LABEL))) + 8, h = lines.length * LABEL * 1.2 + 4;
      const cands = [];
      if (r.loop !== undefined) {
        const g = r.geom, apex = g.at(0.5), d = g.dir;
        const off = Math.abs(d.x) * w / 2 + Math.abs(d.y) * h / 2 + 4;
        cands.push({ x: apex.x + d.x * off, y: apex.y + d.y * off, pen: 0 }, { x: apex.x + d.x * (off + 10), y: apex.y + d.y * (off + 10), pen: 1.5 });
        for (const t of [0.3, 0.7]) { const p = g.at(t), dd = { x: p.x - pos[r.from].x, y: p.y - pos[r.from].y }, l = Math.hypot(dd.x, dd.y) || 1; const o2 = Math.abs(dd.x / l) * w / 2 + Math.abs(dd.y / l) * h / 2 + 4; cands.push({ x: p.x + dd.x / l * o2, y: p.y + dd.y / l * o2, pen: 2 }); }
      } else {
        const g = r.geom;
        const pref = r.bend ? Math.sign(r.bend) : (g.tan(0.5).x >= 0 ? 1 : -1);
        for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78, 0.15, 0.85]) for (const side of [pref, -pref]) for (const more of [0, 12]) {
          const p = g.at(t), tn = g.tan(t);
          const nx = tn.y * side, ny = -tn.x * side;   // side +1: the left of the direction of travel
          const off = Math.abs(nx) * w / 2 + Math.abs(ny) * h / 2 + 4 + more;
          cands.push({ x: p.x + nx * off, y: p.y + ny * off, pen: Math.abs(t - 0.5) * 6 + (side === pref ? 0 : 1.5) + more / 6 });
        }
      }
      let best = null;
      for (const c of cands) {
        const b = { x: c.x - w / 2, y: c.y - h / 2, w, h };
        let s = c.pen;
        for (const sb of stateBoxes) if (Geo.boxHit(b, sb.b, 2)) s += 200;
        for (const lb of labelBoxes) if (Geo.boxHit(b, lb, 3)) s += 200;
        for (const x of extra) if (Geo.boxHit(b, x, 3)) s += 150;
        for (const o of out) if (Geo.polyBox(o.pts, { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 })) s += o === r ? 120 : 60;
        if (!best || s < best.s) best = { s, c, b };
      }
      r.lx = best.c.x; r.ly = best.c.y;
      labelBoxes.push(best.b);
    }
    return out;
  };

  /** Where the start arrow comes from: the side of the start state with the most room */
  function startDir(m, pos, sizes, routes) {
    const p = pos[m.start];
    if (!p) return Math.PI;
    let best = null;
    for (const th of [Math.PI, -Math.PI / 2, Math.PI / 2, -3 * Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, Math.PI / 4, 0]) {
      const len = Math.max(sizes[m.start].w, sizes[m.start].h) / 2 + 44;
      const a = { x: p.x + Math.cos(th) * len, y: p.y + Math.sin(th) * len };
      const seg = [a, { x: p.x + Math.cos(th) * sizes[m.start].w / 2, y: p.y + Math.sin(th) * sizes[m.start].h / 2 }];
      let s = th === Math.PI ? 0 : 1;
      for (const q of m.states) if (q !== m.start && Geo.polyBox(seg, boxOf(pos[q], sizes[q], 8))) s += 100;
      for (const r of routes || []) { if (Geo.polyCross(seg, r.pts)) s += 50; if (r.lx !== undefined && Geo.polyBox(seg, Geo.labelBox(r.label, r.lx, r.ly, LABEL))) s += 50; if (Geo.polyBox(r.pts, { x: Math.min(seg[0].x, seg[1].x) - 4, y: Math.min(seg[0].y, seg[1].y) - 4, w: Math.abs(seg[0].x - seg[1].x) + 8, h: Math.abs(seg[0].y - seg[1].y) + 8 })) s += 20; }
      if (!best || s < best.s) best = { s, th, a };
    }
    return best;
  }

  /**
   * Draw a machine. opts: {prefix, pos (else laid out), layout: layout options, active: [q], taken: ['p>q'] or
   *   [{from, to}], dead: [q], dim: [q], hot: [q], good: [q], bad: [q], cls: {q: classes}, edgeCls: {'p>q': classes},
   *   sub: {q: text under it}, boxes: {q: [lines]}, labelOf(q), merged: {newQ: [old states]}, from: {q: key it grows
   *   out of}, hideStart, enter, x, y (offset), avoid: [boxes labels must keep clear of]}
   * Returns {items, exits, pos, routes, box}.
   */
  const routeCache = new Map();
  G.draw = function (m, opts) {
    m = G.machine(m);
    opts = opts || {};
    const P = opts.prefix || 'g';
    const sizes = sizesOf(m, opts);
    let pos = opts.pos;
    if (!pos || m.states.some((q) => !pos[q])) pos = G.layout(m, Object.assign({}, opts.layout || {}, { boxes: opts.boxes, labelOf: opts.labelOf, fixed: pos })).pos;
    if (opts.x || opts.y) { const p2 = {}; for (const q of m.states) p2[q] = { x: pos[q].x + (opts.x || 0), y: pos[q].y + (opts.y || 0) }; pos = p2; }
    const set = (a) => new Set([].concat(a || []).map(String));
    const active = set(opts.active), dead = set(opts.dead), dim = set(opts.dim), hot = set(opts.hot), good = set(opts.good), bad = set(opts.bad);
    const taken = new Set([].concat(opts.taken || []).map((t) => (typeof t === 'string' ? t : t.from + '>' + t.to)));
    const items = [], exits = {};
    const sk = (q) => P + ':s:' + q;
    // a first pass to find where the start arrow goes, so loops avoid it
    // a text under a state (its code) is kept clear like a state
    const subs = opts.sub ? m.states.filter((q) => opts.sub[q] !== undefined && opts.sub[q] !== '').map((q) => Geo.labelBox(opts.sub[q], pos[q].x, pos[q].y + sizes[q].h / 2 + SUB_DY - 5, SUB, { mono: true })) : [];
    const obst = subs.concat(opts.obstacles || []);
    // routing is the slow part, and a run draws the same machine many times: keep it per placement
    const ck = JSON.stringify([m.trans.map((t) => t.from + '>' + t.to + ':' + t.label), m.states.map((q) => [q, pos[q].x, pos[q].y, sizes[q].w]), obst, opts.avoid || null, !!opts.hideStart]);
    let hit = routeCache.get(ck);
    if (!hit) {
      let routes = G.route(m, pos, sizes, { avoid: opts.avoid, obstacles: obst });
      const sd0 = m.start && !opts.hideStart ? startDir(m, pos, sizes, routes.filter((r) => r.loop === undefined || r.from !== m.start)) : null;
      if (sd0 && routes.some((r) => r.loop !== undefined && r.from === m.start)) routes = G.route(m, pos, sizes, { startDir: sd0.th, avoid: opts.avoid, obstacles: obst });
      hit = { routes, sd: sd0 };
      if (routeCache.size > 400) routeCache.clear();
      routeCache.set(ck, hit);
    }
    const routes = hit.routes, sd = hit.sd;
    const accept = new Set(m.accept || []);
    for (const q of m.states) {
      const sz = sizes[q];
      const cls = ['state', active.has(q) ? 'active' : '', dead.has(q) ? 'dead' : '', hot.has(q) ? 'hot' : '', good.has(q) ? 'good' : '', bad.has(q) ? 'bad' : '', opts.boxes && opts.boxes[q] ? 'set' : '', opts.cls && opts.cls[q] ? opts.cls[q] : ''].filter(Boolean).join(' ');
      const it = { key: sk(q), kind: 'state', x: pos[q].x, y: pos[q].y, w: sz.w, h: sz.h, rx: sz.rx, lines: sz.lines, accept: accept.has(q), cls, dim: dim.has(q) || dead.has(q), pick: true, title: q };
      if (sz.lines.length > 1) it.size = 14;
      // the text under a state (its code, its output) is a text of its own, at a size that stays readable
      if (opts.sub && opts.sub[q] !== undefined && opts.sub[q] !== '') items.push({ key: sk(q) + ':sub', kind: 'text', x: pos[q].x, y: pos[q].y + sz.h / 2 + (accept.has(q) ? 5 : 0) + SUB_DY, text: String(opts.sub[q]), anchor: 'middle', cls: 'st-subtext', size: SUB, mono: true, dim: dim.has(q) || dead.has(q) });
      if (opts.merged && opts.merged[q]) { it.enter = 'from'; it.src = opts.merged[q].map(sk); for (const old of opts.merged[q]) if (old !== q) exits[sk(old)] = { exit: 'into', into: sk(q) }; }
      if (opts.from && opts.from[q]) { it.enter = 'from'; it.src = [].concat(opts.from[q]); }
      if (opts.enter && !it.enter) it.enter = opts.enter;
      items.push(it);
    }
    for (const r of routes) {
      const k = r.from + '>' + r.to;
      const cls = ['tr', taken.has(k) ? 'taken' : '', dead.has(r.from) || dead.has(r.to) ? 'dead' : '', opts.edgeCls && opts.edgeCls[k] ? opts.edgeCls[k] : ''].filter(Boolean).join(' ');
      items.push({ key: P + ':e:' + k, kind: 'edge', from: sk(r.from), to: sk(r.to), bend: r.bend || 0, loop: r.loop, label: r.label, lx: r.lx, ly: r.ly, cls, labelCls: taken.has(k) ? 'hot' : '', dim: dead.has(r.from) || dead.has(r.to), size: LABEL });
    }
    if (sd) {
      const p = pos[m.start];
      items.push({ key: P + ':start', kind: 'edge', from: { x: sd.a.x, y: sd.a.y }, to: sk(m.start), cls: 'start-arrow' + (opts.startHot ? ' taken' : '') });
      items.push({ key: P + ':startDot', kind: 'token', x: sd.a.x, y: sd.a.y, r: 3.2, cls: 'start-dot', audit: 'ignore' });
      void p;
    }
    const boxes = m.states.map((q) => boxOf(pos[q], sizes[q], accept.has(q) ? 5 : 0)).concat(routes.map((r) => Geo.labelBox(r.label, r.lx, r.ly, LABEL)));
    return { items, exits, pos, routes, box: Geo.union(boxes) };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});

