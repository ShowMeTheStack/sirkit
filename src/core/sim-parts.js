// The parts library: every part type the simulator knows, each with its parameters (the schema the edit
// dialog shows), its pins, its behaviour and hints for drawing it. The 74-series chips are in sim-chips.js.
//
// A behaviour sees one object, io, for the part it runs on:
//   io.p          the parameters, defaults filled in       io.st   the part's state (storage parts)
//   io.t          the time now, ns                         io.has(pin) whether the part has that pin
//   io.v(pin)     the input as a number, or -1 when any bit is X or Z (Z reads as X, or 1 with floatHigh)
//   io.b(pin)     the same for a 1-bit input: 0, 1 or -1
//   io.act(pin, low)  1 when the control input is active (low: active-low), 0 when not, -1 when unknown
//   io.pass(pin)  sets io.A, io.B to the input's four-state words with Z read as X, for passing data along
//   io.out(pin, v, d)   drive an output: a number, io.X (-1) or io.Z (-2); after delay d (default: the part's)
//   io.outAB(pin, a, b, d, transport)   drive four-state words; transport keeps earlier pending changes
//   io.timer(d, tag)    call the part's timer(io, st, tag) d ns from now
// Combinational parts give eval(io). Storage parts give seq (clock pin, active edge, the inputs checked for
// setup and hold, the asynchronous inputs), init(p) for the power-up state {q, x} (x marks unknown bits),
// async(io, st) for asynchronous controls (true when they force the state), edge(io, st) for the active
// clock edge, level(io, st) for level-sensitive storage, and out(io, st) to drive the outputs from the state.
// seq.rest(p) lists the level controls ({pin, low}) that read as resting until something first drives them
// (default: the asynchronous inputs), so the power-up state survives the moment before the inputs arrive.
(function (S) {
  'use strict';
  const P = S.Parts = S.Parts || {};
  const R = P.registry = P.registry || {};
  const mask = (w) => (w >= 32 ? 0xFFFFFFFF : ((1 << w) >>> 0) - 1);
  const log2 = (n) => Math.max(1, Math.ceil(Math.log2(n)));
  const pin = (name, dir, o) => Object.assign({ name, dir, width: 1, side: dir === 'in' ? 'left' : 'right', label: null, clock: false }, o || {});
  P.pin = pin;
  const X = -1, Z = -2;

  // ---- the parameter schema ---------------------------------------------------------------------------------
  const int = (name, def, label, min, max) => ({ name, type: 'int', default: def, label, min, max });
  const num = (name, def, label, min) => ({ name, type: 'number', default: def, label, min });
  const bool = (name, def, label) => ({ name, type: 'bool', default: def, label });
  const choice = (name, def, label, choices) => ({ name, type: 'choice', default: def, label, choices });
  const text = (name, def, label) => ({ name, type: 'text', default: def, label });
  const delays = [num('tpLH', null, 'Delay, output rising (ns; blank for the technology’s)', 0), num('tpHL', null, 'Delay, output falling (ns)', 0)];
  const seqTiming = [num('tsu', null, 'Setup time (ns)', 0), num('th', null, 'Hold time (ns)', 0), num('tcq', null, 'Clock-to-Q (ns)', 0)];
  const edgeP = choice('edge', 'rise', 'Active clock edge', ['rise', 'fall']);

  function def(type, spec) { spec.type = type; spec.params = spec.params || []; R[type] = spec; return spec; }
  P.def = def;
  /** the parameters of a part with the schema defaults filled in */
  P.withDefaults = (type, p) => {
    const spec = R[type], out = {};
    if (spec) for (const q of spec.params) if (q.default !== null && q.default !== undefined) out[q.name] = q.default;
    return Object.assign(out, p || {});
  };
  P.defaults = (type) => P.withDefaults(type, {});
  P.list = () => Object.values(R);
  P.groups = () => { const g = {}; for (const s of Object.values(R)) if (!s.hidden) (g[s.group] = g[s.group] || []).push(s.type); return g; };

  // the hook Netlist.pinsOf consults: pins for registry types, and the netlist's own pins for its types (with
  // the extra pins some new parameters add)
  let marked = false;
  P.pinsOf = function (type, p, base) {
    if (!marked && S.Netlist) { marked = true; for (const t of Object.keys(R)) if (R[t].seq && R[t].kind !== 'chip') S.Netlist.SEQUENTIAL.add(t); }
    const spec = R[type];
    if (!spec || !spec.pins) return null;
    return spec.pins(P.withDefaults(type, p), base);
  };

  // ---- helpers for behaviours -----------------------------------------------------------------------------
  /** the select value of a multiplexer-like part, from a bus s or bits s0.. */
  function sel(io, k) {
    if (io.p.selBus) return io.v('s');
    let v = 0;
    for (let i = 0; i < k; i++) { const b = io.b('s' + i); if (b < 0) return -1; v |= b << i; }
    return v;
  }
  /** enable of a part with an optional en pin: 1, 0 or -1 */
  const enable = (io) => (io.has('en') ? io.act('en', io.p.enLow) : 1);
  const setQ = (st, v, w) => { if (v < 0) { st.x = mask(w); } else { st.q = (v >>> 0) & mask(w); st.x = 0; } };
  const outQ = (io, pinName, st, w, d) => io.outAB(pinName, (st.q | st.x) >>> 0, st.x >>> 0, d);
  const outQn = (io, pinName, st, w, d) => io.outAB(pinName, ((~st.q | st.x) & mask(w)) >>> 0, st.x >>> 0, d);
  P.helpers = { sel, enable, setQ, mask };

  // ---- gates ------------------------------------------------------------------------------------------------
  const gateKinds = ['NOT', 'BUF', 'AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'];
  for (const g of gateKinds) {
    const one = g === 'NOT' || g === 'BUF';
    def(g, {
      label: { NOT: 'Inverter', BUF: 'Buffer' }[g] || g + ' gate', group: 'Gates', kind: 'gate', gate: g,
      params: (one ? [] : [int('n', 2, 'Inputs', 2, 8)]).concat([choice('out', 'push', 'Output', ['push', 'oc', 'tri']), bool('oeLow', false, 'Output enable active low')], delays),
      pins(p, base) { const out = base(g, p); if (p.out === 'tri') out.splice(out.length - 1, 0, pin('oe', 'in', { side: 'top', label: 'OE' })); return out; },
      tech: () => g,
      symbol: { shape: 'gate', gate: g },
      doc: one ? (g === 'NOT' ? 'Output is the complement of the input.' : 'Output follows the input; used to drive many loads or as a tristate driver.') : 'An ' + g + ' of n inputs; open-collector or tristate output as an option.',
    });
  }
  def('TRI', {
    label: 'Tristate buffer', group: 'Gates', kind: 'comb',
    params: [int('w', 1, 'Width', 1, 32), bool('enLow', false, 'Enable active low'), bool('invert', false, 'Inverting')].concat(delays),
    pins: (p) => [pin('a', 'in', { width: p.w }), pin('en', 'in', { side: 'top', label: p.enLow ? "EN'" : 'EN' }), pin('y', 'out', { width: p.w })],
    tech: () => 'TRI', symbol: { shape: 'tri' },
    doc: 'Passes its input when enabled; otherwise lets go of the wire (Z), so several can share a bus.',
    eval(io) {
      const e = io.act('en', io.p.enLow), m = mask(io.p.w);
      if (e === 0) return io.out('y', Z);
      if (e < 0) return io.out('y', X);
      io.pass('a');
      if (io.p.invert) io.outAB('y', ((~io.A | io.B) & m) >>> 0, io.B); else io.outAB('y', io.A, io.B);
    },
  });

  // ---- plexers ----------------------------------------------------------------------------------------------
  def('MUX', {
    label: 'Multiplexer', group: 'Plexers', kind: 'comb',
    params: [int('n', 2, 'Data inputs', 2, 16), int('w', 1, 'Width', 1, 32), bool('selBus', false, 'Select as one bus'), bool('en', false, 'Enable input'), bool('enLow', false, 'Enable active low')].concat(delays),
    pins: (p, base) => base('MUX', p),
    tech: () => 'MUX', symbol: { shape: 'mux' },
    doc: 'Routes the data input chosen by the select lines to the output.',
    eval(io) {
      const p = io.p, k = log2(p.n), e = enable(io);
      if (e === 0) return io.out('y', 0);
      const s = sel(io, k);
      if (e < 0 || s < 0) {
        // unknown select: the output is still known where every data input agrees
        let a0 = null, same = true;
        for (let i = 0; i < p.n && same; i++) { io.pass('d' + i); if (io.B) same = false; else if (a0 === null) a0 = io.A; else if (io.A !== a0) same = false; }
        return same && e > 0 ? io.out('y', a0) : io.out('y', X);
      }
      if (s >= p.n) return io.out('y', 0);
      io.pass('d' + s); io.outAB('y', io.A, io.B);
    },
  });
  def('DEMUX', {
    label: 'Demultiplexer', group: 'Plexers', kind: 'comb',
    params: [int('n', 2, 'Outputs', 2, 16), int('w', 1, 'Width', 1, 32), bool('selBus', false, 'Select as one bus'), bool('en', false, 'Enable input'), bool('enLow', false, 'Enable active low')].concat(delays),
    pins(p) {
      const k = log2(p.n), out = [pin('d', 'in', { width: p.w, label: 'D' })];
      if (p.selBus) out.push(pin('s', 'in', { width: k, side: 'bottom' })); else for (let i = k - 1; i >= 0; i--) out.push(pin('s' + i, 'in', { side: 'bottom' }));
      if (p.en) out.push(pin('en', 'in', { side: 'top' }));
      for (let i = 0; i < p.n; i++) out.push(pin('y' + i, 'out', { width: p.w, label: String(i) }));
      return out;
    },
    tech: () => 'DEMUX', symbol: { shape: 'demux' },
    doc: 'Sends the data input to the output chosen by the select lines; the others are 0.',
    eval(io) {
      const p = io.p, e = enable(io), s = e === 0 ? -2 : sel(io, log2(p.n));
      io.pass('d');
      const A = io.A, B = io.B;
      for (let i = 0; i < p.n; i++) {
        if (e === 0) io.out('y' + i, 0);
        else if (s < 0 || e < 0) io.out('y' + i, X);
        else if (s === i) io.outAB('y' + i, A, B);
        else io.out('y' + i, 0);
      }
    },
  });
  def('DECODER', {
    label: 'Decoder', group: 'Plexers', kind: 'comb',
    params: [int('k', 2, 'Address bits (2^k outputs)', 1, 5), bool('en', false, 'Enable input'), bool('enLow', false, 'Enable active low'), bool('activeLow', false, 'Outputs active low')].concat(delays),
    pins: (p, base) => base('DECODER', p),
    tech: () => 'DECODER', symbol: { shape: 'box', text: 'DEC' },
    doc: 'Exactly one output, the one numbered by the address, is active (when enabled).',
    eval(io) {
      const p = io.p, e = enable(io);
      let a = 0, unk = 0;
      for (let i = 0; i < p.k; i++) { const b = io.b('a' + i); if (b < 0) unk |= 1 << i; else a |= b << i; }
      for (let i = 0; i < 1 << p.k; i++) {
        let y;
        if (e === 0 || ((i ^ a) & ~unk)) y = 0;
        else if (unk || e < 0) y = X;
        else y = 1;
        io.out('y' + i, y === X ? X : p.activeLow ? 1 - y : y);
      }
    },
  });
  def('ENCODER', {
    label: 'Encoder', group: 'Plexers', kind: 'comb',
    params: [int('n', 4, 'Inputs', 2, 16), bool('valid', false, 'Valid output')].concat(delays),
    pins(p) {
      const k = log2(p.n), out = [];
      for (let i = 0; i < p.n; i++) out.push(pin('d' + i, 'in', { label: 'D' + i }));
      for (let i = 0; i < k; i++) out.push(pin('y' + i, 'out', { label: 'Y' + i }));
      if (p.valid) out.push(pin('v', 'out', { label: 'V' }));
      return out;
    },
    tech: () => 'ENCODER', symbol: { shape: 'box', text: 'ENC' },
    doc: 'The binary number of the active input; with more than one active, the OR of their numbers (as the OR-gate circuit gives).',
    eval(io) {
      const p = io.p, k = log2(p.n);
      let code = 0, unk = 0, any = 0;
      for (let i = 0; i < p.n; i++) { const b = io.b('d' + i); if (b < 0) { unk |= i; any = any || -1; } else if (b) { code |= i; any = 1; } }
      for (let j = 0; j < k; j++) io.out('y' + j, (code >> j) & 1 ? 1 : (unk >> j) & 1 ? X : 0);
      if (p.valid) io.out('v', any === 1 ? 1 : any < 0 ? X : 0);
    },
  });
  def('PRIENC', {
    label: 'Priority encoder', group: 'Plexers', kind: 'comb',
    params: [int('n', 4, 'Inputs', 2, 16)].concat(delays),
    pins(p) {
      const k = log2(p.n), out = [];
      for (let i = 0; i < p.n; i++) out.push(pin('d' + i, 'in', { label: 'D' + i }));
      for (let i = 0; i < k; i++) out.push(pin('y' + i, 'out', { label: 'Y' + i }));
      out.push(pin('v', 'out', { label: 'V' }));
      return out;
    },
    tech: () => 'PRIENC', symbol: { shape: 'box', text: 'PRI' },
    doc: 'The number of the highest-numbered active input, and V = 1 when any input is active.',
    eval(io) {
      const p = io.p, k = log2(p.n);
      let code = -2;
      for (let i = p.n - 1; i >= 0; i--) { const b = io.b('d' + i); if (b < 0) { code = X; break; } if (b) { code = i; break; } }
      for (let j = 0; j < k; j++) io.out('y' + j, code === X ? X : code < 0 ? 0 : (code >> j) & 1);
      io.out('v', code === X ? X : code < 0 ? 0 : 1);
    },
  });

  // ---- arithmetic -------------------------------------------------------------------------------------------
  def('HA', {
    label: 'Half adder', group: 'Arithmetic', kind: 'comb', params: delays.slice(),
    pins: () => [pin('a', 'in', { label: 'A' }), pin('b', 'in', { label: 'B' }), pin('s', 'out', { label: 'S' }), pin('c', 'out', { label: 'C' })],
    tech: () => 'HA', symbol: { shape: 'box', text: 'HA' },
    doc: 'S = A ⊕ B, C = AB.',
    eval(io) { const a = io.b('a'), b = io.b('b'); io.out('s', a < 0 || b < 0 ? X : a ^ b); io.out('c', a === 0 || b === 0 ? 0 : a < 0 || b < 0 ? X : 1); },
  });
  def('FA', {
    label: 'Full adder', group: 'Arithmetic', kind: 'comb', params: delays.slice(),
    pins: (p, base) => base('FA', p),
    tech: () => 'FA', symbol: { shape: 'box', text: 'FA' },
    doc: 'S = A ⊕ B ⊕ Cin, Cout = AB + Cin(A ⊕ B).',
    eval(io) {
      const a = io.b('a'), b = io.b('b'), c = io.b('cin');
      if (a < 0 || b < 0 || c < 0) {
        io.out('s', X);
        const ones = (a === 1) + (b === 1) + (c === 1), zeros = (a === 0) + (b === 0) + (c === 0);
        return io.out('cout', ones >= 2 ? 1 : zeros >= 2 ? 0 : X);
      }
      io.out('s', a ^ b ^ c); io.out('cout', (a + b + c) >> 1);
    },
  });
  def('ADDER', {
    label: 'Adder, n bits', group: 'Arithmetic', kind: 'comb',
    params: [int('w', 4, 'Width', 1, 31), bool('cin', true, 'Carry input'), bool('ov', false, 'Overflow output')].concat(delays),
    pins(p) {
      const out = [pin('a', 'in', { width: p.w, label: 'A' }), pin('b', 'in', { width: p.w, label: 'B' })];
      if (p.cin) out.push(pin('cin', 'in', { side: 'right', label: 'Cin' }));
      out.push(pin('s', 'out', { width: p.w, side: 'bottom', label: 'S' }), pin('cout', 'out', { side: 'left', label: 'Cout' }));
      if (p.ov) out.push(pin('v', 'out', { label: 'V' }));
      return out;
    },
    tech: () => 'ADDER', symbol: { shape: 'box', text: 'Σ' },
    doc: 'S = A + B + Cin, with the carry out of the top bit.',
    eval(io) {
      const p = io.p, a = io.v('a'), b = io.v('b'), c = p.cin ? io.b('cin') : 0;
      if (a < 0 || b < 0 || c < 0) { io.out('s', X); io.out('cout', X); if (p.ov) io.out('v', X); return; }
      const m = mask(p.w), r = a + b + c, s = r & m, msb = 1 << (p.w - 1);
      io.out('s', s); io.out('cout', r > m ? 1 : 0);
      if (p.ov) io.out('v', (~(a ^ b) & (a ^ s) & msb) ? 1 : 0);
    },
  });
  def('ADDSUB', {
    label: 'Adder–subtractor', group: 'Arithmetic', kind: 'comb',
    params: [int('w', 4, 'Width', 1, 31)].concat(delays),
    pins: (p) => [pin('a', 'in', { width: p.w, label: 'A' }), pin('b', 'in', { width: p.w, label: 'B' }), pin('m', 'in', { side: 'top', label: 'M' }), pin('s', 'out', { width: p.w, label: 'S' }), pin('cout', 'out', { label: 'C' }), pin('v', 'out', { label: 'V' })],
    tech: () => 'ADDSUB', symbol: { shape: 'box', text: '±' },
    doc: 'M = 0: S = A + B. M = 1: S = A − B, as A + B′ + 1. C is the carry out, V the signed overflow.',
    eval(io) {
      const w = io.p.w, a = io.v('a'), b = io.v('b'), m = io.b('m');
      if (a < 0 || b < 0 || m < 0) { io.out('s', X); io.out('cout', X); io.out('v', X); return; }
      const mk = mask(w), bb = m ? ~b & mk : b, r = a + bb + m, s = r & mk, msb = 1 << (w - 1);
      io.out('s', s); io.out('cout', r > mk ? 1 : 0); io.out('v', (~(a ^ bb) & (a ^ s) & msb) ? 1 : 0);
    },
  });
  def('CMP', {
    label: 'Magnitude comparator', group: 'Arithmetic', kind: 'comb',
    params: [int('w', 4, 'Width', 1, 32), bool('signed', false, 'Signed (two’s complement)')].concat(delays),
    pins: (p) => [pin('a', 'in', { width: p.w, label: 'A' }), pin('b', 'in', { width: p.w, label: 'B' }), pin('lt', 'out', { label: 'A<B' }), pin('eq', 'out', { label: 'A=B' }), pin('gt', 'out', { label: 'A>B' })],
    tech: () => 'CMP', symbol: { shape: 'box', text: 'CMP' },
    doc: 'Compares A with B: exactly one of A<B, A=B, A>B is 1.',
    eval(io) {
      let a = io.v('a'), b = io.v('b');
      if (a < 0 || b < 0) { io.out('lt', X); io.out('eq', X); io.out('gt', X); return; }
      if (io.p.signed) { const w = io.p.w, h = 2 ** (w - 1); if (a >= h) a -= 2 * h; if (b >= h) b -= 2 * h; }
      io.out('lt', a < b ? 1 : 0); io.out('eq', a === b ? 1 : 0); io.out('gt', a > b ? 1 : 0);
    },
  });

  // the ALU operations: (a, b, w) -> [result, carry, overflow]
  const OPS = {
    ADD: (a, b, w) => { const m = mask(w), r = a + b, s = r % (m + 1), h = 2 ** (w - 1); return [s, r > m ? 1 : 0, (a >= h) === (b >= h) && (s >= h) !== (a >= h) ? 1 : 0]; },
    SUB: (a, b, w) => { const m = mask(w), nb = m - b, r = a + nb + 1, s = r % (m + 1), h = 2 ** (w - 1); return [s, r > m ? 1 : 0, (a >= h) !== (b >= h) && (s >= h) !== (a >= h) ? 1 : 0]; },
    AND: (a, b) => [(a & b) >>> 0, 0, 0], OR: (a, b) => [(a | b) >>> 0, 0, 0], XOR: (a, b) => [(a ^ b) >>> 0, 0, 0],
    NAND: (a, b, w) => [(~(a & b) & mask(w)) >>> 0, 0, 0], NOR: (a, b, w) => [(~(a | b) & mask(w)) >>> 0, 0, 0], XNOR: (a, b, w) => [(~(a ^ b) & mask(w)) >>> 0, 0, 0],
    NOT: (a, b, w) => [(~a & mask(w)) >>> 0, 0, 0],
    NEG: (a, b, w) => OPS.SUB(0, a, w),
    INC: (a, b, w) => OPS.ADD(a, 1, w), DEC: (a, b, w) => OPS.SUB(a, 1, w),
    SHL: (a, b, w) => [(a * 2) % (mask(w) + 1), (a >>> (w - 1)) & 1, 0],
    SHR: (a) => [a >>> 1, a & 1, 0],
    ASR: (a, b, w) => [(a >>> 1) | (a & 2 ** (w - 1)), a & 1, 0],
    PASSA: (a) => [a, 0, 0], PASSB: (a, b) => [b, 0, 0], ZERO: () => [0, 0, 0],
    MUL: (a, b, w) => [Number((BigInt(a) * BigInt(b)) % (BigInt(mask(w)) + 1n)), 0, 0],
    SLT: (a, b) => [a < b ? 1 : 0, 0, 0],
  };
  P.ALU_OPS = OPS;
  const ALU_DEFAULT = ['ADD', 'SUB', 'AND', 'OR', 'XOR', 'NOT', 'SHL', 'SHR', 'INC', 'DEC', 'NEG', 'NOR', 'NAND', 'XNOR', 'PASSA', 'PASSB'];
  P.aluOps = (p) => {
    const n = 1 << (p.opw || 2);
    const list = (p.ops ? String(p.ops).split(/[\s,]+/).filter(Boolean).map((s) => s.toUpperCase()) : ALU_DEFAULT.slice(0, n));
    return list.slice(0, n);
  };
  def('ALU', {
    label: 'ALU', group: 'Arithmetic', kind: 'comb',
    params: [int('w', 8, 'Width', 1, 32), int('opw', 2, 'Operation bits', 1, 4), text('ops', '', 'Operations by code, comma-separated (blank: ADD, SUB, AND, OR, XOR, NOT, SHL, SHR, …)'), bool('flags', false, 'Flag outputs Z, C, V, N')].concat(delays),
    pins(p, base) { const out = base('ALU', p); if (p.flags) out.push(pin('z', 'out', { label: 'Z' }), pin('c', 'out', { label: 'C' }), pin('v', 'out', { label: 'V' }), pin('n', 'out', { label: 'N' })); return out; },
    tech: () => 'ALU', symbol: { shape: 'alu' },
    doc: 'Applies the operation numbered by OP to A and B. Codes past the end of the list give 0.',
    eval(io) {
      const p = io.p, a = io.v('a'), b = io.v('b'), op = io.v('op'), ops = P.aluOps(p);
      if (a < 0 || b < 0 || op < 0) { io.out('y', X); if (p.flags) for (const f of ['z', 'c', 'v', 'n']) io.out(f, X); return; }
      const fn = OPS[ops[op]], [y, c, v] = fn ? fn(a, b, p.w) : [0, 0, 0];
      io.out('y', y);
      if (p.flags) { io.out('z', y === 0 ? 1 : 0); io.out('c', c); io.out('v', v); io.out('n', (y >>> (p.w - 1)) & 1); }
    },
  });
  def('MUL', {
    label: 'Multiplier', group: 'Arithmetic', kind: 'comb',
    params: [int('w', 4, 'Width of each operand', 1, 16)].concat(delays),
    pins: (p) => [pin('a', 'in', { width: p.w, label: 'A' }), pin('b', 'in', { width: p.w, label: 'B' }), pin('p', 'out', { width: 2 * p.w, label: 'P' })],
    tech: () => 'MUL', symbol: { shape: 'box', text: '×' },
    doc: 'P = A × B, unsigned, twice as wide as the operands.',
    eval(io) { const a = io.v('a'), b = io.v('b'); io.out('p', a < 0 || b < 0 ? X : a * b); },
  });

  // ---- latches and flip-flops -------------------------------------------------------------------------------
  const ffParams = (extra) => [edgeP, bool('set', false, 'Asynchronous set (preset)'), bool('reset', false, 'Asynchronous reset (clear)'), bool('asyncLow', false, 'Set/reset active low'), bool('en', false, 'Clock enable'), bool('enLow', false, 'Enable active low'), bool('qn', true, 'Q′ output')].concat(extra || [], seqTiming);
  const init1 = () => ({ q: 0, x: 1, both: 0 });
  // asynchronous set and reset of a one-bit storage part; both active drive Q and Q' high together
  function async1(io, st) {
    const p = io.p, s = p.set && io.has('set') ? io.act('set', p.asyncLow) : 0, r = p.reset && io.has('rst') ? io.act('rst', p.asyncLow) : 0;
    st.both = 0;
    if (s === 0 && r === 0) return false;
    if (s === 1 && r === 1) { st.both = 1; st.q = 1; st.x = 0; return true; }
    if (s === 1 && r === 0) { st.q = 1; st.x = 0; return true; }
    if (r === 1 && s === 0) { st.q = 0; st.x = 0; return true; }
    st.x = 1; return true;
  }
  function out1(io, st) {
    if (st.both) { io.out('q', 1); if (io.has('qn')) io.out('qn', 1); return; }
    outQ(io, 'q', st, 1); if (io.has('qn')) outQn(io, 'qn', st, 1);
  }
  const ffSeq = (data) => ({ clock: 'clk', edge: (p) => p.edge || 'rise', data: (p) => data.concat(p.en ? ['en'] : []), async: (p) => (p.set ? [{ pin: 'set', low: p.asyncLow }] : []).concat(p.reset ? [{ pin: 'rst', low: p.asyncLow }] : []), timing: 'ff' });
  const withEn = (type) => (p, base) => { const out = base(type, p); if (p.en) out.splice(out.findIndex((q) => q.name === 'clk') + 1, 0, pin('en', 'in', { label: 'EN' })); return out; };
  // the next state of a one-bit flip-flop, X when an input it needs is unknown
  function ffEdge(io, st, next) {
    const e = enable(io);
    if (e === 0) return;
    const q = st.x ? -1 : st.q, n = next(q);
    if (e < 0) { if (n !== q || n < 0) st.x = 1; return; }
    setQ(st, n, 1);
  }
  def('DFF', {
    label: 'D flip-flop', group: 'Sequential', kind: 'seq', params: ffParams(), pins: withEn('DFF'),
    seq: ffSeq(['d']), init: init1, async: async1, out: out1, symbol: { shape: 'ff', text: 'D' },
    doc: 'Q takes the value of D at the active clock edge.',
    edge(io, st) { ffEdge(io, st, () => io.b('d')); },
  });
  def('JKFF', {
    label: 'JK flip-flop', group: 'Sequential', kind: 'seq', params: ffParams(), pins: withEn('JKFF'),
    seq: ffSeq(['j', 'k']), init: init1, async: async1, out: out1, symbol: { shape: 'ff', text: 'JK' },
    doc: 'At the active edge: J = K = 0 holds, J = 1 sets, K = 1 resets, J = K = 1 toggles.',
    edge(io, st) {
      ffEdge(io, st, (q) => {
        const j = io.b('j'), k = io.b('k');
        if (j === 0 && k === 0) return q;
        if (j === 1 && k === 0) return 1;
        if (j === 0 && k === 1) return 0;
        if (j === 1 && k === 1) return q < 0 ? -1 : 1 - q;
        if (q === 0 && j === 0) return 0;
        if (q === 1 && k === 0) return 1;
        return -1;
      });
    },
  });
  def('TFF', {
    label: 'T flip-flop', group: 'Sequential', kind: 'seq', params: ffParams(), pins: withEn('TFF'),
    seq: ffSeq(['t']), init: init1, async: async1, out: out1, symbol: { shape: 'ff', text: 'T' },
    doc: 'At the active edge, T = 1 toggles Q and T = 0 holds it.',
    edge(io, st) { ffEdge(io, st, (q) => { const t = io.b('t'); return t === 0 ? q : t < 0 || q < 0 ? -1 : 1 - q; }); },
  });
  def('SRFF', {
    label: 'SR flip-flop', group: 'Sequential', kind: 'seq', params: ffParams(),
    pins(p) {
      const out = [pin('s', 'in', { label: 'S' }), pin('clk', 'in', { clock: true })];
      if (p.en) out.push(pin('en', 'in', { label: 'EN' }));
      out.push(pin('r', 'in', { label: 'R' }));
      if (p.set) out.push(pin('set', 'in', { side: 'top', label: 'S' }));
      if (p.reset) out.push(pin('rst', 'in', { side: 'bottom', label: 'R' }));
      out.push(pin('q', 'out', { label: 'Q' }));
      if (p.qn !== false) out.push(pin('qn', 'out', { label: "Q'" }));
      return out;
    },
    seq: ffSeq(['s', 'r']), init: init1, async: async1, out: out1, symbol: { shape: 'ff', text: 'SR' },
    doc: 'At the active edge: S sets, R resets, neither holds; S = R = 1 is not allowed and gives X.',
    edge(io, st) {
      ffEdge(io, st, (q) => { const s = io.b('s'), r = io.b('r'); if (s === 0 && r === 0) return q; if (s === 1 && r === 0) return 1; if (s === 0 && r === 1) return 0; return -1; });
    },
  });
  def('LATCH', {
    label: 'D latch (gated)', group: 'Sequential', kind: 'seq',
    params: [bool('enLow', false, 'Enable active low'), bool('qn', true, 'Q′ output')].concat(seqTiming),
    pins: (p, base) => base('LATCH', p),
    seq: { clock: null, check: 'en', edge: (p) => (p.enLow ? 'rise' : 'fall'), data: () => ['d'], async: () => [], rest: (p) => [{ pin: 'en', low: p.enLow }], timing: 'latch' },
    init: init1, out: out1, symbol: { shape: 'ff', text: 'D', latch: true },
    doc: 'Transparent while enabled (Q follows D); holds the last value when the enable goes away.',
    level(io, st) {
      const e = io.act('en', io.p.enLow);
      if (e === 0) return;
      const d = io.b('d');
      if (e === 1) return setQ(st, d, 1);
      if (d < 0 || st.x || d !== st.q) st.x = 1;
    },
  });
  def('SRLATCH', {
    label: 'SR latch', group: 'Sequential', kind: 'seq',
    params: [bool('low', false, 'Inputs active low (NAND form)'), bool('en', false, 'Gated (enable input)'), bool('qn', true, 'Q′ output')].concat(seqTiming),
    pins(p) {
      const out = [pin('s', 'in', { label: p.low ? "S'" : 'S' })];
      if (p.en) out.push(pin('en', 'in', { label: 'EN' }));
      out.push(pin('r', 'in', { label: p.low ? "R'" : 'R' }), pin('q', 'out', { label: 'Q' }));
      if (p.qn !== false) out.push(pin('qn', 'out', { label: "Q'" }));
      return out;
    },
    seq: { clock: null, data: () => [], async: () => [], rest: (p) => [{ pin: 's', low: p.low }, { pin: 'r', low: p.low }, { pin: 'en', low: false }], timing: 'latch' },
    init: init1, symbol: { shape: 'ff', text: 'SR', latch: true },
    doc: 'S sets Q, R resets it, neither holds. Both active drive Q and Q′ alike (both 0 in the NOR form, both 1 in the NAND form); releasing both at once leaves Q unknown.',
    level(io, st) {
      const p = io.p, e = p.en ? io.act('en', false) : 1;
      let s = io.act('s', p.low), r = io.act('r', p.low);
      if (e === 0) { s = 0; r = 0; } else if (e < 0) { s = s === 0 ? 0 : -1; r = r === 0 ? 0 : -1; }
      if (s === 1 && r === 1) { st.both = 1; return; }
      const was = st.both;
      st.both = 0;
      if (s === 1 && r === 0) setQ(st, 1, 1);
      else if (s === 0 && r === 1) setQ(st, 0, 1);
      else if (s === 0 && r === 0) { if (was) st.x = 1; } else st.x = 1;
    },
    out(io, st) {
      if (st.both) { const v = io.p.low ? 1 : 0; io.out('q', v); if (io.has('qn')) io.out('qn', v); return; }
      outQ(io, 'q', st, 1); if (io.has('qn')) outQn(io, 'qn', st, 1);
    },
  });

  // ---- registers and counters -------------------------------------------------------------------------------
  const initW = (p) => ({ q: 0, x: mask(p.w), wq: -1 });
  const clrOf = (io) => (io.has('clr') ? io.act('clr', io.p.clrLow) : 0);
  const asyncClr = (io, st) => {
    if (io.p.clrSync || !io.has('clr')) return false;
    const c = clrOf(io);
    if (c === 0) return false;
    if (c === 1) setQ(st, 0, io.p.w); else st.x = mask(io.p.w);
    return true;
  };
  const clrPins = (p) => (p.clr ? [{ pin: 'clr', low: p.clrLow }] : []);
  def('REG', {
    label: 'Register', group: 'Sequential', kind: 'seq',
    params: [int('w', 4, 'Width', 1, 32), bool('ld', false, 'Load enable input'), bool('clr', false, 'Clear input'), bool('clrSync', false, 'Clear is synchronous'), bool('clrLow', false, 'Clear active low'), edgeP].concat(seqTiming),
    pins: (p, base) => base('REG', p),
    seq: { clock: 'clk', edge: (p) => p.edge, data: (p) => ['d'].concat(p.ld ? ['ld'] : [], p.clr && p.clrSync ? ['clr'] : []), async: (p) => (p.clr && !p.clrSync ? clrPins(p) : []), timing: 'ff' },
    init: initW, async: asyncClr, symbol: { shape: 'box', text: 'REG' },
    doc: 'Stores w bits at the active clock edge; with a load input it stores only when LD = 1, else holds.',
    edge(io, st) {
      const p = io.p, w = p.w;
      if (p.clrSync && io.has('clr')) { const c = clrOf(io); if (c === 1) return setQ(st, 0, w); if (c < 0) { st.x = mask(w); return; } }
      const ld = io.has('ld') ? io.b('ld') : 1;
      if (ld === 0) return;
      io.pass('d');
      if (ld < 0) { st.x = (st.x | io.B | (st.q ^ io.A)) & mask(w); return; }
      st.q = io.A & ~io.B & mask(w); st.x = io.B;
    },
    out(io, st) { outQ(io, 'q', st, io.p.w); },
  });
  def('SHIFT', {
    label: 'Shift register', group: 'Sequential', kind: 'seq',
    params: [int('w', 4, 'Width', 1, 32), choice('dir', 'right', 'Direction (right: Q0 toward Q(w−1))', ['right', 'left']), bool('ld', false, 'Parallel load'), bool('clr', false, 'Clear input'), bool('clrSync', false, 'Clear is synchronous'), bool('clrLow', false, 'Clear active low'), edgeP].concat(seqTiming),
    pins(p) {
      const out = [pin('si', 'in', { label: 'SI' })];
      if (p.ld) out.push(pin('d', 'in', { width: p.w, side: 'top', label: 'D' }), pin('ld', 'in', { label: 'LD' }));
      out.push(pin('clk', 'in', { clock: true }));
      if (p.clr) out.push(pin('clr', 'in', { side: 'bottom', label: 'CLR' }));
      out.push(pin('q', 'out', { width: p.w, side: 'bottom', label: 'Q' }), pin('so', 'out', { label: 'SO' }));
      return out;
    },
    seq: { clock: 'clk', edge: (p) => p.edge, data: (p) => ['si'].concat(p.ld ? ['d', 'ld'] : []), async: (p) => (p.clr && !p.clrSync ? clrPins(p) : []), timing: 'ff' },
    init: initW, async: asyncClr, symbol: { shape: 'box', text: 'SRG' },
    doc: 'At each active edge every bit moves one place and SI enters at the end; SO is the bit leaving.',
    edge(io, st) {
      const p = io.p, w = p.w, m = mask(w);
      if (p.clrSync && io.has('clr')) { const c = clrOf(io); if (c === 1) return setQ(st, 0, w); if (c < 0) { st.x = m; return; } }
      const ld = p.ld ? io.b('ld') : 0;
      if (ld === 1) { io.pass('d'); st.q = io.A & ~io.B & m; st.x = io.B; return; }
      if (ld < 0) { st.x = m; return; }
      io.pass('si');
      const sa = io.A & 1, sb = io.B & 1;
      if (p.dir === 'left') { st.q = ((st.q >>> 1) | (sa << (w - 1))) & m; st.x = ((st.x >>> 1) | (sb << (w - 1))) & m; } else { st.q = ((st.q << 1) | sa) & m; st.x = ((st.x << 1) | sb) & m; }
      st.q >>>= 0; st.x >>>= 0;
    },
    out(io, st) {
      const w = io.p.w, i = io.p.dir === 'left' ? 0 : w - 1;
      outQ(io, 'q', st, w);
      io.outAB('so', ((st.q | st.x) >>> i) & 1, (st.x >>> i) & 1);
    },
  });
  def('USHIFT', {
    label: 'Universal shift register', group: 'Sequential', kind: 'seq',
    params: [int('w', 4, 'Width', 2, 32), bool('clr', true, 'Clear input'), bool('clrLow', false, 'Clear active low'), edgeP].concat(seqTiming),
    pins(p) {
      const out = [pin('sr', 'in', { label: 'SR' }), pin('d', 'in', { width: p.w, side: 'top', label: 'D' }), pin('sl', 'in', { label: 'SL' }), pin('s', 'in', { width: 2, side: 'bottom', label: 'S' }), pin('clk', 'in', { clock: true })];
      if (p.clr) out.push(pin('clr', 'in', { side: 'bottom', label: 'CLR' }));
      out.push(pin('q', 'out', { width: p.w, side: 'bottom', label: 'Q' }));
      return out;
    },
    seq: { clock: 'clk', edge: (p) => p.edge, data: () => ['sr', 'sl', 'd', 's'], async: (p) => clrPins(p), timing: 'ff' },
    init: initW, symbol: { shape: 'box', text: 'USR' },
    doc: 'Mode S: 0 holds, 1 shifts right (SR enters Q0), 2 shifts left (SL enters the top bit), 3 loads D.',
    async(io, st) { if (!io.has('clr')) return false; const c = clrOf(io); if (c === 0) return false; if (c === 1) setQ(st, 0, io.p.w); else st.x = mask(io.p.w); return true; },
    edge(io, st) {
      const w = io.p.w, m = mask(w), s = io.v('s');
      if (s < 0) { st.x = m; return; }
      if (s === 0) return;
      if (s === 3) { io.pass('d'); st.q = io.A & ~io.B & m; st.x = io.B; return; }
      io.pass(s === 1 ? 'sr' : 'sl');
      const sa = io.A & 1, sb = io.B & 1;
      if (s === 1) { st.q = ((st.q << 1) | sa) & m; st.x = ((st.x << 1) | sb) & m; } else { st.q = ((st.q >>> 1) | (sa << (w - 1))) & m; st.x = ((st.x >>> 1) | (sb << (w - 1))) & m; }
      st.q >>>= 0; st.x >>>= 0;
    },
    out(io, st) { outQ(io, 'q', st, io.p.w); },
  });
  def('COUNTER', {
    label: 'Counter', group: 'Sequential', kind: 'seq',
    params: [int('w', 4, 'Width', 1, 32), int('mod', 0, 'Modulus (0: 2^w)', 0), choice('dir', 'up', 'Direction', ['up', 'down', 'pin']), bool('en', false, 'Count enable'), bool('ld', false, 'Parallel load'), bool('clr', false, 'Clear input'), bool('clrSync', false, 'Clear is synchronous'), bool('clrLow', false, 'Clear active low'), bool('co', false, 'Terminal-count output'), bool('ripple', false, 'Ripple (outputs settle one bit at a time)'), edgeP].concat(seqTiming),
    pins(p, base) { const out = base('COUNTER', p); if (p.dir === 'pin') out.splice(out.findIndex((q) => q.name === 'clk'), 0, pin('up', 'in', { label: 'UP' })); return out; },
    seq: { clock: 'clk', edge: (p) => p.edge, data: (p) => [].concat(p.en ? ['en'] : [], p.ld ? ['ld', 'd'] : [], p.dir === 'pin' ? ['up'] : [], p.clr && p.clrSync ? ['clr'] : []), async: (p) => (p.clr && !p.clrSync ? clrPins(p) : []), timing: 'ff' },
    init: initW, async: asyncClr, symbol: { shape: 'box', text: 'CTR' },
    doc: 'Counts up or down at each active edge (when enabled), wrapping at the modulus; can clear and load.',
    edge(io, st) {
      const p = io.p, w = p.w, m = mask(w), mod = p.mod || m + 1;
      if (p.clrSync && io.has('clr')) { const c = clrOf(io); if (c === 1) return setQ(st, 0, w); if (c < 0) { st.x = m; return; } }
      if (p.ld) { const l = io.b('ld'); if (l === 1) return setQ(st, io.v('d'), w); if (l < 0) { st.x = m; return; } }
      const e = p.en ? io.b('en') : 1;
      if (e === 0) return;
      const up = p.dir === 'pin' ? io.b('up') : p.dir === 'down' ? 0 : 1;
      if (e < 0 || up < 0 || st.x) { st.x = m; return; }
      st.q = up ? (st.q + 1) % mod : (st.q + mod - 1) % mod;
      if (st.q >= mod) st.q = 0;
    },
    out(io, st) {
      const p = io.p, w = p.w, m = mask(w), mod = p.mod || m + 1;
      if (p.ripple && !st.x && st.wq >= 0 && st.wq !== st.q) {
        // a ripple counter's bits change one after another, each a clock-to-Q after the one below
        let v = st.wq, k = 0;
        for (let i = 0; i < w; i++) if (((v ^ st.q) >>> i) & 1) { v = (v ^ (1 << i)) >>> 0; k++; io.outAB('q', v, 0, k * io.tcq, true); }
      } else if (!p.ripple || st.wq !== st.q || st.x) outQ(io, 'q', st, w);
      st.wq = st.x ? -1 : st.q;
      if (p.co) {
        const e = p.en ? io.b('en') : 1, up = p.dir === 'pin' ? io.b('up') : p.dir === 'down' ? 0 : 1;
        if (st.x || e < 0 || up < 0) io.out('co', X);
        else io.out('co', e && st.q === (up ? mod - 1 : 0) ? 1 : 0);
      }
    },
  });

  // ---- memory -----------------------------------------------------------------------------------------------
  /** memory contents from text (hex numbers separated by spaces or commas) or an array of numbers */
  P.parseData = (d, n, w) => {
    const out = new Uint32Array(n), m = mask(w);
    const list = Array.isArray(d) ? d : String(d || '').split(/[\s,;]+/).filter(Boolean).map((s) => parseInt(s.replace(/^0x/i, ''), 16));
    for (let i = 0; i < n && i < list.length; i++) out[i] = (list[i] >>> 0) & m;
    return out;
  };
  def('RAM', {
    label: 'RAM', group: 'Memory', kind: 'seq',
    params: [int('aw', 4, 'Address bits', 1, 16), int('dw', 8, 'Data bits', 1, 32), bool('sync', false, 'Write on the clock edge (else while WE is active)'), bool('cs', false, 'Chip select input'), bool('oe', false, 'Output enable input'), text('data', '', 'Initial contents (hex)'), num('taa', null, 'Access time (ns)', 0)],
    pins(p) {
      const out = [pin('a', 'in', { width: p.aw, label: 'A' }), pin('din', 'in', { width: p.dw, label: 'DIN' }), pin('we', 'in', { label: 'WE' })];
      if (p.cs) out.push(pin('cs', 'in', { side: 'top', label: 'CS' }));
      if (p.oe) out.push(pin('oe', 'in', { side: 'top', label: 'OE' }));
      if (p.sync) out.push(pin('clk', 'in', { clock: true }));
      out.push(pin('dout', 'out', { width: p.dw, label: 'DOUT' }));
      return out;
    },
    seq: { clock: 'clk', when: (p) => p.sync, edge: () => 'rise', data: () => ['a', 'din', 'we'].concat([]), async: () => [], timing: 'ff', meta: false },
    tech: () => 'RAM', symbol: { shape: 'box', text: 'RAM' },
    doc: 'A words of D bits. Reads continuously (after the access time); writes DIN at address A while WE is active, or at the clock edge.',
    init(p) { const n = 1 << p.aw; return { q: 0, x: 0, ma: P.parseData(p.data, n, p.dw), mb: new Uint32Array(n) }; },
    edge(io, st) { if (io.p.sync) ramWrite(io, st); },
    level(io, st) { if (!io.p.sync) ramWrite(io, st); },
    out(io, st) {
      const p = io.p, cs = p.cs ? io.act('cs') : 1, oe = p.oe ? io.act('oe') : 1, we = io.b('we');
      if (cs === 0 || oe === 0 || (p.oe && we === 1)) return io.out('dout', Z, io.ta);
      const a = io.v('a');
      if (cs < 0 || oe < 0 || a < 0) return io.out('dout', X, io.ta);
      io.outAB('dout', (st.ma[a] | st.mb[a]) >>> 0, st.mb[a], io.ta);
    },
  });
  function ramWrite(io, st) {
    const p = io.p, cs = p.cs ? io.act('cs') : 1, we = io.b('we');
    if (cs === 0 || we === 0 || (we < 0 && io.fresh('we'))) return;
    const a = io.v('a');
    io.pass('din');
    if (a < 0 || cs < 0 || we < 0) {
      // a write to an unknown place, or perhaps no write: every word it might touch becomes unknown
      if (a < 0) { st.mb.fill(mask(p.dw)); st.ma.fill(mask(p.dw)); } else { st.mb[a] = mask(p.dw); st.ma[a] = mask(p.dw); }
      return;
    }
    st.ma[a] = io.A; st.mb[a] = io.B;
  }
  def('ROM', {
    label: 'ROM', group: 'Memory', kind: 'comb',
    params: [int('aw', 4, 'Address bits', 1, 16), int('dw', 8, 'Data bits', 1, 32), bool('cs', false, 'Chip select input'), bool('oe', false, 'Output enable input'), text('data', '', 'Contents (hex)')].concat(delays),
    pins(p) {
      const out = [pin('a', 'in', { width: p.aw, label: 'A' })];
      if (p.cs) out.push(pin('cs', 'in', { side: 'top', label: 'CS' }));
      if (p.oe) out.push(pin('oe', 'in', { side: 'top', label: 'OE' }));
      out.push(pin('d', 'out', { width: p.dw, label: 'D' }));
      return out;
    },
    tech: () => 'ROM', symbol: { shape: 'box', text: 'ROM' },
    doc: 'A fixed table: the output is the word stored at address A.',
    init(p) { return { mem: P.parseData(p.data, 1 << p.aw, p.dw) }; },
    eval(io) {
      const p = io.p, cs = p.cs ? io.act('cs') : 1, oe = p.oe ? io.act('oe') : 1;
      if (cs === 0 || oe === 0) return io.out('d', Z);
      const a = io.v('a');
      io.out('d', a < 0 || cs < 0 || oe < 0 ? X : io.st.mem[a]);
    },
  });

  // ---- sources, displays and wiring -------------------------------------------------------------------------
  def('IN', {
    label: 'Input', group: 'I/O', kind: 'source', params: [text('name', 'A', 'Name'), int('w', 1, 'Width', 1, 32), num('value', 0, 'Starting value')],
    pins: (p, base) => base('IN', p), symbol: { shape: 'port' },
    doc: 'A named input the student sets (a switch, or a bus value).',
    start(io) { io.out('y', io.p.value === 'X' ? X : +io.p.value || 0, 0); },
  });
  def('SWITCH', {
    label: 'Switch', group: 'I/O', kind: 'source', params: [text('name', 'SW', 'Name'), num('value', 0, 'Starting position')],
    pins: () => [pin('y', 'out')], symbol: { shape: 'switch' },
    doc: 'A toggle switch: 0 or 1.',
    start(io) { io.out('y', +io.p.value || 0, 0); },
  });
  def('BUTTON', {
    label: 'Push button', group: 'I/O', kind: 'source', params: [text('name', 'PB', 'Name'), num('bounce', 0, 'Contact bounce (ns; 0 for none)', 0), int('bounces', 4, 'Bounces per press', 0, 20), bool('activeLow', false, 'Reads 0 when pressed')],
    pins: () => [pin('y', 'out')], symbol: { shape: 'button' },
    doc: 'Reads 1 while pressed. With bounce, the contact chatters for a while on each press and release.',
    start(io) { io.out('y', io.p.activeLow ? 1 : 0, 0); },
    // sim.set on a button presses (1) or releases (0) it
    press(io, st, v, rnd) {
      const p = io.p, lv = p.activeLow ? 1 - v : v;
      if (!(p.bounce > 0) || !p.bounces) return io.out('y', lv, 0);
      const times = [];
      for (let i = 0; i < 2 * p.bounces; i++) times.push(Math.round(rnd() * p.bounce * 1000) / 1000);
      times.sort((a, b) => a - b);
      times.forEach((t, i) => io.outAB('y', i % 2 ? 1 - lv : lv, 0, t, true));
      io.outAB('y', lv, 0, p.bounce, true);
    },
  });
  def('CLOCK', {
    label: 'Clock', group: 'I/O', kind: 'source',
    params: [text('name', 'CLK', 'Name'), num('period', null, 'Period (ns; blank for the technology’s)', 0.001), num('duty', 0.5, 'Duty cycle (fraction high)', 0), num('phase', null, 'First rising edge (ns; blank: after the low half)', 0)],
    pins: (p, base) => base('CLOCK', p), symbol: { shape: 'clock' },
    doc: 'A square wave: period, duty cycle and the time of the first rising edge.',
    init: () => ({ lvl: 0 }),
    start(io, st) {
      const per = io.period, hi = per * io.p.duty, ph = io.p.phase === null || io.p.phase === undefined ? per - hi : +io.p.phase;
      st.lvl = 0;
      if (ph <= 0) { st.lvl = 1; io.out('y', 1, 0); io.timer(hi, 'fall'); } else { io.out('y', 0, 0); io.timer(ph, 'rise'); }
    },
    timer(io, st, tag) {
      const per = io.period, hi = per * io.p.duty;
      st.lvl = tag === 'rise' ? 1 : 0;
      io.out('y', st.lvl, 0);
      io.timer(tag === 'rise' ? hi : per - hi, tag === 'rise' ? 'fall' : 'rise');
    },
  });
  def('CONST', {
    label: 'Constant', group: 'I/O', kind: 'source', params: [num('value', 0, 'Value'), int('w', 1, 'Width', 1, 32)],
    pins: (p, base) => base('CONST', p), symbol: { shape: 'const' },
    doc: 'A fixed value: 0 (ground) or 1 (the supply), or a bus constant.',
    start(io) { io.out('y', io.p.value === 'X' ? X : io.p.value === 'Z' ? Z : +io.p.value, 0); },
  });
  def('VCC', { label: 'Supply (VCC)', group: 'I/O', kind: 'source', params: [], pins: () => [pin('y', 'out', { label: 'VCC' })], symbol: { shape: 'vcc' }, doc: 'The supply rail: logic 1.', start(io) { io.out('y', 1, 0); } });
  def('GND', { label: 'Ground', group: 'I/O', kind: 'source', params: [], pins: () => [pin('y', 'out', { label: 'GND' })], symbol: { shape: 'gnd' }, doc: 'The ground rail: logic 0.', start(io) { io.out('y', 0, 0); } });
  def('PULLUP', { label: 'Pull-up resistor', group: 'Wiring', kind: 'source', weak: true, params: [int('w', 1, 'Width', 1, 32)], pins: (p) => [pin('y', 'out', { width: p.w })], symbol: { shape: 'pull', up: true }, doc: 'Pulls the wire weakly to 1; any real driver wins.', start(io) { io.out('y', mask(io.p.w), 0); } });
  def('PULLDOWN', { label: 'Pull-down resistor', group: 'Wiring', kind: 'source', weak: true, params: [int('w', 1, 'Width', 1, 32)], pins: (p) => [pin('y', 'out', { width: p.w })], symbol: { shape: 'pull', up: false }, doc: 'Pulls the wire weakly to 0; any real driver wins.', start(io) { io.out('y', 0, 0); } });
  def('OUT', { label: 'Output', group: 'I/O', kind: 'sink', params: [text('name', 'F', 'Name'), int('w', 1, 'Width', 1, 32)], pins: (p, base) => base('OUT', p), symbol: { shape: 'port' }, doc: 'A named output.' });
  def('LED', { label: 'LED', group: 'I/O', kind: 'sink', params: [choice('color', 'red', 'Colour', ['red', 'green', 'yellow', 'blue']), bool('activeLow', false, 'Lit by a 0 (wired to the supply)')], pins: () => [pin('a', 'in')], symbol: { shape: 'led' }, doc: 'Lights when its input is 1 (or 0, when wired active low).' });
  def('PROBE', { label: 'Logic probe', group: 'I/O', kind: 'sink', params: [int('w', 1, 'Width', 1, 32)], pins: (p) => [pin('a', 'in', { width: p.w })], symbol: { shape: 'probe' }, doc: 'Shows the value on a wire: 0, 1, X or Z.' });
  def('SEG7', {
    label: 'Seven-segment display', group: 'I/O', kind: 'sink', params: [choice('common', 'cathode', 'Common', ['cathode', 'anode']), bool('dp', false, 'Decimal point')],
    pins: (p) => 'abcdefg'.split('').map((s) => pin(s, 'in', { label: s })).concat(p.dp ? [pin('dp', 'in', { label: 'dp' })] : []),
    symbol: { shape: 'seg7' }, doc: 'Segments a–g; with a common cathode a segment lights on 1, with a common anode on 0.',
  });
  def('HEX', { label: 'Hex display', group: 'I/O', kind: 'sink', params: [], pins: () => [pin('d', 'in', { width: 4, label: 'D' })], symbol: { shape: 'hex' }, doc: 'Shows a 4-bit value as one hex digit.' });
  const sizes = (p) => { const s = String(p.sizes || '').split(/[\s,]+/).filter(Boolean).map(Number); return s.length ? s : new Array(p.w).fill(1); };
  P.splitSizes = sizes;
  def('SPLIT', {
    label: 'Bus splitter', group: 'Wiring', kind: 'wire', params: [int('w', 4, 'Bus width', 2, 32), text('sizes', '', 'Field widths from bit 0 up (blank: one bit each)')],
    pins: (p) => [pin('a', 'in', { width: p.w })].concat(sizes(p).map((n, i) => pin('y' + i, 'out', { width: n }))),
    tech: () => 'WIRE', symbol: { shape: 'split' }, doc: 'Takes a bus apart into fields, bit 0 first.',
    eval(io) { io.ab('a'); let a = io.A, b = io.B; for (const [i, n] of sizes(io.p).entries()) { const m = mask(n); io.outAB('y' + i, a & m, b & m, 0); a >>>= n; b >>>= n; } },
  });
  def('MERGE', {
    label: 'Bus merger', group: 'Wiring', kind: 'wire', params: [int('w', 4, 'Bus width', 2, 32), text('sizes', '', 'Field widths from bit 0 up (blank: one bit each)')],
    pins: (p) => sizes(p).map((n, i) => pin('a' + i, 'in', { width: n })).concat([pin('y', 'out', { width: p.w })]),
    tech: () => 'WIRE', symbol: { shape: 'merge' }, doc: 'Joins wires or fields into one bus, the first at bit 0.',
    eval(io) { let a = 0, b = 0, s = 0; for (const [i, n] of sizes(io.p).entries()) { io.ab('a' + i); a |= io.A << s; b |= io.B << s; s += n; } io.outAB('y', a >>> 0, b >>> 0, 0); },
  });
  def('BLOCK', {
    label: 'Subcircuit', group: 'Wiring', kind: 'block', params: [text('title', 'block', 'Title')],
    pins: (p, base) => base('BLOCK', p), symbol: { shape: 'box' },
    doc: 'A block holding a whole circuit; its pins are that circuit’s inputs and outputs.',
  });
  /** a block part's parameters for a circuit: its input and output ports become the pins */
  P.blockParams = (circuit, title) => {
    const ports = (t) => circuit.parts.filter((q) => q.type === t).map((q) => ({ name: q.params.name, width: q.params.w || 1 }));
    return { title: title || circuit.title, circuit, inputs: ports('IN').concat(circuit.parts.filter((q) => q.type === 'CLOCK').map((q) => ({ name: q.params.name, width: 1 }))), outputs: ports('OUT') };
  };

  /** a circuit holding just one part, with an input port per input pin and an output port per output pin */
  P.testCircuit = function (type, params) {
    const N = S.Netlist, c = new N.Circuit(type);
    const part = c.add(type, params || {}, 'dut');
    for (const q of part.pins) {
      if (q.dir === 'in') c.connect(c.input(q.name, q.width), part.pin(q.name));
      else c.connect(part.pin(q.name), c.output(q.name, q.width).pin('a'));
    }
    return c;
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
