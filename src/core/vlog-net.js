// Verilog structure: continuous assignments, gate primitives, user-defined primitives (UDPs) and module port
// connections. Each becomes a driver of a net, re-evaluated in the active region when an input changes,
// with inertial delays (rise, fall, turn-off). Ports connected to a whole signal of the same width are
// collapsed onto it, as simulators do.
(function (S) {
  'use strict';
  /** 'a' or 'an' before a word as it is read aloud (an AND, an xor, an 8-bit, a NAND, a reg) */
  const an = (w) => (/^(?:[aeiou]|x(?:n?or)\b|nmos|rnmos|rtran|rcmos|rpmos|8|11(?!\d)|18(?!\d))/i.test(String(w)) ? 'an ' : 'a ');
  const V = S.Verilog = S.Verilog || {};
  const N = V.Net = {};
  const err = (msg, node) => new V.VError(msg, node);
  const X = () => V.Expr;

  function implicitNet(W, sc, n) {
    const mod = sc.inst;
    if (mod.mod && mod.mod.nettype === 'none') throw err(n.name + ' is not declared (and `default_nettype none forbids implicit nets)', n);
    W.warnings.push({ line: n.line, col: n.col, msg: n.name + ' is not declared, so it is taken as a 1-bit wire' });
    return V.Elab.declareAll(W, mod, [{ dir: null, kind: 'wire', signed: false, range: null, names: [{ name: n.name, dims: [], init: null, line: n.line, col: n.col }] }])[0];
  }
  N.implicitNet = implicitNet;

  /** net segments driven by an assign target, MSB first: [{ sym, st, lo, w }] */
  function netTargets(W, sc, l, what) {
    if (l.k === 'concat') return l.parts.flatMap((p) => netTargets(W, sc, p, what));
    const { root, chain } = V.Elab.selChain(l);
    if (root.k !== 'id') throw err('an assign needs a net (or a part of one) on its left side', l);
    let sym = V.Elab.resolve(W, sc, root, true);
    if (!sym && !root.path) sym = implicitNet(W, sc, root);
    if (!sym) V.Elab.resolve(W, sc, root);
    if (sym.k !== 'var') throw err(root.name + ' cannot be driven by ' + what, l);
    if (!sym.isNet) throw err(root.name + ' is ' + an(sym.kind) + sym.kind + ', so ' + what + ' cannot drive it; declare it as a wire (a reg gets its value in initial or always blocks)', l);
    if (sym.arr) throw err(root.name + ' is an array of nets; drive one element', l);
    if (!chain.length) return [{ sym, st: sym.st, lo: 0, w: sym.w }];
    if (chain.length > 1) throw err('only one bit or part select may follow ' + root.name, l);
    const c = chain[0];
    if (c.k === 'index' && !X().isConst(W, sc, c.index)) throw err('the index of ' + root.name + ' on the left of an assign must be a constant', c);
    if (c.k === 'ipart' && !X().isConst(W, sc, c.start)) throw err('the part-select of ' + root.name + ' on the left of an assign must be constant', c);
    const sel = X().partOf(W, sc, sym, c, root);
    const lo = sel.lo(null);
    if (lo === null || lo < 0 || lo + sel.w > sym.w) throw err('the select is outside ' + root.name + '[' + sym.msb + ':' + sym.lsb + ']', c);
    return [{ sym, st: sym.st, lo, w: sel.w }];
  }
  N.netTargets = netTargets;

  const eqA = (x, y) => x.eq(y) && (x.amb || 0n) === (y.amb || 0n);
  /** delay closures: [rise, fall, turnoff] in ticks, or null */
  function delays(W, sc, list) {
    if (!list || !list.length) return null;
    if (list.length > 3) throw err('a delay has at most three values (rise, fall, turn-off)', list[0]);
    const fs = list.map((d) => V.Stmt.delayTicks(W, sc, d));
    return fs;
  }
  /** the delay for a change from old to new value */
  function pickDelay(ds, old, nv) {
    if (ds.length === 1) return ds[0](null);
    const r = ds[0](null), f = ds[1](null), z = ds.length > 2 ? ds[2](null) : Math.min(r, f);
    const m = V.mask(nv.w);
    if (nv.b === m && nv.a === 0n) return z;
    if (nv.w === 1 && (nv.b || nv.amb)) return Math.min(r, f, ds.length > 2 ? z : Infinity);
    if (nv.a === 0n && nv.b === 0n) return f;
    return r;
  }

  /**
   * a driver that re-evaluates fn (f => Vec of width w) when any of syms changes and drives the given segments,
   * after an inertial delay
   */
  function makeDriver(W, segs, w, fn, syms, ds, node, cause, weak) {
    const K = W.K;
    const drvs = segs.map((s) => K.addDriver(s.st, s.lo, s.w, weak, cause));
    let pending = null, scheduled = false, cur = null;
    const put = (v) => {
      if (segs.length === 1) { K.drive(drvs[0], v); return; }
      let off = w;
      segs.forEach((s, i) => { off -= s.w; K.drive(drvs[i], V.slice(v, off, s.w)); });
    };
    const evaluate = () => {
      scheduled = false;
      const v = fn(null);
      if (!ds) { cur = v; put(v); return; }
      if (pending) { if (eqA(pending.v, v)) return; pending.dead = true; pending = null; }
      if (cur && eqA(cur, v)) return;
      const d = pickDelay(ds, cur || V.allX(w), v);
      const p = { v, dead: false };
      pending = p;
      K.after(d, () => { if (p.dead) return; pending = null; cur = v; put(v); });
    };
    const watcher = { trig: () => { if (!scheduled) { scheduled = true; K.active(evaluate); } }, cause };
    for (const s of new Set(syms.map((x) => x.st))) K.watch(s, watcher);
    K.atStart(() => { scheduled = true; K.active(evaluate); });
    return { evaluate, drvs };
  }
  N.makeDriver = makeDriver;

  function contAssign(W, sc, lhs, rhs, delay, node) {
    const segs = netTargets(W, sc, lhs, 'assign');
    const w = segs.reduce((s, x) => s + x.w, 0);
    const t = V.Elab.typeOf(W, sc, rhs);
    let fn;
    if (t.r) { const r = X().compileReal(W, sc, rhs); fn = (f) => V.fromReal(r(f), w, false); }
    else { const ww = Math.max(w, t.w), v = X().compile(W, sc, rhs, ww, t.s); fn = ww === w ? v : (f) => V.resize(v(f), w, false); }
    const syms = [...X().reads(W, sc, rhs)].filter((s) => s.k === 'var' && !s.auto);
    const cause = 'assign at line ' + (node.line || lhs.line);
    W.assigns.push({ sc, lhs, rhs, node, segs });
    makeDriver(W, segs, w, fn, syms, delays(W, sc, delay), node, cause);
  }
  N.contAssign = contAssign;

  // ---- gates -------------------------------------------------------------------------------------------------------
  const bit = (v) => (v.w === 1 ? v : V.slice(v, 0, 1));
  const GATEFN = {
    and: (xs) => xs.reduce((a, b) => V.ops.and(a, b)),
    or: (xs) => xs.reduce((a, b) => V.ops.or(a, b)),
    xor: (xs) => xs.reduce((a, b) => V.ops.xor(a, b)),
    nand: (xs) => V.ops.not(GATEFN.and(xs)),
    nor: (xs) => V.ops.not(GATEFN.or(xs)),
    xnor: (xs) => V.ops.not(GATEFN.xor(xs)),
  };
  const tri = (data, ctrl, on, invert) => {
    const c = V.truth(ctrl);
    if (ctrl.b) {
      // an unknown enable: the output is the data or z (L or H), unless the data is unknown too
      if (data.b) return V.X1;
      const d = invert ? V.ops.not(data) : data, r = new V.Vec(1, d.a, 0n, false);
      r.amb = 1n;
      return r;
    }
    if (c !== on) return V.Z1;
    const d = data.b ? V.X1 : data;
    return invert ? V.ops.not(d) : d;
  };
  function gateInst(W, sc, g) {
    const type = g.type;
    W.gateList.push({ sc, node: g });
    if (/tran/.test(type)) throw err('the switch ' + type + ' is not supported; use assign or bufif gates', g);
    const ds = delays(W, sc, g.delay);
    for (const inst of g.insts) {
      let n = 1;
      if (inst.range) { const a = V.Elab.constInt(W, sc, inst.range.msb), b = V.Elab.constInt(W, sc, inst.range.lsb); n = Math.abs(a - b) + 1; }
      for (let k = 0; k < n; k++) one(inst, k, n);
    }
    function term(inst, e, k, n, isOut) {
      // terminal k of an array of n gates: a 1-bit signal is shared, an n-bit one is sliced
      if (!e) throw err('the ' + type + ' gate' + (inst.name ? ' ' + inst.name : '') + ' has an empty connection; every terminal needs a signal', inst);
      const t = V.Elab.typeOf(W, sc, e);
      if (n > 1 && t.w === n) {
        if (isOut) { const segs = netTargets(W, sc, e, 'a gate'); return { segs: sliceSegs(segs, k, n) }; }
        const v = X().compile(W, sc, e, t.w, false); return { fn: (f) => V.slice(v(f), k, 1), syms: X().reads(W, sc, e) };
      }
      if (isOut) {
        const segs = netTargets(W, sc, e, 'a gate');
        return { segs };
      }
      const v = X().compile(W, sc, e, t.w, t.s);
      return { fn: (f) => bit(v(f)), syms: X().reads(W, sc, e) };
    }
    function sliceSegs(segs, k, n) {
      // bit k (from the LSB) of a concatenation of segments
      let off = 0;
      for (let i = segs.length - 1; i >= 0; i--) { const s = segs[i]; if (k < off + s.w) return [{ sym: s.sym, st: s.st, lo: s.lo + (k - off), w: 1 }]; off += s.w; }
      return segs;
    }
    function one(inst, k, n) {
      const args = inst.args;
      const cause = type + ' gate ' + (inst.name || '') + ' at line ' + g.line;
      const drive = (outs, fn, syms) => {
        for (const o of outs) {
          const segs = o.segs, w = segs.reduce((s, x) => s + x.w, 0);
          const f2 = w === 1 ? fn : (f) => V.resize(fn(f), w, false);
          makeDriver(W, segs, w, f2, [...syms].filter((s) => s.k === 'var' && !s.auto), ds, g, cause);
        }
      };
      if (type === 'pullup' || type === 'pulldown') {
        for (const a of args) { const segs = netTargets(W, sc, a, an(type) + type); const w = segs.reduce((s, x) => s + x.w, 0); const v = type === 'pullup' ? V.resize(V.allX(1), w).a && V.from(V.mask(w), w) : V.fromInt(0, w); makeDriver(W, segs, w, () => v, [], null, g, cause, true); }
        return;
      }
      if (type === 'buf' || type === 'not') {
        if (args.length < 2) throw err(an(type) + type + ' gate needs at least one output and one input', inst);
        const input = term(inst, args[args.length - 1], k, n, false);
        const outs = args.slice(0, -1).map((a) => term(inst, a, k, n, true));
        const fn = type === 'buf' ? (f) => { const v = input.fn(f); return v.b ? V.X1 : v; } : (f) => V.ops.not(input.fn(f));
        drive(outs, fn, input.syms);
        return;
      }
      if (/^(bufif|notif)[01]$/.test(type) || /^r?(nmos|pmos)$/.test(type)) {
        if (args.length !== 3) throw err(an(type) + type + ' gate has three terminals: output, input, control', inst);
        const out = term(inst, args[0], k, n, true), d = term(inst, args[1], k, n, false), c = term(inst, args[2], k, n, false);
        const on = /1$|nmos/.test(type) ? 1 : 0, inv = type.startsWith('notif');
        const pass = /mos/.test(type);
        const fn = pass ? (f) => { const cv = c.fn(f); if (cv.b) return V.X1; return V.truth(cv) === on ? d.fn(f) : V.Z1; } : (f) => tri(d.fn(f), c.fn(f), on, inv);
        drive([out], fn, new Set([...d.syms, ...c.syms]));
        return;
      }
      if (/^r?cmos$/.test(type)) {
        if (args.length !== 4) throw err('a cmos switch has four terminals: output, input, n-control, p-control', inst);
        const out = term(inst, args[0], k, n, true), d = term(inst, args[1], k, n, false), nc = term(inst, args[2], k, n, false), pc = term(inst, args[3], k, n, false);
        const fn = (f) => { const a = nc.fn(f), b = pc.fn(f); if (V.truth(a) === 1 || (!b.b && V.truth(b) === 0)) return d.fn(f); if (a.b || b.b) return V.X1; return V.Z1; };
        drive([out], fn, new Set([...d.syms, ...nc.syms, ...pc.syms]));
        return;
      }
      const g2 = GATEFN[type];
      if (!g2) throw err('the gate ' + type + ' is not supported', g);
      if (args.length < 3) throw err(an(type) + type + ' gate needs an output and at least two inputs', inst);
      const out = term(inst, args[0], k, n, true);
      const ins = args.slice(1).map((a) => term(inst, a, k, n, false));
      const syms = new Set(ins.flatMap((x) => [...x.syms]));
      drive([out], (f) => g2(ins.map((x) => x.fn(f))), syms);
    }
  }
  N.gateInst = gateInst;

  // ---- user-defined primitives -------------------------------------------------------------------------------------
  const lvl = (sym, v) => sym === v || sym === '?' || (sym === 'b' && v !== 'x');
  function edgeMatch(sym, from, to) {
    if (from === to) return false;
    switch (sym) {
      case 'r': return from === '0' && to === '1';
      case 'f': return from === '1' && to === '0';
      case 'p': return (from === '0' && to !== '0') || (from === 'x' && to === '1');
      case 'n': return (from === '1' && to !== '1') || (from === 'x' && to === '0');
      case '*': return true;
    }
    if (sym.length === 4) return lvl(sym[1], from) && lvl(sym[2], to);
    return false;
  }
  const isEdge = (sym) => sym.length === 4 || 'rfpn*'.includes(sym);
  N.udpEval = function (u, ins, state, changed, from) {
    const seq = u.seq;
    // level rows first
    for (const r of u.rows) {
      if (r.ins.some(isEdge)) continue;
      if (!r.ins.every((s, i) => lvl(s, ins[i]))) continue;
      if (seq && !lvl(r.cur, state)) continue;
      return r.out === '-' ? state : r.out;
    }
    if (seq && changed >= 0) {
      for (const r of u.rows) {
        const ei = r.ins.findIndex(isEdge);
        if (ei !== changed) continue;
        if (!edgeMatch(r.ins[ei], from, ins[ei])) continue;
        if (!r.ins.every((s, i) => i === ei || lvl(s, ins[i]))) continue;
        if (!lvl(r.cur, state)) continue;
        return r.out === '-' ? state : r.out;
      }
    }
    return 'x';
  };
  function udpInst(W, sc, it, one, u) {
    const K = W.K;
    W.udpList.push({ sc, node: it, one, udp: u });
    const args = one.conns.ordered;
    if (!args) throw err('a primitive instance connects its terminals in order, not by name', one);
    if (args.length !== u.ports.length) throw err(u.name + ' has ' + u.ports.length + ' terminals but ' + args.length + ' are connected', one);
    for (const row of u.rows) {
      if (row.ins.filter(isEdge).length > 1) throw err('a table row may have only one edge', { line: row.line, col: 1 });
      if (!u.seq && row.ins.some(isEdge)) throw err('a combinational primitive cannot have edges in its table', { line: row.line, col: 1 });
    }
    const segs = netTargets(W, sc, args[0], 'a primitive');
    const ins = args.slice(1).map((e) => { const t = V.Elab.typeOf(W, sc, e); const v = X().compile(W, sc, e, t.w, t.s); return (f) => bit(v(f)); });
    const syms = args.slice(1).flatMap((e) => [...X().reads(W, sc, e)]).filter((s) => s.k === 'var' && !s.auto);
    const ds = it.params && it.params.ordered ? delays(W, sc, it.params.ordered) : null;
    const ch = (v) => (v.b ? 'x' : v.a ? '1' : '0');
    let last = ins.map(() => 'x');
    let state = 'x';
    if (u.init) { const iv = V.Elab.constVal(W, sc, u.init); state = ch(typeof iv === 'number' ? V.fromReal(iv, 1) : V.slice(iv, 0, 1)); }
    const toVec = (c) => (c === '1' ? V.ONE1 : c === '0' ? V.ZERO1 : V.X1);
    const order = [];
    const fn = () => {
      const cur = ins.map((g) => ch(g(null)));
      if (!u.seq) { last = cur; state = N.udpEval(u, cur, state, -1, null); return toVec(state); }
      const seq = order.splice(0).concat(cur.map((_, i) => i));
      const done = new Set();
      for (const i of seq) {
        if (done.has(i)) continue;
        done.add(i);
        if (cur[i] === last[i]) continue;
        const now = last.slice(); now[i] = cur[i];
        state = N.udpEval(u, now, state, i, last[i]);
        last = now;
      }
      return toVec(state);
    };
    const symIdx = args.slice(1).map((e) => new Set([...X().reads(W, sc, e)].map((s) => s.st)));
    for (const st of new Set(syms.map((s) => s.st))) K.watch(st, { trig: (s) => symIdx.forEach((set, i) => { if (set.has(s)) order.push(i); }) });
    makeDriver(W, segs, 1, fn, syms, ds, one, u.name + ' ' + (one.name || '') + ' at line ' + one.line);
  }
  N.udpInst = udpInst;

  // ---- ports -------------------------------------------------------------------------------------------------------
  function connectPorts(W, inst) {
    const mod = inst.mod, it = inst.instItem, one = inst.instNode, parent = inst.parent;
    const conns = one.conns;
    const formal = mod.ports;
    const pairs = [];
    if (conns.named) {
      const seen = new Set();
      for (const c of conns.named) {
        if (!formal.some((p) => p.name === c.port)) throw err(mod.name + ' has no port called ' + c.port + ' (its ports are ' + formal.map((p) => p.name).filter(Boolean).join(', ') + ')', c);
        if (seen.has(c.port)) throw err('the port ' + c.port + ' is connected twice', c);
        seen.add(c.port);
        pairs.push({ name: c.port, expr: c.expr, node: c });
      }
      for (const p of formal) if (p.name && !seen.has(p.name)) pairs.push({ name: p.name, expr: null, node: one, missing: true });
    } else {
      if (conns.ordered.length > formal.length && !(formal.length === 0 && conns.ordered.length === 1 && !conns.ordered[0])) throw err(mod.name + ' has ' + formal.length + ' port' + (formal.length === 1 ? '' : 's') + ' but ' + conns.ordered.length + ' connections are given', one);
      formal.forEach((p, i) => pairs.push({ name: p.name, expr: conns.ordered[i] || null, node: conns.ordered[i] || one, missing: i >= conns.ordered.length }));
    }
    for (const pr of pairs) {
      if (!pr.name) continue;
      const sym = inst.syms.get(pr.name);
      if (!sym || !sym.dir) throw err('the port ' + pr.name + ' of ' + mod.name + ' has no direction; declare it with input, output or inout', formal.find((p) => p.name === pr.name) || it);
      if (!pr.expr) {
        if (sym.dir === 'input' && pr.missing === false) W.warnings.push({ line: pr.node.line, col: pr.node.col, msg: 'the input ' + pr.name + ' of ' + inst.path + ' is not connected (it floats at z)' });
        continue;
      }
      connect(W, inst, parent, sym, pr.expr, pr.node);
    }
  }
  N.connectPorts = connectPorts;

  function connect(W, inst, parent, sym, e, node) {
    const K = W.K;
    // an undeclared simple name becomes an implicit wire
    if (e.k === 'id' && !e.path && !V.Elab.resolve(W, parent, e, true)) implicitNet(W, parent, e);
    let te = V.Elab.typeOf(W, parent, e);
    let k = inst.arrCount || 1, pos = inst.arrPos || 0;
    let slice = null;
    if (k > 1 && te.w === sym.w * k) slice = (k - 1 - pos) * sym.w; // instance arrays: the left instance takes the high bits
    if (k > 1 && te.w !== sym.w && slice === null) throw err('each instance of the array ' + inst.path.replace(/\[\d+\]$/, '') + ' needs ' + sym.w + ' or ' + sym.w * k + ' bits on port ' + sym.name + ', not ' + te.w, node);
    if (slice === null && te.w !== sym.w && !te.r) W.warnings.push({ line: node.line, col: node.col, msg: 'port ' + sym.name + ' of ' + inst.path + ' is ' + sym.w + ' bit' + (sym.w === 1 ? '' : 's') + ' wide but is connected to ' + te.w + ' bit' + (te.w === 1 ? '' : 's') });
    const outer = e.k === 'id' ? V.Elab.resolve(W, parent, e, true) : null;
    const aliasable = slice === null && outer && outer.k === 'var' && !outer.arr && !outer.real && !outer.auto && outer.w === sym.w && sym.isNet && !sym.real &&
      (sym.dir === 'input' || (outer.isNet && (outer.kind === sym.kind || (/^(wire|tri)$/.test(outer.kind) && /^(wire|tri)$/.test(sym.kind)))));
    W.portConns.push({ inst, sym, expr: e, parent, dir: sym.dir, slice, aliased: !!aliasable, node });
    if (aliasable) {
      const st = sym.st;
      st.dead = true;
      outer.st.aliases.push(...st.aliases);
      sym.st = outer.st;
      sym.aliasOf = outer;
      return;
    }
    if (sym.dir === 'inout') throw err('the inout port ' + sym.name + ' of ' + inst.path + ' must connect to a whole net of the same width', node);
    const cause = 'port ' + sym.name + ' of ' + inst.path;
    if (sym.dir === 'input') {
      if (!sym.isNet) throw err('the input ' + sym.name + ' must be a net', node);
      let fn;
      if (te.r) { const r = X().compileReal(W, parent, e); fn = (f) => V.fromReal(r(f), sym.w, false); }
      else if (slice !== null) { const v = X().compile(W, parent, e, te.w, false); fn = (f) => V.slice(v(f), slice, sym.w); }
      else { const ww = Math.max(te.w, sym.w), v = X().compile(W, parent, e, ww, te.s); fn = ww === sym.w ? v : (f) => V.resize(v(f), sym.w, false); }
      const syms = [...X().reads(W, parent, e)].filter((s) => s.k === 'var' && !s.auto);
      makeDriver(W, [{ sym, st: sym.st, lo: 0, w: sym.w }], sym.w, fn, syms, null, node, cause);
      return;
    }
    // output: the outside must be a net (or nets)
    const segs0 = netTargets(W, parent, e, 'the output port ' + sym.name + ' of ' + inst.path);
    let segs = segs0, w = segs.reduce((s, x) => s + x.w, 0);
    if (slice !== null) {
      // the part of the outside signal for this instance
      segs = pickBits(segs0, slice, sym.w); w = sym.w;
    }
    const src = sym.st;
    const fn = sym.real ? () => V.fromReal(src.val, w, false) : w === sym.w ? () => src.val : () => V.resize(src.val, w, sym.signed);
    makeDriver(W, segs, w, fn, [sym], null, node, cause);
  }
  function pickBits(segs, lo, w) {
    // bits [lo, lo+w) of a concatenation of segments (MSB first)
    const out = [];
    let off = 0;
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      const a = Math.max(lo, off), b = Math.min(lo + w, off + s.w);
      if (a < b) out.unshift({ sym: s.sym, st: s.st, lo: s.lo + (a - off), w: b - a });
      off += s.w;
    }
    return out;
  }

  /** errors for variables written by more than one always block */
  N.checkDrivers = function (W) {
    const owner = new Map();
    for (const d of W.deferred) {
      if (d.k !== 'always') continue;
      let ws;
      try { ws = V.Stmt.writesOfStmt(W, d.sc, d.node.body); } catch (e) { continue; }
      const seen = new Set();
      for (const x of ws) {
        const st = x.sym.st;
        if (!st || seen.has(st)) continue;
        seen.add(st);
        const prev = owner.get(st);
        if (prev && prev.node !== d.node) {
          if (x.sym.kind === 'integer' || x.sym.kind === 'time') continue;
          W.warnings.push({ line: x.node.line, col: x.node.col, msg: x.sym.name + ' is assigned in two always blocks (lines ' + prev.node.line + ' and ' + d.node.line + '); give each variable one always block' });
        } else owner.set(st, { node: d.node });
      }
    }
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
