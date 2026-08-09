// The K-map of the function workbench: maps for 1 to 6 variables (5 as two maps side by side, 6 as four in a
// square) drawn in Gray order with the minterm number in each cell, the student's groups drawn over them, and
// grouping by dragging: press on a cell and drag to the opposite corner of the rectangle; dragging past an edge
// wraps round to the other side, and dragging into a neighbouring map takes the same rectangle in each map.
(function (S) {
  'use strict';
  const KM = S.FuncKmap = {};
  const CELL = 50, LM = 64, TM = 64, GX = 74, GY = 74, PAD = 14;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const txt = (s, x, y, size, anchor, cls, extra) => `<text class="${cls}" x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor || 'middle'}" dominant-baseline="central"${extra || ''}>${esc(s)}</text>`;

  /** where each map sits: {x0, y0} of map i */
  function frame(g) {
    const mw = g.cols * CELL, mh = g.rows * CELL;
    const mrs = Math.max(...g.maps.map((m) => m.mr)) + 1, mcs = Math.max(...g.maps.map((m) => m.mc)) + 1;
    const pos = g.maps.map((m) => ({ x0: PAD + LM + m.mc * (mw + GX), y0: PAD + TM + m.mr * (mh + GY) }));
    const W = PAD * 2 + LM + mcs * mw + (mcs - 1) * GX, H = PAD * 2 + TM + mrs * mh + (mrs - 1) * GY + 4;
    return { mw, mh, pos, W, H };
  }
  KM.frame = frame;

  /**
   * Draw a map into el. o: { fn, form, groups: [{cells, check}], suggest: [[cells]], miss, bad, haz: [[a, b]], onGroup(cells) }.
   * Returns { svg, cellsAt(fromCell, toPoint) } for tests.
   */
  KM.draw = function (el, o) {
    const B = S.Bool;
    const g = B.kmap(o.fn);
    const fr = frame(g);
    const n = g.n;
    let s = `<svg class="km" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fr.W} ${fr.H}" width="${fr.W}" height="${fr.H}" style="width: min(100%, ${Math.round(fr.W * (n <= 4 ? 1.3 : 1.1))}px)" role="img" aria-label="Karnaugh map of ${esc(o.fn.vars.join(', '))}">`;
    const target = o.form === 'pos' ? 0 : 1;
    // labels: map titles, variable names, Gray codes
    g.maps.forEach((mp, i) => {
      const { x0, y0 } = fr.pos[i];
      if (mp.label) s += txt(mp.label, x0 + fr.mw / 2, y0 - 50, 13, 'middle', 'km-title');
      if (g.colVars.length) s += txt(g.colVars.join(''), x0 + fr.mw / 2, y0 - 31, 13, 'middle', 'km-var');
      if (g.rowVars.length) s += txt(g.rowVars.join(''), x0 - 12, y0 - 12, 13, 'end', 'km-var');
      g.colLabels.forEach((lb, c) => { if (lb) s += txt(lb, x0 + c * CELL + CELL / 2, y0 - 12, 12, 'middle', 'km-code'); });
      g.rowLabels.forEach((lb, r) => { if (lb) s += txt(lb, x0 - 10, y0 + r * CELL + CELL / 2, 12, 'end', 'km-code'); });
    });
    // cells
    const at = (m) => { const c = g.cellOf(m), p = fr.pos[c.map]; return { x: p.x0 + c.c * CELL, y: p.y0 + c.r * CELL, c }; };
    const marks = new Map();
    if (o.miss != null) marks.set(o.miss, 'miss');
    if (o.bad != null) marks.set(o.bad, 'badcell');
    for (const pair of o.haz || []) for (const m of pair) if (!marks.has(m)) marks.set(m, 'haz');
    for (const cell of g.cells) {
      const { x, y } = at(cell.m);
      const v = cell.value, cls = 'km-cell' + (v === 'X' ? ' dc' : v === target ? ' on' : ' off') + (marks.has(cell.m) ? ' ' + marks.get(cell.m) : '');
      s += `<g class="${cls}" data-m="${cell.m}" data-audit="node"><rect class="km-box" x="${x}" y="${y}" width="${CELL}" height="${CELL}"/>`;
      s += txt(v === 'X' ? '×' : String(v), x + CELL / 2, y + CELL / 2 + 2, 18, 'middle', 'km-v');
      s += txt(String(cell.m), x + 5, y + 10, 10, 'start', 'km-m', ' data-audit="small-ok"') + '</g>';
    }
    // groups: each piece a rounded rectangle, nested groups inset a little more so their edges stay apart
    const piecesOf = (cells) => {
      const ok = cells.length && (cells.length & (cells.length - 1)) === 0;
      const span = ok ? B.spanCube(cells, n) : null;
      if (span && B.cubeSize(span) === cells.length) { try { return B.kmapGroup(g, span).pieces; } catch (e) { /* fall through */ } }
      return cells.map((m) => { const c = g.cellOf(m); return { map: c.map, r: c.r, c: c.c, h: 1, w: 1 }; });
    };
    const rect = (pc, inset, cls, i) => {
      const p = fr.pos[pc.map];
      const x = p.x0 + pc.c * CELL + inset, y = p.y0 + pc.r * CELL + inset, w = pc.w * CELL - 2 * inset, h = pc.h * CELL - 2 * inset;
      return `<rect class="${cls}" data-audit="overlap-ok" data-group="${i}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(14, h / 2.4, w / 2.4)}"/>`;
    };
    s += '<g class="km-groups">';
    (o.suggest || []).forEach((cells, i) => { for (const pc of piecesOf(cells)) s += rect(pc, 3, 'km-sugg', 's' + i); });
    (o.groups || []).forEach((gr, i) => {
      const ok = gr.check && gr.check.ok;
      for (const pc of piecesOf(gr.cells)) s += rect(pc, 5 + (i % 4) * 3, 'km-grp g' + (i % 8) + (ok ? (gr.check.prime ? '' : ' np') : ' bad'), i);
    });
    s += '</g><g class="km-drag" data-audit="ignore"></g></svg>';
    el.innerHTML = s;
    const svg = el.querySelector('svg');
    const dragG = svg.querySelector('.km-drag');

    // ---- grouping by dragging --------------------------------------------------------------------------------
    const toSvg = (ev) => { const m = svg.getScreenCTM().inverse(); const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m); return { x: p.x, y: p.y }; };
    const mapAt = (pt) => fr.pos.findIndex((p) => pt.x >= p.x0 && pt.x < p.x0 + fr.mw && pt.y >= p.y0 && pt.y < p.y0 + fr.mh);
    const ring = (a, b, L) => {
      // positions from a towards the raw position b, wrapping round a ring of L (at most L of them)
      const out = [], step = b >= a ? 1 : -1;
      for (let k = a; ; k += step) { out.push(((k % L) + L) % L); if (k === b || out.length >= L) break; }
      return [...new Set(out)];
    };
    /** the cells of the rectangle from a start cell to a point on the drawing */
    function cellsTo(start, pt) {
      const sc = g.cellOf(start), sp = fr.pos[sc.map];
      let mi = mapAt(pt);
      let rows, cols, maps;
      if (mi < 0 || mi === sc.map) {
        const rr = Math.floor((pt.y - sp.y0) / CELL), cc = Math.floor((pt.x - sp.x0) / CELL);
        rows = ring(sc.r, rr, g.rows); cols = ring(sc.c, cc, g.cols); maps = [sc.map];
      } else {
        const p = fr.pos[mi];
        const rr = Math.min(g.rows - 1, Math.max(0, Math.floor((pt.y - p.y0) / CELL))), cc = Math.min(g.cols - 1, Math.max(0, Math.floor((pt.x - p.x0) / CELL)));
        rows = ring(sc.r, rr, g.rows); cols = ring(sc.c, cc, g.cols);
        const a = g.maps[sc.map], b = g.maps[mi];
        maps = g.maps.filter((m) => m.mr >= Math.min(a.mr, b.mr) && m.mr <= Math.max(a.mr, b.mr) && m.mc >= Math.min(a.mc, b.mc) && m.mc <= Math.max(a.mc, b.mc)).map((m) => m.i);
      }
      const out = [];
      for (const c of g.cells) if (maps.includes(c.map) && rows.includes(c.r) && cols.includes(c.c)) out.push(c.m);
      return out.sort((x, y) => x - y);
    }
    let drag = null;
    const preview = (cells) => {
      let t = '';
      for (const m of cells) { const { x, y } = at(m); t += `<rect class="km-pre" x="${x + 2}" y="${y + 2}" width="${CELL - 4}" height="${CELL - 4}" rx="6"/>`; }
      dragG.innerHTML = t;
    };
    svg.addEventListener('pointerdown', (ev) => {
      const cg = ev.target.closest('[data-m]');
      if (!cg || ev.button !== 0) return;
      ev.preventDefault();
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic */ }
      drag = { start: +cg.dataset.m, cells: [+cg.dataset.m] };
      preview(drag.cells);
    });
    svg.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      drag.cells = cellsTo(drag.start, toSvg(ev));
      preview(drag.cells);
    });
    const end = (ev) => {
      if (!drag) return;
      const cells = ev.type === 'pointerup' ? cellsTo(drag.start, toSvg(ev)) : drag.cells;
      drag = null; dragG.innerHTML = '';
      if (ev.type === 'pointerup' && o.onGroup) o.onGroup(cells);
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    return { svg, g, cellsTo, at: (m) => { const r = at(m); const ctm = svg.getScreenCTM(); return [ctm.a * (r.x + CELL / 2) + ctm.e, ctm.d * (r.y + CELL / 2) + ctm.f]; } };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
