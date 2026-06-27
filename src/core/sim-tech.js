// Technology presets: the delays and timing of every part kind, plus the electrical facts of the family
// (supply, logic levels, noise margins, drive and load currents, fan-out, power) for the logic-families
// chapter. Times are in ns. A gate's delay is a pair [tpLH, tpHL]: the output rising, the output falling.
// Figures are typical values of the kind found in family data sheets, rounded; they are plausible
// defaults, not a specification, and every part can override them.
(function (S) {
  'use strict';
  const T = S.Tech = {};
  const margins = (l) => ({ high: +(l.voh - l.vih).toFixed(2), low: +(l.vil - l.vol).toFixed(2) });

  function preset(o) {
    o.margins = margins(o.levels);
    // DC fan-out: how many inputs one output can drive in each state
    const c = o.currents;
    o.fanoutDC = Math.floor(Math.min(c.iol / Math.abs(c.iil), Math.abs(c.ioh) / c.iih));
    return o;
  }

  T.presets = {
    CMOS: preset({
      name: 'CMOS', label: 'CMOS (74HC-like, 5 V)', family: 'High-speed CMOS',
      vcc: 5, levels: { voh: 4.9, vol: 0.1, vih: 3.5, vil: 1.5 },
      currents: { ioh: -4, iol: 4, iih: 0.001, iil: -0.001 }, // mA
      fanout: 50, fanoutNote: 'limited by load capacitance (each input adds about 10 pF), not by current',
      power: { staticMw: 0.0025, mwPerMhz: 0.5, note: 'almost all power is dynamic: C·V²·f' },
      floatsHigh: false, clockPeriod: 200,
      gate: { NOT: [8, 8], BUF: [10, 10], NAND: [9, 9], NOR: [9, 9], AND: [10, 10], OR: [10, 10], XOR: [12, 12], XNOR: [12, 12], TRI: [11, 11] },
      perInput: 1,
      ff: { tcq: [14, 14], tsu: 12, th: 3, tw: 10, tres: 10, tpre: [15, 15] },
      latch: { tcq: [12, 12], tsu: 8, th: 3, tw: 10, tres: 10 },
      mem: { taa: 30, twp: 15 },
    }),
    TTL: preset({
      name: 'TTL', label: 'TTL (74-like, 5 V)', family: 'Standard TTL',
      vcc: 5, levels: { voh: 2.4, vol: 0.4, vih: 2.0, vil: 0.8 },
      currents: { ioh: -0.4, iol: 16, iih: 0.04, iil: -1.6 },
      fanout: 10, fanoutNote: 'limited by the 1.6 mA each low input sinks back into the driver',
      power: { staticMw: 10, mwPerMhz: 0.2, note: 'most power is static: about 10 mW per gate whether it switches or not' },
      floatsHigh: true, clockPeriod: 200,
      gate: { NOT: [12, 8], BUF: [14, 11], NAND: [11, 7], NOR: [12, 8], AND: [17.5, 12], OR: [10, 14], XOR: [14, 11], XNOR: [15, 12], TRI: [9, 7] },
      perInput: 1,
      ff: { tcq: [14, 20], tsu: 20, th: 5, tw: 30, tres: 20, tpre: [25, 25] },
      latch: { tcq: [16, 14], tsu: 20, th: 5, tw: 20, tres: 20 },
      mem: { taa: 45, twp: 25 },
    }),
    'LS-TTL': preset({
      name: 'LS-TTL', label: 'LS-TTL (74LS-like, 5 V)', family: 'Low-power Schottky TTL',
      vcc: 5, levels: { voh: 2.7, vol: 0.5, vih: 2.0, vil: 0.8 },
      currents: { ioh: -0.4, iol: 8, iih: 0.02, iil: -0.4 },
      fanout: 20, fanoutNote: 'limited by the 0.4 mA each low input sinks',
      power: { staticMw: 2, mwPerMhz: 0.1, note: 'about 2 mW per gate, a fifth of standard TTL' },
      floatsHigh: true, clockPeriod: 200,
      gate: { NOT: [9, 10], BUF: [12, 12], NAND: [9, 10], NOR: [10, 10], AND: [8, 10], OR: [14, 14], XOR: [12, 10], XNOR: [13, 11], TRI: [9, 7] },
      perInput: 1,
      ff: { tcq: [13, 20], tsu: 20, th: 5, tw: 25, tres: 15, tpre: [20, 20] },
      latch: { tcq: [12, 12], tsu: 15, th: 5, tw: 15, tres: 15 },
      mem: { taa: 40, twp: 20 },
    }),
    FPGA: preset({
      name: 'FPGA', label: 'FPGA-like (LUT logic, 3.3 V I/O)', family: 'FPGA fabric',
      vcc: 3.3, levels: { voh: 2.9, vol: 0.4, vih: 2.0, vil: 0.8 },
      currents: { ioh: -12, iol: 12, iih: 0.01, iil: -0.01 },
      fanout: 64, fanoutNote: 'inside the fabric, limited by routing delay rather than drive',
      power: { staticMw: 0.001, mwPerMhz: 0.005, note: 'per LUT; a large share of a real device’s power is static leakage of the whole chip' },
      floatsHigh: false, clockPeriod: 10,
      gate: { NOT: [0.6, 0.6], BUF: [0.6, 0.6], NAND: [0.6, 0.6], NOR: [0.6, 0.6], AND: [0.6, 0.6], OR: [0.6, 0.6], XOR: [0.6, 0.6], XNOR: [0.6, 0.6], TRI: [1, 1] },
      perInput: 0,
      ff: { tcq: [0.3, 0.3], tsu: 0.1, th: 0.05, tw: 0.5, tres: 1, tpre: [0.5, 0.5] },
      latch: { tcq: [0.4, 0.4], tsu: 0.1, th: 0.05, tw: 0.5, tres: 1 },
      mem: { taa: 2, twp: 1 },
    }),
  };
  T.presets['FPGA-like'] = T.presets.FPGA;
  T.names = ['CMOS', 'TTL', 'LS-TTL', 'FPGA'];
  T.get = (t) => (t && typeof t === 'object' ? t : T.presets[t || 'CMOS'] || T.presets.CMOS);

  const r3 = (x) => Math.round(x * 1000) / 1000;
  const scale = (d, k) => [r3(d[0] * k), r3(d[1] * k)];
  const add = (d, e) => [r3(d[0] + e[0]), r3(d[1] + e[1])];
  const mx = (d) => Math.max(d[0], d[1]);

  /**
   * The default delay [tpLH, tpHL] of a combinational part kind in a technology. Wider gates are a little
   * slower; block parts are counted in levels of gates (a 2:1 multiplexer is about two NAND delays).
   */
  T.delay = function (tech, kind, p) {
    tech = T.get(tech); p = p || {};
    const g = tech.gate, nand = g.NAND, xor = g.XOR, w = p.w || 1;
    if (g[kind]) { const n = p.n || 2, extra = Math.max(0, n - 2) * tech.perInput; return add(g[kind], [extra, extra]); }
    const lv = (k) => scale(nand, k);
    switch (kind) {
      case 'MUX': return lv(2 + Math.max(0, Math.ceil(Math.log2(p.n || 2)) - 1) * 0.5);
      case 'DEMUX': case 'DECODER': return lv(2);
      case 'ENCODER': return lv(1.5);
      case 'PRIENC': return lv(3);
      case 'HA': return [Math.max(xor[0], g.AND[0]), Math.max(xor[1], g.AND[1])];
      case 'FA': return scale(xor, 2);
      // block arithmetic is taken to use carry lookahead: about two gate levels per doubling of the width
      case 'ADDER': return add(lv(2 + 2 * Math.ceil(Math.log2(w))), xor);
      case 'ADDSUB': return add(lv(2 + 2 * Math.ceil(Math.log2(w))), scale(xor, 2));
      case 'CMP': return lv(3 + Math.ceil(Math.log2(w)));
      case 'ALU': return add(lv(4 + 2 * Math.ceil(Math.log2(w))), xor);
      case 'MUL': return add(lv(4 + 4 * Math.ceil(Math.log2(w))), xor);
      case 'BCD7': return lv(3);
      case 'ROM': case 'RAM': return [tech.mem.taa, tech.mem.taa];
      case 'WIRE': return [0, 0];
    }
    return lv(2);
  };
  /** the timing of a storage part kind ('ff' or 'latch'): tcq [lh, hl], tsu, th, tw (min pulse width), tres */
  T.seq = (tech, kind) => { tech = T.get(tech); return tech[kind] || tech.ff; };
  T.worst = mx;
  /** a short table of a preset for lessons: [label, value] rows */
  T.describe = function (tech) {
    tech = T.get(tech);
    const l = tech.levels, c = tech.currents;
    return [
      ['Supply', tech.vcc + ' V'],
      ['VOH / VOL', l.voh + ' V / ' + l.vol + ' V'],
      ['VIH / VIL', l.vih + ' V / ' + l.vil + ' V'],
      ['Noise margin high / low', tech.margins.high + ' V / ' + tech.margins.low + ' V'],
      ['IOH / IOL', c.ioh + ' mA / ' + c.iol + ' mA'],
      ['IIH / IIL', c.iih + ' mA / ' + c.iil + ' mA'],
      ['Fan-out', tech.fanout + ' (' + tech.fanoutNote + ')'],
      ['Power per gate', tech.power.staticMw + ' mW static, ' + tech.power.mwPerMhz + ' mW per MHz'],
      ['NAND delay tpLH / tpHL', tech.gate.NAND[0] + ' ns / ' + tech.gate.NAND[1] + ' ns'],
      ['Flip-flop tsu / th / tcq', tech.ff.tsu + ' / ' + tech.ff.th + ' / ' + mx(tech.ff.tcq) + ' ns'],
    ];
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
