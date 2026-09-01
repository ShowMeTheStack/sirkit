// Part 7, registers: a register with parallel load (a multiplexer in front of each flip-flop), a shift register
// with the bits marching along, serial transfer from one register into another, and the universal shift
// register with its four modes. Live runs, waveforms under the circuits.
(function (S) {
  'use strict';
  // the circuits sit above their waveforms, so they are shown small: their names (pin names too) drawn larger
  const NAMES = 1.3;
  const K = S.Kit, TM = K.timing, N = S.Netlist;
  const ns = TM.ns;
  const port = TM.port;
  const bin = TM.bin;
  const bitsOf = (v) => String(v).replace(/\s+/g, '').split('').map(Number);
  const bitsCheck = (label, max) => (v) => { const s = String(v).replace(/\s+/g, ''); if (!/^[01]+$/.test(s)) return label + ': write 0s and 1s, like 0110'; if (s.length > (max || 10)) return label + ': at most ' + (max || 10) + ' values'; return null; };
  const words = (v) => String(v).trim().split(/[\s,]+/).filter(Boolean);
  const wordCheck = (label, n, max) => (v) => { const w = words(v); if (!w.length) return label + ': at least one value'; if (w.length > max) return label + ': at most ' + max + ' values'; const bad = w.find((x) => !new RegExp('^[01]{' + n + '}$').test(x)); return bad ? label + ': "' + bad + '" is not ' + n + ' bits' : null; };

  /** the self-check: a word the narration states, bit by bit against the simulation (names in the word's order) */
  const claimWord = (R, t, names, word) => TM.verify(R, t, Object.fromEntries(names.map((n, i) => [n, +word[i]])));

  S.family({ id: 'p7-registers', part: 'registers', order: 10, title: 'Registers', blurb: 'Rows of flip-flops sharing a clock: loading a word in parallel, shifting it along a bit at a time, moving it serially into another register, and a register that can do all of these.' });

  // ---------------------------------------------------------------------------------------------------
  // Register with parallel load
  // ---------------------------------------------------------------------------------------------------
  function reg4() {
    const c = new N.Circuit('Register with load');
    const d = [0, 1, 2, 3].map((i) => c.input('D' + i).pin('y'));
    const ld = c.input('LD').pin('y'), clk = c.clock('CLK').pin('y');
    const muxes = [], ffs = [];
    for (let i = 0; i < 4; i++) {
      const m = c.add('MUX', { n: 2 }, 'm' + i), f = c.add('DFF', { qn: false }, 'f' + i);
      muxes.push(m); ffs.push(f);
      c.connect(d[i], m.pin('d1')); c.connect(ld, m.pin('s0'));
      c.connect(m.pin('y'), f.pin('d')); c.connect(clk, f.pin('clk'));
      c.connect(f.pin('q'), m.pin('d0'), c.output('Q' + i));
    }
    c.style = 'slices';
    c.hints = {
      slices: [3, 2, 1, 0].map((i) => ({ mux: muxes[i], ff: ffs[i] })),
      place: { mux: { dx: 4, dy: 0 }, ff: { dx: 13, dy: 1, opts: { sides: { clock: 'bottom' } } } },
      pitch: 28, rails: [{ port: port(c, 'LD') }, { port: port(c, 'CLK') }],
      top: [3, 2, 1, 0].map((i) => port(c, 'D' + i)), bottom: [3, 2, 1, 0].map((i) => port(c, 'Q' + i)),
    };
    return c;
  }
  S.topic({
    id: 'reg-load', family: 'p7-registers', order: 10, title: 'A register with parallel load',
    blurb: 'Four D flip-flops share a clock. In front of each, a 2-to-1 multiplexer picks the new input when LD = 1 or the flip-flop\'s own Q when LD = 0, so the register loads a whole word, or holds it, at every edge.',
    inputs: [
      { id: 'd', kind: 'text', label: 'D3..D0 at each edge', def: '1010 0110 0110 1111 0001 0001', check: wordCheck('D', 4, 8) },
      { id: 'ld', kind: 'text', label: 'LD at each edge', def: '100101', check: bitsCheck('LD', 8) },
    ],
    check: (inp) => (words(inp.d).length !== bitsOf(inp.ld).length ? 'D and LD need one value per edge each' : null),
    presets: [
      { label: 'Load, hold, load', values: { d: '1010 0110 0110 1111 0001 0001', ld: '100101' } },
      { label: 'Load at every edge', values: { d: '0001 0010 0100 1000', ld: '1111' } },
      { label: 'Never load: holds its power-up 0', values: { d: '1111 1010 0101', ld: '000' } },
    ],
    counters: [{ id: 'loads', label: 'loads' }, { id: 'holds', label: 'holds' }],
    run(inp) {
      const ws = words(inp.d), lv = bitsOf(inp.ld), n = ws.length;
      const c = reg4();
      const ins = { LD: lv };
      for (let i = 0; i < 4; i++) ins['D' + i] = ws.map((w) => +w[3 - i]);
      const R = TM.clocked(c, { cycles: n, inputs: ins, powerUp: 0 });
      const end = n * R.period + 2;
      const Q = ['Q3', 'Q2', 'Q1', 'Q0'], D = ['D3', 'D2', 'D1', 'D0'];
      const signals = [{ name: 'CLK', changes: R.changes('CLK') }, { name: 'LD', changes: R.changes('LD') }, { name: 'D', changes: TM.bus(R, D), width: 4 }, { name: 'Q', changes: TM.bus(R, Q), width: 4 }];
      const F = new S.Frames(['loads', 'holds']);
      const scene = (t, hot) => TM.frame({ R, t, textScale: NAMES, pinCap: NAMES, hot, t1: end, signals, ticks: n }).items;
      F.add({ items: scene(1), say: 'Bit 3 at the left. Each multiplexer passes D (input 1) when LD = 1 and the flip-flop\'s own Q (input 0) when LD = 0. The register powers up at 0000 here.' });
      for (let k = 0; k < n; k++) {
        const e = R.edgeAt(k), q0 = TM.busAt(R, Q, e - 0.5), q1 = TM.busAt(R, Q, e + 25);
        F.add({ items: scene(e - 0.5, lv[k] ? ['m0', 'm1', 'm2', 'm3'] : []), say: 'Before edge ' + (k + 1) + ': LD = ' + lv[k] + ', D = ' + ws[k] + ', Q = ' + bin(q0, 4) + '. The multiplexers are passing ' + (lv[k] ? 'D' : 'Q back to itself') + '.', meta: { ask: true, q: bin(q1, 4), opts: [...new Set([bin(q0, 4), ws[k], bin(q1, 4)])] } });
        F.count(lv[k] ? 'loads' : 'holds');
        claimWord(R, e - 0.5, D.concat(['LD']), ws[k] + lv[k]);
        claimWord(R, e + 25, Q, lv[k] ? ws[k] : bin(q0, 4));
        F.add({ items: scene(e + 25, ['f0', 'f1', 'f2', 'f3']), say: 'At the edge all four flip-flops take their D together: Q = ' + bin(q1, 4) + (lv[k] ? ', the word on the inputs.' : ', unchanged: each flip-flop reloaded its own value.') });
      }
      F.add({ items: scene(end), mark: 'end', say: F.counts.loads + ' load' + (F.counts.loads === 1 ? '' : 's') + ' and ' + F.counts.holds + ' hold' + (F.counts.holds === 1 ? '' : 's') + '. The clock reaches every flip-flop at every edge; LD only decides what they reload. That keeps the clock clean (no gate on it) and every flip-flop in step.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Each bit', text: ['Di(next) = LD·Ii + LD′·Qi', '', 'LD = 1: load the input word', 'LD = 0: hold'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => fr[i].meta.opts.length > 1 ? fr[i].meta.opts : fr[i].meta.opts.concat(['0000', '1111'].filter((x) => x !== fr[i].meta.opts[0])).slice(0, 2), ask: 'What will Q be after this edge?', answer: (fr, i) => fr[i].meta.q, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'In a register with load built from D flip-flops and multiplexers, LD = 0 makes each flip-flop…', options: ['reset', 'reload its own Q', 'toggle', 'take its input'], answer: 1, why: 'The multiplexer feeds Q back to D, so the edge changes nothing.' },
      { q: 'Why not stop the clock (AND it with LD) to hold the register?', options: ['A gated clock can glitch and arrives late, putting the flip-flops out of step', 'It needs more flip-flops', 'It is slower to load', 'D flip-flops cannot hold'], answer: 0, why: 'Clean, ungated clocks keep every flip-flop switching together.' },
      { q: 'A 4-bit register with load changes all its bits…', options: ['one after another', 'at the same edge', 'only when LD changes', 'when D changes'], answer: 1, why: 'All flip-flops share the clock.' },
      { q: 'Di(next) for a register with load is…', options: ['LD·Ii + LD′·Qi', 'LD ⊕ Ii', 'Ii', 'LD + Qi'], answer: 0, why: 'The 2-to-1 multiplexer equation.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Shift register
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'shift-reg', family: 'p7-registers', order: 20, title: 'The shift register',
    blurb: 'Each flip-flop\'s D comes from the one before it, so at every edge every bit moves one place along and a new bit enters from SI. After four edges a serial input has become a parallel word.',
    inputs: [{ id: 'si', kind: 'text', label: 'SI at each edge', def: '1011000', check: bitsCheck('SI', 10) }],
    presets: [
      { label: 'Shift in 1011', values: { si: '1011000' } },
      { label: 'A single 1 walks through', values: { si: '100000' } },
      { label: 'Fill with 1s', values: { si: '111100' } },
    ],
    counters: [{ id: 'edges', label: 'shifts' }],
    run(inp) {
      const sv = bitsOf(inp.si), n = sv.length;
      const c = TM.build.shiftRow(4);
      const R = TM.clocked(c, { cycles: n, inputs: { SI: sv }, powerUp: 0 });
      const end = n * R.period + 2;
      const Q = ['Q0', 'Q1', 'Q2', 'Q3'];
      const signals = TM.signals(R, ['CLK', 'SI'].concat(Q));
      const F = new S.Frames(['edges']);
      const word = (t) => Q.map((q) => R.at(q, t)).join('');
      const scene = (t, hot) => TM.frame({ R, t, textScale: NAMES, pinCap: NAMES, hot, t1: end, signals, ticks: n }).items;
      F.add({ items: scene(1), say: 'Four D flip-flops in a chain: SI → Q0 → Q1 → Q2 → Q3. They power up at 0 here. Reading Q0 Q1 Q2 Q3 left to right: ' + word(40) + '.' });
      for (let k = 0; k < n; k++) {
        const e = R.edgeAt(k), w0 = word(e - 0.5), w1 = word(e + 25);
        F.count('edges');
        F.add({ items: scene(e - 0.5), say: 'Before edge ' + (k + 1) + ': SI = ' + sv[k] + ', Q0..Q3 = ' + w0 + '.', meta: { ask: true, w: w1, opts: [...new Set([w1, w0, sv[k] + w0.slice(0, 3), w0.slice(1) + sv[k]])] } });
        claimWord(R, e + 25, Q, sv[k] + w0.slice(0, 3));
        F.add({ items: scene(e + 25, ['f0', 'f1', 'f2', 'f3']), say: 'Edge ' + (k + 1) + ': every flip-flop takes the bit before it at the same instant, so the word moves one place: Q0..Q3 = ' + w1 + '. The bit ' + w0[3] + ' that was in Q3 has left.' });
      }
      F.add({ items: scene(end), mark: 'end', say: 'Each bit of SI came out of Q3 four edges later; and after any four edges, Q0..Q3 hold the last four bits of SI side by side, the newest in Q0: serial in, parallel out.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Shift right', text: ['Q0(next) = SI', 'Qi(next) = Q(i−1)', '', 'all at the same edge'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => fr[i].meta.opts.slice(0, 4).sort(), ask: 'Q0..Q3 after this edge?', answer: (fr, i) => fr[i].meta.w, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'A 4-bit shift register holds Q0..Q3 = 1100 and SI = 1. After one edge (shifting toward Q3) it holds…', options: ['1110', '1001', '0110', '1100'], answer: 0, why: 'SI enters Q0, every bit moves one place, Q3\'s 0 leaves.' },
      { q: 'Why does a shift register need edge-triggered flip-flops?', options: ['With latches, a bit would race through several stages in one clock', 'Latches are slower', 'Edge-triggered ones use less power', 'It does not'], answer: 0, why: 'Each bit must move exactly one place per clock.' },
      { q: 'How many edges does it take to load 8 bits serially into an 8-bit shift register?', options: ['1', '4', '8', '16'], answer: 2, why: 'One bit per edge.' },
      { q: 'A bit entering SI appears at the output of the fourth stage after…', options: ['1 edge', '3 edges', '4 edges', '8 edges'], answer: 2, why: 'It moves one stage per edge.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Serial transfer
  // ---------------------------------------------------------------------------------------------------
  /** two 4-bit registers A and B, shifting together while SH = 1: A's last bit goes into B and back into A */
  function transfer(a, b) {
    const c = new N.Circuit('Serial transfer');
    const sh = c.input('SH').pin('y'), clk = c.clock('CLK').pin('y'), init = c.input('INIT').pin('y');
    const mk = (pre, word) => [0, 1, 2, 3].map((i) => { const one = (word >> (3 - i)) & 1; return c.add('DFF', { qn: false, en: true, set: !!one, reset: !one }, pre + i); });
    const A = mk('a', a), Bf = mk('b', b);
    const all = A.concat(Bf);
    all.forEach((f, i) => { c.connect(clk, f.pin('clk')); c.connect(sh, f.pin('en')); if (i) c.connect(all[i - 1].pin('q'), f.pin('d')); });
    c.connect(A[3].pin('q'), A[0].pin('d'));
    all.forEach((f, i) => { const pre = i < 4 ? 'a' : 'b'; c.connect(init, f.pin(f.params.set ? 'set' : 'rst')); c.connect(f.pin('q'), c.output((pre === 'a' ? 'A' : 'B') + (3 - (i % 4)))); });
    // A3 is the left flip-flop of A; A0 (its last) feeds both B and A3
    c.style = 'slices';
    c.hints = { slices: all.map((f) => ({ ff: f })), place: { ff: { dx: 0, dy: 0, opts: { sides: { clock: 'bottom', set: 'bottom', rst: 'bottom', en: 'bottom' } } } }, pitch: 13, rails: [{ port: port(c, 'CLK') }, { port: port(c, 'SH') }, { port: port(c, 'INIT') }], bottom: [3, 2, 1, 0].map((i) => port(c, 'A' + i)).concat([3, 2, 1, 0].map((i) => port(c, 'B' + i))) };
    return c;
  }
  S.topic({
    id: 'serial-transfer', family: 'p7-registers', order: 30, title: 'Serial transfer between registers',
    blurb: 'Join the serial output of register A to the serial input of B, and feed A\'s output back to its own input too. Four shifts later B holds A\'s word and A still has it: a transfer over a single wire.',
    inputs: [
      { id: 'a', kind: 'text', label: 'A starts at', def: '1011', check: wordCheck('A', 4, 1) },
      { id: 'b', kind: 'text', label: 'B starts at', def: '0010', check: wordCheck('B', 4, 1) },
      { id: 'sh', kind: 'text', label: 'SH at each edge', def: '0111100', check: bitsCheck('SH', 9) },
    ],
    presets: [
      { label: 'Four shifts', values: { a: '1011', b: '0010', sh: '0111100' } },
      { label: 'A pause in the middle', values: { a: '1100', b: '0101', sh: '1101100' } },
      { label: 'Only two shifts', values: { a: '0111', b: '1000', sh: '0110000' } },
    ],
    counters: [{ id: 'shifts', label: 'shifts' }],
    run(inp) {
      const a = parseInt(inp.a, 2), b = parseInt(inp.b, 2), sv = bitsOf(inp.sh), n = sv.length;
      const c = transfer(a, b);
      const R = TM.clocked(c, { cycles: n, inputs: { SH: sv }, powerUp: 0, extra: [[0, 'INIT', 1], [20, 'INIT', 0]] });
      const end = n * R.period + 2;
      const A = ['A3', 'A2', 'A1', 'A0'], Bn = ['B3', 'B2', 'B1', 'B0'];
      const signals = [{ name: 'CLK', changes: R.changes('CLK') }, { name: 'SH', changes: R.changes('SH') }, { name: 'A0', label: 'A0 (serial)', changes: R.changes('A0') }, { name: 'A', changes: TM.bus(R, A), width: 4 }, { name: 'B', changes: TM.bus(R, Bn), width: 4 }];
      const F = new S.Frames(['shifts']);
      const val = (names, t) => bin(TM.busAt(R, names, t), 4);
      const scene = (t, hot) => TM.frame({ R, t, textScale: NAMES, pinCap: NAMES, hot, t1: end, signals, ticks: n }).items;
      F.add({ items: scene(30), say: 'INIT presets A = ' + inp.a + ' and B = ' + inp.b + ' (left to right A3..A0, B3..B0). Every flip-flop has a clock enable wired to SH: with SH = 0 an edge changes nothing. Bits move left to right; A0 feeds B3 and also A3.' });
      for (let k = 0; k < n; k++) {
        const e = R.edgeAt(k), a1 = val(A, e + 25), b1 = val(Bn, e + 25), a0 = val(A, e - 0.5), b0 = val(Bn, e - 0.5);
        if (sv[k]) F.count('shifts');
        claimWord(R, e + 25, A.concat(Bn), sv[k] ? a0[3] + a0.slice(0, 3) + a0[3] + b0.slice(0, 3) : a0 + b0);
        F.add({ items: scene(e + 25, sv[k] ? ['a0', 'b3'] : []), say: 'Edge ' + (k + 1) + ', SH = ' + sv[k] + ': ' + (sv[k] ? 'the bit ' + a0[3] + ' leaving A0 enters both B3 and A3. A = ' + a1 + ', B = ' + b1 + '.' : 'no shift; A = ' + a1 + ', B = ' + b1 + ' stay.'), meta: { b: b1, a: a1, sh: sv[k], prevB: b0 } });
      }
      const bEnd = val(Bn, end), done = F.counts.shifts;
      F.add({ items: scene(end), mark: 'end', say: done >= 4 ? 'After ' + done + ' shifts B = ' + bEnd + (done === 4 ? ', the word A started with, and A = ' + val(A, end) + ' is back where it began: it went round once.' : ': more than four shifts keep rotating the same word through both.') : 'Only ' + done + ' shift' + (done === 1 ? '' : 's') + ': B = ' + bEnd + ' holds part of A\'s word and part of its own. A full transfer of 4 bits takes 4 shifts.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Serial transfer', text: ['A0 → B3,  A0 → A3', 'n bits take n clock edges', 'over one wire'].join('\n') }] } };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.sh && i > 0, pick: 'option', options: (fr, i) => [...new Set([fr[i + 1].meta.b, fr[i + 1].meta.prevB, '0000', '1111'])].slice(0, 3).sort(), ask: 'B after the next shift?', answer: (fr, i) => fr[i + 1].meta.b, explain: (fr, i) => fr[i + 1].say, once: true }],
    quiz: [
      { q: 'Serial transfer of an 8-bit word takes…', options: ['1 clock', '4 clocks', '8 clocks', '16 clocks'], answer: 2, why: 'One bit per shift.' },
      { q: 'Why is A\'s serial output also fed back to A\'s own input?', options: ['So A keeps its word after the transfer', 'To speed it up', 'To clear A', 'To avoid a hold violation'], answer: 0, why: 'A rotates as it shifts, so after n shifts its word is back in place.' },
      { q: 'The advantage of serial transfer over parallel is…', options: ['speed', 'fewer wires', 'no clock needed', 'no flip-flops'], answer: 1, why: 'One wire instead of n, at the cost of n clocks.' },
      { q: 'With SH = 0 at an edge, the registers…', options: ['shift', 'clear', 'hold', 'load'], answer: 2, why: 'The clock enables are off.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Universal shift register
  // ---------------------------------------------------------------------------------------------------
  function univ4() {
    const c = new N.Circuit('Universal shift register');
    const sri = c.input('RI').pin('y');
    const din = [0, 1, 2, 3].map((i) => c.input('I' + i).pin('y'));
    const sli = c.input('LI').pin('y');
    const s1 = c.input('S1').pin('y'), s0 = c.input('S0').pin('y'), clk = c.clock('CLK').pin('y');
    const ms = [], fs = [];
    for (let i = 0; i < 4; i++) { ms.push(c.add('MUX', { n: 4 }, 'm' + i)); fs.push(c.add('DFF', { qn: false }, 'f' + i)); }
    for (let i = 0; i < 4; i++) {
      c.connect(s1, ms[i].pin('s1')); c.connect(s0, ms[i].pin('s0'));
      c.connect(ms[i].pin('y'), fs[i].pin('d')); c.connect(clk, fs[i].pin('clk'));
      c.connect(din[i], ms[i].pin('d3'));
    }
    for (let i = 0; i < 4; i++) {
      const sinks = [ms[i].pin('d0'), c.output('Q' + i)];
      if (i + 1 < 4) sinks.push(ms[i + 1].pin('d1'));
      if (i > 0) sinks.push(ms[i - 1].pin('d2'));
      c.connect(fs[i].pin('q'), ...sinks);
    }
    c.connect(sri, ms[0].pin('d1')); c.connect(sli, ms[3].pin('d2'));
    // drawn by hand: each bit a multiplexer and its flip-flop; every Q rises to a lane of its own above (a rail),
    // and drops into the multiplexers that want it, the deepest input taken furthest left so the drops never
    // cross; mode lines and clock are rails below, the parallel inputs come down from the top
    const X = (i) => 24 * i + 8, lane = (i) => -2 - 2 * i, yRI = -10, yLI = -12, yPort = 21;
    const place = { in_RI: [-10, yRI - 1], in_LI: [-10, yLI - 1], in_S1: [-10, 12], in_S0: [-10, 14], clk_CLK: [-13, 16] };
    for (let i = 0; i < 4; i++) { place['m' + i] = [X(i), 0]; place['f' + i] = [X(i) + 9, 3, { sides: { clock: 'bottom' } }]; place['in_I' + i] = [X(i) - 7, -19, { orient: 'down' }]; place['out_Q' + i] = [X(i) + 15, yPort, { orient: 'down' }]; }
    TM.manual(c, place, (sh, at, net) => {
      const drop = (id, pin, x, y0) => { const p = at(id, pin); sh.line(net(id, pin), [[x, y0], [x, p.y], [p.x, p.y]]); };
      for (let i = 0; i < 4; i++) {
        const xq = X(i) + 17, n = net('f' + i, 'q'), ly = lane(i);
        const taps = [X(i) - 2].concat(i < 3 ? [X(i + 1) - 3] : [], i > 0 ? [X(i - 1) - 4] : []);
        sh.line(n, [[X(i) + 15, 5], [xq, 5]]);
        sh.line(n, [[xq, 5], [xq, ly]]); sh.line(n, [[xq, 5], [xq, yPort]]);
        sh.line(n, [[Math.min(...taps), ly], [Math.max(xq, ...taps), ly]], true);
        drop('m' + i, 'd0', X(i) - 2, ly);
        if (i < 3) drop('m' + (i + 1), 'd1', X(i + 1) - 3, ly);
        if (i > 0) drop('m' + (i - 1), 'd2', X(i - 1) - 4, ly);
        const ip = at('in_I' + i, 'y');
        sh.line(net('in_I' + i, 'y'), [[ip.x, ip.y], [ip.x, 8], [X(i), 8]]);
      }
      sh.line(net('in_RI', 'y'), [[-6, yRI], [X(0) - 3, yRI]], true); drop('m0', 'd1', X(0) - 3, yRI);
      sh.line(net('in_LI', 'y'), [[-6, yLI], [X(3) - 4, yLI]], true); drop('m3', 'd2', X(3) - 4, yLI);
      for (const [pid, pin, y] of [['in_S1', 's1', 13], ['in_S0', 's0', 15]]) {
        sh.line(net(pid, 'y'), [[-6, y], [X(3) + (pin === 's1' ? 2 : 4), y]], true);
        for (let i = 0; i < 4; i++) { const p = at('m' + i, pin); sh.line(net(pid, 'y'), [[p.x, y], [p.x, p.y]]); }
      }
      sh.line(net('clk_CLK', 'y'), [[-6, 17], [X(3) + 12, 17]], true);
      for (let i = 0; i < 4; i++) { const p = at('f' + i, 'clk'); sh.line(net('clk_CLK', 'y'), [[p.x, 17], [p.x, p.y]]); }
    });
    return c;
  }
  const MODES = ['hold', 'shift right, toward Q3', 'shift left, toward Q0', 'parallel load'];
  S.topic({
    id: 'universal-shift', family: 'p7-registers', order: 40, title: 'The universal shift register',
    blurb: 'A 4-to-1 multiplexer in front of each flip-flop chooses, by the mode S1 S0: keep Q (hold), take the left neighbour (shift right), take the right neighbour (shift left), or take the input I (load).',
    inputs: [
      { id: 'mode', kind: 'text', label: 'Mode S1S0 at each edge (0 hold, 1 right, 2 left, 3 load)', def: '3110220', check: (v) => (/^[0-3]{1,9}$/.test(String(v).replace(/\s+/g, '')) ? null : 'Mode: digits 0 to 3, at most 9') },
      { id: 'i', kind: 'text', label: 'Parallel input I0..I3', def: '1101', check: wordCheck('I', 4, 1) },
      { id: 'ri', kind: 'text', label: 'Serial in from the left (RI) at each edge', def: '0101000', check: bitsCheck('RI', 9) },
      { id: 'li', kind: 'text', label: 'Serial in from the right (LI) at each edge', def: '0000110', check: bitsCheck('LI', 9) },
    ],
    check: (inp) => { const n = String(inp.mode).replace(/\s+/g, '').length; return bitsOf(inp.ri).length !== n || bitsOf(inp.li).length !== n ? 'Mode, RI and LI need one value per edge each' : null; },
    presets: [
      { label: 'Load, shift right, hold, shift left', values: { mode: '3110220', i: '1101', ri: '0101000', li: '0000110' } },
      { label: 'Rotate by feeding back', values: { mode: '311111', i: '1000', ri: '000000', li: '000000' } },
      { label: 'Hold everything', values: { mode: '3000', i: '0110', ri: '1111', li: '1111' } },
    ],
    counters: [{ id: 'edges', label: 'edges' }],
    run(inp) {
      const mv = String(inp.mode).replace(/\s+/g, '').split('').map(Number), n = mv.length;
      const c = univ4();
      const ins = { S1: mv.map((m) => m >> 1), S0: mv.map((m) => m & 1), RI: bitsOf(inp.ri), LI: bitsOf(inp.li) };
      for (let i = 0; i < 4; i++) ins['I' + i] = mv.map(() => +inp.i[i]);
      const R = TM.clocked(c, { cycles: n, inputs: ins, powerUp: 0 });
      const end = n * R.period + 2;
      const Q = ['Q0', 'Q1', 'Q2', 'Q3'];
      const word = (t) => Q.map((q) => R.at(q, t)).join('');
      const modeCh = TM.bus(R, ['S1', 'S0']);
      const signals = [{ name: 'CLK', changes: R.changes('CLK') }, { name: 'S1S0', changes: modeCh, width: 2 }, { name: 'Q', label: 'Q3..Q0', changes: TM.bus(R, ['Q3', 'Q2', 'Q1', 'Q0']), width: 4 }];
      const F = new S.Frames(['edges']);
      const scene = (t, hot) => TM.frame({ R, t, textScale: NAMES, pinCap: NAMES, hot, t1: end, signals, ticks: n }).items;
      F.add({ items: scene(1), say: 'Bit 0 at the left. Each multiplexer\'s inputs: 0 its own Q, 1 the neighbour on the left (RI for bit 0), 2 the neighbour on the right (LI for bit 3), 3 the input Ii. S1 S0 drive all four multiplexers at once.' });
      for (let k = 0; k < n; k++) {
        const e = R.edgeAt(k), w0 = word(e - 0.5), w1 = word(e + 25), m = mv[k];
        F.count('edges');
        const extra = m === 1 ? ' RI = ' + ins.RI[k] + ' enters Q0.' : m === 2 ? ' LI = ' + ins.LI[k] + ' enters Q3.' : m === 3 ? ' I0..I3 = ' + inp.i + '.' : '';
        F.add({ items: scene(e - 0.5, ['m0', 'm1', 'm2', 'm3']), say: 'Before edge ' + (k + 1) + ': S1 S0 = ' + (m >> 1) + ' ' + (m & 1) + ', ' + MODES[m] + '. Q0..Q3 = ' + w0 + '.' + extra, meta: { ask: k > 0, w: w1, opts: [...new Set([w1, w0, ins.RI[k] + w0.slice(0, 3), w0.slice(1) + ins.LI[k], inp.i])] } });
        claimWord(R, e + 25, Q, [w0, ins.RI[k] + w0.slice(0, 3), w0.slice(1) + ins.LI[k], inp.i][m]);
        F.add({ items: scene(e + 25, ['f0', 'f1', 'f2', 'f3']), say: 'Edge ' + (k + 1) + ', ' + MODES[m] + ': Q0..Q3 = ' + w1 + '.' });
      }
      F.add({ items: scene(end), mark: 'end', say: 'One register, four behaviours, chosen edge by edge with two control lines. Chips like this are the building block of serial-to-parallel converters, rotators and simple arithmetic.' });
      return { frames: F.list, def: { sections: [{ id: 'd', kind: 'math', title: 'Modes', text: ['S1 S0 = 0 0  hold', '        0 1  shift right (RI → Q0)', '        1 0  shift left  (LI → Q3)', '        1 1  load I'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => fr[i].meta.opts.slice(0, 4).sort(), ask: 'Q0..Q3 after this edge?', answer: (fr, i) => fr[i].meta.w, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'A universal shift register with mode 00 at an edge…', options: ['clears', 'holds', 'loads', 'shifts right'], answer: 1, why: 'Each multiplexer passes the flip-flop\'s own Q.' },
      { q: 'How many inputs does each multiplexer of a 4-mode universal shift register need?', options: ['2', '3', '4', '8'], answer: 2, why: 'One per mode: hold, right, left, load.' },
      { q: 'Q0..Q3 = 1000 and the mode is "shift left" (toward Q0) with LI = 1. After the edge…', options: ['0001', '1100', '0100', '0001 then 1000'], answer: 0, why: 'Each bit takes its right neighbour; LI enters Q3: Q0..Q3 = 0001.' },
      { q: 'What connects the multiplexers of neighbouring bits?', options: ['Nothing', 'Each Q goes to the shift-right input of the bit after and the shift-left input of the bit before', 'The clock only', 'The parallel inputs'], answer: 1, why: 'That is how a bit can move either way.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
