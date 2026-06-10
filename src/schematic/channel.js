// Channel routing between two columns of parts, the way a drafter does it: every net that must change rows
// in the channel gets one vertical trunk on its own track, with branches to its terminals on either side.
// Terminals: rows where the net enters from the left (an output, or a wire passing the column) and rows
// where it leaves to the right (an input, or a wire passing on). The order of the trunks, left to right, is
// chosen to cross as few branches as possible, subject to the rule that no two nets may share a stretch of
// wire: where one net arrives into a row from the left and another leaves that row to the right, the trunk of
// the arriving net must lie left of the trunk of the leaving one. Trunks are then packed onto as few tracks
// as the order allows. A net that both arrives and leaves at a row inside its span would meet itself four ways
// there, so it is split at that row into two trunks, each ending on the straight line through the row.
(function (S) {
  'use strict';
  const C = S.Channel = {};

  /** one net's terminals in a channel → the trunks to draw ({lo, hi, L, R}), or a straight line (single row) */
  C.split = function (L, R) {
    const rows = [...new Set(L.concat(R))].sort((a, b) => a - b);
    if (rows.length === 1) return { straight: rows[0] };
    const lo = rows[0], hi = rows[rows.length - 1];
    const Ls = new Set(L), Rs = new Set(R);
    const cuts = rows.filter((y) => y > lo && y < hi && Ls.has(y) && Rs.has(y));
    const bounds = [lo, ...cuts, hi];
    const subs = [];
    for (let i = 0; i + 1 < bounds.length; i++) {
      const a = bounds[i], b = bounds[i + 1];
      subs.push({ lo: a, hi: b, L: L.filter((y) => y >= a && y <= b), R: R.filter((y) => y >= a && y <= b) });
    }
    return { subs };
  };

  /**
   * subs: [{ net, lo, hi, L: [rows], R: [rows] }]. Returns { track: [t per sub], tracks, dropped: [indices] }:
   * the dropped ones could not be ordered (their constraints form a loop) and are left to the maze router.
   */
  C.assign = function (subs) {
    const n = subs.length;
    const meet = (a, b) => a.lo <= b.hi && b.lo <= a.hi;
    const inside = (y, s) => y > s.lo && y < s.hi;
    // cost[i][j]: crossings if i lies left of j; Infinity if that makes two nets share wire
    const cost = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const A = subs[i], B = subs[j];
      if (!meet(A, B)) continue;
      if (A.net === B.net) continue;
      let c = 0;
      // A left of B: B's left branches pass A's trunk, A's right branches pass B's trunk
      for (const y of B.L) { if (A.R.includes(y)) { c = Infinity; break; } if (inside(y, A)) c++; }
      if (c !== Infinity) for (const y of A.R) if (inside(y, B)) c++;
      cost[i][j] = c;
    }
    // must[i][j]: i has to lie left of j
    const alive = new Set(subs.map((_, i) => i)), dropped = [];
    const must = (i, j) => cost[j][i] === Infinity && cost[i][j] !== Infinity;
    // drop subs caught in loops of constraints (or with a conflict both ways)
    for (;;) {
      let bad = -1;
      for (const i of alive) for (const j of alive) if (i !== j && cost[i][j] === Infinity && cost[j][i] === Infinity) bad = i;
      if (bad < 0) {
        // a loop: topological sort fails
        const indeg = new Map([...alive].map((i) => [i, 0]));
        for (const i of alive) for (const j of alive) if (i !== j && must(i, j)) indeg.set(j, indeg.get(j) + 1);
        const q = [...alive].filter((i) => !indeg.get(i)), seen = [];
        while (q.length) { const i = q.pop(); seen.push(i); for (const j of alive) if (i !== j && must(i, j)) { indeg.set(j, indeg.get(j) - 1); if (!indeg.get(j)) q.push(j); } }
        if (seen.length === alive.size) break;
        const left = [...alive].filter((i) => !seen.includes(i));
        bad = left.sort((a, b) => [...alive].filter((j) => must(b, j) || must(j, b)).length - [...alive].filter((j) => must(a, j) || must(j, a)).length)[0];
      }
      alive.delete(bad); dropped.push(bad);
    }
    // a first order: the constraints, then the middle of each span
    const ids = [...alive];
    const mid = (i) => (subs[i].lo + subs[i].hi) / 2;
    let order = [];
    {
      const indeg = new Map(ids.map((i) => [i, 0]));
      for (const i of ids) for (const j of ids) if (i !== j && must(i, j)) indeg.set(j, indeg.get(j) + 1);
      const ready = ids.filter((i) => !indeg.get(i));
      while (ready.length) {
        ready.sort((a, b) => firstCost(a) - firstCost(b) || mid(a) - mid(b));
        const i = ready.shift(); order.push(i);
        for (const j of ids) if (i !== j && must(i, j)) { indeg.set(j, indeg.get(j) - 1); if (!indeg.get(j)) ready.push(j); }
      }
      function firstCost(i) { let c = 0; for (const j of ids) if (j !== i && !order.includes(j)) c += cost[i][j] === Infinity ? 1e6 : cost[i][j] - cost[j][i]; return c; }
    }
    const total = (o) => { let c = 0; for (let a = 0; a < o.length; a++) for (let b = a + 1; b < o.length; b++) c += cost[o[a]][o[b]]; return c; };
    // improve: move each trunk to its best place while that helps
    let best = total(order);
    for (let pass = 0; pass < 12; pass++) {
      let improved = false;
      for (let a = 0; a < order.length; a++) {
        const it = order[a];
        const rest = order.slice(0, a).concat(order.slice(a + 1));
        for (let b = 0; b <= rest.length; b++) {
          if (b === a) continue;
          const cand = rest.slice(0, b).concat([it], rest.slice(b));
          const c = total(cand);
          if (c < best) { best = c; order = cand; improved = true; break; }
        }
      }
      if (!improved) break;
    }
    // tracks: as far left as the trunks met before allow
    const track = new Array(n).fill(-1);
    let tracks = 0;
    order.forEach((i, k) => {
      let t = 0;
      for (let m = 0; m < k; m++) { const j = order[m]; if (meet(subs[i], subs[j])) t = Math.max(t, track[j] + 1); }
      track[i] = t; tracks = Math.max(tracks, t + 1);
    });
    return { track, tracks, dropped, crossings: best };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
