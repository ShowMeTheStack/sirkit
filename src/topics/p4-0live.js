// Live circuits for the topics of parts 4 and 8: a circuit run on the event-driven simulator, so that a change at
// the inputs is seen travelling through the gates with each gate's real delay. S.Kit.live:
//   sim(circuit, opts)              a simulator (CMOS delays unless opts.tech says otherwise)
//   apply(sim, env)                 set inputs {name: value} and let the circuit settle; returns the time
//   change(sim, circuit, env, o)    set inputs and step the simulator event by event: [{t, events, values, hot}],
//                                   one entry per moment something changed (o.limit caps the entries)
//   values(sim, circuit)            every net of the circuit: '0' | '1' | 'x' | 'z' | 'bus' (for colouring wires)
//   wave(sim, name, t0)             the changes of a net from t0 on, as the wave kit wants them
//   item(key, circuit, x, y, o)     the schematic item, laid out once; o: {values, hot, textScale (default 1.1)}
//   say(ev)                         a sentence about one event, with its time and what caused it
// plus small drawing helpers shared by these topics: a seven-segment display, a row of bit boxes.
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const L = (K.live = {});

  L.sim = (c, o) => S.Sim.create(c, Object.assign({ tech: 'CMOS' }, o || {}));
  L.apply = (sim, env) => { for (const k of Object.keys(env || {})) if (sim.has(k)) sim.set(k, env[k]); sim.settle(); return sim.time; };
  const letter = (v) => (Array.isArray(v) ? (v.some((b) => b === 'X') ? 'x' : v.every((b) => b === 'Z') ? 'z' : 'bus') : v === 'X' ? 'x' : v === 'Z' ? 'z' : String(v));
  L.letter = letter;
  L.values = function (sim, c) {
    const o = {};
    for (const n of c.nets) { try { o[n.id] = letter(sim.get(n.id)); } catch (e) { /* a net the simulator merged away */ } }
    return o;
  };
  /** the part of the drawn circuit an event belongs to (a part inside a block counts as the block) */
  L.topPart = (id) => (id ? String(id).split('/')[0] : null);
  L.change = function (sim, c, env, o) {
    o = o || {};
    const t0 = sim.time, out = [];
    for (const k of Object.keys(env || {})) sim.set(k, env[k]);
    let cur = null, guard = 0;
    for (;;) {
      const ev = sim.stepEvent();
      if (!ev) break;
      if (++guard > 20000) break;
      if (!cur || ev.t !== cur.t) {
        cur = { t: ev.t, events: [], hot: new Set() };
        out.push(cur);
      }
      cur.events.push({ t: ev.t, net: ev.net, from: ev.from, to: ev.to, part: ev.part, by: ev.by ? { t: ev.by.t, net: ev.by.net, to: ev.by.to } : null });
      const tp = L.topPart(ev.part);
      if (tp) cur.hot.add(tp);
    }
    // a net that changes twice in one instant (two drivers trading places) is told once, from its value before
    // to its value after; one that ends where it began did not change at all
    for (const m of out) {
      const by = new Map();
      for (const e of m.events) { const k = e.net, p = by.get(k); if (p) { p.to = e.to; p.by = e.by || p.by; p.part = e.part; } else by.set(k, Object.assign({}, e)); }
      m.events = [...by.values()].filter((e) => String(e.from) !== String(e.to));
    }
    for (let i = out.length - 1; i >= 0; i--) if (!out[i].events.length) out.splice(i, 1);
    // values are read after each moment: the simulator is now at the end, so replay the moments' values from waves
    const times = out.map((m) => m.t);
    const snap = valuesAt(sim, c, times);
    out.forEach((m, i) => { m.values = snap[i]; m.hot = [...m.hot]; });
    sim.settle();
    return { t0, moments: o.limit ? out.slice(0, o.limit) : out, end: out.length ? out[out.length - 1].t : t0 };
  };
  /** every circuit net's value just after each of the given times, read back from the recorded waves */
  function valuesAt(sim, c, times) {
    const C = sim.compiled, res = times.map(() => ({}));
    for (const n of c.nets) {
      const idx = C.names.get(n.id);
      if (idx === undefined) continue;
      const w = sim.waves.get(C.nets[idx].name);
      if (!w) continue;
      let j = 0, v = w[0][1];
      times.forEach((t, i) => { while (j < w.length && w[j][0] <= t) { v = w[j][1]; j++; } res[i][n.id] = letter(v); });
    }
    return res;
  }
  L.valuesAt = valuesAt;
  /** a net's changes from t0 on (its value at t0 first), values as the wave kit draws them */
  L.wave = function (sim, name, t0) {
    const C = sim.compiled, idx = C.names.get(name);
    if (idx === undefined) return [[t0 || 0, 'x']];
    const w = sim.waves.get(C.nets[idx].name) || [];
    const pub = (v) => (Array.isArray(v) ? v.slice().reverse().map((b) => String(b).toLowerCase()).join('') : typeof v === 'string' ? v.toLowerCase() : v);
    const out = [];
    let before = w.length ? w[0][1] : 'x';
    for (const [t, v] of w) { if (t <= (t0 || 0)) before = v; }
    out.push([t0 || 0, pub(before)]);
    for (const [t, v] of w) if (t > (t0 || 0)) { if (out.length && out[out.length - 1][0] === t) out[out.length - 1][1] = pub(v); else out.push([t, pub(v)]); }
    return out;
  };
  /** the value of a net at time t, from its wave */
  L.at = function (sim, name, t) {
    const C = sim.compiled, idx = C.names.get(name);
    const w = sim.waves.get(C.nets[idx].name) || [];
    let v = w.length ? w[0][1] : 'X';
    for (const [tt, x] of w) if (tt <= t) v = x;
    return v;
  };
  L.item = function (key, c, x, y, o) {
    o = o || {};
    const res = K.schem.layout(c);
    const it = K.schem.item(key, res, { x, y });
    if (o.values) it.values = o.values;
    if (o.hot) it.hot = o.hot;
    // the names on pins and ports drawn a little larger, so a circuit fitted into the stage stays readable
    it.textScale = o.textScale || 1.1;
    if (o.pinCap) it.pinCap = o.pinCap;
    return it;
  };
  L.box = (it) => ({ x: it.x, y: it.y, w: it.res.bounds.w, h: it.res.bounds.h });
  L.pad = (b, p) => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });
  /** a readable name for a net the simulator reports */
  L.netName = function (n) {
    const parts = String(n).split('/'), leaf = parts.pop(), inside = parts.length ? ' in ' + parts.join(' › ') : '';
    const m = /^([a-z]+)(\d+)\.(\w+)$/.exec(leaf);
    if (m) { const ty = { not: 'inverter', buf: 'buffer', tri: 'tristate buffer', mux: 'multiplexer', decoder: 'decoder' }[m[1]] || m[1].toUpperCase() + ' gate'; return ty + ' ' + m[1] + m[2] + (m[3] === 'y' ? '' : ' (' + m[3] + ')') + inside; }
    return leaf + inside;
  };
  const show = (v) => (Array.isArray(v) ? v.slice().reverse().join('') : String(v));
  L.say = function (ev) {
    const verb = show(ev.to) === '1' ? 'rises to 1' : show(ev.to) === '0' ? 'falls to 0' : 'becomes ' + show(ev.to);
    return L.netName(ev.net) + ' ' + verb + ' at ' + ev.t + ' ns' + (ev.by ? ' (' + Math.round((ev.t - ev.by.t) * 100) / 100 + ' ns after ' + L.netName(ev.by.net) + ' changed)' : '');
  };
  /** the inputs of a circuit set from a number: names listed most significant first */
  L.envOf = (names, m) => Object.fromEntries(names.map((nm, i) => [nm, (m >> (names.length - 1 - i)) & 1]));
  L.bits = (v, n) => (v >>> 0).toString(2).padStart(n, '0').slice(-n);

  // ---- sizing for the stage ---------------------------------------------------------------------------------
  // The desktop stage (in a 1440 × 900 window) is about 1000 × 585 pixels, with a margin of 30 units round the
  // picture: a picture w × h units wide is drawn at deskScale(w, h) pixels per unit there.
  L.deskScale = (w, h) => Math.min(1000 / (w + 60), 585 / (h + 60));
  /** the text size (in units) that reads at 11.5 pixels or more on the desktop stage, never under base */
  L.textFor = (w, h, base) => Math.max(base || 12, Math.ceil((11.5 / L.deskScale(w, h)) * 2) / 2);
  /**
   * Where a block w × h fits into a laid-out circuit (drawn at 0, 0) as high as it can, clear of every part, wire
   * and label: the empty corner under a short part of the circuit, or else below it all. Returns {x, y}.
   */
  L.spot = function (res, w, h, o) {
    o = o || {};
    const bx = res.bounds.x, by = res.bounds.y, sw = res.bounds.w, sh = res.bounds.h, gap = o.gap || 24;
    const obs = [];
    for (const p of res.parts) obs.push({ x: p.x - bx, y: p.y - by, w: p.w, h: p.h });
    for (const n of res.nets) for (const sg of n.segments || []) obs.push({ x: Math.min(sg[0], sg[2]) - bx, y: Math.min(sg[1], sg[3]) - by, w: Math.abs(sg[2] - sg[0]), h: Math.abs(sg[3] - sg[1]) });
    for (const l of res.labels || []) if (l.box) obs.push({ x: l.box.x - bx, y: l.box.y - by, w: l.box.w, h: l.box.h });
    const xs = [0, ...obs.map((b) => b.x + b.w + gap)].filter((x) => x >= 0 && x + w <= Math.max(sw, w));
    let best = { x: 0, y: sh + gap + 10, bottom: Math.max(sh, sh + gap + 10 + h) };
    for (const x of xs) {
      let y = 0;
      for (const b of obs) if (b.x < x + w + gap && b.x + b.w > x - gap) y = Math.max(y, b.y + b.h + gap);
      // a block that would sit beside the top of the circuit stays below its inputs
      if (y < (o.minY || 0)) y = o.minY || 0;
      const bottom = Math.max(sh, y + h);
      if (bottom < best.bottom - 0.5 || (Math.abs(bottom - best.bottom) <= 0.5 && y < best.y)) best = { x, y, bottom };
    }
    return { x: best.x, y: best.y };
  };

  /**
   * Waveforms for a circuit drawn at 0, 0: placed by L.spot and their text sized for the desktop stage.
   * o: {w (the plot's width), signals, top (where the picture starts above the circuit, a negative y, for a heading)}.
   * Returns {x, y, size} to hand to L.waves.
   */
  L.placeWaves = function (res, o) {
    let size = 12, at = null;
    for (let pass = 0; pass < 3; pass++) {
      const wd = L.wavesSize({ w: o.w, signals: o.signals, size });
      at = L.spot(res, wd.w, wd.h);
      const top = Math.min(0, o.top || 0), u = S.geom.union([{ x: 0, y: top, w: res.bounds.w, h: res.bounds.h - top }, { x: at.x, y: at.y, w: wd.w, h: wd.h }]);
      const want = L.textFor(u.w, u.h, 12);
      if (want <= size) break;
      size = want;
    }
    return { x: at.x, y: at.y + 6, size: size > 12 ? size : undefined };
  };

  // ---- waveforms that grow with time -------------------------------------------------------------------------
  // opts {x, y, w (the plot's width for the whole run), t0, t1 (the end of the run), now (drawn up to here),
  //   signals: [{name, changes, width, cls}], prefix, rowH, gap, size (of the time labels; the names are a size
  //   larger)}. The scale is fixed by t0..t1, so the plot grows rightwards as time passes and nothing stretches.
  //   Returns {items, box, xOf(t)}. L.wavesSize(o) is the {w, h} of the box, without drawing.
  const waveDims = (o) => {
    const ts = o.size || 12, ns = ts + 1, sigs = o.signals || [];
    const rowH = Math.max(o.rowH || 20, ns + 6), gap = Math.max(o.gap === undefined ? 12 : o.gap, Math.ceil(ns * 1.45) - rowH);
    const nameW = Math.max(26, ...sigs.map((s) => S.geom.textWidth(s.name, ns, { bold: true }))) + 12;
    const axis = o.size ? ts + 8 : 18;
    return { ts, ns, rowH, gap, nameW, axis, w: nameW + (o.w || 400) + 12, h: sigs.length * (rowH + gap) - gap + axis + 12 };
  };
  L.wavesSize = (o) => { const d = waveDims(o); return { w: d.w, h: d.h }; };
  L.waves = function (o) {
    const P = o.prefix || 'lw', x0 = o.x || 0, y0 = o.y || 0, d = waveDims(o), rowH = d.rowH, gap = d.gap;
    const sigs = o.signals || [], t0 = o.t0 || 0, t1 = Math.max(t0 + 1, o.t1 || 1), now = Math.max(t0, Math.min(t1, o.now === undefined ? t1 : o.now));
    const nameW = d.nameW, sized = !!o.size;
    const px = x0 + nameW, W = o.w || 400;
    const xOf = (t) => px + ((t - t0) / (t1 - t0)) * W;
    const items = [];
    sigs.forEach((s, i) => {
      const y = y0 + i * (rowH + gap);
      items.push({ key: P + ':n:' + s.name, kind: 'text', x: px - 10, y: y + rowH / 2 + d.ns * 0.38, text: s.name, anchor: 'end', cls: 'strong', size: Math.max(13, d.ns) });
      items.push({ key: P + ':w:' + s.name, kind: 'wave', x: px, y, w: Math.max(0.5, xOf(now) - px), h: rowH, t0, t1: Math.max(t0 + 1e-6, now), changes: (s.changes || []).filter((c) => c[0] <= now), width: s.width || 1, cls: s.cls || '' });
    });
    const yA = y0 + sigs.length * (rowH + gap) - gap + d.axis;
    // ticks at a round step, labelled up to now
    const span = t1 - t0, raw = span / 5, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 5, 10].map((k) => k * mag).find((v) => v >= raw) || raw;
    for (let t = (o.origin || 0) + Math.ceil((t0 - (o.origin || 0)) / step) * step, k = 0; t <= t1 + 1e-9 && k < 12; t += step, k++) {
      const tick = { key: P + ':t:' + k, kind: 'text', x: xOf(t), y: yA, text: (Math.round((t - (o.origin || 0)) * 10) / 10) + (k === 0 ? ' ns' : ''), anchor: k === 0 ? 'start' : 'middle', cls: 'wave-t', opacity: t <= now + 1e-9 ? 1 : 0.35 };
      if (sized) tick.size = d.ts;
      items.push(tick);
    }
    items.push({ key: P + ':cursor', kind: 'line', x1: xOf(now), y1: y0 - 6, x2: xOf(now), y2: yA - d.ts - 1, cls: 'cursor', audit: 'ignore', layer: 'top' });
    return { items, xOf, box: { x: x0, y: y0 - 6, w: d.w, h: yA - y0 + 12 } };
  };

  /** one camera per scene: frames with the same .scene share the box round all of them (others are left alone) */
  L.views = function (frames) {
    const by = new Map();
    for (const f of frames) if (f.scene !== undefined) { const b = S.stageBounds(f.items); if (b) by.set(f.scene, by.has(f.scene) ? S.geom.union([by.get(f.scene), b]) : b); }
    for (const f of frames) if (f.scene !== undefined && by.has(f.scene)) f.view = by.get(f.scene);
    return frames;
  };

  // ---- walking a combinational circuit through rows of its truth table ----------------------------------------
  /**
   * Frames that run a circuit on the simulator through a list of input rows: the schematic with its wires
   * coloured, the parts that just switched lit, the truth table filling in and the waveforms growing.
   * o: {c, ins: [names, most significant first], outs: [names], rows: [minterm numbers], detail (how many
   *   rows to show event by event; default all), waves: [names] (default ins then outs), tech, label(env) ->
   *   words for a row, sayRow(env, out) -> narration of a settled row, table: false to leave the table out,
   *   extra(frameInfo) -> more items, narrow: 'schem' | 'table'}
   * Returns {frames, sim, def} (frames are plain objects; meta {row, out, first, settled} marks them).
   */
  L.walk = function (o) {
    const c = o.c, ins = o.ins, outs = o.outs, sim = L.sim(c, { tech: o.tech || 'CMOS' });
    const res = K.schem.layout(c), sw = res.bounds.w, sh = res.bounds.h;
    const rows = o.rows, detail = o.detail === undefined ? rows.length : o.detail;
    const envOf = (m) => L.envOf(ins, m);
    const outOf = () => Object.fromEntries(outs.map((n) => [n, sim.get(n)]));
    const done = new Map();
    const wnames = o.waves || ins.concat(outs);
    // the table, placed where the layout below puts it; hot: the row just reached
    let tblAt = { x: sw + 50, y: 0 }, tblSize = rows.length > 8 ? 13 : 15;
    const table = (hot) => o.table === false ? { items: [], box: null } : K.table.draw({
      prefix: 'tt', x: tblAt.x, y: tblAt.y, mono: true, minW: 36, ch: Math.max(rows.length > 8 ? 26 : 30, Math.round(tblSize * 2)), size: tblSize,
      colHead: ins.concat(outs), rows: rows.map((m) => ins.map((_, i) => String((m >> (ins.length - 1 - i)) & 1)).concat(outs.map((n) => (done.has(m) ? String(done.get(m)[n]) : '')))),
      hot: hot === undefined ? [] : outs.map((_, i) => [rows.indexOf(hot), ins.length + i]), act: hot === undefined ? [] : ins.map((_, i) => [rows.indexOf(hot), i]),
      cls: (r, col) => (col >= ins.length ? 'out' : ''),
    });
    // run everything first, to know how long the run is
    const plan = [];
    L.apply(sim, envOf(rows[0]));
    const tStart = 0;
    plan.push({ m: rows[0], moments: [], t0: sim.time, out: outOf() });
    // a pause before the first change, so the first row is seen settled (on the wires and the waves) before it changes
    sim.run(Math.max(10, (o.gapNs || 20)));
    for (let k = 1; k < rows.length; k++) {
      const ch = L.change(sim, c, envOf(rows[k]));
      plan.push({ m: rows[k], moments: ch.moments, t0: ch.t0, end: ch.end, out: outOf() });
      sim.run(Math.max(10, (o.gapNs || 20)));
    }
    const tEnd = sim.time;
    const sigs = wnames.map((n) => ({ name: n, changes: L.wave(sim, n, tStart), width: sim.width(n) }));
    // the waveforms below the circuit (in the room it leaves) or beside it, the table beside the circuit or the
    // waveforms, or under the waveforms: whichever arrangement the desktop stage shows largest, with the
    // waveforms' text sized to read there
    const layouts = [];
    for (const how of ['below', 'side', 'stack']) {
      if (how === 'stack' && o.table === false) continue;
      let size = 12, lay = null;
      for (let pass = 0; pass < 3; pass++) {
        const waveW = how === 'below' ? Math.max(300, Math.min(sw - 60, 620)) : 330;
        const wd = L.wavesSize({ w: waveW, signals: wnames.map((n) => ({ name: n })), size });
        const wAt = how === 'below' ? L.spot(res, wd.w, wd.h) : { x: sw + 40, y: 10 };
        tblSize = Math.max(rows.length > 8 ? 13 : 15, size);
        tblAt = how === 'below' ? { x: Math.max(sw, wAt.x + wd.w) + 50, y: 0 } : how === 'side' ? { x: wAt.x + wd.w + 20, y: 0 } : { x: wAt.x, y: wAt.y + wd.h + 24 };
        const tb = table().box;
        const boxes = [{ x: 0, y: 0, w: sw, h: sh }, { x: wAt.x, y: wAt.y - 6, w: wd.w, h: wd.h }].concat(tb ? [tb] : []);
        const u = S.geom.union(boxes), sc = L.deskScale(u.w, u.h);
        lay = { how, size, waveW, wAt, tblAt, tblSize, sc, u };
        const want = L.textFor(u.w, u.h, 12);
        if (want <= size) break;
        size = want;
      }
      layouts.push(lay);
    }
    const tall = sh > sw * 0.8;
    const lay = layouts.reduce((a, b2) => (b2.sc > a.sc * 1.02 || (Math.abs(b2.sc - a.sc) <= a.sc * 0.02 && (b2.how === 'side') === tall && (a.how === 'side') !== tall) ? b2 : a));
    tblAt = lay.tblAt; tblSize = lay.tblSize;
    const waveW = lay.waveW, wAt = lay.wAt, waveSize = lay.size > 12 ? lay.size : undefined;
    const tbBox = table().box;
    // a big picture keeps a thinner margin than the stage's own, so that its text stays readable
    const tight = lay.sc < 0.7 ? L.pad(lay.u, 8) : null;
    const frames = [];
    const scene = (vals, hot, now, rowHot, sayIt, meta) => {
      const items = [L.item('c', c, 0, 0, { values: vals, hot })];
      const tb = table(rowHot);
      items.push(...tb.items);
      const wv = L.waves({ prefix: 'w', x: wAt.x, y: wAt.y, w: waveW, t0: tStart, t1: tEnd, now, signals: sigs, size: waveSize });
      items.push(...wv.items);
      if (o.extra) items.push(...o.extra({ vals, now, row: rowHot, sim, sw, sh }));
      const narrow = o.narrow === 'table' && tbBox ? L.pad(tbBox, 10) : L.pad({ x: 0, y: 0, w: sw, h: sh }, 10);
      const f = { items, say: sayIt, meta, narrowView: narrow, hl: { tt: [String(rows.indexOf(rowHot))] } };
      if (tight) f.view = tight;
      return f;
    };
    plan.forEach((p, k) => {
      const env = envOf(p.m), lab = o.label ? o.label(env) : ins.map((n) => n + ' = ' + env[n]).join(', ');
      const settledSay = (o.sayRow ? o.sayRow(env, p.out) : outs.map((n) => n + ' = ' + p.out[n]).join(', ') + '.');
      if (k === 0) {
        done.set(p.m, p.out);
        frames.push(scene(L.valuesAt(sim, c, [p.t0])[0], o.settledHot ? o.settledHot(env) : [], p.t0, p.m, 'Start with ' + lab + ' and let the circuit settle: ' + settledSay, { row: p.m, out: p.out, settled: true, first: true }));
        return;
      }
      if (k <= detail && p.moments.length) {
        p.moments.forEach((mo, j) => {
          const evs = mo.events.filter((e) => !/^in_/.test(e.part || ''));
          const ins2 = mo.events.filter((e) => /^in_/.test(e.part || ''));
          let say;
          if (j === 0 && ins2.length) say = 'At ' + mo.t + ' ns the inputs change to ' + lab + '.' + (evs.length ? ' ' + evs.map(L.say).join('; ') + '.' : ' Nothing else can change yet: every gate takes time.');
          else say = 'At ' + mo.t + ' ns: ' + evs.slice(0, 3).map(L.say).join('; ') + (evs.length > 3 ? '; and ' + (evs.length - 3) + ' more' : '') + '.';
          frames.push(scene(mo.values, mo.hot.filter((h) => !/^in_|^out_/.test(h)), mo.t, p.m, say, { row: p.m, out: p.out, first: j === 0, t: mo.t }));
        });
      }
      done.set(p.m, p.out);
      const last = p.moments.length ? p.moments[p.moments.length - 1].t : p.t0;
      const vals = L.valuesAt(sim, c, [last])[0];
      const timing = p.moments.length > 1 ? ' The last change came ' + Math.round((last - p.t0) * 100) / 100 + ' ns after the inputs changed.' : '';
      frames.push(scene(vals, o.settledHot ? o.settledHot(env) : [], last, p.m, (k <= detail ? 'Settled: ' : lab + ': ') + settledSay + timing, { row: p.m, out: p.out, settled: true, first: !(k <= detail && p.moments.length), delay: last - p.t0 }));
    });
    const def = { sections: [{ id: 'tt', kind: 'table', title: 'Truth table', colHead: ins.concat(outs), rows: rows.map((m) => { const pp = plan.find((q) => q.m === m); return ins.map((_, i) => String((m >> (ins.length - 1 - i)) & 1)).concat(outs.map((n) => String(pp.out[n]))); }) }] };
    return { frames, sim, def, plan };
  };

  // ---- adders built from gate-level full adders --------------------------------------------------------------
  /** a full adder of gates, as a subcircuit: inputs a, b, cin; outputs s, cout (sum two XOR levels, carry AND-OR) */
  L.faCircuit = function () {
    const N = S.Netlist, f = new N.Circuit('FA'), G = L.G;
    const a = f.input('a').pin('y'), b = f.input('b').pin('y'), ci = f.input('cin').pin('y');
    const p = G(f, 'XOR', a, b);
    f.connect(G(f, 'XOR', p, ci), f.output('s'));
    f.connect(G(f, 'OR', G(f, 'AND', a, b), G(f, 'AND', p, ci)), f.output('cout'));
    return f;
  };
  const FA_PINS = { inputs: [{ name: 'a', label: 'A', side: 'top' }, { name: 'b', label: 'B', side: 'top' }, { name: 'cin', label: 'Cin', side: 'right' }], outputs: [{ name: 's', label: 'S', side: 'bottom' }, { name: 'cout', label: 'Cout', side: 'left' }] };
  L.faBlock = (c, id, sub) => c.add('BLOCK', Object.assign({ circuit: sub || L.faCircuit(), title: 'FA' }, FA_PINS), id);
  /**
   * An n-bit ripple-carry adder of gate-level full adders, drawn as a row of slices (bit n−1 at the left), the
   * carry running right to left. o.sub: an adder–subtractor (each B through an XOR with M, M the carry in) with
   * the overflow V = C(n−1) ⊕ Cn. Inputs A0.., B0.., C0 (or M); outputs S0.., C<n> (and V); carries named C1...
   */
  L.adder = function (n, o) {
    o = o || {};
    const N = S.Netlist, Sy = S.Symbols, G = L.G, c = new N.Circuit((o.sub ? 'addsub' : 'rca') + n);
    const sub = L.faCircuit();
    const port = (nm) => c.byId.get('in_' + nm) || c.byId.get('out_' + nm);
    const A = [], B = [];
    for (let i = 0; i < n; i++) { A.push(c.input('A' + i).pin('y')); B.push(c.input('B' + i).pin('y')); }
    const cin = c.input(o.sub ? 'M' : 'C0').pin('y');
    let carry = cin, prev = null;
    const fas = [], xors = [];
    for (let i = 0; i < n; i++) {
      const f = L.faBlock(c, 'fa' + i, sub);
      c.connect(A[i], f.pin('a'));
      if (o.sub) { const x = G(c, 'XOR', B[i], cin); xors.push(x.part); c.connect(x, f.pin('b')); } else c.connect(B[i], f.pin('b'));
      c.connect(carry, f.pin('cin'));
      prev = carry; carry = f.pin('cout'); fas.push(f);
      if (i < n - 1) c.name(f.pin('cout'), 'C' + (i + 1), true);
    }
    fas.forEach((f, i) => c.connect(f.pin('s'), c.output('S' + i)));
    c.connect(carry, c.output('C' + n));
    let vx = null;
    if (o.sub) { vx = G(c, 'XOR', prev, carry); c.connect(vx, c.output('V')); }
    const sides = { a: 'top', b: 'top', s: 'bottom', cin: 'right', cout: 'left' };
    const fg = Sy.variant(fas[0], { sides, spread: o.sub ? 8 : 6 }), bx = fg.pins.b.x;
    const order = [...Array(n).keys()].reverse();
    c.style = 'slices';
    c.hints = {
      slices: order.map((i) => (o.sub ? { xor: xors[i], fa: fas[i] } : { fa: fas[i] })),
      place: Object.assign({ fa: { dx: 0, dy: 0, opts: { sides, spread: o.sub ? 8 : 6 } } }, o.sub ? { xor: { dx: bx - 2, dy: -9, opts: { orient: 'down' } } } : {}),
      pitch: fg.w + (o.sub ? 10 : 8),
      rails: o.sub ? [{ port: port('M'), at: 'top' }] : [],
      top: order.flatMap((i) => [port('A' + i), port('B' + i)]),
      bottom: order.map((i) => port('S' + i)),
      extra(sh, k) {
        const cout = sh.at(fas[n - 1], 'cout');
        if (!o.sub) { const ci = sh.at(fas[0], 'cin'), pc = port('C0'); sh.put(pc, ci.x + 5, ci.y - 1, k.variant(pc, { orient: 'left' })); }
        const po = port('C' + n), go = k.variant(po, { orient: 'left' });
        sh.put(po, cout.x - 5 - go.w, cout.y - 1, go);
      },
      // the overflow XOR goes below the sum outputs, under the top slice, so that C(n−1) and Cn reach it by
      // going round the S(n−1) output instead of across it
      after: o.sub ? (sh, k) => {
        const top = fas[n - 1], cout = sh.at(top, 'cout'), cin = sh.at(top, 'cin'), s = sh.at(top, 's');
        const gv = k.variant(vx.part, { orient: 'down' });
        const y0 = k.outRow + 3 + 4;
        sh.put(vx.part, s.x - gv.pins.y.x, y0, gv);
        // Cn comes from the left, C(n−1) from the right: whichever input pin is on that side
        const ia = sh.at(vx.part, 'i0'), ib = sh.at(vx.part, 'i1'), y = sh.at(vx.part, 'y');
        const c4Pin = vx.part.net.i0 === c.netOf(top.pin('cout')) ? ia : ib, c3Pin = c4Pin === ia ? ib : ia;
        const [i0, i1] = c4Pin.x <= c3Pin.x ? [c4Pin, c3Pin] : [null, null];
        if (!i0) throw new Error('overflow XOR inputs the wrong way round');
        const n4 = sh.net(top, 'cout'), n3 = sh.net(top, 'cin');
        const pc = sh.at(po4, 'a');
        sh.line(n4, [[cout.x, cout.y], [pc.x, pc.y]]);
        sh.line(n4, [[cout.x - 2, cout.y], [cout.x - 2, i0.y - 2], [i0.x, i0.y - 2], [i0.x, i0.y]]);
        const c3 = sh.at(fas[n - 2], 'cout');
        sh.line(n3, [[c3.x, c3.y], [cin.x, cin.y]]);
        sh.line(n3, [[cin.x + 2, cin.y], [cin.x + 2, i1.y - 2], [i1.x, i1.y - 2], [i1.x, i1.y]]);
        const pv = port('V'), gp = k.variant(pv, { orient: 'down' });
        sh.put(pv, y.x - gp.w / 2, y.y + 3, gp);
        sh.line(sh.net(vx.part, 'y'), [[y.x, y.y], [y.x, y.y + 3]]);
      } : undefined,
    };
    const po4 = port('C' + n);
    return c;
  };
  /** the inputs of an adder for operands a, b: {A0: .., B0: ..} */
  L.operands = (n, a, b) => { const o = {}; for (let i = 0; i < n; i++) { o['A' + i] = (a >> i) & 1; o['B' + i] = (b >> i) & 1; } return o; };
  L.sumOf = (sim, n) => { let v = 0; for (let i = 0; i < n; i++) v |= (sim.get('S' + i) === 1 ? 1 : 0) << i; return v; };

  /** a bus made of separate 1-bit nets (names least significant first): its changes as numbers */
  L.busWave = function (sim, names, t0) {
    const ws = names.map((nm) => L.wave(sim, nm, t0));
    const times = [...new Set(ws.flatMap((w) => w.map((c) => c[0])))].sort((a, b) => a - b);
    const out = [];
    for (const t of times) {
      let v = 0, unk = false;
      ws.forEach((w, i) => { let b = w[0][1]; for (const [tt, x] of w) if (tt <= t) b = x; if (b !== 0 && b !== 1) unk = true; else v |= b << i; });
      const val = unk ? 'x' : v;
      if (!out.length || out[out.length - 1][1] !== val) out.push([t, val]);
    }
    return out;
  };

  // ---- hand-drawn layouts for circuits the general layout would draw with crossings ----------------------------
  // Each builds the circuit and gives it a drawing (the 'slices' style with every part placed and every wire
  // drawn here): control lines that feed several parts (selects, address bits, a bus) are drawn as rails.
  const hand = (c, extra, after) => { c.style = 'slices'; c.hints = { slices: [{}], place: {}, pitch: 0, extra, after }; return c; };
  /** sum-of-products outputs as AND-OR, an output that is a single literal driven through a buffer */
  L.sop = function (title, outs, vars) {
    const B = S.Bool, N = S.Netlist;
    const multi = {}, single = {};
    for (const [k, e] of Object.entries(outs)) { const x = typeof e === 'string' ? B.parse(e) : e; if (x.op === 'var' || (x.op === 'not' && x.a.op === 'var')) single[k] = x; else multi[k] = x; }
    const usedV = new Set(Object.values(multi).flatMap((x) => B.vars(x)));
    const c = N.fromExpressions(title, multi, 'and-or', { inputs: vars.filter((v) => usedV.has(v)) });
    // inputs no output uses are left out of the drawing (they would only dangle)
    for (const v of vars) if (!c.byId.get('in_' + v) && Object.values(single).some((x) => (x.op === 'var' ? x.name : x.a.name) === v)) c.input(v);
    for (const [k, x] of Object.entries(single)) {
      const inp = c.byId.get('in_' + (x.op === 'var' ? x.name : x.a.name));
      let src = inp.pin('y');
      if (x.op === 'not') { const nt = c.parts.find((p) => p.type === 'NOT' && p.net.i0 && p.net.i0.pins[0].part === inp); src = nt ? nt.pin('y') : L.G(c, 'NOT', src); }
      c.connect(L.G(c, 'BUF', src), c.output(k));
    }
    for (const p of c.parts) if (p.type === 'IN' && !p.net.y) c.leaveOpen(p.pin('y'));
    return c;
  };
  /**
   * A tree of 2-to-1 multiplexers: 2^k data sources (IN ports named names[i], or constants when bits are given),
   * select lines sel[0] (the first level) .. sel[k−1] (the root), output out. Muxes are mux1.. level by level.
   */
  L.muxTree = function (o) {
    const N = S.Netlist, Sy = S.Symbols, c = new N.Circuit(o.title || 'muxtree');
    const n = o.bits ? o.bits.length : o.names.length, k = Math.log2(n);
    const src = [...Array(n).keys()].map((i) => (o.bits ? c.constant(o.bits[i]) : c.input(o.names[i])));
    const selP = o.sel.map((nm) => c.input(nm));
    const levels = [];
    let cur = src.map((p) => p.pin('y'));
    for (let l = 0; l < k; l++) {
      const nx = [], ms = [];
      for (let i = 0; i < cur.length; i += 2) { const m = c.add('MUX', { n: 2 }); c.connect(cur[i], m.pin('d0')); c.connect(cur[i + 1], m.pin('d1')); c.connect(selP[l].pin('y'), m.pin('s0')); nx.push(m.pin('y')); ms.push(m); }
      levels.push(ms); cur = nx;
    }
    const outP = c.output(o.out || 'Y');
    c.connect(cur[0], outP);
    const colX = (l) => 9 + l * 14;
    const geo = new Map();
    return hand(c, (sh) => {
      // data rows in pairs, a gap between pairs for the select taps
      let rows = [...Array(n).keys()].map((i) => 12 * (i >> 1) + 4 * (i & 1));
      src.forEach((p, i) => { const g = Sy.geom(p); sh.put(p, colX(0) - 3 - g.pins.y.x, rows[i] - g.pins.y.y, g); });
      levels.forEach((ms, l) => {
        const outs = [];
        ms.forEach((m, j) => { const r0 = rows[2 * j], r1 = rows[2 * j + 1], g = Sy.variant(m, { inRows: [r0, r1] }); sh.put(m, colX(l), r0 - 2, g); geo.set(m, g); outs.push(r0 - 2 + g.pins.y.y); });
        rows = outs;
      });
      const root = levels[k - 1][0], ro = sh.at(root, 'y'), go = Sy.geom(outP);
      sh.put(outP, ro.x + 3, ro.y - go.pins.a.y, go);
      const bottom = Math.max(...levels.flat().map((m) => sh.at(m, 's0').y)) + 3;
      selP.forEach((p, l) => { const g = Sy.variant(p, { orient: 'up' }); sh.put(p, colX(l) - 2 - g.pins.y.x, bottom, g); });
    }, (sh) => {
      src.forEach((p, i) => { const a = sh.at(p, 'y'), m = levels[0][i >> 1], b = sh.at(m, 'd' + (i & 1)); sh.line(sh.net(p, 'y'), [[a.x, a.y], [b.x, b.y]]); });
      levels.forEach((ms, l) => {
        if (l + 1 < k) ms.forEach((m, j) => { const a = sh.at(m, 'y'), b = sh.at(levels[l + 1][j >> 1], 'd' + (j & 1)); sh.line(sh.net(m, 'y'), [[a.x, a.y], [b.x, b.y]]); });
        const p = selP[l], pin = sh.at(p, 'y'), xs = pin.x, ni = sh.net(p, 'y');
        let top = pin.y;
        ms.forEach((m) => { const s = sh.at(m, 's0'); sh.line(ni, [[xs, s.y + 1], [s.x, s.y + 1], [s.x, s.y]]); top = Math.min(top, s.y + 1); });
        sh.line(ni, [[xs, pin.y], [xs, top]], true);
      });
      const ro = sh.at(levels[k - 1][0], 'y'), po = sh.at(outP, 'a');
      sh.line(sh.net(outP, 'a'), [[ro.x, ro.y], [po.x, po.y]]);
    });
  };
  /** three tristate buffers onto one bus line: inputs D0..2 and E0..2, output BUS */
  L.triBus = function () {
    const N = S.Netlist, Sy = S.Symbols, c = new N.Circuit('bus');
    const ts = [0, 1, 2].map((i) => c.add('TRI', {}, 't' + i));
    const D = ts.map((t, i) => { const p = c.input('D' + i); c.connect(p, t.pin('a')); return p; });
    const E = ts.map((t, i) => { const p = c.input('E' + i); c.connect(p, t.pin('en')); return p; });
    const bus = c.output('BUS');
    c.connect(ts[0].pin('y'), ts[1].pin('y'), ts[2].pin('y'), bus);
    const X = 10;
    return hand(c, (sh) => {
      ts.forEach((t, i) => sh.put(t, X, 4 + i * 10));
      ts.forEach((t, i) => {
        const a = sh.at(t, 'a'), en = sh.at(t, 'en'), gd = Sy.geom(D[i]), ge = Sy.geom(E[i]);
        sh.put(D[i], X - 5 - gd.w, a.y - gd.pins.y.y, gd);
        sh.put(E[i], X - 5 - ge.w, en.y - 2 - ge.pins.y.y, ge);
      });
      const y2 = sh.at(ts[2], 'y'), gb = Sy.geom(bus);
      sh.put(bus, y2.x + 8, y2.y + 4 - gb.pins.a.y, gb);
    }, (sh) => {
      ts.forEach((t, i) => {
        const a = sh.at(t, 'a'), en = sh.at(t, 'en'), pd = sh.at(D[i], 'y'), pe = sh.at(E[i], 'y');
        sh.line(sh.net(D[i], 'y'), [[pd.x, pd.y], [a.x, a.y]]);
        sh.line(sh.net(E[i], 'y'), [[pe.x, pe.y], [en.x, pe.y], [en.x, en.y]]);
      });
      const ys = ts.map((t) => sh.at(t, 'y')), xb = ys[0].x + 4, ni = sh.net(ts[0], 'y'), pb = sh.at(bus, 'a');
      ys.forEach((p) => sh.line(ni, [[p.x, p.y], [xb, p.y]]));
      sh.line(ni, [[xb, ys[0].y], [xb, pb.y]], true);
      sh.line(ni, [[xb, pb.y], [pb.x, pb.y]]);
    });
  };
  /**
   * One multiplexer making a function: data input j gets entries[j] ('0', '1', last or last + "'"); the select lines
   * are sel (most significant first). Each constant has its own part; the last variable and its complement are rails.
   */
  L.muxFn = function (entries, sel, last) {
    const N = S.Netlist, Sy = S.Symbols, c = new N.Circuit('muxfn');
    const n = entries.length, m = c.add('MUX', { n }, 'mux');
    const sp = sel.map((v) => c.input(v)), lp = c.input(last);
    const useT = entries.includes(last), useC = entries.includes(last + "'");
    let inv = null;
    if (useC) { inv = c.gate('NOT', 1, 'inv'); c.connect(lp.pin('y'), inv.pin('i0')); }
    const srcs = entries.map((e, j) => { if (e === '0' || e === '1') { const k = c.constant(+e); c.connect(k.pin('y'), m.pin('d' + j)); return k; } return null; });
    entries.forEach((e, j) => { if (e === last) c.connect(lp.pin('y'), m.pin('d' + j)); else if (e === last + "'") c.connect(inv.pin('y'), m.pin('d' + j)); });
    if (!useT && !useC) c.leaveOpen(lp.pin('y'));
    sel.forEach((v, i) => c.connect(sp[i].pin('y'), m.pin('s' + (sel.length - 1 - i))));
    const outP = c.output('F');
    c.connect(m.pin('y'), outP);
    const X = 22, rows = [...Array(n).keys()].map((j) => 8 + 3 * j);
    const xT = X - 9, xC = X - 5;
    return hand(c, (sh) => {
      const g = Sy.variant(m, { inRows: rows });
      sh.put(m, X, rows[0] - 2, g);
      srcs.forEach((k, j) => { if (!k) return; const gk = Sy.geom(k); sh.put(k, xT - 4 - gk.w, rows[j] - gk.pins.y.y, gk); });
      const gl = Sy.variant(lp, { orient: 'down' });
      sh.put(lp, xT - gl.pins.y.x, 0, gl);
      if (inv) { const gi = Sy.variant(inv, { orient: 'down' }); sh.put(inv, xC - gi.pins.y.x, 3 + 1, gi); }
      const bottom = sh.at(m, 's0').y + 3;
      // select ports in a staircase down and to the left, so their wires never meet
      sp.forEach((p, i) => { const kk = sel.length - 1 - i, s = sh.at(m, 's' + kk), gp = Sy.variant(p, { orient: 'up' }); sh.put(p, s.x - 6 * (sel.length - 1 - i) - gp.pins.y.x, bottom + 4 * i, gp); });
      const yo = sh.at(m, 'y'), go = Sy.geom(outP);
      sh.put(outP, yo.x + 3, yo.y - go.pins.a.y, go);
    }, (sh) => {
      srcs.forEach((k, j) => { if (!k) return; const a = sh.at(k, 'y'), b = sh.at(m, 'd' + j); sh.line(sh.net(k, 'y'), [[a.x, a.y], [b.x, b.y]]); });
      const lpin = sh.at(lp, 'y'), nl = sh.net(lp, 'y');
      const rowsT = entries.map((e, j) => (e === last ? j : -1)).filter((j) => j >= 0), rowsC = entries.map((e, j) => (e === last + "'" ? j : -1)).filter((j) => j >= 0);
      if (useT || useC) {
        const lowT = rowsT.length ? rows[Math.max(...rowsT)] : lpin.y + 1;
        sh.line(nl, [[xT, lpin.y], [xT, useT ? lowT : lpin.y + 1]], true);
        rowsT.forEach((j) => { const b = sh.at(m, 'd' + j); sh.line(nl, [[xT, rows[j]], [b.x, b.y]]); });
        if (inv) {
          const ii = sh.at(inv, 'i0'), io = sh.at(inv, 'y'), nc = sh.net(inv, 'y');
          sh.line(nl, [[xT, lpin.y + 1], [ii.x, lpin.y + 1], [ii.x, ii.y]]);
          sh.line(nc, [[io.x, io.y], [io.x, rows[Math.max(...rowsC)]]], true);
          rowsC.forEach((j) => { const b = sh.at(m, 'd' + j); sh.line(nc, [[xC, rows[j]], [b.x, b.y]]); });
        }
      }
      sp.forEach((p, i) => { const a = sh.at(p, 'y'), s = sh.at(m, 's' + (sel.length - 1 - i)); sh.line(sh.net(p, 'y'), a.x === s.x ? [[a.x, a.y], [s.x, s.y]] : [[a.x, a.y], [a.x, a.y - 2], [s.x, a.y - 2], [s.x, s.y]]); });
      const yo = sh.at(m, 'y'), po = sh.at(outP, 'a');
      sh.line(sh.net(outP, 'a'), [[yo.x, yo.y], [po.x, po.y]]);
    });
  };
  /** bigger decoders from 2-to-4 ones: kind '38' (two, the top bit through an inverter) or '416' (a tree of five) */
  L.decTree = function (kind) {
    const N = S.Netlist, Sy = S.Symbols, big = kind === '416', c = new N.Circuit(big ? 'dec416' : 'dec38');
    const nA = big ? 4 : 3, A = [...Array(nA).keys()].map((i) => c.input('A' + i));
    const subs = [...Array(big ? 4 : 2).keys()].map((j) => c.add('DECODER', { k: 2, en: true }, big ? 'd' + j : j ? 'dechi' : 'declo'));
    let top = null, inv = null;
    subs.forEach((d) => { c.connect(A[0].pin('y'), d.pin('a0')); });
    c.connect(A[0].pin('y'), ...[]);
    // (connect does the fan-out in one call for each address bit)
    const nets0 = null;
    if (big) { top = c.add('DECODER', { k: 2 }, 'dtop'); c.connect(A[2].pin('y'), top.pin('a0')); c.connect(A[3].pin('y'), top.pin('a1')); subs.forEach((d, j) => c.connect(top.pin('y' + j), d.pin('en'))); }
    else { inv = c.gate('NOT', 1, 'inv'); c.connect(A[2].pin('y'), inv.pin('i0'), subs[1].pin('en')); c.connect(inv.pin('y'), subs[0].pin('en')); }
    subs.forEach((d) => c.connect(A[1].pin('y'), d.pin('a1')));
    const outs = [];
    subs.forEach((d, j) => { for (let i = 0; i < 4; i++) { const o = c.output('Y' + (4 * j + i)); c.connect(d.pin('y' + i), o); outs.push([d, i, o]); } });
    void nets0;
    const X = big ? 34 : 24, gap = 4;
    return hand(c, (sh) => {
      subs.forEach((d, j) => sh.put(d, X, 6 + j * (10 + gap)));
      outs.forEach(([d, i, o]) => { const p = sh.at(d, 'y' + i), g = Sy.geom(o); sh.put(o, p.x + 3, p.y - g.pins.a.y, g); });
      const g0 = Sy.geom(A[0]), g1 = Sy.geom(A[1]);
      sh.put(A[1], X - 6 - 3 - g1.w, 3 - g1.pins.y.y, g1);
      sh.put(A[0], X - 3 - 3 - g0.w, 0 - g0.pins.y.y, g0);
      if (big) {
        const mid = 6 + (subs.length * (10 + gap) - gap) / 2 - 5;
        sh.put(top, X - 22, mid);
        const t0 = sh.at(top, 'a0'), t1 = sh.at(top, 'a1'), ga = Sy.geom(A[2]), gb = Sy.geom(A[3]);
        sh.put(A[2], t0.x - 3 - ga.w, t0.y - ga.pins.y.y, ga);
        sh.put(A[3], t1.x - 3 - gb.w, t1.y - gb.pins.y.y, gb);
      } else {
        const e0 = sh.at(subs[0], 'en'), e1 = sh.at(subs[1], 'en'), gi = Sy.geom(inv), ga = Sy.geom(A[2]);
        sh.put(inv, X - 12 - gi.w, e0.y - gi.pins.y.y, gi);
        sh.put(A[2], X - 20 - ga.w, e1.y - ga.pins.y.y, ga);
      }
    }, (sh) => {
      outs.forEach(([d, i, o]) => { const a = sh.at(d, 'y' + i), b = sh.at(o, 'a'); sh.line(sh.net(o, 'a'), [[a.x, a.y], [b.x, b.y]]); });
      // address rails A0 and A1 down the left of the decoder column
      [[0, X - 3], [1, X - 6]].forEach(([b, xr]) => {
        const p = A[b], pin = sh.at(p, 'y'), ni = sh.net(p, 'y');
        sh.line(ni, [[pin.x, pin.y], [xr, pin.y]]);
        let low = pin.y;
        subs.forEach((d) => { const q = sh.at(d, 'a' + b); sh.line(ni, [[xr, q.y], [q.x, q.y]]); low = Math.max(low, q.y); });
        sh.line(ni, [[xr, pin.y], [xr, low]], true);
      });
      if (big) {
        const ta = [2, 3].map((b) => [A[b], sh.at(A[b], 'y'), sh.at(top, 'a' + (b - 2))]);
        ta.forEach(([p, a, q]) => sh.line(sh.net(p, 'y'), [[a.x, a.y], [q.x, q.y]]));
        // each enable: out of the top decoder, along to its own column, up or down, and in
        const ox = sh.at(top, 'y0').x;
        subs.forEach((d, j) => {
          const o = sh.at(top, 'y' + j), e = sh.at(d, 'en');
          const xm = j < 2 ? ox + 2 + j * 2 : ox + 2 + (3 - j) * 2;
          sh.line(sh.net(top, 'y' + j), [[o.x, o.y], [xm, o.y], [xm, e.y], [e.x, e.y]]);
        });
      } else {
        const a2 = sh.at(A[2], 'y'), e1 = sh.at(subs[1], 'en'), ii = sh.at(inv, 'i0'), io = sh.at(inv, 'y'), e0 = sh.at(subs[0], 'en'), ni = sh.net(A[2], 'y');
        const xb = ii.x - 3;
        sh.line(ni, [[a2.x, a2.y], [e1.x, e1.y]]);
        sh.line(ni, [[xb, a2.y], [xb, ii.y], [ii.x, ii.y]]);
        sh.line(sh.net(inv, 'y'), [[io.x, io.y], [e0.x, e0.y]]);
      }
    });
  };

  // ---- a seven-segment display ------------------------------------------------------------------------------
  // segments a..g as rounded bars, lit or dark; opts {x, y, size, on: 'abc..', prefix, label}
  const SEG = { a: [0, 0, 'h'], b: [1, 0, 'v'], c: [1, 1, 'v'], d: [0, 2, 'h'], e: [0, 1, 'v'], f: [0, 0, 'v'], g: [0, 1, 'h'] };
  L.SEGS = 'abcdefg';
  L.DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
  L.seven = function (o) {
    const P = o.prefix || 'seg', x0 = o.x || 0, y0 = o.y || 0, L1 = o.size || 46, T = Math.max(7, Math.round(L1 / 6)), gap = 3;
    const on = new Set(String(o.on || ''));
    const items = [{ key: P + ':body', kind: 'region', x: x0, y: y0, w: L1 + 2 * T + 2 * gap + 24, h: 2 * L1 + 3 * T + 4 * gap + 24, rx: 10, cls: 'p4-seg-body', audit: 'group' }];
    const ox = x0 + 12, oy = y0 + 12;
    for (const s of L.SEGS) {
      const [cx, cy, dir] = SEG[s];
      let it;
      if (dir === 'h') it = { x: ox + T + gap, y: oy + cy * (L1 + T + 2 * gap), w: L1, h: T };
      else it = { x: ox + cx * (L1 + T + 2 * gap), y: oy + T + gap + cy * (L1 + T + 2 * gap), w: T, h: L1 };
      items.push(Object.assign({ key: P + ':' + s, kind: 'cell', text: '', rx: T / 2, cls: 'p4-seg' + (on.has(s) ? ' on' : '') }, it));
    }
    if (o.names) for (const s of L.SEGS) {
      // names beside their bars, never on them: a above, d below, g at the left edge of the body
      const [cx, cy, dir] = SEG[s];
      let tx, ty;
      if (s === 'a') { tx = ox + T + gap + L1 / 2; ty = oy - 2; }
      else if (s === 'd') { tx = ox + T + gap + L1 / 2; ty = oy + 2 * (L1 + T + 2 * gap) + T + 11; }
      else if (s === 'g') { tx = x0 - 8; ty = oy + (L1 + T + 2 * gap) + T / 2 + 4; }
      else { tx = ox + cx * (L1 + T + 2 * gap) + (cx ? T + 7 : -7); ty = oy + T + gap + cy * (L1 + T + 2 * gap) + L1 / 2 + 4; }
      void dir;
      items.push({ key: P + ':n' + s, kind: 'text', x: tx, y: ty, text: s, anchor: 'middle', cls: 'p4-segname' + (s === 'g' ? ' out' : ''), size: 11 });
    }
    const box = { x: x0, y: y0, w: L1 + 2 * T + 2 * gap + 24, h: 2 * L1 + 3 * T + 4 * gap + 24 };
    if (o.label) items.push({ key: P + ':label', kind: 'text', x: x0 + box.w / 2, y: y0 + box.h + 20, text: o.label, anchor: 'middle', cls: 'strong', size: 14 });
    return { items, box };
  };

  // ---- a row of bit boxes -------------------------------------------------------------------------------------
  // opts {x, y, bits: '0101' (most significant first) or array, prefix, w, h, cls(i) -> classes (i counts from the
  // left), sub(i) -> small text under a box, title}
  L.bitRow = function (o) {
    const P = o.prefix || 'bits', bits = Array.isArray(o.bits) ? o.bits : String(o.bits).split(''), W = o.w || 34, H = o.h || 34, gap = o.gap === undefined ? 4 : o.gap;
    const items = [];
    bits.forEach((b, i) => {
      const it = { key: P + ':' + i, kind: 'cell', x: (o.x || 0) + i * (W + gap), y: o.y || 0, w: W, h: H, text: String(b), cls: 'p4-bit' + (String(b) === '1' ? ' one' : '') + (o.cls ? ' ' + (o.cls(i, b) || '') : ''), size: o.size || 16 };
      if (o.sub) it.sub = o.sub(i);
      items.push(it);
    });
    if (o.title) items.push({ key: P + ':title', kind: 'text', x: o.x || 0, y: (o.y || 0) - 10, text: o.title, cls: 'title' });
    const w = bits.length * (W + gap) - gap;
    return { items, box: { x: o.x || 0, y: (o.y || 0) - (o.title ? 24 : 0), w, h: H + (o.title ? 24 : 0) + (o.sub ? 16 : 0) }, at: (i) => ({ x: (o.x || 0) + i * (W + gap), y: o.y || 0, w: W, h: H }) };
  };

  /** a gate-level circuit from expressions, with named inputs in a fixed order */
  L.fromExpr = (title, outs, style, inputs) => S.Netlist.fromExpressions(title, outs, style || 'multi', inputs ? { inputs } : {});
  /** a gate driven by the given signals */
  L.G = (c, type, ...ins) => { const g = c.gate(type, ins.length); ins.forEach((s, i) => c.connect(s, g.pin('i' + i))); return g.pin('y'); };
})(globalThis.Sirkit = globalThis.Sirkit || {});
