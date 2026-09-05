// Part 9, register transfers: RTL statements run one clock each on a small datapath with a single bus and an
// accumulator, the parts of an ASM chart and its blocks (with the rules a chart must keep), and the timing of an
// ASM block: everything in a block reads the values from before the edge, and every register changes together
// on it.
(function (S) {
  'use strict';
  const K = S.Kit, P9 = S.P9, TM = K.timing, Geo = S.geom;
  const A = () => S.Asm;

  S.family({ id: 'p9-rtl', part: 'rtl', order: 10, title: 'Register transfers and ASM charts', blurb: 'Registers, the transfers between them on a bus, and the ASM chart that says which transfers happen in which clock.' });

  // ---------------------------------------------------------------------------------------------------
  // RTL on a bus datapath
  // ---------------------------------------------------------------------------------------------------
  const REGS = ['R0', 'R1', 'R2', 'R3'];
  const OPS = { '+': (a, b) => (a + b) & 255, '-': (a, b) => (a - b) & 255, '&': (a, b) => a & b, '|': (a, b) => a | b, '^': (a, b) => a ^ b };
  const OPNAME = { '+': 'adds it to A', '-': 'subtracts it from A', '&': 'ANDs it with A', '|': 'ORs it with A', '^': 'XORs it with A' };
  /** one statement: {dst, src (a register or a number), op (null: a copy)} or an error sentence */
  function parseStmt(t) {
    const s = t.replace(/<-/g, '←').replace(/\s+/g, ' ').trim();
    let m = /^(R[0-3]|A) ?← ?(R[0-3]|A|\d{1,3})$/.exec(s);
    if (m) { const v = /^\d/.test(m[2]) ? +m[2] : null; if (v !== null && v > 255) return '"' + s + '": a constant must fit in 8 bits (0 to 255)'; return { dst: m[1], src: v === null ? m[2] : null, value: v, op: null, text: s }; }
    m = /^A ?← ?A ?([-+&|^]) ?(R[0-3])$/.exec(s);
    if (m) return { dst: 'A', src: m[2], op: m[1], text: s };
    if (/←.*←/.test(s) || /,/.test(s)) return '"' + s + '": one transfer per line (one bus, one value per clock)';
    if (/^R[0-3] ?← ?R[0-3] ?[-+&|^] ?R[0-3]$/.test(s)) return '"' + s + '": the bus carries one register per clock and the ALU works on A and the bus; write it as A ← Rx, A ← A + Ry, Rz ← A';
    return '"' + s + '" is not a transfer this datapath can do (Rd ← Rs, Rd ← number, A ← A op Rs with op one of + − & | ^)';
  }
  const stmtsOf = (text) => String(text).split(/[;\n]+/).map((x) => x.trim()).filter(Boolean);
  S.topic({
    id: 'rtl-transfers', family: 'p9-rtl', order: 10, title: 'Register transfers on a bus',
    blurb: 'An RTL statement such as R1 ← R2 says what happens on one clock edge. On a single bus one register drives the bus and the destination loads it at the edge; arithmetic goes through the ALU into the accumulator A.',
    inputs: [{ id: 'prog', kind: 'program', label: 'Transfers, one per clock (; or new line between)', def: 'R0 ← 7; R1 ← 12; A ← R0; A ← A + R1; R2 ← A', check: (v) => { const st = stmtsOf(v); if (!st.length) return 'Write at least one transfer'; if (st.length > 10) return 'At most 10 transfers'; for (const t of st) { const p = parseStmt(t); if (typeof p === 'string') return p; } return null; } }],
    presets: [
      { label: 'Add two numbers', values: { prog: 'R0 ← 7; R1 ← 12; A ← R0; A ← A + R1; R2 ← A' } },
      { label: 'Swap R1 and R2 through A', values: { prog: 'R1 ← 5; R2 ← 9; A ← R1; R1 ← R2; R2 ← A' } },
      { label: 'Mask and flip', values: { prog: 'R0 ← 60; R1 ← 15; A ← R0; A ← A & R1; R2 ← A; A ← A ^ R0; R3 ← A' } },
      { label: 'Subtract twice', values: { prog: 'R0 ← 50; R1 ← 8; A ← R0; A ← A - R1; A ← A - R1; R3 ← A' } },
    ],
    counters: [{ id: 'clocks', label: 'clocks' }, { id: 'alu', label: 'ALU operations' }],
    run(inp) {
      const prog = stmtsOf(inp.prog).map(parseStmt);
      const regs = { R0: 0, R1: 0, R2: 0, R3: 0, A: 0 };
      const Fr = new S.Frames(['clocks', 'alu']);
      const RX = (i) => 110 + i * 120, RY = 70, RW = 92, BUS = 200, ALUX = 650, AY = 380;
      const b8 = (v) => v.toString(2).padStart(8, '0');
      const draw = (o) => {
        o = o || {};
        const items = [];
        const hotDrive = o.drive, hotLoad = o.load;
        // the data switches, the four registers, the bus
        items.push({ key: 'data', kind: 'cell', x: 0, y: RY, w: 76, h: 44, rx: 4, lines: ['DATA', o.value !== undefined && o.value !== null ? String(o.value) : '–'], cls: 'mono asm-reg' + (hotDrive === 'DATA' ? ' hot' : ''), size: 13 });
        items.push({ key: 'dl', kind: 'line', x1: 38, y1: RY + 44, x2: 38, y2: BUS, cls: 'dp-wire' + (hotDrive === 'DATA' ? ' hot' : ''), layer: 'lines' });
        REGS.forEach((r, i) => {
          const x = RX(i), cx = x + RW / 2;
          items.push({ key: 'rn:' + r, kind: 'text', x: cx, y: RY - 10, text: r, anchor: 'middle', cls: 'asm-regname', size: 14 });
          items.push({ key: 'r:' + r, kind: 'cell', x, y: RY, w: RW, h: 44, rx: 4, lines: [b8(regs[r]), '= ' + regs[r]], cls: 'mono asm-reg' + (o.changed === r ? ' changed' : '') + (hotLoad === r || hotDrive === r ? ' hot' : ''), size: 13, pulse: o.changed === r });
          items.push({ key: 'ro:' + r, kind: 'line', x1: cx - 20, y1: RY + 44, x2: cx - 20, y2: BUS, cls: 'dp-wire' + (hotDrive === r ? ' hot' : ''), layer: 'lines' });
          items.push({ key: 'ri:' + r, kind: 'edge', from: { x: cx + 20, y: BUS }, to: { x: cx + 20, y: RY + 44 }, cls: 'dp-arrow' + (hotLoad === r ? ' hot' : '') });
        });
        items.push({ key: 'bus', kind: 'line', x1: 30, y1: BUS, x2: ALUX + 10, y2: BUS, cls: 'dp-bus' + (hotDrive ? ' hot' : ''), layer: 'lines' });
        items.push({ key: 'busl', kind: 'text', x: 30, y: BUS + 24, text: 'bus' + (hotDrive ? ' = ' + b8(o.busv) + ' (' + o.busv + ')' : ''), cls: 'mono dp-buslabel' + (hotDrive ? ' hot' : ''), size: 13 });
        // the ALU and the accumulator
        const aluHot = hotLoad === 'A';
        items.push({ key: 'alu', kind: 'cell', x: ALUX - 50, y: 250, w: 120, h: 44, rx: 6, lines: ['ALU', o.aluText || ''], cls: 'mono dp-alu' + (aluHot ? ' hot' : ''), size: 13 });
        items.push({ key: 'ab', kind: 'edge', from: { x: ALUX, y: BUS }, to: { x: ALUX, y: 250 }, cls: 'dp-arrow' + (aluHot ? ' hot' : '') });
        items.push({ key: 'aa', kind: 'edge', from: { x: ALUX + 10, y: 294 }, to: { x: ALUX + 10, y: AY }, cls: 'dp-arrow' + (aluHot ? ' hot' : '') });
        items.push({ key: 'an', kind: 'text', x: ALUX + 14, y: AY + 64, text: 'A (accumulator)', anchor: 'middle', cls: 'asm-regname', size: 14 });
        items.push({ key: 'r:A', kind: 'cell', x: ALUX - 40, y: AY, w: RW + 8, h: 44, rx: 4, lines: [b8(regs.A), '= ' + regs.A], cls: 'mono asm-reg' + (o.changed === 'A' ? ' changed' : '') + (hotLoad === 'A' || hotDrive === 'A' ? ' hot' : ''), size: 13, pulse: o.changed === 'A' });
        // A back into the ALU, and A onto the bus
        const AX2 = ALUX + 68 + 30;
        items.push({ key: 'af1', kind: 'line', x1: ALUX + 68, y1: AY + 22, x2: AX2, y2: AY + 22, cls: 'dp-wire' + (o.op ? ' hot' : ''), layer: 'lines' });
        items.push({ key: 'af2', kind: 'line', x1: AX2, y1: AY + 22, x2: AX2, y2: 272, cls: 'dp-wire' + (o.op ? ' hot' : ''), layer: 'lines' });
        items.push({ key: 'af3', kind: 'edge', from: { x: AX2, y: 272 }, to: { x: ALUX + 70, y: 272 }, cls: 'dp-arrow' + (o.op ? ' hot' : '') });
        items.push({ key: 'ad1', kind: 'line', x1: ALUX - 40, y1: AY + 22, x2: ALUX - 70, y2: AY + 22, cls: 'dp-wire' + (hotDrive === 'A' ? ' hot' : ''), layer: 'lines' });
        items.push({ key: 'ad2', kind: 'line', x1: ALUX - 70, y1: AY + 22, x2: ALUX - 70, y2: BUS, cls: 'dp-wire' + (hotDrive === 'A' ? ' hot' : ''), layer: 'lines' });
        // the program, the present line lit
        const pl = P9.lines(prog.map((p, i) => ({ text: (i + 1) + '. ' + p.text, cls: i === o.line ? 'hot' : i < (o.line === undefined ? -1 : o.line) ? 'done' : '' })), ALUX + 160, RY, { prefix: 'pg', title: 'transfers', size: 15, lh: 26 });
        return items.concat(pl.items);
      };
      Fr.add({ items: draw({}), say: 'Four 8-bit registers R0 to R3 and an accumulator A share one bus. On each clock one source drives the bus (a register, A, or the DATA switches), and the destination loads at the edge. The ALU combines A with the bus and its result can only go into A.' });
      prog.forEach((p, i) => {
        const src = p.src || 'DATA', busv = p.src ? regs[p.src] : p.value;
        const isAlu = p.dst === 'A';
        const res = p.op ? OPS[p.op](regs.A, busv) : busv;
        const aluText = isAlu ? (p.op ? regs.A + ' ' + p.op + ' ' + busv + ' = ' + res : 'pass ' + busv) : '';
        const ctl = p.src ? p.src + ' drives the bus (' + busv + ')' : 'the DATA switches drive ' + busv + ' onto the bus';
        Fr.add({ items: draw({ line: i, drive: src, load: p.dst, busv, value: p.value, aluText, op: p.op }), say: 'Clock ' + (i + 1) + ': ' + p.text + '. ' + ctl[0].toUpperCase() + ctl.slice(1) + (isAlu ? '; the ALU ' + (p.op ? (OPNAME[p.op] + ': ' + regs.A + ' ' + p.op + ' ' + busv + ' = ' + res) : 'passes it through') : '') + '; ' + p.dst + '\'s load is enabled. Nothing has changed yet: the registers change only at the edge.', meta: { ask: true, dst: p.dst, ans: String(res), opts: [...new Set([res, regs[p.dst], busv, (res + 1) & 255])].map(String) } });
        const old = regs[p.dst];
        regs[p.dst] = res;
        Fr.count('clocks'); if (isAlu && p.op) Fr.count('alu');
        Fr.add({ items: draw({ line: i, changed: p.dst }), say: 'The clock edge: ' + p.dst + ' takes ' + res + ' (it held ' + old + '). The source keeps its value: a transfer copies, it does not move.' });
      });
      Fr.add({ items: draw({ line: prog.length }), say: 'After ' + prog.length + ' clocks: ' + REGS.concat(['A']).map((r) => r + ' = ' + regs[r]).join(', ') + '. One bus means one transfer per clock; two buses (or a register file with two read ports) would let the ALU take two registers at once.' });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'RTL', text: ['R1 ← R2      copy R2 into R1', 'A ← A + R1   ALU result into A', 'T1: R1 ← R2  only when T1 = 1', '', 'all transfers of a clock read', 'the values from before the edge'].join('\n') }] };
      return { frames: P9.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => fr[i].meta.opts, ask: (fr, i) => 'What will ' + fr[i].meta.dst + ' hold after this edge?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'R1 ← R2 means…', options: ['R2 is moved and cleared', 'R1 gets a copy of R2 at the clock edge; R2 keeps its value', 'R1 and R2 swap', 'R2 gets R1'], answer: 1, why: 'A transfer copies the source into the destination.' },
      { q: 'On a single bus, how many registers can be read in one clock?', options: ['one', 'two', 'all', 'none'], answer: 0, why: 'Only one source may drive the bus at a time; two would fight.' },
      { q: 'How are several sources kept from driving the bus at once?', options: ['tristate drivers (or a multiplexer) enabled one at a time', 'faster gates', 'more flip-flops', 'a second clock'], answer: 0, why: 'Exactly one driver is enabled by the control.' },
      { q: 'To swap R1 and R2 on this datapath you need at least…', options: ['1 clock', '2 clocks', '3 clocks, through A', 'it cannot be done'], answer: 2, why: 'A ← R1, R1 ← R2, R2 ← A: one bus transfer per clock.' },
      { q: 'T1: R1 ← R2 means…', options: ['R1 ← R2 at every edge', 'R1 ← R2 at the edge when the control signal T1 is 1', 'R1 ← R2 when T1 is 0', 'R2 ← R1'], answer: 1, why: 'The label before the colon is the condition that enables the transfer.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // ASM chart elements and blocks
  // ---------------------------------------------------------------------------------------------------
  const CHARTS = { multiplier: 'Shift-and-add multiplier', gcd: 'GCD engine', divider: 'Restoring divider', vending: 'Vending with a SUM register', broken: 'A GCD chart with two mistakes' };
  const brokenGcd = () => A().chart({
    name: 'gcd-broken', inputs: ['START'], dataInputs: { XIN: 8, YIN: 8 }, registers: { X: 8, Y: 8 }, outputs: ['READY'], status: { EQ: 'X == Y', LT: 'X < Y' },
    states: {
      IDLE: { actions: ['READY'], next: { if: 'START', then: { do: ['X ← XIN', 'X ← YIN'], then: 'CMP' }, else: 'IDLE' } },
      CMP: { actions: ['Y ← 0'], next: { if: 'EQ', then: 'IDLE', else: { if: 'LT', then: { do: ['Y ← Y - X'], then: 'CMP' }, else: { do: ['X ← X - Y'], then: 'CMP' } } } },
    },
  });
  const chartOf = (k) => (k === 'broken' ? brokenGcd() : P9.chart(k));
  S.topic({
    id: 'asm-elements', family: 'p9-rtl', order: 20, title: 'ASM charts: boxes and blocks',
    blurb: 'A state box is one clock: its outputs are on for the whole clock and its transfers happen at the edge that ends it. Decision boxes test inputs and status signals and take no time. Conditional boxes act only on their own path. A state box with everything under it, down to the next state boxes, is an ASM block: one clock.',
    inputs: [{ id: 'c', kind: 'choice', label: 'Chart', def: 'multiplier', options: Object.keys(CHARTS).map((k) => ({ value: k, label: CHARTS[k] })) }],
    presets: Object.keys(CHARTS).map((k) => ({ label: CHARTS[k], values: { c: k } })),
    counters: [{ id: 'blocks', label: 'blocks' }, { id: 'paths', label: 'paths' }],
    run(inp) {
      const ch = chartOf(inp.c), v = A().validate(ch);
      const Fr = new S.Frames(['blocks', 'paths']);
      const states = A().states(ch);
      const draw = (o) => K.asm.draw(ch, Object.assign({ prefix: 'asm' }, o || {})).items;
      const lay = K.asm.layout(ch);
      const notes = (lines, cls) => P9.lines(lines.map((t) => ({ text: t, cls })), lay.box.x + lay.box.w + 40, lay.box.y + 50, { prefix: 'nt', size: 14, lh: 22 }).items;
      Fr.add({ items: draw(), say: 'The ' + (ch.name || '') + ' chart: ' + states.length + ' states. Registers ' + Object.keys(ch.registers).join(', ') + '; inputs ' + (ch.inputs.join(', ') || 'none') + (Object.keys(ch.status).length ? '; status signals from the datapath ' + Object.entries(ch.status).map(([k, c]) => k + ' = (' + c + ')').join(', ') : '') + '.' });
      const sb = ch.boxes.find((b) => b.kind === 'state' && (b.actions || []).length) || ch.boxes.find((b) => b.kind === 'state');
      Fr.add({ items: draw({ hotBoxes: [sb.id] }), say: 'A state box (' + (sb.name || sb.id) + '): the machine spends one clock here. ' + ((sb.actions || []).length ? 'It lists ' + sb.actions.join(', ') + ': an output named here is 1 for the whole clock; a transfer happens at the edge that ends the clock.' : 'This one does nothing but wait for a decision.') });
      const dec = ch.boxes.find((b) => b.kind === 'decision');
      if (dec) Fr.add({ items: draw({ hotBoxes: [dec.id] }), say: 'A decision box tests ' + dec.cond + ' (' + (ch.inputs.includes(dec.cond) ? 'an input' : ch.status[dec.cond] ? 'a status signal: ' + ch.status[dec.cond] : 'a condition') + '). It takes no time: it only chooses the path, the 1 exit or the 0 exit.' });
      const cb = ch.boxes.find((b) => b.kind === 'cond');
      if (cb) Fr.add({ items: draw({ hotBoxes: [cb.id] }), say: 'A conditional box (rounded ends): ' + cb.actions.join(', ') + '. These happen only when the path through the decisions above reaches it, so they depend on the state and on the inputs, like Mealy outputs.' });
      for (const s of states) {
        const ps = A().paths(ch, s);
        Fr.count('blocks'); Fr.count('paths', ps.length);
        const ids = [...new Set(ps.flatMap((p) => p.boxes))];
        Fr.add({ narrowView: K.asm.narrow(ch, s), items: draw({ state: s, hotBoxes: ids }), say: 'The ASM block of ' + s + ': one clock. ' + ps.length + ' path' + (ps.length === 1 ? '' : 's') + ': ' + ps.map((p) => (p.conds.length ? p.conds.map((c) => c.cond + ' = ' + c.value).join(', ') : 'always') + ' → ' + (p.actions.length ? p.actions.map((a) => a.text).join(', ') : 'nothing') + ' → ' + (p.target || '?')).join('; ') + '.', meta: { ask: true, n: ps.length } });
      }
      if (v.ok) Fr.add({ items: draw().concat(notes(['✓ every path of every block reaches a state box', '✓ no register is written twice on one path', '✓ every name is a register, input, output or status signal'].concat(v.warnings.map((w) => '! ' + w)), 'good')), say: 'The chart keeps the rules, so it can be built: each block becomes one clock of the controller.' + (v.warnings.length ? ' (' + v.warnings.join(' ') + ')' : '') });
      else {
        // the boxes holding the clashing transfers: the texts in "(… and …)" of each error
        const clash = v.errors.flatMap((e) => { const m = /\((.*) and (.*)\)\.$/.exec(e); return m ? [m[1], m[2]] : []; });
        const bad = ch.boxes.filter((b) => (b.actions || []).some((a) => clash.includes(a)) || v.errors.some((e) => e.includes('Box ' + b.id + ' '))).map((b) => b.id);
        Fr.add({ items: draw({ hotBoxes: bad }).concat(notes(v.errors.map((e) => '✗ ' + e), 'bad')), say: 'This chart breaks the rules: ' + v.errors.join(' ') + ' A path may not write the same register twice: both transfers would land on the same edge, and the register can take only one value.', meta: { broken: true } });
      }
      const def = { sections: [{ id: 'd', kind: 'math', title: 'ASM chart', text: ['state box: one clock;', '  outputs on all clock,', '  transfers at the end edge', 'decision box: chooses a path', 'conditional box: actions on', '  that path only', 'ASM block = one clock'].join('\n') }] };
      return { frames: P9.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['1', '2', '3', '4'], ask: 'How many different paths lead out of this block?', answer: (fr, i) => String(fr[i].meta.n), explain: (fr, i) => fr[i].say },
    ],
    quiz: [
      { q: 'How long does an ASM block take?', options: ['one clock', 'one clock per decision', 'no time', 'two clocks'], answer: 0, why: 'All its decisions and conditional boxes act within the one clock of its state.' },
      { q: 'An output written in a conditional box is…', options: ['on for every clock in that state', 'on only when the path reaches that box', 'a register', 'a decision'], answer: 1, why: 'It depends on the decisions above it, so on the inputs as well.' },
      { q: 'Which is not allowed in one path of an ASM block?', options: ['two decisions', 'writing the same register twice', 'an output and a transfer', 'no actions at all'], answer: 1, why: 'Both writes would happen at the same edge; the register cannot take two values.' },
      { q: 'A decision box tests…', options: ['only inputs', 'inputs and status signals from the datapath', 'the clock', 'the next state'], answer: 1, why: 'Conditions such as START (an input) and Z = (P = 0) (a status signal).' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The timing of an ASM block
  // ---------------------------------------------------------------------------------------------------
  const TIMING = {
    multiplier: { label: 'Multiplier 6 × 5', ch: 'multiplier', inputs: (k) => ({ START: k === 1 ? 1 : 0, MIN: 6, QIN: 5 }), from: 2 },
    gcd: { label: 'GCD of 12 and 18', ch: 'gcd', inputs: (k) => ({ START: k === 1 ? 1 : 0, XIN: 12, YIN: 18 }), from: 1 },
    divider: { label: 'Divider 11 ÷ 3', ch: 'divider', inputs: (k) => ({ START: k === 1 ? 1 : 0, DIN: 11, VIN: 3 }), from: 2 },
  };
  S.topic({
    id: 'asm-timing', family: 'p9-rtl', order: 30, title: 'What happens on one clock edge',
    blurb: 'During a clock the decisions look at the registers as they are; every transfer of the block is worked out from those same values; at the edge all of them land together and the state moves on. So P ← P − 1 in one block is seen by a decision only in the next block.',
    inputs: [{ id: 'c', kind: 'choice', label: 'Example', def: 'multiplier', options: Object.keys(TIMING).map((k) => ({ value: k, label: TIMING[k].label })) }, { id: 'n', kind: 'number', label: 'Clocks to look at', def: 3, min: 2, max: 5 }],
    presets: [
      { label: 'Multiplier: ADD then SHIFT', values: { c: 'multiplier', n: 3 } },
      { label: 'GCD: one subtraction per clock', values: { c: 'gcd', n: 3 } },
      { label: 'Divider: shift, subtract, test', values: { c: 'divider', n: 4 } },
    ],
    counters: [{ id: 'edges', label: 'edges' }, { id: 'writes', label: 'registers written' }],
    run(inp) {
      const T = TIMING[inp.c], ch = P9.chart(T.ch);
      const r = A().run(ch, { inputs: T.inputs, maxCycles: T.from + inp.n + 3 });
      const Fr = new S.Frames(['edges', 'writes']);
      const lay = K.asm.layout(ch);
      const steps = r.trace;
      const k0 = T.from, k1 = Math.min(steps.length - 1, T.from + inp.n - 1);
      // waveforms of the registers over the clocks shown, a rising edge at the end of each clock
      const P = 100, t0 = k0 * P, t1 = (k1 + 1) * P + 30;
      const regNames = Object.keys(ch.registers);
      const valAt = (name, k) => (k <= 0 ? 0 : steps[k - 1].regs[name]);
      const clkCh = []; for (let k = k0; k <= k1 + 1; k++) { clkCh.push([k * P, 1]); clkCh.push([k * P + P / 2, 0]); }
      const sigs = [{ name: 'CLK', changes: clkCh }].concat(regNames.map((n) => {
        const ch2 = [];
        for (let k = k0; k <= k1 + 1; k++) { const v = valAt(n, k); if (!ch2.length || ch2[ch2.length - 1][1] !== v) ch2.push([k * P, v]); }
        return { name: n, changes: ch2, width: ch.registers[n] };
      }));
      const wy = lay.box.y + 60, wx = lay.box.x + lay.box.w + 40;
      const scene = (k, phase) => {
        const step = steps[k];
        const tests = {}; for (const t of step.tests) tests[t.box] = t.value;
        const c = K.asm.draw(ch, { prefix: 'asm', state: step.state, path: step.path, tests, next: step.next }).items;
        const now = phase === 'before' ? k * P + P - 2 : (k + 1) * P + 2;
        const wv = TM.waves({ x: wx, y: wy, w: 440, t0, t1, now, signals: sigs, prefix: 'tw', rowH: 22, gap: 10, ticks: [] , unit: '' });
        const states = []; for (let j = k0; j <= k1 + 1 && j < steps.length + 1; j++) states.push([j * P, j < steps.length ? steps[j].state : steps[steps.length - 1].next]);
        const sr = S.P6.stateRow(states, wv.xOf, wv.bottom + 6, t1, 'sr');
        const lab = { key: 'srl', kind: 'text', x: wv.px - 10, y: wv.bottom + 24, text: 'state', anchor: 'end', cls: 'strong' };
        return c.concat(wv.items, sr, [lab]);
      };
      Fr.add({ items: scene(k0, 'before'), say: 'Rising edges at the boundaries on the waveform; between two edges the chart is in one block. We look at clocks ' + (k0 + 1) + ' to ' + (k1 + 1) + '.' });
      for (let k = k0; k <= k1; k++) {
        const step = steps[k], before = k > 0 ? steps[k - 1].regs : {};
        const vals = regNames.filter((n) => step.changes.some((c) => c.reg === n));
        const reads = step.tests.map((t) => t.cond + ' = ' + t.value).join(', ');
        const work = step.transfers.length ? step.transfers.map((t) => t).join('; ') : 'no transfers';
        Fr.add({ narrowView: K.asm.narrow(ch, step.state), items: scene(k, 'before'), say: 'Clock ' + (k + 1) + ', in ' + step.state + ', before the edge. ' + (reads ? 'The decisions read ' + reads + (step.tests.some((t) => ch.inputs.includes(t.cond)) ? ', from the inputs and the registers' : ' from the registers') + ' as they are now. ' : '') + 'The block\'s transfers (' + work + ') are worked out from the present values: ' + (regNames.map((n) => n + ' = ' + before[n]).join(', ')) + '.', meta: vals.length ? { ask: true, reg: vals[0], ans: String(step.regs[vals[0]]), opts: [...new Set([step.regs[vals[0]], before[vals[0]], (step.regs[vals[0]] + 1) % (1 << ch.registers[vals[0]])])].map(String) } : null });
        Fr.count('edges'); Fr.count('writes', vals.length);
        Fr.add({ narrowView: K.asm.narrow(ch, step.state), items: scene(k, 'after'), say: 'The edge: ' + (step.changes.length ? step.changes.map((c) => c.reg + ' ' + c.from + ' → ' + c.to).join(', ') + ', all at the same instant' : 'no register changes') + ', and the state becomes ' + step.next + '.' + (step.changes.length > 1 ? ' None of them saw another\'s new value.' : '') });
      }
      const def = { sections: [{ id: 'd', kind: 'math', title: 'One clock', text: ['during the clock:', '  decisions read the registers', '  transfers computed from them', 'at the edge:', '  every register written at once', '  the state moves to the next block'].join('\n') }] };
      return { frames: P9.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => fr[i].meta.opts, ask: (fr, i) => 'What will ' + fr[i].meta.reg + ' be just after this edge?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'In the multiplier, ADD does P ← P − 1 and SHIFT tests Z = (P = 0). Which value of P does the test in SHIFT see?', options: ['the value before ADD', 'the value after ADD\'s edge, already decremented', 'P − 2', 'it cannot see P'], answer: 1, why: 'SHIFT is the next clock; ADD\'s transfer has landed by then.' },
      { q: 'In one block, A ← B and B ← A happen together. After the edge…', options: ['both hold the old A', 'they have swapped', 'both hold the old B', 'it is undefined'], answer: 1, why: 'Both transfers read the values from before the edge.' },
      { q: 'A decision in a block tests a register that the same block writes. It sees…', options: ['the new value', 'the old value', 'X', 'either'], answer: 1, why: 'Nothing changes until the edge at the end of the clock.' },
      { q: 'When does the state change?', options: ['when a decision is made', 'at the clock edge, with the registers', 'halfway through the clock', 'when an output turns on'], answer: 1, why: 'The state register is just another register clocked by the same edge.' },
    ],
  });
  void Geo;
})(globalThis.Sirkit = globalThis.Sirkit || {});
