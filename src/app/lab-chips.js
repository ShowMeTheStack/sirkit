// The lab bench's 74-series chips: each one's DIP pinout (the same pin names as the parts engine uses, with a
// trailing n for an active-low pin) and its behaviour at the pins, for the bench's own simulator. g(pin) reads
// an input as '0', '1' or 'x'; o(pin, v) drives an output with '0', '1', 'x' or 'z'; st keeps a chip's state.
(function (S) {
  'use strict';
  const L = S.LabChips = {};
  const not = (a) => (a === '1' ? '0' : a === '0' ? '1' : 'x');
  const and = (a, b) => (a === '0' || b === '0' ? '0' : a === '1' && b === '1' ? '1' : 'x');
  const or = (a, b) => (a === '1' || b === '1' ? '1' : a === '0' && b === '0' ? '0' : 'x');
  const xor = (a, b) => (a === 'x' || b === 'x' ? 'x' : a === b ? '0' : '1');
  const num = (g, names) => { let v = 0; for (let i = 0; i < names.length; i++) { const b = g(names[i]); if (b === 'x') return -1; if (b === '1') v |= 1 << i; } return v; };
  /** a rising (or falling) edge of a clock input since the chip last looked */
  const edge = (st, g, pin, fall) => { const was = st['_' + pin], now = g(pin); st['_' + pin] = now; return fall ? was === '1' && now === '0' : was === '0' && now === '1'; };
  const out4 = (o, q, names) => names.forEach((n, i) => o(n, q < 0 ? 'x' : (q >> i) & 1 ? '1' : '0'));

  const QUAD_A = ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'];
  const QUAD_NOR = ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'];
  const quad = (f) => (g, o) => { for (let i = 1; i <= 4; i++) o(i + 'Y', f(g(i + 'A'), g(i + 'B'))); };
  const SEG = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7C, 0x07, 0x7F, 0x67, 0x58, 0x4C, 0x62, 0x69, 0x78, 0x00];

  const list = [
    ['7400', 'Quad 2-input NAND', QUAD_A, '1Y 2Y 3Y 4Y', quad((a, b) => not(and(a, b)))],
    ['7402', 'Quad 2-input NOR', QUAD_NOR, '1Y 2Y 3Y 4Y', quad((a, b) => not(or(a, b)))],
    ['7404', 'Hex inverter', ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'], '1Y 2Y 3Y 4Y 5Y 6Y', (g, o) => { for (let i = 1; i <= 6; i++) o(i + 'Y', not(g(i + 'A'))); }],
    ['7408', 'Quad 2-input AND', QUAD_A, '1Y 2Y 3Y 4Y', quad(and)],
    ['7432', 'Quad 2-input OR', QUAD_A, '1Y 2Y 3Y 4Y', quad(or)],
    ['7486', 'Quad 2-input XOR', QUAD_A, '1Y 2Y 3Y 4Y', quad(xor)],
    ['7474', 'Dual D flip-flop, preset and clear', ['1CLRn', '1D', '1CLK', '1PREn', '1Q', '1Qn', 'GND', '2Qn', '2Q', '2PREn', '2CLK', '2D', '2CLRn', 'VCC'], '1Q 1Qn 2Q 2Qn', (g, o, st) => {
      for (const i of [1, 2]) {
        const pre = g(i + 'PREn'), clr = g(i + 'CLRn'), k = 'q' + i;
        const e = edge(st, g, i + 'CLK');
        if (pre === '0' && clr === '0') { st[k] = 'x'; o(i + 'Q', '1'); o(i + 'Qn', '1'); continue; }
        if (pre === '0') st[k] = '1'; else if (clr === '0') st[k] = '0'; else if (pre === 'x' || clr === 'x') st[k] = 'x';
        else if (e) st[k] = g(i + 'D');
        const q = st[k] || 'x';
        o(i + 'Q', q); o(i + 'Qn', not(q));
      }
    }],
    ['7476', 'Dual JK flip-flop, preset and clear', ['1CLK', '1PREn', '1CLRn', '1J', 'VCC', '2CLK', '2PREn', '2CLRn', '2J', '2Qn', '2Q', '2K', 'GND', '1Qn', '1Q', '1K'], '1Q 1Qn 2Q 2Qn', (g, o, st) => {
      for (const i of [1, 2]) {
        const pre = g(i + 'PREn'), clr = g(i + 'CLRn'), k = 'q' + i;
        const e = edge(st, g, i + 'CLK', true);
        if (pre === '0' && clr === '0') { st[k] = 'x'; o(i + 'Q', '1'); o(i + 'Qn', '1'); continue; }
        if (pre === '0') st[k] = '1'; else if (clr === '0') st[k] = '0';
        else if (e) {
          const j = g(i + 'J'), kk = g(i + 'K'), q = st[k] || 'x';
          st[k] = j === '0' && kk === '0' ? q : j === '0' && kk === '1' ? '0' : j === '1' && kk === '0' ? '1' : j === '1' && kk === '1' ? not(q) : 'x';
        }
        const q = st[k] || 'x';
        o(i + 'Q', q); o(i + 'Qn', not(q));
      }
    }],
    ['74138', '3-to-8 line decoder', ['A', 'B', 'C', 'G2An', 'G2Bn', 'G1', 'Y7n', 'GND', 'Y6n', 'Y5n', 'Y4n', 'Y3n', 'Y2n', 'Y1n', 'Y0n', 'VCC'], 'Y0n Y1n Y2n Y3n Y4n Y5n Y6n Y7n', (g, o) => {
      const g1 = g('G1'), ga = g('G2An'), gb = g('G2Bn'), a = num(g, ['A', 'B', 'C']);
      const off = g1 === '0' || ga === '1' || gb === '1', unk = !off && (g1 === 'x' || ga === 'x' || gb === 'x' || a < 0);
      for (let i = 0; i < 8; i++) o('Y' + i + 'n', off ? '1' : unk ? 'x' : a === i ? '0' : '1');
    }],
    ['74151', '8-to-1 multiplexer', ['D3', 'D2', 'D1', 'D0', 'Y', 'W', 'Gn', 'GND', 'C', 'B', 'A', 'D7', 'D6', 'D5', 'D4', 'VCC'], 'Y W', (g, o) => {
      const s = g('Gn'), a = num(g, ['A', 'B', 'C']);
      const y = s === '1' ? '0' : s === 'x' || a < 0 ? 'x' : g('D' + a);
      o('Y', y); o('W', not(y));
    }],
    ['74153', 'Dual 4-to-1 multiplexer', ['1Gn', 'B', '1C3', '1C2', '1C1', '1C0', '1Y', 'GND', '2Y', '2C0', '2C1', '2C2', '2C3', 'A', '2Gn', 'VCC'], '1Y 2Y', (g, o) => {
      const a = num(g, ['A', 'B']);
      for (const i of [1, 2]) { const s = g(i + 'Gn'); o(i + 'Y', s === '1' ? '0' : s === 'x' || a < 0 ? 'x' : g(i + 'C' + a)); }
    }],
    ['74283', '4-bit binary full adder', ['S2', 'B2', 'A2', 'S1', 'A1', 'B1', 'C0', 'GND', 'C4', 'S4', 'B4', 'A4', 'S3', 'A3', 'B3', 'VCC'], 'S1 S2 S3 S4 C4', (g, o) => {
      const a = num(g, ['A1', 'A2', 'A3', 'A4']), b = num(g, ['B1', 'B2', 'B3', 'B4']), c = num(g, ['C0']);
      const r = a < 0 || b < 0 || c < 0 ? -1 : a + b + c;
      out4(o, r < 0 ? -1 : r & 15, ['S1', 'S2', 'S3', 'S4']);
      o('C4', r < 0 ? 'x' : r > 15 ? '1' : '0');
    }],
    ['7485', '4-bit magnitude comparator', ['B3', 'ILT', 'IEQ', 'IGT', 'OGT', 'OEQ', 'OLT', 'GND', 'B0', 'A0', 'B1', 'A1', 'A2', 'B2', 'A3', 'VCC'], 'OGT OEQ OLT', (g, o) => {
      const a = num(g, ['A0', 'A1', 'A2', 'A3']), b = num(g, ['B0', 'B1', 'B2', 'B3']);
      const out = (x, y, z) => { o('OGT', x); o('OEQ', y); o('OLT', z); };
      if (a < 0 || b < 0) return out('x', 'x', 'x');
      if (a > b) return out('1', '0', '0');
      if (a < b) return out('0', '0', '1');
      const ig = g('IGT'), ie = g('IEQ'), il = g('ILT');
      if (ie === '1') return out('0', '1', '0');
      if (ig === 'x' || ie === 'x' || il === 'x') return out('x', 'x', 'x');
      return out(il === '1' ? '0' : '1', '0', ig === '1' ? '0' : '1');
    }],
    ['7447', 'BCD to 7-segment decoder/driver (active low)', ['B', 'C', 'LTn', 'BIRBOn', 'RBIn', 'D', 'A', 'GND', 'e', 'd', 'c', 'b', 'a', 'g', 'f', 'VCC'], 'a b c d e f g', (g, o) => {
      const lt = g('LTn'), bi = g('BIRBOn'), v = num(g, ['A', 'B', 'C', 'D']);
      const segs = bi === '0' ? 0 : lt === '0' ? 0x7F : v < 0 || lt === 'x' ? -1 : SEG[v];
      // open-collector outputs: a lit segment pulls low, an unlit one lets go (Z)
      'abcdefg'.split('').forEach((s, i) => o(s, segs < 0 ? 'x' : (segs >> i) & 1 ? '0' : 'z'));
    }],
    ['74194', '4-bit universal shift register', ['CLRn', 'SR', 'A', 'B', 'C', 'D', 'SL', 'GND', 'S0', 'S1', 'CLK', 'QD', 'QC', 'QB', 'QA', 'VCC'], 'QA QB QC QD', (g, o, st) => {
      const e = edge(st, g, 'CLK');
      const Q = ['QA', 'QB', 'QC', 'QD'];
      if (st.q == null) st.q = -1;
      if (g('CLRn') === '0') st.q = 0;
      else if (e) {
        const m = num(g, ['S0', 'S1']), bit = (n) => (g(n) === '1' ? 1 : g(n) === '0' ? 0 : -1);
        if (m < 0) st.q = -1;
        else if (m === 3) st.q = num(g, ['A', 'B', 'C', 'D']);
        else if (m === 1) { const b = bit('SR'); st.q = st.q < 0 || b < 0 ? -1 : ((st.q << 1) | b) & 15; }
        else if (m === 2) { const b = bit('SL'); st.q = st.q < 0 || b < 0 ? -1 : (st.q >> 1) | (b << 3); }
      }
      out4(o, st.q, Q);
    }],
  ];
  // the two synchronous counters: CLR′ asynchronous on the 74161, synchronous on the 74163
  const counter = (sync) => (g, o, st) => {
    const e = edge(st, g, 'CLK');
    if (st.q == null) st.q = -1;
    if (!sync && g('CLRn') === '0') st.q = 0;
    else if (e) {
      if (sync && g('CLRn') === '0') st.q = 0;
      else if (g('LOADn') === '0') st.q = num(g, ['A', 'B', 'C', 'D']);
      else if (g('LOADn') === 'x') st.q = -1;
      else { const ep = g('ENP'), et = g('ENT'); if (ep === '1' && et === '1') st.q = st.q < 0 ? -1 : (st.q + 1) & 15; else if (ep === 'x' || et === 'x') st.q = -1; }
    }
    out4(o, st.q, ['QA', 'QB', 'QC', 'QD']);
    const et = g('ENT');
    o('RCO', et === '0' ? '0' : st.q < 0 ? 'x' : st.q !== 15 ? '0' : et === '1' ? '1' : 'x');
  };
  const CTR = ['CLRn', 'CLK', 'A', 'B', 'C', 'D', 'ENP', 'GND', 'LOADn', 'ENT', 'QD', 'QC', 'QB', 'QA', 'RCO', 'VCC'];
  list.push(['74161', '4-bit counter, asynchronous clear', CTR, 'QA QB QC QD RCO', counter(false)]);
  list.push(['74163', '4-bit counter, synchronous clear', CTR, 'QA QB QC QD RCO', counter(true)]);

  L.byNum = new Map();
  for (const [n, title, names, outs, fn] of list) {
    const o = new Set(outs.split(' '));
    L.byNum.set(n, { num: n, title, dip: names.length, fn, pins: names.map((name, i) => ({ num: i + 1, name, dir: name === 'VCC' || name === 'GND' ? 'power' : o.has(name) ? 'out' : 'in' })) });
  }
  L.order = ['7400', '7402', '7404', '7408', '7432', '7486', '7474', '7476', '74138', '74151', '74153', '74161', '74163', '74194', '74283', '7447', '7485'];
  L.get = (n) => L.byNum.get(String(n));
  /** a pin's name as people say it: 1CLRn is 1CLR′ */
  L.pretty = (name) => name.replace(/n$/, '′');
  L.SEG = SEG;
})(globalThis.Sirkit = globalThis.Sirkit || {});
