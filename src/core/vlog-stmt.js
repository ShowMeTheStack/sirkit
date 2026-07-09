// Verilog statements compiled to closures. A statement without timing control becomes a plain function
// f => void; one that can wait becomes a generator function that yields its waits to the scheduler:
// a number (a delay in ticks), { ev: items } (an event control), or { join: fork } (the end of fork/join).
(function (S) {
  'use strict';
  const V = S.Verilog = S.Verilog || {};
  const T = V.Stmt = {};
  const err = (msg, node) => new V.VError(msg, node);
  const X = () => V.Expr;

  /** create the scopes of named blocks (with their variables) before anything is compiled */
  function prepBlocks(W, sc, s) {
    if (!s || typeof s !== 'object') return;
    switch (s.k) {
      case 'block': {
        const bs = blockScope(W, sc, s);
        for (const x of s.stmts) prepBlocks(W, bs, x);
        return;
      }
      case 'if': prepBlocks(W, sc, s.then); prepBlocks(W, sc, s.else); return;
      case 'case': for (const a of s.arms) prepBlocks(W, sc, a.stmt); return;
      case 'for': case 'while': case 'repeat': case 'forever': prepBlocks(W, sc, s.body); return;
      case 'delay': case 'event': case 'wait': prepBlocks(W, sc, s.stmt); return;
    }
  }
  T.prepBlocks = prepBlocks;
  T.blockScope = (W, sc, s) => blockScope(W, sc, s);
  function blockScope(W, sc, s) {
    if (!s.name && !s.decls.length) return sc;
    W.blockScopes = W.blockScopes || new Map();
    let m = W.blockScopes.get(s);
    if (!m) { m = new Map(); W.blockScopes.set(s, m); }
    let bs = m.get(sc);
    if (bs) return bs;
    const name = s.name || ('$unnamed' + s.line + '_' + s.col);
    if (sc.children.has(name)) throw err('the block name ' + name + ' is used twice in ' + sc.path, s);
    bs = new V.Elab.Scope('block', name, sc, { blockNode: s });
    for (const p of s.decls.filter((d) => d.k === 'param')) V.Elab.declareParam(W, bs, p, null);
    V.Elab.declareAll(W, bs, s.decls.filter((d) => d.k === 'decl'));
    m.set(sc, bs);
    return bs;
  }

  const sync = (fn) => ({ sync: fn });
  const gen = (fn) => ({ gen: fn });
  const asGen = (c) => c.gen || function* (f) { c.sync(f); };

  /** delay in ticks, from a delay expression of this scope */
  function delayTicks(W, sc, d) {
    const K = W.K;
    if (d.k === 'delays') d = d.list[0];
    const t = V.Elab.typeOf(W, sc, d);
    if (X().isConst(W, sc, d)) {
      const v = t.r ? X().compileReal(W, sc, d)(null) : X().compile(W, sc, d, t.w, t.s)(null);
      const ticks = K.ticks(sc, v);
      return () => ticks;
    }
    const fn = t.r ? X().compileReal(W, sc, d) : X().compile(W, sc, d, t.w, t.s);
    return (f) => K.ticks(sc, fn(f));
  }
  T.delayTicks = delayTicks;

  /** event control items: [{ edge, fn, syms, event }] */
  function eventItems(W, sc, ev, body) {
    if (ev.k === 'star') {
      const syms = new Set();
      readsOfStmt(W, sc, body, syms);
      const list = [...syms].filter((s) => s.k === 'var' && !s.auto);
      return list.map((s) => ({ edge: null, sym: s, syms: [s] }));
    }
    return ev.list.map((it) => {
      if (it.expr.k === 'id') {
        const sym = V.Elab.resolve(W, sc, it.expr);
        if (sym.k === 'event') { if (it.edge) throw err('a named event has no edges; wait for it with @(' + it.expr.name + ')', it.expr); return { event: true, sym, syms: [sym] }; }
        if (sym.k === 'var' && !sym.arr && !sym.real && !sym.auto) return { edge: it.edge, sym, syms: [sym] };
      }
      const t = V.Elab.typeOf(W, sc, it.expr);
      const fn = t.r ? X().compileReal(W, sc, it.expr) : X().compile(W, sc, it.expr, t.w, t.s);
      const syms = [...X().reads(W, sc, it.expr)].filter((s) => !s.auto);
      if (!syms.length) W.warnings.push({ line: it.expr.line, col: it.expr.col, msg: 'this event control waits on a value that never changes' });
      return { edge: it.edge, fn, syms };
    });
  }
  T.eventItems = eventItems;

  /** everything a statement reads (for @* and lint): right-hand sides, conditions, indices, task inputs */
  function readsOfStmt(W, sc, s, out, noTasks) {
    const R = (e) => X().reads(W, sc, e, out);
    const lhsIdx = (l) => {
      if (!l) return;
      if (l.k === 'concat') return l.parts.forEach(lhsIdx);
      const { chain } = V.Elab.selChain(l);
      for (const c of chain) { R(c.index); R(c.start); }
    };
    if (!s) return out;
    switch (s.k) {
      case 'ba': case 'nba': R(s.rhs); lhsIdx(s.lhs); break;
      case 'block': { const bs = blockScope(W, sc, s); for (const x of s.stmts) readsOfStmt(W, bs, x, out, noTasks); break; }
      case 'if': R(s.cond); readsOfStmt(W, sc, s.then, out, noTasks); readsOfStmt(W, sc, s.else, out, noTasks); break;
      case 'case': R(s.expr); for (const a of s.arms) { (a.exprs || []).forEach(R); readsOfStmt(W, sc, a.stmt, out, noTasks); } break;
      case 'for': readsOfStmt(W, sc, s.init, out, noTasks); R(s.cond); readsOfStmt(W, sc, s.step, out, noTasks); readsOfStmt(W, sc, s.body, out, noTasks); break;
      case 'while': R(s.cond); readsOfStmt(W, sc, s.body, out, noTasks); break;
      case 'repeat': R(s.count); readsOfStmt(W, sc, s.body, out, noTasks); break;
      case 'forever': readsOfStmt(W, sc, s.body, out, noTasks); break;
      case 'delay': case 'event': readsOfStmt(W, sc, s.stmt, out, noTasks); break;
      case 'wait': R(s.cond); readsOfStmt(W, sc, s.stmt, out, noTasks); break;
      case 'call': if (s.sys) { if (!noTasks && /^\$(display|write|strobe|monitor)/.test(s.name)) s.args.forEach(R); } else s.args.forEach(R); break;
    }
    return out;
  }
  T.readsOfStmt = readsOfStmt;
  /** every variable a statement assigns: [{ sym, node, nb }] */
  function writesOfStmt(W, sc, s, out) {
    out = out || [];
    if (!s) return out;
    const L = (l, node, nb) => {
      if (!l) return;
      if (l.k === 'concat') return l.parts.forEach((p) => L(p, node, nb));
      const { root } = V.Elab.selChain(l);
      if (root.k !== 'id') return;
      const sym = V.Elab.resolve(W, sc, root, true);
      if (sym && sym.k === 'var') out.push({ sym, node, nb, whole: l === root });
    };
    switch (s.k) {
      case 'ba': case 'nba': L(s.lhs, s, s.k === 'nba'); break;
      case 'block': { const bs = blockScope(W, sc, s); for (const x of s.stmts) writesOfStmt(W, bs, x, out); break; }
      case 'if': writesOfStmt(W, sc, s.then, out); writesOfStmt(W, sc, s.else, out); break;
      case 'case': for (const a of s.arms) writesOfStmt(W, sc, a.stmt, out); break;
      case 'for': writesOfStmt(W, sc, s.init, out); writesOfStmt(W, sc, s.step, out); writesOfStmt(W, sc, s.body, out); break;
      case 'while': case 'repeat': case 'forever': writesOfStmt(W, sc, s.body, out); break;
      case 'delay': case 'event': case 'wait': writesOfStmt(W, sc, s.stmt, out); break;
      case 'call': if (!s.sys) { try { const sym = X().findTF(W, sc, s.name, s, 'task'); const info = X().tfInfo(W, sym); info.ports.forEach((p, i) => { if (p.dir !== 'input' && s.args[i]) L(s.args[i], s, false); }); } catch (e) { /* reported when compiled */ } } break;
    }
    return out;
  }
  T.writesOfStmt = writesOfStmt;

  // ---- the compiler ------------------------------------------------------------------------------------------------
  // With a trace on, each statement says when it starts: { kind: 'stmt', line, region, who, scope } before what
  // it does (not a begin/end block, a delay or event control, which wait rather than run, nor the inside of a
  // function, nor the start and step of a for loop). A picture of code follows its cursor from these.
  const NOSTEP = new Set(['block', 'delay', 'event', 'null']);
  function cs(W, sc, s, ctx) {
    const c = cs0(W, sc, s, ctx);
    if (ctx.func || ctx.noStep || NOSTEP.has(s.k) || !s.line) return c;
    const K = W.K, line = s.line, scope = sc.inst ? sc.inst.path : sc.path;
    const mark = () => { if (K.tr && K.started) K.trace({ kind: 'stmt', line, region: K.region, who: K.cur ? K.cur.desc : null, scope, say: 'Line ' + line + ' runs' }); };
    if (c.sync) { const f0 = c.sync; return sync((f) => { mark(); f0(f); }); }
    const g0 = c.gen;
    return gen(function* (f) { mark(); yield* g0(f); });
  }
  function cs0(W, sc, s, ctx) {
    const K = W.K;
    switch (s.k) {
      case 'null': return sync(() => {});
      case 'block': return block(W, sc, s, ctx);
      case 'ba': case 'nba': return assign(W, sc, s, ctx);
      case 'if': {
        const c = X().truthOf(W, sc, s.cond);
        const a = s.then ? cs(W, sc, s.then, ctx) : sync(() => {}), b = s.else ? cs(W, sc, s.else, ctx) : null;
        if (a.sync && (!b || b.sync)) {
          const as = a.sync, bs = b && b.sync;
          return sync(bs ? (f) => { if (c(f) === 1) as(f); else bs(f); } : (f) => { if (c(f) === 1) as(f); });
        }
        const ag = asGen(a), bg = b && asGen(b);
        return gen(function* (f) { if (c(f) === 1) yield* ag(f); else if (bg) yield* bg(f); });
      }
      case 'case': return caseStmt(W, sc, s, ctx);
      case 'for': {
        const quiet = Object.assign({}, ctx, { noStep: true });
        const init = cs(W, sc, s.init, quiet), step = cs(W, sc, s.step, quiet), c = X().truthOf(W, sc, s.cond), body = cs(W, sc, s.body, ctx);
        if (!init.sync || !step.sync) throw err('the start and step of a for loop cannot contain delays or event controls', s);
        if (body.sync) {
          const b = body.sync, i = init.sync, st = step.sync;
          return sync((f) => { for (i(f); c(f) === 1; st(f)) { K.guard(s); b(f); } });
        }
        const bg = body.gen, i = init.sync, st = step.sync;
        return gen(function* (f) { for (i(f); c(f) === 1; st(f)) { K.guard(s); yield* bg(f); } });
      }
      case 'while': {
        const c = X().truthOf(W, sc, s.cond), body = cs(W, sc, s.body, ctx);
        if (body.sync) { const b = body.sync; return sync((f) => { while (c(f) === 1) { K.guard(s); b(f); } }); }
        const bg = body.gen;
        return gen(function* (f) { while (c(f) === 1) { K.guard(s); yield* bg(f); } });
      }
      case 'repeat': {
        const t = V.Elab.typeOf(W, sc, s.count), cnt = X().compile(W, sc, s.count, t.w, t.s), body = cs(W, sc, s.body, ctx);
        const count = (f) => { const v = cnt(f); if (v.b) return 0; const n = Number(V.signedVal(v)); return n > 0 ? n : 0; };
        if (body.sync) { const b = body.sync; return sync((f) => { for (let n = count(f); n > 0; n--) { K.guard(s); b(f); } }); }
        const bg = body.gen;
        return gen(function* (f) { for (let n = count(f); n > 0; n--) { K.guard(s); yield* bg(f); } });
      }
      case 'forever': {
        const body = cs(W, sc, s.body, ctx);
        if (body.sync) {
          if (ctx.func) throw err('a function cannot contain forever', s);
          if (hasDisable(s.body)) { const b = body.sync; return sync((f) => { for (;;) { K.guard(s); b(f); } }); }
          throw err('this forever loop has no delay or event control inside, so it would run forever without letting time pass', s);
        }
        const bg = body.gen;
        return gen(function* (f) { for (;;) { K.guard(s); yield* bg(f); } });
      }
      case 'delay': {
        if (ctx.func) throw err('a function cannot contain delays (#); use a task', s);
        const d = delayTicks(W, sc, s.d), body = s.stmt ? cs(W, sc, s.stmt, ctx) : null;
        if (!body) return gen(function* (f) { yield d(f); });
        if (body.sync) { const b = body.sync; return gen(function* (f) { yield d(f); b(f); }); }
        const bg = body.gen;
        return gen(function* (f) { yield d(f); yield* bg(f); });
      }
      case 'event': {
        if (ctx.func) throw err('a function cannot wait for events (@); use a task', s);
        const items = eventItems(W, sc, s.ev, s.stmt);
        const body = s.stmt ? cs(W, sc, s.stmt, ctx) : null;
        const req = { ev: items };
        if (!body) return gen(function* () { yield req; });
        if (body.sync) { const b = body.sync; return gen(function* (f) { yield req; b(f); }); }
        const bg = body.gen;
        return gen(function* (f) { yield req; yield* bg(f); });
      }
      case 'wait': {
        if (ctx.func) throw err('a function cannot contain wait', s);
        const c = X().truthOf(W, sc, s.cond);
        const syms = [...X().reads(W, sc, s.cond)].filter((x) => !x.auto);
        const req = { ev: syms.map((sym) => ({ edge: null, sym, syms: [sym] })) };
        const body = s.stmt ? asGen(cs(W, sc, s.stmt, ctx)) : null;
        return gen(function* (f) {
          while (c(f) !== 1) { if (!req.ev.length) { yield Infinity; } yield req; }
          if (body) yield* body(f);
        });
      }
      case 'disable': {
        const target = disableTarget(W, sc, s.target);
        return sync(() => K.disable(target));
      }
      case 'trigger': {
        const sym = V.Elab.resolve(W, sc, s.target);
        if (sym.k !== 'event') throw err(s.target.name + ' is not an event; declare it with "event ' + s.target.name + ';"', s);
        if (ctx.func) throw err('a function cannot trigger events', s);
        return sync(() => K.trigger(sym.st));
      }
      case 'call': return s.sys ? sysTask(W, sc, s, ctx) : taskCall(W, sc, s, ctx);
      case 'passign': case 'force': {
        const target = forceTarget(W, sc, s.lhs, s.k);
        const t = V.Elab.typeOf(W, sc, s.rhs);
        const fn = X().compile(W, sc, s.rhs, Math.max(t.w, target.w), t.s);
        const syms = [...X().reads(W, sc, s.rhs)].filter((x) => !x.auto);
        return sync((f) => K.force(target, (ff) => V.resize(fn(ff || f), target.w, false), syms, s.k));
      }
      case 'deassign': case 'release': {
        const target = forceTarget(W, sc, s.lhs, s.k);
        return sync(() => K.release(target, s.k));
      }
    }
    throw err('this statement is not supported', s);
  }
  T.compile = cs;
  const hasDisable = (s) => !!s && typeof s === 'object' && (s.k === 'disable' || (s.k === 'call' && !s.sys) || ['then', 'else', 'body', 'stmt'].some((k) => hasDisable(s[k])) || (s.stmts || []).some(hasDisable) || (s.arms || []).some((a) => hasDisable(a.stmt)));

  function forceTarget(W, sc, l, kind) {
    const { root, chain } = V.Elab.selChain(l);
    if (chain.length || root.k !== 'id') throw err(kind + ' works on a whole variable or net', l);
    const sym = V.Elab.resolve(W, sc, root);
    if (sym.k !== 'var' || sym.arr) throw err(kind + ' works on a variable or net', l);
    if ((kind === 'passign' || kind === 'deassign') && sym.isNet) throw err('assign cannot be used inside an always or initial block for the wire ' + sym.name + '; write ' + sym.name + ' = ... there (and declare ' + sym.name + ' as reg), or put the assign outside the block', l);
    return sym;
  }

  function disableTarget(W, sc, n) {
    if (n.path) return V.Elab.findScope(W, sc, n.path, n);
    for (let s = sc; s; s = s.parent) {
      if (s.name === n.name && (s.kind === 'block' || s.kind === 'task' || s.kind === 'func')) return s;
      if (s.children.has(n.name)) { const c = s.children.get(n.name); if (c.kind !== 'module') return c; }
      const sym = s.syms.get(n.name);
      if (sym && sym.k === 'task') return X().tfInfo(W, sym).scope;
      if (s.kind === 'module') break;
    }
    throw err('there is no named block or task called ' + n.name + ' to disable', n);
  }

  function block(W, sc, s, ctx) {
    const K = W.K;
    const bs = blockScope(W, sc, s);
    const parts = s.stmts.map((x) => cs(W, bs, x, ctx));
    if (s.fork) {
      if (ctx.func) throw err('a function cannot contain fork', s);
      const branches = parts.map(asGen);
      const run = function* (f) {
        const th = K.cur, fk = { n: branches.length, parent: th, waiting: false };
        for (const b of branches) K.spawn(b, f, bs, th, fk);
        if (fk.n > 0) yield { join: fk };
      };
      return gen(s.name ? named(K, bs, run, true) : run);
    }
    let out;
    if (parts.every((p) => p.sync)) {
      const fs = parts.map((p) => p.sync);
      out = sync(fs.length === 1 ? fs[0] : (f) => { for (let i = 0; i < fs.length; i++) fs[i](f); });
    } else {
      // runs of plain statements are joined; the rest are delegated to
      const steps = [];
      for (const p of parts) {
        if (p.sync && steps.length && steps[steps.length - 1].sync) { const a = steps[steps.length - 1].sync, b = p.sync; steps[steps.length - 1] = { sync: (f) => { a(f); b(f); } }; } else steps.push(p);
      }
      out = gen(function* (f) { for (let i = 0; i < steps.length; i++) { const p = steps[i]; if (p.sync) p.sync(f); else yield* p.gen(f); } });
    }
    if (!s.name) return out;
    return out.sync ? sync(named(K, bs, out.sync, false)) : gen(named(K, bs, out.gen, true));
  }
  /** a named block can be disabled: its own thread unwinds to here, other threads are told by the kernel */
  function named(K, bs, fn, isGen) {
    if (isGen) {
      return function* (f) {
        const th = K.cur;
        th.blocks.push(bs);
        try { yield* fn(f); } catch (e) { if (e && e.disable === bs) return; throw e; } finally { const i = th.blocks.lastIndexOf(bs); if (i >= 0) th.blocks.splice(i, 1); }
      };
    }
    return (f) => {
      const th = K.cur;
      if (th) th.blocks.push(bs);
      try { fn(f); } catch (e) { if (e && e.disable === bs) return; throw e; } finally { if (th) { const i = th.blocks.lastIndexOf(bs); if (i >= 0) th.blocks.splice(i, 1); } }
    };
  }
  T.named = named;

  function assign(W, sc, s, ctx) {
    const K = W.K;
    const L = X().lvalue(W, sc, s.lhs);
    const R = X().assignValue(W, sc, s.rhs, { real: L.real, w: L.w, signed: false });
    const nb = s.k === 'nba';
    if (nb && ctx.func) throw err('a function cannot use non-blocking assignment (<=)', s);
    if (nb && L.syms.some((x) => x.auto)) throw err('a non-blocking assignment cannot target the automatic variable ' + L.syms.find((x) => x.auto).name, s);
    if (!s.ctl) {
      if (!nb) return sync((f) => L.resolve(f)(R(f)));
      const label = lhsText(s.lhs);
      return sync((f) => { const v = R(f); K.nba(L.resolve(f), v, label); });
    }
    if (ctx.func) throw err('a function cannot contain timing controls', s);
    if (s.ctl.k === 'delay') {
      const d = delayTicks(W, sc, s.ctl.d);
      if (nb) return sync((f) => { const v = R(f); K.nbaAt(d(f), L.resolve(f), v); });
      return gen(function* (f) { const v = R(f); yield d(f); L.resolve(f)(v); });
    }
    // an event control inside the assignment, perhaps repeated
    const items = eventItems(W, sc, s.ctl.ev, null), req = { ev: items };
    let count = () => 1;
    if (s.ctl.repeat) { const t = V.Elab.typeOf(W, sc, s.ctl.repeat), c = X().compile(W, sc, s.ctl.repeat, t.w, t.s); count = (f) => { const v = c(f); return v.b ? 0 : Math.max(0, Number(V.signedVal(v))); }; }
    if (nb) {
      return sync((f) => {
        const v = R(f), apply = L.resolve(f), n = count(f);
        K.spawn(function* () { for (let i = 0; i < n; i++) yield req; K.nba(apply, v); }, f, sc, null, null);
      });
    }
    return gen(function* (f) { const v = R(f), n = count(f); for (let i = 0; i < n; i++) yield req; L.resolve(f)(v); });
  }

  const lhsText = (l) => (l.k === 'id' ? l.name : l.k === 'concat' ? '{' + l.parts.map(lhsText).join(', ') + '}' : l.base ? lhsText(l.base) + '[...]' : 'the target');
  function caseStmt(W, sc, s, ctx) {
    const te = V.Elab.typeOf(W, sc, s.expr);
    let w = te.w, sg = te.s, real = te.r;
    for (const a of s.arms) for (const e of a.exprs || []) { const t = V.Elab.typeOf(W, sc, e); w = Math.max(w, t.w); sg = sg && t.s; real = real || t.r; }
    if (real) throw err('case cannot compare reals; use if', s);
    const ex = X().compile(W, sc, s.expr, w, sg);
    const type = s.type;
    const match = type === 'case' ? (a, b) => a.a === b.a && a.b === b.b
      : (a, b) => {
        // casez: z (and ?) bits on either side are wildcards; casex: x as well
        const m = V.mask(a.w);
        let care = m & ~((a.b & ~a.a) | (b.b & ~b.a));
        if (type === 'casex') care &= ~(a.b | b.b);
        return ((a.a ^ b.a) & care) === 0n && ((a.b ^ b.b) & care) === 0n;
      };
    const arms = s.arms.map((a) => ({ items: a.exprs ? a.exprs.map((e) => X().compile(W, sc, e, w, sg)) : null, body: a.stmt ? cs(W, sc, a.stmt, ctx) : sync(() => {}) }));
    const defs = arms.filter((a) => !a.items);
    if (defs.length > 1) throw err('a case can have only one default', s);
    const def = defs[0] || null, list = arms.filter((a) => a.items);
    const pick = (f) => {
      const v = ex(f);
      for (const a of list) for (const it of a.items) if (match(v, it(f))) return a;
      return def;
    };
    if (arms.every((a) => a.body.sync)) return sync((f) => { const a = pick(f); if (a) a.body.sync(f); });
    return gen(function* (f) { const a = pick(f); if (a) { if (a.body.sync) a.body.sync(f); else yield* a.body.gen(f); } });
  }

  function taskCall(W, sc, s, ctx) {
    const K = W.K;
    const sym = X().findTF(W, sc, s.name, s, 'task');
    const info = X().tfInfo(W, sym);
    if (ctx.func) throw err('a function cannot call the task ' + s.name, s);
    if (s.args.length !== info.ports.length) throw err('the task ' + s.name + ' takes ' + info.ports.length + ' argument' + (info.ports.length === 1 ? '' : 's') + ', not ' + s.args.length, s);
    const ins = info.ports.map((p, i) => (p.dir !== 'output' ? X().assignValue(W, sc, s.args[i], p) : null));
    const outs = info.ports.map((p, i) => {
      if (p.dir === 'input') return null;
      if (!s.args[i]) throw err('the task ' + s.name + ' needs a variable for its ' + p.dir + ' ' + p.name, s);
      const L = X().lvalue(W, sc, s.args[i]);
      return { L, conv: L.real ? (v) => (typeof v === 'number' ? v : V.toReal(v)) : p.real ? (v) => V.fromReal(v, L.w, false) : (v) => V.resize(v, L.w, p.signed) };
    });
    const body = taskBody(W, info);
    const ts = info.scope;
    const enter = (f) => {
      const vals = ins.map((a) => (a ? a(f) : null));
      if (info.auto) { const fr = X().newFrame(info); info.ports.forEach((p, i) => { if (ins[i]) fr[p.slot] = vals[i]; }); return fr; }
      info.ports.forEach((p, i) => { if (ins[i]) K.setVar(p.st, vals[i]); });
      return null;
    };
    const leave = (f, fr) => {
      info.ports.forEach((p, i) => { if (outs[i]) outs[i].L.resolve(f)(outs[i].conv(info.auto ? fr[p.slot] : p.st.val)); });
    };
    if (body().sync) {
      return sync((f) => {
        const fr = enter(f), th = K.cur;
        if (th) th.blocks.push(ts);
        try { body().sync(fr); } catch (e) { if (!(e && e.disable === ts)) throw e; } finally { if (th) { const i = th.blocks.lastIndexOf(ts); if (i >= 0) th.blocks.splice(i, 1); } }
        leave(f, fr);
      });
    }
    return gen(function* (f) {
      const fr = enter(f), th = K.cur;
      th.blocks.push(ts);
      try { yield* body().gen(fr); } catch (e) { if (!(e && e.disable === ts)) throw e; } finally { const i = th.blocks.lastIndexOf(ts); if (i >= 0) th.blocks.splice(i, 1); }
      leave(f, fr);
    });
  }
  /** a task's compiled body, made once (a recursive task is taken to wait) */
  function taskBody(W, info) {
    return () => {
      if (info.body) return info.body;
      if (info.compiling) return { gen: function* (f) { yield* info.body.gen ? info.body.gen(f) : (info.body.sync(f), []); } };
      info.compiling = true;
      const save = W.constMode; W.constMode = false;
      try {
        const c = cs(W, info.scope, info.sym.decl.body, { task: true });
        info.body = c;
      } finally { info.compiling = false; W.constMode = save; }
      return info.body;
    };
  }
  T.taskBodyOf = (W, info) => taskBody(W, info);
  T.compileFuncBody = (W, info) => {
    const save = W.constMode; W.constMode = false;
    try {
      const c = cs(W, info.scope, info.sym.decl.body, { func: true });
      if (!c.sync) throw err('the function ' + info.sym.name + ' cannot wait for time or events', info.sym.decl);
      return c.sync;
    } finally { W.constMode = save; }
  };

  function sysTask(W, sc, s, ctx) {
    const fn = V.Sim.sysTask(W, sc, s, ctx);
    return fn.gen ? fn : sync(fn);
  }

  /** an initial or always block becomes a process for the kernel */
  function process(W, sc, node) {
    const body = node.body ? cs(W, sc, node.body, {}) : sync(() => {});
    const K = W.K;
    let g;
    if (node.k === 'initial') g = asGen(body);
    else {
      if (body.sync) throw err('this always block has no delay or event control (such as @(posedge clk) or @*), so it would loop forever at time 0', node);
      const bg = body.gen;
      g = function* (f) { for (;;) { K.guard(node); yield* bg(f); } };
    }
    W.procs.push({ sc, node, gen: g });
  }
  T.process = process;
})(globalThis.Sirkit = globalThis.Sirkit || {});
