// The app's view of the engines. Every page asks S.Eng, never the engines directly, so it runs today with
// small stand-ins and switches to the real engines (Sirkit.Sim, Sirkit.Parts, Sirkit.Tech, ...) as soon as
// they are loaded. The stand-ins: a parts registry (pins, the edit dialog's parameters, behaviour) for the
// palette's usual parts, the four technology presets, and an event-driven 4-valued simulator with delays,
// setup and hold checks, contention and floating inputs. Values here are strings of bits, most significant
// first, each '0', '1', 'x' or 'z'; S.Eng.bits() turns whatever an engine returns into that form.
(function (S) {
  'use strict';
  const E = S.Eng = {};
  const log2 = (n) => Math.max(1, Math.ceil(Math.log2(n)));

  // ---- values ---------------------------------------------------------------------------------------------
  /** any engine value (0, 1, 'X', 'Z', a number, an array or {bits}) as a bit string of width w, MSB first */
  E.bits = function (v, w) {
    w = w || 1;
    if (v == null) return 'x'.repeat(w);
    if (typeof v === 'string') { const s = v.toLowerCase().replace(/[^01xz]/g, ''); return s.length >= w ? s.slice(-w) : s.padStart(w, s[0] === 'x' || s[0] === 'z' ? s[0] : '0'); }
    if (typeof v === 'number' || typeof v === 'bigint') { let s = ''; let n = BigInt(typeof v === 'number' ? Math.trunc(v) : v); for (let i = 0; i < w; i++) { s = (n & 1n ? '1' : '0') + s; n >>= 1n; } return s; }
    if (typeof v === 'boolean') return E.bits(v ? 1 : 0, w);
    // the simulator's buses are arrays of bits, least significant first (sim-values.js)
    if (Array.isArray(v)) return v.map((b) => E.bits(b, 1)).reverse().join('').padStart(w, '0').slice(-w);
    if (v && v.bits) return E.bits(v.bits, w);
    if (v && v.v != null) return E.bits(v.v, w);
    return 'x'.repeat(w);
  };
  /** a bit string as text: radix 'bin', 'hex', 'dec' or 'signed' (unknown bits make X or Z digits) */
  E.format = function (s, radix) {
    if (s.length === 1) return s === 'x' ? 'X' : s === 'z' ? 'Z' : s;
    if (/^z+$/.test(s)) return 'Z';
    if (/[xz]/.test(s)) {
      if (radix === 'hex') { let out = ''; const pad = s.padStart(Math.ceil(s.length / 4) * 4, '0'); for (let i = 0; i < pad.length; i += 4) { const g = pad.slice(i, i + 4); out += /z/.test(g) ? 'Z' : /x/.test(g) ? 'X' : parseInt(g, 2).toString(16).toUpperCase(); } return out; }
      return radix === 'bin' ? s.toUpperCase() : 'X';
    }
    const n = BigInt('0b' + s);
    if (radix === 'bin') return s;
    if (radix === 'dec') return n.toString();
    if (radix === 'signed') return (s[0] === '1' ? n - (1n << BigInt(s.length)) : n).toString();
    return n.toString(16).toUpperCase();
  };
  E.known = (s) => !/[xz]/.test(s);
  E.num = (s) => (E.known(s) ? Number(BigInt('0b' + s)) : null);

  // ---- technology ----------------------------------------------------------------------------------------
  // delays in ns: tpd for a gate, tsu/th/tcq for a flip-flop; floatHigh: an open input reads 1
  const TECH = {
    CMOS: { label: 'CMOS (74HC)', tpd: 9, tsu: 5, th: 2, tcq: 14, floatHigh: false },
    TTL: { label: 'TTL (74)', tpd: 10, tsu: 20, th: 5, tcq: 18, floatHigh: true },
    'LS-TTL': { label: 'LS-TTL (74LS)', tpd: 9, tsu: 20, th: 3, tcq: 15, floatHigh: true },
    'FPGA-like': { label: 'FPGA-like', tpd: 1, tsu: 0.5, th: 0.1, tcq: 1, floatHigh: false },
  };
  E.techPresets = () => (S.Tech && S.Tech.presets) || TECH;
  E.techNames = () => Object.keys(E.techPresets());
  /** a preset as the stand-ins use it: {label, tpd, tsu, th, tcq, floatHigh}, read from the engine's preset when there is one */
  E.tech = (name) => {
    const p = E.techPresets(), t = p[name] || p[String(name).replace(/-like$/, '')] || p.CMOS || Object.values(p)[0] || {};
    const base = Object.assign({}, TECH[name] || TECH.CMOS);
    const avg = (x) => (Array.isArray(x) ? (x[0] + x[1]) / 2 : +x);
    if (t.gate && t.gate.NAND) base.tpd = avg(t.gate.NAND);
    if (t.ff) { if (t.ff.tsu != null) base.tsu = t.ff.tsu; if (t.ff.th != null) base.th = t.ff.th; if (t.ff.tcq != null) base.tcq = Array.isArray(t.ff.tcq) ? Math.max(...t.ff.tcq) : t.ff.tcq; }
    if (t.floatsHigh != null) base.floatHigh = !!t.floatsHigh;
    if (t.label) base.label = t.label;
    base.raw = t;
    return base;
  };

  // ---- the parts registry ----------------------------------------------------------------------------------
  const pin = (name, dir, o) => Object.assign({ name, dir, width: 1, side: dir === 'in' ? 'left' : 'right', label: null, clock: false }, o || {});
  const P = (name, type, label, def, o) => Object.assign({ name, type, label, default: def }, o || {});
  const delayP = P('delay', 'number', 'Delay (ns, empty for the technology)', null, { min: 0, optional: true });
  const timeP = (n, l) => P(n, 'number', l + ' (ns, empty for the technology)', null, { min: 0, optional: true });
  const gate = (t, n1) => ({
    category: 'Gates', label: t,
    params: n1 ? [delayP] : [P('n', 'int', 'Inputs', 2, { min: 2, max: 8 }), delayP],
    eval(ins, p) {
      const xs = Object.keys(ins).filter((k) => k[0] === 'i').sort((a, b) => +a.slice(1) - +b.slice(1)).map((k) => ins[k]);
      const v = gateFn(t, xs);
      return { y: v };
    },
  });
  function gateFn(t, xs) {
    const b = xs.map((x) => (x === 'z' ? 'x' : x));
    const and = () => (b.includes('0') ? '0' : b.includes('x') ? 'x' : '1');
    const or = () => (b.includes('1') ? '1' : b.includes('x') ? 'x' : '0');
    const xor = () => (b.includes('x') ? 'x' : b.filter((x) => x === '1').length % 2 ? '1' : '0');
    const not = (v) => (v === '1' ? '0' : v === '0' ? '1' : 'x');
    switch (t) {
      case 'AND': return and(); case 'OR': return or(); case 'XOR': return xor();
      case 'NAND': return not(and()); case 'NOR': return not(or()); case 'XNOR': return not(xor());
      case 'NOT': return not(b[0]); case 'BUF': return b[0];
    }
    return 'x';
  }
  const ffParams = [
    P('edge', 'enum', 'Clock edge', 'rising', { choices: [['rising', 'Rising'], ['falling', 'Falling']] }),
    P('set', 'bool', 'Asynchronous set (preset)', false), P('reset', 'bool', 'Asynchronous reset (clear)', false),
    P('asyncLow', 'bool', 'Set and reset active low', false), P('qn', 'bool', "Q' output", true),
    timeP('tsu', 'Setup time'), timeP('th', 'Hold time'), timeP('tcq', 'Clock to Q'),
  ];
  const ff = (t) => ({
    category: 'Flip-flops', label: { DFF: 'D flip-flop', JKFF: 'JK flip-flop', TFF: 'T flip-flop' }[t], seq: true,
    params: [P('ftype', 'enum', 'Type', t, { choices: [['DFF', 'D'], ['JKFF', 'JK'], ['TFF', 'T']], retype: true })].concat(ffParams),
    init: () => ({ q: 'x' }),
    async(ins, p, st) { const lo = p.asyncLow; const on = (v) => v === (lo ? '0' : '1'); if (p.set && on(ins.set)) st.q = '1'; if (p.reset && on(ins.rst)) st.q = '0'; },
    edge(ins, p, st) {
      const q = st.q;
      if (t === 'DFF') st.q = ins.d === 'z' ? 'x' : ins.d;
      else if (t === 'TFF') st.q = ins.t === '1' ? (q === '1' ? '0' : q === '0' ? '1' : 'x') : ins.t === '0' ? q : 'x';
      else { const j = ins.j, k = ins.k; st.q = j === '0' && k === '0' ? q : j === '0' && k === '1' ? '0' : j === '1' && k === '0' ? '1' : j === '1' && k === '1' ? (q === '1' ? '0' : q === '0' ? '1' : 'x') : 'x'; }
    },
    out: (st, p) => (p.qn === false ? { q: st.q } : { q: st.q, qn: st.q === '1' ? '0' : st.q === '0' ? '1' : 'x' }),
    dataPins: t === 'JKFF' ? ['j', 'k'] : t === 'TFF' ? ['t'] : ['d'],
  });
  const REG = {
    IN: { category: 'Inputs/Outputs', label: 'Switch', params: [P('name', 'text', 'Name', 'A', { required: true }), P('w', 'int', 'Width (bits)', 1, { min: 1, max: 32 }), P('kind', 'enum', 'Kind', 'switch', { choices: [['switch', 'Toggle switch'], ['button', 'Push button (momentary)']] }), P('value', 'int', 'Starting value', 0, { min: 0 })] },
    CLOCK: { category: 'Inputs/Outputs', label: 'Clock', params: [P('name', 'text', 'Name', 'CLK', { required: true }), P('period', 'number', 'Period (ns)', 100, { min: 1 }), P('duty', 'number', 'Duty cycle (%)', 50, { min: 1, max: 99 }), P('phase', 'number', 'Phase (ns, first rising edge)', 50, { min: 0 })] },
    CONST: { category: 'Inputs/Outputs', label: 'Constant', params: [P('value', 'int', 'Value', 1, { min: 0 }), P('w', 'int', 'Width (bits)', 1, { min: 1, max: 32 })], eval: (ins, p) => ({ y: E.bits(+p.value || 0, p.w || 1) }) },
    OUT: { category: 'Inputs/Outputs', label: 'Output', params: [P('name', 'text', 'Name', 'F', { required: true }), P('w', 'int', 'Width (bits)', 1, { min: 1, max: 32 })] },
    LED: { category: 'Display', label: 'LED', pins: () => [pin('a', 'in')], params: [P('color', 'enum', 'Colour', 'red', { choices: [['red', 'Red'], ['green', 'Green'], ['amber', 'Amber'], ['blue', 'Blue']] }), P('title', 'text', 'Label', '')] },
    HEX: { category: 'Display', label: 'Hex digit', pins: () => [pin('a', 'in', { width: 4 })], params: [P('title', 'text', 'Label', '')] },
    SEG7: { category: 'Display', label: '7-segment', pins: () => 'abcdefg'.split('').map((c) => pin(c, 'in', { label: c })).concat([pin('dp', 'in', { label: 'dp' })]), params: [P('common', 'enum', 'Segments light on', 'high', { choices: [['high', '1 (common cathode)'], ['low', '0 (common anode)']] })] },
    PROBE: { category: 'Display', label: 'Probe', pins: (p) => [pin('a', 'in', { width: p.w || 1 })], params: [P('w', 'int', 'Width (bits)', 1, { min: 1, max: 32 })] },
    TRI: { category: 'Plexers', label: 'Tristate buffer', pins: (p) => [pin('a', 'in', { width: p.w || 1, label: 'A' }), pin('en', 'in', { side: 'top', label: 'EN' }), pin('y', 'out', { width: p.w || 1, label: 'Y' })], params: [P('w', 'int', 'Width (bits)', 1, { min: 1, max: 32 }), P('active', 'enum', 'Enable', 'high', { choices: [['high', 'Active high'], ['low', 'Active low']] }), delayP],
      eval: (ins, p) => { const en = ins.en === (p.active === 'low' ? '0' : '1'); const off = ins.en === (p.active === 'low' ? '1' : '0'); return { y: en ? ins.a.replace(/z/g, 'x') : off ? 'z'.repeat(p.w || 1) : 'x'.repeat(p.w || 1) }; } },
    MUX: { category: 'Plexers', label: 'Multiplexer', params: [P('n', 'enum', 'Data inputs', 2, { choices: [[2, '2'], [4, '4'], [8, '8'], [16, '16']], num: true }), P('w', 'int', 'Data width (bits)', 1, { min: 1, max: 32 }), P('en', 'bool', 'Enable input', false), P('selBus', 'bool', 'Select as one bus', false), delayP],
      eval(ins, p) {
        const n = +p.n || 2, k = log2(n), w = p.w || 1;
        if (p.en && ins.en !== '1') return { y: ins.en === '0' ? '0'.repeat(w) : 'x'.repeat(w) };
        const sel = p.selBus ? ins.s : Array.from({ length: k }, (_, i) => ins['s' + (k - 1 - i)]).join('');
        const s = E.num(sel);
        return { y: s == null ? 'x'.repeat(w) : (ins['d' + s] || 'x'.repeat(w)).replace(/z/g, 'x') };
      } },
    DECODER: { category: 'Plexers', label: 'Decoder', params: [P('k', 'int', 'Select inputs', 2, { min: 1, max: 4 }), P('en', 'bool', 'Enable input', false), P('active', 'enum', 'Outputs', 'high', { choices: [['high', 'Active high'], ['low', 'Active low']] }), delayP],
      eval(ins, p) {
        const k = p.k || 2, out = {}, on = p.active === 'low' ? '0' : '1', off = on === '1' ? '0' : '1';
        const a = Array.from({ length: k }, (_, i) => ins['a' + (k - 1 - i)]).join(''), s = E.num(a), en = !p.en || ins.en === '1';
        for (let i = 0; i < 1 << k; i++) out['y' + i] = p.en && ins.en === '0' ? off : s == null || (p.en && ins.en !== '1') ? 'x' : en && s === i ? on : off;
        return out;
      } },
    FA: { category: 'Arithmetic', label: 'Full adder', params: [delayP], eval(ins) { const v = [ins.a, ins.b, ins.cin]; if (v.some((x) => x !== '0' && x !== '1')) return { s: 'x', cout: 'x' }; const n = v.filter((x) => x === '1').length; return { s: n % 2 ? '1' : '0', cout: n >= 2 ? '1' : '0' }; } },
    ADD: { category: 'Arithmetic', label: 'Adder', pins: (p) => [pin('a', 'in', { width: p.w || 4, label: 'A' }), pin('b', 'in', { width: p.w || 4, label: 'B' }), pin('cin', 'in', { side: 'top', label: 'Cin' }), pin('s', 'out', { width: p.w || 4, label: 'S' }), pin('cout', 'out', { label: 'Cout' })], params: [P('w', 'int', 'Width (bits)', 4, { min: 1, max: 32 }), delayP],
      eval(ins, p) { const w = p.w || 4, a = E.num(ins.a), b = E.num(ins.b), c = ins.cin === '1' ? 1 : ins.cin === '0' ? 0 : null; if (a == null || b == null || c == null) return { s: 'x'.repeat(w), cout: 'x' }; const r = a + b + c; return { s: E.bits(r % 2 ** w, w), cout: r >= 2 ** w ? '1' : '0' }; } },
    CMP: { category: 'Arithmetic', label: 'Comparator', pins: (p) => [pin('a', 'in', { width: p.w || 4, label: 'A' }), pin('b', 'in', { width: p.w || 4, label: 'B' }), pin('lt', 'out', { label: 'A<B' }), pin('eq', 'out', { label: 'A=B' }), pin('gt', 'out', { label: 'A>B' })], params: [P('w', 'int', 'Width (bits)', 4, { min: 1, max: 32 }), delayP],
      eval(ins) { const a = E.num(ins.a), b = E.num(ins.b); if (a == null || b == null) return { lt: 'x', eq: 'x', gt: 'x' }; return { lt: a < b ? '1' : '0', eq: a === b ? '1' : '0', gt: a > b ? '1' : '0' }; } },
    DFF: ff('DFF'), JKFF: ff('JKFF'), TFF: ff('TFF'),
    LATCH: { category: 'Flip-flops', label: 'D latch', seq: true, params: [P('qn', 'bool', "Q' output", true), delayP], init: () => ({ q: 'x' }),
      level(ins, p, st) { if (ins.en === '1') st.q = ins.d === 'z' ? 'x' : ins.d; else if (ins.en !== '0') st.q = st.q === ins.d ? st.q : 'x'; },
      out: (st, p) => (p.qn === false ? { q: st.q } : { q: st.q, qn: st.q === '1' ? '0' : st.q === '0' ? '1' : 'x' }) },
    REG: { category: 'Registers & counters', label: 'Register', seq: true, params: [P('w', 'int', 'Width (bits)', 4, { min: 1, max: 32 }), P('ld', 'bool', 'Load enable', false), P('clr', 'bool', 'Asynchronous clear', false), timeP('tsu', 'Setup time'), timeP('th', 'Hold time'), timeP('tcq', 'Clock to Q')],
      init: (p) => ({ q: 'x'.repeat(p.w || 4) }), async(ins, p, st) { if (p.clr && ins.clr === '1') st.q = '0'.repeat(p.w || 4); },
      edge(ins, p, st) { if (!p.ld || ins.ld === '1') st.q = ins.d.replace(/z/g, 'x'); else if (ins.ld !== '0') st.q = 'x'.repeat(p.w || 4); }, out: (st) => ({ q: st.q }), dataPins: ['d', 'ld'] },
    COUNTER: { category: 'Registers & counters', label: 'Counter', seq: true, params: [P('w', 'int', 'Width (bits)', 4, { min: 1, max: 16 }), P('mod', 'int', 'Count to (modulus, 0 for 2^width)', 0, { min: 0 }), P('en', 'bool', 'Count enable', false), P('ld', 'bool', 'Parallel load', false), P('clr', 'bool', 'Asynchronous clear', true), P('co', 'bool', 'Carry out', false), timeP('tcq', 'Clock to Q')],
      init: (p) => ({ q: 'x'.repeat(p.w || 4) }), async(ins, p, st) { if (p.clr && ins.clr === '1') st.q = '0'.repeat(p.w || 4); },
      edge(ins, p, st) {
        const w = p.w || 4, m = +p.mod || 2 ** w;
        if (p.ld && ins.ld === '1') { st.q = ins.d.replace(/z/g, 'x'); return; }
        if (p.en && ins.en !== '1') { if (ins.en !== '0') st.q = 'x'.repeat(w); return; }
        const n = E.num(st.q); st.q = n == null ? 'x'.repeat(w) : E.bits((n + 1) % m, w);
      },
      out(st, p) { const o = { q: st.q }; if (p.co) { const n = E.num(st.q); o.co = n == null ? 'x' : n === (+p.mod || 2 ** (p.w || 4)) - 1 ? '1' : '0'; } return o; }, dataPins: ['en', 'ld', 'd'] },
    ROM: { category: 'Memory', label: 'ROM', pins: (p) => [pin('addr', 'in', { width: p.aw || 3, label: 'A' }), pin('data', 'out', { width: p.dw || 4, label: 'D' })], params: [P('aw', 'int', 'Address bits', 3, { min: 1, max: 10 }), P('dw', 'int', 'Data bits', 4, { min: 1, max: 32 }), P('contents', 'hex', 'Contents', ''), delayP],
      eval(ins, p) { const a = E.num(ins.addr), mem = E.hexWords(p.contents); return { data: a == null ? 'x'.repeat(p.dw || 4) : E.bits(mem[a] || 0, p.dw || 4) }; } },
    RAM: { category: 'Memory', label: 'RAM', seq: true, pins: (p) => [pin('addr', 'in', { width: p.aw || 3, label: 'A' }), pin('din', 'in', { width: p.dw || 4, label: 'DIn' }), pin('we', 'in', { label: 'WE' }), pin('clk', 'in', { clock: true }), pin('dout', 'out', { width: p.dw || 4, label: 'DOut' })], params: [P('aw', 'int', 'Address bits', 3, { min: 1, max: 10 }), P('dw', 'int', 'Data bits', 4, { min: 1, max: 32 }), P('contents', 'hex', 'Starting contents', '')],
      init: (p) => ({ mem: E.hexWords(p.contents), a: null }),
      edge(ins, p, st) { const a = E.num(ins.addr), d = E.num(ins.din); if (ins.we === '1' && a != null) st.mem[a] = d == null ? 0 : d; },
      level(ins, p, st) { st.a = E.num(ins.addr); },
      out: (st, p) => ({ dout: st.a == null ? 'x'.repeat(p.dw || 4) : E.bits(st.mem[st.a] || 0, p.dw || 4) }), dataPins: ['addr', 'din', 'we'] },
  };
  for (const t of ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR']) REG[t] = gate(t);
  REG.NOT = gate('NOT', true); REG.BUF = gate('BUF', true);
  REG.NOT.label = 'NOT (inverter)'; REG.BUF.label = 'Buffer';
  E.fallbackRegistry = REG;

  /** words of a memory's contents: hex numbers separated by spaces, commas or new lines; "addr: w w" sets from addr */
  E.hexWords = function (text) {
    const out = [];
    let at = 0;
    for (const line of String(text || '').split(/\n/)) {
      const m = /^\s*([0-9a-f]+)\s*:(.*)$/i.exec(line);
      let rest = line;
      if (m) { at = parseInt(m[1], 16); rest = m[2]; }
      for (const w of rest.split(/[\s,]+/).filter(Boolean)) { const n = parseInt(w, 16); out[at++] = isNaN(n) ? 0 : n; }
    }
    return out;
  };

  /** the registry: the parts engine's when it is there (with the stand-ins for anything it lacks) */
  E.registry = () => Object.assign({}, REG, (S.Parts && S.Parts.registry) || {});
  E.def = (type) => E.registry()[type] || null;
  /** the pins of a part: the netlist's own list, else the registry's */
  E.pinsOf = function (type, params) {
    params = params || {};
    try { return S.Netlist.pinsOf(type, params); } catch (e) { /* not a netlist type */ }
    const d = E.def(type);
    if (d && d.pins) return d.pins(params).map((q) => pin(q.name, q.dir, q));
    throw new Error('unknown part type ' + type);
  };
  /** the edit dialog's parameters of a type: [{name, type, label, choices, default, min, max}] */
  E.paramsOf = function (type) {
    const d = E.def(type);
    let ps = (d && d.params) || [];
    if (!Array.isArray(ps)) ps = Object.entries(ps).map(([name, x]) => Object.assign({ name }, x));
    // the flip-flops can change into one another; memory contents get the hex editor
    if (['DFF', 'JKFF', 'TFF', 'SRFF'].includes(type) && !ps.some((p) => p.name === 'ftype')) ps = [P('ftype', 'enum', 'Type', type, { choices: [['DFF', 'D'], ['JKFF', 'JK'], ['TFF', 'T'], ['SRFF', 'SR']].filter(([t]) => E.def(t)), retype: true })].concat(ps);
    ps = ps.map((p) => ((p.name === 'data' || p.name === 'contents') && ['ROM', 'RAM'].includes(type) ? Object.assign({}, p, { type: 'hex' }) : p));
    if (!ps.some((p) => p.name === 'label') && !E.isPort(type)) ps = ps.concat([P('label', 'text', 'Label (shown beside the part)', '')]);
    return ps;
  };
  /** parts with a name that the simulator knows them by (inputs, switches, buttons, clocks, outputs) */
  E.isPort = (type) => ['IN', 'OUT', 'CLOCK', 'SWITCH', 'BUTTON'].includes(type);
  E.isInput = (type) => ['IN', 'SWITCH', 'BUTTON'].includes(type);
  E.isButton = (dp) => dp.type === 'BUTTON' || (dp.type === 'IN' && dp.params && dp.params.kind === 'button');
  E.defaults = function (type) {
    const o = {};
    for (const p of E.paramsOf(type)) if (p.default != null && p.default !== '' && p.name !== 'ftype') o[p.name] = p.default;
    return o;
  };

  // ---- the simulator ----------------------------------------------------------------------------------------
  /** a simulator for a Netlist.Circuit: Sirkit.Sim when loaded, else the stand-in below */
  E.createSim = function (circuit, opts) {
    if (S.Sim && S.Sim.create) {
      try { const sim = S.Sim.create(circuit, opts); sim.engine = 'Sirkit.Sim'; return sim; } catch (e) { if (typeof console !== 'undefined') console.warn('Sirkit.Sim could not take this circuit, the stand-in runs it: ' + e.message); }
    }
    return new MiniSim(circuit, opts || {});
  };

  class MiniSim {
    constructor(c, opts) {
      this.c = c; this.opts = opts; this.engine = 'stand-in';
      this.tech = E.tech(opts.tech || 'CMOS');
      this.floatHigh = opts.floatHigh != null ? opts.floatHigh : this.tech.floatHigh;
      this.listeners = [];
      this.reset();
    }
    netName(n) { return n.name || n.id; }
    reset() {
      const c = this.c;
      this.time = 0; this.queue = []; this.events = []; this.violations = []; this.waves = new Map();
      this.val = new Map(); this.drv = new Map(); this.lastChange = new Map(); this.st = new Map(); this.ins = new Map();
      this.inputs = new Map(); this.clocks = [];
      for (const n of c.nets) { const w = n.width || 1; this.val.set(n, 'x'.repeat(w)); this.lastChange.set(n, -Infinity); this.drv.set(n, new Map()); this.waves.set(this.netName(n), [[0, 'x'.repeat(w)]]); }
      const pu = this.opts.powerUp;
      for (const p of c.parts) {
        const d = REG[p.type] || {};
        if (d.init) { const st = d.init(p.params || {}); if (pu === 0 || pu === '0' || pu === 'random') for (const k of Object.keys(st)) if (typeof st[k] === 'string') st[k] = st[k].replace(/x/g, () => (pu === 'random' && Math.random() < 0.5 ? '1' : '0')); this.st.set(p, st); }
        if (E.isInput(p.type)) this.inputs.set(p.params.name, p);
        if (p.type === 'CLOCK') this.clocks.push(p);
      }
      this.clock = this.clocks[0] || null;
      this.nextClock = new Map(this.clocks.map((k) => [k, +k.params.phase || 0]));
      // the first settling: every source drives its value, every part evaluates once
      for (const p of c.parts) {
        if (E.isInput(p.type)) this.drive(p, 'y', E.bits(+p.params.value || 0, p.params.w || 1), 0, 'start');
        else if (p.type === 'CLOCK') this.drive(p, 'y', +p.params.phase > 0 ? '0' : '1', 0, 'start');
        else this.evalPart(p, 'start', true);
      }
      this.settle(this.time + 1e-9, true);
    }
    on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }
    emit(e) { for (const f of this.listeners) try { f(e); } catch (x) { /* a listener's own problem */ } }
    widthOf(p, pn) { const q = p.pins.find((x) => x.name === pn); return (q && q.width) || 1; }
    delayOf(p) {
      const v = p.params && p.params.delay;
      if (v != null && v !== '') return +v;
      if (S.Netlist.GATES.has(p.type)) return this.tech.tpd;
      return this.tech.tpd;
    }
    timing(p, k) { const v = p.params && p.params[k]; return v != null && v !== '' ? +v : this.tech[k]; }
    /** schedule a part's output to change */
    drive(p, pn, v, delay, cause) {
      const n = p.net[pn];
      if (!n) return;
      this.queue.push({ t: this.time + delay, net: n, part: p, pin: pn, v, cause, seq: this.seq = (this.seq || 0) + 1 });
    }
    inputOf(p, pn) {
      const n = p.net[pn], w = this.widthOf(p, pn);
      if (!n) return this.floatHigh ? '1'.repeat(w) : 'z'.repeat(w);
      let v = this.val.get(n);
      if (/z/.test(v) && this.floatHigh) v = v.replace(/z/g, '1');
      return v;
    }
    evalPart(p, cause, first) {
      // only the stand-ins' own behaviours (the parts engine's have another calling convention)
      const d = REG[p.type];
      if (!d || ['IN', 'SWITCH', 'BUTTON', 'CLOCK', 'OUT', 'LED', 'HEX', 'SEG7', 'PROBE'].includes(p.type)) return;
      const params = p.params || {};
      const ins = {};
      for (const q of p.pins) if (q.dir === 'in') ins[q.name] = this.inputOf(p, q.name);
      const prev = this.ins.get(p) || {};
      this.ins.set(p, ins);
      let outs;
      if (d.edge || d.level || d.async) {
        const st = this.st.get(p) || {};
        this.st.set(p, st);
        const clk = p.pins.find((q) => q.clock);
        if (clk && d.edge) {
          const a = prev[clk.name], b = ins[clk.name], fall = params.edge === 'falling';
          if (!first && a !== b && ((!fall && a === '0' && b === '1') || (fall && a === '1' && b === '0'))) {
            const tsu = this.timing(p, 'tsu');
            const late = (d.dataPins || []).filter((pn) => p.net[pn] && this.time - this.lastChange.get(p.net[pn]) < tsu);
            d.edge(prev, params, st);
            if (late.length) {
              this.violation(p, 'setup', p.id + ': ' + late.join(', ') + ' changed ' + (this.time - Math.max(...late.map((pn) => this.lastChange.get(p.net[pn])))).toFixed(1) + ' ns before the clock edge, less than the setup time of ' + tsu + ' ns, so the stored value is unknown (X).');
              for (const k of Object.keys(st)) if (typeof st[k] === 'string') st[k] = st[k].replace(/./g, 'x');
            }
            this.edgeAt.set(p, this.time);
          } else if (clk && !first) {
            // a data input changing just after the edge: a hold violation
            const te = this.edgeAt.get(p), th = this.timing(p, 'th');
            if (te != null && this.time - te < th && this.time > te && (d.dataPins || []).some((pn) => prev[pn] !== ins[pn])) {
              this.violation(p, 'hold', p.id + ': an input changed ' + (this.time - te).toFixed(1) + ' ns after the clock edge, within the hold time of ' + th + ' ns, so the stored value is unknown (X).');
              for (const k of Object.keys(st)) if (typeof st[k] === 'string') st[k] = st[k].replace(/./g, 'x');
            }
          }
        }
        if (d.level) d.level(ins, params, st);
        if (d.async) d.async(ins, params, st);
        outs = d.out(st, params);
        const dl = d.edge ? this.timing(p, 'tcq') : this.delayOf(p);
        for (const [pn, v] of Object.entries(outs)) this.drive(p, pn, E.bits(v, this.widthOf(p, pn)), first ? 0 : dl, cause);
        return;
      }
      if (!d.eval) return;
      outs = d.eval(ins, params);
      for (const [pn, v] of Object.entries(outs)) this.drive(p, pn, E.bits(v, this.widthOf(p, pn)), first ? 0 : this.delayOf(p), cause);
    }
    violation(p, kind, say) { const v = { t: this.time, part: p.id, kind, say }; this.violations.push(v); this.emit({ type: 'violation', v }); }
    /** what a net carries, from all its drivers: one driven value wins over Z; two that disagree make X */
    resolve(n) {
      const ds = [...this.drv.get(n).values()];
      const w = n.width || 1;
      if (!ds.length) return 'z'.repeat(w);
      let out = '';
      for (let i = 0; i < w; i++) {
        let b = 'z';
        for (const d of ds) { const c = d[i] || 'x'; if (c === 'z') continue; if (b === 'z') b = c; else if (b !== c) b = 'x'; }
        out += b;
      }
      return out;
    }
    apply(ev) {
      this.time = Math.max(this.time, ev.t);
      const n = ev.net, before = this.val.get(n);
      this.drv.get(n).set(ev.part.id + '.' + ev.pin, ev.v);
      const v = this.resolve(n);
      if (this.drv.get(n).size > 1 && /x/.test(v) && [...this.drv.get(n).values()].every((d) => !/x/.test(d))) this.violation(ev.part, 'contention', 'Two outputs drive ' + this.netName(n) + ' with different values at ' + this.time + ' ns, so the wire reads X.');
      if (v === before) return false;
      this.val.set(n, v);
      this.lastChange.set(n, this.time);
      const w = this.waves.get(this.netName(n));
      if (w[w.length - 1][0] === this.time) w[w.length - 1][1] = v; else w.push([this.time, v]);
      const e = { t: this.time, net: this.netName(n), from: before, to: v, cause: ev.cause };
      this.events.push(e);
      if (this.events.length > 20000) this.events.splice(0, 5000);
      for (const r of n.pins) { const q = r.part.pins.find((x) => x.name === r.pin); if (q && q.dir === 'in') this.evalPart(r.part, ev.part.id); }
      this.emit({ type: 'change', e });
      return true;
    }
    pending() { return this.queue.length; }
    nextTime() {
      let t = Infinity;
      for (const e of this.queue) if (e.t < t) t = e.t;
      for (const [k, tc] of this.nextClock) t = Math.min(t, tc);
      return t;
    }
    clockTick(t) {
      for (const k of this.clocks) {
        if (this.nextClock.get(k) !== t) continue;
        const per = +k.params.period || 100, hi = per * (+k.params.duty || 50) / 100;
        const cur = this.val.get(k.net.y) || '0', rising = cur !== '1';
        this.time = t;
        this.drive(k, 'y', rising ? '1' : '0', 0, k.params.name);
        this.nextClock.set(k, t + (rising ? hi : per - hi));
      }
    }
    /** one event: the earliest change (or clock tick) applied, its consequences scheduled */
    stepEvent() {
      for (let guard = 0; guard < 64; guard++) {
        const t = this.nextTime();
        if (!isFinite(t)) return false;
        const inQ = this.queue.filter((e) => e.t === t);
        if (!inQ.length) { this.clockTick(t); continue; }
        inQ.sort((a, b) => a.seq - b.seq);
        const ev = inQ[0];
        this.queue.splice(this.queue.indexOf(ev), 1);
        if (this.apply(ev)) return true;
      }
      return true;
    }
    /** apply every event up to time t (clocks included) */
    stepTo(t) {
      let n = 0;
      for (;;) {
        const nt = this.nextTime();
        if (!(nt <= t) || ++n > 200000) break;
        const inQ = this.queue.filter((e) => e.t === nt);
        if (!inQ.length) { this.clockTick(nt); continue; }
        inQ.sort((a, b) => a.seq - b.seq);
        this.queue.splice(this.queue.indexOf(inQ[0]), 1);
        this.apply(inQ[0]);
      }
      this.time = Math.max(this.time, t);
    }
    run(ns) { this.stepTo(this.time + ns); }
    settle(limit, quiet) {
      let n = 0;
      while (this.queue.length && n++ < 100000) {
        let ev = this.queue[0];
        for (const e of this.queue) if (e.t < ev.t || (e.t === ev.t && e.seq < ev.seq)) ev = e;
        if (limit != null && ev.t > limit && !quiet) break;
        this.queue.splice(this.queue.indexOf(ev), 1);
        this.apply(ev);
      }
    }
    /** run to the next rising edge of the main clock, then let everything settle (until the falling edge) */
    clockEdge() {
      if (!this.clock) { this.settle(); return; }
      const k = this.clock;
      let guard = 0;
      while (guard++ < 10000) {
        const t = this.nextClock.get(k);
        const cur = this.val.get(k.net.y);
        this.stepTo(t);
        if (cur !== '1' && this.val.get(k.net.y) === '1') break;
      }
      const per = +k.params.period || 100;
      this.stepTo(this.time + per * (+k.params.duty || 50) / 100 - 1e-6);
    }
    set(name, v) {
      const p = this.inputs.get(name);
      if (!p) throw new Error('no input called ' + name);
      this.drive(p, 'y', E.bits(v, p.params.w || 1), 0, name);
      this.stepTo(this.time);
    }
    get(name) {
      const n = this.c.nets.find((x) => this.netName(x) === name || x.id === name);
      if (n) return this.val.get(n);
      const p = this.c.parts.find((x) => x.params && x.params.name === name);
      if (p) { const q = p.pins[0]; return p.net[q.name] ? this.val.get(p.net[q.name]) : 'z'; }
      return undefined;
    }
  }
  MiniSim.prototype.edgeAt = null;
  Object.defineProperty(MiniSim.prototype, 'edgeAt', { get() { if (!this._edgeAt) this._edgeAt = new Map(); return this._edgeAt; } });
  E.MiniSim = MiniSim;

  // ---- VCD ---------------------------------------------------------------------------------------------------
  /** waves (Map name → [[t, v]]) as a Value Change Dump; widths: Map name → bits */
  E.vcd = function (waves, widths, opts) {
    if (S.Verilog && S.Verilog.vcd) try { return S.Verilog.vcd(waves, Object.assign({ widths }, opts)); } catch (e) { /* fall through to our own */ }
    opts = opts || {};
    const names = [...waves.keys()];
    const id = (i) => { let s = ''; i++; while (i > 0) { s += String.fromCharCode(33 + ((i - 1) % 94)); i = Math.floor((i - 1) / 94); } return s; };
    const w = (n) => (widths && widths.get(n)) || (waves.get(n)[0] ? E.bits(waves.get(n)[0][1], 1).length && String(waves.get(n)[0][1]).length : 1) || 1;
    let s = '$date ' + new Date().toISOString().slice(0, 10) + ' $end\n$version Sirkit $end\n$timescale 1ps $end\n$scope module ' + (opts.top || 'sirkit') + ' $end\n';
    names.forEach((n, i) => { s += '$var wire ' + w(n) + ' ' + id(i) + ' ' + n.replace(/\s+/g, '_') + ' $end\n'; });
    s += '$upscope $end\n$enddefinitions $end\n';
    const ch = [];
    names.forEach((n, i) => { for (const [t, v] of waves.get(n)) ch.push([Math.round(t * 1000), i, E.bits(v, w(n))]); });
    ch.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let last = null;
    for (const [t, i, v] of ch) {
      if (t !== last) { s += '#' + t + '\n'; last = t; }
      s += v.length === 1 ? v + id(i) + '\n' : 'b' + v + ' ' + id(i) + '\n';
    }
    return s;
  };

  // ---- which engines are live ---------------------------------------------------------------------------------
  E.status = () => [
    ['Simulator', !!(S.Sim && S.Sim.create)], ['Parts library', !!(S.Parts && S.Parts.registry)], ['Technology presets', !!(S.Tech && S.Tech.presets)],
    ['Boolean algebra', !!(S.Bool && S.Bool.parse)], ['Verilog', !!(S.Verilog && S.Verilog.compile)], ['State machines', !!(S.Fsm)],
  ].map(([name, live]) => ({ name, live }));
})(globalThis.Sirkit = globalThis.Sirkit || {});
