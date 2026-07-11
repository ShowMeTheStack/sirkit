// The Verilog event scheduler and the system tasks. Each time step runs the active region (process resumes,
// net updates, continuous assignment evaluations), then the inactive region (#0), then the non-blocking
// assignment region; when all are empty, $strobe and $monitor print (the postponed region) and time moves on.
// Time is counted in ticks of the finest `timescale precision in the design.
(function (S) {
  'use strict';
  const V = S.Verilog = S.Verilog || {};
  const Sim = V.Sim = {};
  const B1 = 1n;
  const FINISH = { finish: true };
  const lsb = (v) => (v.b & B1 ? (v.a & B1 ? 'x' : 'z') : v.a & B1 ? '1' : '0');
  const same = (a, b) => (typeof a === 'number' || typeof b === 'number' ? a === b : a === b || (a && b && a.a === b.a && a.b === b.b && a.w === b.w));

  class Kernel {
    constructor(W) {
      this.W = W;
      this.now = 0;
      this.act = []; this.ai = 0; this.inact = []; this.nbaQ = [];
      this.future = new Map(); this.heap = [];
      this.threads = new Set(); this.cur = null;
      this.starts = [];
      this.out = []; this.buf = '';
      this.strobes = []; this.monitor = null; this.monitorOn = true;
      this.seed = 0; this.useed = 0;
      this.events = []; this.maxEvents = 100000;
      this.finished = false; this.stopped = false;
      this.errors = [];
      this.depth = 0; this.steps = 0; this.stepLimit = 2e6; this.total = 0; this.maxTotal = 2e7; this.limited = false;
      this.dump = null;
      this.tf = null;
      this.cause = null;
      this.forcing = false;
      this.tr = null; this.trMax = 5000; this.tickNs = 1; this.region = 'active'; this.nbaL = [];
    }
    /** a step of the scheduler trace (simulate with { trace: true }) */
    trace(o) { if (this.tr.length < this.trMax) { o.t = this.now * this.tickNs; this.tr.push(o); } }
    // ---- time ------------------------------------------------------------------------------------------------
    scaleOf(sc) { const u = sc.inst.unit != null ? sc.inst.unit : 0; return Math.pow(10, u - this.W.P); }
    ticks(sc, v) {
      const inst = sc.inst, u = inst.unit != null ? inst.unit : 0, p = inst.prec != null ? inst.prec : 0, P = this.W.P;
      if (typeof v === 'number') {
        if (!(v > 0)) return 0;
        return Math.round(v * Math.pow(10, u - p)) * Math.pow(10, p - P);
      }
      if (v.b) return 0;
      return Number(v.a) * Math.pow(10, u - P);
    }
    timeIn(sc) { const s = this.scaleOf(sc); return s === 1 ? this.now : Math.round(this.now / s); }
    // ---- queues ------------------------------------------------------------------------------------------------
    active(fn) { this.act.push(fn); }
    bucket(t) {
      let b = this.future.get(t);
      if (!b) { b = { act: [], nba: [] }; this.future.set(t, b); heapPush(this.heap, t); }
      return b;
    }
    after(d, fn) { if (d <= 0) this.act.push(fn); else this.bucket(this.now + d).act.push(fn); }
    nba(apply, v, label) { this.nbaQ.push(apply, v); if (this.tr) this.nbaL.push(label ? label + ' <= ' + Sim.show(v) : 'an update'); }
    nbaAt(d, apply, v) { if (d <= 0) this.nbaQ.push(apply, v); else this.bucket(this.now + d).nba.push(apply, v); }
    atStart(fn) { this.starts.push(fn); }
    guard(node) {
      if (++this.steps > this.stepLimit) throw this.runtimeError('a loop keeps running without letting time pass' + (node && node.line ? ' (the loop at line ' + node.line + ')' : '') + '; add a delay or an event control', node);
    }
    runtimeError(msg, node) { const e = new V.VError(msg, node); e.runtime = true; return e; }
    // ---- values ------------------------------------------------------------------------------------------------
    watch(st, w) { st.watch.push(w); }
    unwatch(st, w) { const i = st.watch.indexOf(w); if (i >= 0) st.watch.splice(i, 1); }
    setVar(st, v) {
      if (st.forced && !this.forcing) return;
      const old = st.val;
      if (same(old, v)) return;
      st.val = v;
      this.changed(st, old);
    }
    setWord(st, i, v) {
      const old = st.words[i];
      if (old && same(old, v)) return;
      st.words[i] = v;
      this.changed(st, null, i);
    }
    trigger(st) {
      this.log(st, null, 'event');
      this.wake(st);
    }
    changed(st, old, word) {
      if (word === undefined) this.record(st, old);
      if (this.tr && this.started) this.trace({ kind: 'update', region: this.region, net: st.path, from: old, to: word === undefined ? st.val : st.words[word], say: (word === undefined ? st.path + ' changes from ' + Sim.show(old) + ' to ' + Sim.show(st.val) : st.path + '[' + word + '] is written') + (this.cause ? ' (' + this.cause + ')' : '') });
      if (this.quiet) return;
      const ws = st.watch;
      for (let i = 0; i < ws.length; i++) ws[i].trig(st);
      this.wake(st);
    }
    wake(st) {
      const ws = st.waits;
      if (!ws || !ws.size) return;
      for (const w of [...ws]) if (w.check(st)) this.fire(w);
    }
    record(st, old) {
      if (st.wave) {
        const a = st.wave, last = a[a.length - 1];
        if (last && last[0] === this.now) { last[1] = st.val; if (a.length > 1 && same(a[a.length - 2][1], st.val)) a.pop(); }
        else a.push([this.now, st.val]);
      }
      this.log(st, old, st.val);
    }
    log(st, from, to) {
      if (this.events.length >= this.maxEvents || !this.started) return;
      this.events.push({ tick: this.now, st, from, to, cause: this.cause });
    }
    // ---- nets --------------------------------------------------------------------------------------------------
    addDriver(st, lo, w, weak, cause) {
      if (!st.drivers) st.drivers = [];
      const d = { st, lo, w, val: weak ? V.allZ(w) : V.allX(w), weak: !!weak, cause };
      st.drivers.push(d);
      return d;
    }
    drive(d, v) {
      if (same(d.val, v) && (d.val.amb || 0n) === (v.amb || 0n)) return;
      d.val = v;
      const save = this.cause; this.cause = d.cause;
      this.resolveNet(d.st);
      this.cause = save;
    }
    netValue(st) {
      const ds = st.drivers || [], w = st.w;
      if (st.kind === 'supply0') return V.fromInt(0, w);
      if (st.kind === 'supply1') return V.vec(w, V.mask(w));
      let v;
      if (ds.length === 1 && ds[0].w === w && !ds[0].weak && !ds[0].val.amb) v = ds[0].val;
      else {
        let amb = null;
        let strong = null, weak = null;
        for (const d of ds) {
          let full = d.w === w && d.lo === 0 ? d.val : V.splice(V.allZ(w), d.lo, d.val);
          if (d.val.amb) {
            // 0-or-z (L) and 1-or-z (H) bits: left out here, settled against the rest below
            const am = d.val.amb << BigInt(d.lo);
            (amb || (amb = [])).push({ m: am, v: full });
            full = new V.Vec(w, full.a & ~am, full.b | am, false);
          }
          if (d.weak) weak = weak ? V.resolve(weak, full) : full;
          else strong = strong ? V.resolve(strong, full, st.kind === 'wand' || st.kind === 'triand' ? 'wand' : st.kind === 'wor' || st.kind === 'trior' ? 'wor' : null) : full;
        }
        v = strong || V.allZ(w);
        if (weak) { const z = v.b & ~v.a; if (z) v = new V.Vec(w, (v.a & ~z) | (weak.a & z), (v.b & ~z) | (weak.b & z), false); }
        if (amb) for (const { m, v: x } of amb) {
          // a bit that agrees with the L/H value keeps it; anything else is x
          const agree = m & ~(v.a ^ x.a) & ~v.b;
          const bad = m & ~agree;
          if (bad) v = new V.Vec(w, v.a | bad, v.b | bad, false);
        }
      }
      if (st.kind === 'tri0' || st.kind === 'tri1') {
        const z = v.b & ~v.a;
        if (z) v = new V.Vec(w, st.kind === 'tri1' ? v.a | z : v.a, v.b & ~z, false);
      }
      return v;
    }
    resolveNet(st) {
      if (st.forced) return;
      const v = this.netValue(st), old = st.val;
      if (same(old, v)) return;
      st.val = v;
      this.changed(st, old);
    }
    force(sym, fn, syms, kind) {
      const st = sym.st;
      this.release(sym, kind, true);
      const apply = () => { this.forcing = true; const v = fn(null); try { if (!same(st.val, v)) { const old = st.val; st.val = v; this.changed(st, old); } } finally { this.forcing = false; } };
      const w = { trig: () => this.active(apply) };
      st.forced = { kind, w, deps: syms.map((s) => s.st) };
      for (const d of st.forced.deps) this.watch(d, w);
      apply();
    }
    release(sym, kind, quiet) {
      const st = sym.st;
      if (!st.forced) return;
      for (const d of st.forced.deps) this.unwatch(d, st.forced.w);
      st.forced = null;
      if (st.isNet && !quiet) this.resolveNet(st);
    }
    // ---- threads -------------------------------------------------------------------------------------------------
    spawn(genFn, f, sc, parent, fk, desc, early) {
      const th = { gen: genFn(f), blocks: [], inh: parent ? new Set([...parent.inh, ...parent.blocks]) : new Set(), alive: true, token: 0, sc, fk, desc: desc || (parent && parent.desc), reg: null, early: !!early };
      this.threads.add(th);
      if (!early) this.act.push(() => this.resume(th));
      return th;
    }
    resume(th, thrown) {
      if (!th.alive) return;
      th.token++;
      if (th.reg) { this.unregister(th.reg); th.reg = null; }
      const save = this.cur, saveCause = this.cause;
      this.cur = th; this.cause = th.desc;
      if (this.tr) { this.trace({ kind: 'run', region: this.region, who: th.desc, say: cap(th.desc || 'a process') + (thrown ? ' is disabled' : ' runs' + (th.why ? ', woken by ' + th.why : '')) }); th.why = null; }
      let r;
      try { r = thrown ? th.gen.throw(thrown) : th.gen.next(); }
      catch (e) {
        this.cur = save; this.cause = saveCause;
        if (e === FINISH) { this.end(th); if (this.halted) throw FINISH; return; }
        if (e && e.disable) { this.end(th); return; }
        if (e instanceof V.VError) { this.errors.push({ line: e.line, col: e.col, msg: e.message }); this.finished = true; this.halted = true; this.end(th); return; }
        throw e;
      }
      this.cur = save; this.cause = saveCause;
      if (r.done) { this.end(th); return; }
      this.waitFor(th, r.value);
    }
    end(th) {
      th.alive = false;
      this.threads.delete(th);
      const fk = th.fk;
      if (fk) { fk.n--; if (fk.n === 0 && fk.waiting && fk.parent.alive && fk.parent.token === fk.tok) { const p = fk.parent; this.act.push(() => this.resume(p)); } }
    }
    waitFor(th, w) {
      const tok = th.token;
      const go = () => { if (th.alive && th.token === tok) this.resume(th); };
      if (typeof w === 'number') {
        if (w === Infinity) return;
        if (this.tr) th.why = w === 0 ? 'its #0 (it waited in the inactive region)' : 'the end of its delay';
        if (w === 0) this.inact.push(go); else this.bucket(this.now + w).act.push(go);
        return;
      }
      if (w.join) { const fk = w.join; if (fk.n === 0) this.act.push(go); else { fk.waiting = true; fk.tok = tok; } return; }
      if (w.ev) {
        const items = w.ev;
        const reg = { th, tok, items: items.map((it) => ({ it, st: it.sym ? it.sym.st : null, last: it.event ? null : it.sym ? it.sym.st.val : it.fn(null) })), stores: [] };
        reg.check = (st) => {
          let hit = false;
          for (const e of reg.items) {
            if (e.it.event) { if (e.it.sym.st === st) { hit = true; reg.why = 'the event ' + st.path; } continue; }
            if (e.st ? e.st !== st : !e.it.syms.some((s) => s.st === st)) continue;
            if (e.st && e.st.arr) { hit = true; continue; }
            const nv = e.st ? e.st.val : e.it.fn(null);
            const ov = e.last;
            e.last = nv;
            if (typeof nv === 'number') { if (nv !== ov && !e.it.edge) hit = true; continue; }
            const edge = e.it.edge;
            if (!edge) { if (!same(ov, nv)) { hit = true; reg.why = 'a change of ' + st.path; } continue; }
            const o = lsb(ov), n = lsb(nv);
            if (o === n) continue;
            if (edge === 'posedge' ? (o === '0' || n === '1') : edge === 'negedge' ? (o === '1' || n === '0') : true) { hit = true; reg.why = edge + ' ' + st.path; }
          }
          return hit;
        };
        const stores = new Set();
        for (const it of items) for (const s of it.syms) stores.add(s.st);
        for (const st of stores) { (st.waits || (st.waits = new Set())).add(reg); reg.stores.push(st); }
        th.reg = reg;
        reg.go = go;
        return;
      }
      throw new Error('bad wait');
    }
    unregister(reg) { for (const st of reg.stores) st.waits.delete(reg); }
    fire(reg) {
      this.unregister(reg);
      if (this.tr) reg.th.why = reg.why;
      if (reg.th.reg === reg) reg.th.reg = null;
      this.act.push(reg.go);
    }
    disable(target) {
      for (const th of [...this.threads]) {
        if (th === this.cur || !th.alive) continue;
        if (th.blocks.includes(target)) {
          th.token++;
          if (th.reg) { this.unregister(th.reg); th.reg = null; }
          const tok = th.token;
          this.act.push(() => { if (th.alive && th.token === tok) this.resume(th, { disable: target }); });
        } else if (th.inh.has(target)) {
          th.token++;
          if (th.reg) { this.unregister(th.reg); th.reg = null; }
          th.alive = false; this.threads.delete(th);
        }
      }
      if (this.cur) {
        if (this.cur.blocks.includes(target)) throw { disable: target };
        if (this.cur.inh.has(target)) { this.cur.alive = false; throw { disable: target }; }
      }
    }
    // ---- output ---------------------------------------------------------------------------------------------------
    print(s) {
      if (this.tr) this.trace({ kind: 'print', region: this.region, text: s, say: (this.region === 'postponed' ? 'At the end of the time step (the postponed region) the output gets ' : 'The output gets ') + JSON.stringify(s.replace(/\n$/, '')) });
      this.buf += s;
      const parts = this.buf.split('\n');
      this.buf = parts.pop();
      for (const p of parts) this.out.push(p);
      if (this.out.length > 200000) { this.errors.push({ line: 0, col: 0, msg: 'the simulation printed too many lines; it was stopped' }); this.finished = true; }
    }
    strobe(fn) { this.strobes.push(fn); }
    finish(stop) { this.finished = true; this.stopped = !!stop; if (stop) this.halted = true; throw FINISH; }
    // ---- running -------------------------------------------------------------------------------------------------
    start() {
      this.started = true;
      for (const st of this.W.stores) {
        if (st.dead) continue;
        if (st.arr) { st.words = new Array(st.arr.size); continue; }
        {
          if (st.real) st.val = 0;
          else if (st.kind === 'event') st.val = V.ZERO1;
          else if (st.isNet) st.val = st.drivers && st.drivers.length || st.kind.startsWith('supply') || st.kind === 'tri0' || st.kind === 'tri1' ? this.netValue(st) : V.allZ(st.w);
          else st.val = st.init || V.allX(st.w, st.signed);
        }
        if (this.waves && !st.real && st.kind !== 'event') st.wave = [[0, st.val]];
        else if (this.waves && st.real) st.wave = [[0, st.val]];
      }
      for (const fn of this.starts) fn();
      // processes start child scopes first (as other simulators do); an always block that waits on a plain
      // event list or @* is already waiting before time 0 starts, so it sees the first changes
      const order = new Map();
      const walk = (sc) => { for (const c of sc.children.values()) walk(c); order.set(sc, order.size); };
      for (const r of this.W.roots) walk(r);
      const scopeOf = (sc) => { let s = sc; while (s && !order.has(s)) s = s.parent; return s; };
      const procs = this.W.procs.map((p, i) => ({ p, i, k: order.get(scopeOf(p.sc)) })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.p);
      const early = [];
      for (const p of procs) {
        const th = this.spawn(p.gen, null, p.sc, null, null, (p.node.k === 'initial' ? 'initial' : 'always') + ' block at line ' + p.node.line, p.node.k === 'always' && p.node.body && p.node.body.k === 'event' && (p.node.body.ev.k === 'star' || p.node.body.ev.list.every((it) => !it.edge)));
        if (th.early) early.push(th);
      }
      for (const th of early) this.resume(th);
    }
    /** run until no events are left, $finish, or the time limit (in ticks) */
    run(until) {
      if (!this.started) this.start();
      const lim = until == null ? Infinity : until;
      for (;;) {
        this.steps = 0;
        this.step();
        if (this.finished) break;
        this.postponed();
        if (this.finished) break;
        if (!this.heap.length) break;
        const t = this.heap[0];
        if (t > lim) { this.now = lim; this.limited = true; break; }
        if (this.total > this.maxTotal) { this.limited = true; this.errors.push({ line: 0, col: 0, msg: 'the simulation was stopped after ' + this.maxTotal + ' events at time ' + (this.now * this.tickNs) + ' ns; end it with $finish, or run it for less time' }); break; }
        heapPop(this.heap);
        const b = this.future.get(t);
        this.future.delete(t);
        this.now = t;
        this.region = 'active';
        if (this.tr) this.trace({ kind: 'time', say: 'Nothing is left to do at this time, so time moves on to ' + (t * this.tickNs) + ' ns' });
        this.act = b.act; this.ai = 0;
        this.nbaQ = b.nba;
      }
      if (this.buf) { this.out.push(this.buf); this.buf = ''; }
    }
    step() {
      for (;;) {
        while (this.ai < this.act.length) {
          const fn = this.act[this.ai++];
          try { fn(); } catch (e) {
            if (e === FINISH) { this.finished = true; }
            else if (e instanceof V.VError) { this.errors.push({ line: e.line, col: e.col, msg: e.message }); this.finished = true; this.halted = true; }
            else throw e;
          }
          if (this.halted) return;
          if (this.ai > 4096 && this.ai * 2 > this.act.length) { this.act = this.act.slice(this.ai); this.ai = 0; }
          this.total++;
          if (++this.steps > this.stepLimit * 2) { this.errors.push({ line: 0, col: 0, msg: 'time cannot advance: something keeps changing at time ' + this.now + ' (a combinational loop, or a zero-delay feedback?)' }); this.finished = true; return; }
        }
        this.act = []; this.ai = 0;
        if (this.finished) {
          // after $finish the rest of the active region runs; pending non-blocking updates land but wake nothing
          this.quiet = true;
          const q = this.nbaQ; this.nbaQ = [];
          for (let i = 0; i < q.length; i += 2) { try { q[i](q[i + 1]); } catch (e) { if (!(e instanceof V.VError) && e !== FINISH) throw e; } }
          this.quiet = false;
          return;
        }
        if (this.inact.length) {
          if (this.tr) { this.region = 'inactive'; this.trace({ kind: 'region', region: 'inactive', say: 'The active region is empty, so the #0 event' + (this.inact.length > 1 ? 's' : '') + ' of the inactive region ' + (this.inact.length > 1 ? 'become' : 'becomes') + ' active' }); }
          this.act = this.inact; this.inact = []; continue;
        }
        if (this.nbaQ.length) {
          const q = this.nbaQ; this.nbaQ = [];
          if (this.tr) { const ls = this.nbaL.splice(0); this.region = 'nba'; this.trace({ kind: 'region', region: 'nba', updates: ls, say: 'The active and inactive regions are empty, so the non-blocking update' + (q.length > 2 ? 's ' : ' ') + (ls.length ? ls.join(', ') : '') + ' take' + (q.length > 2 ? '' : 's') + ' effect now' }); }
          const save = this.cause;
          for (let i = 0; i < q.length; i += 2) { this.cause = 'non-blocking assignment'; try { q[i](q[i + 1]); } catch (e) { if (e instanceof V.VError) { this.errors.push({ line: e.line, col: e.col, msg: e.message }); this.finished = true; return; } throw e; } }
          this.cause = save;
          continue;
        }
        return;
      }
    }
    postponed() {
      this.region = 'postponed';
      const ss = this.strobes; this.strobes = [];
      for (const fn of ss) this.print(fn());
      const m = this.monitor;
      if (m && this.monitorOn && m.dirty) { m.dirty = false; this.print(m.fn()); }
    }
  }
  V.Kernel = Kernel;

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  /** a value for the trace: 0, 1, x, z for one bit, 4'd5 or 4'b01x1 for a bus */
  Sim.show = (v) => {
    if (v == null) return 'x';
    if (typeof v === 'number') return String(v);
    if (v.w === 1) return '01zx'[v.bit(0)];
    return v.b ? v.w + "'b" + v.toBits() : v.w + "'d" + v.a;
  };
  function heapPush(h, t) { h.push(t); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p] <= h[i]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
  function heapPop(h) {
    const top = h[0], last = h.pop();
    if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l] < h[m]) m = l; if (r < h.length && h[r] < h[m]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } }
    return top;
  }

  // ---- random numbers (the standard's algorithm, so seeded runs match other simulators) ------------------------
  const f32 = new DataView(new ArrayBuffer(4));
  function uniform(seed, start, end) {
    const d = 0.00000011920928955078125;
    let a, b;
    if (start >= end) { a = 0; b = 2147483647; } else { a = start; b = end; }
    if (seed === 0) seed = 259341593;
    seed = (Math.imul(69069, seed) + 1) | 0;
    f32.setUint32(0, ((seed >>> 0) >>> 9) | 0x3f800000);
    let c = f32.getFloat32(0);
    c = c + c * d;
    c = (b - a) * (c - 1.0) + a;
    return { seed, c };
  }
  Kernel.prototype.random = function (seed) {
    const u = uniform(seed, -2147483648, 2147483647);
    let r = (u.c + 2147483648.0) / 4294967295.0;
    r = r * 4294967296.0 - 2147483648.0;
    return { seed: u.seed, value: (r >= 0 ? Math.trunc(r) : Math.trunc(r - 1)) | 0 };
  };
  Kernel.prototype.distUniform = function (seed, start, end) {
    if (start >= end) return { seed, value: start };
    let r, i;
    if (end !== 2147483647) {
      end++;
      const u = uniform(seed, start, end); seed = u.seed; r = u.c;
      i = r >= 0 ? Math.trunc(r) : Math.trunc(r - 1);
      if (i < start) i = start; if (i >= end) i = end - 1;
    } else if (start !== -2147483648) {
      start--;
      const u = uniform(seed, start, end); seed = u.seed; r = u.c + 1.0;
      i = r >= 0 ? Math.trunc(r) : Math.trunc(r - 1);
      if (i <= start) i = start + 1; if (i > end) i = end;
    } else return this.random(seed);
    return { seed, value: i | 0 };
  };

  // ---- formatting $display arguments -------------------------------------------------------------------------------
  const TASKS = new Set(['$display', '$displayb', '$displayh', '$displayo', '$write', '$writeb', '$writeh', '$writeo', '$strobe', '$strobeb', '$strobeh', '$strobeo',
    '$monitor', '$monitorb', '$monitorh', '$monitoro', '$monitoron', '$monitoroff', '$finish', '$stop', '$readmemh', '$readmemb', '$dumpfile', '$dumpvars', '$dumpoff',
    '$dumpon', '$dumpall', '$dumpflush', '$dumplimit', '$timeformat', '$printtimescale', '$fflush', '$fclose', '$sformat', '$swrite', '$error', '$warning', '$info', '$fatal']);
  Sim.TASKS = TASKS;
  const isTimeCall = (n) => n && n.k === 'call' && n.sys && /^\$(time|stime|realtime)$/.test(n.name);

  /** f => string for the arguments of $display and friends */
  function formatter(W, sc, args, radix, node) {
    const K = W.K;
    const segs = [];
    const val = (n) => {
      const t = V.Elab.typeOf(W, sc, n);
      if (t.r) { const r = V.Expr.compileReal(W, sc, n); return { real: true, fn: r, t, node: n }; }
      return { real: false, fn: V.Expr.compile(W, sc, n, t.w, t.s), t, node: n };
    };
    const asVec = (a) => (a.real ? (f) => V.fromReal(a.fn(f), 64, true) : a.fn);
    const asReal = (a) => (a.real ? a.fn : (f) => V.toReal(a.fn(f)));
    const deflt = (a) => {
      if (a.real) return (f) => V.fmtReal(a.fn(f), 'g', 6, null, false, true);
      const fn = a.fn;
      if (radix === 'd') return (f) => V.fmtDec(fn(f), null, false);
      const bits = radix === 'b' ? 1 : radix === 'o' ? 3 : 4;
      return (f) => V.fmtRadix(fn(f), bits, null, false);
    };
    let i = 0;
    while (i < args.length) {
      const a = args[i++];
      if (a === null) { segs.push(() => ' '); continue; }
      if (a.k !== 'str') { if (isTimeCall(a) && !V.Elab.typeOf(W, sc, a).r) { const v = val(a); segs.push((f) => V.fmtDec(v.fn(f), 20, false)); } else segs.push(deflt(val(a))); continue; }
      const s = a.s;
      let lit = '';
      for (let j = 0; j < s.length; j++) {
        const ch = s[j];
        if (ch !== '%') { lit += ch; continue; }
        const m = /^%(-?)(0?)(\d*)(?:\.(\d+))?([a-zA-Z%])/.exec(s.slice(j));
        if (!m) { lit += ch; continue; }
        j += m[0].length - 1;
        const left = !!m[1], zero = !!m[2], width = m[3] !== '' ? +m[3] : null, prec = m[4] != null ? +m[4] : null;
        const conv = m[5].toLowerCase();
        if (conv === '%') { lit += '%'; continue; }
        if (conv === 'm') { const p = sc.path; lit += p; continue; }
        if (lit) { const l = lit; segs.push(() => l); lit = ''; }
        if (i >= args.length || args[i] === null) {
          if (i < args.length) i++;
          throw new V.VError('the format "' + m[0] + '" has no argument to print', a);
        }
        const arg = val(args[i++]);
        const minimal = width === 0 || (zero && width === null);
        const pad = (str) => (width && str.length < width ? (left ? str.padEnd(width) : str.padStart(width, zero && conv !== 's' && conv !== 'c' ? '0' : ' ')) : str);
        switch (conv) {
          case 'd': { const fn = asVec(arg), min = minimal || width != null || arg.real; segs.push((f) => { const v = fn(f); return pad(V.fmtDec(v, null, min)); }); break; }
          case 'b': case 'o': case 'h': case 'x': {
            const fn = asVec(arg), bits = conv === 'b' ? 1 : conv === 'o' ? 3 : 4, min = minimal || isTimeCall(arg.node);
            segs.push((f) => pad(V.fmtRadix(fn(f), bits, null, min)));
            break;
          }
          case 'c': { const fn = asVec(arg); segs.push((f) => pad(String.fromCharCode(Number(V.slice(fn(f), 0, 8).a)))); break; }
          case 's': {
            const fn = asVec(arg);
            segs.push((f) => { const v = fn(f); let str = ''; for (let k = Math.ceil(v.w / 8) - 1; k >= 0; k--) { const c = Number(V.slice(v, k * 8, 8).a & ~V.slice(v, k * 8, 8).b); str += c ? String.fromCharCode(c) : (minimal ? '' : ' '); } if (minimal) str = str.replace(/^ +/, ''); return pad(str); });
            break;
          }
          case 't': {
            const fn = asReal(arg);
            segs.push((f) => {
              const tf = K.tf || { units: W.P, prec: 0, suffix: '', width: 20 };
              const x = fn(f) * Math.pow(10, (sc.inst.unit != null ? sc.inst.unit : 0) - tf.units);
              let str = V.fmtReal(x, 'f', tf.prec) + tf.suffix;
              if (minimal) return str;
              if (width != null) return str.padStart(width);
              return str.padStart(tf.width);
            });
            break;
          }
          case 'e': case 'f': case 'g': { const fn = asReal(arg); segs.push((f) => V.fmtReal(fn(f), conv, prec, width, left, false, zero)); break; }
          case 'v': {
            const fn = asVec(arg);
            segs.push((f) => { const v = fn(f); const b = v.bit(0); return pad(b === 0 ? 'St0' : b === 1 ? 'St1' : b === 2 ? 'HiZ' : 'StX'); });
            break;
          }
          case 'u': case 'z': case 'l': { const fn = asVec(arg); segs.push((f) => V.fmtRadix(fn(f), 1, null, false)); break; }
          default: throw new V.VError('%' + m[5] + ' is not a format this simulator knows (use %b %o %d %h %c %s %t %m %e %f %g)', a);
        }
      }
      if (lit) { const l = lit; segs.push(() => l); }
    }
    return (f) => { let s = ''; for (let k = 0; k < segs.length; k++) s += segs[k](f); return s; };
  }
  Sim.formatter = formatter;

  // ---- $readmemh / $readmemb ---------------------------------------------------------------------------------------
  function readmem(K, text, st, sym, hex, start, end, node) {
    const words = [];
    const src = text.replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
    const lo = sym.arr.dims[0].lo, hi = lo + sym.arr.dims[0].n - 1;
    let a = start != null ? start : lo, stop = end != null ? end : (start != null && start > hi ? lo : hi);
    const dir = a <= stop ? 1 : -1;
    const W0 = sym.w;
    for (const tok of src.split(/\s+/).filter(Boolean)) {
      if (tok[0] === '@') { a = parseInt(tok.slice(1), 16); if (isNaN(a)) throw new V.VError('bad address ' + tok + ' in the memory file', node); continue; }
      const digits = tok.replace(/_/g, '').toLowerCase();
      if (!(hex ? /^[0-9a-fxz?]+$/ : /^[01xz?]+$/).test(digits)) throw new V.VError('"' + tok + '" is not a ' + (hex ? 'hex' : 'binary') + ' number in the memory file', node);
      let v = V.makeNumber(null, false, hex ? 'h' : 'b', digits, node).v;
      v = V.resize(V.fromBits(v.toBits().slice(-Math.max(W0, 1)).padStart(W0, '0')), W0, false);
      if (a < Math.min(lo, hi) || a > Math.max(lo, hi)) break;
      const dims = sym.arr.dims[0], off = dims.a <= dims.b ? a - dims.a : dims.a - a;
      words.push([off, v]);
      if (a === stop) { a += dir; break; }
      a += dir;
    }
    for (const [off, v] of words) K.setWord(st, off, v);
  }

  /** a system task call as f => void (or { gen } when it waits) */
  Sim.sysTask = function (W, sc, s, ctx) {
    const K = W.K, a = s.args, name = s.name;
    const m = /^\$(display|write|strobe|monitor)([bho]?)$/.exec(name);
    if (m) {
      if (ctx.func && m[1] !== 'display' && m[1] !== 'write') throw new V.VError('a function cannot use ' + name, s);
      const fmt = formatter(W, sc, a, m[2] || 'd', s);
      if (m[1] === 'display') return (f) => K.print(fmt(f) + '\n');
      if (m[1] === 'write') return (f) => K.print(fmt(f));
      if (m[1] === 'strobe') return (f) => K.strobe(() => fmt(f) + '\n');
      // $monitor: prints at the end of any step in which one of its arguments changed
      const syms = new Set();
      for (const x of a) if (x && x.k !== 'str' && !isTimeCall(x)) V.Expr.reads(W, sc, x, syms);
      const stores = [...syms].filter((y) => y.st).map((y) => y.st);
      return (f) => {
        if (K.monitor) for (const st of K.monitor.stores) K.unwatch(st, K.monitor.w);
        const mon = { fn: () => fmt(f) + '\n', dirty: true, stores };
        mon.w = { trig: () => { mon.dirty = true; } };
        for (const st of stores) K.watch(st, mon.w);
        K.monitor = mon;
      };
    }
    switch (name) {
      case '$monitoron': return () => { K.monitorOn = true; if (K.monitor) K.monitor.dirty = true; };
      case '$monitoroff': return () => { K.monitorOn = false; };
      case '$finish': return () => K.finish(false);
      case '$stop': return () => K.finish(true);
      case '$fatal': return () => K.finish(false);
      case '$error': case '$warning': case '$info': {
        const fmt = a.length ? formatter(W, sc, a, 'd', s) : () => '';
        const tag = name === '$error' ? 'ERROR' : name === '$warning' ? 'WARNING' : 'INFO';
        return (f) => K.print(tag + ': ' + fmt(f) + '\n');
      }
      case '$readmemh': case '$readmemb': {
        if (a.length < 2 || !a[0] || a[0].k !== 'str') throw new V.VError(name + ' needs a file name in quotes and a memory, like ' + name + '("data.hex", mem)', s);
        const { root } = V.Elab.selChain(a[1]);
        const sym = V.Elab.resolve(W, sc, root);
        if (!sym.arr) throw new V.VError(root.name + ' is not a memory (declare it like reg [7:0] ' + root.name + ' [0:15])', a[1]);
        if (sym.arr.dims.length > 1) throw new V.VError(name + ' loads one-dimensional memories only', a[1]);
        const st = (fr) => (sym.auto ? null : sym.st);
        const lo = a[2] ? V.Expr.self(W, sc, a[2]) : null, hi = a[3] ? V.Expr.self(W, sc, a[3]) : null;
        const fname = a[0].s;
        return (f) => {
          const files = W.files || {};
          const text = files[fname] != null ? files[fname] : files[fname.split('/').pop()];
          if (text == null) throw K.runtimeError('cannot find the memory file "' + fname + '"; add a buffer with that name', s);
          const n = (x) => { if (!x) return null; const v = x(f); return typeof v === 'number' ? v : Number(V.signedVal(v)); };
          readmem(K, String(text), st(f), sym, name === '$readmemh', n(lo), n(hi), s);
        };
      }
      case '$dumpfile': {
        const fn = a[0] && a[0].k === 'str' ? a[0].s : 'dump.vcd';
        return () => { K.dumpName = fn; };
      }
      case '$dumpvars': {
        const level = a[0] ? V.Elab.constInt(W, sc, a[0], 'the $dumpvars level') : 0;
        const targets = a.slice(1).map((x) => {
          const parts = x.path || [{ name: x.name }];
          try { return { scope: V.Elab.findScope(W, sc, parts, x) }; } catch (e) { const sym = V.Elab.resolve(W, sc, x); return { sym }; }
        });
        return () => {
          if (!K.dump) K.dump = { t: K.now, sel: [], toggles: [] };
          K.dump.sel.push({ level, targets: targets.length ? targets : null, scope: sc.inst });
        };
      }
      case '$dumpoff': return () => { if (K.dump) K.dump.toggles.push([K.now, false]); };
      case '$dumpon': return () => { if (K.dump) K.dump.toggles.push([K.now, true]); };
      case '$dumpall': case '$dumpflush': case '$dumplimit': case '$fflush': case '$fclose': return () => {};
      case '$timeformat': {
        const v = a.map((x) => (x ? V.Expr.self(W, sc, x) : null));
        return (f) => {
          const num = (x) => { const y = x(f); return typeof y === 'number' ? y : Number(V.signedVal(y)); };
          K.tf = { units: v[0] ? num(v[0]) : W.P, prec: v[1] ? num(v[1]) : 0, suffix: a[2] && a[2].k === 'str' ? a[2].s : '', width: v[3] ? num(v[3]) : 20 };
        };
      }
      case '$printtimescale': {
        const target = a[0] ? V.Elab.findScope(W, sc, a[0].path || [{ name: a[0].name }], a[0]) : sc.inst;
        const unit = (e) => { const u = ['s', 'ms', 'us', 'ns', 'ps', 'fs'], k = Math.ceil(-e / 3), base = -3 * k; return Math.pow(10, e - base) + u[k]; };
        return () => K.print('Time scale of (' + target.inst.path + ') is ' + unit(target.inst.unit || 0) + ' / ' + unit(target.inst.prec || 0) + '\n');
      }
      case '$random': case '$urandom': { const fn = V.Expr.compile(W, sc, s, 32, true); return (f) => { fn(f); }; }
      case '$sformat': case '$swrite': throw new V.VError(name + ' is not supported; use $display', s);
    }
    if (/^\$f/.test(name)) throw new V.VError('file tasks such as ' + name + ' are not supported here; use $display, $readmemh and $dumpvars', s);
    const near = [...TASKS].concat(['$time', '$random', '$realtime', '$signed', '$unsigned', '$clog2']).find((x) => V.editDistance(x, name) <= 2);
    throw new V.VError('the system task ' + name + ' is not supported' + (near ? ' (did you mean ' + near + '?)' : ''), s);
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
