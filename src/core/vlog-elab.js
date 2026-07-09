// Verilog elaboration: the instance tree (parameters and overrides, defparam, generate, ports), and the
// compilation of every expression and statement into closures that the scheduler in vlog-sim.js runs.
// Expressions follow the standard's width and sign rules: each node has a self-determined type, and the
// context width and sign are pushed down to the context-determined operands.
(function (S) {
  'use strict';
  /** 'a' or 'an' before a word as it is read aloud (an AND, an xor, an 8-bit, a NAND, a reg) */
  const an = (w) => (/^(?:[aeiou]|x(?:n?or)\b|nmos|rnmos|rtran|rcmos|rpmos|8|11(?!\d)|18(?!\d))/i.test(String(w)) ? 'an ' : 'a ');
  const V = S.Verilog = S.Verilog || {};
  const E = V.Elab = {};
  const B0 = 0n, B1 = 1n;
  const err = (msg, node) => new V.VError(msg, node);

  class Scope {
    constructor(kind, name, parent, extra) {
      this.kind = kind; this.name = name; this.parent = parent;
      this.path = parent ? parent.path + '.' + name : name;
      this.syms = new Map(); this.children = new Map(); this.tcache = new Map();
      this.inst = kind === 'module' ? this : parent.inst;
      this.auto = !!(parent && kind !== 'module' && parent.auto);
      Object.assign(this, extra || {});
      if (parent) parent.children.set(name, this);
    }
    lookup(name) {
      for (let s = this; s; s = s.parent) { const x = s.syms.get(name); if (x) return x; if (s.kind === 'module') break; }
      return null;
    }
  }
  E.Scope = Scope;

  // ---- types and constant evaluation ------------------------------------------------------------------------------
  const vnum = (v) => (v.b ? null : Number(V.signedVal(v)));
  /** a constant expression's value as a JS number (throws when not constant or unknown) */
  function constInt(W, sc, node, what) {
    const v = constVal(W, sc, node);
    if (typeof v === 'number') return Math.round(v);
    const n = vnum(v);
    if (n === null) throw err((what || 'this value') + ' must be a known constant, but it has x or z bits', node);
    return n;
  }
  function constVal(W, sc, node) {
    const save = W.constMode; W.constMode = true;
    try {
      const t = typeOf(W, sc, node);
      if (t.r) return compileReal(W, sc, node)(null);
      return compile(W, sc, node, t.w, t.s)(null);
    } finally { W.constMode = save; }
  }
  E.constInt = constInt; E.constVal = constVal;

  /** the self-determined type of an expression: { w, s, r (real) } */
  function typeOf(W, sc, n) {
    let t = sc.tcache.get(n);
    if (!t) { t = typeOf1(W, sc, n); sc.tcache.set(n, t); }
    return t;
  }
  const max = Math.max;
  function typeOf1(W, sc, n) {
    switch (n.k) {
      case 'num': return { w: n.v.w, s: n.v.s };
      case 'real': return { w: 64, s: true, r: true };
      case 'str': return { w: max(8, n.s.length * 8), s: false };
      case 'id': {
        const sym = resolve(W, sc, n);
        if (sym.k === 'param' || sym.k === 'genvar') return sym.real ? { w: 64, s: true, r: true } : { w: sym.value.w, s: sym.value.s };
        if (sym.k === 'var') {
          if (sym.arr) throw err(n.name + ' is a memory; select a word with ' + n.name + '[index]', n);
          return sym.real ? { w: 64, s: true, r: true } : { w: sym.w, s: sym.signed };
        }
        if (sym.k === 'event') throw err(n.name + ' is an event; it can only be triggered (->) or waited for (@)', n);
        throw err(n.name + ' is ' + an(sym.k) + sym.k + ', not a value', n);
      }
      case 'index': case 'range': case 'ipart': return selType(W, sc, n);
      case 'un': {
        const a = typeOf(W, sc, n.a);
        if ('+-~'.includes(n.op) && n.op.length === 1) { if (a.r && n.op === '~') throw err('~ cannot be used on a real', n); return a; }
        if (a.r && n.op !== '!') throw err(n.op + ' cannot be used on a real', n);
        return { w: 1, s: false };
      }
      case 'bin': {
        const a = typeOf(W, sc, n.a), b = typeOf(W, sc, n.b), op = n.op;
        if (['==', '!=', '===', '!==', '<', '<=', '>', '>=', '&&', '||'].includes(op)) {
          if ((a.r || b.r) && (op === '===' || op === '!==')) throw err(op + ' cannot compare reals', n);
          return { w: 1, s: false };
        }
        if (['<<', '>>', '<<<', '>>>'].includes(op)) { if (a.r || b.r) throw err('shifts cannot be used on reals', n); return { w: a.w, s: a.s }; }
        if (op === '**') { if (a.r || b.r) return { w: 64, s: true, r: true }; return { w: a.w, s: a.s }; }
        if (a.r || b.r) { if ('&|^~'.includes(op[0]) || op === '%') throw err(op + ' cannot be used on reals', n); return { w: 64, s: true, r: true }; }
        return { w: max(a.w, b.w), s: a.s && b.s };
      }
      case 'cond': {
        const a = typeOf(W, sc, n.a), b = typeOf(W, sc, n.b);
        typeOf(W, sc, n.c);
        if (a.r || b.r) return { w: 64, s: true, r: true };
        return { w: max(a.w, b.w), s: a.s && b.s };
      }
      case 'concat': {
        let w = 0;
        for (const p of n.parts) { const t = typeOf(W, sc, p); if (t.r) throw err('a real cannot be part of a concatenation', p); if (p.k === 'num' && !p.sized && !p.plain) { /* unsized based literal: 32 bits */ } w += t.w; }
        return { w, s: false };
      }
      case 'repl': {
        const k = constInt(W, sc, n.n, 'a replication count');
        if (k < 0) throw err('a replication count cannot be negative', n.n);
        let w = 0; for (const p of n.parts) w += typeOf(W, sc, p).w;
        if (k === 0) return { w: 0, s: false, zero: true };
        return { w: w * k, s: false };
      }
      case 'call': return n.sys ? sysType(W, sc, n) : funcType(W, sc, n);
    }
    throw err('cannot use this here', n);
  }

  /** a select chain: the root name, the array indices, and at most one bit or part select */
  function selChain(n) {
    const chain = [];
    let b = n;
    while (b.k === 'index' || b.k === 'range' || b.k === 'ipart') { chain.unshift(b); b = b.base; }
    return { root: b, chain };
  }
  function selType(W, sc, n) {
    const { root, chain } = selChain(n);
    if (root.k !== 'id') throw err('only a named signal can be indexed here', n);
    const sym = resolve(W, sc, root);
    const nd = sym.arr ? sym.arr.dims.length : 0;
    if (chain.length < nd) throw err(root.name + ' is a memory with ' + nd + ' dimension' + (nd > 1 ? 's' : '') + '; select a whole word first', n);
    if (chain.slice(0, nd).some((c) => c.k !== 'index')) throw err('a memory word is selected with a single index like ' + root.name + '[i]', n);
    const rest = chain.slice(nd);
    if (rest.length > 1) throw err('only one bit or part select may follow ' + root.name, n);
    if (sym.real) { if (rest.length || nd) { if (rest.length) throw err('a real cannot be bit-selected', n); } return rest.length ? { w: 1, s: false } : { w: 64, s: true, r: true }; }
    const w0 = sym.k === 'var' ? sym.w : sym.value.w, s0 = sym.k === 'var' ? sym.signed : sym.value.s;
    if (!rest.length) return { w: w0, s: s0 };
    if (sym.k === 'var' && !sym.vector && sym.w === 1 && (sym.kind === 'reg' || NETKINDS.has(sym.kind))) throw err(root.name + ' is a single bit (declared without a range), so it cannot be indexed', n);
    const c = rest[0];
    if (c.k === 'index') return { w: 1, s: false };
    if (c.k === 'range') { const a = constInt(W, sc, c.msb, 'a part-select bound'), b = constInt(W, sc, c.lsb, 'a part-select bound'); return { w: Math.abs(a - b) + 1, s: false }; }
    const k = constInt(W, sc, c.width, 'the width of an indexed part-select');
    if (k <= 0) throw err('the width of a part-select must be positive', c.width);
    return { w: k, s: false };
  }

  // ---- name resolution --------------------------------------------------------------------------------------------
  function childKey(W, sc, p) { return p.idx ? p.name + '[' + constInt(W, sc, p.idx, 'a generate index') + ']' : p.name; }
  /** the scope a hierarchical prefix names, searching upward from sc */
  function findScope(W, sc, parts, node) {
    const k0 = childKey(W, sc, parts[0]);
    let s = null;
    for (let x = sc; x && !s; x = x.parent) {
      if (x.children.has(k0)) s = x.children.get(k0);
      else if (x.kind === 'module' && (x.name === k0 || (x.mod && x.mod.name === k0) && !parts[0].idx)) s = x;
    }
    if (!s) s = W.roots.find((r) => r.name === k0) || null;
    if (!s) throw err('cannot find ' + k0 + ' (in the name ' + parts.map((p) => p.name).join('.') + ')', node);
    for (let i = 1; i < parts.length; i++) {
      const key = childKey(W, sc, parts[i]);
      const c = s.children.get(key);
      if (!c) throw err(s.path + ' has nothing called ' + key, node);
      s = c;
    }
    return s;
  }
  E.findScope = findScope;
  function resolve(W, sc, n, quiet) {
    if (n._sym && n._symScope === sc) return n._sym;
    let sym;
    if (n.path) {
      const s = findScope(W, sc, n.path.slice(0, -1), n);
      sym = s.syms.get(n.path[n.path.length - 1].name);
      if (!sym) { if (quiet) return null; throw err(s.path + ' has no signal called ' + n.path[n.path.length - 1].name, n); }
    } else {
      sym = sc.lookup(n.name);
      if (!sym) {
        if (quiet) return null;
        if (W.constMode) throw err(n.name + ' is not declared (a constant expression can use only parameters and genvars)', n);
        throw err(n.name + ' is not declared', n);
      }
    }
    if (W.constMode && sym.k === 'var') throw err(n.name + ' is a variable, but a constant is needed here (use a parameter)', n);
    return sym;
  }
  E.resolve = resolve;

  // ---- building the instance tree -----------------------------------------------------------------------------------
  const NETKINDS = new Set(['wire', 'tri', 'wand', 'wor', 'triand', 'trior', 'supply0', 'supply1', 'tri0', 'tri1', 'trireg', 'uwire']);
  function newStore(W, path, w, kind, isNet) {
    const st = { path, w, kind, isNet, val: null, watch: [], drivers: null, wave: null, aliases: [path], arr: null, id: W.stores.length };
    W.stores.push(st);
    return st;
  }
  function paramValue(W, sc, pd, item, override) {
    // declared type wins over the value's own type
    let v = override !== undefined ? override : (pd.type === 'real' || pd.type === 'realtime' ? (() => { const t = typeOf(W, sc, item.expr); return t.r ? compileReal(W, sc, item.expr)(null) : V.toReal(compile(W, sc, item.expr, t.w, t.s)(null)); })() : constVal(W, sc, item.expr));
    if (pd.type === 'real' || pd.type === 'realtime') return { real: true, value: typeof v === 'number' ? v : V.toReal(v) };
    const as = (x, w, sg) => { const r = V.resize(x, w, x.s); return r.s === !!sg ? r : new V.Vec(r.w, r.a, r.b, !!sg); };
    if (pd.type === 'integer') return { value: typeof v === 'number' ? V.fromReal(v, 32, true) : as(v, 32, true) };
    if (pd.type === 'time') return { value: typeof v === 'number' ? V.fromReal(v, 64, false) : V.resize(v, 64, false) };
    if (pd.range) {
      const a = constInt(W, sc, pd.range.msb, 'a range bound'), b = constInt(W, sc, pd.range.lsb, 'a range bound');
      const w = Math.abs(a - b) + 1;
      return { value: typeof v === 'number' ? V.fromReal(v, w, pd.signed) : as(v, w, pd.signed), msb: a, lsb: b };
    }
    if (typeof v === 'number') return { real: true, value: v };
    if (override === undefined && !pd.signed) {
      // an untyped parameter keeps every bit its expression can produce (no carry is lost)
      const t = typeOf(W, sc, item.expr), lw = lossless(W, sc, item.expr);
      if (!t.r && lw > t.w) { const save = W.constMode; W.constMode = true; try { v = compile(W, sc, item.expr, lw, t.s)(null); } finally { W.constMode = save; } }
    }
    if (pd.signed && !v.s) v = new V.Vec(v.w, v.a, v.b, true);
    return { value: v };
  }
  function lossless(W, sc, n) {
    const t = typeOf(W, sc, n);
    if (t.r) return t.w;
    const L = (x) => lossless(W, sc, x);
    switch (n.k) {
      case 'bin':
        if (n.op === '+' || n.op === '-') return Math.max(L(n.a), L(n.b)) + 1;
        if (n.op === '*') return L(n.a) + L(n.b);
        if (n.op === '&' || n.op === '|' || n.op === '^' || n.op === '/' || n.op === '%') return Math.max(L(n.a), L(n.b), t.w);
        if (n.op === '<<' || n.op === '<<<') { try { return Math.min(4096, L(n.a) + Math.max(0, constInt(W, sc, n.b))); } catch (e) { return t.w; } }
        return t.w;
      case 'cond': return Math.max(L(n.a), L(n.b));
      case 'un': return n.op === '-' || n.op === '+' || n.op === '~' ? Math.max(L(n.a), t.w) : t.w;
    }
    return t.w;
  }
  function declareParam(W, sc, pd, overrides) {
    for (const item of pd.list) {
      if (sc.syms.has(item.name)) throw err(item.name + ' is declared twice in ' + sc.path, item);
      let ov;
      const key = sc.path + '.' + item.name;
      if (!pd.local) {
        if (W.defparams.has(key)) ov = W.defparams.get(key);
        else if (overrides && overrides.has(item.name)) ov = overrides.get(item.name);
      }
      const p = paramValue(W, sc, pd, item, ov);
      sc.syms.set(item.name, Object.assign({ k: 'param', name: item.name, decl: item }, p));
      if (overrides) overrides.used && overrides.used.add(item.name);
    }
  }
  function rangeOf(W, sc, r) {
    if (!r) return null;
    const msb = constInt(W, sc, r.msb, 'a range bound'), lsb = constInt(W, sc, r.lsb, 'a range bound');
    return { msb, lsb, w: Math.abs(msb - lsb) + 1 };
  }
  function declareVar(W, sc, d, item, kind, dir, rng, signed) {
    const name = item.name;
    let w, msb, lsb, real = false;
    if (kind === 'integer') { w = 32; msb = 31; lsb = 0; signed = true; }
    else if (kind === 'time') { w = 64; msb = 63; lsb = 0; }
    else if (kind === 'real' || kind === 'realtime') { real = true; w = 64; msb = 63; lsb = 0; }
    else if (rng) { w = rng.w; msb = rng.msb; lsb = rng.lsb; }
    else { w = 1; msb = 0; lsb = 0; }
    const vector = !!rng || kind === 'integer' || kind === 'time';
    if (w > 1 << 16) throw err(name + ' is too wide (' + w + ' bits)', item);
    const isNet = NETKINDS.has(kind);
    const sym = { k: kind === 'event' ? 'event' : 'var', name, w, msb, lsb, signed: !!signed, real, kind, isNet, dir: dir || null, decl: item, scope: sc, vector };
    if (item.dims && item.dims.length) {
      const dims = item.dims.map((r) => { const a = constInt(W, sc, r.msb, 'a memory bound'), b = constInt(W, sc, r.lsb, 'a memory bound'); return { a, b, lo: Math.min(a, b), n: Math.abs(a - b) + 1 }; });
      const size = dims.reduce((p, x) => p * x.n, 1);
      if (size > 1 << 20) throw err(name + ' has too many words (' + size + ')', item);
      sym.arr = { dims, size };
    }
    if (sc.auto) {
      const fs = autoOwner(sc);
      sym.slot = fs.nslots++;
      fs.slotSyms.push(sym);
      sym.auto = true;
    } else {
      const st = newStore(W, sc.path + '.' + name, w, kind, isNet);
      sym.st = st;
      st.real = real; st.signed = !!signed;
      if (sym.arr) { st.arr = sym.arr; st.words = new Array(sym.arr.size); st.val = null; }
      st.sym = sym;
      W.vars.push(sym);
    }
    sc.syms.set(name, sym);
    return sym;
  }
  const autoOwner = (sc) => { let s = sc; while (s.kind !== 'func' && s.kind !== 'task') s = s.parent; return s; };
  E.initValue = (sym) => (sym.real ? 0 : sym.kind === 'event' ? null : V.allX(sym.w, sym.signed));

  /** declarations of one item list (merging non-ANSI port and net/reg declarations) */
  function declareAll(W, sc, decls) {
    const merged = new Map(), order = [];
    for (const d of decls) {
      for (const item of d.names) {
        let m = merged.get(item.name);
        if (!m) { m = { item, dir: null, kind: null, range: null, signed: false, d, rangeScope: sc }; merged.set(item.name, m); order.push(item.name); }
        else {
          const dup = (d.dir && m.dir) || (d.kind && m.kind && !(m.kind === 'wire' && !m.explicitKind));
          if (dup) throw err(item.name + ' is declared twice', item);
          if (item.dims.length) m.item = Object.assign({}, m.item, { dims: item.dims });
          if (item.init) m.item = Object.assign({}, m.item, { init: item.init });
        }
        if (d.dir) m.dir = d.dir;
        if (d.kind) { m.kind = d.kind; m.explicitKind = true; }
        if (d.range) {
          if (m.range) {
            const a = rangeOf(W, sc, m.range), b = rangeOf(W, sc, d.range);
            if (a.msb !== b.msb || a.lsb !== b.lsb) throw err('the two declarations of ' + item.name + ' give different ranges [' + a.msb + ':' + a.lsb + '] and [' + b.msb + ':' + b.lsb + ']', item);
          }
          m.range = d.range;
        }
        if (d.signed) m.signed = true;
        if (d.delay) m.delay = d.delay;
      }
    }
    const out = [];
    for (const name of order) {
      const m = merged.get(name);
      const kind = m.kind || (m.dir ? (sc.inst.mod && sc.inst.mod.nettype && sc.inst.mod.nettype !== 'none' ? sc.inst.mod.nettype : 'wire') : 'wire');
      if (sc.syms.has(name)) throw err(name + ' is declared twice in ' + sc.path, m.item);
      if (m.dir && !sc.isTF && sc.kind !== 'module') throw err('ports can only be declared in a module, task or function', m.item);
      if (m.dir === 'input' && !NETKINDS.has(kind) && !sc.isTF) throw err('the input ' + name + ' cannot be ' + an(kind) + kind + '; inputs are nets (wire)', m.item);
      const sym = declareVar(W, sc, m.d, m.item, kind, m.dir, rangeOf(W, sc, m.range), m.signed);
      sym.delay = m.delay || null;
      out.push(sym);
    }
    return out;
  }

  /** process the items of a module or generate block into scope sc */
  function checkPorts(sc) {
    for (const p of sc.mod.ports) {
      if (!p.name) continue;
      const s = sc.syms.get(p.name);
      if (!s || !s.dir) throw err('the port ' + p.name + ' is listed in the header of ' + sc.mod.name + ' but has no input, output or inout declaration', p);
    }
  }
  E.checkPorts = checkPorts;
  function processItems(W, sc, items, overrides) {
    for (const it of items) {
      if (it.k === 'function' || it.k === 'task') {
        if (sc.syms.has(it.name)) throw err(it.name + ' is declared twice', it);
        const sym = { k: it.k === 'function' ? 'func' : 'task', name: it.name, decl: it, scope: sc };
        sc.syms.set(it.name, sym);
        W.deferred.push({ k: 'tf', sc, sym });
      }
    }
    for (const it of items) if (it.k === 'param') declareParam(W, sc, it, overrides);
    const decls = items.filter((it) => it.k === 'decl' && it.kind !== 'genvar');
    for (const it of items) if (it.k === 'decl' && it.kind === 'genvar') for (const n of it.names) sc.syms.set(n.name, { k: 'genvarDecl', name: n.name });
    const syms = declareAll(W, sc, decls);
    if (sc.kind === 'module') checkPorts(sc);
    for (const sym of syms) {
      if (sym.decl.init) W.deferred.push({ k: 'declInit', sc, sym, node: sym.decl.init });
    }
    let genN = 0;
    for (const it of items) {
      switch (it.k) {
        case 'param': case 'decl': case 'function': case 'task': break;
        case 'assign': case 'gate': case 'initial': case 'always': case 'defparam':
          W.deferred.push({ k: it.k, sc, node: it }); break;
        case 'inst': for (const one of it.insts) instItem(W, sc, it, one); break;
        case 'genfor': genN++; genFor(W, sc, it, genN); break;
        case 'genif': genN++; genIf(W, sc, it, genN); break;
        case 'gencase': genN++; genCase(W, sc, it, genN); break;
        case 'genblock': genN++; genBody(W, sc, { name: it.name, items: it.items }, genN, null); break;
        default: throw err('this item is not supported here', it);
      }
    }
  }
  function genBody(W, sc, body, n, idx) {
    if (!body) return;
    const name = (body.name || 'genblk' + n) + (idx != null ? '[' + idx + ']' : '');
    if (sc.children.has(name)) throw err('the generate block name ' + name + ' is used twice', body);
    const g = new Scope('gen', name, sc);
    if (idx != null) g.syms.set(body.genvar, { k: 'genvar', name: body.genvar, value: V.fromInt(idx, 32, true) });
    processItems(W, g, body.items, null);
  }
  function genFor(W, sc, it, n) {
    const gv = sc.lookup(it.v);
    if (!gv || (gv.k !== 'genvarDecl' && gv.k !== 'genvar')) throw err(it.v + ' must be declared as a genvar before this generate loop', it);
    if (it.v2 !== it.v) throw err('the generate loop must step its own genvar ' + it.v, it);
    if (!it.body.name) W.warnings.push({ line: it.line, col: it.col, msg: 'give this generate loop block a name (begin : name) so its signals can be found' });
    let i = constInt(W, sc, it.init, 'the generate loop start');
    const seen = new Set();
    for (let guard = 0; ; guard++) {
      if (guard > 100000) throw err('this generate loop does not end', it);
      const t = Object.assign(Object.create(Scope.prototype), { kind: 'gen', name: '__tmp', parent: sc, inst: sc.inst, path: sc.path, syms: new Map(), children: new Map(), tcache: new Map(), auto: false });
      t.syms.set(it.v, { k: 'genvar', name: it.v, value: V.fromInt(i, 32, true) });
      const c = constVal(W, t, it.cond);
      if (V.truth(typeof c === 'number' ? V.fromReal(c, 32, true) : c) !== 1) break;
      if (seen.has(i)) throw err('the generate loop repeats the value ' + i + ' of ' + it.v, it);
      seen.add(i);
      genBody(W, sc, Object.assign({ genvar: it.v }, it.body), n, i);
      i = constInt(W, t, it.step, 'the generate loop step');
    }
  }
  function genIf(W, sc, it, n) {
    const c = constVal(W, sc, it.cond);
    const on = V.truth(typeof c === 'number' ? V.fromReal(c, 32, true) : c) === 1;
    const body = on ? it.then : it.else;
    if (!body) return;
    // else if chains share one generate number and do not add a scope level
    if (body.items.length === 1 && !body.name && (body.items[0].k === 'genif' || body.items[0].k === 'gencase') && body.line === undefined) {
      const inner = body.items[0];
      if (inner.k === 'genif') return genIf(W, sc, inner, n);
      return genCase(W, sc, inner, n);
    }
    genBody(W, sc, body, n, null);
  }
  function genCase(W, sc, it, n) {
    const t = typeOf(W, sc, it.expr);
    const v = constVal(W, sc, it.expr);
    let pick = null;
    for (const arm of it.arms) {
      if (!arm.exprs) continue;
      for (const e of arm.exprs) {
        const te = typeOf(W, sc, e), w = Math.max(t.w, te.w), s = t.s && te.s;
        if (V.cmp.ceq(V.resize(v, w, s), V.resize(constVal(W, sc, e), w, s)).a === B1) { pick = arm; break; }
      }
      if (pick) break;
    }
    if (!pick) pick = it.arms.find((a) => !a.exprs) || null;
    if (pick) genBody(W, sc, pick.body, n, null);
  }

  function instItem(W, sc, it, one) {
    const mod = W.modules.get(it.module);
    const udp = !mod && W.udps.get(it.module);
    if (!mod && !udp) {
      const near = [...W.modules.keys()].find((m) => m.toLowerCase() === it.module.toLowerCase());
      throw err('there is no module called ' + it.module + (near ? ' (did you mean ' + near + '?)' : ''), it);
    }
    if (udp) { W.deferred.push({ k: 'udpinst', sc, node: it, one, udp }); return; }
    if (!one.name) throw err('the instance of ' + it.module + ' needs a name', one);
    if (W.depth > 60) throw err('module ' + it.module + ' instantiates itself (directly or through others)', it);
    let names = [one.name], idxs = [null];
    if (one.range) {
      const a = constInt(W, sc, one.range.msb), b = constInt(W, sc, one.range.lsb);
      names = []; idxs = [];
      for (let i = a; a >= b ? i >= b : i <= b; i += a >= b ? -1 : 1) { names.push(one.name + '[' + i + ']'); idxs.push(i); }
    }
    names.forEach((nm, j) => {
      if (sc.children.has(nm) || sc.syms.has(nm)) throw err('the name ' + nm + ' is used twice in ' + sc.path, one);
      // parameter overrides, evaluated in the parent's scope
      const ov = new Map();
      if (it.params) {
        const plist = mod.params.flatMap((p) => p.list.map((x) => x.name)).concat(mod.items.filter((x) => x.k === 'param' && !x.local).flatMap((p) => p.list.map((x) => x.name)));
        if (it.params.ordered) {
          if (it.params.ordered.length > plist.length) throw err(it.module + ' has ' + plist.length + ' parameter' + (plist.length === 1 ? '' : 's') + ' but ' + it.params.ordered.length + ' values are given', it);
          it.params.ordered.forEach((e, i) => ov.set(plist[i], paramOverride(W, sc, e)));
        } else for (const p of it.params.named) {
          if (!plist.includes(p.name)) throw err(it.module + ' has no parameter called ' + p.name, p);
          if (p.expr) ov.set(p.name, paramOverride(W, sc, p.expr));
        }
      }
      W.depth++;
      const child = new Scope('module', nm, sc, { mod, unit: mod.timescale ? mod.timescale.unit : W.defUnit, prec: mod.timescale ? mod.timescale.prec : W.defPrec, instNode: one, instItem: it, arrIdx: idxs[j], arrCount: names.length, arrPos: j });
      W.instances.push(child);
      processItems(W, child, withHeaderParams(mod), ov);
      W.depth--;
    });
  }
  function paramOverride(W, sc, e) {
    const t = typeOf(W, sc, e);
    if (t.r) return compileReal(W, sc, e)(null);
    const save = W.constMode; W.constMode = true;
    try { return compile(W, sc, e, t.w, t.s)(null); } finally { W.constMode = save; }
  }
  const withHeaderParams = (mod) => mod._items || (mod._items = mod.params.concat(mod.items));
  E.withHeaderParams = withHeaderParams;

  // ---- the design ------------------------------------------------------------------------------------------------
  /** build everything for a run: the instance tree, the compiled processes, and a fresh kernel */
  function build(parsed, topNames, opts) {
    opts = opts || {};
    const W = {
      modules: new Map(parsed.modules.map((m) => [m.name, m])), udps: new Map(parsed.udps.map((u) => [u.name, u])),
      errors: [], warnings: [], roots: [], instances: [], stores: [], vars: [], deferred: [], defparams: new Map(), depth: 0,
      procs: [], assigns: [], files: opts.files || {}, constMode: false, opts,
    };
    // the global time precision is the finest of all modules; modules without `timescale use 1s/1s
    const scales = parsed.modules.map((m) => m.timescale).filter(Boolean);
    W.defUnit = 0; W.defPrec = 0;
    W.P = Math.min(0, ...scales.map((t) => t.prec));
    if (scales.length === parsed.modules.length && scales.length) W.P = Math.min(...scales.map((t) => t.prec));
    for (let pass = 0; pass < 6; pass++) {
      W.roots = []; W.instances = []; W.stores = []; W.vars = []; W.deferred = []; W.errors = []; W.warnings = []; W.funcs = new Map();
      W.procs = []; W.assigns = []; W.portConns = []; W.gateList = []; W.udpList = []; W.blockScopes = new Map();
      W.K = new V.Kernel(W);
      try {
        for (const t of topNames) {
          const mod = W.modules.get(t);
          if (!mod) throw err('there is no module called ' + t, null);
          const sc = new Scope('module', t, null, { mod, unit: mod.timescale ? mod.timescale.unit : 0, prec: mod.timescale ? mod.timescale.prec : 0 });
          W.roots.push(sc); W.instances.push(sc);
          processItems(W, sc, withHeaderParams(mod), new Map());
        }
        // defparams change parameters, so the tree is built again until they settle
        let changed = false;
        for (const d of W.deferred.filter((x) => x.k === 'defparam')) {
          for (const p of d.node.list) {
            const parts = p.path.path || [{ name: p.path.name }];
            if (parts.length < 2) throw err('defparam needs a hierarchical name like u1.WIDTH', p);
            const s = findScope(W, d.sc, parts.slice(0, -1), p);
            const pname = parts[parts.length - 1].name;
            const sym = s.syms.get(pname);
            if (!sym || sym.k !== 'param') throw err(s.path + ' has no parameter called ' + pname, p);
            if (sym.decl && s.mod && s.mod.items.some((x) => x.k === 'param' && x.local && x.list.includes(sym.decl))) throw err(pname + ' is a localparam and cannot be changed by defparam', p);
            const val = paramOverride(W, d.sc, p.expr);
            const key = s.path + '.' + pname, old = W.defparams.get(key);
            if (old === undefined || (typeof val === 'number' ? old !== val : !(old instanceof V.Vec && old.eq(val)))) { W.defparams.set(key, val); changed = true; }
          }
        }
        if (changed) continue;
        compileAll(W);
      } catch (e) {
        if (!(e instanceof V.VError)) throw e;
        W.errors.push({ line: e.line, col: e.col, msg: e.message, file: e.file });
      }
      break;
    }
    return W;
  }
  E.build = build;

  function compileAll(W) {
    const K = W.K;
    // ports first (top-down, so aliases chain), then implicit nets, then everything else
    for (const inst of W.instances) if (inst.instNode) connectPorts(W, inst);
    const order = ['tf', 'blocks', 'declInit', 'assign', 'gate', 'udpinst', 'initial'];
    for (const d of W.deferred) {
      try {
        if (d.k === 'initial' || d.k === 'always') V.Stmt.prepBlocks(W, d.sc, d.node.body);
        if (d.k === 'tf') { V.Expr.tfInfo(W, d.sym); V.Stmt.prepBlocks(W, d.sym.info.scope, d.sym.decl.body); }
      } catch (e) { if (!(e instanceof V.VError)) throw e; W.errors.push({ line: e.line, col: e.col, msg: e.message, file: e.file }); }
    }
    for (const kind of order) for (const d of W.deferred) {
      if (d.k !== kind && !(kind === 'initial' && d.k === 'always')) continue;
      try {
        if (kind === 'tf') { const info = V.Expr.tfInfo(W, d.sym); if (d.sym.k === 'func') { if (!info.bodyFn) info.bodyFn = V.Stmt.compileFuncBody(W, info); } else V.Stmt.taskBodyOf(W, info)(); }
        else if (kind === 'blocks') { /* named block scopes come first, so names in them can be found */ }
        else if (kind === 'declInit') declInit(W, d);
        else if (kind === 'assign') for (const a of d.node.list) contAssign(W, d.sc, a.lhs, a.rhs, d.node.delay, a);
        else if (kind === 'gate') gateInst(W, d.sc, d.node);
        else if (kind === 'udpinst') udpInst(W, d.sc, d.node, d.one, d.udp);
        else if (kind === 'initial' || kind === 'always') process(W, d.sc, d.node);
      } catch (e) {
        if (!(e instanceof V.VError)) throw e;
        W.errors.push({ line: e.line, col: e.col, msg: e.message, file: e.file });
        if (W.errors.length > 30) return;
      }
    }
    E.checkDrivers(W);
    if (V.Lint && !W.errors.length) V.Lint.run(W);
  }

  function declInit(W, d) {
    const sym = d.sym;
    if (sym.isNet) { contAssign(W, d.sc, { k: 'id', name: sym.name, line: d.node.line, col: d.node.col, _sym: sym, _symScope: d.sc }, d.node, sym.delay, d.node); return; }
    if (sym.arr) throw err('a memory cannot be given a value in its declaration', d.node);
    // a variable initialiser: set before time 0
    const t = typeOf(W, d.sc, d.node);
    let v;
    if (sym.real) v = t.r ? compileReal(W, d.sc, d.node)(null) : V.toReal(compile(W, d.sc, d.node, t.w, t.s)(null));
    else v = t.r ? V.fromReal(compileReal(W, d.sc, d.node)(null), sym.w, sym.signed) : V.resize(compile(W, d.sc, d.node, Math.max(t.w, sym.w), t.s)(null), sym.w, sym.signed);
    sym.st.init = v;
  }


  // the other parts live in vlog-expr.js, vlog-stmt.js and vlog-net.js, looked up when used
  const compile = (...a) => V.Expr.compile(...a), compileReal = (...a) => V.Expr.compileReal(...a);
  const sysType = (...a) => V.Expr.sysType(...a), funcType = (...a) => V.Expr.funcType(...a), lvalue = (...a) => V.Expr.lvalue(...a);
  const process = (...a) => V.Stmt.process(...a);
  const contAssign = (...a) => V.Net.contAssign(...a), gateInst = (...a) => V.Net.gateInst(...a), udpInst = (...a) => V.Net.udpInst(...a);
  const connectPorts = (...a) => V.Net.connectPorts(...a);
  E.checkDrivers = (W) => V.Net.checkDrivers(W);
  E.typeOf = typeOf; E.newStore = newStore; E.declareAll = declareAll; E.declareParam = declareParam; E.rangeOf = rangeOf;
  E.selChain = selChain; E.vnum = vnum; E.NETKINDS = NETKINDS;
})(globalThis.Sirkit = globalThis.Sirkit || {});
