// The netlist: parts with typed, named pins (direction, bit width, side of the symbol), and nets that join
// pins. One driver per net. Also a small helper that turns Boolean expressions into gate circuits, two-level
// (AND-OR, NAND-NAND, OR-AND, NOR-NOR) or multi-level, and NAND-only or NOR-only.
(function (S) {
  'use strict';
  /** 'a' or 'an' before a word as it is read aloud (an AND, an xor, an 8-bit, a NAND, a reg) */
  const an = (w) => (/^(?:[aeiou]|x(?:n?or)\b|nmos|rnmos|rtran|rcmos|rpmos|8|11(?!\d)|18(?!\d))/i.test(String(w)) ? 'an ' : 'a ');
  const N = S.Netlist = {};
  const GATES = new Set(['NOT', 'BUF', 'AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR']);
  const COMMUTATIVE = new Set(['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR']);
  const SEQUENTIAL = new Set(['DFF', 'JKFF', 'TFF', 'LATCH', 'REG', 'COUNTER']);
  N.GATES = GATES; N.COMMUTATIVE = COMMUTATIVE; N.SEQUENTIAL = SEQUENTIAL;
  const log2 = (n) => Math.max(1, Math.ceil(Math.log2(n)));

  const pin = (name, dir, o) => Object.assign({ name, dir, width: 1, side: dir === 'in' ? 'left' : 'right', label: null, clock: false }, o || {});

  /** the pins of a part of the given type and parameters, in drawing order on each side; part types the
   *  parts library (Sirkit.Parts) defines, and the extra pins its parameters add, come from there */
  function pinsOf(type, p) {
    const ext = S.Parts && S.Parts.pinsOf && S.Parts.pinsOf(type, p || {}, basePins);
    return ext || basePins(type, p || {});
  }
  function basePins(type, p) {
    if (GATES.has(type)) {
      const n = type === 'NOT' || type === 'BUF' ? 1 : (p.n || 2);
      const out = [];
      for (let i = 0; i < n; i++) out.push(pin('i' + i, 'in'));
      out.push(pin('y', 'out'));
      return out;
    }
    switch (type) {
      case 'IN': return [pin('y', 'out', { width: p.w || 1 })];
      case 'CLOCK': return [pin('y', 'out')];
      case 'CONST': return [pin('y', 'out', { width: p.w || 1 })];
      case 'OUT': return [pin('a', 'in', { width: p.w || 1 })];
      case 'MUX': {
        const n = p.n || 2, k = log2(n), w = p.w || 1, out = [];
        for (let i = 0; i < n; i++) out.push(pin('d' + i, 'in', { width: w, label: String(i) }));
        if (p.selBus) out.push(pin('s', 'in', { width: k, side: 'bottom' }));
        else for (let i = k - 1; i >= 0; i--) out.push(pin('s' + i, 'in', { side: 'bottom' }));
        if (p.en) out.push(pin('en', 'in', { side: 'top' }));
        out.push(pin('y', 'out', { width: w }));
        return out;
      }
      case 'DECODER': {
        const k = p.k || 2, out = [];
        for (let i = 0; i < k; i++) out.push(pin('a' + i, 'in', { label: 'A' + i }));
        if (p.en) out.push(pin('en', 'in', { label: 'EN' }));
        for (let i = 0; i < 1 << k; i++) out.push(pin('y' + i, 'out', { label: 'Y' + i }));
        return out;
      }
      case 'FA': return [pin('cin', 'in', { label: 'Cin' }), pin('a', 'in', { label: 'A' }), pin('b', 'in', { label: 'B' }), pin('s', 'out', { label: 'S' }), pin('cout', 'out', { label: 'Cout' })];
      case 'DFF': case 'JKFF': case 'TFF': {
        const ins = type === 'DFF' ? ['d'] : type === 'TFF' ? ['t'] : ['j'];
        const out = ins.map((n) => pin(n, 'in', { label: n.toUpperCase() }));
        out.push(pin('clk', 'in', { clock: true }));
        if (type === 'JKFF') out.push(pin('k', 'in', { label: 'K' }));
        if (p.set) out.push(pin('set', 'in', { side: 'top', label: 'S' }));
        if (p.reset) out.push(pin('rst', 'in', { side: 'bottom', label: 'R' }));
        out.push(pin('q', 'out', { label: 'Q' }));
        if (p.qn !== false) out.push(pin('qn', 'out', { label: "Q'" }));
        return out;
      }
      case 'LATCH': {
        const out = [pin('d', 'in', { label: 'D' }), pin('en', 'in', { label: 'EN' }), pin('q', 'out', { label: 'Q' })];
        if (p.qn !== false) out.push(pin('qn', 'out', { label: "Q'" }));
        return out;
      }
      case 'REG': {
        const w = p.w || 4, out = [pin('d', 'in', { width: w, label: 'D' })];
        if (p.ld) out.push(pin('ld', 'in', { label: 'LD' }));
        out.push(pin('clk', 'in', { clock: true }));
        if (p.clr) out.push(pin('clr', 'in', { side: 'bottom', label: 'CLR' }));
        out.push(pin('q', 'out', { width: w, label: 'Q' }));
        return out;
      }
      case 'COUNTER': {
        const w = p.w || 4, out = [];
        if (p.en) out.push(pin('en', 'in', { label: 'EN' }));
        if (p.ld) out.push(pin('ld', 'in', { label: 'LD' }), pin('d', 'in', { width: w, label: 'D' }));
        out.push(pin('clk', 'in', { clock: true }));
        if (p.clr) out.push(pin('clr', 'in', { side: 'bottom', label: 'CLR' }));
        out.push(pin('q', 'out', { width: w, label: 'Q' }));
        if (p.co) out.push(pin('co', 'out', { label: 'CO' }));
        return out;
      }
      case 'ALU': return [pin('a', 'in', { width: p.w || 8, label: 'A' }), pin('b', 'in', { width: p.w || 8, label: 'B' }), pin('op', 'in', { width: p.opw || 2, side: 'bottom', label: 'OP' }), pin('y', 'out', { width: p.w || 8, label: 'Y' })];
      case 'BLOCK': {
        const one = (d) => (x) => (typeof x === 'string' ? pin(x, d, { label: x }) : pin(x.name, d, Object.assign({ label: x.name }, x)));
        return (p.inputs || []).map(one('in')).concat((p.outputs || []).map(one('out')));
      }
    }
    throw new Error('unknown part type ' + type);
  }
  N.pinsOf = pinsOf;

  class Circuit {
    constructor(title) { this.title = title; this.parts = []; this.nets = []; this.byId = new Map(); this.count = {}; }
    /** add a part; returns it, with .pin(name) giving a reference to one of its pins */
    add(type, params, id) {
      params = params || {};
      const t = type.toLowerCase();
      if (!id) { this.count[t] = (this.count[t] || 0) + 1; id = t + this.count[t]; while (this.byId.has(id)) id = t + (++this.count[t]); }
      if (this.byId.has(id)) throw new Error('duplicate part id ' + id);
      const part = { id, type, params, pins: pinsOf(type, params), net: {}, open: new Set() };
      part.pin = (name) => { if (!part.pins.some((q) => q.name === name)) throw new Error(id + ' has no pin ' + name); return { part, pin: name }; };
      this.parts.push(part); this.byId.set(id, part);
      return part;
    }
    input(name, w) { return this.add('IN', { name, w: w || 1 }, 'in_' + name); }
    output(name, w) { return this.add('OUT', { name, w: w || 1 }, 'out_' + name); }
    clock(name) { return this.add('CLOCK', { name: name || 'CLK' }, 'clk_' + (name || 'CLK')); }
    constant(v, w) { return this.add('CONST', { value: v, w: w || 1 }); }
    gate(type, n, id) { return this.add(type, type === 'NOT' || type === 'BUF' ? {} : { n: n || 2 }, id); }
    /** a pin reference: {part, pin}, or a part (its only output, or its only input) */
    ref(r, dir) {
      if (r && r.part) return r;
      const ps = r.pins.filter((q) => q.dir === dir);
      if (ps.length === 1) return { part: r, pin: ps[0].name };
      if (dir === 'out' && r.pins.some((q) => q.name === 'y')) return { part: r, pin: 'y' };
      throw new Error('ambiguous pin on ' + r.id);
    }
    /** join a driver to sinks: connect(from, to...) */
    connect(from, ...tos) {
      const a = this.ref(from, 'out');
      let net = a.part.net[a.pin];
      if (!net) {
        const pd = a.part.pins.find((q) => q.name === a.pin);
        net = { id: 'n' + (this.nets.length + 1), name: null, width: pd.width, pins: [a], show: false };
        if (a.part.type === 'IN' || a.part.type === 'CLOCK') net.name = a.part.params.name;
        if (a.part.names && a.part.names[a.pin]) Object.assign(net, a.part.names[a.pin]);
        this.nets.push(net); a.part.net[a.pin] = net;
      }
      for (const t of tos) {
        const b = this.ref(t, 'in');
        if (b.part.net[b.pin]) throw new Error(b.part.id + '.' + b.pin + ' is already connected');
        net.pins.push(b); b.part.net[b.pin] = net;
      }
      return net;
    }
    /** name a net (by any pin on it), shown on the drawing when show is true */
    name(r, name, show) {
      const a = r.part ? r : this.ref(r, 'out'), net = a.part.net[a.pin];
      if (net) { net.name = name; net.show = show !== false; } else (a.part.names = a.part.names || {})[a.pin] = { name, show: show !== false };
      return net;
    }
    netOf(r) { const a = r.part ? r : this.ref(r, 'out'); return a.part.net[a.pin]; }
    /** a pin left open on purpose */
    leaveOpen(r) { r.part.open.add(r.pin); }
    /** problems: nets with no or two drivers, width mismatches, pins neither connected nor left open */
    validate() {
      const out = [];
      for (const n of this.nets) {
        const drivers = n.pins.filter((r) => r.part.pins.find((q) => q.name === r.pin).dir === 'out');
        if (drivers.length !== 1) out.push('net ' + n.id + ' has ' + drivers.length + ' drivers');
        for (const r of n.pins) { const w = r.part.pins.find((q) => q.name === r.pin).width; if (w !== n.width) out.push(r.part.id + '.' + r.pin + ' is ' + w + ' bits on ' + an(n.width) + n.width + '-bit net'); }
      }
      for (const p of this.parts) for (const q of p.pins) if (!p.net[q.name] && !p.open.has(q.name)) out.push(p.id + '.' + q.name + ' is not connected');
      return out;
    }
  }
  N.Circuit = Circuit;
  N.isSequential = (part) => SEQUENTIAL.has(part.type) || !!(part.params && part.params.seq);

  // ---- expressions ------------------------------------------------------------------------------------------
  // A'B + C(D + E)'  ~a & b | c  A·B  X ^ Y : postfix ' and prefix ~ ! for NOT, juxtaposition, * · & for AND,
  // ^ for XOR (between AND and OR), + | for OR, 0 and 1. A variable is a letter followed by digits.
  function parse(src) {
    const toks = [];
    for (let i = 0; i < src.length;) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[A-Za-z]/.test(ch)) { let j = i + 1; while (j < src.length && /[0-9_]/.test(src[j])) j++; toks.push({ t: 'v', v: src.slice(i, j) }); i = j; continue; }
      if (/[01]/.test(ch)) { toks.push({ t: 'c', v: +ch }); i++; continue; }
      if ("'’+|^*·&~!()".includes(ch)) { toks.push({ t: ch === '’' ? "'" : ch === '|' ? '+' : ch === '·' || ch === '&' ? '*' : ch === '!' ? '~' : ch }); i++; continue; }
      throw new Error('unexpected "' + ch + '" in ' + src);
    }
    let k = 0;
    const peek = () => toks[k] && toks[k].t, take = () => toks[k++];
    const flat = (op, args) => (args.length === 1 ? args[0] : { op, args: args.flatMap((a) => (a.op === op ? a.args : [a])) });
    function orE() { const a = [xorE()]; while (peek() === '+') { take(); a.push(xorE()); } return flat('or', a); }
    function xorE() { const a = [andE()]; while (peek() === '^') { take(); a.push(andE()); } return flat('xor', a); }
    function andE() { const a = [notE()]; for (;;) { if (peek() === '*') { take(); a.push(notE()); } else if (['v', 'c', '(', '~'].includes(peek())) a.push(notE()); else break; } return flat('and', a); }
    function notE() {
      let e;
      if (peek() === '~') { take(); e = { op: 'not', a: notE() }; return post(e); }
      const t = take();
      if (!t) throw new Error('unexpected end of ' + src);
      if (t.t === 'v') e = { op: 'var', name: t.v };
      else if (t.t === 'c') e = { op: 'const', v: t.v };
      else if (t.t === '(') { e = orE(); if (take()?.t !== ')') throw new Error('missing ) in ' + src); }
      else throw new Error('unexpected ' + t.t + ' in ' + src);
      return post(e);
    }
    function post(e) { while (peek() === "'") { take(); e = { op: 'not', a: e }; } return e; }
    const e = orE();
    if (k < toks.length) throw new Error('unexpected ' + toks[k].t + ' in ' + src);
    return e;
  }
  N.parse = parse;
  const vars = (e, s) => { s = s || new Set(); if (e.op === 'var') s.add(e.name); else if (e.op === 'not') vars(e.a, s); else if (e.args) e.args.forEach((x) => vars(x, s)); return s; };
  N.vars = vars;
  /** the value of an expression for an assignment {A: 0|1, ...} */
  function evaluate(e, env) {
    switch (e.op) {
      case 'var': return env[e.name] ? 1 : 0;
      case 'const': return e.v;
      case 'not': return 1 - evaluate(e.a, env);
      case 'and': return e.args.every((x) => evaluate(x, env)) ? 1 : 0;
      case 'or': return e.args.some((x) => evaluate(x, env)) ? 1 : 0;
      case 'xor': return e.args.reduce((s, x) => s ^ evaluate(x, env), 0);
    }
    throw new Error('bad node');
  }
  N.evaluate = evaluate;
  const key = (e) => (e.op === 'var' ? e.name : e.op === 'const' ? String(e.v) : e.op === 'not' ? '~' + key(e.a) : e.op + '(' + e.args.map(key).sort().join(',') + ')');

  /**
   * Gate circuit for one or more outputs, {F: 'A'B + C', G: ...}. style:
   *   'multi'     the expression's own structure, shared subexpressions built once (the default)
   *   'and-or', 'nand-nand' for sums of products; 'or-and', 'nor-nor' for products of sums
   *   'nand', 'nor'  multi-level with one gate type only
   * opts.inputs fixes the order of the input ports; opts.circuit adds to an existing circuit.
   */
  function fromExpressions(title, outputs, style, opts) {
    opts = opts || {};
    style = style || 'multi';
    const c = opts.circuit || new Circuit(title);
    const asts = Object.entries(outputs).map(([k, s]) => [k, typeof s === 'string' ? parse(s) : s]);
    const names = opts.inputs || [...new Set(asts.flatMap(([, e]) => [...vars(e)]))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const inp = {};
    for (const v of names) inp[v] = opts.ports && opts.ports[v] ? opts.ports[v] : c.input(v);
    const memo = new Map();
    const once = (k, make) => { if (!memo.has(k)) memo.set(k, make()); return memo.get(k); };
    const gate = (type, ins) => { const g = c.gate(type, ins.length); ins.forEach((s, i) => c.connect(s, g.pin('i' + i))); return g.pin('y'); };
    const notOf = (s, k) => once('NOT:' + k, () => gate('NOT', [s]));
    const constant = (v) => once('C' + v, () => c.constant(v).pin('y'));
    const lit = (e) => (e.op === 'var' ? inp[e.name].pin('y') : e.op === 'const' ? constant(e.v) : notOf(inp[e.a.name].pin('y'), e.a.name));
    const isLit = (e) => e.op === 'var' || e.op === 'const' || (e.op === 'not' && e.a.op === 'var');
    const negLit = (e) => (e.op === 'var' ? notOf(inp[e.name].pin('y'), e.name) : e.op === 'const' ? constant(1 - e.v) : inp[e.a.name].pin('y'));

    function multi(e) {
      if (isLit(e)) return lit(e);
      return once(key(e), () => {
        if (e.op === 'not') { const inner = e.a; if (inner.op === 'not') return multi(inner.a); const t = { and: 'NAND', or: 'NOR', xor: 'XNOR' }[inner.op]; return gate(t, inner.args.map(multi)); }
        return gate({ and: 'AND', or: 'OR', xor: 'XOR' }[e.op], e.args.map(multi));
      });
    }
    // one gate type only: get(e, true) computes e, get(e, false) its complement
    function single(e, pos, T) {
      const nand = T === 'NAND';
      return once(T + (pos ? '+' : '-') + key(e), () => {
        if (e.op === 'var') return pos ? inp[e.name].pin('y') : gate(T, [inp[e.name].pin('y'), inp[e.name].pin('y')]);
        if (e.op === 'const') return constant(pos ? e.v : 1 - e.v);
        if (e.op === 'not') return single(e.a, !pos, T);
        if (e.op === 'xor') throw new Error('XOR in a single-gate-type circuit');
        const direct = nand ? (e.op === 'and' ? !pos : pos) : (e.op === 'or' ? !pos : pos);
        if (direct) return gate(T, e.args.map((x) => single(x, (nand ? e.op === 'and' : e.op === 'or') ? true : false, T)));
        const inv = single(e, !pos, T);
        return gate(T, [inv, inv]);
      });
    }
    function twoLevel(e, kind) {
      const sop = kind === 'and-or' || kind === 'nand-nand', inv = kind === 'nand-nand' || kind === 'nor-nor';
      const outer = sop ? 'or' : 'and', inner = sop ? 'and' : 'or';
      const terms = e.op === outer ? e.args : [e];
      const ins = terms.map((t) => {
        if (isLit(t)) return inv ? negLit(t) : lit(t);
        if (t.op !== inner || !t.args.every(isLit)) throw new Error('not a two-level form: ' + key(e));
        return once(kind + ':' + key(t), () => gate(inv ? (sop ? 'NAND' : 'NOR') : inner.toUpperCase(), t.args.map(lit)));
      });
      if (ins.length === 1) return inv ? gate(sop ? 'NAND' : 'NOR', [ins[0], ins[0]]) : ins[0];
      return gate(inv ? (sop ? 'NAND' : 'NOR') : outer.toUpperCase(), ins);
    }
    for (const [name, e] of asts) {
      let s;
      if (style === 'multi') s = multi(e);
      else if (style === 'nand' || style === 'nor') s = single(e, true, style.toUpperCase());
      else s = twoLevel(e, style);
      const o = opts.outPorts && opts.outPorts[name] ? opts.outPorts[name] : c.output(name);
      c.connect(s, o.part ? o : o.pin('a'));
    }
    return c;
  }
  N.fromExpressions = fromExpressions;
  N.fromExpression = (title, e, style, opts) => fromExpressions(title, { F: e }, style, opts);
})(globalThis.Sirkit = globalThis.Sirkit || {});
