// Verilog expressions compiled to closures: compile(W, scope, node, width, signed) gives f => Vec, the value at
// the context width and sign; compileReal gives f => number. f is the frame of an automatic task or function
// (null elsewhere). Also targets of assignments (lvalues), function calls and the system functions.
(function (S) {
  'use strict';
  /** 'a' or 'an' before a word as it is read aloud (an AND, an xor, an 8-bit, a NAND, a reg) */
  const an = (w) => (/^(?:[aeiou]|x(?:n?or)\b|nmos|rnmos|rtran|rcmos|rpmos|8|11(?!\d)|18(?!\d))/i.test(String(w)) ? 'an ' : 'a ');
  const V = S.Verilog = S.Verilog || {};
  const X = V.Expr = {};
  const B0 = 0n, B1 = 1n;
  const err = (msg, node) => new V.VError(msg, node);
  const E = () => V.Elab;
  const typeOf = (W, sc, n) => V.Elab.typeOf(W, sc, n);
  const resolve = (W, sc, n, q) => V.Elab.resolve(W, sc, n, q);
  const flag = (v, s) => (v.s === s ? v : new V.Vec(v.w, v.a, v.b, s));
  const ext = (fn, w, s, from) => (from === w ? (f) => flag(fn(f), s) : (f) => V.resize(fn(f), w, s));
  const idxNum = (v) => (v.b ? null : Number(V.signedVal(v)));

  function compile(W, sc, n, w, s) {
    const t = typeOf(W, sc, n);
    if (t.r) { const r = compileReal(W, sc, n); return (f) => V.fromReal(r(f), w, s); }
    switch (n.k) {
      case 'num': { const v = flag(n.xfill ? V.fillExt(n.v, w) : V.resize(n.v, w, s), s); return () => v; }
      case 'str': { const v = V.resize(V.strToVec(n.s), w, s); return () => v; }
      case 'id': {
        const sym = resolve(W, sc, n);
        if (sym.k === 'param' || sym.k === 'genvar') { const v = V.resize(sym.value, w, s); return () => v; }
        if (sym.auto) { const k = sym.slot; return ext((f) => f[k], w, s, sym.w); }
        const st = sym.st;
        return ext(() => st.val, w, s, sym.w);
      }
      case 'index': case 'range': case 'ipart': { const r = select(W, sc, n); return ext(r.fn, w, s, r.w); }
      case 'un': {
        const op = n.op;
        if (op === '+') return compile(W, sc, n.a, w, s);
        if (op === '-') { const a = compile(W, sc, n.a, w, s); return (f) => V.ops.neg(a(f)); }
        if (op === '~') { const a = compile(W, sc, n.a, w, s); return (f) => V.ops.not(a(f)); }
        const ta = typeOf(W, sc, n.a);
        if (op === '!') {
          if (ta.r) { const r = compileReal(W, sc, n.a); return (f) => V.resize(V.bool(r(f) === 0 ? 1 : 0), w, s); }
          const a = compile(W, sc, n.a, ta.w, ta.s); return (f) => V.resize(V.logic.lnot(a(f)), w, s);
        }
        const red = { '&': 'and', '~&': 'nand', '|': 'or', '~|': 'nor', '^': 'xor', '~^': 'xnor', '^~': 'xnor' }[op];
        const a = compile(W, sc, n.a, ta.w, ta.s), fn = V.reduce[red];
        return (f) => V.resize(fn(a(f)), w, s);
      }
      case 'bin': return binary(W, sc, n, w, s);
      case 'cond': {
        const tc = typeOf(W, sc, n.c);
        const c = tc.r ? ((r) => (f) => (r(f) !== 0 ? 1 : 0))(compileReal(W, sc, n.c)) : ((cv) => (f) => V.truth(cv(f)))(compile(W, sc, n.c, tc.w, tc.s));
        const a = compile(W, sc, n.a, w, s), b = compile(W, sc, n.b, w, s);
        return (f) => { const t = c(f); return t === 1 ? a(f) : t === 0 ? b(f) : V.merge(a(f), b(f)); };
      }
      case 'concat': case 'repl': {
        const r = concat(W, sc, n);
        return ext(r, w, s, t.w);
      }
      case 'call': {
        const r = n.sys ? sysCall(W, sc, n) : funcCall(W, sc, n);
        return ext(r.fn, w, s, r.w);
      }
    }
    throw err('this expression is not supported', n);
  }
  X.compile = compile;

  function binary(W, sc, n, w, s) {
    const op = n.op;
    const ARITH = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod', '&': 'and', '|': 'or', '^': 'xor', '^~': 'xnor', '~^': 'xnor' };
    if (ARITH[op]) {
      const a = compile(W, sc, n.a, w, s), b = compile(W, sc, n.b, w, s), fn = V.ops[ARITH[op]];
      return (f) => fn(a(f), b(f));
    }
    if (op === '**' || op === '<<' || op === '>>' || op === '<<<' || op === '>>>') {
      const tb = typeOf(W, sc, n.b);
      const a = compile(W, sc, n.a, w, s), b = compile(W, sc, n.b, tb.w, tb.s);
      const fn = V.ops[{ '**': 'pow', '<<': 'shl', '<<<': 'shl', '>>': 'shr', '>>>': 'ashr' }[op]];
      if (op === '>>' || op === '<<' || op === '<<<' || op === '>>>') {
        // a negative or huge shift amount: the amount is read unsigned
        return (f) => { const bv = b(f); return fn(a(f), bv.s ? new V.Vec(bv.w, bv.a, bv.b, false) : bv); };
      }
      return (f) => fn(a(f), b(f));
    }
    const ta = typeOf(W, sc, n.a), tb = typeOf(W, sc, n.b);
    if (op === '&&' || op === '||') {
      const a = truthOf(W, sc, n.a, ta), b = truthOf(W, sc, n.b, tb);
      if (op === '&&') return (f) => { const p = a(f); if (p === 0) return V.resize(V.ZERO1, w, s); const q = b(f); return V.resize(V.bool(q === 0 ? 0 : p === 1 && q === 1 ? 1 : 'x'), w, s); };
      return (f) => { const p = a(f); if (p === 1) return V.resize(V.ONE1, w, s); const q = b(f); return V.resize(V.bool(q === 1 ? 1 : p === 0 && q === 0 ? 0 : 'x'), w, s); };
    }
    const CMP = { '==': 'eq', '!=': 'ne', '===': 'ceq', '!==': 'cne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' }[op];
    if (CMP) {
      if (ta.r || tb.r) {
        const a = compileReal(W, sc, n.a), b = compileReal(W, sc, n.b);
        const rf = { eq: (x, y) => x === y, ne: (x, y) => x !== y, lt: (x, y) => x < y, le: (x, y) => x <= y, gt: (x, y) => x > y, ge: (x, y) => x >= y }[CMP];
        return (f) => V.resize(V.bool(rf(a(f), b(f)) ? 1 : 0), w, s);
      }
      const wi = Math.max(ta.w, tb.w), si = ta.s && tb.s;
      const a = compile(W, sc, n.a, wi, si), b = compile(W, sc, n.b, wi, si), fn = V.cmp[CMP];
      return (f) => V.resize(fn(a(f), b(f)), w, s);
    }
    throw err('the operator ' + op + ' is not supported', n);
  }
  /** f => 0 | 1 | 'x', the truth of an expression */
  function truthOf(W, sc, n, t) {
    t = t || typeOf(W, sc, n);
    if (t.r) { const r = compileReal(W, sc, n); return (f) => (r(f) !== 0 ? 1 : 0); }
    const a = compile(W, sc, n, t.w, t.s);
    return (f) => V.truth(a(f));
  }
  X.truthOf = truthOf;
  /** self-determined value */
  X.self = (W, sc, n) => { const t = typeOf(W, sc, n); return t.r ? compileReal(W, sc, n) : compile(W, sc, n, t.w, t.s); };

  /** an expression whose width is not definite: an unsized number, or arithmetic on one */
  const unsized = (p) => (p.k === 'num' ? !p.sized : p.k === 'un' && '+-~'.includes(p.op) && p.op.length === 1 ? unsized(p.a) : p.k === 'bin' && !['==', '!=', '===', '!==', '<', '<=', '>', '>=', '&&', '||'].includes(p.op) ? (['<<', '>>', '<<<', '>>>', '**'].includes(p.op) ? unsized(p.a) : unsized(p.a) || unsized(p.b)) : p.k === 'cond' ? unsized(p.a) || unsized(p.b) : false);
  X.unsized = unsized;
  function concat(W, sc, n) {
    if (n.k === 'repl') {
      const k = V.Elab.constInt(W, sc, n.n);
      const inner = concat(W, sc, { k: 'concat', parts: n.parts, line: n.line, col: n.col });
      if (k === 0) return () => new V.Vec(0, B0, B0, false);
      return (f) => { const v = inner(f); const a = new Array(k).fill(v); return V.concat(a); };
    }
    const parts = n.parts.map((p) => {
      const t = typeOf(W, sc, p);
      if (unsized(p)) throw err('a number in a concatenation needs a size, like 4\'d' + (p.k === 'num' && !p.v.b ? String(p.v.a) : '0') + ' (an unsized number has no definite width)', p);
      if (t.zero) return null;
      return compile(W, sc, p, t.w, t.s);
    }).filter(Boolean);
    if (parts.length === 1) return parts[0];
    return (f) => V.concat(parts.map((p) => p(f)));
  }

  // ---- selects --------------------------------------------------------------------------------------------------
  const posOf = (msb, lsb) => (msb >= lsb ? (i) => i - lsb : (i) => lsb - i);
  /** word index closure of a memory select, or null for none */
  function wordIndex(W, sc, sym, chain) {
    const dims = sym.arr.dims;
    const idx = chain.slice(0, dims.length).map((c) => { const t = typeOf(W, sc, c.index); return compile(W, sc, c.index, t.w, t.s); });
    return (f) => {
      let flat = 0;
      for (let d = 0; d < dims.length; d++) {
        const i = idxNum(idx[d](f));
        if (i === null || i < dims[d].lo || i >= dims[d].lo + dims[d].n) return -1;
        const off = dims[d].a <= dims[d].b ? i - dims[d].a : dims[d].a - i;
        flat = flat * dims[d].n + off;
      }
      return flat;
    };
  }
  X.wordIndex = wordIndex;
  /** { fn: f => Vec (self-determined), w } for a bit, part or word select */
  function select(W, sc, n) {
    const { root, chain } = V.Elab.selChain(n);
    const sym = resolve(W, sc, root);
    const nd = sym.arr ? sym.arr.dims.length : 0;
    let base, w0, s0, msb, lsb;
    if (sym.k === 'param' || sym.k === 'genvar') {
      const v = sym.value; base = () => v; w0 = v.w; s0 = v.s;
      msb = sym.msb != null ? sym.msb : v.w - 1; lsb = sym.lsb != null ? sym.lsb : 0;
    } else if (sym.k === 'var') {
      w0 = sym.w; s0 = sym.signed; msb = sym.msb; lsb = sym.lsb;
      if (sym.arr) {
        const wi = wordIndex(W, sc, sym, chain), xw = V.allX(sym.w, sym.signed);
        if (sym.auto) { const k = sym.slot; base = (f) => { const i = wi(f); return i < 0 ? xw : f[k][i] || xw; }; }
        else { const st = sym.st; base = (f) => { const i = wi(f); return i < 0 ? xw : st.words[i] || xw; }; }
      } else if (sym.auto) { const k = sym.slot; base = (f) => f[k]; }
      else { const st = sym.st; base = () => st.val; }
    } else throw err(root.name + ' cannot be indexed', n);
    const rest = chain.slice(nd);
    if (!rest.length) return { fn: base, w: w0 };
    const c = rest[0], pos = posOf(msb, lsb);
    if (c.k === 'index') {
      const t = typeOf(W, sc, c.index);
      if (t.r) throw err('an index cannot be a real', c.index);
      const ci = X.isConst(W, sc, c.index) ? V.Elab.constVal(W, sc, c.index) : null;
      if (ci) {
        const i = idxNum(ci), p = i === null ? -1 : pos(i);
        if (p < 0 || p >= w0) return { fn: () => V.X1, w: 1 };
        return { fn: (f) => V.slice(base(f), p, 1), w: 1 };
      }
      const ix = compile(W, sc, c.index, t.w, t.s);
      return { fn: (f) => { const i = idxNum(ix(f)); if (i === null) return V.X1; const p = pos(i); return p < 0 || p >= w0 ? V.X1 : V.slice(base(f), p, 1); }, w: 1 };
    }
    if (c.k === 'range') {
      const a = V.Elab.constInt(W, sc, c.msb), b = V.Elab.constInt(W, sc, c.lsb);
      if ((msb >= lsb) !== (a >= b) && a !== b) throw err('the part-select [' + a + ':' + b + '] runs the other way from the declaration [' + msb + ':' + lsb + '] of ' + root.name, c);
      const lo = Math.min(pos(a), pos(b)), w = Math.abs(a - b) + 1;
      return { fn: (f) => V.slice(base(f), lo, w), w };
    }
    // indexed part-select
    const k = V.Elab.constInt(W, sc, c.width), t = typeOf(W, sc, c.start), st = compile(W, sc, c.start, t.w, t.s);
    const up = c.dir === '+', little = msb >= lsb;
    return {
      fn: (f) => {
        const i = idxNum(st(f));
        if (i === null) return V.allX(k);
        const lowIdx = up ? (little ? i : i + k - 1) : (little ? i - k + 1 : i);
        return V.slice(base(f), pos(lowIdx), k);
      }, w: k,
    };
  }
  X.select = select;
  function hasVar(W, sc, n) {
    if (!n || typeof n !== 'object') return false;
    if (n.k === 'id') { const s = resolve(W, sc, n, true); return !s || s.k === 'var'; }
    if (n.k === 'call') return !(n.sys && /^\$(signed|unsigned|clog2|bits|itor|rtoi)$/.test(n.name)) || n.args.some((a) => hasVar(W, sc, a));
    return ['a', 'b', 'c', 'base', 'index', 'msb', 'lsb', 'start', 'width'].some((k) => n[k] && hasVar(W, sc, n[k])) || (n.parts || []).some((p) => hasVar(W, sc, p));
  }
  X.isConst = (W, sc, n) => !hasVar(W, sc, n);

  // ---- reals ----------------------------------------------------------------------------------------------------
  function compileReal(W, sc, n) {
    const t = typeOf(W, sc, n);
    if (!t.r) { const v = compile(W, sc, n, t.w, t.s); return (f) => V.toReal(v(f)); }
    switch (n.k) {
      case 'real': { const r = n.v; return () => r; }
      case 'id': {
        const sym = resolve(W, sc, n);
        if (sym.k === 'param') { const r = sym.value; return () => r; }
        if (sym.auto) { const k = sym.slot; return (f) => f[k]; }
        const st = sym.st; return () => st.val;
      }
      case 'index': {
        const { root, chain } = V.Elab.selChain(n);
        const sym = resolve(W, sc, root);
        const wi = wordIndex(W, sc, sym, chain), st = sym.st;
        return (f) => { const i = wi(f); return i < 0 ? 0 : st.words[i] || 0; };
      }
      case 'un': {
        const a = compileReal(W, sc, n.a);
        if (n.op === '-') return (f) => -a(f);
        return a;
      }
      case 'bin': {
        const a = compileReal(W, sc, n.a), b = compileReal(W, sc, n.b);
        switch (n.op) {
          case '+': return (f) => a(f) + b(f);
          case '-': return (f) => a(f) - b(f);
          case '*': return (f) => a(f) * b(f);
          case '/': return (f) => a(f) / b(f);
          case '**': return (f) => Math.pow(a(f), b(f));
        }
        break;
      }
      case 'cond': {
        const c = truthOf(W, sc, n.c), a = compileReal(W, sc, n.a), b = compileReal(W, sc, n.b);
        return (f) => (c(f) === 1 ? a(f) : b(f));
      }
      case 'call': {
        const r = n.sys ? sysCall(W, sc, n) : funcCall(W, sc, n);
        return r.fn;
      }
    }
    throw err('this real expression is not supported', n);
  }
  X.compileReal = compileReal;

  // ---- system functions -------------------------------------------------------------------------------------------
  const SYS_TYPES = {
    $time: { w: 64, s: false }, $stime: { w: 32, s: false }, $realtime: { w: 64, s: true, r: true }, $random: { w: 32, s: true }, $urandom: { w: 32, s: false },
    $clog2: { w: 32, s: true }, $rtoi: { w: 32, s: true }, $itor: { w: 64, s: true, r: true }, $realtobits: { w: 64, s: false }, $bitstoreal: { w: 64, s: true, r: true },
    $test$plusargs: { w: 32, s: true }, $value$plusargs: { w: 32, s: true }, $bits: { w: 32, s: true }, $ln: { r: true, w: 64, s: true }, $sqrt: { r: true, w: 64, s: true },
    $urandom_range: { w: 32, s: false }, $dist_uniform: { w: 32, s: true },
  };
  function sysType(W, sc, n) {
    if (n.name === '$signed' || n.name === '$unsigned') {
      if (n.args.length !== 1) throw err(n.name + ' takes one argument', n);
      const t = typeOf(W, sc, n.args[0]);
      if (t.r) throw err(n.name + ' cannot be used on a real', n);
      return { w: t.w, s: n.name === '$signed' };
    }
    const t = SYS_TYPES[n.name];
    if (!t) {
      if (V.Sim && V.Sim.TASKS && V.Sim.TASKS.has(n.name)) throw err(n.name + ' is a system task; call it on its own as a statement', n);
      throw err('the system function ' + n.name + ' is not supported', n);
    }
    return t;
  }
  X.sysType = sysType;
  function sysCall(W, sc, n) {
    const K = W.K, t = sysType(W, sc, n), a = n.args;
    const scale = () => K.scaleOf(sc);
    switch (n.name) {
      case '$signed': case '$unsigned': {
        const ta = typeOf(W, sc, a[0]), v = compile(W, sc, a[0], ta.w, ta.s), s = n.name === '$signed';
        return { fn: (f) => flag(v(f), s), w: t.w };
      }
      case '$time': return { fn: () => V.fromInt(K.timeIn(sc), 64, false), w: 64 };
      case '$stime': return { fn: () => V.fromInt(BigInt(K.timeIn(sc)) & 0xffffffffn, 32, false), w: 32 };
      case '$realtime': return { fn: () => K.now / scale(), w: 64 };
      case '$random': case '$urandom': case '$dist_uniform': {
        let seedR = null, seedW = null;
        if (a.length && a[0]) {
          const ts = typeOf(W, sc, a[0]); seedR = compile(W, sc, a[0], 32, true);
          seedW = lvalue(W, sc, a[0]);
          if (ts.r) throw err('the seed of ' + n.name + ' must be an integer variable', a[0]);
        }
        let lo = null, hi = null;
        if (n.name === '$dist_uniform') { lo = compile(W, sc, a[1], 32, true); hi = compile(W, sc, a[2], 32, true); }
        const uns = n.name === '$urandom';
        return {
          fn: (f) => {
            let seed;
            if (seedR) { const sv = seedR(f); seed = sv.b ? 0 : Number(V.signedVal(sv)); } else seed = uns ? K.useed : K.seed;
            const r = n.name === '$dist_uniform' ? K.distUniform(seed, Number(V.signedVal(lo(f))), Number(V.signedVal(hi(f)))) : K.random(seed);
            if (seedW) seedW.resolve(f)(V.fromInt(r.seed, 32, true)); else if (uns) K.useed = r.seed; else K.seed = r.seed;
            return V.fromInt(r.value, 32, !uns);
          }, w: 32,
        };
      }
      case '$urandom_range': {
        const hi = compile(W, sc, a[0], 32, false), lo = a[1] ? compile(W, sc, a[1], 32, false) : () => V.fromInt(0, 32);
        return { fn: (f) => { const r = K.random(K.useed); K.useed = r.seed; let h = Number(hi(f).a), l = Number(lo(f).a); if (h < l) [h, l] = [l, h]; return V.fromInt(l + ((r.value >>> 0) % (h - l + 1)), 32, false); }, w: 32 };
      }
      case '$clog2': {
        const ta = typeOf(W, sc, a[0]), v = compile(W, sc, a[0], ta.w, false);
        return { fn: (f) => { const x = v(f); if (x.b) return V.allX(32, true); let k = 0; while ((B1 << BigInt(k)) < x.a) k++; return V.fromInt(k, 32, true); }, w: 32 };
      }
      case '$bits': { const ta = typeOf(W, sc, a[0]); const v = V.fromInt(ta.w, 32, true); return { fn: () => v, w: 32 }; }
      case '$rtoi': { const r = compileReal(W, sc, a[0]); return { fn: (f) => V.fromInt(Math.trunc(r(f)), 32, true), w: 32 }; }
      case '$itor': { const r = compileReal(W, sc, a[0]); return { fn: r, w: 64 }; }
      case '$realtobits': {
        const r = compileReal(W, sc, a[0]);
        return { fn: (f) => { const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, r(f)); return new V.Vec(64, dv.getBigUint64(0), B0, false); }, w: 64 };
      }
      case '$bitstoreal': {
        const v = compile(W, sc, a[0], 64, false);
        return { fn: (f) => { const dv = new DataView(new ArrayBuffer(8)); dv.setBigUint64(0, v(f).a); return dv.getFloat64(0); }, w: 64 };
      }
      case '$ln': { const r = compileReal(W, sc, a[0]); return { fn: (f) => Math.log(r(f)), w: 64 }; }
      case '$sqrt': { const r = compileReal(W, sc, a[0]); return { fn: (f) => Math.sqrt(r(f)), w: 64 }; }
      case '$test$plusargs': case '$value$plusargs': { const z = V.fromInt(0, 32, true); return { fn: () => z, w: 32 }; }
    }
    throw err('the system function ' + n.name + ' is not supported', n);
  }
  X.sysCall = sysCall;

  // ---- user functions ---------------------------------------------------------------------------------------------
  function findTF(W, sc, name, node, kind) {
    let sym;
    if (name.includes('.')) {
      const parts = name.split('.').map((p) => ({ name: p, idx: null }));
      const s = V.Elab.findScope(W, sc, parts.slice(0, -1), node);
      sym = s.syms.get(parts[parts.length - 1].name);
    } else {
      for (let s = sc; s && !sym; s = s.parent) { const x = s.syms.get(name); if (x && (x.k === 'func' || x.k === 'task')) sym = x; if (s.kind === 'module') break; }
      if (!sym) sym = sc.lookup(name);
    }
    if (!sym || sym.k !== kind) {
      if (sym && sym.k === 'task' && kind === 'func') throw err(name + ' is a task; call it as a statement, not inside an expression', node);
      if (sym && sym.k === 'func' && kind === 'task') throw err(name + ' is a function; use its value in an expression', node);
      throw err('there is no ' + (kind === 'func' ? 'function' : 'task') + ' called ' + name, node);
    }
    return sym;
  }
  X.findTF = findTF;
  /** the scope of a function or task, with its declarations (built once) */
  function tfInfo(W, sym) {
    if (sym.info) return sym.info;
    const d = sym.decl, sc = sym.scope;
    const save = W.constMode; W.constMode = false;
    try {
      const fs = new V.Elab.Scope(sym.k === 'func' ? 'func' : 'task', d.name, sc, { isTF: true });
      fs.auto = !!d.auto;
      fs.nslots = 0; fs.slotSyms = [];
      const info = { scope: fs, auto: !!d.auto, ports: [], ret: null, sym };
      sym.info = info;
      if (sym.k === 'func') {
        const kind = d.rtype || 'reg';
        info.ret = V.Elab.declareAll(W, fs, [{ dir: null, kind, signed: d.signed, range: d.range, names: [{ name: d.name, dims: [], init: null, line: d.line, col: d.col }] }])[0];
      }
      const decls = d.decls.filter((x) => x.k === 'decl').map((x) => (x.dir && !x.kind ? Object.assign({}, x, { kind: 'reg' }) : x));
      for (const p of d.decls.filter((x) => x.k === 'param')) V.Elab.declareParam(W, fs, p, null);
      const syms = V.Elab.declareAll(W, fs, decls);
      info.ports = syms.filter((s) => s.dir);
      if (sym.k === 'func' && info.ports.some((p) => p.dir !== 'input')) throw err('a function can only have inputs', d);
      if (sym.k === 'func' && !info.ports.length) throw err('the function ' + d.name + ' needs at least one input', d);
      return info;
    } finally { W.constMode = save; }
  }
  X.tfInfo = tfInfo;
  /** a fresh frame for an automatic task or function */
  X.newFrame = (info) => { const fs = info.scope, fr = new Array(fs.nslots); for (const s of fs.slotSyms) fr[s.slot] = s.arr ? new Array(s.arr.size) : V.Elab.initValue(s); return fr; };

  function funcType(W, sc, n) {
    const sym = findTF(W, sc, n.name, n, 'func');
    const info = tfInfo(W, sym);
    return info.ret.real ? { w: 64, s: true, r: true } : { w: info.ret.w, s: info.ret.signed };
  }
  X.funcType = funcType;
  function funcCall(W, sc, n) {
    const sym = findTF(W, sc, n.name, n, 'func');
    const info = tfInfo(W, sym), K = W.K;
    if (n.args.length !== info.ports.length) throw err(n.name + ' takes ' + info.ports.length + ' argument' + (info.ports.length === 1 ? '' : 's') + ', not ' + n.args.length, n);
    const args = info.ports.map((p, i) => assignValue(W, sc, n.args[i], p));
    const ret = info.ret;
    let body = null;
    const getBody = () => body || (body = info.bodyFn || (info.bodyFn = V.Stmt.compileFuncBody(W, info)));
    const blocker = { disable: info.scope };
    if (info.auto) {
      return {
        fn: (f) => {
          const vals = args.map((a) => a(f));
          const fr = X.newFrame(info);
          info.ports.forEach((p, i) => { fr[p.slot] = vals[i]; });
          if (++K.depth > 3000) { K.depth = 0; throw K.runtimeError('the function ' + n.name + ' calls itself too deeply', n); }
          try { getBody()(fr); } catch (e) { if (e !== blocker && !(e && e.disable === info.scope)) throw e; } finally { K.depth--; }
          return fr[ret.slot];
        }, w: ret.w,
      };
    }
    return {
      fn: (f) => {
        const vals = args.map((a) => a(f));
        info.ports.forEach((p, i) => K.setVar(p.st, vals[i]));
        if (++K.depth > 3000) { K.depth = 0; throw K.runtimeError('the function ' + n.name + ' calls itself too deeply (declare it automatic for recursion)', n); }
        try { getBody()(null); } catch (e) { if (!(e && e.disable === info.scope)) throw e; } finally { K.depth--; }
        return ret.st.val;
      }, w: ret.w,
    };
  }
  X.funcCall = funcCall;

  /** f => value converted for storing into the target sym (a Vec of its width, or a real) */
  function assignValue(W, sc, rhs, target) {
    const t = typeOf(W, sc, rhs);
    if (target.real) return compileReal(W, sc, rhs);
    if (t.r) { const r = compileReal(W, sc, rhs); return (f) => V.fromReal(r(f), target.w, target.signed); }
    const w = Math.max(t.w, target.w), v = compile(W, sc, rhs, w, t.s);
    if (w === target.w) return v;
    return (f) => V.resize(v(f), target.w, false);
  }
  X.assignValue = assignValue;

  // ---- lvalues ----------------------------------------------------------------------------------------------------
  /**
   * a target of a procedural assignment: { w, real, syms, resolve: f => (v => void) }. Indices are read when
   * resolve is called (so a non-blocking assignment fixes them when it is scheduled).
   */
  function lvalue(W, sc, n, how) {
    const K = W.K;
    if (n.k === 'concat') {
      const parts = n.parts.map((p) => lvalue(W, sc, p, how));
      if (parts.some((p) => p.real)) throw err('a real cannot be part of a concatenation', n);
      const w = parts.reduce((s, p) => s + p.w, 0);
      return {
        w, real: false, syms: parts.flatMap((p) => p.syms),
        resolve: (f) => {
          const rs = parts.map((p) => p.resolve(f));
          return (v) => { let off = w; parts.forEach((p, i) => { off -= p.w; rs[i](V.slice(v, off, p.w)); }); };
        },
      };
    }
    const { root, chain } = V.Elab.selChain(n);
    if (root.k !== 'id') throw err('cannot assign to this expression', n);
    const sym = resolve(W, sc, root);
    if (sym.k === 'param' || sym.k === 'genvar') throw err(root.name + ' is a parameter and cannot be assigned', n);
    if (sym.k !== 'var') throw err(root.name + ' cannot be assigned', n);
    if (sym.isNet && how !== 'force') throw err(root.name + ' is ' + an(sym.kind) + sym.kind + ', so it cannot be assigned in an initial or always block; declare it as reg (or drive it with assign)', n);
    const nd = sym.arr ? sym.arr.dims.length : 0;
    if (chain.length < nd) throw err(root.name + ' is a memory; assign one word at a time, like ' + root.name + '[i] = ...', n);
    const rest = chain.slice(nd);
    if (rest.length > 1) throw err('only one bit or part select may follow ' + root.name, n);
    const st = sym.st, slot = sym.slot, auto = sym.auto;
    const out = { w: sym.w, real: sym.real, syms: [sym] };
    // whole word or variable
    let getW, setW;
    if (sym.arr) {
      const wi = wordIndex(W, sc, sym, chain);
      out.word = true;
      if (!rest.length) {
        out.resolve = auto ? (f) => { const i = wi(f); return i < 0 ? () => {} : (v) => { f[slot][i] = v; }; } : (f) => { const i = wi(f); return i < 0 ? () => {} : (v) => K.setWord(st, i, v); };
        return out;
      }
      getW = auto ? (f, i) => f[slot][i] || V.allX(sym.w) : (f, i) => st.words[i] || V.allX(sym.w);
      setW = auto ? (f, i, v) => { f[slot][i] = v; } : (f, i, v) => K.setWord(st, i, v);
      const sel = partOf(W, sc, sym, rest[0], root);
      out.w = sel.w; out.real = false;
      out.resolve = (f) => { const i = wi(f); const lo = sel.lo(f); if (i < 0 || lo === null) return () => {}; return (v) => setW(f, i, spliceIn(getW(f, i), lo, v, sel.w)); };
      return out;
    }
    if (!rest.length) {
      if (auto) out.resolve = (f) => (v) => { f[slot] = v; };
      else { const set = (v) => K.setVar(st, v); out.resolve = () => set; }
      return out;
    }
    if (sym.real) throw err('a real cannot be bit-selected', n);
    const sel = partOf(W, sc, sym, rest[0], root);
    out.w = sel.w;
    if (auto) out.resolve = (f) => { const lo = sel.lo(f); return lo === null ? () => {} : (v) => { f[slot] = spliceIn(f[slot], lo, v, sel.w); }; };
    else if (sel.constLo != null) { const lo = sel.constLo; const set = (v) => K.setVar(st, spliceIn(st.val, lo, v, sel.w)); out.resolve = () => set; }
    else out.resolve = (f) => { const lo = sel.lo(f); return lo === null ? () => {} : (v) => K.setVar(st, spliceIn(st.val, lo, v, sel.w)); };
    out.lo = sel.constLo;
    return out;
  }
  X.lvalue = lvalue;
  const spliceIn = (old, lo, v, w) => V.splice(old, lo, v.w === w ? v : V.resize(v, w, false));
  /** the low bit position of a bit or part select: { w, lo: f => position | null, constLo } */
  function partOf(W, sc, sym, c, root) {
    const pos = posOf(sym.msb, sym.lsb), W0 = sym.w;
    const inRange = (p, w) => (p >= 0 && p + w <= W0 ? p : p + w > 0 && p < W0 ? p : null);
    if (c.k === 'index') {
      if (X.isConst(W, sc, c.index)) { const i = V.Elab.constInt(W, sc, c.index, 'an index'); const p = inRange(pos(i), 1); return { w: 1, lo: () => p, constLo: p }; }
      const t = typeOf(W, sc, c.index), ix = compile(W, sc, c.index, t.w, t.s);
      return { w: 1, lo: (f) => { const i = idxNum(ix(f)); return i === null ? null : inRange(pos(i), 1); } };
    }
    if (c.k === 'range') {
      const a = V.Elab.constInt(W, sc, c.msb), b = V.Elab.constInt(W, sc, c.lsb);
      if ((sym.msb >= sym.lsb) !== (a >= b) && a !== b) throw err('the part-select [' + a + ':' + b + '] runs the other way from the declaration [' + sym.msb + ':' + sym.lsb + '] of ' + root.name, c);
      const lo = Math.min(pos(a), pos(b)), w = Math.abs(a - b) + 1;
      return { w, lo: () => inRange(lo, w), constLo: inRange(lo, w) };
    }
    const k = V.Elab.constInt(W, sc, c.width), t = typeOf(W, sc, c.start), stf = compile(W, sc, c.start, t.w, t.s);
    const up = c.dir === '+', little = sym.msb >= sym.lsb;
    return { w: k, lo: (f) => { const i = idxNum(stf(f)); if (i === null) return null; return inRange(pos(up ? (little ? i : i + k - 1) : (little ? i - k + 1 : i)), k); } };
  }
  X.partOf = partOf;

  /** the stores an expression reads (for @*, wait and lint), as a Set of syms */
  function reads(W, sc, n, out, noFuncs) {
    out = out || new Set();
    if (!n || typeof n !== 'object') return out;
    switch (n.k) {
      case 'id': { const s = resolve(W, sc, n, true); if (s && (s.k === 'var' || s.k === 'event')) out.add(s); return out; }
      case 'index': case 'range': case 'ipart': {
        const { root, chain } = V.Elab.selChain(n);
        reads(W, sc, root, out);
        for (const c of chain) { reads(W, sc, c.index, out); reads(W, sc, c.start, out); }
        return out;
      }
      case 'call': for (const a of n.args) reads(W, sc, a, out); return out;
      case 'concat': case 'repl': for (const p of n.parts) reads(W, sc, p, out); return out;
      case 'un': return reads(W, sc, n.a, out);
      case 'bin': reads(W, sc, n.a, out); return reads(W, sc, n.b, out);
      case 'cond': reads(W, sc, n.c, out); reads(W, sc, n.a, out); return reads(W, sc, n.b, out);
    }
    return out;
  }
  X.reads = reads;
})(globalThis.Sirkit = globalThis.Sirkit || {});
