// The schematic layout engine. Given a netlist it places the parts and routes the wires:
//  - levels from inputs (left) to outputs (right); the edges that close a loop (a flip-flop's output fed back,
//    a latch's cross-coupling) are found and set aside, so a loop never pushes parts rightwards;
//  - long wires and fed-back wires get placeholders in the columns they pass, so they have room there;
//  - the parts of each column are ordered to cut crossings (barycentre sweeps, then swaps), and the inputs of
//    AND, OR, XOR and their inverses are matched to their sources top to bottom;
//  - each column is placed vertically so that pins line up with what they connect to, for straight wires;
//  - channels between columns are as wide as the wires that must turn in them;
//  - wires are routed on the grid (route.js), then net names and bus widths are put where they fit.
// Circuits that fit a drafter's idiom (literal rails, a tree, bit slices, a state machine, a datapath) are drawn by
// styles.js instead; their drawings are checked by verify.js and fall back to this general layout if they fail.
// Here too a latch's two gates are drawn as the familiar X, a gate is stretched to meet inputs on far-apart rows,
// and a clock can be asked for as rails. The result is plain geometry in pixels, which render.js draws and
// verify.js checks.
(function (S) {
  'use strict';
  const L = S.Layout = {};
  const Sym = S.Symbols, Nl = S.Netlist, U = Sym.U;
  const DIRS = { right: 0, bottom: 1, left: 2, top: 3 };

  function layout(circuit, opts) {
    opts = opts || {};
    const parts = circuit.parts, P = parts.length;
    const pidx = new Map(parts.map((p, i) => [p, i]));
    const geo = parts.map((p) => Sym.geom(p));
    const pinDef = (r) => r.part.pins.find((q) => q.name === r.pin);
    const nets = circuit.nets.filter((n) => n.pins.length >= 2).map((n, i) => {
      const drv = n.pins.find((r) => pinDef(r).dir === 'out');
      return { i, net: n, drv, sinks: n.pins.filter((r) => r !== drv) };
    });
    const isPort = (i) => ['IN', 'CLOCK'].includes(parts[i].type);
    const isOut = (i) => parts[i].type === 'OUT';

    // ---- loops ------------------------------------------------------------------------------------------------
    // a constant feeding one input sits right beside it, outside the columns
    const attached = new Map(); // part index → its sink
    for (const n of nets) {
      if (n.drv.part.type !== 'CONST' || n.sinks.length !== 1) continue;
      const s0 = n.sinks[0], g = Sym.geom(s0.part).pins[s0.pin];
      if (g.side !== 'left' || Nl.COMMUTATIVE.has(s0.part.type)) continue;
      if ([...attached.values()].some((o) => o.part === s0.part && Math.abs(Sym.geom(o.part).pins[o.pin].y - g.y) < 4)) continue;
      attached.set(pidx.get(n.drv.part), s0);
    }
    const E = [];
    for (const n of nets) if (!attached.has(pidx.get(n.drv.part))) for (const s of n.sinks) E.push({ u: pidx.get(n.drv.part), v: pidx.get(s.part), ni: n.i, sink: s });
    const fb = new Set(), pe = new Set(), pairOf = new Int32Array(P).fill(-1);
    const live = (e) => !fb.has(e) && !pe.has(e);
    E.forEach((e, k) => { if (e.u === e.v) fb.add(k); });
    // two gates that feed each other (a latch) stand side by side in one column, as a pair
    for (const e of E) {
      if (e.u === e.v || pairOf[e.u] >= 0 || pairOf[e.v] >= 0) continue;
      if (!Nl.GATES.has(parts[e.u].type) || !Nl.GATES.has(parts[e.v].type)) continue;
      if (E.some((f) => f.u === e.v && f.v === e.u)) { pairOf[e.u] = e.v; pairOf[e.v] = e.u; }
    }
    const grp = (i) => (pairOf[i] >= 0 ? Math.min(i, pairOf[i]) : i);
    E.forEach((e, k) => { if (grp(e.u) === grp(e.v) && e.u !== e.v) pe.add(k); });
    function sccs() {
      const adj = Array.from({ length: P }, () => []);
      E.forEach((e, k) => { if (live(k)) adj[grp(e.u)].push(grp(e.v)); });
      let index = 0; const ix = new Int32Array(P).fill(-1), low = new Int32Array(P), on = new Uint8Array(P), st = [], out = [];
      for (let s = 0; s < P; s++) {
        if (ix[s] >= 0 || grp(s) !== s) continue;
        const stack = [[s, 0]]; ix[s] = low[s] = index++; st.push(s); on[s] = 1;
        while (stack.length) {
          const top = stack[stack.length - 1], v = top[0];
          if (top[1] < adj[v].length) {
            const w = adj[v][top[1]++];
            if (ix[w] < 0) { ix[w] = low[w] = index++; st.push(w); on[w] = 1; stack.push([w, 0]); }
            else if (on[w]) low[v] = Math.min(low[v], ix[w]);
          } else {
            stack.pop();
            if (stack.length) low[stack[stack.length - 1][0]] = Math.min(low[stack[stack.length - 1][0]], low[v]);
            if (low[v] === ix[v]) { const c = []; let w; do { w = st.pop(); on[w] = 0; c.push(w); } while (w !== v); out.push(c); }
          }
        }
      }
      return out;
    }
    // each loop is cut where it costs least: an ordering of its parts (greedy feedback arc set, weighted so a
    // flip-flop's output is the cheapest edge to turn back), and the edges that run against it are fed back
    const loops = sccs().filter((c) => c.length > 1);
    for (const comp of loops) {
      const inC = new Set(comp);
      const inner = E.map((e, k) => k).filter((k) => live(k) && inC.has(grp(E[k].u)) && inC.has(grp(E[k].v)));
      const entry = new Set(comp.filter((g) => E.some((e, k) => live(k) && grp(e.v) === g && !inC.has(grp(e.u)))));
      // a flip-flop's output is the cheapest edge to turn back, then an edge into a gate the loop is entered by
      const wt = (k) => (Nl.isSequential(parts[E[k].u]) ? 1 : entry.has(grp(E[k].v)) ? 6 : 25);
      const left = [], right = [], rest = new Set(comp);
      while (rest.size) {
        let moved = true;
        while (moved) {
          moved = false;
          for (const v of [...rest]) if (!inner.some((k) => grp(E[k].u) === v && rest.has(grp(E[k].v)))) { right.unshift(v); rest.delete(v); moved = true; }
          for (const v of [...rest]) if (!inner.some((k) => grp(E[k].v) === v && rest.has(grp(E[k].u)))) { left.push(v); rest.delete(v); moved = true; }
        }
        if (!rest.size) break;
        let best = null, bd = -Infinity;
        for (const v of [...rest].sort((x, y) => x - y)) {
          let d = 0;
          for (const k of inner) { if (!rest.has(grp(E[k].u)) || !rest.has(grp(E[k].v))) continue; if (grp(E[k].u) === v) d += wt(k); if (grp(E[k].v) === v) d -= wt(k); }
          d += entry.has(v) ? 0.5 : 0;
          if (d > bd) { bd = d; best = v; }
        }
        left.push(best); rest.delete(best);
      }
      const at = new Map(left.concat(right).map((g, i) => [g, i]));
      for (const k of inner) if (at.get(grp(E[k].u)) >= at.get(grp(E[k].v))) fb.add(k);
    }

    // ---- levels -----------------------------------------------------------------------------------------------
    const preds = Array.from({ length: P }, () => []), succs = Array.from({ length: P }, () => []);
    E.forEach((e, k) => { if (live(k)) { preds[grp(e.v)].push(grp(e.u)); succs[grp(e.u)].push(grp(e.v)); } });
    const groups = [...new Set(parts.map((_, i) => grp(i)))];
    const indeg = new Map(groups.map((g) => [g, 0]));
    for (const g of groups) for (const s of succs[g]) indeg.set(s, indeg.get(s) + 1);
    const topo = [], queue = groups.filter((g) => indeg.get(g) === 0);
    while (queue.length) { const g = queue.shift(); topo.push(g); for (const s of succs[g]) { indeg.set(s, indeg.get(s) - 1); if (!indeg.get(s)) queue.push(s); } }
    const lev = new Int32Array(P), lb = new Int32Array(P);
    let maxL = 0;
    function levels() {
      for (const g of topo) {
        if (isPort(g) || isOut(g)) { lev[g] = 0; continue; }
        let l = Math.max(1, lb[g]);
        for (const p of preds[g]) if (!isOut(p)) l = Math.max(l, lev[p] + 1);
        lev[g] = l;
      }
      for (const g of topo.slice().reverse()) {
        if (isPort(g) || isOut(g)) continue;
        const ss = succs[g].filter((x) => !isOut(x));
        if (ss.length) lev[g] = Math.max(lev[g], Math.min(...ss.map((x) => lev[x])) - 1);
      }
      maxL = 0;
      for (const g of groups) if (!isOut(g) && !attached.has(g)) maxL = Math.max(maxL, lev[g]);
      // what drives only outputs goes to the last column, and what feeds only that follows it
      for (let pass = 0; pass < 2; pass++) for (const g of topo.slice().reverse()) {
        if (isPort(g) || isOut(g) || attached.has(g)) continue;
        const ss = succs[g];
        if (!ss.length) continue;
        const inner = ss.filter((x) => !isOut(x));
        const want = inner.length ? Math.min(...inner.map((x) => lev[x])) - 1 : maxL;
        if (want > lev[g]) lev[g] = want;
      }
    }
    levels();
    // a loop through logic whose flip-flops still fall in several columns is drawn the usual way instead: every
    // flip-flop output in it is fed back, so the logic stands in one column and the flip-flops in the next
    let recut = false;
    for (const comp of loops) {
      const ffs = comp.filter((g) => Nl.isSequential(parts[g]));
      if (ffs.length < 2 || ffs.length === comp.length || new Set(ffs.map((f) => lev[f])).size < 2) continue;
      const inC = new Set(comp), inside = (e) => inC.has(grp(e.u)) && inC.has(grp(e.v)) && e.u !== e.v;
      const restore = [];
      E.forEach((e, k) => {
        if (!inside(e) || pe.has(k)) return;
        if (Nl.isSequential(parts[e.u])) fb.add(k);
        else if (fb.has(k)) { fb.delete(k); restore.push(k); }
      });
      // logic that still loops on itself keeps the cuts it had
      if (sccs().some((c) => c.length > 1 && c.some((g) => inC.has(g)))) restore.forEach((k) => fb.add(k));
      recut = true;
    }
    if (recut) {
      for (const g of groups) { preds[g] = []; succs[g] = []; }
      E.forEach((e, k) => { if (live(k)) { preds[grp(e.v)].push(grp(e.u)); succs[grp(e.u)].push(grp(e.v)); } });
      const deg = new Map(groups.map((g) => [g, 0]));
      for (const g of groups) for (const x of succs[g]) deg.set(x, deg.get(x) + 1);
      topo.length = 0;
      const q2 = groups.filter((g) => deg.get(g) === 0);
      while (q2.length) { const g = q2.shift(); topo.push(g); for (const x of succs[g]) { deg.set(x, deg.get(x) - 1); if (!deg.get(x)) q2.push(x); } }
      levels();
    }
    // the flip-flops of one state register share a column, when none feeds another directly
    for (const comp of loops) {
      const ffs = comp.filter((g) => Nl.isSequential(parts[g]));
      if (ffs.length < 2) continue;
      const reach = (from) => { const seen = new Set([from]), st = [from]; while (st.length) { const v = st.pop(); for (const w of succs[v]) if (!seen.has(w)) { seen.add(w); st.push(w); } } return seen; };
      if (ffs.some((f) => { const r = reach(f); return ffs.some((g) => g !== f && r.has(g)); })) continue;
      const L = Math.max(...ffs.map((f) => lev[f]));
      for (const f of ffs) lb[f] = L;
      levels();
    }
    for (let i = 0; i < P; i++) lev[i] = lev[grp(i)];
    for (let i = 0; i < P; i++) if (isOut(i)) lev[i] = maxL + 1;
    const NCOL = maxL + 2;

    // ---- items: parts and the placeholders of wires passing a column --------------------------------------------
    const items = [], cols = Array.from({ length: NCOL }, () => []);
    const mk = (it) => { it.id = items.length; items.push(it); cols[it.col].push(it); return it; };
    const pitem = parts.map((p, i) => (attached.has(i) ? null : mk({ k: 'p', i, col: lev[i], w: geo[i].w, h: geo[i].h, top: 0 })));
    const links = [];
    const link = (a, ap, b, bp, w, ni, same) => links.push({ a, ap, b, bp, w, ni, same: !!same });
    const fbNet = new Set();
    for (const n of nets) {
      const di = pidx.get(n.drv.part), dc = lev[di], dp = pitem[di];
      if (!dp) continue;
      const fwd = [], back = [];
      for (const s of n.sinks) {
        const si = pidx.get(s.part);
        if (pairOf[di] === si || (di === si)) { if (di !== si) link(dp, n.drv.pin, pitem[si], s.pin, 0.3, n.i, true); else back.push(s); continue; }
        (lev[si] > dc ? fwd : back).push(s);
      }
      const fan = n.sinks.length;
      if (fwd.length) {
        const far = Math.max(...fwd.map((s) => lev[pidx.get(s.part)]));
        let prev = dp, pp = n.drv.pin;
        for (let k = dc + 1; k <= far; k++) {
          for (const s of fwd) if (lev[pidx.get(s.part)] === k) {
            const si = pidx.get(s.part);
            link(prev, pp, pitem[si], s.pin, isOut(si) ? (opts.outW || 4) : prev.k === 'd' ? 2 : 1 / Math.sqrt(fan), n.i);
          }
          if (k < far) { const d = mk({ k: 'd', ni: n.i, col: k, w: 0, h: 0, top: 0 }); link(prev, pp, d, null, prev.k === 'd' ? 3 : 2, n.i); prev = d; pp = null; }
        }
      }
      if (back.length) {
        fbNet.add(n.i);
        const lo = Math.min(...back.map((s) => lev[pidx.get(s.part)]));
        const chain = {};
        for (let k = lo; k <= dc; k++) chain[k] = mk({ k: 'd', ni: n.i, col: k, w: 0, h: 0, top: 0, fb: true });
        for (let k = lo; k < dc; k++) link(chain[k], null, chain[k + 1], null, 3, n.i);
        link(chain[dc], null, dp, n.drv.pin, 0.6, n.i, true);
        for (const s of back) link(chain[lev[pidx.get(s.part)]], null, pitem[pidx.get(s.part)], s.pin, 0.6, n.i, true);
      }
    }
    // the inputs of a commutative gate may be swapped: phys[i][logical pin] = the pin it is drawn at
    const phys = parts.map((p) => (Nl.COMMUTATIVE.has(p.type) ? Object.fromEntries(p.pins.filter((q) => q.dir === 'in').map((q) => [q.name, q.name])) : null));
    const off = (it, pin) => (it.k === 'd' ? 0 : geo[it.i].pins[phys[it.i] && phys[it.i][pin] ? phys[it.i][pin] : pin].y);
    const pos = (it, pin) => it.top + off(it, pin);
    const sideOf = (i, side) => parts[i].pins.some((q) => geo[i].pins[q.name].side === side && (parts[i].net[q.name] || false));

    function sep(a, b) {
      if (a.k === 'd' && b.k === 'd') return 2;
      if (a.k === 'd') return 2 + (sideOf(b.i, 'top') ? 2 : 0);
      if (b.k === 'd') return 2 + (sideOf(a.i, 'bottom') ? 2 : 0);
      if (pairOf[a.i] === b.i) return 8;
      if ((isPort(a.i) && isPort(b.i)) || (isOut(a.i) && isOut(b.i))) return 2;
      return 4 + (sideOf(a.i, 'bottom') ? 2 : 0) + (sideOf(b.i, 'top') ? 2 : 0);
    }
    const stack = (col) => { let y = 0; col.forEach((it, j) => { if (j) y += col[j - 1].h + sep(col[j - 1], it); it.top = y; }); };

    // ---- order ------------------------------------------------------------------------------------------------
    const adjL = links.filter((l) => !l.same);
    const byChan = Array.from({ length: NCOL }, () => []);
    for (const l of adjL) byChan[l.a.col].push(l);
    function crossChan(k) {
      const ls = byChan[k] || [];
      let x = 0;
      for (let i = 0; i < ls.length; i++) {
        const a = ls[i], pa = pos(a.a, a.ap), pb = pos(a.b, a.bp);
        for (let j = i + 1; j < ls.length; j++) {
          const b = ls[j];
          if (b.ni === a.ni) continue;
          if ((pa - pos(b.a, b.ap)) * (pb - pos(b.b, b.bp)) < 0) x++;
        }
      }
      return x;
    }
    const crossAll = () => { let x = 0; for (let k = 0; k < NCOL - 1; k++) x += crossChan(k); return x; };
    let pairsFixed = false;
    function assignPins() {
      // a commutative gate's inputs, top to bottom, in the order of what drives them
      for (let i = 0; i < P; i++) {
        if (!phys[i] || (pairsFixed && pairOf[i] >= 0)) continue;
        const it = pitem[i];
        const src = parts[i].pins.filter((q) => q.dir === 'in').map((q) => {
          const ls = links.filter((l) => l.b === it && l.bp === q.name);
          const y = ls.length ? ls.reduce((s, l) => s + pos(l.a, l.ap), 0) / ls.length : 0;
          return { name: q.name, y, net: parts[i].net[q.name] };
        });
        const slots = src.map((s) => s.name).sort((a, b) => geo[i].pins[a].y - geo[i].pins[b].y);
        src.sort((a, b) => a.y - b.y || (a.net && b.net ? a.net.id.localeCompare(b.net.id) : 0));
        src.forEach((s, j) => { phys[i][s.name] = slots[j]; });
      }
    }
    // a first order: as the parts were declared, or (for the other candidates) shuffled
    if (opts.seed) {
      let t = opts.seed * 2654435761 >>> 0;
      const rnd = () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
      for (let k = 1; k < NCOL - 1; k++) { const c = cols[k]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } }
    }
    cols.forEach(stack);
    const isOutItem = (it) => it.k === 'p' && isOut(it.i);
    // the input and output ports keep the order they were declared in, unless the circuit frees them
    const fixedCol = (k) => !circuit.freePorts && (k === 0 || (k === NCOL - 1 && !opts.freeOut)) && cols[k].every((it) => it.k === 'p' && (isPort(it.i) || isOut(it.i)));
    function sweep(k, down, damp) {
      if (fixedCol(k)) return;
      const col = cols[k];
      const want = new Map();
      for (const it of col) {
        let s = 0, w = 0;
        for (const l of links) {
          let other = null, myPin, oPin;
          if (l.b === it && (l.same || l.a.col === (down ? k - 1 : k + 1))) { other = l.a; myPin = l.bp; oPin = l.ap; }
          else if (l.a === it && (l.same || l.b.col === (down ? k - 1 : k + 1))) { other = l.b; myPin = l.ap; oPin = l.bp; }
          if (!other) continue;
          const ww = l.same ? 0.5 : 1;
          s += ww * (pos(other, oPin) - off(it, myPin)); w += ww;
        }
        const cur = it.top;
        want.set(it, (w ? (s / w) * (1 - damp) + cur * damp : cur) + it.h / 2);
      }
      col.sort((a, b) => want.get(a) - want.get(b));
      stack(col);
    }
    let best = { x: crossAll(), order: cols.map((c) => c.slice()), phys: JSON.stringify(phys) };
    const keep = () => { const x = crossAll(); if (x < best.x) best = { x, order: cols.map((c) => c.slice()), phys: JSON.stringify(phys) }; };
    for (let it = 0; it < 16 && best.x > 0; it++) {
      const down = it % 2 === 0;
      if (down) for (let k = 1; k < NCOL; k++) sweep(k, true, 0);
      else for (let k = NCOL - 2; k >= 0; k--) sweep(k, false, 0);
      assignPins(); cols.forEach(stack);
      keep();
    }
    const restore = () => { best.order.forEach((o, k) => { cols[k] = o.slice(); }); const ph = JSON.parse(best.phys); ph.forEach((m, i) => { phys[i] = m; }); cols.forEach(stack); };
    restore();
    // adjacent swaps while they help
    for (let pass = 0; pass < 8; pass++) {
      let better = false;
      for (let k = 0; k < NCOL; k++) {
        const col = cols[k];
        if (fixedCol(k)) continue;
        for (let j = 0; j + 1 < col.length; j++) {
          const before = (k ? crossChan(k - 1) : 0) + crossChan(k);
          [col[j], col[j + 1]] = [col[j + 1], col[j]]; stack(col); assignPins();
          const after = (k ? crossChan(k - 1) : 0) + crossChan(k);
          if (after < before) better = true;
          else { [col[j], col[j + 1]] = [col[j + 1], col[j]]; stack(col); assignPins(); }
        }
      }
      if (!better) break;
    }
    // what feeds only outputs stands in the order of the outputs it feeds, so no wires cross on the way out
    if (NCOL >= 3 && fixedCol(NCOL - 1)) {
      const k = NCOL - 2, col = cols[k], outCol = cols[NCOL - 1];
      const target = (it) => { const ls = links.filter((l) => l.a === it && !l.same); return ls.length && ls.every((l) => isOutItem(l.b)) ? Math.min(...ls.map((l) => outCol.indexOf(l.b))) : -1; };
      const slots = col.map((it, j) => (target(it) >= 0 ? j : -1)).filter((j) => j >= 0);
      const movers = slots.map((j) => col[j]).sort((a, b) => target(a) - target(b));
      slots.forEach((j, n) => { col[j] = movers[n]; });
      stack(col); assignPins();
    }
    assignPins();
    // a latch: its two gates one above the other, the upper gate's lowest input and the lower gate's highest
    // input taking the feedback, so the two feedback wires cross once between them, in the familiar X
    const pairs = [];
    const fbPin = (g, other) => parts[g].pins.filter((q) => q.dir === 'in').map((q) => q.name).find((nm) => { const n = parts[g].net[nm]; return n && n.pins.some((r) => r.part === parts[other] && r.part.pins.find((q) => q.name === r.pin).dir === 'out'); });
    for (let i = 0; i < P; i++) {
      if (!(pairOf[i] > i) || !pitem[i] || !pitem[pairOf[i]] || !phys[i] || !phys[pairOf[i]]) continue;
      const a = pitem[i], b = pitem[pairOf[i]], col = cols[a.col];
      const [t, u] = col.indexOf(a) < col.indexOf(b) ? [a, b] : [b, a];
      col.splice(col.indexOf(u), 1); col.splice(col.indexOf(t) + 1, 0, u);
      const fT = fbPin(t.i, u.i), fU = fbPin(u.i, t.i);
      if (!fT || !fU) continue;
      const order = (g, fb, first) => { const ins = parts[g].pins.filter((q) => q.dir === 'in').map((q) => q.name).filter((nm) => nm !== fb); const all = first ? [fb].concat(ins) : ins.concat([fb]); all.forEach((nm, k) => { phys[g][nm] = 'i' + k; }); };
      order(t.i, fT, false); order(u.i, fU, true);
      pairs.push({ T: t.i, B: u.i, fT, fU });
    }
    if (pairs.length) { pairsFixed = true; cols.forEach(stack); }

    // ---- vertical positions: line pins up with what they connect to --------------------------------------------
    // mode 'mean' pulls each part to the weighted mean of what it connects to (springs, which keeps the drawing
    // compact); mode 'median' to the weighted median (which lines pins up exactly, for straight wires)
    const pinSide = (it, pin) => (it.k === 'd' ? null : geo[it.i].pins[phys[it.i] && phys[it.i][pin] ? phys[it.i][pin] : pin].side);
    function placeCol(k, mode) {
      const col = cols[k];
      if (!col.length) return;
      const want = col.map((it) => {
        const ts = [];
        for (const l of links) {
          // a wire passing a column, or an output port, follows its source more than it pulls on it
          // a pin on the top or bottom of a part is entered from above or below: no reason to line up with it
          const follow = it.k === 'd' || isOutItem(it);
          const vert = (x, p) => { const sd = pinSide(x, p); return sd === 'top' || sd === 'bottom'; };
          if (l.b === it) ts.push([pos(l.a, l.ap) - off(it, l.bp), l.w * (follow && !l.same ? 3 : 1) * (vert(l.b, l.bp) ? 0.02 : 1), true]);
          else if (l.a === it) ts.push([pos(l.b, l.bp) - off(it, l.ap), l.w * (it.k === 'd' && isOutItem(l.b) ? 0.25 : 1) * (vert(l.b, l.bp) ? 0.02 : 1)]);
        }
        // ports hold together as a column, where nothing pulls them apart
        if (it.k === 'p' && (isPort(it.i) || isOut(it.i))) {
          const j = col.indexOf(it);
          if (j > 0) ts.push([col[j - 1].top + col[j - 1].h + sep(col[j - 1], it), 0.15]);
          if (j + 1 < col.length) ts.push([col[j + 1].top - sep(it, col[j + 1]) - it.h, 0.15]);
        }
        if (!ts.length) return [it.top, 0.05];
        const tot = ts.reduce((s, t) => s + t[1], 0);
        if (mode === 'mean') return [ts.reduce((s, t) => s + t[0] * t[1], 0) / tot, tot];
        ts.sort((a, b) => a[0] - b[0]);
        let acc = 0, med = ts[0][0];
        // a tie between two sides is broken towards the inputs (one bend in the wire, not two half-bends)
        let tie = false;
        const oneIn = it.k === 'p' && parts[it.i].pins.filter((q) => q.dir === 'in').length === 1;
        for (const t of ts) {
          acc += t[1];
          if (acc >= tot / 2 - 1e-9) {
            med = t[0]; tie = Math.abs(acc - tot / 2) < 1e-9;
            const nx = ts[ts.indexOf(t) + 1];
            if (tie && nx) med = oneIn ? (nx[2] && !t[2] ? nx[0] : t[0]) : (t[0] + nx[0]) / 2;
            break;
          }
        }
        return [med, tot];
      });
      // isotonic regression with the minimum gaps (pool adjacent violators)
      const o = []; let acc = 0;
      col.forEach((it, j) => { if (j) acc += col[j - 1].h + sep(col[j - 1], it); o.push(acc); });
      const blocks = [];
      col.forEach((it, j) => {
        blocks.push({ v: want[j][0] - o[j], w: want[j][1], n: 1 });
        while (blocks.length > 1 && blocks[blocks.length - 2].v >= blocks[blocks.length - 1].v) {
          const b = blocks.pop(), a = blocks[blocks.length - 1];
          a.v = (a.v * a.w + b.v * b.w) / (a.w + b.w); a.w += b.w; a.n += b.n;
        }
      });
      let j = 0;
      for (const b of blocks) for (let t = 0; t < b.n; t++, j++) col[j].top = (mode === 'mean' ? b.v : Math.round(b.v)) + o[j];
    }
    const sweepAll = (it, mode) => { if (it % 2 === 0) for (let k = 0; k < NCOL; k++) placeCol(k, mode); else for (let k = NCOL - 1; k >= 0; k--) placeCol(k, mode); };
    for (let it = 0; it < 40; it++) { sweepAll(it, 'mean'); if (it % 8 === 7) assignPins(); }
    for (let it = 0; it < 16; it++) sweepAll(it, 'median');
    for (const it of items) it.top = Math.round(it.top);
    for (let k = 0; k < NCOL; k++) placeCol(k, 'median');

    // ---- channels: trunks and tracks for the forward nets; the rest go to the maze router ----------------------
    const colW = cols.map((c) => Math.max(0, ...c.map((it) => it.w)));
    const maze = new Set();
    for (const n of nets) {
      const di = pidx.get(n.drv.part);
      if (fbNet.has(n.i) || attached.has(di) || geo[di].pins[n.drv.pin].side !== 'right') maze.add(n.i);
      for (const s0 of n.sinks) if (Sym.geom(s0.part).pins[phys[pidx.get(s0.part)] && phys[pidx.get(s0.part)][s0.pin] ? phys[pidx.get(s0.part)][s0.pin] : s0.pin].side !== 'left') maze.add(n.i);
    }
    for (const l of links) if (l.same) maze.add(l.ni);
    // a clock (and its inverse), asked for as rails, is drawn by hand below everything
    const clockRails = [];
    if (circuit.hints && circuit.hints.clockRails) {
      for (const n of nets) if (n.drv.part.type === 'CLOCK') clockRails.push(n);
      for (const n of nets) if (n.drv.part.type === 'NOT' && clockRails.some((c) => c.sinks.some((r) => r.part === n.drv.part))) clockRails.push(n);
      for (const n of clockRails) maze.add(n.i);
    }
    // nudges: move a part or a passing wire a few rows up or down when that lets the channels on either side
    // cross less (as the channel router counts) without bending more wires
    function chanCost(k) {
      if (k < 0 || k >= NCOL - 1) return 0;
      const t = new Map();
      let bent = 0;
      for (const l of byChan[k]) {
        if (maze.has(l.ni)) continue;
        if (!t.has(l.ni)) t.set(l.ni, { L: new Set(), R: new Set() });
        const ya = pos(l.a, l.ap), yb = pos(l.b, l.bp);
        t.get(l.ni).L.add(ya); t.get(l.ni).R.add(yb);
        if (ya !== yb) bent += l.w;
      }
      const subs = [];
      let cramped = 0;
      for (const [ni, x] of t) {
        const sp = S.Channel.split([...x.L], [...x.R]);
        if (!sp.subs) continue;
        for (const q of sp.subs) subs.push(Object.assign({ net: ni }, q));
        // two branches one row apart on a trunk make two dots that run together
        const rows = [...new Set([...x.L, ...x.R])].sort((a, b) => a - b);
        for (let i = 1; i < rows.length; i++) if (rows[i] - rows[i - 1] === 1) cramped++;
      }
      const r = S.Channel.assign(subs);
      return r.crossings * 10 + r.dropped.length * 40 + bent * 0.5 + r.tracks * 0.2 + cramped * 4;
    }
    if (!opts.noNudge && items.length < 160) {
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (let k = 0; k < NCOL; k++) {
          const col = cols[k];
          for (let j = 0; j < col.length; j++) {
            const it = col[j];
            const lo = j ? col[j - 1].top + col[j - 1].h + sep(col[j - 1], it) : -Infinity;
            const hi = j + 1 < col.length ? col[j + 1].top - sep(it, col[j + 1]) - it.h : Infinity;
            const base = it.top, before = chanCost(k - 1) + chanCost(k);
            let bestTop = base, bestCost = before - 1e-9;
            for (const d of [-1, 1, -2, 2, -3, 3, -4, 4, -6, 6]) {
              const y = base + d;
              if (y < lo || y > hi) continue;
              it.top = y;
              const c = chanCost(k - 1) + chanCost(k) + Math.abs(d) * 0.05;
              if (c < bestCost) { bestCost = c; bestTop = y; }
            }
            it.top = bestTop;
            if (bestTop !== base) moved = true;
          }
        }
        if (!moved) break;
      }
    }
    // close bands that are empty in every column: everything below moves up together, so nothing that was
    // lined up stops being so; only the vertical wires through the band get shorter
    {
      const spans = items.map((it) => [it.top - (it.k === 'p' ? 2 : 1), it.top + it.h + (it.k === 'p' ? 2 : 1)]).sort((a, b) => a[0] - b[0]);
      const cuts = [];
      let end = spans.length ? spans[0][1] : 0;
      for (const [a, b] of spans) { if (a - end > 4) cuts.push([end, a - end - 4]); end = Math.max(end, b); }
      for (const [at, by] of cuts.reverse()) for (const it of items) if (it.top >= at) it.top -= by;
    }
    // a gate stretched so its inputs meet the rows they come in on (wider apart than its usual pitch), when that
    // straightens more wires than it bends and the gate still fits its column
    for (const it of items) {
      if (it.k !== 'p') continue;
      const i = it.i, p = parts[i];
      if (!Nl.COMMUTATIVE.has(p.type) || pairOf[i] >= 0 || !phys[i]) continue;
      const ins = p.pins.filter((q) => q.dir === 'in').map((q) => q.name);
      if (ins.length < 2) continue;
      const src = ins.map((nm) => { const ls = links.filter((l) => l.b === it && l.bp === nm && !l.same); return ls.length === 1 ? pos(ls[0].a, ls[0].ap) : null; });
      if (src.some((v) => v == null)) continue;
      const sorted = src.slice().sort((a, b) => a - b);
      if (sorted.some((v, k) => k && v - sorted[k - 1] < 2)) continue;
      const outLinks = links.filter((l) => l.a === it && !l.same);
      const straight = () => ins.filter((nm, k) => pos(it, nm) === src[k]).length + outLinks.filter((l) => pos(it, l.ap) === pos(l.b, l.bp)).length;
      const before = straight();
      const order = ins.map((nm, k) => [nm, src[k]]).sort((a, b) => a[1] - b[1]);
      const gv = Sym.variant(p, { inRows: order.map((o2) => o2[1]) });
      const col = cols[it.col], j = col.indexOf(it), prev = col[j - 1], next = col[j + 1];
      const keep = { g: geo[i], top: it.top, h: it.h, w: it.w, ph: Object.assign({}, phys[i]) };
      geo[i] = gv; it.top = gv.top; it.h = gv.h; it.w = gv.w;
      order.forEach(([nm], k) => { phys[i][nm] = 'i' + k; });
      const fits = (!prev || prev.top + prev.h + sep(prev, it) <= it.top) && (!next || it.top + it.h + sep(it, next) <= next.top);
      if (!fits || straight() <= before) { geo[i] = keep.g; it.top = keep.top; it.h = keep.h; it.w = keep.w; phys[i] = keep.ph; }
    }
    let chanRes;
    for (let round = 0; round < 8; round++) {
      const chan = Array.from({ length: NCOL }, () => new Map());
      for (const l of links) {
        if (l.same || maze.has(l.ni)) continue;
        const k = l.a.col;
        if (!chan[k].has(l.ni)) chan[k].set(l.ni, { L: new Set(), R: new Set() });
        chan[k].get(l.ni).L.add(pos(l.a, l.ap)); chan[k].get(l.ni).R.add(pos(l.b, l.bp));
      }
      chanRes = [];
      let dropped = false;
      for (let k = 0; k < NCOL; k++) {
        const subs = [], straight = [];
        for (const [ni, t] of chan[k]) {
          const sp = S.Channel.split([...t.L], [...t.R]);
          if (sp.straight != null) straight.push([ni, sp.straight]); else for (const x of sp.subs) subs.push(Object.assign({ net: ni }, x));
        }
        const res = S.Channel.assign(subs);
        for (const d of res.dropped) { maze.add(subs[d].net); dropped = true; }
        chanRes.push({ subs, straight, res });
      }
      if (!dropped) break;
    }
    // width of each channel: its tracks, room for the maze-routed wires that turn in it, and attached constants
    const turns = Array.from({ length: NCOL }, () => new Set());
    for (const l of links) {
      if (!maze.has(l.ni)) continue;
      if (l.same) { turns[l.a.col].add(l.ni); if (l.a.col > 0) turns[l.a.col - 1].add(l.ni); continue; }
      if (pos(l.a, l.ap) !== pos(l.b, l.bp)) turns[l.a.col].add(l.ni);
    }
    for (let i = 0; i < P; i++) for (const q of parts[i].pins) {
      const sd = geo[i].pins[q.name].side, n = parts[i].net[q.name];
      if ((sd === 'top' || sd === 'bottom') && n && lev[i] > 0) turns[lev[i] - 1].add('p' + n.id);
    }
    const extra = opts.extra || 0;
    const gap = chanRes.map((c, k) => Math.max(4, c.res.tracks ? 2 * c.res.tracks + 4 : 4) + 2 * turns[k].size + extra);
    for (const [i, s0] of attached) { const k = lev[pidx.get(s0.part)] - 1; if (k >= 0) gap[k] += geo[i].w + 4; }
    const colX = []; let x = 0;
    for (let k = 0; k < NCOL; k++) { colX.push(x); x += colW[k] + (k < NCOL - 1 ? gap[k] : 0); }
    const X = new Int32Array(P), Y = new Int32Array(P);
    for (let i = 0; i < P; i++) {
      const it = pitem[i];
      if (!it) continue;
      X[i] = it.col === 0 && isPort(i) ? colX[0] + colW[0] - it.w : colX[it.col];
      Y[i] = it.top;
    }
    for (const [i, s0] of attached) {
      const j = pidx.get(s0.part), g = geo[j].pins[s0.pin];
      X[i] = X[j] + g.x - 4 - geo[i].w; Y[i] = Y[j] + g.y - 1;
    }
    // the channel-routed wires, in grid units
    const pre = nets.map(() => []);
    for (let k = 0; k < NCOL - 1; k++) {
      const { subs, straight, res } = chanRes[k];
      const xl = colX[k] + colW[k], xr = colX[k + 1];
      for (const [ni, y] of straight) if (!maze.has(ni)) pre[ni].push([xl, y, xr, y]);
      subs.forEach((sb, j) => {
        if (maze.has(sb.net) || res.track[j] < 0) return;
        const tx = xl + 3 + 2 * res.track[j];
        pre[sb.net].push([tx, sb.lo, tx, sb.hi]);
        for (const y of sb.L) pre[sb.net].push([xl, y, tx, y]);
        for (const y of sb.R) pre[sb.net].push([tx, y, xr, y]);
      });
    }
    for (const it of items) if (it.k === 'd' && !maze.has(it.ni)) pre[it.ni].push([colX[it.col], it.top, colX[it.col] + colW[it.col], it.top]);
    for (const l of links) {
      if (maze.has(l.ni) || l.a.k !== 'p') continue;
      const g = geo[l.a.i].pins[l.ap], px = X[l.a.i] + g.x, xl = colX[l.a.col] + colW[l.a.col];
      if (px < xl) pre[l.ni].push([px, Y[l.a.i] + g.y, xl, Y[l.a.i] + g.y]);
    }
    // the X of each latch, drawn by hand: each output straight to its port, and a branch that drops (or rises)
    // between the two gates and enters the other gate from the left
    const nix = new Map(nets.map((n) => [n.net, n.i]));
    const railSegs = nets.map(() => []);
    const pinAt = (i, nm) => { const q = geo[i].pins[phys[i] && phys[i][nm] ? phys[i][nm] : nm]; return [X[i] + q.x, Y[i] + q.y]; };
    for (const { T, B, fT, fU } of pairs) {
      const [qx, qy] = pinAt(T, 'y'), [rx, ry] = pinAt(B, 'y');
      const xj = Math.max(qx, rx) + 2, tb = Y[T] + geo[T].h, ym1 = tb + 3, ym2 = tb + 5;
      const [bx, by] = pinAt(B, fU), [tx, ty] = pinAt(T, fT);
      const xa = Math.min(bx, tx) - 3, xb = xa - 2;
      const nT = nix.get(parts[T].net.y), nB = nix.get(parts[B].net.y);
      if (nT == null || nB == null) continue;
      pre[nT].push([qx, qy, xj, qy], [xj, qy, xj, ym1], [xj, ym1, xa, ym1], [xa, ym1, xa, by], [xa, by, bx, by]);
      pre[nB].push([rx, ry, xj, ry], [xj, ry, xj, ym2], [xj, ym2, xb, ym2], [xb, ym2, xb, ty], [xb, ty, tx, ty]);
      for (const [g, ni, yy] of [[T, nT, qy], [B, nB, ry]]) for (const r of nets[ni].sinks) {
        if (r.part.type !== 'OUT') continue;
        const [ox, oy] = pinAt(pidx.get(r.part), r.pin);
        if (oy === yy) pre[ni].push([xj, yy, ox, yy]);
      }
    }
    if (clockRails.length) drawClockRails();
    function drawClockRails() {
      // does a new wire of net ni clash with one already drawn (along it, or touching it)?
      const clash = (ni, a) => pre.some((list, k) => k !== ni && list.some((b) => {
        const ah = a[1] === a[3], bh = b[1] === b[3];
        const [ax1, ax2, ay1, ay2] = [Math.min(a[0], a[2]), Math.max(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[1], a[3])];
        const [bx1, bx2, by1, by2] = [Math.min(b[0], b[2]), Math.max(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[1], b[3])];
        if (ah && bh) return ay1 === by1 && ax1 <= bx2 && bx1 <= ax2;
        if (!ah && !bh) return ax1 === bx1 && ay1 <= by2 && by1 <= ay2;
        const [hx1, hx2, hy] = ah ? [ax1, ax2, ay1] : [bx1, bx2, by1], [vx, vy1, vy2] = ah ? [bx1, by1, by2] : [ax1, ay1, ay2];
        if (vx < hx1 || vx > hx2 || hy < vy1 || hy > vy2) return false;
        return vx === hx1 || vx === hx2 || hy === vy1 || hy === vy2; // touching, not crossing
      }));
      let bottom = -Infinity;
      for (let i = 0; i < P; i++) if (!attached.has(i)) bottom = Math.max(bottom, Y[i] + geo[i].h);
      clockRails.forEach((n, k) => {
        const yr = bottom + 3 + 2 * k, di = pidx.get(n.drv.part);
        let x0;
        if (n.drv.part.type === 'CLOCK') { Y[di] = yr - geo[di].pins.y.y; x0 = X[di] + geo[di].pins.y.x; }
        else {
          const [ox, oy] = pinAt(di, 'y');
          x0 = ox + 2;
          pre[n.i].push([ox, oy, x0, oy], [x0, oy, x0, yr]);
        }
        let x1 = x0;
        for (const r of n.sinks) {
          const si = pidx.get(r.part), q = geo[si].pins[phys[si] && phys[si][r.pin] ? phys[si][r.pin] : r.pin];
          const px = X[si] + q.x, py = Y[si] + q.y;
          let segs = null;
          if (q.side === 'bottom') segs = [[px, yr, px, py]];
          else for (let d = 3; d <= 9 && !segs; d++) {
            const xt = px - d, cand = [[xt, yr, xt, py], [xt, py, px, py]];
            if (!cand.some((c) => clash(n.i, c))) segs = cand;
          }
          if (!segs) continue; // left to the maze router
          pre[n.i].push(...segs);
          x1 = Math.max(x1, segs[0][0]);
        }
        if (x1 > x0) { pre[n.i].push([x0, yr, x1, yr]); railSegs[n.i].push([x0, yr, x1, yr]); }
      });
    }
    return { parts, geo, nets, X, Y, phys, lev, fbNet, pairOf, NCOL, items, extra, attached, pre, rails: railSegs };
  }

  // ---- routing and the finished drawing --------------------------------------------------------------------------
  function finish(pl, opts) {
    const { parts, geo, nets, X, Y, phys } = pl;
    const P = parts.length, M = 6 + (opts.margin || 0);
    const pidx = new Map(parts.map((p, i) => [p, i]));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < P; i++) { x0 = Math.min(x0, X[i]); y0 = Math.min(y0, Y[i]); x1 = Math.max(x1, X[i] + geo[i].w); y1 = Math.max(y1, Y[i] + geo[i].h); }
    // the grid also holds every wire drawn beforehand (lanes above or below the parts)
    for (const list of pl.pre || []) for (const [a, b, c2, d] of list || []) { x0 = Math.min(x0, a, c2); x1 = Math.max(x1, a, c2); y0 = Math.min(y0, b, d); y1 = Math.max(y1, b, d); }
    const ox = x0 - M, oy = y0 - M, gw = x1 - x0 + 2 * M + 1, gh = y1 - y0 + 2 * M + 1;
    const cell = (x, y) => (y - oy) * gw + (x - ox);
    const blocked = new Uint8Array(gw * gh), fixed = new Int32Array(gw * gh).fill(-1), resv = new Int32Array(gw * gh).fill(-1), clash = new Uint8Array(gw * gh);
    for (let i = 0; i < P; i++) { const r = pl.attached.has(i) ? 0 : 1; for (let y = Y[i] - r; y <= Y[i] + geo[i].h + r; y++) for (let x = X[i] - r; x <= X[i] + geo[i].w + r; x++) blocked[cell(x, y)] = 1; }
    // nothing runs round the far side of the input or output ports: the edges of the drawing are theirs
    let inEdge = -Infinity, outEdge = Infinity;
    for (let i = 0; i < P; i++) {
      const side = Object.values(geo[i].pins)[0] && Object.values(geo[i].pins)[0].side;
      if ((parts[i].type === 'IN' || parts[i].type === 'CLOCK') && side === 'right') inEdge = Math.max(inEdge, X[i]);
      if (parts[i].type === 'OUT' && side === 'left') outEdge = Math.min(outEdge, X[i] + geo[i].w);
    }
    if (!pl.noEdges) for (let y = oy; y < oy + gh; y++) for (let x = ox; x < ox + gw; x++) if (x < inEdge || x > outEdge) blocked[cell(x, y)] = 1;
    const pinXY = (r) => { const i = pidx.get(r.part), nm = phys[i] && phys[i][r.pin] ? phys[i][r.pin] : r.pin, g = geo[i].pins[nm]; return { x: X[i] + g.x, y: Y[i] + g.y, side: g.side }; };
    const DX = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const pnets = nets.map((n) => {
      const terms = [n.drv].concat(n.sinks).map((r) => {
        const p = pinXY(r), d = DIRS[p.side];
        const t = { pin: cell(p.x, p.y), esc: cell(p.x + DX[d][0], p.y + DX[d][1]), out: d, x: p.x, y: p.y };
        fixed[t.pin] = n.i; fixed[t.esc] = n.i;
        const c2 = cell(p.x + 2 * DX[d][0], p.y + 2 * DX[d][1]);
        if (resv[c2] >= 0 && resv[c2] !== n.i) clash[c2] = 1; else resv[c2] = n.i;
        return t;
      });
      return { terms, pre: pl.pre[n.i] || [] };
    });
    for (let c = 0; c < clash.length; c++) if (clash[c]) resv[c] = -1;
    const hpwl = (n) => { const xs = n.terms.map((t) => t.x), ys = n.terms.map((t) => t.y); return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys); };
    const byLen = pnets.map((_, i) => i).sort((a, b) => (pnets[a].terms.length > 2) - (pnets[b].terms.length > 2) || hpwl(pnets[a]) - hpwl(pnets[b]));
    const orders = [byLen, byLen.slice().sort((a, b) => hpwl(pnets[b]) - hpwl(pnets[a])), byLen.slice().sort((a, b) => pnets[b].terms.length - pnets[a].terms.length || hpwl(pnets[a]) - hpwl(pnets[b]))];
    let best = null;
    for (const order of orders.slice(0, opts.orders || 2)) {
      // the channel-routed nets first, then the rest
      const ord = order.filter((i) => pnets[i].pre.length).concat(order.filter((i) => !pnets[i].pre.length));
      const r = S.Router.route({ gw, gh, blocked, fixed, resv, nets: pnets, cell }, { order: ord });
      const bad = r.nets.filter((n) => !n.ok).length;
      const len = r.nets.reduce((s, n) => s + n.edges.length, 0);
      const score = bad * 1e6 + r.crossings.length * 1000 + len;
      if (!best || score < best.score) best = { r, score, bad };
      if (!bad && !r.crossings.length) break;
    }
    const r = best.r;
    const px = (c) => [((c % gw) + ox) * U, (((c / gw) | 0) + oy) * U];

    const out = { title: pl.title, unit: U, parts: [], nets: [], labels: [], crossings: [], failed: [], style: pl.style || 'columns' };
    for (let i = 0; i < P; i++) {
      const p = parts[i], g = geo[i];
      out.parts.push({
        id: p.id, type: p.type, part: p, geom: g, x: X[i] * U, y: Y[i] * U, w: g.w * U, h: g.h * U,
        pins: p.pins.map((q) => { const pp = pinXY({ part: p, pin: q.name }); const n = p.net[q.name]; return { name: q.name, x: pp.x * U, y: pp.y * U, side: pp.side, net: n && n.pins.length >= 2 ? n.id : null, open: !n || n.pins.length < 2 }; }),
      });
    }
    nets.forEach((n, k) => {
      const rn = r.nets[k];
      if (!rn.ok) out.failed.push(n.net.id);
      // the net's graph on the grid
      const adj = new Map();
      const DXc = [1, gw, -1, -gw];
      for (const [c, d] of rn.edges) {
        const c2 = c + DXc[d];
        if (!adj.has(c)) adj.set(c, []); if (!adj.has(c2)) adj.set(c2, []);
        adj.get(c).push(c2); adj.get(c2).push(c);
      }
      const corner = (c) => { const a = adj.get(c); if (a.length !== 2) return true; return (a[0] - c) !== -(a[1] - c); };
      const vert = [...adj.keys()].filter(corner);
      const isV = new Set(vert), seen = new Set(), polylines = [], segments = [];
      for (const v of vert) for (const w of adj.get(v)) {
        const ek = Math.min(v, w) + ',' + Math.max(v, w);
        if (seen.has(ek)) continue;
        const line = [v]; let a = v, b = w;
        for (;;) {
          seen.add(Math.min(a, b) + ',' + Math.max(a, b));
          if (isV.has(b)) { line.push(b); break; }
          const nx = adj.get(b).find((c) => c !== a); a = b; b = nx;
        }
        polylines.push(line.map(px));
      }
      // which stretches are rails (a literal, a product row, a shared control line, a bus): their crossings are
      // expected and counted apart
      const rails = (pl.rails && pl.rails[n.i]) || [];
      // a stretch is a rail if at least half of it lies on a declared rail
      const onRail = (a, b) => {
        const [ax, ay, bx, by] = [a[0] / U, a[1] / U, b[0] / U, b[1] / U], len = Math.abs(bx - ax) + Math.abs(by - ay);
        let on = 0;
        for (const [x1, y1, x2, y2] of rails) {
          if (x1 === x2 && ax === x1 && bx === x1) on += Math.max(0, Math.min(Math.max(ay, by), Math.max(y1, y2)) - Math.max(Math.min(ay, by), Math.min(y1, y2)));
          else if (y1 === y2 && ay === y1 && by === y1) on += Math.max(0, Math.min(Math.max(ax, bx), Math.max(x1, x2)) - Math.max(Math.min(ax, bx), Math.min(x1, x2)));
        }
        return len > 0 && on * 2 >= len;
      };
      const paths = [];
      for (const pl2 of polylines) {
        let cur = null;
        for (let j = 1; j < pl2.length; j++) {
          const rail = onRail(pl2[j - 1], pl2[j]);
          segments.push([pl2[j - 1][0], pl2[j - 1][1], pl2[j][0], pl2[j][1], rail ? 1 : 0]);
          if (!cur || cur.rail !== rail) { cur = { rail, pts: [pl2[j - 1]] }; paths.push(cur); }
          cur.pts.push(pl2[j]);
        }
      }
      const junctions = [...adj.entries()].filter(([, a]) => a.length >= 3).map(([c]) => px(c));
      out.nets.push({ id: n.net.id, name: n.net.name, show: !!n.net.show, width: n.net.width, polylines, paths, segments, junctions, pins: pnets[k].terms.map((t) => [t.x * U, t.y * U]), fb: pl.fbNet.has(n.i) });
    });
    placeLabels(out);
    // the drawing's box: everything, with a margin
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const grow = (x, y, w, h) => { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x + (w || 0)); by1 = Math.max(by1, y + (h || 0)); };
    for (const p of out.parts) grow(p.x, p.y, p.w, p.h);
    for (const n of out.nets) for (const s of n.segments) { grow(s[0], s[1]); grow(s[2], s[3]); }
    for (const l of out.labels) grow(l.box.x, l.box.y, l.box.w, l.box.h);
    const pad = 12;
    out.bounds = { x: bx0 - pad, y: by0 - pad, w: bx1 - bx0 + 2 * pad, h: by1 - by0 + 2 * pad };
    countCrossings(out);
    return out;
  }
  /** wire crossings, apart into those over a rail (expected, readable) and the rest */
  function countCrossings(out) {
    const segs = [];
    for (const n of out.nets) for (const s of n.segments) segs.push({ n: n.id, x1: Math.min(s[0], s[2]), y1: Math.min(s[1], s[3]), x2: Math.max(s[0], s[2]), y2: Math.max(s[1], s[3]), h: s[1] === s[3], rail: !!s[4] });
    const hs = segs.filter((s) => s.h), vs = segs.filter((s) => !s.h);
    out.crossings = []; out.railCrossingPts = [];
    for (const a of hs) for (const b of vs) {
      if (a.n === b.n) continue;
      if (b.x1 > a.x1 && b.x1 < a.x2 && a.y1 > b.y1 && a.y1 < b.y2) (a.rail || b.rail ? out.railCrossingPts : out.crossings).push([b.x1, a.y1]);
    }
    out.crossingCount = out.crossings.length;
    out.railCrossings = out.railCrossingPts.length;
  }

  // ---- labels: net names and bus widths, where nothing else is ----------------------------------------------------
  function placeLabels(out) {
    const boxes = [];
    for (const p of out.parts) boxes.push({ x: p.x - 3, y: p.y - 3, w: p.w + 6, h: p.h + 6, net: null });
    for (const n of out.nets) {
      for (const s of n.segments) boxes.push({ x: Math.min(s[0], s[2]) - 3, y: Math.min(s[1], s[3]) - 3, w: Math.abs(s[2] - s[0]) + 6, h: Math.abs(s[3] - s[1]) + 6, net: n.id });
      for (const j of n.junctions) boxes.push({ x: j[0] - 5, y: j[1] - 5, w: 10, h: 10, net: n.id });
    }
    const hit = (b, ownNet) => boxes.some((o) => (ownNet == null || o.net !== ownNet || o.label) && b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    const TH = 13;
    for (const n of out.nets) {
      const hs = n.segments.filter((s) => s[1] === s[3] && Math.abs(s[2] - s[0]) >= 3 * U);
      if (n.width > 1) {
        const text = String(n.width), tw = Sym.textWidth(text, 10);
        const cands = [];
        for (const s of hs) {
          const a = Math.min(s[0], s[2]) + 12, b = Math.max(s[0], s[2]) - 12 - tw;
          for (let x = a; x <= b; x += 5) cands.push({ x, y: s[1], d: Math.abs(x - (a + b) / 2) });
        }
        // on a vertical stretch, if no horizontal one has room: the number beside the wire
        for (const s of n.segments.filter((q) => q[0] === q[2] && Math.abs(q[3] - q[1]) >= 4 * U)) {
          const a = Math.min(s[1], s[3]) + 14, b = Math.max(s[1], s[3]) - 14;
          for (let y = a; y <= b; y += 5) cands.push({ x: s[0], y, d: 1000 + Math.abs(y - (a + b) / 2), v: true });
        }
        cands.sort((p, q) => p.d - q.d);
        for (const c of cands) {
          const slash = { x: c.x - 6, y: c.y - 6, w: 12, h: 12 };
          const tb = c.v ? { x: c.x + 7, y: c.y - TH / 2 - 4, w: tw + 2, h: TH } : { x: c.x + 4, y: c.y - 6 - TH, w: tw + 2, h: TH };
          if (hit(tb) || hit(slash, n.id)) continue;
          out.labels.push({ kind: 'bus', net: n.id, text, x: tb.x + 1, y: tb.y + TH / 2, anchor: 'start', size: 10, box: tb, slash: c.v ? [c.x - 5, c.y + 4, c.x + 5, c.y - 4] : [c.x - 4, c.y + 5, c.x + 4, c.y - 5] });
          boxes.push(Object.assign({ label: true }, tb), Object.assign({ label: true, net: n.id }, slash));
          break;
        }
      }
      if (n.show && n.name) {
        const tw = Sym.textWidth(n.name, Sym.FONT.net), cands = [];
        for (const s of hs) {
          const a = Math.min(s[0], s[2]) + 8 + tw / 2, b = Math.max(s[0], s[2]) - 8 - tw / 2;
          for (let x = a; x <= b; x += 5) cands.push({ x, y: s[1], d: x - a });
        }
        cands.sort((p, q) => p.d - q.d);
        for (const c of cands) {
          const tb = { x: c.x - tw / 2 - 1, y: c.y - 4 - TH, w: tw + 2, h: TH };
          if (hit(tb)) continue;
          out.labels.push({ kind: 'net', net: n.id, text: n.name, x: c.x, y: tb.y + TH / 2, anchor: 'middle', size: Sym.FONT.net, box: tb });
          boxes.push(Object.assign({ label: true }, tb));
          break;
        }
      }
    }
  }

  /** lay out a circuit: {parts, nets, labels, crossings, bounds, ...} in pixels */
  /** how good a finished drawing is (lower is better): crossings above all, then bends, wire and area */
  function score(res) {
    let len = 0, bends = 0;
    for (const n of res.nets) for (const pl of n.polylines) { bends += Math.max(0, pl.length - 2); for (let i = 1; i < pl.length; i++) len += Math.abs(pl[i][0] - pl[i - 1][0]) + Math.abs(pl[i][1] - pl[i - 1][1]); }
    // outputs out of the order they were declared in cost more than a crossing each
    const outs = res.parts.filter((p) => p.type === 'OUT');
    let inv = 0;
    for (let i = 0; i < outs.length; i++) for (let j = i + 1; j < outs.length; j++) if (outs[i].y > outs[j].y) inv++;
    return res.failed.length * 1e6 + res.crossingCount * 40 + inv * 130 + bends * 2 + len / U * 0.3 + (res.bounds.w * res.bounds.h) / (U * U) * 0.04;
  }
  function attempt(circuit, opts) {
    let res = null;
    for (let a = 0; a < 4; a++) {
      const pl = layout(circuit, Object.assign({}, opts, { extra: a * 2 }));
      pl.title = circuit.title;
      res = finish(pl, { margin: a * 2, orders: opts.orders });
      if (!res.failed.length) break;
    }
    res.score = score(res);
    return res;
  }
  /** lay out a circuit: {parts, nets, labels, crossings, bounds, ...} in pixels; the best of a few candidates */
  L.layout = function (circuit, opts) {
    opts = opts || {};
    // a drafter's idiom when one fits (styles.js); the general column layout otherwise
    const style = !opts.general && S.Styles && S.Styles.pick(circuit);
    if (style) {
      let res = null;
      try {
        const pl = style(circuit);
        if (pl) { res = finish(pl, { margin: 0, orders: 1 }); res.score = score(res); }
      } catch (e) { if (opts.strict) throw e; res = null; if (typeof console !== 'undefined' && opts.debug) console.log(e.stack); }
      // a style's drawing must keep every rule, or the general layout draws the circuit instead
      const bad = res && S.Verify ? S.Verify.check(res).problems : [];
      if (res && !res.failed.length && !bad.length) return res;
      if (res && opts.debug) console.log('style ' + res.style + ' left unrouted: ' + res.failed.join(' ') + '; ' + bad.slice(0, 6).map((p) => p.msg).join('; '));
    }
    const variants = opts.variants || [{}, { seed: 1 }, { outW: 1 }, { seed: 5 }, { seed: 3, outW: 1.5 }, { seed: 4 }, { seed: 6 }];
    // how many candidates: fewer for big circuits (by size, not by time, so the result is the same anywhere)
    const tries = opts.tries || (circuit.parts.length > 40 ? 4 : circuit.parts.length > 25 ? 5 : variants.length);
    let best = null, bestV = null;
    for (const v of variants.slice(0, tries)) {
      const res = attempt(circuit, Object.assign({}, opts, v, { noNudge: true }));
      if (!best || res.score < best.score) { best = res; bestV = v; }
      if (!best.crossingCount && !best.failed.length) return best;
    }
    // the winner, polished by nudges
    const polished = attempt(circuit, Object.assign({}, opts, bestV));
    return polished.score <= best.score ? polished : best;
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
