// The circuits of the layout gallery (index.html#demo). Every function and machine here is our own.
// maxCross is the most crossings of irregular wires each drawing may have (crossings over rails, the literal
// rails, product rows, control rails and bus lines, are expected and counted apart), and the checker enforces
// it: 0 for every circuit drawn without one, otherwise the count reached now, so no change goes unnoticed.
(function (S) {
  'use strict';
  const N = S.Netlist, Sy = S.Symbols;
  const port = (c, name) => c.byId.get('in_' + name) || c.byId.get('out_' + name) || c.byId.get('clk_' + name);
  const D = S.Demo = {};
  const list = [];
  const add = (group, id, title, maxCross, build) => list.push({ group, id, title, maxCross, build });
  const fe = (title, outs, style, opts) => () => N.fromExpressions(title, outs, style, opts);
  // a gate driven by the given signals (pin references or parts); returns its output
  const G = (c, type, ...ins) => { const g = c.gate(type, ins.length); ins.forEach((s, i) => c.connect(s, g.pin('i' + i))); return g.pin('y'); };
  const outs = (c, pairs) => { for (const [name, s] of pairs) c.connect(s, c.output(name)); };
  const ff = (c, type, p) => c.add(type, p || {});

  // ---- two-level logic --------------------------------------------------------------------------------------
  const T = 'Two-level logic';
  add(T, 'sop3', 'SOP, 3 variables: F = AB′ + A′C + BC′ (AND-OR)', 0, fe('sop3', { F: "AB' + A'C + BC'" }, 'and-or'));
  add(T, 'pos3', 'POS, 3 variables: G = (A + B + C′)(A′ + B′)(B + C) (OR-AND)', 0, fe('pos3', { G: "(A + B + C')(A' + B')(B + C)" }, 'or-and'));
  add(T, 'sop4', 'SOP, 4 variables: H = A′BD + AC′D′ + BCD′ + A′B′C', 0, fe('sop4', { H: "A'BD + AC'D' + BCD' + A'B'C" }, 'and-or'));
  add(T, 'pos4', 'POS, 4 variables: J = (A + B′ + D)(A′ + C + D′)(B + C′ + D′)(A + C)', 0, fe('pos4', { J: "(A + B' + D)(A' + C + D')(B + C' + D')(A + C)" }, 'or-and'));
  add(T, 'sop5', 'SOP, 5 variables: K = AB′E + C′D′E′ + A′BC + BD′E + A′C′D', 0, fe('sop5', { K: "AB'E + C'D'E' + A'BC + BD'E + A'C'D" }, 'and-or'));
  add(T, 'pos5', 'POS, 5 variables: M = (A + C′ + E)(B′ + D + E′)(A′ + B + C)(C + D′ + E)', 0, fe('pos5', { M: "(A + C' + E)(B' + D + E')(A' + B + C)(C + D' + E)" }, 'or-and'));
  add(T, 'same-ao', 'P = WX′ + YZ as AND-OR', 0, fe('same-ao', { P: "WX' + YZ" }, 'and-or'));
  add(T, 'same-nn', 'The same P as NAND-NAND', 0, fe('same-nn', { P: "WX' + YZ" }, 'nand-nand'));
  add(T, 'same-oa', 'The same P as OR-AND: (W + Y)(W + Z)(X′ + Y)(X′ + Z)', 0, fe('same-oa', { P: "(W + Y)(W + Z)(X' + Y)(X' + Z)" }, 'or-and'));
  add(T, 'same-nor', 'The same P as NOR-NOR', 0, fe('same-nor', { P: "(W + Y)(W + Z)(X' + Y)(X' + Z)" }, 'nor-nor'));

  // ---- multi-level logic ------------------------------------------------------------------------------------
  const ML = 'Multi-level logic';
  add(ML, 'shared', 'Shared subexpression: P = (AB + C)(D + E′), Q = (AB + C)E + D′E′', 4, fe('shared', { P: "(AB + C)(D + E')", Q: "(AB + C)E + D'E'" }, 'multi'));
  add(ML, 'nand-ml', 'NAND only, multi-level: F = (A + BC)(D + E′)', 0, fe('nand-ml', { F: "(A + BC)(D + E')" }, 'nand'));
  add(ML, 'nor-ml', 'NOR only, multi-level: F = (A + BC)(D + E′)', 0, fe('nor-ml', { F: "(A + BC)(D + E')" }, 'nor'));

  // ---- XOR ----------------------------------------------------------------------------------------------------
  const X = 'XOR circuits';
  function parity(n) {
    return () => {
      const c = new N.Circuit('parity' + n);
      let level = [];
      for (let i = 0; i < n; i++) level.push(c.input('D' + i).pin('y'));
      while (level.length > 1) { const nx = []; for (let i = 0; i < level.length; i += 2) nx.push(G(c, 'XOR', level[i], level[i + 1])); level = nx; }
      outs(c, [['P', level[0]]]);
      return c;
    };
  }
  add(X, 'par4', 'Even-parity generator, 4 bits (XOR tree)', 0, parity(4));
  add(X, 'par8', 'Even-parity generator, 8 bits (XOR tree)', 0, parity(8));

  // ---- adders -------------------------------------------------------------------------------------------------
  const A = 'Adders';
  add(A, 'ha', 'Half adder', 0, fe('ha', { S: 'A ^ B', C: 'AB' }, 'multi'));
  add(A, 'fa', 'Full adder, gate level', 0, () => {
    const c = new N.Circuit('fa');
    const a = c.input('A').pin('y'), b = c.input('B').pin('y'), ci = c.input('Cin').pin('y');
    const x = G(c, 'XOR', a, b);
    c.name(x, 'P', true);
    const sum = G(c, 'XOR', x, ci), carry = G(c, 'OR', G(c, 'AND', a, b), G(c, 'AND', x, ci));
    outs(c, [['Cout', carry], ['S', sum]]);
    return c;
  });
  add(A, 'rca4', '4-bit ripple-carry adder from full adders', 0, () => {
    const c = new N.Circuit('rca4');
    let carry = c.input('C0').pin('y');
    const fas = [];
    for (let i = 0; i < 4; i++) {
      const f = c.add('FA', {}, 'fa' + i);
      c.connect(c.input('A' + i), f.pin('a')); c.connect(c.input('B' + i), f.pin('b')); c.connect(carry, f.pin('cin'));
      carry = f.pin('cout'); fas.push(f);
      if (i < 3) c.name(f.pin('cout'), 'C' + (i + 1), true);
    }
    fas.forEach((f, i) => c.connect(f.pin('s'), c.output('S' + i)));
    c.connect(carry, c.output('C4'));
    // a row of full adders, bit 3 at the left: A and B from the top, sums out at the bottom, the carry running
    // right to left from C0 to C4
    const sides = { a: 'top', b: 'top', s: 'bottom', cin: 'right', cout: 'left' };
    c.style = 'slices';
    c.hints = {
      slices: [3, 2, 1, 0].map((i) => ({ fa: fas[i] })),
      place: { fa: { dx: 0, dy: 0, opts: { sides, spread: 6 } } },
      pitch: 20,
      top: [3, 2, 1, 0].flatMap((i) => [c.byId.get('in_A' + i), c.byId.get('in_B' + i)]),
      bottom: [3, 2, 1, 0].map((i) => c.byId.get('out_S' + i)),
      extra(sh, k) {
        const cin = sh.at(fas[0], 'cin'), cout = sh.at(fas[3], 'cout');
        const pc = c.byId.get('in_C0'), po = c.byId.get('out_C4');
        sh.put(pc, cin.x + 5, cin.y - 1, k.variant(pc, { orient: 'left' }));
        const go = k.variant(po, { orient: 'left' });
        sh.put(po, cout.x - 5 - go.w, cout.y - 1, go);
      },
    };
    return c;
  });
  add(A, 'cla4', 'Carry-lookahead generator, 4 bits', 0, fe('cla4', {
    C1: 'G0 + P0C0', C2: 'G1 + P1G0 + P1P0C0', C3: 'G2 + P2G1 + P2P1G0 + P2P1P0C0', C4: 'G3 + P3G2 + P3P2G1 + P3P2P1G0 + P3P2P1P0C0',
  }, 'and-or', { inputs: ['C0', 'G0', 'P0', 'G1', 'P1', 'G2', 'P2', 'G3', 'P3'] }));
  add(A, 'addsub4', '4-bit adder–subtractor with overflow', 1, () => {
    const c = new N.Circuit('addsub4');
    const ab = [0, 1, 2, 3].map((i) => [c.input('A' + i).pin('y'), c.input('B' + i).pin('y')]);
    const m = c.input('M').pin('y');
    let carry = m, prev = null;
    const fas = [];
    for (let i = 0; i < 4; i++) {
      const f = c.add('FA', {}, 'fa' + i);
      c.connect(ab[i][0], f.pin('a'));
      c.connect(G(c, 'XOR', ab[i][1], m), f.pin('b'));
      c.connect(carry, f.pin('cin'));
      prev = carry; carry = f.pin('cout'); fas.push(f);
    }
    fas.forEach((f, i) => c.connect(f.pin('s'), c.output('S' + i)));
    c.connect(carry, c.output('C4'));
    const vx = G(c, 'XOR', prev, carry);
    c.connect(vx, c.output('V'));
    // the adder row of the ripple adder, each B through its XOR with M; M runs as a rail along the top
    const sides = { a: 'top', b: 'top', s: 'bottom', cin: 'right', cout: 'left' };
    const fg = Sy.variant(fas[0], { sides, spread: 8 }), bx = fg.pins.b.x;
    const xors = fas.map((f) => c.netOf(f.pin('b')).pins[0].part);
    c.style = 'slices';
    c.hints = {
      slices: [3, 2, 1, 0].map((i) => ({ xor: xors[i], fa: fas[i] })),
      place: { fa: { dx: 0, dy: 0, opts: { sides, spread: 8 } }, xor: { dx: bx - 2, dy: -9, opts: { orient: 'down' } } },
      pitch: fg.w + 10,
      rails: [{ port: port(c, 'M'), at: 'top' }],
      top: [3, 2, 1, 0].flatMap((i) => [port(c, 'A' + i), port(c, 'B' + i)]),
      bottom: [port(c, 'V')].concat([3, 2, 1, 0].map((i) => port(c, 'S' + i))),
      extra(sh, k) {
        const cout = sh.at(fas[3], 'cout'), gv = k.variant(vx.part, { orient: 'down' });
        sh.put(vx.part, cout.x - 8 - gv.w, cout.y + 3, gv);
        const po = port(c, 'C4'), go = k.variant(po, { orient: 'left' });
        sh.put(po, cout.x - 14 - gv.w - go.w, cout.y - 1, go);
      },
    };
    return c;
  });

  // ---- comparators --------------------------------------------------------------------------------------------
  add('Comparators', 'cmp2', '2-bit magnitude comparator', 0, fe('cmp2', {
    GT: "A1B1' + (A1 ^ B1)'A0B0'", EQ: "(A1 ^ B1)'(A0 ^ B0)'", LT: "A1'B1 + (A1 ^ B1)'A0'B0",
  }, 'multi', { inputs: ['A1', 'B1', 'A0', 'B0'] }));

  // ---- decoders and encoders ----------------------------------------------------------------------------------
  const DE = 'Decoders and encoders';
  add(DE, 'dec24', '2-to-4 decoder with enable, gate level', 0, fe('dec24', { Y0: "EA1'A0'", Y1: "EA1'A0", Y2: "EA1A0'", Y3: 'EA1A0' }, 'and-or', { inputs: ['A1', 'A0', 'E'] }));
  add(DE, 'dec38', '3-to-8 decoder from two 2-to-4 decoders', 3, () => {
    const c = new N.Circuit('dec38');
    const a = [0, 1, 2].map((i) => c.input('A' + i).pin('y'));
    const lo = c.add('DECODER', { k: 2, en: true }, 'declo'), hi = c.add('DECODER', { k: 2, en: true }, 'dechi');
    c.connect(a[0], lo.pin('a0'), hi.pin('a0')); c.connect(a[1], lo.pin('a1'), hi.pin('a1'));
    c.connect(G(c, 'NOT', a[2]), lo.pin('en')); c.connect(a[2], hi.pin('en'));
    for (let i = 0; i < 4; i++) c.connect(lo.pin('y' + i), c.output('Y' + i));
    for (let i = 0; i < 4; i++) c.connect(hi.pin('y' + i), c.output('Y' + (i + 4)));
    return c;
  });
  add(DE, 'prio4', 'Priority encoder, 4 to 2, with valid output', 0, fe('prio4', { Y1: 'D3 + D2', Y0: "D3 + D2'D1", V: 'D3 + D2 + D1 + D0' }, 'multi', { inputs: ['D3', 'D2', 'D1', 'D0'] }));

  // ---- multiplexers -------------------------------------------------------------------------------------------
  const MX = 'Multiplexers';
  add(MX, 'mux41', '4:1 multiplexer, gate level', 0, fe('mux41', { Y: "S1'S0'I0 + S1'S0I1 + S1S0'I2 + S1S0I3" }, 'and-or', { inputs: ['I0', 'I1', 'I2', 'I3', 'S1', 'S0'] }));
  add(MX, 'mux81', '8:1 multiplexer tree from 2:1 multiplexers', 4, () => {
    const c = new N.Circuit('mux81');
    let level = [];
    for (let i = 0; i < 8; i++) level.push(c.input('D' + i).pin('y'));
    const sel = [0, 1, 2].map((i) => c.input('S' + i).pin('y'));
    for (let k = 0; k < 3; k++) {
      const nx = [];
      for (let i = 0; i < level.length; i += 2) { const m = c.add('MUX', { n: 2 }); c.connect(level[i], m.pin('d0')); c.connect(level[i + 1], m.pin('d1')); c.connect(sel[k], m.pin('s0')); nx.push(m.pin('y')); }
      level = nx;
    }
    c.connect(level[0], c.output('Y'));
    return c;
  });
  add(MX, 'muxfn', 'F(A, B, C) = Σm(1, 2, 6, 7) with a 4:1 multiplexer', 0, () => {
    const c = new N.Circuit('muxfn');
    c.freePorts = true;
    const a = c.input('A').pin('y'), b = c.input('B').pin('y'), cc = c.input('C').pin('y');
    const m = c.add('MUX', { n: 4 });
    c.connect(cc, m.pin('d0')); c.connect(G(c, 'NOT', cc), m.pin('d1'));
    c.connect(c.constant(0), m.pin('d2')); c.connect(c.constant(1), m.pin('d3'));
    c.connect(a, m.pin('s1')); c.connect(b, m.pin('s0'));
    c.connect(m.pin('y'), c.output('F'));
    return c;
  });

  // ---- code converter -----------------------------------------------------------------------------------------
  add('Code converters', 'bcd7', 'BCD to seven-segment decoder (codes 10–15 as don’t-cares)', 0, fe('bcd7', {
    a: "A + C + BD + B'D'", b: "B' + C'D' + CD", c: "B + C' + D", d: "A + B'D' + B'C + CD' + BC'D", e: "B'D' + CD'", f: "A + C'D' + BC' + BD'", g: "A + BC' + B'C + CD'",
  }, 'and-or', { inputs: ['A', 'B', 'C', 'D'] }));

  // ---- latches and flip-flops ---------------------------------------------------------------------------------
  const LF = 'Latches and flip-flops';
  function crossPair(c, type, a, b) {
    // two gates, each fed back from the other: returns [out of the gate fed by a, out of the gate fed by b]
    const g1 = c.gate(type, 2), g2 = c.gate(type, 2);
    c.connect(a, g1.pin('i0')); c.connect(b, g2.pin('i1'));
    c.connect(g1.pin('y'), g2.pin('i0')); c.connect(g2.pin('y'), g1.pin('i1'));
    return [g1.pin('y'), g2.pin('y')];
  }
  add(LF, 'srnor', 'SR latch from NOR gates', 1, () => {
    const c = new N.Circuit('srnor');
    const [q, qn] = crossPair(c, 'NOR', c.input('R').pin('y'), c.input('S').pin('y'));
    outs(c, [['Q', q], ["Q'", qn]]);
    return c;
  });
  add(LF, 'srnand', 'SR latch from NAND gates (active-low inputs)', 1, () => {
    const c = new N.Circuit('srnand');
    const [q, qn] = crossPair(c, 'NAND', c.input("S'").pin('y'), c.input("R'").pin('y'));
    outs(c, [['Q', q], ["Q'", qn]]);
    return c;
  });
  add(LF, 'dlatch', 'Gated D latch', 2, () => {
    const c = new N.Circuit('dlatch');
    const d = c.input('D').pin('y'), en = c.input('EN').pin('y');
    const s = G(c, 'NAND', d, en), r = G(c, 'NAND', G(c, 'NOT', d), en);
    const [q, qn] = crossPair(c, 'NAND', s, r);
    outs(c, [['Q', q], ["Q'", qn]]);
    return c;
  });
  add(LF, 'msd', 'Master–slave D flip-flop from two D latches', 0, () => {
    const c = new N.Circuit('msd');
    const d = c.input('D').pin('y'), clk = c.clock('CLK').pin('y');
    const m = c.add('LATCH', { qn: false, title: 'master' }, 'master'), s = c.add('LATCH', { title: 'slave' }, 'slave');
    c.connect(d, m.pin('d')); c.connect(G(c, 'NOT', clk), m.pin('en'));
    c.connect(m.pin('q'), s.pin('d')); c.connect(clk, s.pin('en'));
    outs(c, [['Q', s.pin('q')], ["Q'", s.pin('qn')]]);
    return c;
  });
  add(LF, 'jkms', 'Master\u2013slave JK flip-flop from NAND gates', 5, () => {
    const c = new N.Circuit('jkms');
    const j = c.input('J').pin('y'), clk = c.clock('CLK').pin('y'), k = c.input('K').pin('y');
    const g1 = c.gate('NAND', 3), g2 = c.gate('NAND', 3);
    c.connect(j, g1.pin('i0')); c.connect(clk, g1.pin('i1'), g2.pin('i1')); c.connect(k, g2.pin('i0'));
    const [m, mn] = crossPair(c, 'NAND', g1.pin('y'), g2.pin('y'));
    const inv = c.gate('NOT');
    c.connect(clk, inv.pin('i0'));
    const ck = inv.pin('y');
    const g3 = c.gate('NAND', 2), g4 = c.gate('NAND', 2);
    c.connect(m, g3.pin('i0')); c.connect(ck, g3.pin('i1'), g4.pin('i0')); c.connect(mn, g4.pin('i1'));
    const [q, qn] = crossPair(c, 'NAND', g3.pin('y'), g4.pin('y'));
    c.connect(qn, g1.pin('i2')); c.connect(q, g2.pin('i2'));
    outs(c, [['Q', q], ["Q'", qn]]);
    // the textbook drawing: input pair, master X, gating pair, slave X; clock rails along the bottom
    c.style = 'msff';
    c.hints = { g1, g2, m: m.part, mn: mn.part, g3, g4, q: q.part, qn: qn.part, inv };
    return c;
  });

  // ---- registers ----------------------------------------------------------------------------------------------
  const RG = 'Registers';
  add(RG, 'reg4', '4-bit register with parallel load (a 2:1 multiplexer per bit)', 0, () => {
    const c = new N.Circuit('reg4');
    const d = [0, 1, 2, 3].map((i) => c.input('D' + i).pin('y'));
    const ld = c.input('LD').pin('y'), clk = c.clock('CLK').pin('y');
    for (let i = 0; i < 4; i++) {
      const m = c.add('MUX', { n: 2 }), f = ff(c, 'DFF', { qn: false });
      c.connect(d[i], m.pin('d1')); c.connect(ld, m.pin('s0'));
      c.connect(m.pin('y'), f.pin('d')); c.connect(clk, f.pin('clk'));
      c.connect(f.pin('q'), m.pin('d0'), c.output('Q' + i));
    }
    // a slice per bit, bit 3 at the left: the load multiplexer and its flip-flop; load and clock as rails below
    const muxes = c.parts.filter((p) => p.type === 'MUX'), ffs = c.parts.filter((p) => p.type === 'DFF');
    c.style = 'slices';
    c.hints = {
      slices: [3, 2, 1, 0].map((i) => ({ mux: muxes[i], ff: ffs[i] })),
      place: { mux: { dx: 4, dy: 0 }, ff: { dx: 13, dy: 1, opts: { sides: { clock: 'bottom' } } } },
      pitch: 28,
      rails: [{ port: port(c, 'LD') }, { port: port(c, 'CLK') }],
      top: [3, 2, 1, 0].map((i) => port(c, 'D' + i)),
      bottom: [3, 2, 1, 0].map((i) => port(c, 'Q' + i)),
    };
    return c;
  });
  add(RG, 'shift4', '4-bit shift register', 0, () => {
    const c = new N.Circuit('shift4');
    let s = c.input('SI').pin('y');
    const clk = c.clock('CLK').pin('y');
    for (let i = 0; i < 4; i++) {
      const f = ff(c, 'DFF', { qn: false });
      c.connect(s, f.pin('d')); c.connect(clk, f.pin('clk'));
      s = f.pin('q');
      c.connect(s, c.output('Q' + i));
    }
    // the flip-flops in a row, data passing left to right; the clock a rail below, the outputs dropping from
    // the chain
    const ffs = c.parts.filter((p) => p.type === 'DFF');
    c.style = 'slices';
    c.hints = {
      slices: ffs.map((f) => ({ ff: f })),
      place: { ff: { dx: 0, dy: 0, opts: { sides: { clock: 'bottom' } } } },
      pitch: 14,
      rails: [{ port: port(c, 'CLK') }],
      bottom: [0, 1, 2, 3].map((i) => port(c, 'Q' + i)),
      extra(sh) { const d = sh.at(ffs[0], 'd'), p = port(c, 'SI'); sh.put(p, d.x - 6 - sh.g(p).w, d.y - 1); },
    };
    return c;
  });
  add(RG, 'univ4', 'Universal shift register: hold, shift right, shift left, load', 4, () => {
    const c = new N.Circuit('univ4');
    const sri = c.input('RI').pin('y');
    const din = [0, 1, 2, 3].map((i) => c.input('I' + i).pin('y'));
    const sli = c.input('LI').pin('y');
    const s1 = c.input('S1').pin('y'), s0 = c.input('S0').pin('y'), clk = c.clock('CLK').pin('y');
    const ms = [], fs = [];
    for (let i = 0; i < 4; i++) { ms.push(c.add('MUX', { n: 4 })); fs.push(ff(c, 'DFF', { qn: false })); }
    for (let i = 0; i < 4; i++) {
      const m = ms[i], f = fs[i];
      c.connect(s1, m.pin('s1')); c.connect(s0, m.pin('s0'));
      c.connect(m.pin('y'), f.pin('d')); c.connect(clk, f.pin('clk'));
      c.connect(din[i], m.pin('d3'));
    }
    for (let i = 0; i < 4; i++) {
      const q = fs[i].pin('q');
      const sinks = [ms[i].pin('d0'), c.output('Q' + i)];
      if (i + 1 < 4) sinks.push(ms[i + 1].pin('d1'));
      if (i > 0) sinks.push(ms[i - 1].pin('d2'));
      c.connect(q, ...sinks);
    }
    c.connect(sri, ms[0].pin('d1')); c.connect(sli, ms[3].pin('d2'));
    // the universal-register idiom: slices in a row, shift lanes above and below, mode lines and clock as rails
    c.style = 'univ';
    c.hints = { muxes: ms, ffs: fs, rails: [port(c, 'S1'), port(c, 'S0'), port(c, 'CLK')] };
    return c;
  });

  // ---- counters -----------------------------------------------------------------------------------------------
  const CT = 'Counters';
  add(CT, 'ripple4', '4-bit ripple counter from T flip-flops', 0, () => {
    const c = new N.Circuit('ripple4');
    let ck = c.clock('CLK').pin('y');
    const fs = [];
    for (let i = 0; i < 4; i++) { const f = ff(c, 'TFF', { qn: i < 3 }); fs.push(f); c.connect(ck, f.pin('clk')); ck = i < 3 ? f.pin('qn') : null; }
    const ones = fs.map((f) => { const k = c.constant(1); c.connect(k, f.pin('t')); return k; });
    fs.forEach((f, i) => c.connect(f.pin('q'), c.output('Q' + i)));
    // the flip-flops in a row, each clocked from the one before; T tied high from above, Q out below
    const sides = { t: 'top', q: 'bottom' };
    const tx = Sy.variant(fs[0], { sides }).pins.t.x;
    c.style = 'slices';
    c.hints = {
      slices: fs.map((f, i) => ({ ff: f, one: ones[i] })),
      place: { ff: { dx: 0, dy: 0, opts: { sides } }, one: { dx: tx - 1, dy: -5, opts: { orient: 'down' } } },
      pitch: 16,
      bottom: [0, 1, 2, 3].map((i) => port(c, 'Q' + i)),
      extra(sh) { const k = sh.at(fs[0], 'clk'), p = port(c, 'CLK'); sh.put(p, k.x - 6 - sh.g(p).w, k.y - 1); },
    };
    return c;
  });
  add(CT, 'sync4', 'Synchronous 4-bit counter with T flip-flops and enable', 0, () => {
    const c = new N.Circuit('sync4');
    const en = c.input('EN').pin('y'), clk = c.clock('CLK').pin('y');
    const fs = [0, 1, 2, 3].map(() => ff(c, 'TFF', { qn: false }));
    let t = en;
    const ands = [null];
    fs.forEach((f, i) => {
      c.connect(clk, f.pin('clk'));
      c.connect(t, f.pin('t'));
      if (i < 3) { t = G(c, 'AND', t, f.pin('q')); ands.push(t.part); }
    });
    fs.forEach((f, i) => c.connect(f.pin('q'), c.output('Q' + i)));
    // the flip-flops in a row; above each (but the first) the AND that enables it; the clock a rail below
    const sides = { t: 'top', clock: 'bottom' };
    const tx = Sy.variant(fs[0], { sides }).pins.t.x;
    c.style = 'slices';
    c.hints = {
      slices: fs.map((f, i) => ({ ff: f, and: ands[i] })),
      place: { ff: { dx: 0, dy: 0, opts: { sides } }, and: { dx: tx - 2, dy: -9, opts: { orient: 'down' } } },
      pitch: 18,
      rails: [{ port: port(c, 'CLK') }],
      top: [port(c, 'EN')],
      bottom: [0, 1, 2, 3].map((i) => port(c, 'Q' + i)),
    };
    return c;
  });
  add(CT, 'mod6', 'Mod-6 counter with D flip-flops', 0, () => {
    const c = new N.Circuit('mod6');
    const clk = c.clock('CLK').pin('y');
    const f = [0, 1, 2].map(() => ff(c, 'DFF', {}));
    const q = f.map((x) => x.pin('q')), qn = f.map((x) => x.pin('qn'));
    f.forEach((x) => c.connect(clk, x.pin('clk')));
    c.connect(qn[0], f[0].pin('d'));
    c.connect(G(c, 'OR', G(c, 'AND', qn[2], qn[1], q[0]), G(c, 'AND', q[1], qn[0])), f[1].pin('d'));
    c.connect(G(c, 'OR', G(c, 'AND', q[1], q[0]), G(c, 'AND', q[2], qn[0])), f[2].pin('d'));
    for (let i = 0; i < 3; i++) c.connect(q[i], c.output('Q' + i));
    return c;
  });
  add(CT, 'ring4', '4-bit ring counter (INIT loads 1000)', 0, () => {
    const c = new N.Circuit('ring4');
    const init = c.input('INIT').pin('y'), clk = c.clock('CLK').pin('y');
    const fs = [0, 1, 2, 3].map((i) => ff(c, 'DFF', { qn: false, set: i === 0, reset: i > 0 }));
    fs.forEach((f, i) => { c.connect(clk, f.pin('clk')); if (i) c.connect(fs[i - 1].pin('q'), f.pin('d')); });
    c.connect(init, fs[0].pin('set'), ...fs.slice(1).map((f) => f.pin('rst')));
    fs.forEach((f, i) => c.connect(f.pin('q'), c.output('Q' + i)));
    c.connect(fs[3].pin('q'), fs[0].pin('d'));
    // the flip-flops in a row, the last one's output returning above them to the first; clock and INIT as
    // rails below, with straight taps into the clock and preset/clear pins
    const sides = { clock: 'bottom', set: 'bottom', rst: 'bottom' };
    c.style = 'slices';
    c.hints = {
      slices: fs.map((f) => ({ ff: f })),
      place: { ff: { dx: 0, dy: 0, opts: { sides } } },
      pitch: 16,
      rails: [{ port: port(c, 'CLK') }, { port: port(c, 'INIT') }],
      bottom: [0, 1, 2, 3].map((i) => port(c, 'Q' + i)),
    };
    return c;
  });
  add(CT, 'johnson4', '4-bit Johnson counter', 0, () => {
    const c = new N.Circuit('johnson4');
    const clr = c.input('CLR').pin('y'), clk = c.clock('CLK').pin('y');
    const fs = [0, 1, 2, 3].map((i) => ff(c, 'DFF', { qn: i === 3, reset: true }));
    fs.forEach((f, i) => { c.connect(clk, f.pin('clk')); if (i) c.connect(fs[i - 1].pin('q'), f.pin('d')); });
    c.connect(clr, ...fs.map((f) => f.pin('rst')));
    fs.forEach((f, i) => c.connect(f.pin('q'), c.output('Q' + i)));
    c.connect(fs[3].pin('qn'), fs[0].pin('d'));
    // as the ring counter, the last flip-flop's Q' (on its top) returning above the row to the first
    c.style = 'slices';
    c.hints = {
      slices: fs.map((f) => ({ ff: f })),
      place: { ff: { dx: 0, dy: 0, opts: { sides: { clock: 'bottom', rst: 'bottom', qn: 'top' } } } },
      pitch: 16,
      rails: [{ port: port(c, 'CLK') }, { port: port(c, 'CLR') }],
      bottom: [0, 1, 2, 3].map((i) => port(c, 'Q' + i)),
    };
    return c;
  });

  // ---- state machines -----------------------------------------------------------------------------------------
  const SM = 'State machines';
  add(SM, 'mealy', 'Mealy machine: Z = 1 on the 0 that ends 1, 1, 0 (D1 = X(Q1 + Q0), D0 = XQ1′Q0′, Z = X′Q1)', 0, () => {
    const c = new N.Circuit('mealy');
    const x = c.input('X').pin('y'), clk = c.clock('CLK').pin('y');
    const f1 = ff(c, 'DFF', {}, 'q1'), f0 = ff(c, 'DFF', {}, 'q0');
    c.connect(clk, f1.pin('clk'), f0.pin('clk'));
    c.connect(G(c, 'AND', x, G(c, 'OR', f1.pin('q'), f0.pin('q'))), f1.pin('d'));
    c.connect(G(c, 'AND', x, f1.pin('qn'), f0.pin('qn')), f0.pin('d'));
    c.connect(G(c, 'AND', G(c, 'NOT', x), f1.pin('q')), c.output('Z'));
    return c;
  });
  add(SM, 'moore', 'Moore machine: counts ones in a row up to three, Y = 1 at three (D1 = A(Q1 + Q0), D0 = A(Q1 + Q0′))', 0, () => {
    const c = new N.Circuit('moore');
    const a = c.input('A').pin('y'), clk = c.clock('CLK').pin('y');
    const f1 = ff(c, 'DFF', { qn: false }), f0 = ff(c, 'DFF', {});
    c.connect(clk, f1.pin('clk'), f0.pin('clk'));
    c.connect(G(c, 'AND', a, G(c, 'OR', f1.pin('q'), f0.pin('q'))), f1.pin('d'));
    c.connect(G(c, 'AND', a, G(c, 'OR', f1.pin('q'), f0.pin('qn'))), f0.pin('d'));
    c.connect(G(c, 'AND', f1.pin('q'), f0.pin('q')), c.output('Y'));
    return c;
  });

  // ---- datapath -----------------------------------------------------------------------------------------------
  add('Datapath', 'datapath', 'A small datapath: four 8-bit registers, a read multiplexer, an ALU with a result register Z, and a bus', 0, () => {
    const c = new N.Circuit('datapath');
    const din = c.input('DIN', 8).pin('y'), wa0 = c.input('WA0').pin('y'), wa1 = c.input('WA1').pin('y'), we = c.input('WE').pin('y');
    const rs = c.input('RS', 2).pin('y'), op = c.input('OP', 2).pin('y'), src = c.input('SRC').pin('y'), clk = c.clock('CLK').pin('y');
    const dec = c.add('DECODER', { k: 2, en: true }, 'dec');
    c.connect(wa0, dec.pin('a0')); c.connect(wa1, dec.pin('a1')); c.connect(we, dec.pin('en'));
    const regs = [0, 1, 2, 3].map((i) => c.add('REG', { w: 8, ld: true, name: 'R' + i }, 'r' + i));
    const rd = c.add('MUX', { n: 4, w: 8, selBus: true }, 'rdmux');
    const alu = c.add('ALU', { w: 8, opw: 2 }, 'alu');
    const bm = c.add('MUX', { n: 2, w: 8 }, 'busmux');
    const z = c.add('REG', { w: 8, name: 'Z' }, 'z');
    regs.forEach((r, i) => { c.connect(dec.pin('y' + i), r.pin('ld')); c.connect(r.pin('q'), rd.pin('d' + i)); });
    c.connect(clk, ...regs.map((r) => r.pin('clk')), z.pin('clk'));
    c.connect(rs, rd.pin('s'));
    // the ALU takes a register (A) and the bus (B); its result is held in Z, which can drive the bus
    c.connect(rd.pin('y'), alu.pin('a')); c.connect(din, bm.pin('d1')); c.connect(op, alu.pin('op'));
    c.connect(alu.pin('y'), z.pin('d')); c.connect(z.pin('q'), bm.pin('d0')); c.connect(src, bm.pin('s0'));
    c.connect(bm.pin('y'), ...regs.map((r) => r.pin('d')), alu.pin('b'), c.output('BUS', 8));
    c.name(bm.pin('y'), 'BUS', true);
    c.style = 'datapath';
    c.hints = { regs, dec, rdmux: rd, alu, busmux: bm, z };
    return c;
  });

  D.list = () => list;
  D.byId = (id) => list.find((d) => d.id === id);
})(globalThis.Sirkit = globalThis.Sirkit || {});
