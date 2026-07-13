// Lint: warnings for code that runs but is probably not what the student meant. Incomplete sensitivity lists,
// latches inferred in combinational always blocks, blocking assignments in clocked blocks, and values wider
// than the place they are stored (the top bits are dropped).
(function (S) {
  'use strict';
  const V = S.Verilog = S.Verilog || {};
  const L = V.Lint = {};

  L.run = function (W) {
    const warn = (node, msg) => W.warnings.push({ line: node.line, col: node.col, msg });
    for (const d of W.deferred) {
      if (d.k !== 'always') continue;
      try { always(W, d.sc, d.node, warn); } catch (e) { if (!(e instanceof V.VError)) throw e; }
    }
    for (const d of W.deferred) {
      if (d.k !== 'initial' && d.k !== 'always') continue;
      try { widths(W, d.sc, d.node.body, warn); } catch (e) { if (!(e instanceof V.VError)) throw e; }
    }
    for (const a of W.assigns) {
      try {
        const lw = a.segs.reduce((s, x) => s + x.w, 0), rw = lintWidth(W, a.sc, a.rhs);
        if (rw > lw) warn(a.rhs, tooWide(a.lhs, lw, rw));
      } catch (e) { if (!(e instanceof V.VError)) throw e; }
    }
  };

  const nameOf = (l) => (l.k === 'id' ? l.name : l.k === 'concat' ? 'the concatenation' : l.base ? nameOf(l.base) + '[...]' : 'the target');
  const an = (n) => (/^(8|11|18|8\d)$/.test(String(n)) ? 'an ' : 'a ');
  const tooWide = (l, lw, rw) => nameOf(l) + ' is ' + lw + ' bit' + (lw === 1 ? '' : 's') + ' wide but gets ' + an(rw) + rw + '-bit value; the top ' + (rw - lw) + ' bit' + (rw - lw === 1 ? ' is' : 's are') + ' dropped';

  /** the width a value really needs: unsized numbers count only their digits, integer variables nothing extra */
  function lintWidth(W, sc, n) {
    const t = V.Elab.typeOf(W, sc, n);
    if (t.r) return 0;
    const lw = (x) => lintWidth(W, sc, x);
    switch (n.k) {
      case 'num': if (n.sized) return n.v.w; return n.v.b ? 1 : Math.max(1, (n.v.s && V.signedVal(n.v) < 0n ? 32 : n.v.a.toString(2).length));
      case 'id': { const s = V.Elab.resolve(W, sc, n, true); if (!s) return t.w; if (s.k === 'genvar' || (s.k === 'param' && !s.msb && s.msb !== 0)) { const v = s.value; return v && !v.b ? Math.max(1, (V.signedVal(v) < 0n ? v.w : v.a.toString(2).length)) : t.w; } if (s.kind === 'integer' || s.kind === 'time') return 1; return t.w; }
      case 'un': return '+-~'.includes(n.op) && n.op.length === 1 ? lw(n.a) : 1;
      case 'bin':
        if (['+', '-', '*', '/', '%', '&', '|', '^', '^~', '~^'].includes(n.op)) return Math.max(lw(n.a), lw(n.b));
        if (['<<', '>>', '<<<', '>>>', '**'].includes(n.op)) return lw(n.a);
        return 1;
      case 'cond': return Math.max(lw(n.a), lw(n.b));
      case 'call': if (n.sys && (n.name === '$signed' || n.name === '$unsigned')) return lw(n.args[0]); if (n.sys) return 1; return t.w;
    }
    return t.w;
  }
  L.lintWidth = lintWidth;

  function widths(W, sc, s, warn) {
    if (!s || typeof s !== 'object') return;
    switch (s.k) {
      case 'ba': case 'nba': {
        const lv = V.Expr.lvalue(W, sc, s.lhs);
        if (lv.real) return;
        const rw = lintWidth(W, sc, s.rhs);
        if (rw > lv.w) warn(s.rhs, tooWide(s.lhs, lv.w, rw));
        return;
      }
      case 'block': { const bs = V.Stmt.blockScope(W, sc, s); for (const x of s.stmts) widths(W, bs, x, warn); return; }
      case 'if': widths(W, sc, s.then, warn); widths(W, sc, s.else, warn); return;
      case 'case': for (const a of s.arms) widths(W, sc, a.stmt, warn); return;
      case 'for': widths(W, sc, s.body, warn); return;
      case 'while': case 'repeat': case 'forever': widths(W, sc, s.body, warn); return;
      case 'delay': case 'event': case 'wait': widths(W, sc, s.stmt, warn); return;
    }
  }

  function always(W, sc, node, warn) {
    const body = node.body;
    if (!body || body.k !== 'event') return;
    const ev = body.ev, stmt = body.stmt;
    const edges = ev.k === 'events' && ev.list.some((it) => it.edge);
    const writes = V.Stmt.writesOfStmt(W, sc, stmt);
    const written = new Set(writes.map((w) => w.sym));
    const named = ev.k === 'events' && ev.list.some((it) => it.expr.k === 'id' && (V.Elab.resolve(W, sc, it.expr, true) || {}).k === 'event');
    if (!edges && !named && writes.length) {
      // a combinational block: everything it reads belongs in its list
      if (ev.k === 'events') {
        const listed = new Set();
        for (const it of ev.list) V.Expr.reads(W, sc, it.expr, listed);
        const reads = V.Stmt.readsOfStmt(W, sc, stmt, new Set(), true);
        for (const s of reads) {
          if (s.k !== 'var' || listed.has(s) || written.has(s) || s.auto) continue;
          warn(ev, 'the always block at line ' + node.line + ' reads ' + s.name + ' but ' + s.name + ' is not in its sensitivity list, so changes of ' + s.name + ' are missed; use @* (or add ' + s.name + ')');
        }
      }
      // every variable it assigns must get a value on every path, or a latch keeps the old one
      const sure = definite(W, sc, stmt);
      const seen = new Set();
      for (const w of writes) {
        if (seen.has(w.sym) || sure.has(w.sym) || w.sym.kind === 'integer') continue;
        seen.add(w.sym);
        if (localTo(w.sym, sc)) continue;
        warn(w.node, w.sym.name + ' is not assigned on every path through the always block at line ' + node.line + ', so a latch is inferred to hold its old value; give ' + w.sym.name + ' a default value at the top of the block (or an else / default)');
      }
      for (const w of writes) if (w.nb) { warn(w.node, 'use = (blocking) for ' + w.sym.name + ' in a combinational always block; <= is for clocked blocks'); break; }
      return;
    }
    if (!edges) return;
    // a clocked block: registers take <=
    const loopVars = new Set();
    const findLoops = (s) => { if (!s || typeof s !== 'object') return; if (s.k === 'for') { for (const w of V.Stmt.writesOfStmt(W, sc, s.init).concat(V.Stmt.writesOfStmt(W, sc, s.step))) loopVars.add(w.sym); } for (const k of ['then', 'else', 'body', 'stmt']) findLoops(s[k]); for (const x of s.stmts || []) findLoops(x); for (const a of s.arms || []) findLoops(a.stmt); };
    findLoops(stmt);
    const done = new Set();
    for (const w of writes) {
      if (w.nb || done.has(w.sym) || loopVars.has(w.sym) || w.sym.kind === 'integer' || localTo(w.sym, sc)) continue;
      done.add(w.sym);
      warn(w.node, w.sym.name + ' is assigned with = in a clocked always block; use ' + w.sym.name + ' <= ... so that all registers change together at the clock edge');
    }
  }
  /** a variable declared inside the block itself (a temporary) */
  const localTo = (sym, sc) => sym.scope && sym.scope !== sc && sym.scope.kind === 'block';

  /** variables assigned on every path through a statement */
  function definite(W, sc, s) {
    const out = new Set();
    if (!s || typeof s !== 'object') return out;
    const add = (set) => { for (const x of set) out.add(x); };
    const inter = (a, b) => new Set([...a].filter((x) => b.has(x)));
    switch (s.k) {
      case 'ba': case 'nba': for (const w of V.Stmt.writesOfStmt(W, sc, s)) out.add(w.sym); return out;
      case 'block': { const bs = V.Stmt.blockScope(W, sc, s); for (const x of s.stmts) add(definite(W, bs, x)); return out; }
      case 'if': return s.else ? inter(definite(W, sc, s.then), definite(W, sc, s.else)) : out;
      case 'case': {
        const arms = s.arms;
        const hasDefault = arms.some((a) => !a.exprs);
        if (!hasDefault && !fullCase(W, sc, s)) return out;
        let acc = null;
        for (const a of arms) { const d = definite(W, sc, a.stmt); acc = acc ? inter(acc, d) : d; }
        return acc || out;
      }
      case 'for': add(definite(W, sc, s.init)); add(definite(W, sc, s.body)); return out;
      case 'delay': case 'event': case 'wait': return definite(W, sc, s.stmt);
      case 'call': if (!s.sys) for (const w of V.Stmt.writesOfStmt(W, sc, s)) out.add(w.sym); return out;
    }
    return out;
  }
  /** a case whose constant items cover every value of its expression */
  function fullCase(W, sc, s) {
    const t = V.Elab.typeOf(W, sc, s.expr);
    if (t.w > 12) return false;
    const seen = new Set();
    for (const a of s.arms) for (const e of a.exprs || []) {
      if (!V.Expr.isConst(W, sc, e)) return false;
      const v = V.Elab.constVal(W, sc, e);
      if (typeof v === 'number') return false;
      if (v.b) {
        if (s.type === 'case') continue;
        // a wildcard item covers every value its known bits allow
        const care = V.mask(t.w) & ~(s.type === 'casex' ? v.b : v.b & ~v.a);
        for (let x = 0; x < 1 << t.w; x++) if ((BigInt(x) & care) === (v.a & care)) seen.add(x);
        continue;
      }
      seen.add(Number(v.a & V.mask(t.w)));
    }
    return seen.size >= 1 << t.w;
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
