// ASM charts on the stage, drawn the way a drafter draws them: one column of ASM blocks in state order, each a
// state box (its name to the left, its code to the right) with its decision diamonds and conditional boxes
// flowing down under it inside a dashed frame. A diamond's exits leave down and to the right, labelled 1 and 0.
// A path back to an earlier state (or the same one) runs down out of its block and up a return lane on the left,
// one lane per target, nested so that no two lanes cross; a path that skips ahead runs down a lane on the right;
// a path to the very next block drops straight into it when nothing has to pass it. Which branch of a diamond
// goes down is chosen so that, along the bottom of every block, the returns lie to the left of the forward
// paths and in lane order, so the connectors never cross. Highlights follow a run: the present block, the boxes
// on the path taken this clock and the connectors along it.
// S.Kit.asm.draw(chart, opts) -> {items, box, layout}; S.Kit.asm.blockBox / narrow (a phone's camera on one
// block); S.Kit.asm.regs (registers as cells).
(function (S) {
  'use strict';
  const Geo = S.geom;
  const K = (S.Kit = S.Kit || {});
  const AK = (K.asm = {});
  const VG = 24, HG = 30, DH = 56, FS = 14, LVL = 13, TRACK = 16;
  const SQ2 = Math.SQRT2;

  const tw = (t, size) => Geo.textWidth(t, size || FS, { mono: true });
  /** the size of a box: state and conditional boxes fit their lines; a diamond is DH tall and k·DH wide */
  function sizeOf(b) {
    if (b.kind === 'decision') {
      const w = Math.max(1.5 * DH, 1.5 * tw(b.cond) + 26);
      const k = Math.min(3.4, Math.ceil((w / DH) * 5 - 1e-9) / 5);
      return { w: k * DH, h: DH, k };
    }
    const lines = (b.actions || []).length ? b.actions : [''];
    const w = Math.max(b.kind === 'state' ? 116 : 96, ...lines.map((l) => tw(l) + 26));
    const h = b.kind === 'state' ? Math.max(42, lines.length * 19 + 18) : Math.max(34, lines.length * 19 + 14);
    return { w, h, lines };
  }
  /** tracks for lanes: shorter spans inside, a lane outside every lane whose span overlaps it and is shorter */
  function tracks(spans) {
    const list = [...spans.entries()].sort((a, b) => (a[1][1] - a[1][0]) - (b[1][1] - b[1][0]) || a[1][0] - b[1][0]);
    const out = new Map();
    for (const [t, sp] of list) {
      let k = 0;
      for (const [u, k2] of out) { const o = spans.get(u); if (o[0] <= sp[1] && sp[0] <= o[1]) k = Math.max(k, k2 + 1); }
      out.set(t, k);
    }
    return out;
  }

  const cache = new WeakMap();
  /** the layout of a chart (kept per chart object) */
  AK.layout = function (ch) {
    if (cache.has(ch)) return cache.get(ch);
    const A = S.Asm, ids = new Map(ch.boxes.map((b) => [b.id, b]));
    const states = [ch.start].concat(A.states(ch).filter((s) => s !== ch.start));
    const idx = new Map(states.map((s, i) => [s, i]));
    const stateBox = (s) => ch.boxes.find((b) => b.kind === 'state' && (b.name || b.id) === s);
    const nameOf = (b) => b.name || b.id;
    const isExit = (id) => ids.get(id).kind === 'state';
    // 1. which targets each block reaches, and the lanes they need (spans in blocks)
    const targetsUnder = (id, acc) => { const b = ids.get(id); if (b.kind === 'state') acc.push(nameOf(b)); else if (b.kind === 'decision') { targetsUnder(b.t, acc); targetsUnder(b.f, acc); } else targetsUnder(b.next, acc); return acc; };
    const leftSpan = new Map(), rightSpan = new Map();
    states.forEach((s, i) => {
      for (const t of targetsUnder(stateBox(s).next, [])) {
        const j = idx.get(t);
        if (j <= i) { const sp = leftSpan.get(t) || [j, i]; sp[1] = Math.max(sp[1], i); leftSpan.set(t, sp); } else { const sp = rightSpan.get(t) || [i, j]; sp[0] = Math.min(sp[0], i); rightSpan.set(t, sp); }
      }
    });
    const trL = tracks(leftSpan), trR = tracks(rightSpan);
    // 2. which branch of each diamond goes down: returns to the left of forwards, inner lanes first
    const flip = new Map();
    const keysOf = (id, block) => {
      const b = ids.get(id);
      if (b.kind === 'state') { const t = nameOf(b), j = idx.get(t), i = idx.get(block); return [j <= i ? trL.get(t) : 1000 + trR.get(t)]; }
      if (b.kind !== 'decision') return keysOf(b.next, block);
      const a = keysOf(b.t, block), c = keysOf(b.f, block);
      const inv = (xs) => { let n = 0; for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (xs[i] > xs[j]) n++; return n; };
      const one = a.concat(c), zero = c.concat(a);
      const f = inv(zero) < inv(one);
      flip.set(id, f);
      return f ? zero : one;
    };
    for (const s of states) keysOf(stateBox(s).next, s);
    const downOf = (b) => (flip.get(b.id) ? { id: b.f, v: 0 } : { id: b.t, v: 1 });
    const rightOf = (b) => (flip.get(b.id) ? { id: b.t, v: 1 } : { id: b.f, v: 0 });
    // 3. measure: each subtree's width and the offset of its main column from its left edge
    const meas = new Map();
    const measure = (id, root) => {
      const b = ids.get(id);
      if (b.kind === 'state' && !root) return { exit: true, w: 22, c: 11 };
      const sz = sizeOf(b);
      let r;
      if (b.kind === 'decision') {
        const d = measure(downOf(b).id), f = measure(rightOf(b).id);
        const c = Math.max(sz.w / 2, d.c);
        const fl = Math.max(c - d.c + d.w + HG, c + sz.w / 2 + 22 - f.c);
        r = { sz, d, f, c, fl, w: Math.max(c + sz.w / 2, fl + f.w) };
      } else {
        const ch1 = measure(b.next);
        const c = Math.max(sz.w / 2, ch1.c);
        r = { sz, child: ch1, c, w: Math.max(c + sz.w / 2, c - ch1.c + ch1.w) };
      }
      meas.set(id, r);
      return r;
    };
    const roots = states.map((s) => measure(stateBox(s).id, true));
    const nameW = states.map((s) => Geo.textWidth(s, 14, { bold: true }));
    const X0 = Math.max(...states.map((s, i) => Math.max(roots[i].c, sizeOf(stateBox(s)).w / 2 + 20 + nameW[i])));
    // 4. place the blocks top to bottom
    const boxes = [], segs = [], labels = [], exits = [], blocks = [];
    let y0 = 0;
    states.forEach((s, bi) => {
      const sb = stateBox(s);
      let bottom = y0;
      const bExits = [];
      const place = (id, xc, y, from, branch, root) => {
        const b = ids.get(id);
        if (b.kind === 'state' && !root) { const e = { x: xc, y, target: nameOf(b), from, branch, block: s, bi }; exits.push(e); bExits.push(e); return; }
        const r = meas.get(id), sz = r.sz;
        if (b.kind === 'decision') {
          const ym = y + DH / 2;
          boxes.push({ id, kind: 'decision', x: xc, y: ym, w: sz.w, h: sz.h, k: sz.k, text: b.cond, block: s });
          bottom = Math.max(bottom, y + DH);
          const dn = downOf(b), rt = rightOf(b);
          const fc = xc - r.c + r.fl + r.f.c;
          labels.push({ key: id + ':' + dn.v, x: xc + 7, y: y + DH + 13, text: String(dn.v), dec: id, v: dn.v }, { key: id + ':' + rt.v, x: xc + sz.w / 2 + 5, y: ym - 7, text: String(rt.v), dec: id, v: rt.v });
          if (isExit(dn.id)) place(dn.id, xc, y + DH, id, dn.v);
          else { segs.push({ kind: 'arrow', x1: xc, y1: y + DH, x2: xc, y2: y + DH + VG, pair: id + '>' + dn.id }); place(dn.id, xc, y + DH + VG, id, dn.v); }
          if (isExit(rt.id)) { segs.push({ kind: 'line', x1: xc + sz.w / 2, y1: ym, x2: fc, y2: ym, branchOf: id, v: rt.v, exitTo: nameOf(ids.get(rt.id)) }); place(rt.id, fc, ym, id, rt.v); } else {
            segs.push({ kind: 'line', x1: xc + sz.w / 2, y1: ym, x2: fc, y2: ym, pair: id + '>' + rt.id });
            segs.push({ kind: 'arrow', x1: fc, y1: ym, x2: fc, y2: ym + DH / 2 + VG - 6, pair: id + '>' + rt.id });
            place(rt.id, fc, ym + DH / 2 + VG - 6, id, rt.v);
          }
          return;
        }
        boxes.push({ id, kind: b.kind, x: xc - sz.w / 2, y, w: sz.w, h: sz.h, lines: sz.lines, block: s });
        bottom = Math.max(bottom, y + sz.h);
        if (isExit(b.next)) place(b.next, xc, y + sz.h, id, null);
        else { segs.push({ kind: 'arrow', x1: xc, y1: y + sz.h, x2: xc, y2: y + sz.h + VG, pair: id + '>' + b.next }); place(b.next, xc, y + sz.h + VG, id, null); }
      };
      place(sb.id, X0, y0, null, null, true);
      // the exits of this block: returns go left, forwards right; a single drop into the next block when nothing
      // has to pass it
      const rets = bExits.filter((e) => idx.get(e.target) <= bi), fwds = bExits.filter((e) => idx.get(e.target) > bi);
      for (const e of fwds) e.straight = !rets.length && Math.abs(e.x - X0) < 0.5 && idx.get(e.target) === bi + 1;
      const lane = fwds.filter((e) => !e.straight);
      rets.sort((a, b) => a.x - b.x).forEach((e, k) => { e.side = 'L'; e.level = bottom + 24 + k * LVL; });
      lane.sort((a, b) => b.x - a.x).forEach((e, k) => { e.side = 'R'; e.level = bottom + 24 + k * LVL; });
      const nl = Math.max(rets.length, lane.length);
      const end = bottom + (nl ? 24 + (nl - 1) * LVL : 0);
      blocks.push({ state: s, id: sb.id, bi, top: y0, bottom, end, nameW: nameW[bi], boxLeft: X0 - sizeOf(sb).w / 2 });
      y0 = end + 24 + 22;
    });
    const entryY = (t) => blocks[idx.get(t)].top - 20;
    // 5. lanes
    const minX = Math.min(...boxes.map((q) => (q.kind === 'decision' ? q.x - q.w / 2 : q.x)), ...blocks.map((b) => b.boxLeft - 12 - b.nameW)) - 22;
    const maxX = Math.max(...boxes.map((q) => (q.kind === 'decision' ? q.x + q.w / 2 : q.x + q.w)), ...exits.map((e) => e.x)) + 24;
    const laneX = (e) => (e.side === 'L' ? minX - trL.get(e.target) * TRACK : maxX + trR.get(e.target) * TRACK);
    for (const e of exits) {
      if (e.straight) { segs.push({ kind: 'line', x1: e.x, y1: e.y, x2: e.x, y2: entryY(e.target), exit: e }); continue; }
      const lx = laneX(e);
      segs.push({ kind: 'line', x1: e.x, y1: e.y, x2: e.x, y2: e.level, exit: e });
      segs.push({ kind: 'line', x1: e.x, y1: e.level, x2: lx, y2: e.level, exit: e });
    }
    const lanes = [];
    for (const side of ['L', 'R']) for (const t of states) {
      const es = exits.filter((e) => !e.straight && e.side === side && e.target === t);
      if (!es.length) continue;
      const lx = laneX(es[0]), ey = entryY(t), lv = es.map((e) => e.level);
      const y1 = side === 'L' ? Math.max(...lv) : Math.min(...lv);
      segs.push({ kind: 'line', x1: lx, y1, x2: lx, y2: ey, lane: t, side });
      segs.push({ kind: 'line', x1: lx, y1: ey, x2: X0, y2: ey, lane: t, side });
      lanes.push({ target: t, side, x: lx });
    }
    for (const t of states) if (exits.some((e) => e.target === t)) segs.push({ kind: 'arrow', x1: X0, y1: entryY(t), x2: X0, y2: blocks[idx.get(t)].top, entry: t });
    const lefts = lanes.filter((l) => l.side === 'L').map((l) => l.x), rights = lanes.filter((l) => l.side === 'R').map((l) => l.x);
    const bx = Math.min(minX, ...lefts) - 8, br = Math.max(maxX, ...rights) + 8;
    const lay = { blocks, boxes, segs, labels, exits, lanes, states, X0, box: { x: bx, y: -32, w: br - bx, h: blocks[blocks.length - 1].end + 44 } };
    cache.set(ch, lay);
    return lay;
  };

  /** the frame around a state's ASM block (chart coordinates) */
  AK.blockBox = function (ch, state) {
    const L = AK.layout(ch), b = L.blocks.find((q) => q.state === state);
    const bx = L.boxes.filter((q) => q.block === b.state);
    const minX = Math.min(...bx.map((q) => (q.kind === 'decision' ? q.x - q.w / 2 : q.x))), maxX = Math.max(...bx.map((q) => (q.kind === 'decision' ? q.x + q.w / 2 : q.x + q.w)));
    const l0 = Math.min(minX, b.boxLeft - 12 - b.nameW);
    return { x: l0 - 8, y: b.top - 10, w: maxX - l0 + 16, h: b.bottom - b.top + 20 };
  };
  /** a camera for a phone: the block of a state (and an extra box beside it), never smaller than 320 × 300 */
  AK.narrow = function (ch, state, extra) {
    let r = AK.blockBox(ch, state);
    if (extra) r = Geo.union([r, extra]);
    const w = Math.max(320, r.w + 40), h = Math.max(300, r.h + 70);
    return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2 + 10, w, h };
  };

  /**
   * Draw a chart. opts: {prefix, x, y, state (the present state: its block lit), path: [box ids taken this
   * clock], tests: {box id: 0|1}, next (the state the path leads to), codes: {state: code}, hotBoxes: [ids]}
   */
  AK.draw = function (ch, opts) {
    opts = opts || {};
    const L = AK.layout(ch), P = opts.prefix || 'asm', ox = opts.x || 0, oy = opts.y || 0;
    const X = (v) => v + ox, Y = (v) => v + oy;
    const path = opts.path || [], onPath = new Set(path), tests = opts.tests || {};
    const pairs = new Set(); for (let i = 0; i + 1 < path.length; i++) pairs.add(path[i] + '>' + path[i + 1]);
    const last = path[path.length - 1];
    const taken = (e) => !!opts.next && path.length > 0 && e.target === opts.next && e.from === last && (e.branch == null || tests[last] === e.branch);
    const takenExit = L.exits.find(taken);
    const items = [];
    for (const b of L.blocks) {
      const r = AK.blockBox(ch, b.state);
      items.push({ key: P + ':blk:' + b.state, kind: 'region', x: X(r.x), y: Y(r.y), w: r.w, h: r.h, rx: 10, cls: 'asm-blk' + (opts.state === b.state ? ' cur' : ''), audit: 'group' });
    }
    for (const q of L.boxes) {
      const hot = onPath.has(q.id) || (opts.hotBoxes || []).includes(q.id);
      if (q.kind === 'decision') {
        const s = q.h / SQ2;
        // the diamond is a square turned 45° and stretched sideways by its class (styles-p9.css)
        items.push({ key: P + ':b:' + q.id, kind: 'cell', x: X(q.x - s / 2), y: Y(q.y - s / 2), w: s, h: s, rx: 0, text: '', cls: 'asm-dec dk' + Math.round(q.k * 10) + (hot ? ' hot' : ''), pick: true });
        items.push({ key: P + ':g:' + q.id, kind: 'region', x: X(q.x - q.w / 2), y: Y(q.y - q.h / 2), w: q.w, h: q.h, rx: 0, cls: 'asm-ghost', audit: 'ignore', layer: 'back' });
        items.push({ key: P + ':t:' + q.id, kind: 'text', x: X(q.x), y: Y(q.y + 5), text: q.text, anchor: 'middle', cls: 'asm-cond' + (hot ? ' hot' : ''), size: FS });
      } else {
        const it = { key: P + ':b:' + q.id, kind: 'cell', x: X(q.x), y: Y(q.y), w: q.w, h: q.h, rx: q.kind === 'cond' ? Math.min(q.h / 2, 17) : 3, cls: 'mono ' + (q.kind === 'state' ? 'asm-state' : 'asm-cbox') + (hot ? ' hot' : ''), size: FS, pick: true };
        if (q.lines.length > 1) it.lines = q.lines; else it.text = q.lines[0];
        items.push(it);
        if (q.kind === 'state') {
          const st = ch.boxes.find((b) => b.id === q.id), nm = st.name || st.id;
          items.push({ key: P + ':n:' + q.id, kind: 'text', x: X(q.x - 8), y: Y(q.y + 16), text: nm, anchor: 'end', cls: 'asm-name' + (opts.state === nm ? ' hot' : ''), size: 14 });
          if (opts.codes && opts.codes[nm] !== undefined) items.push({ key: P + ':c:' + q.id, kind: 'text', x: X(q.x + q.w + 6), y: Y(q.y + 14), text: opts.codes[nm], anchor: 'start', cls: 'asm-code', size: 14 });
        }
      }
    }
    for (const l of L.labels) items.push({ key: P + ':lb:' + l.key, kind: 'text', x: X(l.x), y: Y(l.y), text: l.text, anchor: 'start', cls: 'asm-branch' + (onPath.has(l.dec) && tests[l.dec] === l.v ? ' hot' : ''), size: 14 });
    L.segs.forEach((g, i) => {
      let hot = false;
      if (g.pair) hot = pairs.has(g.pair);
      else if (g.branchOf) hot = last === g.branchOf && tests[g.branchOf] === g.v && opts.next === g.exitTo;
      else if (g.exit) hot = taken(g.exit);
      else if (g.lane) hot = !!takenExit && !takenExit.straight && takenExit.target === g.lane && takenExit.side === g.side;
      else if (g.entry) hot = !!takenExit && takenExit.target === g.entry;
      const base = { key: P + ':w:' + i, cls: 'asm-wire' + (hot ? ' hot' : '') };
      if (g.kind === 'arrow') items.push(Object.assign(base, { kind: 'edge', from: { x: X(g.x1), y: Y(g.y1) }, to: { x: X(g.x2), y: Y(g.y2) }, cls: 'asm-arrow' + (hot ? ' hot' : '') }));
      else items.push(Object.assign(base, { kind: 'line', x1: X(g.x1), y1: Y(g.y1), x2: X(g.x2), y2: Y(g.y2), layer: 'lines' }));
    });
    const b = L.box;
    return { items, layout: L, box: { x: b.x + ox, y: b.y + oy, w: b.w, h: b.h } };
  };

  /**
   * Registers as cells in a row: regs [{name, value, width, changed}], each a box with the value in binary and
   * decimal under its name. opts {x, y, prefix, hot: [names], title}
   */
  AK.regs = function (regs, opts) {
    opts = opts || {};
    const P = opts.prefix || 'rg', items = [];
    let x = opts.x || 0;
    const y = opts.y || 0;
    if (opts.title) items.push({ key: P + ':title', kind: 'text', x, y: y - 30, text: opts.title, cls: 'title', size: 14 });
    for (const r of regs) {
      const bin = r.width ? r.value.toString(2).padStart(r.width, '0') : String(r.value);
      const w = Math.max(56, tw(bin, 15) + 22, Geo.textWidth(r.name, 14, { bold: true }) + 16);
      items.push({ key: P + ':n:' + r.name, kind: 'text', x: x + w / 2, y: y - 8, text: r.name, anchor: 'middle', cls: 'asm-regname', size: 14 });
      items.push({ key: P + ':v:' + r.name, kind: 'cell', x, y, w, h: 36, rx: 3, text: bin, cls: 'mono asm-reg' + (r.changed ? ' changed' : '') + ((opts.hot || []).includes(r.name) ? ' hot' : ''), size: 15, pulse: !!r.changed });
      if (r.width && r.width > 1) items.push({ key: P + ':d:' + r.name, kind: 'text', x: x + w / 2, y: y + 54, text: '= ' + r.value, anchor: 'middle', cls: 'asm-dec-val', size: 14 });
      x += w + 16;
    }
    return { items, box: { x: opts.x || 0, y: y - (opts.title ? 44 : 22), w: x - (opts.x || 0) - 16, h: (opts.title ? 44 : 22) + 62 } };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
