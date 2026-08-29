// Circuits that run in time, for the storage, register and counter topics: the latches, flip-flops, registers
// and counters themselves (gate level where the gates are the point, parts where they are not), a run of the
// simulator kept whole so any frame can look up any wire at any moment, waveform rows that are drawn up to "now"
// (a curtain hides the future, so a student can predict it), and a state diagram on a circle.
//
//   const R = S.Kit.timing.run(circuit, { tech, deposit: {net: v}, stim: [[t, input, v]..], until, period })
//   R.at(net, t)  R.values(t) (for a schematic item)  R.changes(net)  R.edges() (rising clock edges)
//   S.Kit.timing.waves({ x, y, w, t0, t1, now, signals: [{name, changes, width, cls}], marks, spans })
//   S.Kit.timing.diagram({ x, y, states: [{id, label}], edges: [{from, to, label}], hot, hotEdge })
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const TM = (K.timing = {});
  const Geo = () => S.geom;
  const r2 = (x) => Math.round(x * 100) / 100;

  // ---- building circuits ------------------------------------------------------------------------------------
  /** a gate driven by the given signals (pins); returns its output pin. o: {id, tpLH, tpHL} */
  const G = (c, type, ins, o) => {
    o = o || {};
    const g = c.add(type, Object.assign(type === 'NOT' || type === 'BUF' ? {} : { n: ins.length }, o.tpLH !== undefined ? { tpLH: o.tpLH, tpHL: o.tpHL === undefined ? o.tpLH : o.tpHL } : {}), o.id);
    ins.forEach((s, i) => c.connect(s, g.pin('i' + i)));
    return g.pin('y');
  };
  TM.G = G;
  /** two gates, each fed back from the other: [output of the gate fed by a, output of the gate fed by b] */
  function crossPair(c, type, a, b, o) {
    o = o || {};
    const g1 = c.add(type, Object.assign({ n: 2 }, o.d1 !== undefined ? { tpLH: o.d1, tpHL: o.d1 } : {}), o.id1);
    const g2 = c.add(type, Object.assign({ n: 2 }, o.d2 !== undefined ? { tpLH: o.d2, tpHL: o.d2 } : {}), o.id2);
    c.connect(a, g1.pin('i0')); c.connect(b, g2.pin('i1'));
    c.connect(g1.pin('y'), g2.pin('i0')); c.connect(g2.pin('y'), g1.pin('i1'));
    return [g1.pin('y'), g2.pin('y')];
  }
  TM.crossPair = crossPair;
  const port = (c, name) => c.byId.get('in_' + name) || c.byId.get('out_' + name) || c.byId.get('clk_' + name);
  TM.port = port;
  const setClock = (c, period, phase) => { const k = c.parts.find((p) => p.type === 'CLOCK'); if (k) { k.params.period = period; if (phase !== undefined) k.params.phase = phase; } };
  TM.setClock = setClock;

  /**
   * A drawing placed by hand: parts at grid positions {id: [x, y, variant options]}, and draw(sh, at) for the
   * wires that make the idiom (the rest go to the router). Uses the bit-slice style's sheet with no slices.
   */
  TM.manual = function (c, place, draw) {
    c.style = 'slices';
    c.hints = { slices: [], place: {}, extra(sh, h) {
      for (const p of c.parts) {
        const at = place[p.id];
        if (!at) continue;
        sh.put(p, at[0], at[1], at[2] ? h.variant(p, at[2]) : undefined);
      }
      if (draw) draw(sh, (id, pin) => sh.at(c.byId.get(id), pin), (id, pin) => sh.net(c.byId.get(id), pin));
    } };
    return c;
  };
  /**
   * The X of a cross-coupled pair drawn by hand, as a drafter draws it: T's output drops between the gates into
   * B's upper input, B's output rises into T's lower input. The two legs must cross once; the leg drawn as a
   * rail tells the checker the crossing is meant. xj: the column right of the gates where the outputs branch.
   */
  TM.drawX = function (sh, at, net, T, B, xj) {
    const qt = at(T, 'y'), qb = at(B, 'y'), ti = at(T, 'i1'), bi = at(B, 'i0');
    const ya = ti.y + 2, yb = bi.y - 2, xa = bi.x - 2, xb = xa - 1;
    sh.line(net(T, 'y'), [[qt.x, qt.y], [xj, qt.y], [xj, ya], [xa, ya], [xa, bi.y], [bi.x, bi.y]]);
    sh.line(net(B, 'y'), [[qb.x, qb.y], [xj, qb.y], [xj, yb]]);
    sh.line(net(B, 'y'), [[xj, yb], [xb, yb]], true);
    sh.line(net(B, 'y'), [[xb, yb], [xb, ti.y], [ti.x, ti.y]]);
  };
  const B = (TM.build = {});
  /** SR latch from two NOR gates: g1 makes Q (fed by R), g2 makes Q′ (fed by S) */
  B.srNor = (o) => {
    o = o || {};
    const c = new S.Netlist.Circuit('SR latch (NOR)');
    const [q, qn] = crossPair(c, 'NOR', c.input('R').pin('y'), c.input('S').pin('y'), { id1: 'g1', id2: 'g2', d1: o.d1, d2: o.d2 });
    c.connect(q, c.output('Q')); c.connect(qn, c.output("Q'"));
    return latchDrawing(c, 'R', 'S');
  };
  /** a lone latch pair g1 over g2, the input of g1 (top) and of g2 (bottom) straight in from the left */
  function latchDrawing(c, inT, inB, left, more) {
    const xo = 12;
    const place = { g1: [0, 0], g2: [0, 8], ['out_Q']: [xo, 1], ["out_Q'"]: [xo, 9] };
    if (!left) { place['in_' + inT] = [-10, 0]; place['in_' + inB] = [-10, 10]; }
    else Object.assign(place, left);
    return TM.manual(c, place, (sh, at, net) => {
      TM.drawX(sh, at, net, 'g1', 'g2', 8);
      sh.line(net('g1', 'y'), [[8, 2], [xo, 2]]);
      sh.line(net('g2', 'y'), [[8, 10], [xo, 10]]);
      if (more) more(sh, at, net);
    });
  }
  TM.latchDrawing = latchDrawing;
  /** SR latch from two NAND gates with active-low inputs: g1 makes Q (fed by S′), g2 makes Q′ (fed by R′) */
  B.srNand = (o) => {
    o = o || {};
    const c = new S.Netlist.Circuit('SR latch (NAND)');
    const [q, qn] = crossPair(c, 'NAND', c.input("S'").pin('y'), c.input("R'").pin('y'), { id1: 'g1', id2: 'g2', d1: o.d1, d2: o.d2 });
    c.connect(q, c.output('Q')); c.connect(qn, c.output("Q'"));
    return latchDrawing(c, "S'", "R'");
  };
  /** gated SR latch: two steering NANDs (g3, g4) in front of a NAND latch */
  B.gatedSR = () => {
    const c = new S.Netlist.Circuit('Gated SR latch');
    const s = c.input('S').pin('y'), en = c.input('EN').pin('y'), r = c.input('R').pin('y');
    const a = G(c, 'NAND', [s, en], { id: 'g3' }), b = G(c, 'NAND', [en, r], { id: 'g4' });
    c.name(a, "S'"); c.name(b, "R'");
    const [q, qn] = crossPair(c, 'NAND', a, b, { id1: 'g1', id2: 'g2' });
    c.connect(q, c.output('Q')); c.connect(qn, c.output("Q'"));
    // the steering gates in a column before the latch, EN between them
    return latchDrawing(c, null, null, { g3: [-14, -1], g4: [-14, 9], in_S: [-24, -1], in_EN: [-24, 5], in_R: [-24, 11] });
  };
  /** gated D latch: the gated SR latch with R = D′ */
  B.dLatch = () => {
    const c = new S.Netlist.Circuit('D latch');
    const d = c.input('D').pin('y'), en = c.input('EN').pin('y');
    const a = G(c, 'NAND', [d, en], { id: 'g3' }), b = G(c, 'NAND', [en, G(c, 'NOT', [d], { id: 'inv' })], { id: 'g4' });
    c.name(a, "S'"); c.name(b, "R'");
    const [q, qn] = crossPair(c, 'NAND', a, b, { id1: 'g1', id2: 'g2' });
    c.connect(q, c.output('Q')); c.connect(qn, c.output("Q'"));
    // D runs along the top into g3 and drops, left of EN, to the inverter in front of g4
    return latchDrawing(c, null, null, { g3: [-14, -1], g4: [-14, 9], inv: [-24, 11], in_D: [-38, -1], in_EN: [-28, 5] }, (sh, at, net) => {
      sh.line(net('in_D', 'y'), [[-34, 0], [-14, 0]]);
      sh.line(net('in_D', 'y'), [[-31, 0], [-31, 12], [-24, 12]]);
    });
  };
  /** master–slave D flip-flop from two D latches; the master is open while CLK = 0 */
  B.msD = () => {
    const c = new S.Netlist.Circuit('Master-slave D');
    const d = c.input('D').pin('y'), clk = c.clock('CLK').pin('y');
    const m = c.add('LATCH', { qn: false, title: 'master' }, 'master'), s = c.add('LATCH', { title: 'slave' }, 'slave');
    c.connect(d, m.pin('d')); c.connect(G(c, 'NOT', [clk], { id: 'inv' }), m.pin('en'));
    c.connect(m.pin('q'), s.pin('d')); c.connect(clk, s.pin('en'));
    c.name(m.pin('q'), 'M', true);
    c.connect(s.pin('q'), c.output('Q')); c.connect(s.pin('qn'), c.output("Q'"));
    return c;
  };
  /** the six-NAND positive-edge D flip-flop: two input latches (g1–g2, g3–g4) steer an output latch (g5–g6) */
  B.sixGate = () => {
    const c = new S.Netlist.Circuit('Edge-triggered D');
    const clk = c.clock('CLK').pin('y'), d = c.input('D').pin('y');
    const g1 = c.add('NAND', { n: 2 }, 'g1'), g2 = c.add('NAND', { n: 2 }, 'g2'), g3 = c.add('NAND', { n: 3 }, 'g3'), g4 = c.add('NAND', { n: 2 }, 'g4');
    // g1 = (g4 · g2)′, g2 = (g1 · CLK)′ = S′, g3 = (g2 · CLK · g4)′ = R′, g4 = (g3 · D)′
    c.connect(g4.pin('y'), g1.pin('i0')); c.connect(g2.pin('y'), g1.pin('i1'));
    c.connect(g1.pin('y'), g2.pin('i0')); c.connect(clk, g2.pin('i1'));
    c.connect(g2.pin('y'), g3.pin('i0')); c.connect(clk, g3.pin('i1')); c.connect(g4.pin('y'), g3.pin('i2'));
    c.connect(g3.pin('y'), g4.pin('i0')); c.connect(d, g4.pin('i1'));
    c.name(g2.pin('y'), "S'", true); c.name(g3.pin('y'), "R'", true);
    const [q, qn] = crossPair(c, 'NAND', g2.pin('y'), g3.pin('y'), { id1: 'g5', id2: 'g6' });
    c.connect(q, c.output('Q')); c.connect(qn, c.output("Q'"));
    // three columns: g1 over g4, g2 over g3, the output latch g5–g6 with its X. The long returns (S′ back to g1,
    // R′ back to g4, g4 back to g1) and the clock run as rails, so the crossings they make are the drafter's
    return TM.manual(c, { g1: [0, 0], g4: [0, 16], g2: [14, 1], g3: [14, 12], g5: [28, 2], g6: [28, 10], in_D: [-14, 18], clk_CLK: [-16, 24], out_Q: [40, 3], ["out_Q'"]: [40, 11] }, (sh, at, net) => {
      const nS = net('g2', 'y'), nR = net('g3', 'y'), n4 = net('g4', 'y'), nC = net('clk_CLK', 'y');
      const s2 = at('g2', 'y'), r3 = at('g3', 'y'), y4 = at('g4', 'y');
      TM.drawX(sh, at, net, 'g5', 'g6', 36);
      sh.line(net('g5', 'y'), [[36, 4], [40, 4]]); sh.line(net('g6', 'y'), [[36, 12], [40, 12]]);
      // S′: on to g5, back to g1 below it, and down to g3
      sh.line(nS, [[s2.x, s2.y], [28, 3]]);
      sh.line(nS, [[22, 3], [22, 11], [12, 11], [12, 13], [14, 13]]);
      sh.line(nS, [[22, 8], [-2, 8]], true); sh.line(nS, [[-2, 8], [-2, 3], [0, 3]]);
      // R′: to g6, and back round the bottom to g4
      sh.line(nR, [[r3.x, r3.y], [24, r3.y], [24, 13], [28, 13]]);
      sh.line(nR, [[23, r3.y], [23, 22]]); sh.line(nR, [[23, 22], [-3, 22], [-3, 17]], true); sh.line(nR, [[-3, 17], [0, 17]]);
      // g4: into g3, and up the middle to g1
      sh.line(n4, [[y4.x, y4.y], [10, y4.y], [10, 17], [14, 17]]);
      sh.line(n4, [[8, y4.y], [8, -2]], true); sh.line(n4, [[8, -2], [-3, -2], [-3, 1], [0, 1]]);
      // the clock
      sh.line(nC, [[-9, 25], [11, 25], [11, 4]], true); sh.line(nC, [[11, 4], [14, 4]]); sh.line(nC, [[11, 15], [14, 15]]);
    });
  };
  /** one flip-flop part with its ports: type DFF | JKFF | TFF | SRFF, options {set, reset, asyncLow} */
  B.ff = (type, o) => {
    o = o || {};
    const c = new S.Netlist.Circuit(type);
    const f = c.add(type, { qn: true, set: !!o.set, reset: !!o.reset, asyncLow: !!o.asyncLow }, 'ff');
    const ins = { DFF: ['d'], TFF: ['t'], JKFF: ['j', 'k'], SRFF: ['s', 'r'] }[type];
    if (o.set) c.connect(c.input(o.asyncLow ? "PRE'" : 'PRE').pin('y'), f.pin('set'));
    // the inputs in the order of the pins (J, CLK, K), so no wire crosses another
    c.connect(c.input(ins[0].toUpperCase()).pin('y'), f.pin(ins[0]));
    c.connect(c.clock('CLK').pin('y'), f.pin('clk'));
    if (ins[1]) c.connect(c.input(ins[1].toUpperCase()).pin('y'), f.pin(ins[1]));
    if (o.reset) c.connect(c.input(o.asyncLow ? "CLR'" : 'CLR').pin('y'), f.pin('rst'));
    c.connect(f.pin('q'), c.output('Q')); c.connect(f.pin('qn'), c.output("Q'"));
    return c;
  };

  // ---- registers and counters (part 7) -----------------------------------------------------------------------
  const Sy = () => S.Symbols;
  /** n flip-flops of a type in a row with ports; o: {set: [bits], reset: [bits]} wire INIT to S or R per bit */
  /** a ripple counter: n T flip-flops, each clocked by the Q′ of the one before; o.decode: a value to decode
   *  with an AND gate (output DEC); o.mod: clear asynchronously on reaching it (a NAND of its 1 bits) */
  B.ripple = (n, o) => {
    o = o || {};
    const c = new S.Netlist.Circuit('Ripple counter');
    let ck = c.clock('CLK').pin('y');
    const fs = [], ones = [];
    for (let i = 0; i < n; i++) {
      const f = c.add('TFF', { qn: true, reset: !!o.mod, asyncLow: true }, 'f' + i);
      fs.push(f); c.connect(ck, f.pin('clk')); ck = f.pin('qn');
      if (i === n - 1) c.leaveOpen(f.pin('qn'));
    }
    fs.forEach((f, i) => { const k = c.add('CONST', { value: 1, w: 1 }, 'one' + i); ones.push(k); c.connect(k.pin('y'), f.pin('t')); });
    fs.forEach((f, i) => c.connect(f.pin('q'), c.output('Q' + i)));
    // the gate that watches the count (a decoder, or the clear of a shortened count), fed by rows from the Q lines
    let watch = null, bits = [];
    if (o.mod) {
      for (let i = 0; i < n; i++) if ((o.mod >> i) & 1) bits.push(i);
      watch = c.add('NAND', { n: bits.length }, 'clr');
      bits.forEach((b, k) => c.connect(fs[b].pin('q'), watch.pin('i' + k)));
    } else if (o.decode !== undefined && o.decode !== null) {
      for (let i = 0; i < n; i++) bits.push(i);
      watch = c.add('AND', { n }, 'dec');
      bits.forEach((b, k) => c.connect((o.decode >> b) & 1 ? fs[b].pin('q') : G(c, 'NOT', [fs[b].pin('q')], { id: 'nq' + b }), watch.pin('i' + k)));
      c.connect(watch.pin('y'), c.output('DEC'));
    }
    let clr = null;
    if (o.mod) {
      clr = watch.pin('y');
      if (o.rst) { const a = c.add('AND', { n: 2 }, 'rs'); c.connect(clr, a.pin('i0')); c.connect(c.input("RST'").pin('y'), a.pin('i1')); clr = a.pin('y'); }
      c.connect(clr, ...fs.map((f) => f.pin('rst')));
      c.name(clr, "CLR'", true);
    }
    // drawn by hand: the flip-flops in a row, each clocked by the Q′ of the one before, T tied to 1 from above;
    // each Q drops to its port, and the rows tapping the Q lines run (as rails) to the watching gate at the right
    const P = 14, sides = { t: 'top', q: 'bottom' };
    if (o.mod) sides.rst = 'bottom';
    const qx = (i) => P * i + (o.mod ? 4 : 3);
    const place = { clk_CLK: [-10, 2] };
    fs.forEach((f, i) => { place['f' + i] = [P * i, 0, { sides }]; place['one' + i] = [P * i + 2, -4, { orient: 'down' }]; });
    const rows = watch ? bits.length : 0, yRow = (k) => 9 + 2 * k;
    const xA = P * (n - 1) + 6 + 10, gh = watch ? S.Symbols.geom(watch).h : 0, gw = watch ? S.Symbols.geom(watch).w : 0;
    const yClr = 9 + 2 * rows + 1, yPort = watch ? (o.mod ? yClr + 3 : 9 + 2 * rows + 1) : 9;
    fs.forEach((f, i) => { place['out_Q' + i] = [qx(i) - 2, yPort, { orient: 'down' }]; });
    if (watch) place[watch.id] = [xA, 8];
    if (o.decode !== undefined && o.decode !== null && !o.mod) { bits.forEach((b) => { if (!((o.decode >> b) & 1)) place['nq' + b] = [xA - 5, yRow(b) - 1]; }); place.out_DEC = [xA + gw + 3, 8 + gh / 2 - 1]; }
    if (o.rst) { place.rs = [xA + gw + 3, 8 + gh / 2 - 1]; place["in_RST'"] = [xA + 2, 8 + gh + 2]; }
    TM.manual(c, place, (sh, at, net) => {
      fs.forEach((f, i) => {
        const q = at('f' + i, 'q');
        sh.line(net('f' + i, 'q'), [[q.x, q.y], [q.x, yPort]]);
      });
      bits.forEach((b, k) => {
        const q = at('f' + b, 'q'), y = yRow(k);
        const to = place['nq' + b] ? xA - 5 : xA;
        sh.line(net('f' + b, 'q'), [[q.x, y], [to, y]], true);
      });
      if (o.rst) {
        const r = at('rs', 'i1'), p = at("in_RST'", 'y'), out = at('rs', 'y');
        sh.line(net("in_RST'", 'y'), [[p.x, p.y], [r.x - 1, p.y], [r.x - 1, r.y], [r.x, r.y]]);
        const xr = out.x + 2;
        sh.line(net('rs', 'y'), [[out.x, out.y], [xr, out.y], [xr, yClr]]);
        sh.line(net('rs', 'y'), [[xr, yClr], [at('f0', 'rst').x, yClr]], true);
        fs.forEach((f, i) => { const r2 = at('f' + i, 'rst'); sh.line(net('rs', 'y'), [[r2.x, yClr], [r2.x, r2.y]]); });
      }
    });
    return c;
  };
  /** a synchronous counter of T flip-flops: T0 = EN, Ti = EN·Q0·…·Q(i−1), an AND chain */
  B.syncT = (n) => {
    const c = new S.Netlist.Circuit('Synchronous counter');
    const en = c.input('EN').pin('y'), clk = c.clock('CLK').pin('y');
    const fs = []; for (let i = 0; i < n; i++) fs.push(c.add('TFF', { qn: false }, 'f' + i));
    let t = en;
    const ands = [null];
    fs.forEach((f, i) => {
      c.connect(clk, f.pin('clk')); c.connect(t, f.pin('t'));
      if (i < n - 1) { t = G(c, 'AND', [t, f.pin('q')], { id: 'a' + (i + 1) }); ands.push(t.part); }
    });
    fs.forEach((f, i) => c.connect(f.pin('q'), c.output('Q' + i)));
    const sides = { t: 'top', clock: 'bottom' };
    const tx = Sy().variant(fs[0], { sides }).pins.t.x;
    c.style = 'slices';
    c.hints = { slices: fs.map((f, i) => ({ ff: f, and: ands[i] })), place: { ff: { dx: 0, dy: 0, opts: { sides } }, and: { dx: tx - 2, dy: -9, opts: { orient: 'down' } } }, pitch: 18, rails: [{ port: port(c, 'CLK') }], top: [port(c, 'EN')], bottom: fs.map((f, i) => port(c, 'Q' + i)) };
    return c;
  };
  /**
   * D flip-flops in a row, each D from the one before (a shift register), the first fed by SI, or by feedback
   * ('ring': the last Q; 'johnson': the last Q′; 'lfsr': an XOR of taps). INIT (active high) presets or
   * clears each flip-flop to the bits of o.init (bit i for flip-flop i).
   */
  B.shiftRow = (n, o) => {
    o = o || {};
    const c = new S.Netlist.Circuit(o.title || 'Shift register');
    const fb = o.feedback;
    const si = fb ? null : c.input('SI').pin('y');
    const clk = c.clock('CLK').pin('y');
    const init = o.init !== undefined ? c.input('INIT').pin('y') : null;
    const fs = [];
    for (let i = 0; i < n; i++) {
      const one = o.init !== undefined && ((o.init >> i) & 1);
      fs.push(c.add('DFF', { qn: fb === 'johnson' && i === n - 1, set: init ? !!one : false, reset: init ? !one : false }, 'f' + i));
    }
    fs.forEach((f, i) => { c.connect(clk, f.pin('clk')); if (i) c.connect(fs[i - 1].pin('q'), f.pin('d')); if (init) c.connect(init, f.pin(((o.init >> i) & 1) ? 'set' : 'rst')); });
    fs.forEach((f, i) => c.connect(f.pin('q'), c.output('Q' + i)));
    let xor = null;
    if (!fb) c.connect(si, fs[0].pin('d'));
    else if (fb === 'ring') c.connect(fs[n - 1].pin('q'), fs[0].pin('d'));
    else if (fb === 'johnson') c.connect(fs[n - 1].pin('qn'), fs[0].pin('d'));
    else if (fb === 'lfsr') {
      xor = c.add('XOR', { n: o.taps.length }, 'fb');
      o.taps.forEach((k, j) => c.connect(fs[k].pin('q'), xor.pin('i' + j)));
      c.connect(xor.pin('y'), fs[0].pin('d'));
    }
    if (xor) {
      // drawn by hand: the row of flip-flops, the clock a rail below, each Q dropping to its port; the taps rise
      // to rows above (the left tap higher) into the XOR at the right, whose output returns over the top to D0
      const P = 12, side = { sides: { clock: 'bottom' } }, xX = P * (n - 1) + 14, [k1, k2] = o.taps;
      const place = { clk_CLK: [-12, 7], fb: [xX, -6] };
      fs.forEach((f, i) => { place['f' + i] = [P * i, 0, side]; place['out_Q' + i] = [P * i + 9 - 2, 11, { orient: 'down' }]; });
      TM.manual(c, place, (sh, at, net) => {
        const ck = net('f0', 'clk');
        sh.line(ck, [[-5, 8], [P * (n - 1) + 3, 8]], true);
        fs.forEach((f, i) => sh.line(ck, [[P * i + 3, 8], [P * i + 3, 5]]));
        fs.forEach((f, i) => {
          const qn = net('f' + i, 'q'), x0 = P * i + 6, xEnd = i < n - 1 ? P * (i + 1) : P * i + 9;
          sh.line(qn, [[x0, 2], [xEnd, 2]]);
          sh.line(qn, [[P * i + 9, 2], [P * i + 9, 11]]);
        });
        const tap = (k, y, pin) => { const x = P * k + 8, t = at('fb', pin); sh.line(net('f' + k, 'q'), [[x, 2], [x, y], [t.x, y]]); };
        tap(k1, -5, 'i0'); tap(k2, -3, 'i1');
        const out = at('fb', 'y');
        sh.line(net('fb', 'y'), [[out.x, out.y], [out.x + 2, out.y], [out.x + 2, -8], [-3, -8], [-3, 2], [0, 2]]);
      });
    }
    if (!xor) {
      const sides = { clock: 'bottom', set: 'bottom', rst: 'bottom' };
      if (fb === 'johnson') sides.qn = 'top';
      c.style = 'slices';
      c.hints = { slices: fs.map((f) => ({ ff: f })), place: { ff: { dx: 0, dy: 0, opts: { sides } } }, pitch: 16, rails: [{ port: port(c, 'CLK') }].concat(init ? [{ port: port(c, 'INIT') }] : []), bottom: fs.map((f, i) => port(c, 'Q' + i)) };
      if (!fb) c.hints.extra = (sh) => { const d = sh.at(fs[0], 'd'), p = port(c, 'SI'); sh.put(p, d.x - 6 - sh.g(p).w, d.y - 1); };
    }
    return c;
  };
  /** a bus made of separate nets (named most significant first): its changes as numbers (or bit strings) */
  TM.bus = (R, names) => {
    const times = [...new Set(names.flatMap((n) => R.changes(n).map((q) => q[0])))].sort((a, b) => a - b);
    const out = [];
    for (const t of times) {
      const bits = names.map((n) => R.at(n, t));
      const v = bits.every((b) => b === 0 || b === 1) ? bits.reduce((a, b) => a * 2 + b, 0) : bits.map((b) => String(b)).join('');
      if (!out.length || out[out.length - 1][1] !== v) out.push([t, v]);
    }
    return out;
  };
  /** the value of a bus of separate nets at time t: a number, or null when a bit is unknown */
  TM.busAt = (R, names, t) => { const b = names.map((n) => R.at(n, t)); return b.every((x) => x === 0 || x === 1) ? b.reduce((a, x) => a * 2 + x, 0) : null; };
  TM.bin = (v, n) => (v === null || v === undefined ? 'x'.repeat(n) : v.toString(2).padStart(n, '0'));

  // ---- running ----------------------------------------------------------------------------------------------
  const norm = (v) => (v === 0 || v === 1 ? v : String(v).toLowerCase());
  /** a bus value (an array, least significant bit first) as a number, or as a bit string when not all known */
  const busVal = (v) => {
    if (!Array.isArray(v)) return norm(v);
    if (v.every((b) => b === 0 || b === 1)) return v.reduce((a, b, i) => a + (b << i), 0);
    return v.slice().reverse().map((b) => String(b).toLowerCase()).join('');
  };
  TM.busVal = busVal;
  /**
   * Run a circuit through a stimulus and keep the whole run. o: {tech, deposit: {net: v} at time 0, stim:
   * [[t, input, value]..], until (ns), period (the clock's), phase, meta, seed, powerUp}
   */
  TM.run = function (c, o) {
    o = o || {};
    if (o.period) setClock(c, o.period, o.phase);
    const sim = S.Sim.create(c, { tech: o.tech || 'CMOS', meta: o.meta || 'resolve', seed: o.seed || 1, powerUp: o.powerUp });
    // a value put on a loop (or on a part's outputs, after the parts have first looked at their inputs)
    if (o.depositAt) sim.stepTo(o.depositAt);
    if (o.deposit) for (const k of Object.keys(o.deposit)) sim.deposit(k, o.deposit[k]);
    // a storage part put into a state (as a preset would): its stored bit and its outputs
    if (o.states) for (const id of Object.keys(o.states)) {
      const p = sim.part(id), v = o.states[id];
      if (!p || !p.state) continue;
      p.state.q = v; p.state.x = 0;
      sim.deposit(id + '.q', v);
      if (sim.has(id + '.qn')) sim.deposit(id + '.qn', 1 - v);
    }
    for (const [t, n, v] of o.stim || []) sim.at(t, n, v);
    if (o.script) o.script(sim);
    sim.stepTo(o.until || 200);
    const C = sim.compiled;
    const nameOf = (id) => { const i = C.names.get(id); return i === undefined ? null : C.nets[i].name; };
    const cache = new Map();
    /** the changes of a net: [[t, v]..], one per time (the last), no repeats; buses as numbers */
    const changes = (name) => {
      if (cache.has(name)) return cache.get(name);
      const w = sim.waves.get(nameOf(name) || name) || [];
      const out = [];
      for (const [t, v0] of w) {
        const v = busVal(v0);
        if (out.length && out[out.length - 1][0] === t) out[out.length - 1][1] = v;
        else out.push([t, v]);
        if (out.length > 1 && out[out.length - 1][1] === out[out.length - 2][1]) out.pop();
      }
      cache.set(name, out);
      return out;
    };
    /** the value of a net at time t (after everything at t) */
    const at = (name, t) => { let v = 'x'; for (const [tt, x] of changes(name)) { if (tt <= t + 1e-9) v = x; else break; } return v; };
    /** every net's value at time t, as a schematic item wants it */
    const values = (t) => {
      const out = {};
      for (const n of c.nets) { const v = at(n.id, t); out[n.id] = typeof v === 'number' && n.width === 1 ? String(v) : n.width > 1 ? 'bus' : String(v); }
      return out;
    };
    /** times a net changes, within (a, b] */
    const changesIn = (name, a, b) => changes(name).filter((q) => q[0] > a && q[0] <= b);
    /** the rising edges of the clock, up to the end */
    const edges = (name) => { const k = name || (c.parts.find((p) => p.type === 'CLOCK') || { params: {} }).params.name; const ch = changes(k); return ch.filter((q, i) => q[1] === 1 && i > 0).map((q) => q[0]); };
    const P = o.period || null, ph = o.phase === undefined ? (P || 0) / 2 : o.phase;
    return { sim, c, at, values, changes, changesIn, edges, nameOf, until: o.until || 200, violations: sim.violations.slice(), period: P, edgeAt: (k) => k * P + ph };
  };

  /**
   * A clocked run: the clock low for the first half of each period, so edge k comes at k·P + P/2; each input
   * takes its k-th value at k·P + lead (well clear of the edges). o = {period, cycles, inputs: {name: [values]},
   * lead, tech, deposit, extra: [[t, name, v]..], powerUp}. Returns the run, with edges (the rising edge times).
   */
  TM.clocked = function (c, o) {
    // inputs change a fifth of a period after the previous edge: past its hold time and clock-to-Q, and long
    // before the next edge, so even a few gates in front of a flip-flop meet its setup time
    const P = o.period || 100, n = o.cycles, lead = o.lead === undefined ? -P * 0.3 : o.lead;
    const stim = [];
    for (const name of Object.keys(o.inputs || {})) o.inputs[name].forEach((v, k) => { if (k < n) stim.push([k * P + (k ? lead : 0), name, v]); });
    for (const s of o.extra || []) stim.push(s);
    const R = TM.run(c, Object.assign({}, o, { period: P, phase: P / 2, stim, until: o.until || n * P + 2 }));
    R.period = P; R.edgeAt = (k) => k * P + P / 2;
    return R;
  };

  // ---- waveforms --------------------------------------------------------------------------------------------
  /**
   * Waveform rows up to now: o = {x, y, w, t0, t1, now, rowH, gap, prefix, signals: [{name, changes, width, cls,
   * label}], ticks (a number, or a list of times), unit, marks: [{t, label, cls}] (lines across all rows),
   * spans: [{t0, t1, row (name) or rows, label, cls}] (shaded windows)}. Returns {items, xOf, box, rowY(name)}.
   */
  TM.waves = function (o) {
    const P = o.prefix || 'tw', x0 = o.x || 0, y0 = o.y || 0, rowH = o.rowH || 24, gap = o.gap === undefined ? 14 : o.gap;
    const sigs = o.signals || [];
    const t0 = o.t0 || 0, t1 = o.t1, now = o.now === undefined ? t1 : Math.max(t0, Math.min(t1, o.now));
    const nameW = Math.max(28, ...sigs.map((s) => Geo().textWidth(s.label || s.name, 14, { bold: true }))) + 14;
    const px = x0 + nameW, W = o.w || 480;
    const xOf = (t) => px + ((Math.max(t0, Math.min(t1, t)) - t0) / Math.max(1e-9, t1 - t0)) * W;
    const items = [], rowY = {};
    sigs.forEach((s, i) => {
      const y = y0 + i * (rowH + gap);
      rowY[s.name] = y;
      items.push({ key: P + ':n:' + s.name, kind: 'text', x: px - 10, y: y + rowH / 2 + 5, text: s.label || s.name, anchor: 'end', cls: 'strong' + (s.cls ? ' ' + s.cls : '') });
      // only what has happened by now is drawn: a bus's last value ends at now, so its text is centred in what
      // shows and never cut by the curtain. The trace is an edge for the checker, so no text may sit on it.
      let ch = s.changes || [];
      if (now < t1 - 1e-9) {
        ch = ch.filter((q) => q[0] <= now);
        if ((s.width || 1) > 1 && ch.length) ch = ch.concat([[now, ch[ch.length - 1][1]]]);
      }
      items.push({ key: P + ':w:' + s.name, kind: 'wave', x: px, y, w: W, h: rowH, t0, t1, changes: ch, width: s.width || 1, cls: s.cls || '', audit: 'edge' });
    });
    const bottom = y0 + sigs.length * (rowH + gap) - gap;
    const yAxis = bottom + 20;
    const ticks = Array.isArray(o.ticks) ? o.ticks : TM.ticks(t0, t1, o.ticks === undefined ? 5 : o.ticks);
    ticks.forEach((t, k) => {
      const last = k === ticks.length - 1;
      items.push({ key: P + ':t:' + k, kind: 'text', x: xOf(t), y: yAxis, text: (Math.round(t * 10) / 10) + (last && o.unit !== '' ? ' ' + (o.unit || 'ns') : ''), anchor: t === t0 ? 'start' : last && t >= t1 - 1e-9 ? 'end' : 'middle', cls: 'wave-t' });
    });
    for (const sp of o.spans || []) {
      const rows = sp.rows || (sp.row ? [sp.row] : sigs.map((s) => s.name));
      const ys = rows.map((r) => rowY[r]).filter((v) => v !== undefined);
      if (!ys.length) continue;
      const a = xOf(sp.t0), b = xOf(sp.t1), top = Math.min(...ys) - 5, bot = Math.max(...ys) + rowH + 5;
      items.push({ key: P + ':span:' + (sp.key || sp.label || sp.t0), kind: 'region', x: a, y: top, w: Math.max(2, b - a), h: bot - top, rx: 3, cls: 'tw-span ' + (sp.cls || ''), audit: 'ignore' });
      // the label above the top row, clear of the waves
      if (sp.label) items.push({ key: P + ':spanl:' + (sp.key || sp.label || sp.t0), kind: 'text', x: (a + b) / 2, y: y0 - 12, text: sp.label, anchor: 'middle', cls: 'tw-span-l ' + (sp.cls || ''), size: 12 });
    }
    // a mark's label sits above the rows; one that would touch the label before it (with room for the stage to
    // enlarge both) goes a line higher
    const placed = [];
    for (const m of o.marks || []) {
      const x = xOf(m.t);
      items.push({ key: P + ':mark:' + (m.key || m.t), kind: 'line', x1: x, y1: y0 - 6, x2: x, y2: bottom + 6, cls: 'tw-mark ' + (m.cls || ''), audit: 'ignore', layer: 'lines' });
      if (!m.label) continue;
      const hw = Geo().textWidth(m.label, 12) * 1.3 / 2 + 4;
      let lv = 0;
      while (placed.some((q) => q.lv === lv && x - hw < q.b && x + hw > q.a)) lv++;
      placed.push({ a: x - hw, b: x + hw, lv });
      items.push({ key: P + ':markl:' + (m.key || m.t), kind: 'text', x, y: y0 - 12 - lv * 17, text: m.label, anchor: 'middle', cls: 'tw-mark-l ' + (m.cls || ''), size: 12 });
    }
    if (now < t1 - 1e-9) {
      // the future, hidden: a curtain from now to the end of the rows
      const cx = xOf(now);
      items.push({ key: P + ':curtain', kind: 'region', x: cx, y: y0 - 4, w: px + W - cx + 4, h: bottom - y0 + 8, rx: 0, cls: 'tw-curtain', audit: 'ignore', layer: 'top' });
    }
    if (o.cursor !== false && now > t0) items.push({ key: P + ':cursor', kind: 'line', x1: xOf(now), y1: y0 - 6, x2: xOf(now), y2: bottom + 6, cls: 'cursor', audit: 'ignore', layer: 'top' });
    return { items, xOf, rowY, box: { x: x0, y: y0 - 8, w: nameW + W, h: yAxis - y0 + 14 }, bottom: yAxis + 6, px, nameW };
  };
  /** round times for an axis from t0 to t1, at most about n gaps; the last one is t1 when that is round too */
  TM.ticks = function (t0, t1, n) {
    const span = Math.max(1e-9, t1 - t0), raw = span / Math.max(1, n);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw - 1e-9);
    const out = [];
    for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
    // keep the last label clear of the end, where the unit goes
    return out;
  };
  /** the signals of a run, by name: [{name, changes, width}] */
  TM.signals = (R, names, o) => names.map((n) => {
    const nm = typeof n === 'string' ? n : n.name;
    const width = R.sim.has(nm) ? R.sim.width(nm) : 1;
    return Object.assign({ name: nm, changes: R.changes(nm), width }, typeof n === 'string' ? {} : n, o || {});
  });

  // ---- a state diagram on a circle --------------------------------------------------------------------------
  /**
   * o = {x, y (the centre), R (radius), r (a state's radius), states: [{id, label, cls}], edges: [{from, to,
   * label, cls}], hot (a state id), hotEdge ('a>b'), prefix, start (angle of the first state, degrees),
   * order: [ids] around the circle}
   */
  TM.diagram = function (o) {
    const P = o.prefix || 'sd', st = o.states, n = st.length, r = o.r || 24;
    const R = o.R || Math.max(70, (n * (2 * r + 34)) / (2 * Math.PI));
    const a0 = ((o.start === undefined ? -90 : o.start) * Math.PI) / 180;
    const pos = new Map();
    // states listed in o.inner sit on a small circle inside the ring (unused states, say)
    const inner = new Set(o.inner || []);
    const order = (o.order || st.map((s) => s.id)).filter((id) => !inner.has(id));
    const m = order.length;
    order.forEach((id, i) => { const a = a0 + (2 * Math.PI * i) / m; pos.set(id, { x: (o.x || 0) + R * Math.cos(a), y: (o.y || 0) + R * Math.sin(a), a }); });
    [...inner].forEach((id, i, all) => { const a = Math.PI + (2 * Math.PI * i) / all.length, ri = all.length > 1 ? Math.min(R * 0.42, r * 2.2) : 0; pos.set(id, { x: (o.x || 0) + ri * Math.cos(a), y: (o.y || 0) + ri * Math.sin(a), a }); });
    const items = [];
    for (const s of st) {
      const p = pos.get(s.id);
      items.push({ key: P + ':s:' + s.id, kind: 'state', x: r2(p.x), y: r2(p.y), r, text: s.label === undefined ? s.id : s.label, size: o.size || 14, cls: 'sd-state ' + (s.cls || '') + (o.hot === s.id ? ' hot' : '') });
    }
    // two edges between the same pair bend apart
    const has = new Set(o.edges.map((e) => e.from + '>' + e.to));
    const ix = (id) => order.indexOf(id);
    const dense = o.edges.some((e) => { if (inner.has(e.from) || inner.has(e.to)) return true; const g = Math.abs(ix(e.from) - ix(e.to)); return e.from !== e.to && g !== 1 && g !== m - 1; });
    for (const e of o.edges) {
      const k = e.from + '>' + e.to, self = e.from === e.to;
      const back = has.has(e.to + '>' + e.from) && !self;
      const p = pos.get(e.from);
      const it = { key: P + ':e:' + k, kind: 'edge', from: P + ':s:' + e.from, to: P + ':s:' + e.to, cls: 'sd-edge ' + (e.cls || '') + (o.hotEdge === k ? ' hot' : ''), size: 12 };
      const gap = Math.abs(order.indexOf(e.from) - order.indexOf(e.to));
      const across = m > 3 && !inner.has(e.from) && !inner.has(e.to) && gap !== 1 && gap !== m - 1;
      if (self) { it.loop = (p.a * 180) / Math.PI; }
      else if (back) it.bend = across ? 34 : 16;
      else if (across) it.bend = 30;
      if (e.label) it.label = e.label;
      // a diagram with edges across the circle is a dense graph: its edges may cross (each is bent apart)
      if (dense) it.audit = 'edge-x';
      items.push(it);
    }
    return { items, pos, R, box: { x: (o.x || 0) - R - r - 30, y: (o.y || 0) - R - r - 30, w: 2 * (R + r + 30), h: 2 * (R + r + 30) } };
  };

  // ---- small things -----------------------------------------------------------------------------------------
  /** a title line */
  TM.title = (key, x, y, text, cls) => ({ key, kind: 'text', x, y, text, cls: cls || 'strong', size: 15 });
  /** a value badge: a cell with a name and value */
  TM.badge = (key, x, y, name, v, cls) => ({ key, kind: 'cell', x, y, w: Math.max(64, Geo().textWidth(name + ' = ' + v, 15, { mono: true }) + 18), h: 30, text: name + ' = ' + v, cls: 'tw-badge ' + (cls || ''), size: 15 });
  /** a bit as the narration says it */
  TM.say = (v) => (v === 'x' || v === 'X' ? 'X (unknown)' : String(v));
  /** ns, rounded */
  TM.ns = (t) => (Math.round(t * 100) / 100) + ' ns';
  /** the schematic item for a run at time t */
  TM.schem = (key, R, t, o) => {
    const res = K.schem.layout(R.c);
    return K.schem.item(key, res, Object.assign({ x: 0, y: 0, values: R.values(t) }, o || {}));
  };
  /** names written inside the gates the narration talks about (ids like g1, g2; or the ids given) */
  TM.gateLabels = function (res, x, y, ids) {
    const want = Array.isArray(ids) ? new Set(ids) : null, b = res.bounds, out = [];
    for (const p of res.parts) {
      if (!S.Netlist.GATES.has(p.type) || p.type === 'NOT' || p.type === 'BUF') continue;
      if (want ? !want.has(p.id) : !/^g\d+$/.test(p.id)) continue;
      // inside the body, clear of the output bubble
      out.push({ key: 'gl:' + p.id, kind: 'text', x: r2(x + p.x - b.x + p.w * 0.4), y: r2(y + p.y - b.y + p.h / 2 + 4), text: p.id, anchor: 'middle', cls: 'tw-gname', size: 11, audit: 'ignore', layer: 'top' });
    }
    return out;
  };
  /** a schematic of a circuit with no run (wires uncoloured) */
  TM.plain = (key, c, o) => K.schem.item(key, K.schem.layout(c), o || {});
  /**
   * The usual picture: the circuit at the top left at time t (parts in hot lit), something beside it (side(x, y)
   * returns {items, box}), the waveforms under both drawn up to t. o = {R, t, hot, side, signals, t0, t1, marks,
   * spans, ticks, waveW, noSchem, schemKey, textScale and pinCap (the schematic's names), top (items above
   * everything, y < 0)}
   */
  /**
   * The narration's self-check: claims {net: value} are what a frame's text says the wires carry at time t; each
   * must match the simulation (and so the drawing, which is coloured from the same run). A mismatch is recorded
   * in TM.mismatches, and with TM.strict set (the tests set it) it stops the run.
   */
  TM.mismatches = [];
  TM.strict = false;
  TM.verify = function (R, t, claims) {
    for (const net of Object.keys(claims || {})) {
      const want = claims[net], got = R.at(net, t);
      if (String(want) === String(got)) continue;
      const m = { t, net, said: want, sim: got, title: R.c.title };
      TM.mismatches.push(m);
      if (TM.strict) throw new Error('the narration says ' + net + ' = ' + want + ' at ' + t + ' ns, the simulation has ' + got + ' (' + R.c.title + ')');
    }
  };
  TM.frame = function (o) {
    const R = o.R, items = [];
    if (o.claims && R) TM.verify(R, o.t, o.claims);
    const res = o.noSchem ? null : K.schem.layout(o.circuit || R.c);
    const sw = res ? res.bounds.w : 0, sh = res ? res.bounds.h : 0;
    if (res) items.push(K.schem.item(o.schemKey || 'circ', res, { x: 0, y: 0, values: o.values || (R ? R.values(o.t) : undefined), hot: o.hot || [], textScale: o.textScale, pinCap: o.pinCap }));
    if (res && o.labels !== false) items.push(...TM.gateLabels(res, 0, 0, o.labels));
    let sideBox = null;
    if (o.side) { const s = o.sideBelow ? o.side(0, sh + 34) : o.side(res ? sw + 44 : 0, 0); items.push(...s.items); sideBox = s.box; }
    const right = Math.max(sw, sideBox ? sideBox.x + sideBox.w : 0);
    const below = Math.max(sh, sideBox ? sideBox.y + sideBox.h : 0);
    let wv = null;
    if (o.signals && o.signals.length) {
      const nameW = Math.max(28, ...o.signals.map((s) => Geo().textWidth(s.label || s.name, 14, { bold: true }))) + 14;
      const W = o.waveW || Math.max(520, right - nameW);
      wv = TM.waves({ x: 0, y: below + (o.waveGap || 46), w: W, t0: o.t0 || 0, t1: o.t1, now: o.t, signals: o.signals, marks: o.marks, spans: o.spans, ticks: o.ticks, prefix: 'tw', cursor: o.cursor });
      items.push(...wv.items);
    }
    if (o.extra) items.push(...o.extra);
    return { items, wv, sw, sh, below, right };
  };
  TM.size = (c) => K.schem.layout(c).bounds;
  /** one circuit per key, built once, so its layout (which can take a while) is worked out only once */
  const memo = new Map();
  TM.memo = (key, build) => { if (!memo.has(key)) memo.set(key, build()); return memo.get(key); };
})(globalThis.Sirkit = globalThis.Sirkit || {});
