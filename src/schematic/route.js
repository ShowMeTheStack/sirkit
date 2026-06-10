// The wire router for the layout engine: orthogonal wires on the grid, one net at a time, each net grown as a
// tree from its driver (a trunk, then branches that join it at T-junctions). A wire may cross a wire of
// another net only at right angles and only where that wire runs straight; it may never run along another
// net, bend or branch on another net's wire, or pass through a part or the clearance ring round it. Bends
// and crossings cost extra, so wires come out straight; a final pass rips up and reroutes nets that cross.
(function (S) {
  'use strict';
  const R = S.Router = {};
  const BEND = 7, JUNC = 3, NEAR = 1.2, STEP = 1;

  class Heap {
    constructor() { this.k = new Float64Array(1024); this.v = new Int32Array(1024); this.n = 0; }
    push(key, val) {
      if (this.n === this.k.length) { const k = new Float64Array(this.n * 2), v = new Int32Array(this.n * 2); k.set(this.k); v.set(this.v); this.k = k; this.v = v; }
      let i = this.n++; const K = this.k, V = this.v;
      while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= key) break; K[i] = K[p]; V[i] = V[p]; i = p; }
      K[i] = key; V[i] = val;
    }
    pop() {
      const K = this.k, V = this.v, top = V[0], last = --this.n, key = K[last], val = V[last];
      let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= last) break; if (c + 1 < last && K[c + 1] < K[c]) c++; if (K[c] >= key) break; K[i] = K[c]; V[i] = V[c]; i = c; }
      K[i] = key; V[i] = val;
      return top;
    }
  }

  /**
   * problem: { gw, gh, blocked: Uint8Array, fixed: Int32Array (net index owning a pin or its escape cell, -1),
   *            nets: [{ terms: [{ pin, esc, out }] }] }  (term 0 drives; out is the outward direction 0..3)
   * returns: { nets: [{ edges: Set of edge keys, ok }], crossings }
   */
  R.route = function (pb, opts) {
    opts = opts || {};
    const { gw, gh, blocked, fixed } = pb;
    const resv = pb.resv || new Int32Array(gw * gh).fill(-1); // the cell beyond a pin's escape: its net's, or free
    const NC = gw * gh;
    const DX = [1, gw, -1, -gw];
    const hE = new Int32Array(NC), vE = new Int32Array(NC); // net+1 on the edge c→c+1 / c→c+gw
    const cA = new Int32Array(NC), cB = new Int32Array(NC); // nets (+1) using a cell; two only where they cross
    const g = new Float64Array(NC * 4), stamp = new Int32Array(NC * 4), prev = new Int32Array(NC * 4);
    const CX = new Int32Array(NC), CY = new Int32Array(NC);
    for (let c = 0; c < NC; c++) { CX[c] = c % gw; CY[c] = (c / gw) | 0; }
    let gen = 0;
    const heap = new Heap();
    const nets = pb.nets.map((n) => ({ terms: n.terms, pre: n.pre, edges: [], cells: new Set(), ok: true }));
    let CROSS = opts.cross || 30;

    const edgeOf = (c, d) => (d === 0 ? hE[c] : d === 1 ? vE[c] : d === 2 ? hE[c - 1] : vE[c - gw]);
    const setEdge = (c, d, v) => { if (d === 0) hE[c] = v; else if (d === 1) vE[c] = v; else if (d === 2) hE[c - 1] = v; else vE[c - gw] = v; };
    const inGrid = (c, d) => (d === 0 ? CX[c] < gw - 1 : d === 2 ? CX[c] > 0 : d === 1 ? c + gw < NC : c >= gw);
    const deg = (c, n) => { let k = 0; for (let d = 0; d < 4; d++) if (inGrid(c, d) && edgeOf(c, d) === n + 1) k++; return k; };
    const others = (c, n) => (cA[c] && cA[c] !== n + 1 ? cA[c] : cB[c] && cB[c] !== n + 1 ? cB[c] : 0);
    const addCell = (c, n) => { if (cA[c] === n + 1 || cB[c] === n + 1) return; if (!cA[c]) cA[c] = n + 1; else cB[c] = n + 1; };
    const delCell = (c, n) => { if (cA[c] === n + 1) { cA[c] = cB[c]; cB[c] = 0; } else if (cB[c] === n + 1) cB[c] = 0; };
    /** may net n pass straight through cell c in direction d, crossing what is there? (returns 0 no, 1 free, 2 crossing) */
    function passable(c, d, n) {
      const o = others(c, n);
      if (!o) return 1;
      if (cB[c]) return 0;
      // the other net must run straight across, at right angles, and do nothing else here
      const p = (d + 1) & 3, q = (d + 3) & 3;
      if (!inGrid(c, p) || !inGrid(c, q) || edgeOf(c, p) !== o || edgeOf(c, q) !== o) return 0;
      if (edgeOf(c, d) || (inGrid(c, (d + 2) & 3) && edgeOf(c, (d + 2) & 3))) return 0;
      return 2;
    }
    function near(c, d, n) {
      // running right beside another net, or round a junction, looks crowded
      let k = 0;
      for (const s of [(d + 1) & 3, (d + 3) & 3]) {
        if (!inGrid(c, s)) continue;
        const c2 = c + DX[s];
        const e1 = edgeOf(c2, d & 1 ? 1 : 0), e2 = inGrid(c2, d & 1 ? 3 : 2) ? edgeOf(c2, d & 1 ? 3 : 2) : 0;
        if ((e1 && e1 !== n + 1) || (e2 && e2 !== n + 1)) k += NEAR;
        if (blocked[c2] && fixed[c2] < 0) k += 0.15;
      }
      return k;
    }

    let wx0 = 0, wx1 = 1e9, wy0 = 0, wy1 = 1e9; // the window a search keeps to
    // a branch that leaves the tree right beside another branch point makes two dots that run together
    function crowd(c, n) {
      for (const o of [1, -1, gw, -gw, 2, -2, 2 * gw, -2 * gw]) { const c2 = c + o; if (c2 >= 0 && c2 < NC && nets[n].cells.has(c2) && deg(c2, n) >= 3) return 8; }
      return 0;
    }
    function search(n, starts, tgt) {
      gen++;
      heap.n = 0;
      const tx = CX[tgt.esc], ty = CY[tgt.esc], tin = (tgt.out + 2) & 3;
      // the distance left, and among equals the nearer state first (ties otherwise flood the grid)
      const hz = (c) => { const dx = CX[c] > tx ? CX[c] - tx : tx - CX[c], dy = CY[c] > ty ? CY[c] - ty : ty - CY[c]; return (dx + dy) * 1.001; };
      for (const s of starts) {
        const id = s.c * 4 + s.d;
        if (stamp[id] === gen && g[id] <= s.g) continue;
        stamp[id] = gen; g[id] = s.g; prev[id] = -1 - s.from;
        heap.push(s.g + hz(s.c), id);
      }
      while (heap.n) {
        const id = heap.pop(), c = id >> 2, d = id & 3, gc = g[id];
        if (c === tgt.esc) { if (d === tin) return id; continue; }
        const straightOnly = others(c, n) !== 0;
        for (let nd = 0; nd < 4; nd++) {
          if (nd === ((d + 2) & 3)) continue;
          if (straightOnly && nd !== d) continue;
          if (!inGrid(c, nd) || edgeOf(c, nd)) continue;
          const c2 = c + DX[nd];
          if (CX[c2] < wx0 || CX[c2] > wx1 || CY[c2] < wy0 || CY[c2] > wy1) continue;
          let cost = gc + STEP + (nd !== d ? BEND : 0);
          if (c2 === tgt.esc) { if (nd !== tin) continue; }
          else {
            if (blocked[c2] || fixed[c2] >= 0 || (resv[c2] >= 0 && resv[c2] !== n) || nets[n].cells.has(c2)) continue;
            const p = passable(c2, nd, n);
            if (!p) continue;
            if (p === 2) cost += CROSS;
            cost += near(c2, nd, n);
          }
          const id2 = c2 * 4 + nd;
          if (stamp[id2] === gen && g[id2] <= cost) continue;
          stamp[id2] = gen; g[id2] = cost; prev[id2] = id;
          heap.push(cost + hz(c2), id2);
        }
      }
      return -1;
    }

    function addEdge(n, c, d) { if (edgeOf(c, d) === n + 1) return; setEdge(c, d, n + 1); nets[n].edges.push([c, d]); addCell(c, n); addCell(c + DX[d], n); nets[n].cells.add(c); nets[n].cells.add(c + DX[d]); }
    function ripUp(n) {
      for (const [c, d] of nets[n].edges) setEdge(c, d, 0);
      for (const c of nets[n].cells) delCell(c, n);
      nets[n].edges = []; nets[n].cells = new Set(); nets[n].ok = true;
    }
    function routeNet(n) {
      const net = nets[n], terms = net.terms;
      let todo, first = true;
      const drv = terms[0];
      if (net.pre && net.pre.length) {
        // drawn already (by the channel router, or by a layout style): lay its wires, then reach what they miss
        layPre(n);
        todo = terms.filter((t) => !net.cells.has(t.pin));
        if (!todo.length) return true;
        first = false; // a pin the drawn wires missed (even the driver's) is reached through its escape
      } else {
        addEdge(n, drv.pin, drv.out);
        todo = terms.slice(1);
      }
      while (todo.length) {
        // the sink nearest the tree so far
        let bi = 0, bd = Infinity;
        todo.forEach((t, i) => {
          const tx = CX[t.esc], ty = CY[t.esc];
          for (const c of net.cells) { const dd = Math.abs(CX[c] - tx) + Math.abs(CY[c] - ty); if (dd < bd) { bd = dd; bi = i; } }
        });
        const t = todo.splice(bi, 1)[0];
        const starts = [];
        const out = drv.esc + DX[drv.out];
        if (first) { const p = passable(out, drv.out, n); if (!edgeOf(drv.esc, drv.out) && !blocked[out] && fixed[out] < 0 && p) starts.push({ c: out, d: drv.out, g: STEP + (p === 2 ? CROSS : 0), from: drv.esc }); }
        else {
          for (const c of net.cells) {
            if (fixed[c] >= 0 || others(c, n)) continue;
            const k = deg(c, n);
            if (k >= 3) continue;
            for (let d = 0; d < 4; d++) {
              if (!inGrid(c, d) || edgeOf(c, d)) continue;
              const c2 = c + DX[d];
              if (c2 === t.esc) { if (d === ((t.out + 2) & 3)) starts.push({ c: c2, d, g: STEP + JUNC, from: c }); continue; }
              if (blocked[c2] || fixed[c2] >= 0 || (resv[c2] >= 0 && resv[c2] !== n) || net.cells.has(c2)) continue;
              const p = passable(c2, d, n);
              if (!p) continue;
              starts.push({ c: c2, d, g: STEP + JUNC + crowd(c, n) + (p === 2 ? CROSS : 0) + near(c2, d, n), from: c });
            }
          }
        }
        // first within a window round the tree and the sink, then, if need be, anywhere
        let x0 = CX[t.esc], x1 = x0, y0 = CY[t.esc], y1 = y0;
        for (const c of net.cells) { if (CX[c] < x0) x0 = CX[c]; if (CX[c] > x1) x1 = CX[c]; if (CY[c] < y0) y0 = CY[c]; if (CY[c] > y1) y1 = CY[c]; }
        const W = 10;
        wx0 = x0 - W; wx1 = x1 + W; wy0 = y0 - W; wy1 = y1 + W;
        let end = search(n, starts, t);
        wx0 = 0; wx1 = 1e9; wy0 = 0; wy1 = 1e9;
        if (end < 0) end = search(n, starts, t);
        if (end < 0) { net.ok = false; continue; }
        // walk back, laying the edges
        let id = end;
        const path = [];
        for (;;) { const c = id >> 2, p = prev[id]; if (p < 0) { path.push([-1 - p, c]); break; } path.push([p >> 2, c]); id = p; }
        for (const [a, b] of path) { const d = DX.indexOf(b - a); addEdge(n, a, d); }
        addEdge(n, t.esc, (t.out + 2) & 3);
        first = false;
      }
      return net.ok;
    }
    const crossingsOf = (n) => { let k = 0; for (const c of nets[n].cells) if (cB[c]) k++; return k; };
    const lengthOf = (n) => nets[n].edges.length;

    function layPre(n) {
      for (const [x1, y1, x2, y2] of nets[n].pre) {
        if ((x1 !== x2 && y1 !== y2) || ![x1, y1, x2, y2].every(Number.isInteger)) throw new Error('a drawn wire that is not on the grid');
        const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1), d = dx > 0 ? 0 : dx < 0 ? 2 : dy > 0 ? 1 : 3;
        let x = x1, y = y1;
        while (x !== x2 || y !== y2) { addEdge(n, pb.cell(x, y), d); x += dx; y += dy; }
      }
    }
    const order = opts.order || pb.nets.map((_, i) => i);
    // every wire drawn beforehand goes down first, so no net's routing runs over another's drawn wires
    for (const n of order) if (nets[n].pre && nets[n].pre.length) layPre(n);
    for (const n of order) routeNet(n);
    // rip up and reroute: a net that crosses others tries again, now that every net has a route, at a
    // higher price for crossing; the new route is kept only if it crosses less (or as much, but shorter)
    for (let it = 0; it < (opts.passes == null ? 4 : opts.passes); it++) {
      CROSS = (opts.cross || 30) + 25 * (it + 1);
      let changed = false;
      const bad = order.filter((n) => !(nets[n].pre && nets[n].pre.length) && (crossingsOf(n) > 0 || !nets[n].ok)).sort((a, b) => crossingsOf(b) - crossingsOf(a));
      for (const n of bad) {
        const before = { x: crossingsOf(n), l: lengthOf(n), ok: nets[n].ok, edges: nets[n].edges.slice() };
        ripUp(n);
        const ok = routeNet(n);
        const x = crossingsOf(n), l = lengthOf(n);
        if (!ok && before.ok || (ok === before.ok && (x > before.x || (x === before.x && l >= before.l)))) {
          ripUp(n);
          for (const [c, d] of before.edges) addEdge(n, c, d);
          nets[n].ok = before.ok;
        } else changed = true;
      }
      if (!changed) break;
    }
    const crossings = [];
    for (let c = 0; c < NC; c++) if (cB[c]) crossings.push(c);
    return { nets: nets.map((n) => ({ edges: n.edges, ok: n.ok })), crossings };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
