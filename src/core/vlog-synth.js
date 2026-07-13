// Synthesis of the synthesisable subset of Verilog to a Netlist.Circuit. The design is run symbolically, bit by
// bit, into a shared graph of AND, OR, XOR, NOT, multiplexer and full-adder nodes (simplified as it is built):
// continuous assignments and combinational always blocks give logic, clocked always blocks give D flip-flops
// (with asynchronous set and reset taken from the if that tests the reset), variables not assigned on every
// path of a combinational block give latches. The graph then becomes parts: gates, MUX, FA, DFF, LATCH, with
// SPLIT and MERGE on bus ports. A trace says what each piece of code became; code that cannot be built
// gives reasons with line and column.
(function (S) {
  'use strict';
  const V = S.Verilog = S.Verilog || {};
  const Y = V.Synth = {};
  class NotSynth extends Error { constructor(msg, node) { super(msg); this.line = node ? node.line : 0; this.col = node ? node.col : 0; } }
  Y.NotSynth = NotSynth;
  const no = (msg, node) => { throw new NotSynth(msg, node); };

  // ---- the bit graph -----------------------------------------------------------------------------------------------
  class Dag {
    constructor() { this.n = [{ op: '0' }, { op: '1' }]; this.key = new Map(); }
    leaf(op, info) { this.n.push(Object.assign({ op }, info)); return this.n.length - 1; }
    hash(op, a, b, c) {
      const k = op + ',' + a + ',' + b + ',' + c;
      let id = this.key.get(k);
      if (id === undefined) { this.n.push({ op, a, b, c }); id = this.n.length - 1; this.key.set(k, id); }
      return id;
    }
    isNot(x, y) { const n = this.n[x]; return n.op === 'not' && n.a === y; }
    not(a) { if (a < 2) return 1 - a; const n = this.n[a]; if (n.op === 'not') return n.a; return this.hash('not', a); }
    and(a, b) {
      if (a > b) [a, b] = [b, a];
      if (a === 0) return 0; if (a === 1) return b; if (a === b) return a;
      if (this.isNot(a, b) || this.isNot(b, a)) return 0;
      return this.hash('and', a, b);
    }
    or(a, b) {
      if (a > b) [a, b] = [b, a];
      if (a === 1) return 1; if (a === 0) return b; if (a === b) return a;
      if (this.isNot(a, b) || this.isNot(b, a)) return 1;
      return this.hash('or', a, b);
    }
    xor(a, b) {
      if (a > b) [a, b] = [b, a];
      if (a === 0) return b; if (a === 1) return this.not(b); if (a === b) return 0;
      if (this.isNot(a, b) || this.isNot(b, a)) return 1;
      const na = this.n[a], nb = this.n[b];
      if (na.op === 'not' && nb.op === 'not') return this.xor(na.a, nb.a);
      if (na.op === 'not') return this.not(this.xor(na.a, b));
      if (nb.op === 'not') return this.not(this.xor(a, nb.a));
      return this.hash('xor', a, b);
    }
    /** s ? d1 : d0 */
    mux(s, d0, d1) {
      if (s === 0) return d0; if (s === 1) return d1; if (d0 === d1) return d0;
      if (d0 === 0 && d1 === 1) return s; if (d0 === 1 && d1 === 0) return this.not(s);
      if (d1 === 0) return this.and(this.not(s), d0); if (d0 === 0) return this.and(s, d1);
      if (d1 === 1) return this.or(s, d0); if (d0 === 1) return this.or(this.not(s), d1);
      const ns = this.n[s]; if (ns.op === 'not') return this.mux(ns.a, d1, d0);
      if (d0 === s) return this.and(s, d1); if (d1 === s) return this.or(s, d0);
      return this.hash('mux', s, d0, d1);
    }
    /** [sum, carry] of a full adder */
    fa(a, b, c) {
      const ops = [a, b, c].sort((x, y) => x - y);
      if (ops[0] === 0) return [this.xor(ops[1], ops[2]), this.and(ops[1], ops[2])];
      if (ops[0] === 1) return [this.not(this.xor(ops[1], ops[2])), this.or(ops[1], ops[2])];
      return [this.hash('fas', ops[0], ops[1], ops[2]), this.hash('fac', ops[0], ops[1], ops[2])];
    }
  }
  Y.Dag = Dag;

  // ---- vectors of bits (LSB first) ---------------------------------------------------------------------------------
  const ext = (d, x, w, s) => { if (x.length >= w) return x.slice(0, w); const f = s && x.length ? x[x.length - 1] : 0; return x.concat(new Array(w - x.length).fill(f)); };
  const constBits = (v, w) => { const out = []; for (let i = 0; i < w; i++) out.push(i < v.w ? Number((v.a & ~v.b) >> BigInt(i) & 1n) : 0); return out; };
  function add(d, x, y, cin) { const s = []; let c = cin; for (let i = 0; i < x.length; i++) { const [a, b] = d.fa(x[i], y[i], c); s.push(a); c = b; } return { s, c }; }
  const vnot = (d, x) => x.map((b) => d.not(b));
  const sub = (d, x, y) => add(d, x, vnot(d, y), 1);
  const redAnd = (d, x) => x.reduce((a, b) => d.and(a, b), 1);
  const redOr = (d, x) => x.reduce((a, b) => d.or(a, b), 0);
  const redXor = (d, x) => x.reduce((a, b) => d.xor(a, b), 0);
  const eqv = (d, x, y) => redAnd(d, x.map((b, i) => d.not(d.xor(b, y[i]))));
  /** x < y (both w bits) */
  function lt(d, x, y, signed) {
    if (signed) { const w = x.length; x = x.slice(); y = y.slice(); x[w - 1] = d.not(x[w - 1]); y[w - 1] = d.not(y[w - 1]); }
    return d.not(sub(d, x, y).c);
  }
  function mul(d, x, y) {
    const w = x.length;
    let acc = new Array(w).fill(0);
    for (let i = 0; i < w; i++) {
      if (y[i] === 0) continue;
      const row = new Array(w).fill(0);
      for (let j = 0; i + j < w; j++) row[i + j] = d.and(x[j], y[i]);
      acc = add(d, acc, row, 0).s;
    }
    return acc;
  }
  const isConst = (bits) => bits.every((b) => b < 2);
  /** counts of graph operations {and: 2, mux: 1} as words: "2 AND gates, 1 multiplexer" */
  const countText = (cnt) => {
    const parts = [];
    const nm = { and: 'AND', or: 'OR', xor: 'XOR', not: 'NOT', mux: 'multiplexer', fac: 'full adder' };
    for (const [op, n] of Object.entries(cnt)) if (nm[op] && n) parts.push(n + ' ' + nm[op] + (n > 1 ? (op === 'mux' ? 's' : op === 'fac' ? 's' : ' gates') : op === 'mux' || op === 'fac' ? '' : ' gate'));
    return parts.length ? parts.join(', ') : 'wires only';
  };
  /** whether an index value fits the bits of the index (else no index value can select it) */
  const fits = (v, w, s) => (s ? v >= -(2 ** (w - 1)) && v < 2 ** (w - 1) : v >= 0 && v < 2 ** w);
  const constNum = (bits) => bits.reduce((s, b, i) => s + (b ? 2 ** i : 0), 0);
  function shift(d, x, amt, dir, fill) {
    // a barrel shifter for a variable amount, rewiring for a constant one
    const w = x.length;
    const by = (k) => { const out = []; for (let i = 0; i < w; i++) { const j = dir === 'l' ? i - k : i + k; out.push(j >= 0 && j < w ? x[j] : fill); } return out; };
    if (isConst(amt)) return by(constNum(amt));
    let cur = x;
    for (let k = 0; k < amt.length; k++) {
      const step = 2 ** k;
      const moved = step >= w ? new Array(w).fill(fill) : (() => { const out = []; for (let i = 0; i < w; i++) { const j = dir === 'l' ? i - step : i + step; out.push(j >= 0 && j < w ? cur[j] : fill); } return out; })();
      cur = cur.map((b, i) => d.mux(amt[k], b, moved[i]));
    }
    return cur;
  }

  // ---- the synthesiser -----------------------------------------------------------------------------------------------
  function synthesise(x, opts) {
    opts = opts || {};
    if (typeof opts === 'string') opts = { top: opts };
    if (x && x.k === 'module' && x.unit) { opts = Object.assign({ top: x.name }, opts); x = x.unit; }
    const c = typeof x === 'string' ? V.compile(x, opts) : x && x.parsed ? x : null;
    if (!c) return { ok: false, reasons: [{ line: 0, col: 0, msg: 'synthesise needs Verilog source or a compile result' }] };
    if (c.errors && c.errors.length) return { ok: false, reasons: c.errors.slice(), trace: [] };
    const top = opts.top || (c.tops && c.tops[0]);
    if (!top) return { ok: false, reasons: [{ line: 0, col: 0, msg: 'there is no module to synthesise' }] };
    const W = V.Elab.build(c.parsed, [top], { files: Object.assign({}, c.files, opts.files || {}) });
    if (W.errors.length) return { ok: false, reasons: W.errors.slice(), trace: [] };
    W.parsedSrc = c.parsed;
    const G = new Synth(W, opts);
    try { G.run(); } catch (e) { if (!(e instanceof NotSynth)) throw e; G.reasons.push({ line: e.line, col: e.col, msg: e.message }); }
    if (G.reasons.length) return { ok: false, reasons: G.reasons, trace: G.trace, notes: G.notes };
    let circuit = G.lower(opts.view);
    // sums of products only when they make a state machine drawing; else the logic as written
    if (circuit.sop && !(S.Styles && S.Styles.styles.fsm.test(circuit))) circuit = G.lower(opts.view, true);
    // the summary counts the parts as built (chains of one gate become wider gates)
    const NAMES = { AND: 'AND gates', OR: 'OR gates', XOR: 'XOR gates', NOT: 'inverters', MUX: 'multiplexers', FA: 'full adders', DFF: 'flip-flops', LATCH: 'latches', REG: 'registers', COUNTER: 'counters' };
    const cnt = {};
    for (const p of circuit.parts) if (NAMES[p.type]) cnt[NAMES[p.type]] = (cnt[NAMES[p.type]] || 0) + 1;
    G.recount(circuit);
    delete circuit.madeBy;
    const sum = G.trace.find((x) => x.kind === 'summary');
    if (sum) { sum.counts = cnt; sum.say = 'The circuit has ' + (Object.entries(cnt).map(([k, v]) => v + ' ' + (v === 1 ? (k === 'latches' ? 'latch' : k.replace(/s$/, '')) : k)).join(', ') || 'no gates, only wires') + '.'; }
    circuit.ok = true; circuit.trace = G.trace; circuit.notes = G.notes; circuit.fsm = G.fsms; circuit.ports = G.ports;
    circuit.stats = cnt;
    // the same design built bit by bit from gates and flip-flops (the default view draws registers as blocks)
    if (opts.view !== 'gates') circuit.gateLevel = () => synthesise(x, Object.assign({}, opts, { view: 'gates' }));
    return circuit;
  }
  Y.synthesise = synthesise;
  V.synthesise = synthesise;
  V.synthesize = synthesise;

  class Synth {
    constructor(W, opts) {
      this.W = W; this.opts = opts; this.d = new Dag();
      this.reasons = []; this.notes = []; this.trace = [];
      this.memo = new Map(); this.ffs = []; this.latches = []; this.fsms = [];
      this.root = W.roots[0];
      this.inputs = new Map();
      this.owner = new Map();
      this.drivers = new Map();
      this.blockDone = new Set();
      this.pendingSeq = [];
      this.ports = [];
      this.readOut = new Set(); this.seqNow = null;
      this.rootsOf = new Map(); // a trace step (comb, seq, assign) -> the graph nodes it builds
    }
    say(kind, say, data) { this.trace.push(Object.assign({ kind, say }, data || {})); }
    note(msg, node) { if (!this.notes.some((n) => n.msg === msg)) this.notes.push({ line: node ? node.line : 0, col: node ? node.col : 0, msg }); }
    key(st, i) { return i === undefined ? st : st.id + '#' + i; }

    run() {
      const W = this.W, d = this.d, top = this.root;
      // ports
      for (const p of top.mod.ports) {
        if (!p.name) continue;
        const sym = top.syms.get(p.name);
        if (sym.dir === 'inout') no('the inout port ' + p.name + ' cannot be synthesised; use separate input and output ports', sym.decl);
        if (sym.real) no('the port ' + p.name + ' is real; only bits can be built', sym.decl);
        this.ports.push({ name: p.name, dir: sym.dir, width: sym.w, sym });
        if (sym.dir === 'input') {
          const bits = [];
          for (let i = 0; i < sym.w; i++) bits.push(d.leaf('in', { name: p.name, bit: i, w: sym.w }));
          this.memo.set(sym.st, bits);
          this.say('port', p.name + ' is ' + (sym.w > 1 ? (/^(8|11|18|8\d)$/.test(String(sym.w)) ? 'an ' : 'a ') + sym.w + '-bit input bus' : 'an input'), { name: p.name, width: sym.w, dir: 'input' });
        }
      }
      // who drives what
      for (const dd of W.deferred) {
        if (dd.k === 'initial') { this.note('initial blocks are ignored when the circuit is built (they only set up simulations)', dd.node); continue; }
        if (dd.k !== 'always') continue;
        const blk = this.classify(dd);
        for (const w of V.Stmt.writesOfStmt(W, dd.sc, blk.body)) {
          const st = w.sym.st;
          if (!st) continue;
          const prev = this.owner.get(st);
          if (prev && prev !== blk) no(w.sym.name + ' is assigned in two always blocks (lines ' + prev.node.line + ' and ' + blk.node.line + '); hardware has one driver per signal', w.node);
          this.owner.set(st, blk);
          blk.writes.add(st);
        }
      }
      for (const a of W.assigns) for (const seg of a.segs) this.addDriver(seg.st, { k: 'assign', a, seg });
      for (const pc of W.portConns) {
        if (pc.aliased) continue;
        if (pc.dir === 'input') this.addDriver(pc.sym.st, { k: 'portIn', pc, seg: { st: pc.sym.st, lo: 0, w: pc.sym.w } });
        else for (const seg of this.outSegs(pc)) this.addDriver(seg.st, { k: 'portOut', pc, seg });
      }
      for (const g of W.gateList) this.gateDrivers(g);
      for (const u of W.udpList) no('the primitive ' + u.udp.name + ' cannot be synthesised; describe it with assign or always', u.node);
      for (const [st, blk] of this.owner) if (this.drivers.has(st)) no(st.sym.name + ' is driven both by assign and by an always block', blk.node);
      // outputs pull in everything they depend on; registers found on the way are built after
      this.outs = [];
      for (const p of this.ports) {
        if (p.dir !== 'output') continue;
        const bits = this.bits(p.sym.st, p.sym.decl);
        this.outs.push({ name: p.name, bits, width: p.width });
        this.say('port', p.name + ' is ' + (p.width > 1 ? (/^(8|11|18|8\d)$/.test(String(p.width)) ? 'an ' : 'a ') + p.width + '-bit output bus' : 'an output'), { name: p.name, width: p.width, dir: 'output' });
      }
      while (this.pendingSeq.length) this.runSeq(this.pendingSeq.shift());
      this.findFsms();
      const cnt = {};
      for (const n of this.live()) { const k = { and: 'AND gates', or: 'OR gates', xor: 'XOR gates', not: 'inverters', mux: 'multiplexers', fac: 'full adders' }[this.d.n[n].op]; if (k) cnt[k] = (cnt[k] || 0) + 1; }
      cnt['flip-flops'] = this.ffs.length; if (this.latches.length) cnt.latches = this.latches.length;
      this.stats = cnt;
      this.say('summary', 'The circuit has ' + Object.entries(cnt).filter(([, v]) => v).map(([k, v]) => v + ' ' + k).join(', ') + '.', { counts: cnt });
    }
    /** stores written only by initial blocks (by path), and their values at the end of time 0 */
    initOnly() {
      if (this._init) return this._init;
      const set = new Set();
      for (const dd of this.W.deferred) if (dd.k === 'initial') for (const w of V.Stmt.writesOfStmt(this.W, dd.sc, dd.node.body)) if (w.sym.st && !this.owner.has(w.sym.st)) set.add(w.sym.st.path);
      for (const dd of this.W.deferred) if (dd.k === 'initial') this.readmemTargets(dd.sc, dd.node.body, set);
      this._init = set;
      return set;
    }
    readmemTargets(sc, s, set) {
      if (!s || typeof s !== 'object') return;
      if (s.k === 'call' && s.sys && /^\$readmem[hb]$/.test(s.name) && s.args[1]) { try { const { root } = V.Elab.selChain(s.args[1]); const sym = V.Elab.resolve(this.W, sc, root); if (sym.st && !this.owner.has(sym.st)) set.add(sym.st.path); } catch (e) { /* reported elsewhere */ } }
      for (const k of ['then', 'else', 'body', 'stmt']) this.readmemTargets(sc, s[k], set);
      for (const x of s.stmts || []) this.readmemTargets(sc, x, set);
      for (const a of s.arms || []) this.readmemTargets(sc, a.stmt, set);
    }
    snapshot() {
      if (this._snap) return this._snap;
      const W2 = V.Elab.build(this.W.parsedSrc, [this.root.name], { files: this.W.files });
      W2.K.waves = false; W2.K.maxEvents = 0;
      W2.K.run(0);
      const m = new Map();
      for (const st of W2.stores) for (const p of st.aliases) m.set(p, st);
      this._snap = m;
      return m;
    }
    initValue(path) { const st = this.snapshot().get(path); return st && st.val && st.val.toBits ? st.val : V.fromInt(0, 1); }
    initWords(path) { const st = this.snapshot().get(path); return st && st.words; }
    addDriver(st, drv) { if (!this.drivers.has(st)) this.drivers.set(st, []); this.drivers.get(st).push(drv); }
    outSegs(pc) {
      const segs = V.Net.netTargets(this.W, pc.parent, pc.expr, 'an output port');
      if (pc.slice === null || pc.slice === undefined) return segs;
      const out = []; let off = 0;
      for (let i = segs.length - 1; i >= 0; i--) { const s = segs[i]; const a = Math.max(pc.slice, off), b = Math.min(pc.slice + pc.sym.w, off + s.w); if (a < b) out.unshift({ sym: s.sym, st: s.st, lo: s.lo + (a - off), w: b - a, from: a - pc.slice }); off += s.w; }
      return out;
    }
    gateDrivers(g) {
      const type = g.node.type;
      if (!/^(and|or|nand|nor|xor|xnor|buf|not)$/.test(type)) no('the ' + type + ' primitive (tri-state or switch) cannot be synthesised into plain logic', g.node);
      for (const inst of g.node.insts) {
        if (inst.range) no('arrays of gate instances are not synthesised; use a generate loop', inst);
        const outs = type === 'buf' || type === 'not' ? inst.args.slice(0, -1) : [inst.args[0]];
        for (const o of outs) for (const seg of V.Net.netTargets(this.W, g.sc, o, 'a gate')) this.addDriver(seg.st, { k: 'gate', g, inst, seg });
      }
    }
    classify(dd) {
      const body = dd.node.body;
      const blk = { node: dd.node, sc: dd.sc, writes: new Set(), body };
      if (!body || body.k !== 'event') no('an always block to be built must start with @(...): @(posedge clk) for registers or @* for logic', dd.node);
      blk.body = body.stmt;
      const ev = body.ev;
      if (ev.k === 'star' || ev.list.every((it) => !it.edge)) { blk.kind = 'comb'; return blk; }
      if (ev.list.some((it) => !it.edge)) no('this always block mixes edges (posedge/negedge) with plain signals; use only edges for registers, or only signals for logic', dd.node);
      blk.kind = 'seq';
      blk.events = ev.list;
      return blk;
    }

    // ---- values of signals ------------------------------------------------------------------------------------------
    bits(st, node) {
      // a register read from outside its own clocked block (another block, a port, an assign) must stay a register
      const ob = this.owner.get(st);
      if (ob && ob.kind === 'seq' && this.seqNow !== ob) this.readOut.add(st);
      const m = this.memo.get(st);
      if (m === 'busy') no('there is a combinational loop through ' + (st.sym ? st.sym.name : st.path) + ': it depends on itself without a register in between', node);
      if (m) return m;
      const blk = this.owner.get(st);
      if (blk) {
        if (blk.kind === 'seq') return this.regBits(st, blk);
        this.memo.set(st, 'busy');
        this.runComb(blk);
        return this.memo.get(st);
      }
      if (st.arr) no((st.sym ? st.sym.name : st.path) + ' is a memory that nothing writes', node);
      if (!st.isNet && this.initOnly().has(st.path)) {
        const out = constBits(V.resize(this.initValue(st.path), st.w, false), st.w);
        this.note((st.sym ? st.sym.name : st.path) + ' is set only by an initial block, so its value at time 0 is built in as a constant', node);
        this.memo.set(st, out);
        return out;
      }
      const out = [];
      for (let i = 0; i < st.w; i++) out.push(this.bitAt(st, i, node));
      this.memo.set(st, out);
      return out;
    }
    /** one bit of a net, from the driver that covers it (so b[2] = b[3] ^ g[2] is no loop) */
    bitAt(st, i, node) {
      const m = this.memo.get(st);
      if (Array.isArray(m)) return m[i];
      if (this.owner.has(st)) return this.bits(st, node)[i];
      const nm = (st.sym ? st.sym.name : st.path);
      let found = null;
      for (const drv of this.drivers.get(st) || []) {
        if (i < drv.seg.lo || i >= drv.seg.lo + drv.seg.w) continue;
        if (found) no(nm + (st.w > 1 ? '[' + i + ']' : '') + ' has more than one driver', drv.a ? drv.a.node : drv.pc ? drv.pc.node : drv.g.node);
        found = drv;
      }
      if (!found) {
        if (st.sym && st.sym.kind === 'supply1') return 1;
        if (st.sym && st.sym.kind !== 'supply0') this.note(nm + ' is not driven' + (st.w > 1 ? ' (in part)' : '') + ', so it is built as 0', node);
        return 0;
      }
      if (found.busy) no('there is a combinational loop through ' + nm + ': it depends on itself without a register in between', node);
      if (!found.bits) { found.busy = true; found.bits = this.driverBits(found); found.busy = false; }
      return found.bits[i - found.seg.lo];
    }
    driverBits(drv) {
      const W = this.W, d = this.d;
      if (drv.k === 'assign') {
        const a = drv.a, w = a.segs.reduce((s, x) => s + x.w, 0);
        if (!a.bits) {
          const before = d.n.length;
          a.bits = this.exprAssign(this.globalCtx(), a.sc, a.rhs, w);
          this.say('assign', 'assign ' + (a.lhs.name || 'the target') + ' (line ' + a.node.line + ') becomes ' + this.describe(before, a.bits), { line: a.node.line });
          this.rootsOf.set(this.trace[this.trace.length - 1], a.bits);
        }
        // the bits of this segment within the concatenation
        let off = w;
        for (const s of a.segs) { off -= s.w; if (s === drv.seg) return a.bits.slice(off, off + s.w); }
      }
      if (drv.k === 'portIn') {
        const pc = drv.pc, sym = pc.sym, t = V.Elab.typeOf(W, pc.parent, pc.expr);
        let bits;
        if (pc.slice !== null && pc.slice !== undefined) bits = this.expr(this.globalCtx(), pc.parent, pc.expr, t.w, false).slice(pc.slice, pc.slice + sym.w);
        else bits = this.exprAssign(this.globalCtx(), pc.parent, pc.expr, sym.w);
        return bits.slice(drv.seg ? drv.seg.lo : 0);
      }
      if (drv.k === 'portOut') {
        const pc = drv.pc, inner = this.bits(pc.sym.st, pc.node);
        const full = ext(d, inner, Math.max(pc.sym.w, this.segTotal(pc)), pc.sym.signed);
        // which part of the outside expression this segment is
        if (drv.seg.from !== undefined) return full.slice(drv.seg.from, drv.seg.from + drv.seg.w);
        const segs = V.Net.netTargets(W, pc.parent, pc.expr, 'an output port');
        let off = segs.reduce((s, x) => s + x.w, 0);
        for (const s of segs) { off -= s.w; if (s.st === drv.seg.st && s.lo === drv.seg.lo) return full.slice(off, off + s.w); }
        return full.slice(0, drv.seg.w);
      }
      if (drv.k === 'gate') {
        const { g, inst } = drv, type = g.node.type;
        const one = (e) => this.expr(this.globalCtx(), g.sc, e, 1, false)[0];
        let y;
        if (type === 'buf' || type === 'not') { const v = one(inst.args[inst.args.length - 1]); y = type === 'not' ? d.not(v) : v; }
        else {
          const ins = inst.args.slice(1).map(one);
          const base = type.replace(/^n(and|or)$/, '$1').replace(/^xnor$/, 'xor');
          y = ins.reduce((a, b) => d[base](a, b));
          if (/^(nand|nor|xnor)$/.test(type)) y = d.not(y);
        }
        return new Array(drv.seg.w).fill(0).map((_, i) => (i === 0 ? y : 0));
      }
      throw new Error('bad driver');
    }
    segTotal(pc) { return V.Net.netTargets(this.W, pc.parent, pc.expr, 'an output port').reduce((s, x) => s + x.w, 0); }
    /** the parts made since node 'before' that the given bits use */
    describe(before, roots) {
      const cnt = {}, seen = new Set(), stack = (roots || []).slice();
      while (stack.length) {
        const x = stack.pop();
        if (x < before || seen.has(x)) continue;
        seen.add(x);
        const n = this.d.n[x];
        cnt[n.op] = (cnt[n.op] || 0) + 1;
        if (n.op !== 'in' && n.op !== 'q' && n.op !== 'lq') for (const k of ['a', 'b', 'c']) if (n[k] !== undefined) stack.push(n[k]);
      }
      return countText(cnt);
    }
    /**
     * The notes of each block say what it becomes in parts of the finished circuit, so that they add up to the
     * summary: every gate, multiplexer and adder is counted once, for the first block (in the trace) whose
     * logic made it.
     */
    recount(c) {
      const d = this.d, claim = new Map();
      for (const st of this.trace) {
        const stack = (this.rootsOf.get(st) || []).slice();
        while (stack.length) {
          const x = stack.pop();
          if (x < 2 || claim.has(x)) continue;
          claim.set(x, st);
          const n = d.n[x];
          if (n.op !== 'in' && n.op !== 'q' && n.op !== 'lq') for (const k of ['a', 'b', 'c']) if (n[k] !== undefined) stack.push(n[k]);
        }
      }
      const OP = { AND: 'and', OR: 'or', XOR: 'xor', NOT: 'not', MUX: 'mux', FA: 'fac' };
      const per = new Map();
      for (const p of c.parts) {
        if (!OP[p.type]) continue;
        const x = c.madeBy && c.madeBy.get(p), st = x === undefined ? null : claim.get(x);
        if (!st) continue;
        if (!per.has(st)) per.set(st, {});
        const cnt = per.get(st);
        cnt[OP[p.type]] = (cnt[OP[p.type]] || 0) + 1;
      }
      for (const st of this.rootsOf.keys()) st.say = st.say.replace(/ becomes .*$/, ' becomes ' + countText(per.get(st) || {}));
    }
    regBits(st, blk) {
      if (st.arr) no('internal: a memory read as a whole', blk.node);
      const bits = [];
      for (let i = 0; i < st.w; i++) bits.push(this.d.leaf('q', { name: st.sym.name, bit: i, w: st.w, st }));
      this.memo.set(st, bits);
      if (!blk.queued) { blk.queued = true; this.pendingSeq.push(blk); }
      return bits;
    }
    wordBits(st, i, node) {
      const k = this.key(st, i);
      const m = this.memo.get(k);
      if (m) return m;
      const blk = this.owner.get(st);
      if (!blk && this.initOnly().has(st.path)) {
        // a ROM: its contents come from the initial blocks ($readmemh or assignments)
        const words = this.initWords(st.path);
        const v = words && words[i] ? words[i] : V.fromInt(0, st.w);
        const bits = constBits(V.resize(v, st.w, false), st.w);
        if (!this.romNoted) { this.romNoted = true; this.say('rom', (st.sym ? st.sym.name : st.path) + ' is written only by an initial block, so it is built as a table of constants (a ROM)', { name: st.sym && st.sym.name }); }
        this.memo.set(k, bits);
        return bits;
      }
      if (!blk) no((st.sym ? st.sym.name : st.path) + ' is a memory that nothing writes', node);
      if (blk.kind !== 'seq') no('the memory ' + st.sym.name + ' must be written in a clocked always block', blk.node);
      const bits = [];
      for (let b = 0; b < st.w; b++) bits.push(this.d.leaf('q', { name: st.sym.name + '[' + i + ']', bit: b, w: st.w, st, word: i }));
      this.memo.set(k, bits);
      if (!blk.queued) { blk.queued = true; this.pendingSeq.push(blk); }
      return bits;
    }
    globalCtx() { return { env: new Map(), nxt: null, asg: null, mode: 'global', depth: 0 }; }

    // ---- reading and writing inside a block ---------------------------------------------------------------------------
    read(ctx, sym, node) {
      if (sym.auto) { const v = ctx.env.get(sym); if (!v) no(sym.name + ' is read before it is given a value', node); return v; }
      const st = sym.st;
      if (ctx.env.has(st)) return ctx.env.get(st);
      if (ctx.mode === 'comb' && ctx.own.has(st)) { const h = this.hold(ctx, st); ctx.env.set(st, h); return h; }
      if (ctx.fn && ctx.fn.has(st)) no(sym.name + ' is read before it is given a value', node);
      return this.bits(st, node);
    }
    readWord(ctx, st, i, node) {
      const k = this.key(st, i);
      if (ctx.env.has(k)) return ctx.env.get(k);
      return this.wordBits(st, i, node);
    }
    hold(ctx, st) {
      const out = [];
      for (let i = 0; i < st.w; i++) out.push(this.d.leaf('hold', { st, bit: i }));
      return out;
    }

    // ---- expressions ------------------------------------------------------------------------------------------------
    exprAssign(ctx, sc, rhs, w) {
      const t = V.Elab.typeOf(this.W, sc, rhs);
      if (t.r) no('real numbers cannot be built into a circuit', rhs);
      return ext(this.d, this.expr(ctx, sc, rhs, Math.max(w, t.w), t.s), w, false);
    }
    selfExpr(ctx, sc, n) { const t = V.Elab.typeOf(this.W, sc, n); if (t.r) no('real numbers cannot be built into a circuit', n); return { bits: this.expr(ctx, sc, n, t.w, t.s), s: t.s }; }
    truth(ctx, sc, n) { return redOr(this.d, this.selfExpr(ctx, sc, n).bits); }
    expr(ctx, sc, n, w, s) {
      const W = this.W, d = this.d;
      const t = V.Elab.typeOf(W, sc, n);
      if (t.r) no('real numbers cannot be built into a circuit', n);
      const E = (x, ww, ss) => this.expr(ctx, sc, x, ww, ss);
      switch (n.k) {
        case 'num': case 'str': {
          const v = n.k === 'num' ? (n.xfill ? V.fillExt(n.v, w) : V.resize(n.v, w, s)) : V.resize(V.strToVec(n.s), w, s);
          if (v.b) this.note('x and z bits in constants are built as 0', n);
          return constBits(v, w);
        }
        case 'id': {
          const sym = V.Elab.resolve(W, sc, n);
          if (sym.k === 'param' || sym.k === 'genvar') return constBits(V.resize(sym.value, w, s), w);
          if (sym.arr) no(n.name + ' is a memory; read one word at a time', n);
          return ext(d, this.read(ctx, sym, n), w, s);
        }
        case 'index': case 'range': case 'ipart': return ext(d, this.select(ctx, sc, n), w, s);
        case 'un': {
          if (n.op === '+') return E(n.a, w, s);
          if (n.op === '-') return sub(d, new Array(w).fill(0), E(n.a, w, s)).s;
          if (n.op === '~') return vnot(d, E(n.a, w, s));
          const a = this.selfExpr(ctx, sc, n.a).bits;
          let r;
          switch (n.op) {
            case '!': r = d.not(redOr(d, a)); break;
            case '&': r = redAnd(d, a); break; case '~&': r = d.not(redAnd(d, a)); break;
            case '|': r = redOr(d, a); break; case '~|': r = d.not(redOr(d, a)); break;
            case '^': r = redXor(d, a); break; default: r = d.not(redXor(d, a));
          }
          return ext(d, [r], w, false);
        }
        case 'bin': {
          const op = n.op;
          if (['+', '-', '*', '&', '|', '^', '^~', '~^'].includes(op)) {
            const a = E(n.a, w, s), b = E(n.b, w, s);
            switch (op) {
              case '+': return add(d, a, b, 0).s;
              case '-': return sub(d, a, b).s;
              case '*': return mul(d, a, b);
              case '&': return a.map((x, i) => d.and(x, b[i]));
              case '|': return a.map((x, i) => d.or(x, b[i]));
              case '^': return a.map((x, i) => d.xor(x, b[i]));
              default: return a.map((x, i) => d.not(d.xor(x, b[i])));
            }
          }
          if (op === '/' || op === '%') {
            const a = E(n.a, w, s), b = E(n.b, w, s);
            if (isConst(a) && isConst(b)) { const va = V.vec(w, BigInt(constNum(a)), 0n, s), vb = V.vec(w, BigInt(constNum(b)), 0n, s); return constBits(V.ops[op === '/' ? 'div' : 'mod'](va, vb), w); }
            if (!isConst(b)) no('division and remainder by a signal cannot be built here; divide by a constant power of two, or design a divider', n);
            const k = constNum(b);
            if (k === 0 || (k & (k - 1)) !== 0 || s) no('division and remainder can be built only by a positive power of two (unsigned), as shifts and masks', n);
            const sh = Math.log2(k);
            return op === '/' ? shift(d, a, constBits(V.fromInt(sh, 32), 32), 'r', 0) : a.map((x, i) => (i < sh ? x : 0));
          }
          if (op === '**') {
            const a = E(n.a, w, s), b = this.selfExpr(ctx, sc, n.b).bits;
            if (isConst(a) && isConst(b)) { const r = V.ops.pow(V.vec(w, BigInt(constNum(a)), 0n, s), V.fromInt(constNum(b), 32)); return constBits(r, w); }
            if (isConst(a) && constNum(a) === 2) return shift(d, ext(d, [1], w, false), b, 'l', 0);
            no('the power operator can be built only for constants or 2 ** n', n);
          }
          if (op === '<<' || op === '>>' || op === '<<<' || op === '>>>') {
            const a = E(n.a, w, s), b = this.selfExpr(ctx, sc, n.b).bits;
            if (op === '<<' || op === '<<<') return shift(d, a, b, 'l', 0);
            return shift(d, a, b, 'r', op === '>>>' && s ? a[a.length - 1] : 0);
          }
          if (op === '&&' || op === '||') {
            const a = this.truth(ctx, sc, n.a), b = this.truth(ctx, sc, n.b);
            return ext(d, [op === '&&' ? d.and(a, b) : d.or(a, b)], w, false);
          }
          const ta = V.Elab.typeOf(W, sc, n.a), tb = V.Elab.typeOf(W, sc, n.b);
          if (ta.r || tb.r) no('real numbers cannot be built into a circuit', n);
          const wi = Math.max(ta.w, tb.w), si = ta.s && tb.s;
          const a = E(n.a, wi, si), b = E(n.b, wi, si);
          let r;
          switch (op) {
            case '==': case '===': r = eqv(d, a, b); if (op === '===') this.note('=== is built like ==', n); break;
            case '!=': case '!==': r = d.not(eqv(d, a, b)); break;
            case '<': r = lt(d, a, b, si); break;
            case '>': r = lt(d, b, a, si); break;
            case '<=': r = d.not(lt(d, b, a, si)); break;
            case '>=': r = d.not(lt(d, a, b, si)); break;
            default: no('the operator ' + op + ' cannot be built', n);
          }
          return ext(d, [r], w, false);
        }
        case 'cond': {
          const c = this.truth(ctx, sc, n.c);
          if (c === 1) return E(n.a, w, s);
          if (c === 0) return E(n.b, w, s);
          const a = E(n.a, w, s), b = E(n.b, w, s);
          return a.map((x, i) => d.mux(c, b[i], x));
        }
        case 'concat': case 'repl': {
          let parts = [];
          for (const p of n.parts) { const t2 = V.Elab.typeOf(W, sc, p); if (!t2.zero) parts.push(this.expr(ctx, sc, p, t2.w, t2.s)); }
          let bits = [];
          for (let i = parts.length - 1; i >= 0; i--) bits = bits.concat(parts[i]);
          if (n.k === 'repl') { const k = V.Elab.constInt(W, sc, n.n); let r = []; for (let i = 0; i < k; i++) r = r.concat(bits); bits = r; }
          return ext(d, bits, w, false);
        }
        case 'call': {
          if (n.sys) {
            if (n.name === '$signed' || n.name === '$unsigned') { const t2 = V.Elab.typeOf(W, sc, n.args[0]); return ext(d, this.expr(ctx, sc, n.args[0], t2.w, t2.s), w, s); }
            if (n.name === '$clog2' || n.name === '$bits') { const v = V.Elab.constVal(W, sc, n); return constBits(V.resize(v, w, s), w); }
            no(n.name + ' cannot be built into a circuit', n);
          }
          return ext(d, this.callFunc(ctx, sc, n), w, s);
        }
      }
      no('this expression cannot be built', n);
    }
    select(ctx, sc, n) {
      const W = this.W, d = this.d;
      const { root, chain } = V.Elab.selChain(n);
      const sym = V.Elab.resolve(W, sc, root);
      const nd = sym.arr ? sym.arr.dims.length : 0;
      let base, msb, lsb, w0;
      if (sym.k === 'param' || sym.k === 'genvar') { base = constBits(sym.value, sym.value.w); w0 = sym.value.w; msb = sym.msb != null ? sym.msb : w0 - 1; lsb = sym.lsb != null ? sym.lsb : 0; }
      else {
        w0 = sym.w; msb = sym.msb; lsb = sym.lsb;
        if (sym.arr) {
          if (nd > 1) no('memories with more than one dimension are not built', n);
          if (sym.auto) no('automatic memories are not built', n);
          const dim = sym.arr.dims[0];
          if (dim.n > 256) no('the memory ' + sym.name + ' is too big to build from flip-flops (' + dim.n + ' words)', n);
          const idx = this.selfExpr(ctx, sc, chain[0].index).bits;
          const words = [];
          for (let i = 0; i < dim.n; i++) words.push(this.readWord(ctx, sym.st, i, n));
          base = this.pickWord(idx, dim, words, sym.w);
        } else if (sym.isNet && !ctx.env.has(sym.st) && !this.owner.has(sym.st) && chain.length === 1 && chain[0].k !== 'ipart') {
          // a constant select of a net reads just those bits, so bit-level chains are no loop
          const c0 = chain[0], pos0 = msb >= lsb ? (i) => i - lsb : (i) => lsb - i;
          if (c0.k === 'range' || V.Expr.isConst(W, sc, c0.index)) {
            const a = V.Elab.constInt(W, sc, c0.k === 'range' ? c0.msb : c0.index), b = c0.k === 'range' ? V.Elab.constInt(W, sc, c0.lsb) : a;
            const lo = Math.min(pos0(a), pos0(b)), w = Math.abs(a - b) + 1, out = [];
            for (let i = 0; i < w; i++) out.push(lo + i >= 0 && lo + i < w0 ? this.bitAt(sym.st, lo + i, n) : 0);
            return out;
          }
          base = this.read(ctx, sym, root);
        } else base = this.read(ctx, sym, root);
      }
      const rest = chain.slice(nd);
      if (!rest.length) return base;
      const c = rest[0], pos = msb >= lsb ? (i) => i - lsb : (i) => lsb - i;
      if (c.k === 'index') {
        const t = V.Elab.typeOf(W, sc, c.index);
        const ib = this.expr(ctx, sc, c.index, t.w, t.s);
        if (isConst(ib)) { const p = pos(Number(V.signedVal(V.vec(t.w, BigInt(constNum(ib)), 0n, t.s)))); return [p >= 0 && p < w0 ? base[p] : 0]; }
        // a variable bit select: a multiplexer over the positions
        let r = 0;
        for (let i = 0; i < w0; i++) { const iv = msb >= lsb ? i + lsb : lsb - i; if (!fits(iv, t.w, t.s)) continue; r = d.mux(eqv(d, ib, constBits(V.fromInt(iv, t.w), t.w)), r, base[i]); }
        return [r];
      }
      if (c.k === 'range') {
        const a = V.Elab.constInt(W, sc, c.msb), b = V.Elab.constInt(W, sc, c.lsb);
        const lo = Math.min(pos(a), pos(b)), w = Math.abs(a - b) + 1;
        const out = []; for (let i = 0; i < w; i++) out.push(lo + i >= 0 && lo + i < w0 ? base[lo + i] : 0);
        return out;
      }
      const k = V.Elab.constInt(W, sc, c.width), t = V.Elab.typeOf(W, sc, c.start);
      const sb = this.expr(ctx, sc, c.start, t.w, t.s), up = c.dir === '+', little = msb >= lsb;
      const lowOf = (i) => pos(up ? (little ? i : i + k - 1) : (little ? i - k + 1 : i));
      if (isConst(sb)) { const lo = lowOf(constNum(sb)); const out = []; for (let i = 0; i < k; i++) out.push(lo + i >= 0 && lo + i < w0 ? base[lo + i] : 0); return out; }
      const out = new Array(k).fill(0);
      for (let sv = Math.min(msb, lsb) - k; sv <= Math.max(msb, lsb) + k; sv++) {
        const lo = lowOf(sv);
        if (lo + k <= 0 || lo >= w0 || !fits(sv, t.w, t.s)) continue;
        const hit = eqv(d, sb, constBits(V.fromInt(sv, t.w), t.w));
        for (let i = 0; i < k; i++) if (lo + i >= 0 && lo + i < w0) out[i] = d.mux(hit, out[i], base[lo + i]);
      }
      return out;
    }
    pickWord(idx, dim, words, w) {
      const d = this.d;
      if (isConst(idx)) { const i = constNum(idx), off = dim.a <= dim.b ? i - dim.a : dim.a - i; return off >= 0 && off < dim.n ? words[off] : new Array(w).fill(0); }
      let r = new Array(w).fill(0);
      for (let off = 0; off < dim.n; off++) {
        const iv = dim.a <= dim.b ? dim.a + off : dim.a - off;
        if (!fits(iv, idx.length, false)) continue;
        const hit = eqv(d, idx, constBits(V.fromInt(iv, Math.max(idx.length, 1)), idx.length));
        r = r.map((b, i) => d.mux(hit, b, words[off][i]));
      }
      return r;
    }
    callFunc(ctx, sc, n) {
      const W = this.W;
      const sym = V.Expr.findTF(W, sc, n.name, n, 'func');
      const info = V.Expr.tfInfo(W, sym);
      if (ctx.depth > 40) no('the function ' + n.name + ' calls itself too deeply to be built (its recursion must end on constant arguments)', n);
      if (n.args.length !== info.ports.length) no(n.name + ' takes ' + info.ports.length + ' arguments', n);
      const vals = info.ports.map((p, i) => this.exprAssign(ctx, sc, n.args[i], p.w));
      const fctx = { env: new Map(ctx.env), nxt: null, asg: null, mode: 'func', depth: ctx.depth + 1, own: new Set(), fn: new Set() };
      for (const s of info.scope.syms.values()) if (s.k === 'var' && !s.auto && s.st) fctx.fn.add(s.st);
      const keyOf = (s) => (s.auto ? s : s.st);
      info.ports.forEach((p, i) => { fctx.env.set(keyOf(p), vals[i]); fctx.fn.delete(p.st); });
      this.stmt(fctx, info.scope, info.sym.decl.body);
      const r = fctx.env.get(keyOf(info.ret));
      if (!r) no('the function ' + n.name + ' does not always set its result', n);
      return r;
    }

    // ---- statements -----------------------------------------------------------------------------------------------------
    clone(ctx) { return Object.assign({}, ctx, { env: new Map(ctx.env), nxt: ctx.nxt && new Map(ctx.nxt), asg: ctx.asg && new Map(ctx.asg) }); }
    /** after if/else: every variable either branch changed becomes a multiplexer on c */
    merge(ctx, c, A, B) {
      const d = this.d;
      const mergeMap = (field, dflt) => {
        const a = A[field], b = B[field];
        if (!a) return null;
        const out = new Map(ctx[field]);
        for (const k of new Set([...a.keys(), ...b.keys()])) {
          const va = a.has(k) ? a.get(k) : dflt(k), vb = b.has(k) ? b.get(k) : dflt(k);
          if (va === vb) { out.set(k, va); continue; }
          out.set(k, va.map((x, i) => d.mux(c, vb[i], x)));
        }
        return out;
      };
      ctx.env = mergeMap('env', (k) => this.dflt(ctx, k));
      if (ctx.nxt) ctx.nxt = mergeMap('nxt', (k) => this.nxtDflt(ctx, k));
      if (ctx.asg) ctx.asg = mergeMap('asg', (k) => new Array(this.widthOf(k)).fill(0));
    }
    widthOf(k) { if (typeof k === 'string') { const st = this.W.stores[+k.split('#')[0]]; return st.w; } return k.w !== undefined ? k.w : k.st ? k.st.w : 1; }
    dflt(ctx, k) {
      if (typeof k === 'string') { const [id, i] = k.split('#').map(Number); return this.wordBits(this.W.stores[id], i); }
      if (k.k === 'var') no(k.name + ' is read before it is given a value', null);
      if (ctx.fn && ctx.fn.has(k)) return new Array(k.w).fill(0);
      if (ctx.mode === 'comb' && ctx.own.has(k)) return this.hold(ctx, k);
      if (ctx.readQ) ctx.readQ.add(k);
      return this.bits(k);
    }
    nxtDflt(ctx, k) { return this.dflt(ctx, k); }
    stmt(ctx, sc, s) {
      if (!s) return;
      const W = this.W, d = this.d;
      switch (s.k) {
        case 'null': return;
        case 'block': {
          if (s.fork) no('fork ... join cannot be built into a circuit', s);
          const bs = V.Stmt.blockScope(W, sc, s);
          for (const x of s.stmts) this.stmt(ctx, bs, x);
          return;
        }
        case 'ba': case 'nba': {
          if (s.ctl) this.note('delays and event controls inside assignments are ignored when the circuit is built', s);
          if (s.k === 'nba' && ctx.mode === 'comb') this.note('use = (blocking) in combinational always blocks; <= is built the same way here', s);
          if (s.k === 'ba' && ctx.mode === 'seq') ctx.blocking = true;
          const L = V.Expr.lvalue(W, sc, s.lhs);
          if (L.real) no('real variables cannot be built', s);
          const val = this.exprAssign(ctx, sc, s.rhs, L.w);
          this.write(ctx, sc, s.lhs, val, s.k === 'nba' && ctx.mode === 'seq');
          return;
        }
        case 'if': {
          const c = this.truth(ctx, sc, s.cond);
          if (c === 1) return this.stmt(ctx, sc, s.then);
          if (c === 0) return this.stmt(ctx, sc, s.else);
          const A = this.clone(ctx), B = this.clone(ctx);
          this.stmt(A, sc, s.then); this.stmt(B, sc, s.else);
          this.merge(ctx, c, A, B);
          return;
        }
        case 'case': return this.caseStmt(ctx, sc, s);
        case 'for': {
          this.stmt(ctx, sc, s.init);
          for (let n = 0; ; n++) {
            if (n > 4096) no('this loop runs more than 4096 times; a built loop must have a small, fixed count', s);
            const c = this.truth(ctx, sc, s.cond);
            if (c > 1) no('the loop condition must be known when the circuit is built (a constant bound on a loop variable)', s.cond);
            if (!c) break;
            this.stmt(ctx, sc, s.body); this.stmt(ctx, sc, s.step);
          }
          return;
        }
        case 'while': {
          for (let n = 0; ; n++) {
            if (n > 4096) no('this loop runs more than 4096 times', s);
            const c = this.truth(ctx, sc, s.cond);
            if (c > 1) no('the while condition must be known when the circuit is built', s.cond);
            if (!c) break;
            this.stmt(ctx, sc, s.body);
          }
          return;
        }
        case 'repeat': {
          const v = this.selfExpr(ctx, sc, s.count).bits;
          if (!isConst(v)) no('the repeat count must be a constant to be built', s.count);
          for (let n = constNum(v); n > 0; n--) this.stmt(ctx, sc, s.body);
          return;
        }
        case 'delay': this.note('delays (#) are ignored when the circuit is built', s); return this.stmt(ctx, sc, s.stmt);
        case 'call': {
          if (s.sys) { if (/^\$(display|write|strobe|monitor|finish|stop)/.test(s.name)) { this.note(s.name + ' is ignored when the circuit is built', s); return; } no(s.name + ' cannot be built into a circuit', s); }
          return this.callTask(ctx, sc, s);
        }
        case 'event': no('an event control (@) inside the block cannot be built; put one @(...) at the start of the always block', s);
        // falls through
        case 'wait': no('wait cannot be built into a circuit', s);
        // falls through
        case 'forever': no('forever cannot be built into a circuit', s);
        // falls through
        case 'disable': no('disable cannot be built into a circuit', s);
        // falls through
        default: no('this statement (' + s.k + ') cannot be built into a circuit', s);
      }
    }
    caseStmt(ctx, sc, s) {
      const W = this.W, d = this.d;
      const te = V.Elab.typeOf(W, sc, s.expr);
      let w = te.w, sg = te.s;
      for (const a of s.arms) for (const e of a.exprs || []) { const t = V.Elab.typeOf(W, sc, e); w = Math.max(w, t.w); sg = sg && t.s; }
      const x = this.expr(ctx, sc, s.expr, w, sg);
      const match = (e) => {
        if (s.type !== 'case' && (e.k === 'num')) {
          // casez / casex: z (and ?) bits, and x in casex, match anything
          const v = V.resize(e.v, w, sg), care = [];
          for (let i = 0; i < w; i++) { const b = v.bit(i); if (b === 2 || (b === 3 && s.type === 'casex')) continue; care.push(d.not(d.xor(x[i], b & 1))); }
          return redAnd(d, care);
        }
        return eqv(d, x, this.expr(ctx, sc, e, w, sg));
      };
      const arms = s.arms.filter((a) => a.exprs), def = s.arms.find((a) => !a.exprs);
      // a case whose items cover every value of its selector needs no default: its last item then holds
      // whenever the others do not, so nothing is left unassigned (no latch)
      const full = !def && arms.length > 0 && this.coversAll(ctx, sc, s, arms, te, w, sg);
      if (full) this.say('full-case', 'the case at line ' + s.line + ' covers all ' + (1 << te.w) + ' values of its selector, so it needs no default', { line: s.line });
      const run = (i, c2) => {
        if (i === arms.length) { if (def) this.stmt(c2, sc, def.stmt); return; }
        if (full && i === arms.length - 1) return this.stmt(c2, sc, arms[i].stmt);
        const m = redOr(d, arms[i].exprs.map(match));
        if (m === 1) return this.stmt(c2, sc, arms[i].stmt);
        if (m === 0) return run(i + 1, c2);
        const A = this.clone(c2), B = this.clone(c2);
        this.stmt(A, sc, arms[i].stmt); run(i + 1, B);
        this.merge(c2, m, A, B);
      };
      run(0, ctx);
    }
    /** do the constant items of a case match every value its selector (te.w bits, at most 12) can take? */
    coversAll(ctx, sc, s, arms, te, w, sg) {
      if (te.w > 12) return false;
      const pats = [];
      for (const a of arms) for (const e of a.exprs) {
        const care = [], val = [];
        if (e.k === 'num') {
          const v = V.resize(e.v, w, sg);
          for (let i = 0; i < w; i++) { const b = v.bit(i); const wild = b === 2 || (b === 3 && s.type === 'casex'); if (!wild && b > 1) { care.length = 0; break; } care.push(!wild); val.push(b & 1); }
          if (care.length !== w) continue;
        } else {
          let bits;
          try { bits = this.expr(ctx, sc, e, w, sg); } catch (er) { return false; }
          if (!isConst(bits)) return false;
          for (let i = 0; i < w; i++) { care.push(true); val.push(bits[i]); }
        }
        pats.push({ care, val });
      }
      for (let v = 0; v < 1 << te.w; v++) {
        const bit = (i) => (i < te.w ? (v >> i) & 1 : sg && te.s ? (v >> (te.w - 1)) & 1 : 0);
        if (!pats.some((p) => p.care.every((c, i) => !c || p.val[i] === bit(i)))) return false;
      }
      return true;
    }
    callTask(ctx, sc, s) {
      const W = this.W;
      const sym = V.Expr.findTF(W, sc, s.name, s, 'task');
      const info = V.Expr.tfInfo(W, sym);
      const keyOf = (p) => (p.auto ? p : p.st);
      info.ports.forEach((p, i) => { if (p.dir !== 'output') ctx.env.set(keyOf(p), this.exprAssign(ctx, sc, s.args[i], p.w)); });
      this.stmt(ctx, info.scope, info.sym.decl.body);
      info.ports.forEach((p, i) => {
        if (p.dir === 'input') return;
        const v = ctx.env.get(keyOf(p));
        if (!v) no('the task ' + s.name + ' does not set its output ' + p.name, s);
        const L = V.Expr.lvalue(W, sc, s.args[i]);
        this.write(ctx, sc, s.args[i], ext(this.d, v, L.w, p.signed), false);
      });
    }
    /** assign bits to a target: whole, bit or part select (constant or not), memory word, or concatenation */
    write(ctx, sc, l, val, nb) {
      const W = this.W, d = this.d;
      if (l.k === 'concat') {
        const parts = l.parts.map((p) => ({ p, w: V.Expr.lvalue(W, sc, p).w }));
        let off = val.length;
        for (const { p, w } of parts) { off -= w; this.write(ctx, sc, p, val.slice(off, off + w), nb); }
        return;
      }
      const { root, chain } = V.Elab.selChain(l);
      const sym = V.Elab.resolve(W, sc, root);
      const map = nb ? ctx.nxt : ctx.env;
      const cur = (k) => (map.has(k) ? map.get(k) : nb ? this.nxtDflt(ctx, k) : this.dflt(ctx, k));
      const mark = (k, bitsOn) => {
        if (!ctx.asg) return;
        const a = ctx.asg.has(k) ? ctx.asg.get(k) : new Array(this.widthOf(k)).fill(0);
        ctx.asg.set(k, a.map((x, i) => d.or(x, bitsOn[i])));
      };
      const put = (k, bits, on) => { map.set(k, bits); if (!nb && ctx.nxt && ctx.nxt.has(k)) no((sym.name) + ' gets both = and <= in one clocked block', l); mark(k, on || bits.map(() => 1)); };
      const nd = sym.arr ? sym.arr.dims.length : 0;
      if (sym.arr) {
        if (ctx.mode !== 'seq') no('the memory ' + sym.name + ' can be written only in a clocked always block', l);
        const dim = sym.arr.dims[0];
        if (dim.n > 256) no('the memory ' + sym.name + ' is too big to build from flip-flops', l);
        const idx = this.selfExpr(ctx, sc, chain[0].index).bits;
        for (let off = 0; off < dim.n; off++) {
          const iv = dim.a <= dim.b ? dim.a + off : dim.a - off;
          const k = this.key(sym.st, off);
          const hit = isConst(idx) ? (constNum(idx) === iv ? 1 : 0) : !fits(iv, idx.length, false) ? 0 : eqv(d, idx, constBits(V.fromInt(iv, idx.length), idx.length));
          if (hit === 0) continue;
          let word = cur(k);
          let nv = val;
          if (chain.length > nd) nv = this.spliceSel(ctx, sc, sym, chain[nd], word, val);
          word = word.map((b, i) => d.mux(hit, b, nv[i]));
          map.set(k, word);
        }
        return;
      }
      const k = sym.auto ? sym : sym.st;
      if (!chain.length) return put(k, val);
      const old = cur(k);
      const nv = this.spliceSel(ctx, sc, sym, chain[0], old, val);
      put(k, nv, nv.map((b, i) => (b === old[i] ? 0 : 1)));
    }
    /** the variable's bits with a select replaced */
    spliceSel(ctx, sc, sym, c, old, val) {
      const W = this.W, d = this.d;
      const msb = sym.msb, lsb = sym.lsb, w0 = sym.w, pos = msb >= lsb ? (i) => i - lsb : (i) => lsb - i;
      const out = old.slice();
      if (c.k === 'range') {
        const a = V.Elab.constInt(W, sc, c.msb), b = V.Elab.constInt(W, sc, c.lsb), lo = Math.min(pos(a), pos(b));
        for (let i = 0; i < val.length; i++) if (lo + i >= 0 && lo + i < w0) out[lo + i] = val[i];
        return out;
      }
      if (c.k === 'index') {
        const t = V.Elab.typeOf(W, sc, c.index), ib = this.expr(ctx, sc, c.index, t.w, t.s);
        if (isConst(ib)) { const p = pos(constNum(ib)); if (p >= 0 && p < w0) out[p] = val[0]; return out; }
        for (let i = 0; i < w0; i++) { const iv = msb >= lsb ? i + lsb : lsb - i; if (!fits(iv, t.w, t.s)) continue; const hit = eqv(d, ib, constBits(V.fromInt(iv, t.w), t.w)); out[i] = d.mux(hit, out[i], val[0]); }
        return out;
      }
      const k = V.Elab.constInt(W, sc, c.width), t = V.Elab.typeOf(W, sc, c.start), sb = this.expr(ctx, sc, c.start, t.w, t.s);
      const up = c.dir === '+', little = msb >= lsb;
      const lowOf = (i) => pos(up ? (little ? i : i + k - 1) : (little ? i - k + 1 : i));
      if (isConst(sb)) { const lo = lowOf(constNum(sb)); for (let i = 0; i < k; i++) if (lo + i >= 0 && lo + i < w0) out[lo + i] = val[i]; return out; }
      for (let sv = Math.min(msb, lsb) - k; sv <= Math.max(msb, lsb) + k; sv++) {
        const lo = lowOf(sv);
        if (lo + k <= 0 || lo >= w0 || !fits(sv, t.w, t.s)) continue;
        const hit = eqv(d, sb, constBits(V.fromInt(sv, t.w), t.w));
        for (let i = 0; i < k; i++) if (lo + i >= 0 && lo + i < w0) out[lo + i] = d.mux(hit, out[lo + i], val[i]);
      }
      return out;
    }

    // ---- combinational and clocked blocks ----------------------------------------------------------------------------------
    runComb(blk) {
      if (this.blockDone.has(blk)) return;
      this.blockDone.add(blk);
      const d = this.d, before = d.n.length;
      const ctx = { env: new Map(), nxt: null, asg: new Map(), mode: 'comb', own: blk.writes, depth: 0 };
      const seqWas = this.seqNow;
      this.seqNow = null;
      try { this.stmt(ctx, blk.sc, blk.body); } finally { this.seqNow = seqWas; }
      const names = [];
      for (const st of blk.writes) {
        const val = ctx.env.get(st) || this.hold(ctx, st);
        const asg = ctx.asg.get(st) || new Array(st.w).fill(0);
        const out = [];
        let latch = false;
        for (let i = 0; i < st.w; i++) {
          if (asg[i] === 1) {
            if (this.uses(val[i], st)) no(st.sym.name + ' depends on its own value in this combinational block (a loop); assign it before reading it', blk.node);
            out.push(val[i]);
          } else {
            // not assigned on every path: a latch holds the old value
            latch = true;
            const dIn = this.substHold(val[i], st);
            const q = d.leaf('lq', { name: st.sym.name, bit: i, w: st.w, st });
            this.latches.push({ q, d: dIn, en: asg[i], name: st.sym.name, bit: i });
            out.push(q);
          }
        }
        this.memo.set(st, out);
        names.push(st.sym.name);
        if (latch) this.say('latch', st.sym.name + ' is not assigned on every path through the always block at line ' + blk.node.line + ', so a latch keeps its old value (give it a default to avoid this)', { name: st.sym.name, line: blk.node.line });
      }
      const roots = [...blk.writes].flatMap((st) => this.memo.get(st)).concat(this.latches.flatMap((l) => [l.d, l.en]));
      this.say('comb', 'the always block at line ' + blk.node.line + ' (' + names.join(', ') + ') becomes ' + this.describe(before, roots), { line: blk.node.line, names });
      this.rootsOf.set(this.trace[this.trace.length - 1], roots);
    }
    uses(node, st) {
      const seen = new Set(), stack = [node];
      while (stack.length) {
        const x = stack.pop();
        if (x < 2 || seen.has(x)) continue;
        seen.add(x);
        const n = this.d.n[x];
        if (n.op === 'hold' && n.st === st) return true;
        for (const k of ['a', 'b', 'c']) if (n[k] !== undefined) stack.push(n[k]);
      }
      return false;
    }
    substHold(node, st) {
      const d = this.d, memo = new Map();
      const f = (x) => {
        if (x < 2) return x;
        if (memo.has(x)) return memo.get(x);
        const n = d.n[x];
        let r = x;
        if (n.op === 'hold') r = n.st === st ? 0 : x;
        else if (n.op === 'not') r = d.not(f(n.a));
        else if (n.op === 'and' || n.op === 'or' || n.op === 'xor') r = d[n.op](f(n.a), f(n.b));
        else if (n.op === 'mux') r = d.mux(f(n.a), f(n.b), f(n.c));
        else if (n.op === 'fas' || n.op === 'fac') { const [sm, cr] = d.fa(f(n.a), f(n.b), f(n.c)); r = n.op === 'fas' ? sm : cr; }
        memo.set(x, r);
        return r;
      };
      return f(node);
    }
    /** the async controls: the if chain at the top of a clocked block that tests the extra edge signals */
    asyncSplit(blk) {
      const W = this.W, evs = blk.events;
      if (evs.length === 1) return { clock: evs[0], asyncs: [], body: blk.body };
      let s = blk.body;
      while (s && s.k === 'block' && s.stmts.length === 1 && !s.decls.length) s = s.stmts[0];
      const asyncs = [], used = new Set();
      while (s && s.k === 'if' && asyncs.length < evs.length - 1) {
        const c = s.cond;
        let sig = c, high = true;
        if (c.k === 'un' && (c.op === '!' || c.op === '~')) { sig = c.a; high = false; }
        else if (c.k === 'bin' && (c.op === '==' || c.op === '===') && c.b.k === 'num') { sig = c.a; high = !c.b.v.b && c.b.v.a !== 0n; }
        else if (c.k === 'bin' && (c.op === '!=' || c.op === '!==') && c.b.k === 'num') { sig = c.a; high = c.b.v.a === 0n; }
        const ev = evs.find((e) => !used.has(e) && e.expr.k === sig.k && sig.k === 'id' && e.expr.name === sig.name);
        if (!ev) break;
        if ((ev.edge === 'posedge') !== high) no('the test of ' + sig.name + ' does not match its edge: @(' + ev.edge + ' ' + sig.name + ') needs if (' + (ev.edge === 'posedge' ? '' : '!') + sig.name + ')', c);
        used.add(ev);
        asyncs.push({ ev, sig, high, stmt: s.then });
        s = s.else;
      }
      const rest = evs.filter((e) => !used.has(e));
      if (rest.length !== 1) no('in an always block with several edges, the first if must test each asynchronous signal (like if (rst) ... else ...), leaving one clock', blk.node);
      return { clock: rest[0], asyncs, body: s };
    }
    runSeq(blk) {
      if (this.blockDone.has(blk)) return;
      this.blockDone.add(blk);
      const W = this.W, d = this.d, before = d.n.length;
      const sp = this.asyncSplit(blk);
      const clkBits = this.selfExpr(this.globalCtx(), blk.sc, sp.clock.expr).bits;
      if (clkBits.length !== 1) this.note('the clock ' + (sp.clock.expr.name || '') + ' is wider than one bit; its bit 0 is used', sp.clock.expr);
      const clk = clkBits[0], edge = sp.clock.edge === 'negedge' ? 'fall' : 'rise';
      // the register keys this block owns: whole variables, and words of memories
      const keys = [];
      for (const st of blk.writes) {
        if (st.arr) { for (let i = 0; i < st.arr.dims[0].n; i++) { this.wordBits(st, i, blk.node); keys.push(this.key(st, i)); } }
        else { if (!Array.isArray(this.memo.get(st))) this.regBits(st, blk); keys.push(st); }
      }
      const qOf = (k) => (typeof k === 'string' ? this.memo.get(k) : this.memo.get(k));
      const runBody = (stmt) => {
        const ctx = { env: new Map(), nxt: new Map(), asg: null, mode: 'seq', own: new Set(), depth: 0, readQ: new Set() };
        const seqWas = this.seqNow;
        this.seqNow = blk;
        try { this.stmt(ctx, blk.sc, stmt); } finally { this.seqNow = seqWas; }
        const next = new Map();
        for (const k of keys) next.set(k, ctx.nxt.has(k) ? ctx.nxt.get(k) : ctx.env.has(k) ? ctx.env.get(k) : null);
        return { next, blocking: ctx.blocking, readQ: ctx.readQ, nba: new Set(ctx.nxt.keys()), env: ctx.env };
      };
      const main = runBody(sp.body);
      const asyncs = sp.asyncs.map((a) => {
        const r = runBody(a.stmt);
        const sigBit = this.selfExpr(this.globalCtx(), blk.sc, a.sig).bits[0];
        return { active: a.high ? sigBit : d.not(sigBit), next: r.next, name: a.sig.name, high: a.high };
      });
      // earlier async controls win over later ones
      let prior = 0;
      for (const a of asyncs) { a.only = d.and(a.active, d.not(prior)); prior = d.or(prior, a.active); }
      const regs = [];
      // a temporary: written with = on every path before it is read, and read nowhere else, holds nothing from
      // one clock to the next, so it is a wire inside the next-state logic rather than a flip-flop
      const temps = new Set(keys.filter((k) => typeof k !== 'string' && main.env.has(k) && !main.nba.has(k) && !main.readQ.has(k) && !this.readOut.has(k) && !sp.asyncs.length));
      for (const k of temps) {
        this.memo.set(k, main.env.get(k));
        this.say('temp', k.sym.name + ' is set with = before it is read in the always block at line ' + blk.node.line + ' and read nowhere else, so it is a wire inside the next-state logic, not a flip-flop', { name: k.sym.name, line: blk.node.line });
      }
      for (const k of keys) {
        if (temps.has(k)) continue;
        const q = qOf(k);
        const st = typeof k === 'string' ? W.stores[+k.split('#')[0]] : k;
        const name = st.sym.name + (typeof k === 'string' ? '[' + k.split('#')[1] + ']' : '');
        let dn = main.next.get(k) || q;
        let set = new Array(q.length).fill(0), rst = new Array(q.length).fill(0), hold = 0;
        for (const a of asyncs) {
          const v = a.next.get(k);
          if (!v) { hold = d.or(hold, a.active); continue; }
          for (let i = 0; i < q.length; i++) {
            if (v[i] === 1) set[i] = d.or(set[i], a.only);
            else if (v[i] === 0) rst[i] = d.or(rst[i], a.only);
            else no('the reset value of ' + name + ' must be a constant to be built as an asynchronous reset or set', a.next && sp.asyncs[0].stmt);
          }
        }
        if (hold) dn = dn.map((b, i) => d.mux(hold, b, q[i]));
        for (let i = 0; i < q.length; i++) this.ffs.push({ q: q[i], d: dn[i], clk, edge, set: set[i], rst: rst[i], name, bit: i, w: q.length });
        regs.push({ name, w: q.length, reset: asyncs.length ? asyncs.map((a) => a.name).join(', ') : null });
      }
      for (const r of regs) this.say('register', r.name + ' becomes ' + (r.w > 1 ? r.w + ' D flip-flops' : 'a D flip-flop') + ' clocked on the ' + (edge === 'rise' ? 'rising' : 'falling') + ' edge of ' + (sp.clock.expr.name || 'the clock') + (r.reset ? ', with asynchronous ' + r.reset : ''), { name: r.name, width: r.w, edge, line: blk.node.line });
      const roots = this.ffs.flatMap((f) => [f.d, f.set, f.rst]);
      this.say('seq', 'the next-state logic of the always block at line ' + blk.node.line + ' becomes ' + this.describe(before, roots), { line: blk.node.line });
      this.rootsOf.set(this.trace[this.trace.length - 1], roots);
    }

    // ---- state machines: a register whose next value is chosen by a case on itself, among constants -----------------------
    findFsms() {
      const W = this.W;
      const regs = new Map();
      for (const [st, blk] of this.owner) if (blk.kind === 'seq' && !st.arr) regs.set(st, blk);
      const caseOn = (s, out) => { if (!s || typeof s !== 'object') return out; if (s.k === 'case') out.push(s); for (const k of ['then', 'else', 'body', 'stmt']) caseOn(s[k], out); for (const x of s.stmts || []) caseOn(x, out); for (const a of s.arms || []) caseOn(a.stmt, out); return out; };
      for (const [st, blk] of regs) {
        // the state register is st, or st <= next where next is computed by a case on st
        const allBlocks = [...new Set(this.owner.values())];
        let found = null;
        for (const b of allBlocks) {
          for (const cs of caseOn(b.body, [])) {
            if (cs.expr.k !== 'id') continue;
            const sym = V.Elab.resolve(W, b.sc, cs.expr, true);
            if (!sym || sym.st !== st) continue;
            found = { b, cs };
          }
        }
        if (!found) continue;
        const nameOf = new Map();
        for (const s of found.b.sc.inst.syms.values()) if (s.k === 'param' && s.value && !s.value.b) nameOf.set(String(s.value.a), s.name);
        const states = [], trans = [];
        // the next-state variable: what the register's own block loads into it (st <= nx)
        const nextSt = new Set([st]);
        const loads = (s) => {
          if (!s || typeof s !== 'object') return;
          if ((s.k === 'ba' || s.k === 'nba') && s.lhs.k === 'id' && s.rhs && s.rhs.k === 'id') {
            const l = V.Elab.resolve(W, blk.sc, s.lhs, true), r = V.Elab.resolve(W, blk.sc, s.rhs, true);
            if (l && r && l.st === st && r.st) nextSt.add(r.st);
          }
          for (const k of ['then', 'else', 'body', 'stmt']) loads(s[k]);
          for (const x of s.stmts || []) loads(x);
          for (const a of s.arms || []) loads(a.stmt);
        };
        loads(blk.body);
        const targets = (s, out) => {
          if (!s || typeof s !== 'object') return out;
          if ((s.k === 'ba' || s.k === 'nba') && s.lhs.k === 'id') {
            const ls = V.Elab.resolve(W, found.b.sc, s.lhs, true);
            if (ls && ls.st && (nextSt.has(ls.st) || ls.name.toLowerCase().includes('next'))) {
              // a constant, or either side of a choice (x ? B : A)
              const consts = (e) => {
                if (e.k === 'cond') { consts(e.a); consts(e.b); return; }
                if (!V.Expr.isConst(W, found.b.sc, e)) return;
                const v = V.Elab.constVal(W, found.b.sc, e);
                if (typeof v !== 'number' && !v.b) out.push(nameOf.get(String(v.a)) || String(v.a));
              };
              consts(s.rhs);
            }
          }
          for (const k of ['then', 'else', 'body', 'stmt']) targets(s[k], out);
          for (const x of s.stmts || []) targets(x, out);
          for (const a of s.arms || []) targets(a.stmt, out);
          return out;
        };
        for (const arm of found.cs.arms) {
          const froms = arm.exprs ? arm.exprs.map((e) => { try { const v = V.Elab.constVal(W, found.b.sc, e); return typeof v === 'number' ? String(v) : nameOf.get(String(v.a)) || String(v.a); } catch (er) { return '?'; } }) : ['default'];
          for (const f of froms) { if (f !== 'default' && !states.includes(f)) states.push(f); for (const tgt of [...new Set(targets(arm.stmt, []))]) trans.push({ from: f, to: tgt }); }
        }
        // states with no item of their own (taken by the default arm) are still states when something goes there
        const items = states.slice();
        for (const t of trans) if (t.to && !states.includes(t.to)) states.push(t.to);
        if (states.length < 2) continue;
        const byDefault = states.filter((x) => !items.includes(x));
        const hasDefault = found.cs.arms.some((a) => !a.exprs);
        const fsm = { state: st.sym.name, width: st.w, states, transitions: trans, line: found.cs.line, byDefault };
        this.fsms.push(fsm);
        this.say('fsm', st.sym.name + ' is the state register of a state machine with states ' + states.join(', ') + (byDefault.length && hasDefault ? ' (' + byDefault.join(', ') + ' through the default arm)' : '') + '; the case at line ' + found.cs.line + ' becomes its next-state logic', fsm);
      }
    }

    // ---- the block view -----------------------------------------------------------------------------------------------------
    // The circuit as a drafter draws it: a register of flip-flops that count becomes a COUNTER, one that loads (or
    // just stores) becomes a REG, and the remaining small logic (the next state of a state machine, the outputs)
    // becomes sums of products, with flip-flops whose Q′ gives the complements. Each is checked against the bit
    // graph on every input, so the blocks do exactly what the gates would.
    /** the leaves (inputs and register bits) a node depends on */
    support(x) {
      const d = this.d, out = new Set(), seen = new Set(), stack = [x];
      while (stack.length) {
        const y = stack.pop();
        if (y < 2 || seen.has(y)) continue;
        seen.add(y);
        const n = d.n[y];
        if (n.op === 'in' || n.op === 'q' || n.op === 'lq' || n.op === 'hold') { out.add(y); continue; }
        for (const k of ['a', 'b', 'c']) if (n[k] !== undefined) stack.push(n[k]);
      }
      return out;
    }
    /** a node's value for an assignment of its leaves (env: leaf → 0|1) */
    evalAt(x, env, memo) {
      memo = memo || new Map();
      if (x < 2) return x;
      if (env.has(x)) return env.get(x);
      if (memo.has(x)) return memo.get(x);
      const n = this.d.n[x], v = (k) => this.evalAt(n[k], env, memo);
      let r;
      switch (n.op) {
        case 'not': r = 1 - v('a'); break;
        case 'and': r = v('a') & v('b'); break;
        case 'or': r = v('a') | v('b'); break;
        case 'xor': r = v('a') ^ v('b'); break;
        case 'mux': r = v('a') ? v('c') : v('b'); break;
        case 'fas': r = v('a') ^ v('b') ^ v('c'); break;
        case 'fac': { const a = v('a'), b = v('b'), c = v('c'); r = (a & b) | (a & c) | (b & c); break; }
        default: throw new Error('cannot evaluate ' + n.op);
      }
      memo.set(x, r);
      return r;
    }
    /** the minterms of a node over the leaves vs (vs[0] the most significant) */
    onesOf(x, vs) {
      const ones = [], k = vs.length;
      for (let m = 0; m < 1 << k; m++) { const env = new Map(vs.map((y, j) => [y, (m >> (k - 1 - j)) & 1])); if (this.evalAt(x, env)) ones.push(m); }
      return ones;
    }
    /** a minimal sum of products as nodes of the graph */
    sopNode(vs, ones) {
      const d = this.d, cubes = S.Fsm.util.minimise(vs.map((y) => 'L' + y), ones, []).cubes;
      let r = 0;
      for (const cube of cubes) {
        let t = 1;
        for (let j = 0; j < cube.length; j++) if (cube[j] !== '-') t = d.and(t, cube[j] === '1' ? vs[j] : d.not(vs[j]));
        r = d.or(r, t);
      }
      return r;
    }
    blockPlan() {
      const d = this.d, plan = { groups: [], grouped: new Map(), direct: new Map(), co: new Map(), sop: false };
      const fsmNames = new Set(this.fsms.map((f) => f.state));
      const byName = new Map();
      for (const f of this.ffs) { if (!byName.has(f.name)) byName.set(f.name, []); byName.get(f.name).push(f); }
      const plain = (x) => d.n[x].op === 'in' || d.n[x].op === 'q';
      for (const [name, bits] of byName) {
        if (bits.length < 2 || fsmNames.has(name)) continue;
        bits.sort((a, b) => a.bit - b.bit);
        const w = bits.length, f0 = bits[0];
        if (bits.some((f) => f.set !== 0 || f.rst !== f0.rst || f.clk !== f0.clk || f.edge !== f0.edge)) continue;
        let clr = null, clrLow = false;
        if (f0.rst !== 0) { const n = d.n[f0.rst]; if (n.op === 'not') { clr = n.a; clrLow = true; } else clr = f0.rst; }
        const q = bits.map((f) => f.q), qs = new Set(q);
        const L = [...new Set(bits.flatMap((f) => [...this.support(f.d)]))].filter((x) => !qs.has(x));
        const g = { name, w, bits, clk: f0.clk, edge: f0.edge, clr, clrLow, q, L };
        // a counter: for each value of the other leaves, the register either counts up by one or holds
        if (w <= 8 && L.length <= 6 && L.every(plain)) {
          const k = L.length, enOnes = [];
          let ok = true;
          for (let m = 0; m < 1 << k && ok; m++) {
            let inc = true, hold = true;
            for (let v = 0; v < 1 << w && (inc || hold); v++) {
              const env = new Map(q.map((x, i) => [x, (v >> i) & 1]).concat(L.map((x, j) => [x, (m >> (k - 1 - j)) & 1])));
              const memo = new Map();
              let nx = 0;
              bits.forEach((f, i) => { nx |= this.evalAt(f.d, env, memo) << i; });
              if (nx !== (v + 1) % (1 << w)) inc = false;
              if (nx !== v) hold = false;
            }
            if (inc) enOnes.push(m); else if (!hold) ok = false;
          }
          if (ok && enOnes.length) {
            Object.assign(g, { kind: 'COUNTER', enOnes: new Set(enOnes), en: enOnes.length === 1 << k ? null : this.sopNode(L, enOnes) });
            plan.groups.push(g);
            continue;
          }
        }
        // a register that loads on one select (and holds otherwise), or that stores whatever comes
        const ns = bits.map((f) => d.n[f.d]), low = ns[0].op === 'mux' && ns[0].c === q[0];
        if (ns.every((n, i) => n.op === 'mux' && n.a === ns[0].a && (low ? n.c === q[i] : n.b === q[i]))) {
          Object.assign(g, { kind: 'REG', ld: low ? d.not(ns[0].a) : ns[0].a, D: ns.map((n) => (low ? n.b : n.c)) });
          plan.groups.push(g);
        } else if (!bits.some((f) => [...this.support(f.d)].some((x) => qs.has(x)))) {
          Object.assign(g, { kind: 'REG', ld: null, D: bits.map((f) => f.d) });
          plan.groups.push(g);
        }
      }
      for (const g of plan.groups) for (const f of g.bits) plan.grouped.set(f, g);
      // outputs that are a whole register, or a counter's terminal count
      for (const o of this.outs) {
        for (const g of plan.groups) {
          if (o.width === g.w && o.bits.every((b, i) => b === g.q[i])) { plan.direct.set(o, g); break; }
          if (g.kind !== 'COUNTER' || o.width !== 1) continue;
          const x = o.bits[0], qs = new Set(g.q), k = g.L.length;
          if (![...this.support(x)].every((y) => qs.has(y) || g.L.includes(y))) continue;
          let same = true;
          for (let m = 0; m < 1 << k && same; m++) for (let v = 0; v < 1 << g.w && same; v++) {
            const env = new Map(g.q.map((y, i) => [y, (v >> i) & 1]).concat(g.L.map((y, j) => [y, (m >> (k - 1 - j)) & 1])));
            if (this.evalAt(x, env) !== (g.enOnes.has(m) && v === (1 << g.w) - 1 ? 1 : 0)) same = false;
          }
          if (same) { plan.co.set(o, g); g.co = true; break; }
        }
      }
      // the rest as sums of products, when it is small enough to read that way
      if (!this.latches.length) {
        const fns = this.ffs.filter((f) => !plan.grouped.has(f)).map((f) => f.d).concat(this.outs.filter((o) => !plan.direct.has(o) && !plan.co.has(o)).flatMap((o) => o.bits));
        const all = new Set();
        let ok = true;
        for (const x of fns) { const s = this.support(x); if (s.size > 6 || [...s].some((y) => !plain(y))) ok = false; for (const y of s) all.add(y); }
        plan.sop = ok && all.size <= 10;
      }
      return plan;
    }

    // ---- the parts --------------------------------------------------------------------------------------------------------
    roots(plan) {
      const r = [];
      for (const o of this.outs) if (!plan || (!plan.direct.has(o) && !plan.co.has(o))) r.push(...o.bits);
      for (const f of this.ffs) if (!plan || !plan.grouped.has(f)) r.push(f.d, f.clk, f.set, f.rst);
      if (plan) for (const g of plan.groups) r.push(...[g.clk, g.clr, g.ld, g.en].filter((x) => x != null), ...(g.D || []));
      for (const l of this.latches) r.push(l.d, l.en);
      return r;
    }
    live(plan) {
      const seen = new Set(), stack = this.roots(plan).slice();
      while (stack.length) {
        const x = stack.pop();
        if (x < 2 || seen.has(x)) continue;
        seen.add(x);
        const n = this.d.n[x];
        for (const k of ['a', 'b', 'c']) if (n[k] !== undefined && n.op !== 'in' && n.op !== 'q' && n.op !== 'lq') stack.push(n[k]);
      }
      return seen;
    }
    /** the circuit: view 'gates' builds every bit from gates; otherwise registers and counters are blocks */
    lower(view, noSop) {
      const N = S.Netlist, d = this.d;
      const plan = view === 'gates' ? null : this.blockPlan();
      const c = new N.Circuit(this.root.mod.name);
      const hasSplit = !!(S.Parts && S.Parts.registry && S.Parts.registry.SPLIT && S.Parts.registry.MERGE);
      const inBit = new Map(), inBus = new Map();
      for (const p of this.ports) {
        if (p.dir === 'input') {
          if (p.width === 1 || !hasSplit) {
            if (p.width === 1) inBit.set(p.name + ':0', c.input(p.name, 1).pin('y'));
            else for (let i = 0; i < p.width; i++) inBit.set(p.name + ':' + i, c.input(p.name + '[' + i + ']', 1).pin('y'));
          } else inBus.set(p.name, { inp: c.input(p.name, p.width), w: p.width, sp: null });
        }
      }
      // a bus input is split into bits only when a bit is used on its own
      const inPin = (name, bit) => {
        const k = name + ':' + bit;
        if (inBit.has(k)) return inBit.get(k);
        const b = inBus.get(name);
        if (!b.sp) { b.sp = c.add('SPLIT', { w: b.w }); c.connect(b.inp.pin('y'), b.sp.pin('a')); }
        return b.sp.pin('y' + bit);
      };
      // fan-out, so chains of one gate type with single use become one wide gate
      const uses = new Map();
      const live = this.live(plan);
      for (const x of live) { const n = d.n[x]; for (const k of ['a', 'b', 'c']) if (n[k] !== undefined && n.op !== 'in' && n.op !== 'q' && n.op !== 'lq') uses.set(n[k], (uses.get(n[k]) || 0) + 1); }
      for (const r of this.roots(plan)) uses.set(r, (uses.get(r) || 0) + 1);
      const ref = new Map(), consts = {}, fas = new Map(), ffPart = new Map(), latchPart = new Map(), qLazy = new Map(), groupPart = new Map();
      const madeBy = new Map(); // part -> the graph node whose logic it builds (for the notes' counts)
      const sop = !!(plan && plan.sop && !noSop && this.ffs.some((f) => !plan.grouped.has(f)));
      if (plan) for (const g of plan.groups) {
        const p = g.kind === 'COUNTER' ? c.add('COUNTER', { w: g.w, en: g.en != null, clr: g.clr != null, clrLow: g.clrLow, co: !!g.co, edge: g.edge }) : c.add('REG', { w: g.w, ld: g.ld != null, clr: g.clr != null, clrLow: g.clrLow, edge: g.edge });
        groupPart.set(g, p);
        c.name(p.pin('q'), g.name, false);
        let sp = null;
        g.q.forEach((x, i) => qLazy.set(x, () => { if (!sp) { sp = c.add('SPLIT', { w: g.w }); c.connect(p.pin('q'), sp.pin('a')); } return sp.pin('y' + i); }));
      }
      for (const f of this.ffs) {
        if (plan && plan.grouped.has(f)) continue;
        const p = c.add('DFF', { edge: f.edge, set: f.set !== 0, reset: f.rst !== 0, qn: sop });
        ffPart.set(f.q, { p, f });
        ref.set(f.q, p.pin('q'));
        c.name(p.pin('q'), f.name + (f.w > 1 ? '[' + f.bit + ']' : ''), false);
      }
      for (const l of this.latches) {
        const p = c.add('LATCH', { qn: false });
        latchPart.set(l.q, { p, l });
        ref.set(l.q, p.pin('q'));
        c.name(p.pin('q'), l.name + '[' + l.bit + ']', false);
      }
      const get = (x) => {
        if (ref.has(x)) return ref.get(x);
        if (qLazy.has(x)) { const r = qLazy.get(x)(); ref.set(x, r); return r; }
        let r;
        const n = d.n[x];
        if (x < 2) { if (!consts[x]) consts[x] = c.constant(x, 1).pin('y'); return consts[x]; }
        switch (n.op) {
          case 'in': r = inPin(n.name, n.bit); break;
          case 'not': { const g = c.gate('NOT'); madeBy.set(g, x); c.connect(get(n.a), g.pin('i0')); r = g.pin('y'); break; }
          case 'and': case 'or': case 'xor': {
            const ins = [];
            const collect = (y) => { const m = d.n[y]; if (y >= 2 && m.op === n.op && (uses.get(y) || 0) <= 1 && !ref.has(y) && ins.length < 3 && n.op !== 'xor') { collect(m.a); collect(m.b); } else ins.push(y); };
            collect(n.a); collect(n.b);
            const g = c.gate(n.op.toUpperCase(), ins.length);
            madeBy.set(g, x);
            ins.forEach((y, i) => c.connect(get(y), g.pin('i' + i)));
            r = g.pin('y');
            break;
          }
          case 'mux': {
            const m = c.add('MUX', { n: 2, w: 1 });
            madeBy.set(m, x);
            c.connect(get(n.b), m.pin('d0')); c.connect(get(n.c), m.pin('d1')); c.connect(get(n.a), m.pin('s0'));
            r = m.pin('y');
            break;
          }
          case 'fas': case 'fac': {
            const k = n.a + ',' + n.b + ',' + n.c;
            let fa = fas.get(k);
            if (!fa) {
              fa = c.add('FA', {});
              madeBy.set(fa, x);
              fas.set(k, fa);
              c.connect(get(n.a), fa.pin('a')); c.connect(get(n.b), fa.pin('b')); c.connect(get(n.c), fa.pin('cin'));
            }
            r = fa.pin(n.op === 'fas' ? 's' : 'cout');
            break;
          }
          case 'hold': r = get(0); break;
          default: throw new Error('cannot lower ' + n.op);
        }
        ref.set(x, r);
        return r;
      };
      // the blocks' controls and data
      if (plan) for (const g of plan.groups) {
        const p = groupPart.get(g);
        c.connect(get(g.clk), p.pin('clk'));
        if (g.clr != null) c.connect(get(g.clr), p.pin('clr'));
        if (g.kind === 'COUNTER') { if (g.en != null) c.connect(get(g.en), p.pin('en')); continue; }
        if (g.ld != null) c.connect(get(g.ld), p.pin('ld'));
        // a whole input bus straight in, else the bits merged
        const n0 = d.n[g.D[0]], b = n0.op === 'in' ? inBus.get(n0.name) : null;
        if (b && b.w === g.w && g.D.every((x, i) => d.n[x].op === 'in' && d.n[x].name === n0.name && d.n[x].bit === i)) c.connect(b.inp.pin('y'), p.pin('d'));
        else { const mg = c.add('MERGE', { w: g.w }); c.connect(mg.pin('y'), p.pin('d')); g.D.forEach((x, i) => c.connect(get(x), mg.pin('a' + i))); }
      }
      // small logic as sums of products, each function its own gates, over the inputs and the flip-flops' Q and Q′
      const srcs = {}, fns = [];
      const drive = (x, to) => {
        if (!sop || x < 2) { c.connect(get(x), to); return; }
        const vs = [...this.support(x)], names = vs.map((y) => 'L' + y);
        vs.forEach((y, j) => { if (!srcs[names[j]]) { const fp = ffPart.get(y); srcs[names[j]] = { pos: get(y), neg: fp ? fp.p.pin('qn') : null }; } });
        fns.push({ cubes: S.Fsm.util.minimise(names, this.onesOf(x, vs), []).cubes, vars: names, to, root: x });
      };
      for (const [, { p, f }] of ffPart) {
        drive(f.d, p.pin('d')); c.connect(get(f.clk), p.pin('clk'));
        if (f.set !== 0) c.connect(get(f.set), p.pin('set'));
        if (f.rst !== 0) c.connect(get(f.rst), p.pin('rst'));
      }
      for (const [, { p, l }] of latchPart) { c.connect(get(l.d), p.pin('d')); c.connect(get(l.en), p.pin('en')); }
      for (const o of this.outs) {
        if (plan && plan.direct.has(o)) { c.connect(groupPart.get(plan.direct.get(o)).pin('q'), c.output(o.name, o.width).pin('a')); continue; }
        if (plan && plan.co.has(o)) { c.connect(groupPart.get(plan.co.get(o)).pin('co'), c.output(o.name, 1).pin('a')); continue; }
        if (o.width === 1 || !hasSplit) {
          if (o.width === 1) drive(o.bits[0], c.output(o.name, 1).pin('a'));
          else o.bits.forEach((b, i) => drive(b, c.output(o.name + '[' + i + ']', 1).pin('a')));
        } else {
          const mg = c.add('MERGE', { w: o.width }), out = c.output(o.name, o.width);
          c.connect(mg.pin('y'), out.pin('a'));
          o.bits.forEach((b, i) => drive(b, mg.pin('a' + i)));
        }
      }
      // one function at a time (unshared, so the same gates), to know which logic each gate belongs to
      for (const fn of fns) { const k = c.parts.length; S.Fsm.util.sopGates(c, srcs, [fn], { share: false }); for (const p of c.parts.slice(k)) madeBy.set(p, fn.root); }
      c.sop = sop;
      c.madeBy = madeBy;
      // pins nothing uses
      for (const p of c.parts) for (const q of p.pins) if (q.dir === 'out' && !p.net[q.name]) c.leaveOpen(p.pin(q.name));
      for (const p of c.parts) for (const q of p.pins) if (q.dir === 'in' && !p.net[q.name]) c.connect(get(0), p.pin(q.name));
      return c;
    }
  }
  Y.Synth = Synth;
})(globalThis.Sirkit = globalThis.Sirkit || {});
