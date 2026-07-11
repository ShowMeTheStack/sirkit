// Sirkit.Verilog, the front door:
//   compile(source, { top, files, defines }) -> { modules, errors, warnings, tops }   (files: names -> text, for
//     `include and $readmemh); errors and warnings are { line, col, msg }
//   elaborate(compiled | source | module, { top }) -> a design (scopes, signals, errors)
//   simulate(design, { until, trace, waves }) -> { output: the printed lines, waves, events, violations, time,
//     trace (with trace: true: every step of the scheduler, region by region), vcd(), dumped(), errors }
//   synthesise(compiled | source | module, { top }) -> a Netlist.Circuit (with .trace), or { ok: false, reasons }
//   fromCircuit(circuit) -> structural Verilog;  vcd(waves) -> VCD text;  run(source, opts) = all of it at once.
// Results have the shape of Sirkit.Sim: waves is a Map from the hierarchical name to [[t, value]], values as
// sim-values.js gives them (0, 1, 'X', 'Z' for one bit; an array of bits, least significant first, for a bus;
// reals are numbers), times in ns (a design with no `timescale counts one unit as 1 ns).
(function (S) {
  'use strict';
  const V = S.Verilog = S.Verilog || {};

  const byPos = (a, b) => (a.line - b.line) || (a.col - b.col);
  /** modules not instantiated by any other: the tops of the design */
  function findTops(parsed) {
    const used = new Set();
    const walk = (items) => {
      for (const it of items) {
        if (it.k === 'inst') used.add(it.module);
        if (it.k === 'genfor' || it.k === 'genblock') walk(it.body ? it.body.items : it.items);
        if (it.k === 'genif') { walk(it.then.items); if (it.else) walk(it.else.items); }
        if (it.k === 'gencase') for (const a of it.arms) walk(a.body.items);
      }
    };
    for (const m of parsed.modules) walk(m.items);
    return parsed.modules.filter((m) => !used.has(m.name)).map((m) => m.name);
  }
  V.findTops = findTops;

  function compile(src, opts) {
    opts = opts || {};
    const lx = V.lex(src, { files: opts.files, defines: opts.defines, file: opts.file });
    const parsed = V.parse(lx.toks);
    const errors = lx.errors.concat(parsed.errors);
    const names = new Map();
    for (const m of parsed.modules.concat(parsed.udps)) {
      if (names.has(m.name)) errors.push({ line: m.line, col: m.col, msg: 'there are two modules called ' + m.name + ' (the other is at line ' + names.get(m.name).line + ')' });
      else names.set(m.name, m);
    }
    let tops = opts.top ? [].concat(opts.top) : findTops(parsed);
    if (!opts.top && !tops.length && parsed.modules.length) { errors.push({ line: parsed.modules[0].line, col: 1, msg: 'every module is instantiated by another, so there is no top module (a module may not instantiate itself)' }); }
    const res = { modules: parsed.modules, udps: parsed.udps, parsed, errors, warnings: [], tops, files: opts.files || {}, opts };
    // each module knows its compile, so synthesise(module) and elaborate(module) work
    for (const m of parsed.modules) Object.defineProperty(m, 'unit', { value: res, enumerable: false, configurable: true });
    if (!errors.length && tops.length) {
      const W = V.Elab.build(parsed, tops, { files: opts.files });
      res.errors = W.errors;
      res.warnings = W.warnings;
      res.world = W;
    }
    res.errors.sort(byPos);
    res.warnings = dedupe(res.warnings).sort(byPos);
    return res;
  }
  V.compile = compile;
  const dedupe = (ws) => { const seen = new Set(); return ws.filter((w) => { const k = w.line + ':' + w.col + ':' + w.msg; if (seen.has(k)) return false; seen.add(k); return true; }); };

  /** a design ready to simulate: from source text or a compile result, with opts.top naming the top module(s) */
  function elaborate(x, opts) {
    opts = opts || {};
    if (typeof opts === 'string') opts = { top: opts };
    if (x && x.k === 'module' && x.unit) { opts = Object.assign({ top: x.name }, opts); x = x.unit; }
    const c = typeof x === 'string' ? compile(x, opts) : x;
    const tops = opts.top ? [].concat(opts.top) : c.tops;
    const W = c.world && (!opts.top || String(tops) === String(c.tops)) ? c.world : V.Elab.build(c.parsed, tops, { files: c.files });
    const design = {
      parsed: c.parsed, tops, files: c.files, errors: W.errors.slice().sort(byPos), warnings: dedupe(W.warnings.concat(c.warnings || [])).sort(byPos),
      scopes: W.roots.map(scopeTree),
      signals: W.stores.filter((s) => !s.dead && !s.arr).map((s) => ({ path: s.path, width: s.w, kind: s.kind, aliases: s.aliases.slice() })),
      timescale: { precision: W.P },
      world: W,
    };
    return design;
  }
  V.elaborate = elaborate;
  function scopeTree(sc) {
    return {
      name: sc.name, path: sc.path, kind: sc.kind, module: sc.mod ? sc.mod.name : null,
      signals: [...sc.syms.values()].filter((s) => s.k === 'var' && !s.auto).map((s) => ({ name: s.name, width: s.w, kind: s.kind, dir: s.dir, msb: s.msb, lsb: s.lsb, signed: s.signed, words: s.arr ? s.arr.size : 0 })),
      children: [...sc.children.values()].map(scopeTree),
    };
  }

  /** the Sim-style value of a vector */
  function simValue(v, w) {
    if (typeof v === 'number') return v;
    if (!v) return 'X';
    if (w === 1 || v.w === 1) return v.b ? (v.a ? 'X' : 'Z') : Number(v.a);
    const out = new Array(v.w);
    for (let i = 0; i < v.w; i++) { const b = v.bit(i); out[i] = b === 3 ? 'X' : b === 2 ? 'Z' : b; }
    return out;
  }
  V.simValue = simValue;

  V.DEFAULT_UNTIL = 1e6;
  /** run a design; opts.until is a time limit in ns */
  function simulate(design, opts) {
    opts = opts || {};
    if (typeof design === 'string' || (design && design.parsed && !design.world && design.modules)) design = elaborate(design, opts);
    const W = design.world && !design.world.K.started ? design.world : V.Elab.build(design.parsed, design.tops, { files: Object.assign({}, design.files, opts.files || {}) });
    design.world = null;
    const timed = design.parsed.modules.some((m) => m.timescale);
    const tickNs = timed ? Math.pow(10, W.P + 9) : 1;
    const res = { output: [], errors: W.errors.slice(), warnings: W.warnings.slice(), waves: new Map(), events: [], violations: [], time: 0, ticks: 0, finished: false, tickNs, world: W };
    if (W.errors.length) return res;
    const K = W.K;
    K.waves = opts.waves !== false;
    if (opts.maxEvents != null) K.maxEvents = opts.maxEvents;
    if (opts.stepLimit) K.stepLimit = opts.stepLimit;
    K.tickNs = tickNs;
    if (opts.trace) { K.tr = []; if (opts.traceLimit) K.trMax = opts.traceLimit; }
    // with no limit given, a design that never calls $finish stops after a while (opts.until: Infinity runs on)
    const until = opts.until != null ? (opts.until === Infinity ? null : Math.round(opts.until / tickNs)) : Math.round(V.DEFAULT_UNTIL / tickNs);
    if (opts.maxEvents != null) K.maxEvents = opts.maxEvents;
    if (opts.maxSteps) K.maxTotal = opts.maxSteps;
    K.run(until);
    res.output = K.out;
    res.errors = res.errors.concat(K.errors);
    res.ticks = K.now; res.time = K.now * tickNs;
    res.finished = K.finished; res.stopped = K.stopped; res.limited = K.limited;
    if (K.limited && opts.until == null && !K.errors.length) res.warnings.push({ line: 0, col: 0, msg: 'the simulation was stopped at ' + V.DEFAULT_UNTIL + ' ns because nothing ended it; call $finish, or give a run time' });
    if (K.tr) res.trace = K.tr.map((s) => (s.from !== undefined ? Object.assign({}, s, { from: s.from == null ? null : simValue(s.from, s.from.w), to: simValue(s.to, s.to && s.to.w) }) : s));
    let waves = null, events = null;
    Object.defineProperty(res, 'waves', {
      enumerable: true, get() {
        if (waves) return waves;
        waves = new Map();
        for (const st of W.stores) {
          if (st.dead || !st.wave) continue;
          const arr = st.wave.map(([t, v]) => [t * tickNs, simValue(v, st.w)]);
          for (const name of st.aliases) waves.set(name, arr);
        }
        return waves;
      },
    });
    Object.defineProperty(res, 'events', {
      enumerable: true, get() {
        if (events) return events;
        events = K.events.map((e) => ({ t: e.tick * tickNs, net: e.st.path, from: e.from == null ? null : simValue(e.from, e.st.w), to: e.to === 'event' ? 'event' : simValue(e.to, e.st.w), cause: e.cause }));
        return events;
      },
    });
    res.dumped = () => dumpView(W, K);
    res.vcd = () => (K.dump ? V.vcdFromDump(res.dumped(), W, K, { timed }) : null);
    res.signal = (path) => { const st = W.stores.find((s) => !s.dead && s.aliases.includes(path)); return st ? { width: st.w, value: simValue(st.val, st.w), bits: st.val && st.val.toBits ? st.val.toBits() : String(st.val) } : null; };
    return res;
  }
  V.simulate = simulate;
  /** compile, elaborate and simulate in one go */
  V.run = (src, opts) => {
    const c = compile(src, opts || {});
    if (c.errors.length) return { output: [], errors: c.errors, warnings: c.warnings, waves: new Map(), events: [] };
    return simulate(elaborate(c, opts), opts);
  };

  /** the signals $dumpvars selected, with their values as the VCD file shows them: { name: [[tick, bits]] } */
  function dumpView(W, K) {
    const d = K.dump;
    if (!d) return null;
    const pick = new Map(), kinds = {};
    // the VCD declares each signal as it was declared: reg, integer, time, or a net kind (wire, tri, ...)
    const VT = new Set(['reg', 'integer', 'time', 'wire', 'tri', 'wand', 'wor', 'triand', 'trior', 'tri0', 'tri1', 'trireg', 'supply0', 'supply1']);
    const kindOf = (sym) => (VT.has(sym.kind) ? sym.kind : 'wire');
    const add = (sc, depth, level) => {
      for (const sym of sc.syms.values()) {
        if (sym.k !== 'var' || sym.auto || sym.arr || !sym.st) continue;
        pick.set(sc.path + '.' + sym.name, sym.st);
        kinds[sc.path + '.' + sym.name] = kindOf(sym);
      }
      if (level !== 0 && depth >= level) return;
      for (const c of sc.children.values()) { if (c.kind === 'block' && c.name.startsWith('$unnamed')) continue; add(c, depth + 1, level); }
    };
    for (const s of d.sel) {
      if (!s.targets) for (const r of W.roots) add(r, 1, s.level);
      else for (const t of s.targets) {
        if (t.scope) add(t.scope, 1, s.level);
        else if (t.sym && t.sym.st) { pick.set(t.sym.scope.path + '.' + t.sym.name, t.sym.st); kinds[t.sym.scope.path + '.' + t.sym.name] = kindOf(t.sym); }
      }
    }
    const out = {};
    for (const [name, st] of pick) {
      if (st.real || st.kind === 'event') continue;
      const w = st.wave || [[0, st.val]];
      const list = [];
      const push = (t, bits) => { const l = list[list.length - 1]; if (l && l[0] === t) { list.pop(); } const p = list[list.length - 1]; if (!p || p[1] !== bits) list.push([t, bits]); };
      let on = true;
      const valueAt = (t) => { let v = null; for (const e of w) { if (e[0] <= t) v = e[1]; else break; } return v; };
      const events = w.filter((e) => e[0] > d.t).map((e) => ({ t: e[0], v: e[1] }));
      const toggles = d.toggles.map(([t, s2]) => ({ t, tog: s2 }));
      const all = events.concat(toggles).sort((a, b) => a.t - b.t || (a.tog !== undefined ? 1 : 0) - (b.tog !== undefined ? 1 : 0));
      push(d.t, bitsOf(valueAt(d.t), st.w));
      for (const e of all) {
        if (e.tog !== undefined) {
          if (e.tog === on) continue;
          on = e.tog;
          push(e.t, on ? bitsOf(valueAt(e.t), st.w) : 'x'.repeat(st.w));
        } else if (on) push(e.t, bitsOf(e.v, st.w));
      }
      out[name] = list;
    }
    // for the VCD writer, not part of the listing: declared kinds and the $dumpoff / $dumpon times
    Object.defineProperty(out, 'kinds', { value: kinds, enumerable: false });
    Object.defineProperty(out, 'toggles', { value: d.toggles.filter((x) => x[0] > d.t).map(([t, on]) => ({ t, on })), enumerable: false });
    return out;
  }
  const bitsOf = (v, w) => (v && v.toBits ? v.toBits() : 'x'.repeat(w));
})(globalThis.Sirkit = globalThis.Sirkit || {});
