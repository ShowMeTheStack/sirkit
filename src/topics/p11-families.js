// Part 11, the families: a short history from resistor-transistor and diode-transistor logic to CMOS, TTL output
// stages as switches (the totem pole, open collector outputs wired into an AND with a pull-up, tristate outputs
// on a bus), ECL steering a constant current, and what happens when one family drives another.
(function (S) {
  'use strict';
  const C = () => S.Cmos, K = () => S.Kit;
  const P11 = (S.P11 = S.P11 || {});
  const Geo = () => S.geom;
  const r2 = (v) => Math.round(v * 100) / 100;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const V = (v) => (r3(v) < 0 ? '−' : '') + Math.abs(r3(v)) + ' V';

  S.family({ id: 'p11-families', part: 'ics', order: 20, title: 'Families and output stages', blurb: 'From RTL and DTL to TTL, ECL and CMOS; totem-pole, open-collector and tristate outputs; and connecting one family to another.' });

  // ---- a vertical chain of switches and resistors between a supply and ground -------------------------------
  const SIZE = { R: [86, 34], S: [66, 38], D: [50, 30], I: [80, 38] };
  /**
   * o: {x (the axis), y (top), prefix, top: [el], bottom: [[el]..] (parallel branches), vcc, gnd, stub (length of
   * the output wire to the right, or 0), out: {label, cls}, wires: {vcc, top, out, bot} classes}
   * el: {t: 'R'|'S'|'D'|'I', label, state ('on'|'off'|'path'|'short'), gate (label on the left)}
   */
  P11.chain = function (o) {
    const P = o.prefix || 'ch', X = o.x, items = [], W = o.wires || {};
    let y = o.y;
    const seg = (k, x1, y1, x2, y2, cls) => items.push({ key: P + ':w' + k, kind: 'line', x1, y1, x2, y2, cls: 'cw ' + (cls || '') });
    const el = (k, e, x, yy) => {
      const [w, h] = SIZE[e.t];
      items.push({ key: P + ':e' + k, kind: 'cell', x: x - w / 2, y: yy, w, h, rx: e.t === 'S' ? 4 : e.t === 'D' ? 15 : 2, text: e.label, size: 16, cls: (e.t === 'S' ? 'sw ' : 'res ') + (e.state || '') });
      if (e.gate) items.push({ key: P + ':g' + k, kind: 'text', x: x - w / 2 - 8, y: yy + h / 2 + 5, text: e.gate, anchor: 'end', cls: 'cm-gate ' + (e.gateCls || ''), size: 16 });
      return yy + h;
    };
    let k = 0;
    if (o.vcc) {
      items.push({ key: P + ':vcc', kind: 'line', x1: X - 18, y1: y, x2: X + 18, y2: y, cls: 'cw ' + (W.vcc || '') });
      items.push({ key: P + ':vccl', kind: 'text', x: X, y: y - 9, text: o.vcc, anchor: 'middle', cls: 'cm-rail', size: 15 });
    }
    (o.top || []).forEach((e, i) => { const y2 = y + 14; seg('t' + i, X, y, X, y2, i ? W.top : W.vcc); y = el('t' + i, e, X, y2); k++; });
    const yOut = (o.top || []).length || o.vcc ? y + 16 : y;
    if (yOut > y) seg('to', X, y, X, yOut, W.out);
    const outPt = { x: X, y: yOut };
    if (o.stub) {
      seg('st', X, yOut, X + o.stub, yOut, W.out);
      if (o.out && o.out.label) items.push({ key: P + ':ol', kind: 'text', x: X + o.stub + 6, y: yOut + 5, text: o.out.label, anchor: 'start', cls: 'cm-out ' + (o.out.cls || ''), size: 16 });
    }
    const br = o.bottom || [];
    let yEnd = yOut;
    if (br.length) {
      const gap = 110, multi = br.length > 1, yr = yOut + (multi ? 16 : 0);
      if (multi) { seg('rt', X, yOut, X, yr, W.out); seg('rr', X, yr, X + gap * (br.length - 1), yr, W.out); }
      let lowest = 0;
      br.forEach((chain, b) => {
        const bx = X + b * gap;
        let yy = yr;
        chain.forEach((e, i) => { const y2 = yy + 14; seg('b' + b + i, bx, yy, bx, y2, i ? W.bot : W.out); yy = el('b' + b + '_' + i, e, bx, y2); });
        lowest = Math.max(lowest, yy);
        br[b].yEnd = yy;
      });
      const yg = lowest + 16;
      br.forEach((chain, b) => seg('bg' + b, X + b * gap, chain.yEnd, X + b * gap, yg, W.gnd));
      items.push({ key: P + ':gnd', kind: 'line', x1: X - 18, y1: yg, x2: X + 18 + (multi ? gap * (br.length - 1) : 0), y2: yg, cls: 'cw ' + (W.gnd || '') });
      items.push({ key: P + ':gndl', kind: 'text', x: X, y: yg + 18, text: o.gnd || 'GND', anchor: 'middle', cls: 'cm-rail', size: 15 });
      yEnd = yg + 20;
    }
    return { items, outPt, yEnd, box: { x: X - 100, y: o.y - 20, w: 100 + (o.stub || 0) + 60 + 110 * Math.max(0, br.length - 1), h: yEnd - o.y + 20 } };
  };
  const vcls = (v) => (v === 1 ? 'v1' : v === 0 ? 'v0' : v === 'Z' ? 'vz' : 'vx');

  // ---------------------------------------------------------------------------------------------------------
  // A short history: RTL, DTL, TTL, ECL, CMOS
  // ---------------------------------------------------------------------------------------------------------
  const eras = [
    { k: 'RTL', name: 'Resistor-transistor logic', when: 'early 1960s', how: 'inputs drive transistor bases through resistors; transistors in parallel to ground make a NOR' },
    { k: 'DTL', name: 'Diode-transistor logic', when: '1960s', how: 'diodes form an AND at a node, and a transistor inverts it: a NAND' },
    { k: 'TTL', name: 'Transistor-transistor logic', when: 'mid 1960s on', how: 'a multi-emitter transistor replaces the diodes, and an active totem-pole output drives both levels' },
    { k: 'ECL', name: 'Emitter-coupled logic', when: '1960s on', how: 'a current is steered, never saturating a transistor: the fastest bipolar family' },
    { k: 'CMOS', name: 'Complementary MOS', when: 'late 1960s on', how: 'complementary switches: almost no power at rest; now nearly everything' },
  ];
  S.topic({
    id: 'ic-history', family: 'p11-families', order: 10, title: 'From RTL and DTL to CMOS',
    blurb: 'The early families, as switches: RTL builds a NOR from transistors in parallel with a resistor pull-up, DTL an AND of diodes followed by an inverter. Their weaknesses, slow edges and poor fan-out, led to TTL, ECL and CMOS.',
    inputs: [{ id: 'ab', kind: 'text', label: 'Inputs AB to try', def: '00 10 11', check: (v) => (/^([01]{2}\s*)+$/.test(String(v).trim() + ' ') && String(v).trim().split(/\s+/).length <= 4 ? null : 'Inputs: up to four pairs of bits, like 00 10 11') }],
    presets: [{ label: 'Three input pairs', values: { ab: '00 10 11' } }, { label: 'Every pair', values: { ab: '00 01 10 11' } }],
    run(inp) {
      const pairs = String(inp.ab).trim().split(/\s+/).map((p) => [+p[0], +p[1]]);
      const F = new S.Frames();
      const line = (i, hot) => {
        const items = [];
        eras.forEach((e, j) => {
          const w = 132;
          items.push({ key: 'era' + j, kind: 'cell', x: j * (w + 26), y: 0, w, h: 52, rx: 10, lines: [e.k, e.when], size: 13, cls: 'blk' + (j === hot ? ' hot' : j < hot ? ' done' : '') });
          if (j) items.push({ key: 'ea' + j, kind: 'edge', from: 'era' + (j - 1), to: 'era' + j, cls: 'flow-arrow' });
        });
        void i;
        return items;
      };
      F.add({ items: line(0, -1), say: 'Five families in rough order of arrival: ' + eras.map((e) => e.k + ' (' + e.name + ')').join(', ') + '.' });
      // RTL: a NOR of two transistors in parallel with a resistor pull-up
      const rtl = (a, b) => {
        const y = a || b ? 0 : 1;
        return P11.chain({ x: 120, y: 110, prefix: 'rtl', vcc: 'VCC', top: [{ t: 'R', label: '640 Ω', state: y ? 'path' : '' }], bottom: [[{ t: 'S', label: 'Q1', gate: 'A=' + a, state: a ? 'path' : 'off' }], [{ t: 'S', label: 'Q2', gate: 'B=' + b, state: b ? (a ? 'on' : 'path') : 'off' }]], stub: 200, out: { label: 'Y = ' + y, cls: vcls(y) }, wires: { vcc: 'v1', out: vcls(y), gnd: 'v0' } }).items;
      };
      pairs.forEach(([a, b], i) => F.add({ items: line(0, 0).concat(rtl(a, b)), say: 'RTL NOR, A = ' + a + ', B = ' + b + ': ' + (a || b ? (a && b ? 'both transistors' : 'Q' + (a ? 1 : 2)) + ' saturate' + (a && b ? '' : 's') + ' and pull' + (a && b ? '' : 's') + ' Y to about 0.2 V: Y = 0.' : 'neither transistor conducts, so the resistor pulls Y up to VCC: Y = 1.') + (i === 0 ? ' Every input current flows through a base resistor, and a saturated transistor is slow to turn off; fan-out was a handful.' : ''), meta: i === 0 && pairs[1] ? { ask: true, y: String(pairs[1][0] || pairs[1][1] ? 0 : 1) } : null }));
      // DTL: a diode AND into an inverter
      const dtl = (a, b) => {
        const p = a && b ? 1 : 0, y = 1 - p, items = [];
        const dx = 0, py = 200;
        [['A', a, 150], ['B', b, 250]].forEach(([n, v, yy]) => {
          items.push({ key: 'dtl:in' + n, kind: 'cell', x: dx, y: yy - 16, w: 58, h: 32, rx: 6, text: n + ' = ' + v, size: 13, cls: 'in-badge ' + vcls(v) });
          items.push({ key: 'dtl:wi' + n, kind: 'line', x1: dx + 58, y1: yy, x2: dx + 90, y2: yy, cls: 'cw ' + vcls(v) });
          items.push({ key: 'dtl:d' + n, kind: 'cell', x: dx + 90, y: yy - 14, w: 44, h: 28, rx: 14, text: 'D' + (n === 'A' ? 1 : 2), size: 12, cls: 'res' + (!v ? ' path' : '') });
          items.push({ key: 'dtl:wd' + n, kind: 'line', x1: dx + 134, y1: yy, x2: dx + 170, y2: yy, cls: 'cw ' + vcls(p) });
        });
        items.push({ key: 'dtl:node', kind: 'line', x1: dx + 170, y1: 150, x2: dx + 170, y2: 250, cls: 'cw ' + vcls(p) });
        items.push({ key: 'dtl:pr', kind: 'line', x1: dx + 170, y1: py, x2: dx + 230, y2: py, cls: 'cw ' + vcls(p) });
        items.push({ key: 'dtl:pl', kind: 'text', x: dx + 178, y: py - 8, text: 'P = ' + p, anchor: 'start', cls: 'cm-out ' + vcls(p), size: 13 });
        items.push(...P11.chain({ x: dx + 320, y: 110, prefix: 'dtl', vcc: 'VCC', top: [{ t: 'R', label: '2 kΩ', state: y ? 'path' : '' }], bottom: [[{ t: 'S', label: 'Q', gate: 'P', gateCls: vcls(p), state: p ? 'path' : 'off' }]], stub: 90, out: { label: 'Y = ' + y, cls: vcls(y) }, wires: { vcc: 'v1', out: vcls(y), gnd: 'v0' } }).items);
        return items;
      };
      const [a1, b1] = pairs[pairs.length - 1];
      F.add({ items: line(1, 1).concat(dtl(0, 1)), say: 'DTL NAND, A = 0, B = 1: the input at 0 pulls node P low through its diode D1, so P = 0, the transistor Q is off and the resistor pulls Y up: Y = 1. The diodes make an AND; Q inverts it.' });
      F.add({ items: line(1, 1).concat(dtl(a1, b1)), say: 'A = ' + a1 + ', B = ' + b1 + ': ' + (a1 && b1 ? 'no input pulls P down, so P = 1, Q saturates and Y = 0.' : 'an input at 0 holds P low: P = 0 and Y = 1.') + ' DTL was better than RTL at fan-out, but its output is still a resistor pulling up, so rising edges are slow.' });
      const fams = ['TTL', 'ECL', 'HC'].map((k) => C().family(k));
      F.add({ items: line(2, 2).concat([P11.figure(fams[0], 0, 110)]), say: 'TTL replaced the input diodes with one multi-emitter transistor, faster to turn off, and the resistor pull-up with an active totem-pole output: ' + fams[0].say });
      F.add({ items: line(3, 3).concat([P11.figure(fams[1], 0, 110)]), say: 'ECL never lets a transistor saturate; it steers a constant current from one side of a pair to the other. Fast, but power-hungry and with small swings: ' + fams[1].say });
      const tb = K().table.draw({ x: 0, y: 110, prefix: 'cmp', colHead: ['family', 'tpd (ns)', 'power (mW)', 'NMH (V)', 'NML (V)'], rows: C().families().filter((f) => ['TTL', 'LSTTL', 'ECL', 'CMOS4000', 'HC'].includes(f.key)).map((f) => [f.key, String(f.tpd), String(f.power), String(f.NMH), String(f.NML)]), size: 14, mono: true, minH: 34, ch: 34 });
      F.add({ items: line(4, 4).concat(tb.items), say: 'CMOS switches nMOS and pMOS transistors in complementary pairs: almost no power at rest, outputs from rail to rail, wide noise margins. Early CMOS was slow; high-speed CMOS matched TTL\'s speed, and CMOS took over.', mark: 'end' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'table', title: 'The families', colHead: ['', 'how it works'], rows: eras.map((e) => [e.k, e.how]) }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['0', '1'], ask: 'Next input pair. What will the RTL NOR give?', answer: (fr, i) => fr[i].meta.y, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'An RTL gate with two transistors in parallel from the output to ground and a resistor to VCC computes…', options: ['AND', 'OR', 'NOR', 'NAND'], answer: 2, why: 'Any input at 1 turns on a transistor and pulls the output low.' },
      { q: 'In DTL, the diodes at the inputs form…', options: ['an OR', 'an AND at the node they share', 'an inverter', 'a latch'], answer: 1, why: 'Any input at 0 pulls the node low through its diode.' },
      { q: 'What did TTL\'s totem-pole output improve over RTL and DTL?', options: ['noise margins only', 'it drives the output high actively, so rising edges are fast', 'it uses no power', 'nothing'], answer: 1, why: 'A resistor pull-up charges the load slowly; a transistor does it quickly.' },
      { q: 'ECL is fast mainly because…', options: ['it uses CMOS', 'its transistors never saturate', 'it has large noise margins', 'it uses diodes'], answer: 1, why: 'A saturated transistor takes time to come out of saturation.' },
    ],
  });
  /** a family's figures in a box */
  P11.figure = (f, x, y) => ({ key: 'fig:' + f.key, kind: 'cell', x, y, w: 470, h: 100, rx: 10, lines: [f.name, 'tpd ' + f.tpd + ' ns, ' + f.power + ' mW per gate', 'NMH ' + V(f.NMH) + ', NML ' + V(f.NML) + ', fan-out ' + f.fanout], size: 14, cls: 'blk' });

  // ---------------------------------------------------------------------------------------------------------
  // TTL outputs: totem pole, open collector, tristate
  // ---------------------------------------------------------------------------------------------------------
  const modes = {
    totem: 'Totem-pole output',
    fight: 'Two totem-pole outputs tied together',
    oc: 'Open-collector outputs: a wired AND',
    tri: 'Tristate outputs on a bus',
  };
  S.topic({
    id: 'ic-ttl-out', family: 'p11-families', order: 20, title: 'TTL outputs: totem pole, open collector, tristate',
    blurb: 'A totem-pole output has a transistor to pull up and one to pull down, never both on. Tie two together and they can fight. Leave out the upper one (open collector), add one shared resistor, and the outputs make an AND for free. Or let both turn off (tristate) and share a bus.',
    inputs: [{ id: 'mode', kind: 'choice', label: 'Output', def: 'totem', options: Object.entries(modes).map(([value, label]) => ({ value, label })) }],
    presets: Object.entries(modes).map(([value, label]) => ({ label, values: { mode: value } })),
    run(inp) {
      const F = new S.Frames();
      const totem = (k, x, y, a, enabled, both, stub) => {
        // output stage of an inverter: Q4 on when the output is 1 (input 0), Q3 on when it is 0
        const out = enabled === false ? 'Z' : 1 - a;
        const q4 = enabled === false ? 'off' : both ? 'short' : out === 1 ? 'path' : 'off', q3 = enabled === false ? 'off' : both ? 'short' : out === 0 ? 'path' : 'off';
        return P11.chain({ x, y, prefix: 'g' + k, vcc: 'VCC', top: [{ t: 'R', label: '130 Ω' }, { t: 'S', label: 'Q4', state: q4 }, { t: 'D', label: 'D' }], bottom: [[{ t: 'S', label: 'Q3', state: q3 }]], stub, out: { label: '' }, wires: { vcc: 'v1', top: q4 === 'off' ? '' : 'v1', out: vcls(out), gnd: 'v0' } });
      };
      const badge = (key, x, y, t, cls) => ({ key, kind: 'cell', x, y, w: Geo().textWidth(t, 16, { mono: true }) + 20, h: 32, rx: 8, text: t, size: 16, cls: 'in-badge ' + (cls || '') });
      if (inp.mode === 'totem') {
        const at = (a, both) => { const g = totem(0, 190, 30, a, true, both, 140); return g.items.concat([badge('in', 0, 0, both ? 'switching' : 'A = ' + a, both ? '' : vcls(a)), { key: 'yl', kind: 'text', x: g.outPt.x + 146, y: g.outPt.y + 5, text: 'Y = ' + (both ? 'changing' : 1 - a), anchor: 'start', cls: 'cm-out ' + (both ? '' : vcls(1 - a)), size: 15 }]); };
        F.add({ items: at(0), say: 'An inverter\'s totem-pole output, A = 0: Q4 conducts and Q3 is off. Current flows from VCC through the 130 Ω resistor, Q4 and the diode into the load: Y = 1, about ' + V(C().family('TTL').VOH) + ' or more.', meta: { ask: true, ans: '0' } });
        F.add({ items: at(1), say: 'A = 1: Q3 conducts and Q4 is off. Q3 sinks the current of every input it drives to ground: Y = 0, at most ' + V(C().family('TTL').VOL) + '. The diode keeps Q4 firmly off while Q3 is on.' });
        F.add({ items: at(0, true), say: 'While the output switches, both transistors conduct for a few nanoseconds. The 130 Ω resistor limits that current spike to about 30 mA, and the spikes are why TTL boards need decoupling capacitors.' });
        F.add({ items: at(1), say: 'Two active transistors: the output is driven hard both ways, so edges are fast in both directions, unlike a resistor pull-up.', mark: 'end' });
      } else if (inp.mode === 'fight') {
        const pic = (a1, a2) => {
          const g1 = totem(1, 250, 30, a1, true, false, 160), g2 = totem(2, 250, 330, a2, true, false, 160);
          const bx = 410, y1 = g1.outPt.y, y2 = g2.outPt.y, v = a1 === a2 ? 1 - a1 : 'X';
          const items = g1.items.concat(g2.items);
          items.push({ key: 'bus', kind: 'line', x1: bx, y1, x2: bx, y2, cls: 'cw ' + vcls(v) });
          items.push({ key: 'bst', kind: 'line', x1: bx, y1: (y1 + y2) / 2, x2: bx + 60, y2: (y1 + y2) / 2, cls: 'cw ' + vcls(v) });
          items.push({ key: 'yl', kind: 'text', x: bx + 66, y: (y1 + y2) / 2 + 5, text: 'Y = ' + (v === 'X' ? '?' : v), anchor: 'start', cls: 'cm-out ' + vcls(v), size: 15 });
          items.push(badge('in1', 0, y1 - 15, 'gate 1: A = ' + a1, vcls(a1)), badge('in2', 0, y2 - 15, 'gate 2: A = ' + a2, vcls(a2)));
          return items;
        };
        F.add({ items: pic(0, 0), say: 'Two totem-pole outputs wired together, both driving 1: Q4 of each conducts, they agree, and nothing is wrong yet. Next, gate 2 switches to 0.', meta: { ask: true, ans: 'a fight (X)' } });
        F.add({ items: pic(0, 1), say: 'Now gate 1 drives 1 and gate 2 drives 0. There is a path from VCC through gate 1\'s resistor, Q4 and diode, along the wire, and through gate 2\'s Q3 to ground: about (5 − 0.2 − 0.7 − 0.2) V / 130 Ω = 30 mA, with Y stuck somewhere in between. Held like this, one of the gates may be damaged.' });
        F.add({ items: pic(0, 1), say: 'So totem-pole outputs must never be tied together. To share a wire, use open-collector or tristate outputs.', mark: 'end' });
      } else if (inp.mode === 'oc') {
        const sets = [[1, 1, 1], [1, 0, 1], [0, 0, 1], [1, 1, 1]];
        const pic = (vals) => {
          const y = vals.every((v) => v === 1) ? 1 : 0, items = [];
          const bx = 280;
          const outs = vals.map((v, k) => {
            const g = P11.chain({ x: 120, y: 120 + k * 150, prefix: 'oc' + k, top: [], bottom: [[{ t: 'S', label: 'Q' + (k + 1), state: v ? 'off' : 'path', gate: 'out ' + (k + 1) + ' = ' + v, gateCls: vcls(v) }]], stub: bx - 120, out: { label: '' }, wires: { out: vcls(y), gnd: 'v0' } });
            items.push(...g.items);
            return g.outPt.y;
          });
          const top = 50;
          items.push({ key: 'vcc', kind: 'line', x1: bx - 18, y1: top - 40, x2: bx + 18, y2: top - 40, cls: 'cw v1' });
          items.push({ key: 'vccl', kind: 'text', x: bx, y: top - 49, text: 'VCC', anchor: 'middle', cls: 'cm-rail', size: 15 });
          items.push({ key: 'rw1', kind: 'line', x1: bx, y1: top - 40, x2: bx, y2: top - 26, cls: 'cw v1' });
          items.push({ key: 'pr', kind: 'cell', x: bx - 43, y: top - 26, w: 86, h: 32, rx: 2, text: '1 kΩ', size: 16, cls: 'res' + (y ? '' : ' path') });
          items.push({ key: 'bus', kind: 'line', x1: bx, y1: top + 6, x2: bx, y2: outs[outs.length - 1], cls: 'cw ' + vcls(y) });
          items.push({ key: 'bst', kind: 'line', x1: bx, y1: outs[1], x2: bx + 70, y2: outs[1], cls: 'cw ' + vcls(y) });
          items.push({ key: 'yl', kind: 'text', x: bx + 76, y: outs[1] + 5, text: 'Y = ' + y, anchor: 'start', cls: 'cm-out ' + vcls(y), size: 15 });
          return items;
        };
        sets.slice(0, 3).forEach((vals, i) => F.add({ items: pic(vals), say: 'Outputs ' + vals.join(', ') + ': ' + (vals.every((v) => v) ? 'every output transistor is off, so only the shared resistor acts: it pulls the wire up, Y = 1.' : 'output ' + vals.map((v, k) => (v ? null : k + 1)).filter(Boolean).join(' and ') + ' pull' + (vals.filter((v) => !v).length > 1 ? '' : 's') + ' the wire to ground, Y = 0. Pulling low is all an open-collector output can do, so there is never a fight.'), meta: i === 0 ? { ask: true, ans: '0' } : null }));
        F.add({ items: pic([1, 1, 1]), say: 'Y = out1 · out2 · out3: a wired AND, with no gate. The pull-up is chosen between two limits: small enough to pull the wire above VIH against the leakage of every output and input (here at most about 3 kΩ), large enough that one output can sink its current plus the loads\' (here at least about 0.4 kΩ). 1 kΩ sits between; the price is a slow rising edge as the resistor charges the wire.', mark: 'end' });
      } else {
        const states = [{ en: [1, 0, 0], a: [0, 1, 1] }, { en: [0, 1, 0], a: [0, 1, 1] }, { en: [0, 0, 0], a: [0, 1, 1] }, { en: [1, 1, 0], a: [1, 0, 1] }];
        const pic = (s) => {
          const items = [], bx = 430, ys = [];
          const drv = s.en.map((e, k) => (e ? 1 - s.a[k] : 'Z')).filter((v) => v !== 'Z');
          const v = !drv.length ? 'Z' : drv.every((q) => q === drv[0]) ? drv[0] : 'X';
          s.en.forEach((e, k) => {
            const out = e ? 1 - s.a[k] : 'Z';
            const g = P11.chain({ x: 250, y: 30 + k * 200, prefix: 'tr' + k, vcc: 'VCC', top: [{ t: 'S', label: 'Q4', state: !e ? 'off' : v === 'X' ? 'short' : out === 1 ? 'path' : 'off' }], bottom: [[{ t: 'S', label: 'Q3', state: !e ? 'off' : v === 'X' ? 'short' : out === 0 ? 'path' : 'off' }]], stub: bx - 250, out: { label: '' }, wires: { vcc: 'v1', out: vcls(v), gnd: 'v0' } });
            items.push(...g.items, badge('en' + k, 0, g.outPt.y - 15, 'EN' + (k + 1) + ' = ' + e + (e ? ', drives ' + out : ''), e ? vcls(out) : 'vz'));
            ys.push(g.outPt.y);
          });
          items.push({ key: 'bus', kind: 'line', x1: bx, y1: ys[0], x2: bx, y2: ys[2], cls: 'cw ' + vcls(v) });
          items.push({ key: 'bst', kind: 'line', x1: bx, y1: ys[1], x2: bx + 70, y2: ys[1], cls: 'cw ' + vcls(v) });
          items.push({ key: 'yl', kind: 'text', x: bx + 76, y: ys[1] + 5, text: 'bus = ' + (v === 'X' ? 'X' : v), anchor: 'start', cls: 'cm-out ' + vcls(v), size: 15 });
          return { items, v };
        };
        states.forEach((s, i) => {
          const p = pic(s);
          const say = p.v === 'Z' ? 'No output is enabled: both transistors of every stage are off, and the bus floats (Z). A pull-up or a bus keeper is used to hold it at a valid level.' : p.v === 'X' ? 'Two outputs enabled at once, driving different values: a totem-pole fight on the bus, Y = X. The control must enable one output at a time, and should leave a small gap when it hands over.' : 'Only output ' + (s.en.indexOf(1) + 1) + ' is enabled; it drives the bus to ' + p.v + ' while the others have both transistors off (Z) and simply let go.';
          F.add({ items: p.items, say, meta: i === 1 ? { ask: true, ans: 'Z (floating)' } : i === 2 ? { ask: true, ans: 'a fight (X)' } : null, mark: i === states.length - 1 ? 'end' : undefined });
        });
      }
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Output stages', text: ['totem pole: active pull-up and pull-down', '  never tie two together', 'open collector: pull-down only', '  shared pull-up: a wired AND', 'tristate: 0, 1 or off (Z)', '  one enabled at a time on a bus'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['0', '1', 'Z (floating)', 'a fight (X)'], ask: 'What will the output wire be in the next step?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'Why must two totem-pole outputs never be wired together?', options: ['they would form an AND', 'if they drive different values, current flows from VCC through one to ground through the other', 'they are too slow', 'it is allowed'], answer: 1, why: 'A short through the two output transistors, with the wire stuck between levels.' },
      { q: 'Several open-collector outputs on one wire with a pull-up compute…', options: ['the OR', 'the AND', 'the XOR', 'nothing useful'], answer: 1, why: 'Any output at 0 pulls the wire low: a wired AND.' },
      { q: 'A tristate output that is not enabled…', options: ['drives 0', 'drives 1', 'turns both transistors off and lets go of the wire', 'shorts'], answer: 2, why: 'It is in its third, high-impedance state.' },
      { q: 'The price of an open-collector wired AND is…', options: ['a slow rising edge, set by the pull-up resistor charging the wire', 'higher noise margins', 'more gates', 'no price'], answer: 0, why: 'Only the resistor pulls the wire up.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // ECL: a current steered
  // ---------------------------------------------------------------------------------------------------------
  S.topic({
    id: 'ic-ecl', family: 'p11-families', order: 30, title: 'ECL: steering a current',
    blurb: 'A constant current flows down through one side of a transistor pair or the other, decided by whether an input is above or below a reference voltage. No transistor ever saturates, so ECL is fast; the current never stops, so it is power-hungry. One gate gives OR and NOR at once.',
    inputs: [{ id: 'ab', kind: 'text', label: 'Inputs AB to try', def: '00 10 01 11', check: (v) => (/^([01]{2}\s*)+$/.test(String(v).trim() + ' ') && String(v).trim().split(/\s+/).length <= 4 ? null : 'Inputs: up to four pairs of bits, like 00 10') }],
    presets: [{ label: 'Every input pair', values: { ab: '00 10 01 11' } }, { label: 'Just 00 and 11', values: { ab: '00 11' } }],
    run(inp) {
      const pairs = String(inp.ab).trim().split(/\s+/).map((p) => [+p[0], +p[1]]);
      const e = C().family('ECL'), hiV = -0.9, loV = -1.75, vbb = -1.29;
      const xa = 80, xb = 190, xr = 360, top = 30, yC = 120, yE = 220;
      const pic = (a, b) => {
        const left = a || b, items = [];
        const nor = left ? 0 : 1, or = 1 - nor;
        const w = (k, x1, y1, x2, y2, cls) => items.push({ key: 'w' + k, kind: 'line', x1, y1, x2, y2, cls: 'cw ' + (cls || '') });
        items.push({ key: 'gnd', kind: 'line', x1: xa - 20, y1: top, x2: xr + 20, y2: top, cls: 'cw v1' });
        items.push({ key: 'gndl', kind: 'text', x: (xa + xr) / 2, y: top - 10, text: 'VCC = 0 V', anchor: 'middle', cls: 'cm-rail', size: 12 });
        for (const [k, x, on] of [['1', xa, left], ['2', xr, !left]]) {
          w('r' + k, x, top, x, top + 14, 'v1');
          items.push({ key: 'R' + k, kind: 'cell', x: x - 37, y: top + 14, w: 74, h: 32, rx: 2, text: k === '1' ? 'R1' : 'R2', size: 12, cls: 'res' + (on ? ' path' : '') });
          w('rc' + k, x, top + 46, x, yC, k === '1' ? vcls(nor) : vcls(or));
        }
        w('cl', xa, yC, xb, yC, vcls(nor));
        const q = (k, x, gate, on, gcls) => {
          w('qa' + k, x, yC, x, yC + 22, k === 'R' ? vcls(or) : vcls(nor));
          items.push({ key: 'Q' + k, kind: 'cell', x: x - 29, y: yC + 22, w: 58, h: 38, rx: 4, text: 'Q' + k, size: 12, cls: 'sw ' + (on ? 'path' : 'off') });
          items.push({ key: 'Qg' + k, kind: 'text', x: x - 37, y: yC + 46, text: gate, anchor: 'end', cls: 'cm-gate ' + gcls, size: 13 });
          w('qe' + k, x, yC + 60, x, yE, '');
        };
        q('A', xa, 'A', !!a, vcls(a)); q('B', xb, 'B', !!b, vcls(b)); q('R', xr, 'VBB', !left, '');
        w('er', xa, yE, xr, yE, '');
        const xm = (xb + xr) / 2;
        w('ei', xm, yE, xm, yE + 20, '');
        items.push({ key: 'I', kind: 'cell', x: xm - 35, y: yE + 20, w: 70, h: 38, rx: 19, text: '4 mA', size: 12, cls: 'res path' });
        w('iv', xm, yE + 58, xm, yE + 80, 'v0');
        items.push({ key: 'vee', kind: 'line', x1: xm - 18, y1: yE + 80, x2: xm + 18, y2: yE + 80, cls: 'cw v0' });
        items.push({ key: 'veel', kind: 'text', x: xm, y: yE + 98, text: 'VEE = −5.2 V', anchor: 'middle', cls: 'cm-rail', size: 12 });
        // outputs
        w('on', xa, yC, xa - 70, yC, vcls(nor));
        items.push({ key: 'onl', kind: 'text', x: xa - 76, y: yC + 5, text: 'NOR = ' + nor, anchor: 'end', cls: 'cm-out ' + vcls(nor), size: 15 });
        w('oo', xr, yC, xr + 70, yC, vcls(or));
        items.push({ key: 'ool', kind: 'text', x: xr + 76, y: yC + 5, text: 'OR = ' + or, anchor: 'start', cls: 'cm-out ' + vcls(or), size: 15 });
        // the current, on the side that carries it
        items.push({ key: 'cur', kind: 'token', x: left ? xa : xr, y: top + 70, r: 7, text: '', cls: 'current', audit: 'overlap-ok' });
        return items;
      };
      const F = new S.Frames();
      F.add({ items: pic(0, 0), say: 'An ECL gate: inputs A and B on two transistors in parallel, a reference VBB = ' + V(vbb) + ' on the third, and a constant current source under the shared emitters. A logic 1 is about ' + V(hiV) + ', a 0 about ' + V(loV) + '.' });
      pairs.forEach(([a, b], i) => {
        const left = a || b;
        const nx = pairs[i + 1];
        F.add({ items: pic(a, b), say: 'A = ' + a + ' (' + V(a ? hiV : loV) + '), B = ' + b + ' (' + V(b ? hiV : loV) + '): ' + (left ? 'an input is above VBB, so the current flows through R1, by way of ' + (a && b ? 'QA and QB together' : a ? 'QA' : 'QB') + '. R1\'s drop pulls the left side low (NOR = 0) while R2, carrying nothing, leaves the right side high (OR = 1).' : 'both inputs are below VBB, so QR takes the whole current through R2: OR = 0, NOR = 1.') + ' The current only changes sides; its total never changes.', meta: nx ? { ask: true, ans: nx[0] || nx[1] ? 'through QA or QB (left)' : 'through QR (right)' } : null });
      });
      F.add({ items: pic(1, 0), say: 'No transistor saturates (the swing is only ' + V(hiV - loV) + '), so switching is quick: tpd about ' + e.tpd + ' ns. The constant current costs about ' + e.power + ' mW per gate whether it switches or not, and the small swing gives small noise margins (' + V(e.NMH) + ', ' + V(e.NML) + '). Real ECL gates add emitter followers to shift the outputs down to input levels.', mark: 'end' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'ECL', text: ['1 ≈ −0.9 V, 0 ≈ −1.75 V', 'VBB = −1.29 V in the middle', 'input above VBB: current left', '  → NOR = 0, OR = 1', 'both below: current right', '  → NOR = 1, OR = 0'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['through QA or QB (left)', 'through QR (right)'], ask: 'Next input pair. Which way will the current go?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'ECL is fast mainly because…', options: ['its transistors never saturate', 'it has large swings', 'it uses MOS transistors', 'it has no resistors'], answer: 0, why: 'Saturated transistors take time to turn off.' },
      { q: 'An ECL gate\'s power consumption…', options: ['is almost zero at rest', 'is high and roughly constant, since the current is always flowing', 'grows with frequency only', 'is negative'], answer: 1, why: 'The current source runs all the time.' },
      { q: 'The two outputs of the basic ECL gate are…', options: ['AND and NAND', 'OR and NOR', 'XOR and XNOR', 'two copies of the same'], answer: 1, why: 'One collector goes low when any input is high (NOR); the other goes high (OR).' },
      { q: 'Compared with TTL, ECL\'s noise margins are…', options: ['larger', 'smaller', 'the same', 'undefined'], answer: 1, why: 'Its voltage swing is under a volt.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Interfacing between families
  // ---------------------------------------------------------------------------------------------------------
  const ifaces = {
    'TTL>HC': { d: 'TTL', l: 'HC', fix: { name: 'TTL + 4.7 kΩ pull-up', VOH: 4.9 } },
    'TTL>HCT': { d: 'TTL', l: 'HCT' },
    'HC>TTL': { d: 'HC', l: 'TTL' },
    'LSTTL>TTL': { d: 'LSTTL', l: 'TTL' },
    'ECL>TTL': { d: 'ECL', l: 'TTL' },
  };
  S.topic({
    id: 'ic-interface', family: 'p11-families', order: 40, title: 'Interfacing between families',
    blurb: 'One family can drive another only if its output levels land inside the other\'s input promises, with margin, and its output can supply the currents. Put the two charts side by side and look.',
    inputs: [{ id: 'pair', kind: 'choice', label: 'Driver → load', def: 'TTL>HC', options: Object.entries(ifaces).map(([value, p]) => ({ value, label: p.d + ' driving ' + p.l })) }],
    presets: Object.entries(ifaces).map(([value, p]) => ({ label: p.d + ' → ' + p.l, values: { pair: value } })),
    run(inp) {
      const pr = ifaces[inp.pair], d = C().family(pr.d), l = C().family(pr.l), r = C().interface(pr.d, pr.l);
      const chart = (show, drv, dn) => P11.levels({ x: 0, y: 40, drv: drv || d, rcv: l, drvName: dn || pr.d, rcvName: pr.l, show }).items;
      const ecl = pr.d === 'ECL' || pr.l === 'ECL';
      // fan-out by current, the driver's output currents over the load's input currents
      const fanSay = () => {
        const lo = d.IOL / Math.abs(l.IIL), hi = Math.abs(d.IOH) / Math.abs(l.IIH), n = Math.floor(Math.min(lo, hi) + 1e-9);
        return 'The levels fit. Then the currents: IOL/|IIL| = ' + d.IOL + '/' + Math.abs(l.IIL) + ' = ' + r2(lo) + ' and |IOH|/IIH = ' + Math.abs(d.IOH) + '/' + Math.abs(l.IIH) + ' = ' + r2(hi) + ', so ' + n + ' loads by current' + (n > r.fanout ? '; a CMOS load is limited sooner by its capacitance, so about ' + r.fanout + ' in practice.' : '.');
      };
      const F = new S.Frames();
      F.add({ items: chart({ out: true, in: true }), say: d.name + ' driving ' + l.name + '. On the left what the driver promises (VOH ' + V(d.VOH) + ', VOL ' + V(d.VOL) + '); on the right what the load needs (VIH ' + V(l.VIH) + ', VIL ' + V(l.VIL) + ').', meta: { ask: true, ok: r.ok ? 'yes' : 'no' } });
      F.add({ items: chart({ out: true, in: true, nmh: true, nml: true }), say: 'High margin VOH − VIH = ' + V(r.highMargin) + ', low margin VIL − VOL = ' + V(r.lowMargin) + '. ' + (r.ok ? 'Both are positive: every guaranteed output level is read correctly.' : r.highMargin < 0 ? 'The high margin is negative (red): a guaranteed 1 from the driver may not reach the load\'s VIH.' : 'The low margin is negative: a 0 may be read wrongly.') });
      F.add({ items: chart({ out: true, in: true, nmh: true, nml: true }), say: ecl ? 'ECL and TTL do not even share a voltage range: ECL runs below ground, TTL above it. A level translator is needed between them.' : r.ok ? fanSay() : 'High margin ' + V(r.highMargin) + ', low margin ' + V(r.lowMargin) + '. ' + (r.highMargin < 0 ? 'The high output (' + V(d.VOH) + ') does not reach the input\'s VIH (' + V(l.VIH) + '): a pull-up resistor or a TTL-compatible input (HCT) is needed.' : 'The low output (' + V(d.VOL) + ') is above the input\'s VIL (' + V(l.VIL) + ').') });
      if (pr.fix) {
        const fx = Object.assign({}, d, { VOH: pr.fix.VOH });
        F.add({ items: chart({ out: true, in: true, nmh: true, nml: true }, fx, pr.fix.name), say: 'A cure: a pull-up resistor from the TTL output to 5 V. When the output is high its upper transistor lets go and the resistor lifts the line close to the supply, about ' + V(pr.fix.VOH) + ', above the HC input\'s VIH. The other cure: use an HCT load, CMOS built with TTL input thresholds.' });
      }
      F.add({ items: chart({ out: true, in: true, nmh: true, nml: true }, pr.fix ? Object.assign({}, d, { VOH: pr.fix.VOH }) : d, pr.fix ? pr.fix.name : pr.d), say: (r.ok ? 'This pair works directly.' : pr.fix ? 'With the pull-up (or an HCT part) the pair works.' : 'This pair needs a translator.') + ' The rule: compare levels first, then currents.', mark: 'end' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: pr.d + ' → ' + pr.l, text: ['VOH − VIH = ' + V(r.highMargin), 'VIL − VOL = ' + V(r.lowMargin), 'both ≥ 0: levels compatible', '', 'then: fan-out by current'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['yes', 'no'], ask: 'Can this driver feed this load directly, with both noise margins positive?', answer: (fr, i) => fr[i].meta.ok, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'Why can a standard TTL output not reliably drive a 74HC input at 5 V?', options: ['too much current', 'TTL\'s VOH (2.4 V) is below HC\'s VIH (3.5 V)', 'TTL is too fast', 'HC inputs are open collector'], answer: 1, why: 'A guaranteed TTL 1 may be read as indeterminate.' },
      { q: 'What is an HCT part?', options: ['a faster HC', 'CMOS with input thresholds set for TTL levels', 'a TTL gate with CMOS outputs', 'an ECL translator'], answer: 1, why: 'Its VIH is 2.0 V, so TTL outputs drive it directly.' },
      { q: 'Can an HC output drive standard TTL inputs?', options: ['no, never', 'yes, the levels fit; the number of loads is set by the current HC can sink', 'only with a translator', 'only with a pull-down'], answer: 1, why: 'HC swings nearly rail to rail; each TTL input sinks 1.6 mA into it when low.' },
      { q: 'Connecting ECL to TTL needs…', options: ['a pull-up', 'nothing', 'a level translator, since the two use different voltage ranges', 'an inverter'], answer: 2, why: 'ECL levels sit below 0 V.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
