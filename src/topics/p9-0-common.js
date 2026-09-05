// Part 9 helpers shared by the register-transfer topics: the example charts with the inputs each one takes, a
// run of a chart turned into frames (the chart with the present block and the path lit, the registers after the
// edge, and a log of the last few clocks), and a camera that never blows a small picture up.
(function (S) {
  'use strict';
  const K = S.Kit, Geo = S.geom;
  const A = () => S.Asm;
  const P9 = (S.P9 = S.P9 || {});

  /** run until the chart is back in its start state after leaving it (or max clocks) */
  P9.runOnce = function (ch, inputs, max) {
    let left = false;
    return A().run(ch, { inputs, maxCycles: max || 60, until: (st, r, c) => { if (st !== ch.start) left = true; return left && st === ch.start && c > 0; } });
  };
  /** the registers of a chart as AK.regs wants them */
  P9.regList = (ch, regs, before) => Object.entries(ch.registers).map(([n, w]) => ({ name: n, value: regs[n], width: w, changed: before ? before[n] !== regs[n] : false }));
  /**
   * The camera for each frame: its own box, but at least minW × minH. A chart too tall for a desktop stage
   * (about 1000 × 756 for these topics) to draw at P9.MINSCALE is shown in part: a window as wide as what it draws of the
   * picture and as tall as that scale allows, around the frame's present block (its focus or narrowView, else the
   * top) and everything that is not the chart. Chart boxes and words outside the window are left out of the frame;
   * its wires simply run on past the edge, and so may the return lanes at its sides.
   */
  P9.STAGE = { w: 1000, h: 756 };
  P9.MINSCALE = 0.82;
  P9.views = (frames, minW, minH) => {
    for (const f of frames) {
      if (!f || f.view || !f.items) continue;
      const v = S.stageBounds(f.items, { minW: minW || 900, minH: minH || 480 });
      f.view = v;
      if (!v || Math.min(P9.STAGE.w / v.w, P9.STAGE.h / v.h) >= P9.MINSCALE) continue;
      const H = P9.STAGE.h / P9.MINSCALE;
      const chart = (it) => /^asm:/.test(it.key);
      const wire = (it) => it.kind === 'line' || it.kind === 'edge';
      const others = f.items.filter((it) => !chart(it));
      const need = Geo.union([f.focus || f.narrowView || { x: v.x, y: v.y, w: 10, h: 10 }].concat(others.map(S.itemBox).filter(Boolean)));
      let y0 = need.y, y1 = need.y + need.h;
      if (y1 - y0 < H) { const pad = (H - (y1 - y0)) / 2; y0 -= pad; y1 += pad; }
      if (y0 < v.y) { y1 += v.y - y0; y0 = v.y; }
      if (y1 > v.y + v.h) { y0 -= y1 - (v.y + v.h); y1 = v.y + v.h; }
      y0 = Math.max(v.y, y0);
      const inside = (b) => b.y >= y0 + 4 && b.y + b.h <= y1 - 4;
      const pt = (p) => !p || typeof p !== 'object' || (p.y >= y0 && p.y <= y1);
      f.items = f.items.filter((it) => {
        if (!chart(it) || it.kind === 'line') return true;
        if (it.kind === 'edge') return pt(it.from) && pt(it.to);
        const b = S.itemBox(it);
        return !b || inside(b);
      });
      // across: what is drawn, not the return lanes running past it (lines may be cut at the edge)
      const solid = Geo.union(f.items.filter((it) => !wire(it)).map(S.itemBox).filter(Boolean));
      const x0 = Math.max(v.x, solid.x - 24), x1 = Math.min(v.x + v.w, solid.x + solid.w + 24);
      f.view = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    return frames;
  };
  /** a column of text lines (code, signals) as left-aligned text items */
  P9.lines = function (list, x, y, opts) {
    opts = opts || {};
    const P = opts.prefix || 'ln', items = [], size = opts.size || 14, lh = opts.lh || size * 1.45;
    if (opts.title) items.push({ key: P + ':title', kind: 'text', x, y: y - 10, text: opts.title, cls: 'title', size: 14 });
    list.forEach((l, i) => {
      const t = typeof l === 'string' ? { text: l } : l;
      items.push({ key: P + ':' + i, kind: 'text', x, y: y + 14 + i * lh, text: t.text.replace(/\t/g, '  ') || ' ', cls: 'mono codeline' + (t.cls ? ' ' + t.cls : ''), size });
    });
    const w = Math.max(40, opts.title ? Geo.textWidth(opts.title, 14, { bold: true, caps: true, spacing: 0.06 }) : 0, ...list.map((l) => Geo.textWidth((typeof l === 'string' ? l : l.text), size, { mono: true })));
    return { items, box: { x, y: y - (opts.title ? 26 : 0), w, h: list.length * lh + 10 + (opts.title ? 26 : 0) } };
  };

  /**
   * The frames of a run of a chart, one per clock. o = {ch, trace (A.run's), regs0 (before the first clock),
   * Frames, intro, say(step, k, before) → extra sentence, ask(step, k) → meta for the frame before clock k
   * (a prediction about that clock), meta(step, k) → meta of clock k's own frame, show: [register names]
   * (default all), codes, logCols: [names] for the clock log}
   */
  P9.clockFrames = function (o) {
    const ch = o.ch, Fr = o.Frames;
    const lay = K.asm.layout(ch);
    let regs = Object.assign({}, o.regs0);
    const log = [];
    const chartBottom = lay.box.y + lay.box.h;
    const scene = (st, extra) => {
      const c = K.asm.draw(ch, Object.assign({ prefix: 'asm', codes: o.codes }, st || {}));
      return c.items.concat(extra || []);
    };
    // the registers and the log of the last clocks stand beside the chart, level with the present block
    const px = lay.box.x + lay.box.w + 44;
    const panelY = (state) => { const bb = K.asm.blockBox(ch, state); return Math.max(lay.box.y + 40, Math.min(bb.y + 34, chartBottom - 330)); };
    const panel = (vals, before, state) => {
      const y = panelY(state);
      const rg = K.asm.regs(P9.regList(ch, vals, before).filter((r) => !o.show || o.show.includes(r.name)), { x: px, y: y + 44, prefix: 'rg', title: 'registers' });
      const cols = ['clock', 'state'].concat(o.logCols || Object.keys(ch.registers));
      const rows = log.slice(-5).map((r) => [String(r.k + 1), r.state].concat((o.logCols || Object.keys(ch.registers)).map((n) => String(r.regs[n]))));
      const tb = rows.length ? K.table.draw({ x: px, y: y + 160, prefix: 'lg', rows, colHead: cols, size: 14, mono: true, minW: 36, minH: 26, ch: 28, title: 'after each clock', act: cols.map((_, c) => [rows.length - 1, c]) }) : null;
      const box = S.geom.union([rg.box, tb ? tb.box : null].filter(Boolean));
      return { items: rg.items.concat(tb ? tb.items : []), box };
    };
    const p0 = panel(regs, null, ch.start);
    Fr.add({ items: scene({ state: ch.start }, p0.items), say: o.intro, meta: o.introMeta || null, narrowView: K.asm.narrow(ch, ch.start) });
    o.trace.forEach((step, k) => {
      const before = regs;
      regs = step.regs;
      log.push({ k, state: step.state, regs: Object.assign({}, regs) });
      const tests = {}; for (const t of step.tests) tests[t.box] = t.value;
      const pn = panel(regs, before, step.state);
      const ask = o.ask ? o.ask(step, k, before) : null;
      if (ask) Fr.last().meta = Object.assign({}, Fr.last().meta || {}, ask);
      Fr.add({ items: scene({ state: step.state, path: step.path, tests, next: step.next }, pn.items), say: (step.say + (o.say ? ' ' + (o.say(step, k, before) || '') : '')).trim(), meta: o.meta ? o.meta(step, k) : null, narrowView: K.asm.narrow(ch, step.state) });
    });
    return { regs, log };
  };

  // ---- the example charts ------------------------------------------------------------------------------------
  /**
   * The charts the topics draw. The divider is the engine's own, with its TEST block written Z-first (the same
   * behaviour, clock for clock): then the paths back to SHIFT and to IDLE leave the block side by side and its
   * connectors can be drawn without crossing.
   */
  P9.extraCharts = {
    divider: () => A().chart({
      name: 'divider', inputs: ['START'], dataInputs: { DIN: 4, VIN: 4 }, registers: { A: 5, Q: 4, M: 4, P: 3, E: 1 }, outputs: ['READY'],
      status: { DZ: 'VIN == 0', NEG: 'A[4]', Z: 'P == 0' },
      states: {
        IDLE: { actions: ['READY'], next: { if: 'START', then: { if: 'DZ', then: { do: ['E ← 1'], then: 'IDLE' }, else: { do: ['A ← 0', 'Q ← DIN', 'M ← VIN', 'P ← 4', 'E ← 0'], then: 'SHIFT' } }, else: 'IDLE' } },
        SHIFT: { actions: ['{A, Q} ← {A, Q} << 1', 'P ← P - 1'], next: 'SUB' },
        SUB: { actions: ['A ← A - M'], next: 'TEST' },
        TEST: { actions: [], next: { if: 'Z', then: { if: 'NEG', then: { do: ['A ← A + M'], then: 'IDLE' }, else: { do: ['Q[0] ← 1'], then: 'IDLE' } }, else: { if: 'NEG', then: { do: ['A ← A + M'], then: 'SHIFT' }, else: { do: ['Q[0] ← 1'], then: 'SHIFT' } } } },
      },
    }),
  };
  P9.chart = (key) => (P9.extraCharts[key] ? P9.extraCharts[key]() : A().examples[key]());
})(globalThis.Sirkit = globalThis.Sirkit || {});
