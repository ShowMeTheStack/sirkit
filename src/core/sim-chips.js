// 74-series chips for the lab bench. Each has its DIP pinout (pin numbers, VCC and GND, the job of each pin)
// and behaves as the real part's function table says. Pin names are the data-sheet names written in ASCII,
// with a trailing n for an active-low pin (1CLRn is the active-low clear of flip-flop 1); pin.num is the
// DIP pin number. A chip does nothing until VCC reads 1 and GND reads 0: unpowered, its outputs float (Z).
// Simple chips are built from the library's own parts (a 7400 is four NAND gates inside); the others have
// their own behaviour here.
(function (S) {
  'use strict';
  const P = S.Parts = S.Parts || {};
  const R = P.registry = P.registry || {};
  const X = -1, Z = -2;
  const chips = P.chips = P.chips || {};
  // this file loads before sim-parts.js, so it keeps its own small helpers
  const pin = (name, dir, o) => Object.assign({ name, dir, width: 1, side: dir === 'in' ? 'left' : 'right', label: null, clock: false }, o || {});
  const def = (type, spec) => { spec.type = type; spec.params = spec.params || []; R[type] = spec; return spec; };

  /**
   * names: the pin names in DIP order (pin 1 first); outs: the output pins; labels: drawing labels.
   * The left side holds pins 1..n/2 from the top, the right side n/2+1..n from the bottom, as on the package.
   */
  function chip(num, title, names, outs, spec) {
    const n = names.length, h = n / 2;
    const o = new Set(outs.split(' '));
    const make = (i) => {
      const name = names[i], dir = o.has(name) ? 'out' : 'in';
      return Object.assign(pin(name, dir, { side: i < h ? 'left' : 'right', label: name.replace(/n$/, "'"), clock: /CLK$/.test(name) }), { num: i + 1 }, name === 'VCC' || name === 'GND' ? { power: true } : {}, spec.io && spec.io.includes(name) ? { rd: true } : {});
    };
    const list = [];
    for (let i = 0; i < h; i++) list.push(make(i));
    for (let i = n - 1; i >= h; i--) list.push(make(i));
    const type = 'IC' + num;
    chips[num] = type;
    return def(type, Object.assign({
      label: num + ': ' + title, group: 'Chips', kind: 'chip', number: num, title, dip: n, params: [],
      power: { vcc: 'VCC', gnd: 'GND' },
      pins: () => list.map((q) => Object.assign({}, q)),
      symbol: { shape: 'dip', pins: n },
    }, spec));
  }
  /** the name of a chip's pin from its DIP number */
  P.chipPin = (type, num) => { const s = R[type] || R[P.chips[type]]; const q = s && s.pins({}).find((x) => x.num === num); return q ? q.name : null; };

  // ---- gate packages ----------------------------------------------------------------------------------------
  const QUAD_A = ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'];
  const QUAD_NOR = ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'];
  const quad = (g) => [1, 2, 3, 4].map((i) => ({ id: 'g' + i, type: g, params: { n: 2 }, map: { i0: i + 'A', i1: i + 'B', y: i + 'Y' } }));
  chip('7400', 'quad 2-input NAND', QUAD_A, '1Y 2Y 3Y 4Y', { expand: () => quad('NAND'), doc: 'Four independent 2-input NAND gates.' });
  chip('7402', 'quad 2-input NOR', QUAD_NOR, '1Y 2Y 3Y 4Y', { expand: () => quad('NOR'), doc: 'Four independent 2-input NOR gates. Note the outputs come first on this package.' });
  chip('7404', 'hex inverter', ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'], '1Y 2Y 3Y 4Y 5Y 6Y', {
    expand: () => [1, 2, 3, 4, 5, 6].map((i) => ({ id: 'g' + i, type: 'NOT', params: {}, map: { i0: i + 'A', y: i + 'Y' } })), doc: 'Six inverters.',
  });
  chip('7408', 'quad 2-input AND', QUAD_A, '1Y 2Y 3Y 4Y', { expand: () => quad('AND'), doc: 'Four independent 2-input AND gates.' });
  chip('7432', 'quad 2-input OR', QUAD_A, '1Y 2Y 3Y 4Y', { expand: () => quad('OR'), doc: 'Four independent 2-input OR gates.' });
  chip('7486', 'quad 2-input XOR', QUAD_A, '1Y 2Y 3Y 4Y', { expand: () => quad('XOR'), doc: 'Four independent 2-input exclusive-OR gates.' });
  chip('74125', 'quad tristate buffer', ['1Gn', '1A', '1Y', '2Gn', '2A', '2Y', 'GND', '3Y', '3A', '3Gn', '4Y', '4A', '4Gn', 'VCC'], '1Y 2Y 3Y 4Y', {
    expand: () => [1, 2, 3, 4].map((i) => ({ id: 'g' + i, type: 'BUF', params: { out: 'tri', oeLow: true }, map: { i0: i + 'A', oe: i + 'Gn', y: i + 'Y' } })),
    doc: 'Four buffers; each passes A to Y while its G′ is low and floats Y (Z) while G′ is high.',
  });

  // ---- flip-flops -------------------------------------------------------------------------------------------
  chip('7474', 'dual D flip-flop with preset and clear', ['1CLRn', '1D', '1CLK', '1PREn', '1Q', '1Qn', 'GND', '2Qn', '2Q', '2PREn', '2CLK', '2D', '2CLRn', 'VCC'], '1Q 1Qn 2Q 2Qn', {
    expand: () => [1, 2].map((i) => ({ id: 'ff' + i, type: 'DFF', params: { set: true, reset: true, asyncLow: true }, map: { d: i + 'D', clk: i + 'CLK', set: i + 'PREn', rst: i + 'CLRn', q: i + 'Q', qn: i + 'Qn' } })),
    doc: 'Two rising-edge D flip-flops. PRE′ low sets, CLR′ low clears, both low drive Q and Q′ high together.',
  });
  chip('7476', 'dual JK flip-flop with preset and clear', ['1CLK', '1PREn', '1CLRn', '1J', 'VCC', '2CLK', '2PREn', '2CLRn', '2J', '2Qn', '2Q', '2K', 'GND', '1Qn', '1Q', '1K'], '1Q 1Qn 2Q 2Qn', {
    expand: () => [1, 2].map((i) => ({ id: 'ff' + i, type: 'JKFF', params: { edge: 'fall', set: true, reset: true, asyncLow: true }, map: { j: i + 'J', k: i + 'K', clk: i + 'CLK', set: i + 'PREn', rst: i + 'CLRn', q: i + 'Q', qn: i + 'Qn' } })),
    doc: 'Two JK flip-flops acting on the falling clock edge (as the LS version does), with active-low preset and clear. Power is on pins 5 and 13.',
  });

  // ---- decoders and multiplexers ----------------------------------------------------------------------------
  const bits = (io, names) => { let v = 0; for (let i = 0; i < names.length; i++) { const b = io.b(names[i]); if (b < 0) return -1; v |= b << i; } return v; };
  chip('74138', '3-to-8 line decoder', ['A', 'B', 'C', 'G2An', 'G2Bn', 'G1', 'Y7n', 'GND', 'Y6n', 'Y5n', 'Y4n', 'Y3n', 'Y2n', 'Y1n', 'Y0n', 'VCC'], 'Y0n Y1n Y2n Y3n Y4n Y5n Y6n Y7n', {
    tech: () => 'DECODER', doc: 'Enabled when G1 is high and G2A′, G2B′ are low: the output numbered by CBA goes low, the rest stay high.',
    eval(io) {
      const g1 = io.b('G1'), ga = io.b('G2An'), gb = io.b('G2Bn'), a = bits(io, ['A', 'B', 'C']);
      const off = g1 === 0 || ga === 1 || gb === 1, unk = !off && (g1 < 0 || ga < 0 || gb < 0 || a < 0);
      for (let i = 0; i < 8; i++) io.out('Y' + i + 'n', off ? 1 : unk ? X : a === i ? 0 : 1);
    },
  });
  chip('74151', '8-to-1 multiplexer', ['D3', 'D2', 'D1', 'D0', 'Y', 'W', 'Gn', 'GND', 'C', 'B', 'A', 'D7', 'D6', 'D5', 'D4', 'VCC'], 'Y W', {
    tech: () => 'MUX', techP: { n: 8 }, doc: 'With the strobe G′ low, Y is the data input numbered by CBA and W its complement; G′ high forces Y low.',
    eval(io) {
      const g = io.b('Gn');
      if (g === 1) { io.out('Y', 0); io.out('W', 1); return; }
      const s = bits(io, ['A', 'B', 'C']), d = s < 0 || g < 0 ? -1 : io.b('D' + s);
      io.out('Y', d); io.out('W', d < 0 ? X : 1 - d);
    },
  });
  chip('74153', 'dual 4-to-1 multiplexer', ['1Gn', 'B', '1C3', '1C2', '1C1', '1C0', '1Y', 'GND', '2Y', '2C0', '2C1', '2C2', '2C3', 'A', '2Gn', 'VCC'], '1Y 2Y', {
    tech: () => 'MUX', techP: { n: 4 }, doc: 'Two 4-to-1 multiplexers sharing the select lines B A; each has its own strobe G′, which forces its Y low when high.',
    eval(io) {
      const s = bits(io, ['A', 'B']);
      for (const k of ['1', '2']) {
        const g = io.b(k + 'Gn');
        io.out(k + 'Y', g === 1 ? 0 : g < 0 || s < 0 ? X : io.b(k + 'C' + s));
      }
    },
  });

  // ---- arithmetic -------------------------------------------------------------------------------------------
  chip('74283', '4-bit binary full adder', ['S2', 'B2', 'A2', 'S1', 'A1', 'B1', 'C0', 'GND', 'C4', 'S4', 'B4', 'A4', 'S3', 'A3', 'B3', 'VCC'], 'S1 S2 S3 S4 C4', {
    tech: () => 'ADDER', techP: { w: 4 }, doc: 'S4..S1 = A4..A1 + B4..B1 + C0, with the carry out C4. Bits are numbered 1 to 4.',
    eval(io) {
      const a = bits(io, ['A1', 'A2', 'A3', 'A4']), b = bits(io, ['B1', 'B2', 'B3', 'B4']), c = io.b('C0');
      const r = a < 0 || b < 0 || c < 0 ? -1 : a + b + c;
      for (let i = 0; i < 4; i++) io.out('S' + (i + 1), r < 0 ? X : (r >> i) & 1);
      io.out('C4', r < 0 ? X : r >> 4);
    },
  });
  chip('7485', '4-bit magnitude comparator', ['B3', 'ILT', 'IEQ', 'IGT', 'OGT', 'OEQ', 'OLT', 'GND', 'B0', 'A0', 'B1', 'A1', 'A2', 'B2', 'A3', 'VCC'], 'OGT OEQ OLT', {
    tech: () => 'CMP', techP: { w: 4 }, doc: 'Compares A3..A0 with B3..B0. When they are equal the cascade inputs (from a less significant stage) decide.',
    eval(io) {
      const a = bits(io, ['A0', 'A1', 'A2', 'A3']), b = bits(io, ['B0', 'B1', 'B2', 'B3']);
      const out = (g, e, l) => { io.out('OGT', g); io.out('OEQ', e); io.out('OLT', l); };
      if (a < 0 || b < 0) return out(X, X, X);
      if (a > b) return out(1, 0, 0);
      if (a < b) return out(0, 0, 1);
      const ig = io.b('IGT'), ie = io.b('IEQ'), il = io.b('ILT');
      if (ie === 1) return out(0, 1, 0);
      if (ig < 0 || ie < 0 || il < 0) return out(X, X, X);
      // A = B and the equal input low: the outputs follow the other two cascade inputs, inverted when equal
      if (ig === 1 && il === 0) return out(1, 0, 0);
      if (ig === 0 && il === 1) return out(0, 0, 1);
      if (ig === 1 && il === 1) return out(0, 0, 0);
      return out(1, 0, 1);
    },
  });

  // ---- display decoders -------------------------------------------------------------------------------------
  // segments a..g lit for each 4-bit code; 10 to 15 give the family's own odd shapes (15 is blank)
  const SEG = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7C, 0x07, 0x7F, 0x67, 0x58, 0x4C, 0x62, 0x69, 0x78, 0x00];
  P.SEG7_7447 = SEG;
  const BCD7_PINS = ['B', 'C', 'LTn', 'BIRBOn', 'RBIn', 'D', 'A', 'GND', 'e', 'd', 'c', 'b', 'a', 'g', 'f', 'VCC'];
  function bcd7(io, activeLow) {
    const lt = io.b('LTn'), rbi = io.b('RBIn'), v = bits(io, ['A', 'B', 'C', 'D']);
    // ripple-blanking output: low when this digit is a zero to be blanked (RBI' low, lamp test off)
    io.out('BIRBOn', rbi === 0 && lt === 1 && v === 0 ? 0 : Z);
    const bi = io.b('BIRBOn');
    let segs;
    if (bi === 0) segs = 0;
    else if (bi < 0 || lt < 0) segs = -1;
    else if (lt === 0) segs = 0x7F;
    else segs = v < 0 ? -1 : SEG[v];
    'abcdefg'.split('').forEach((s, i) => {
      if (segs < 0) return io.out(s, X);
      const on = (segs >> i) & 1;
      io.out(s, activeLow ? (on ? 0 : Z) : on);
    });
  }
  chip('7447', 'BCD to seven-segment decoder/driver (open collector, active low)', BCD7_PINS, 'a b c d e f g BIRBOn', {
    tech: () => 'BCD7', io: ['BIRBOn'], pull: ['BIRBOn'], eval: (io) => bcd7(io, true),
    doc: 'Drives a common-anode display: a lit segment’s output pulls low, an unlit one lets go. LT′ low lights every segment; BI′ low blanks; RBI′ low blanks a 0 and pulls RBO′ low for the next digit.',
  });
  chip('7448', 'BCD to seven-segment decoder (active high)', BCD7_PINS, 'a b c d e f g BIRBOn', {
    tech: () => 'BCD7', io: ['BIRBOn'], pull: ['BIRBOn'], eval: (io) => bcd7(io, false),
    doc: 'As the 7447, but a lit segment’s output is high, for a common-cathode display.',
  });

  // ---- counters and shift registers -------------------------------------------------------------------------
  const Q4 = ['QA', 'QB', 'QC', 'QD'];
  const out4 = (io, st) => Q4.forEach((n, i) => io.outAB(n, ((st.q | st.x) >>> i) & 1, (st.x >>> i) & 1));
  function counter(num, syncClear) {
    chip(num, '4-bit synchronous binary counter, ' + (syncClear ? 'synchronous' : 'asynchronous') + ' clear', ['CLRn', 'CLK', 'A', 'B', 'C', 'D', 'ENP', 'GND', 'LOADn', 'ENT', 'QD', 'QC', 'QB', 'QA', 'RCO', 'VCC'], 'QA QB QC QD RCO', {
      doc: (syncClear ? 'CLR′ low clears at the next rising clock edge. ' : 'CLR′ low clears at once. ') + 'Otherwise at each rising edge: LOAD′ low loads DCBA; else with ENP and ENT high it counts. RCO is high at 15 while ENT is high.',
      seq: { clock: 'CLK', edge: () => 'rise', data: () => ['A', 'B', 'C', 'D', 'ENP', 'ENT', 'LOADn'].concat(syncClear ? ['CLRn'] : []), async: () => (syncClear ? [] : [{ pin: 'CLRn', low: true }]), timing: 'ff' },
      init: () => ({ q: 0, x: 15 }),
      async(io, st) {
        if (syncClear) return false;
        const c = io.b('CLRn');
        if (c === 1) return false;
        if (c === 0) { st.q = 0; st.x = 0; } else st.x = 15;
        return true;
      },
      edge(io, st) {
        if (syncClear) { const c = io.b('CLRn'); if (c === 0) { st.q = 0; st.x = 0; return; } if (c < 0) { st.x = 15; return; } }
        const ld = io.b('LOADn');
        if (ld === 0) { const d = bits(io, ['A', 'B', 'C', 'D']); if (d < 0) st.x = 15; else { st.q = d; st.x = 0; } return; }
        const ep = io.b('ENP'), et = io.b('ENT');
        if (ld < 0) { st.x = 15; return; }
        if (ep === 0 || et === 0) return;
        if (ep < 0 || et < 0 || st.x) { st.x = 15; return; }
        st.q = (st.q + 1) & 15;
      },
      out(io, st) {
        out4(io, st);
        const et = io.b('ENT');
        io.out('RCO', et === 0 ? 0 : st.x ? X : st.q !== 15 ? 0 : et < 0 ? X : 1);
      },
    });
  }
  counter('74161', false);
  counter('74163', true);
  chip('74194', '4-bit bidirectional universal shift register', ['CLRn', 'SR', 'A', 'B', 'C', 'D', 'SL', 'GND', 'S0', 'S1', 'CLK', 'QD', 'QC', 'QB', 'QA', 'VCC'], 'QA QB QC QD', {
    doc: 'Mode S1 S0 at each rising edge: 00 holds, 01 shifts right (SR enters QA), 10 shifts left (SL enters QD), 11 loads ABCD. CLR′ low clears at once.',
    seq: { clock: 'CLK', edge: () => 'rise', data: () => ['A', 'B', 'C', 'D', 'SR', 'SL', 'S0', 'S1'], async: () => [{ pin: 'CLRn', low: true }], timing: 'ff' },
    init: () => ({ q: 0, x: 15 }),
    async(io, st) { const c = io.b('CLRn'); if (c === 1) return false; if (c === 0) { st.q = 0; st.x = 0; } else st.x = 15; return true; },
    edge(io, st) {
      const m = bits(io, ['S0', 'S1']);
      if (m < 0) { st.x = 15; return; }
      if (m === 0) return;
      if (m === 3) { const d = bits(io, ['A', 'B', 'C', 'D']); if (d < 0) st.x = 15; else { st.q = d; st.x = 0; } return; }
      io.pass(m === 1 ? 'SR' : 'SL');
      const sa = io.A & 1, sb = io.B & 1;
      if (m === 1) { st.q = ((st.q << 1) | sa) & 15; st.x = ((st.x << 1) | sb) & 15; } else { st.q = (st.q >> 1) | (sa << 3); st.x = (st.x >> 1) | (sb << 3); }
    },
    out: out4,
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
