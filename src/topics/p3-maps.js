// Part 3, Karnaugh maps: why the codes go in Gray order (the map is a torus, unrolled), how a truth table
// becomes a map, and which circles are groups.
(function (S) {
  'use strict';
  const B = () => S.Bool;
  const K = () => S.Kit.km;
  const Geo = () => S.geom;
  const P3 = S.P3;

  S.family({ id: 'p3-maps', part: 'minimise', order: 10, title: 'Karnaugh maps', blurb: 'A truth table folded so that neighbouring cells differ in one variable: why the codes run in Gray order, how rows land in cells, and what makes a circle a group.' });

  // ---------------------------------------------------------------------------------------------------
  // 1. Why Gray order: the torus unrolls
  // ---------------------------------------------------------------------------------------------------
  const D = 58;
  /** a cell of the 4×4 map bent by sc (columns round a cylinder) and sr (rows round the ring): 3D point */
  function bend(i, j, sc, sr) {
    const L = 4 * D, u = (j - 1.5) * D, v = (i - 1.5) * D;
    let x = u, z = 0, r = 0;
    if (sc > 1e-3) { r = L / (2 * Math.PI * sc); x = r * Math.sin(u / r); z = r * (1 - Math.cos(u / r)); }
    let y = v;
    if (sr > 1e-3) {
      const k = 1 + sr, R = (k * L) / (2 * Math.PI * sr), Za = r + R, a = (k * v) / R, rho = Za - z;
      y = rho * Math.sin(a); z = Za - rho * Math.cos(a);
    }
    return { x, y, z };
  }
  /** a projection for a pair of bends: at(i, j) for any point of the sheet (i, j in cell units), and the 16 cells */
  function project(sc, sr) {
    const pts = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) pts.push({ i, j, p: bend(i, j, sc, sr) });
    const mx = pts.reduce((a, q) => a + q.p.x, 0) / 16, my = pts.reduce((a, q) => a + q.p.y, 0) / 16, mz = pts.reduce((a, q) => a + q.p.z, 0) / 16;
    const g = (Math.PI / 2) * sr, tau = 1.0 * sr + 0.6 * Math.min(1, sc) * (1 - sr);
    const view = (p) => {
      let x = p.x - mx, y = p.y - my;
      const z = p.z - mz;
      [x, y] = [x * Math.cos(g) - y * Math.sin(g), x * Math.sin(g) + y * Math.cos(g)];
      const k = 1 + 0.9 * Math.max(sc, sr);
      return { x: x * k, y: (y * Math.cos(tau) - z * Math.sin(tau)) * k, d: y * Math.sin(tau) + z * Math.cos(tau) };
    };
    const at = (i, j) => view(bend(i, j, sc, sr));
    const out = {};
    let dmin = Infinity, dmax = -Infinity;
    for (const q of pts) { q.v = view(q.p); dmin = Math.min(dmin, q.v.d); dmax = Math.max(dmax, q.v.d); }
    for (const q of pts) {
      const t = dmax - dmin < 1 ? 0 : (q.v.d - dmin) / (dmax - dmin);
      out[q.i * 4 + q.j] = { x: q.v.x, y: q.v.y, s: 40 - 12 * t, far: t > 0.5, z: Math.round((1 - t) * 100) };
    }
    out.at = at;
    out.far = (d) => dmax - dmin > 1 && (d - dmin) / (dmax - dmin) > 0.5;
    return out;
  }
  const GRAY2 = [0, 1, 3, 2];
  const mOf = (i, j) => (GRAY2[i] << 2) | GRAY2[j];
  const b2 = (v) => v.toString(2).padStart(2, '0');

  S.topic({
    id: 'kmap-gray', family: 'p3-maps', order: 10, title: 'Why Gray order: the map is a torus',
    blurb: 'Counting order puts 01 next to 10, two bits apart. Gray order makes every step one bit, even the step from the end back to the start, so a map is really a ring of rings: a torus. Roll it up, then unroll it, and watch which cells were touching.',
    inputs: [{ id: 'm', kind: 'number', label: 'Cell to follow (0–15)', def: 5, min: 0, max: 15 }],
    presets: [
      { label: 'Cell 5: all four neighbours in view', values: { m: 5 } },
      { label: 'Cell 0: a corner, two neighbours across the edges', values: { m: 0 } },
      { label: 'Cell 8: on the bottom edge', values: { m: 8 } },
      { label: 'Cell 14: on the right edge', values: { m: 14 } },
    ],
    run(inp) {
      const Fr = new S.Frames();
      const m0 = inp.m, nbs = [0, 1, 2, 3].map((k) => m0 ^ (1 << k));
      const VAR = ['D', 'C', 'B', 'A'];
      // --- the one-dimensional story: a row of 2-bit codes
      const rowW = 4 * 74, rx = (k) => -rowW / 2 + k * 74 + 6, ry = -60;
      const diff = (a, b) => { let x = a ^ b, c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
      const rowItems = (order, ring, wrap) => {
        const items = [];
        order.forEach((code, k) => {
          let x = rx(k) + 31, y = ry + 31;
          if (ring) { const a = -Math.PI / 2 + (k * Math.PI) / 2 + Math.PI / 4; x = Math.cos(a) * 92; y = Math.sin(a) * 92 + 10; }
          items.push({ key: 'row:' + code, kind: 'state', x, y, w: 62, h: 62, rx: 12, text: b2(code), cls: 'tor', size: 18 });
        });
        if (!ring) for (let k = 0; k + 1 < 4; k++) {
          const d = diff(order[k], order[k + 1]);
          items.push({ key: 'rowd:' + k, kind: 'text', x: rx(k) + 68, y: ry + 92, text: d + (d === 1 ? ' bit' : ' bits'), anchor: 'middle', cls: d === 1 ? 'good' : 'bad', size: 13 });
        }
        if (wrap && !ring) items.push({ key: 'rowwrap', kind: 'edge', from: { x: rx(3) + 31, y: ry + 66 }, to: { x: rx(0) + 31, y: ry + 66 }, bend: 70, cls: 'wrap', label: diff(order[3], order[0]) + ' bit', lx: 0, ly: ry + 150, audit: 'edge-x' });
        if (ring) for (let k = 0; k < 4; k++) {
          const a = order[k], b = order[(k + 1) % 4];
          const ang = -Math.PI / 2 + (k * Math.PI) / 2 + Math.PI / 2;
          items.push({ key: 'ringd:' + k, kind: 'text', x: Math.cos(ang) * 132, y: Math.sin(ang) * 132 + 15, text: diff(a, b) + ' bit', anchor: 'middle', cls: 'good', size: 13 });
        }
        return items;
      };
      Fr.add({ items: rowItems([0, 1, 2, 3], false, false), say: 'Two variables counted in binary: 00, 01, 10, 11. Most neighbours differ in one bit, but 01 and 10 differ in two. Cells side by side should differ in exactly one variable, so this order will not do.' });
      Fr.add({ items: rowItems([0, 1, 3, 2], false, true), say: 'Swap the last two: 00, 01, 11, 10 is the Gray code. Every step changes one bit, and so does the step from 10 back round to 00.' });
      Fr.add({ items: rowItems([0, 1, 3, 2], true, false), say: 'So the row is really a ring: bend it round and 10 sits next to 00. Every code now has two neighbours, each one bit away, and there is no edge at all.' });
      // --- the map: flat, rolled into a cylinder, then a torus
      const lit = { hot: false };
      const cellsAt = (sc, sr, o) => {
        o = o || {};
        const pr = project(sc, sr), items = [];
        const flat = sc < 1e-3 && sr < 1e-3;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          const m = mOf(i, j), q = pr[i * 4 + j];
          const lit = o.hot && (m === m0 || nbs.includes(m)), far = q.far && !flat;
          const cls = ['tor', far ? 'far' : '', o.hot && m === m0 ? 'hot' : '', o.hot && nbs.includes(m) ? 'nb' : ''].filter(Boolean).join(' ');
          // the far side of the surface shows its cells as faint tiles (lit ones keep their numbers)
          items.push({ key: 'tc:' + m, kind: 'state', x: q.x, y: q.y, w: flat ? D - 4 : q.s, h: flat ? D - 4 : q.s, rx: flat ? 6 : q.s / 4, text: far && !lit ? '' : String(m), cls, z: flat ? 0 : q.z + (lit ? 200 : 0), audit: flat ? undefined : 'overlap-ok', size: flat ? 17 : 13, opacity: far && !lit ? 0.45 : 1 });
        }
        // the surface: a fine mesh of the sheet, its lines following every bend (hidden while it is flat)
        const steps = 24, rings = 8;
        for (let k = 0; k < rings; k++) {
          const i = -0.5 + (k * 4) / rings, j = -0.5 + (k * 4) / rings;
          for (let q = 0; q < steps; q++) {
            const t1 = -0.5 + (q * 4) / steps, t2 = -0.5 + ((q + 1) * 4) / steps;
            const a = pr.at(i, t1), b = pr.at(i, t2), c = pr.at(t1, j), d = pr.at(t2, j);
            items.push({ key: 'mu:' + k + ':' + q, kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, cls: 'tor-mesh', audit: 'ignore', layer: 'back', opacity: flat ? 0 : pr.far((a.d + b.d) / 2) ? 0.35 : 1 });
            items.push({ key: 'mv:' + k + ':' + q, kind: 'line', x1: c.x, y1: c.y, x2: d.x, y2: d.y, cls: 'tor-mesh', audit: 'ignore', layer: 'back', opacity: flat ? 0 : pr.far((c.d + d.d) / 2) ? 0.35 : 1 });
          }
        }
        if (flat) {
          const x0 = -2 * D, y0 = -2 * D;
          for (let k = 0; k < 4; k++) {
            items.push({ key: 'fc:' + k, kind: 'text', x: x0 + k * D + D / 2, y: y0 - 14, text: b2(GRAY2[k]), anchor: 'middle', cls: 'km-code', size: 14 });
            items.push({ key: 'fr:' + k, kind: 'text', x: x0 - 14, y: y0 + k * D + D / 2 + 5, text: b2(GRAY2[k]), anchor: 'end', cls: 'km-code', size: 14 });
          }
          items.push({ key: 'fcv', kind: 'text', x: x0 - 14, y: y0 - 30, text: 'AB \\ CD', anchor: 'end', cls: 'km-var', size: 13 });
          if (o.arcs) {
            // a dashed arc outside the map joins a cell to a neighbour on the far edge
            for (const nb of nbs) {
              const a = { i: GRAY2.indexOf(m0 >> 2), j: GRAY2.indexOf(m0 & 3) }, b = { i: GRAY2.indexOf(nb >> 2), j: GRAY2.indexOf(nb & 3) };
              if (a.i === b.i && Math.abs(a.j - b.j) === 3) {
                // same row, opposite edges: an arc above the map (top half) or below it (bottom half)
                const up = a.i < 2, y = up ? y0 - 32 : y0 + 4 * D + 10, xa = x0 + a.j * D + D / 2, xb = x0 + b.j * D + D / 2;
                items.push({ key: 'arc:' + nb, kind: 'edge', from: { x: Math.min(xa, xb), y }, to: { x: Math.max(xa, xb), y }, bend: up ? 46 : -46, cls: 'wrap', head: false, audit: 'edge-x' });
              }
              if (a.j === b.j && Math.abs(a.i - b.i) === 3) {
                // same column: an arc to the left of the map (left half, beyond the row codes) or to the right
                const left = a.j < 2, x = left ? x0 - 44 : x0 + 4 * D + 10, ya = y0 + a.i * D + D / 2, yb = y0 + b.i * D + D / 2;
                items.push({ key: 'arc:' + nb, kind: 'edge', from: { x, y: Math.min(ya, yb) }, to: { x, y: Math.max(ya, yb) }, bend: left ? -46 : 46, cls: 'wrap', head: false, audit: 'edge-x' });
              }
            }
          }
        }
        return items;
      };
      Fr.add({ items: cellsAt(0, 0), say: 'Now four variables: the rows run 00, 01, 11, 10 for AB and so do the columns for CD. Each cell holds its minterm number. Within the square, side-by-side cells differ in one variable.' });
      Fr.add({ items: cellsAt(0.5, 0), say: 'The columns are a ring too: start rolling the map so its left edge (CD = 00) comes round towards its right edge (CD = 10).' });
      Fr.add({ items: cellsAt(1, 0), say: 'Rolled up, the map is a cylinder: column 10 now touches column 00. Cells 0 and 2, 4 and 6, 12 and 14, 8 and 10 are now neighbours: CD = 00 and CD = 10 differ in C alone.' });
      Fr.add({ items: cellsAt(1, 0.5), say: 'The rows are a ring as well: bend the cylinder so its top (AB = 00) comes round to meet its bottom (AB = 10).' });
      Fr.add({ items: cellsAt(1, 1), say: 'Closed up, the map is a torus, a ring doughnut. On its surface every one of the 16 cells has exactly four neighbours, one for each variable, and none of them is at an edge: a torus has no edges.' });
      Fr.add({ items: cellsAt(1, 1, { hot: true }), say: 'Follow cell ' + m0 + ' (' + m0.toString(2).padStart(4, '0') + '). Its four neighbours are ' + nbs.map((x, k) => x + ' (' + VAR[k] + ' changes)').join(', ') + '. On the torus they all touch it.', meta: { nb: true } });
      Fr.add({ items: cellsAt(1, 0.5, { hot: true }), say: 'Unroll the rows again. Watch where the neighbours of ' + m0 + ' go.' });
      Fr.add({ items: cellsAt(0.5, 0, { hot: true }), say: 'Unroll the columns.' });
      const wrapN = nbs.filter((nb) => { const a = { i: GRAY2.indexOf(m0 >> 2), j: GRAY2.indexOf(m0 & 3) }, b = { i: GRAY2.indexOf(nb >> 2), j: GRAY2.indexOf(nb & 3) }; return Math.abs(a.i - b.i) === 3 || Math.abs(a.j - b.j) === 3; });
      Fr.add({ items: cellsAt(0, 0, { hot: true, arcs: true }), say: 'Flat again. ' + (wrapN.length ? (wrapN.length === 1 ? 'One neighbour' : 'Two neighbours') + ' of ' + m0 + ' (' + wrapN.join(' and ') + ') ' + (wrapN.length === 1 ? 'now sits' : 'now sit') + ' at the far edge, joined by the dashed arc: they touched on the torus. That is why groups may wrap round the edges of a map.' : 'All four neighbours of ' + m0 + ' sit beside it on the flat map; a cell on an edge would have some at the far side.'), mark: 'unrolled' });
      lit.hot = true;
      return { frames: Fr.list, def: { sections: [{ id: 'g', kind: 'math', title: 'Gray code, 2 bits', text: '00 → 01 → 11 → 10 → (00)\nOne bit changes at every step,\nincluding the step back to the start.' }] } };
    },
    predict: [
      { at: (f, i) => i === 0, pick: 'option', options: ['00, 01, 10, 11', '00, 01, 11, 10', '00, 11, 01, 10', '01, 00, 10, 11'], ask: 'Which order makes every pair of neighbours differ in one bit, including the last and the first?', answer: '00, 01, 11, 10', explain: 'Gray order: 00 → 01 → 11 → 10 → 00 changes one bit at a time.' },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.nb, pick: 'option', options: ['2', '3', '4', '8'], ask: 'On the torus, how many neighbours does each cell of a 4-variable map have?', answer: '4', explain: 'One for each variable that can change: four variables, four neighbours.' },
    ],
    quiz: [
      { q: 'Why are the columns of a 4-variable map labelled 00, 01, 11, 10 and not 00, 01, 10, 11?', options: ['It saves space', 'So that cells side by side differ in one variable', 'Because 11 is larger than 10', 'To make the map symmetric'], answer: 1, why: 'Gray order makes each step one bit, so adjacent cells differ in exactly one variable and can be combined.' },
      { q: 'Which cell is a neighbour of cell 0 in a 4-variable map (rows AB, columns CD)?', options: ['5', '10', '2', '15'], answer: 2, why: '2 = 0010 differs from 0000 only in C. It sits at the far end of the top row; the map wraps.' },
      { q: 'What shape is a 4-variable K-map once its opposite edges are joined?', options: ['A sphere', 'A cylinder', 'A torus', 'A cube'], answer: 2, why: 'Joining left to right gives a cylinder; joining its ends gives a torus.' },
      { q: 'How many neighbours does a cell of an n-variable map have?', options: ['2', 'n', '2n', '2ⁿ'], answer: 1, why: 'Changing any one of the n variables gives a neighbour.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // 2. From truth table to map
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'kmap-build', family: 'p3-maps', order: 20, title: 'From truth table to map: 2, 3 and 4 variables',
    blurb: 'Each row of the truth table has a cell of its own on the map: the first variables pick the row, the rest pick the column, both in Gray order. Watch the rows land, and notice that 2 and 3 swap, and so do 6 and 7.',
    inputs: [P3.nInput(3), { id: 'f', kind: 'text', label: 'Function', def: 'Σm(1, 2, 3, 6)', check: P3.fnCheck() }],
    presets: [
      { label: '2 variables: XOR', values: { n: '2', f: "AB' + A'B" } },
      { label: '3 variables', values: { n: '3', f: 'Σm(1, 2, 3, 6)' } },
      { label: '4 variables', values: { n: '4', f: 'Σm(0, 3, 6, 7, 9, 12, 13, 14)' } },
      { label: '4 variables with don\'t-cares', values: { n: '4', f: 'Σm(1, 5, 7, 14) + d(2, 10, 15)' } },
    ],
    run(inp) {
      const Bo = B(), n = +inp.n, fn = P3.readFn(inp.f, n), vs = fn.vars;
      const g = Bo.kmap(fn);
      const rowH = n === 4 ? 30 : 34;
      const placed = new Set();
      const tt = (hotRow) => S.Kit.truth.draw({ vars: vs, outputs: { F: (env) => { const m = vs.reduce((a, v) => a * 2 + env[v], 0); const v = Bo.value(fn, m); return v === 'X' ? 'x' : v; } }, x: 0, y: 0, prefix: 'tt', rowH, hot: hotRow, done: [...placed] });
      const t0 = tt(null);
      const mx = t0.box.x + t0.box.w + 90, my = Math.max(0, (t0.box.h - (KM_H(g))) / 2);
      function KM_H(geo) { const F = K().frame(geo); return F.H; }
      const map = (hot) => K().draw({ geometry: g, x: mx, y: my, prefix: 'km', text: (m) => (placed.has(m) ? Bo.value(fn, m) : ''), hot: hot === undefined ? [] : [hot], bars: true });
      const Fr = new S.Frames(['placed']);
      const outCol = n;
      Fr.add({ items: tt(null).items.concat(map().items), say: 'The truth table of F over ' + vs.join(', ') + ' has ' + (1 << n) + ' rows; the map has ' + (1 << n) + ' cells. ' + (g.rowVars.length ? g.rowVars.join('') + ' picks the row of the map and ' : '') + g.colVars.join('') + ' picks the column, each in Gray order (' + g.colLabels.join(', ') + ').' });
      for (let m = 0; m < 1 << n; m++) {
        Fr.count('placed');
        const c = g.cellOf(m), t = tt(m), mp = map(m);
        placed.add(m);
        const v = Bo.value(fn, m);
        const fly = { key: 'fly:' + m, kind: 'cell', x: mp.cell(m).x, y: mp.cell(m).y, w: mp.frame.C, h: mp.frame.C, rx: 0, text: String(v), cls: 'km-cell hot ' + (v === 1 ? 'v1' : v === 0 ? 'v0' : 'vx'), enter: 'from', src: t.key(m, outCol), audit: 'overlap-ok', layer: 'top', size: 20 };
        const rowCode = g.rowVars.length ? g.rowLabels[c.r] : '', colCode = g.colLabels[c.c];
        Fr.add({ items: t.items.concat(mp.items, [fly]), say: 'Row ' + m + ': ' + vs.map((x, i) => x + ' = ' + c.bits[i]).join(', ') + ', F = ' + (v === 'X' ? 'X (don\'t care)' : v) + '. ' + (rowCode ? g.rowVars.join('') + ' = ' + rowCode + ' is map row ' + (c.r + 1) + ', and ' : '') + g.colVars.join('') + ' = ' + colCode + ' is column ' + (c.c + 1) + '.' + (c.c !== (m & ((1 << g.colVars.length) - 1)) || (g.rowVars.length && c.r !== m >> g.colVars.length) ? ' In Gray order that is not where counting would put it.' : ''), meta: { m } });
      }
      const ones = Bo.minterms(fn);
      Fr.add({ items: tt(null).items.concat(map().items), say: 'Every row has its cell. Read across the top row of cells: ' + g.cells.filter((c) => c.r === 0).map((c) => c.m).join(', ') + '. The 1s of F are at ' + P3.list(ones) + (fn.dc.size ? ', and X marks the don\'t-cares ' + P3.list(Bo.dontCares(fn)) : '') + '. The bars beside the map show where each variable is 1.', mark: 'map' });
      return { frames: Fr.list, def: { sections: [{ id: 'f', kind: 'math', title: 'The function', text: 'F = ' + Bo.sigma(fn) + '\nRows: ' + (g.rowVars.join('') || '–') + '   Columns: ' + g.colVars.join('') + '\nColumn order: ' + g.colLabels.join(' ') } ] }, counters: [{ id: 'placed', label: 'rows placed' }] };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.m === 2, pick: 'item', ask: 'Click the cell where row 2 will land.', answer: (fr, i) => 'km:c:2', explain: 'Row 2 has its last bits 10, the last column in Gray order.' },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.m === 6, pick: 'item', ask: 'Click the cell where row 6 will land.', answer: () => 'km:c:6', explain: 'Row 6 ends in 10 too, so it takes the last column.' },
    ],
    quiz: [
      { q: 'In a 3-variable map with A down the side and BC across, which minterm sits in the last column of the top row?', options: ['3', '2', '6', '7'], answer: 1, why: 'Top row is A = 0; the last column is BC = 10: 010 = 2.' },
      { q: 'Reading the cells of the top row of a 4-variable map left to right gives…', options: ['0, 1, 2, 3', '0, 1, 3, 2', '0, 4, 12, 8', '0, 2, 3, 1'], answer: 1, why: 'The columns run CD = 00, 01, 11, 10.' },
      { q: 'Which two rows of a 3-variable truth table are side by side in the map but not in the table?', options: ['0 and 1', '2 and 6', '1 and 2', '4 and 5'], answer: 1, why: '2 = 010 and 6 = 110 differ only in A, and sit in the same column, one above the other. (They are four rows apart in the table.)' },
      { q: 'How many cells does a map of 4 variables have?', options: ['8', '16', '4', '32'], answer: 1, why: 'One cell per row of the truth table: 2⁴ = 16.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // 3. Which circles are groups
  // ---------------------------------------------------------------------------------------------------
  const readCircles = (t) => String(t).split(';').map((s) => s.split(/[\s,]+/).filter(Boolean).map(Number)).filter((c) => c.length);
  S.topic({
    id: 'kmap-rules', family: 'p3-maps', order: 30, title: 'Grouping rules: which circles are groups',
    blurb: 'A group holds 1, 2, 4, 8 … cells, makes a rectangle (wrapping round the edges is fine), and holds only 1s and don\'t-cares. A group that could double is not prime. Each circle is judged, with its reasons.',
    inputs: [
      P3.nInput(4, ['3', '4']),
      { id: 'f', kind: 'text', label: 'Function', def: 'Σm(0, 2, 4, 5, 6, 7, 8, 10, 13, 15)', check: P3.fnCheck() },
      { id: 'circles', kind: 'text', label: 'Circles (cells, ; between circles)', def: '5, 7, 13, 15; 4, 5, 6; 0, 2, 8, 10; 5, 6; 4, 5; 5, 7, 6, 13; 0, 4, 8, 12; 2, 10',
        check: (v, inp) => { const n = +inp.n; const cs = readCircles(v); if (!cs.length) return 'Circles: give at least one list of cells'; if (cs.length > 9) return 'Circles: at most 9, so the tour stays short'; for (const c of cs) for (const m of c) if (!(Number.isInteger(m) && m >= 0 && m < 1 << n)) return 'Circles: ' + m + ' is not a cell of a ' + n + '-variable map'; return null; } },
    ],
    presets: [
      { label: 'A tour of good and bad circles', values: { n: '4', f: 'Σm(0, 2, 4, 5, 6, 7, 8, 10, 13, 15)', circles: '5, 7, 13, 15; 4, 5, 6; 0, 2, 8, 10; 5, 6; 4, 5; 5, 7, 6, 13; 0, 4, 8, 12; 2, 10' } },
      { label: 'Wrapping groups (3 variables)', values: { n: '3', f: 'Σm(0, 2, 4, 6, 7)', circles: '0, 2; 0, 2, 4, 6; 4, 6, 7; 6, 7; 0, 4' } },
      { label: 'Don\'t-cares inside a group', values: { n: '4', f: 'Σm(1, 3, 9) + d(11, 15, 7)', circles: '1, 3, 9, 11; 3, 7, 11, 15; 7, 15; 1, 9' } },
    ],
    run(inp) {
      const Bo = B(), n = +inp.n, fn = P3.readFn(inp.f, n), vs = fn.vars, g = Bo.kmap(fn);
      const circles = readCircles(inp.circles);
      const Fr = new S.Frames(['ok', 'bad']);
      const verdicts = [];
      const mapW = K().frame(g).W;
      const scene = (groups, extra) => {
        const k = K().draw({ geometry: g, x: 0, y: 0, prefix: 'km', groups });
        return k.items.concat(extra || []);
      };
      const below = K().frame(g).H + 40, cx = mapW / 2 + 20;
      Fr.add({ items: scene([], [P3.note('verdict', 'F = ' + Bo.sigma(fn), cx, below, 'km-note')]), say: 'The map of F = ' + Bo.sigma(fn) + '. Each circle below is checked against the rules: a power of two cells, a rectangle (wrapping allowed), only 1s and don\'t-cares, and then: can it double?' });
      const kept = [];
      circles.forEach((cells, ci) => {
        const ch = Bo.checkGroup(fn, cells, { geometry: g });
        const kind = !ch.ok ? 'no' : ch.prime ? 'prime' : 'small';
        verdicts.push(kind);
        const gk = 'c' + ci;
        Fr.add({ items: scene(kept.concat([{ key: gk, cells, tone: ci % 6, cls: 'strong' }]), [P3.note('verdict', 'Circle ' + (ci + 1) + ': cells ' + cells.join(', '), cx, below, 'km-note')]), say: 'Circle ' + (ci + 1) + ' takes cell' + (cells.length === 1 ? ' ' : 's ') + cells.join(', ') + '. Is it a group?', meta: { kind } });
        if (kind === 'no') Fr.count('bad'); else Fr.count('ok');
        const gs = kept.concat([{ key: gk, cells, tone: ci % 6, cls: kind === 'no' ? 'bad' : 'strong' }]);
        if (kind === 'small') gs.push({ key: gk + 'big', cells: ch.bigger.cells, tone: ci % 6, cls: 'ghost', inset: 2 });
        const label = kind === 'no' ? '✗ not a group' : kind === 'prime' ? '✓ prime implicant: ' + ch.term : '✓ a group (' + ch.term + '), but it can grow to ' + ch.bigger.term;
        Fr.add({ items: scene(gs, [P3.note('verdict', label, cx, below, kind === 'no' ? 'bad' : 'good')]), say: ch.say, mark: kind === 'no' ? undefined : 'group' });
        if (kind === 'prime') kept.push({ key: gk, cells, tone: ci % 6, enter: 'none' });
      });
      const nPrime = verdicts.filter((v) => v === 'prime').length, nSmall = verdicts.filter((v) => v === 'small').length, nNo = verdicts.filter((v) => v === 'no').length;
      Fr.add({ items: scene(kept, [P3.note('verdict', nPrime + ' prime, ' + nSmall + ' could grow, ' + nNo + ' not groups', cx, below, 'km-note')]), say: 'Of the ' + circles.length + ' circles, ' + nPrime + (nPrime === 1 ? ' is a prime implicant' : ' are prime implicants') + ' (kept on the map), ' + nSmall + ' ' + (nSmall === 1 ? 'is a group that can' : 'are groups that can') + ' still double, and ' + nNo + ' ' + (nNo === 1 ? 'breaks' : 'break') + ' a rule.' });
      return { frames: Fr.list, def: { sections: [{ id: 'r', kind: 'math', title: 'A group', text: '1. holds 1, 2, 4, 8, … cells\n2. is a rectangle (edges wrap)\n3. holds only 1s and Xs\nPrime: it cannot double and stay a group' }] }, counters: [{ id: 'ok', label: 'groups' }, { id: 'bad', label: 'not groups' }] };
    },
    predict: [
      { at: (f) => f.meta && f.meta.kind, pick: 'option', options: ['A prime implicant', 'A group, but not prime', 'Not a group'], ask: 'What is this circle?', answer: (fr, i) => ({ prime: 'A prime implicant', small: 'A group, but not prime', no: 'Not a group' })[fr[i].meta.kind], explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'Can a group hold 6 cells?', options: ['Yes, if they form a rectangle', 'No: the size must be a power of two', 'Only with don\'t-cares', 'Only in a 5-variable map'], answer: 1, why: 'A group is a cube: it drops k variables and holds 2ᵏ cells.' },
      { q: 'In a 4-variable map, are the four corner cells 0, 2, 8, 10 a group?', options: ['No, they are not touching', 'Yes: the edges wrap both ways, giving B\'D\'', 'Only if they are don\'t-cares', 'Yes, giving A\'C\''], answer: 1, why: 'Wrapping left-right and top-bottom joins the corners into one 2×2 block where B = 0 and D = 0.' },
      { q: 'A group of two 1s could be doubled into a group of four 1s. What is the smaller group?', options: ['A prime implicant', 'Not an implicant', 'An implicant that is not prime', 'Essential'], answer: 2, why: 'It is a valid implicant, but a prime implicant is one that cannot grow.' },
      { q: 'May a group include a don\'t-care cell?', options: ['Never', 'Yes, when that makes the group bigger', 'Only if every cell is a don\'t-care', 'Only in POS'], answer: 1, why: 'A don\'t-care may be taken as 1 whenever that helps.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
