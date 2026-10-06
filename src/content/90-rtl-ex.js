// Part 9, register-transfer design and ASM charts: the exercises. The lessons, the tour and the course are in
// 90-rtl.js. Register values after a number of clocks are worked out here by running the chart with Sirkit.Asm.run
// when this file loads, and the hidden Verilog testbenches compare against values the engines computed, so the
// text, the checks and the charts always agree. The small charts below are our own; the worked designs are the
// project's examples (Sirkit.Asm.examples).
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.exercises.has('rtl-ex-copy')) return;
  const A = S.Asm, F = S.Fsm;

  C.chapter({ id: 'rtl-asm', part: 'rtl', n: 1, title: 'Transfers and ASM charts', blurb: 'Registers and the transfers between them, the ASM chart that says which transfers happen in which clock, and what one clock edge does.' });
  C.chapter({ id: 'rtl-control', part: 'rtl', n: 2, title: 'Datapath and controller', blurb: 'Every design splits into registers that do the work and a controller that says when; the controller built three ways, and the whole design in Verilog.' });
  C.chapter({ id: 'rtl-designs', part: 'rtl', n: 3, title: 'Worked designs', blurb: 'A multiplier, a divider, a GCD engine, a traffic light and a coin controller, run one clock at a time.' });

  // ---- charts of our own, shared with the lessons (90-rtl.js) ---------------------------------------------------
  const R = (S.RtlContent = S.RtlContent || {});
  /** sum 1 + 2 + … + N: S accumulates while N counts down */
  R.sum = () => A.chart({
    name: 'sumto', inputs: ['START'], dataInputs: { NIN: 4 }, registers: { N: 4, S: 7 }, outputs: ['READY'], status: { Z: 'N == 0' },
    states: {
      IDLE: { actions: ['READY'], next: { if: 'START', then: { do: ['N ← NIN', 'S ← 0'], then: 'ADD' }, else: 'IDLE' } },
      ADD: { actions: [], next: { if: 'Z', then: 'IDLE', else: { do: ['S ← S + N', 'N ← N - 1'], then: 'ADD' } } },
    },
  });
  /** count the 1s of a byte: shift R right, add its low bit into C, stop when R is 0 */
  R.ones = () => A.chart({
    name: 'ones', inputs: ['START'], dataInputs: { RIN: 8 }, registers: { R: 8, C: 4 }, outputs: ['READY'], status: { Z: 'R == 0', B: 'R[0]' },
    states: {
      IDLE: { actions: ['READY'], next: { if: 'START', then: { do: ['R ← RIN', 'C ← 0'], then: 'SCAN' }, else: 'IDLE' } },
      SCAN: { actions: [], next: { if: 'Z', then: 'IDLE', else: { do: ['R ← R >> 1'], then: { if: 'B', then: { do: ['C ← C + 1'], then: 'SCAN' }, else: 'SCAN' } } } },
    },
  });
  /** a pulse stretcher: GO starts it, BUSY stays 1 while T counts; the test reads T before the edge */
  R.timer = () => A.chart({
    name: 'timer', inputs: ['GO'], registers: { T: 3 }, outputs: ['BUSY'], status: { END: 'T == 3' },
    states: {
      IDLE: { actions: [], next: { if: 'GO', then: { do: ['T ← 0'], then: 'RUN' }, else: 'IDLE' } },
      RUN: { actions: ['BUSY', 'T ← T + 1'], next: { if: 'END', then: 'IDLE', else: 'RUN' } },
    },
  });
  /** a list of transfers, one block per clock */
  R.steps = (regs, list, init) => {
    const states = {};
    list.forEach((acts, i) => { states['T' + (i + 1)] = { actions: [].concat(acts), next: 'T' + (i + 2) }; });
    states['T' + (list.length + 1)] = { actions: [], next: 'T' + (list.length + 1) };
    return A.chart({ name: 'steps', inputs: [], registers: regs, outputs: [], status: {}, states, start: 'T1' });
  };
  /** the multiplier's controller as a state machine: START and Z in, READY, DEC (P ← P − 1) and SHR (shift) out */
  R.MCTL = 'moore\ninputs START Z\noutputs READY DEC SHR\nstart IDLE\nIDLE/100: 00 -> IDLE, 01 -> IDLE, 10 -> ADD, 11 -> ADD\nADD/010: 00 -> SHIFT, 01 -> SHIFT, 10 -> SHIFT, 11 -> SHIFT\nSHIFT/001: 00 -> ADD, 01 -> IDLE, 10 -> ADD, 11 -> IDLE';
  /** the same controller as gates: IDLE = 00, ADD = 01, SHIFT = 10 */
  /** the same, with G for START: the equation checker reads one-letter input names */
  /**
   * The same controller with its rows listed ADD, SHIFT, IDLE, for exercises that draw its diagram (states go round a
   * circle in the order listed, and this order keeps the labels clear), and with G for START, since the equation
   * checker reads one-letter input names. Its codes are given explicitly, so the order does not change them.
   */
  R.MCTL_D = (g) => { const L = R.MCTL.replace('inputs START Z', g ? 'inputs G Z' : 'inputs START Z').split('\n'); return L.slice(0, 4).concat([L[5], L[6], L[4]]).join('\n'); };
  R.MCTL_G = R.MCTL_D(true);
  R.MCTL_CODES = { IDLE: '00', ADD: '01', SHIFT: '10' };
  R.MCTL_C = 'q1 = DFF(q0)\nnz = NOT(Z)\nnq1 = NOT(q1)\nnq0 = NOT(q0)\na1 = AND(q1, nz)\na2 = AND(nq1, nq0, START)\nd0 = OR(a1, a2)\nq0 = DFF(d0)\nREADY = NOR(q1, q0)\nDEC = BUF(q0)\nSHR = BUF(q1)';
  R.GCDCTL_G = 'moore\ninputs G E\noutputs READY\nstart IDLE\nIDLE/1: 00 -> IDLE, 01 -> IDLE, 10 -> CMP, 11 -> CMP\nCMP/0: 00 -> CMP, 01 -> IDLE, 10 -> CMP, 11 -> IDLE';
  R.GCDCTL_C = 'ne = NOT(E)\nnq = NOT(q)\na1 = AND(q, ne)\na2 = AND(nq, G)\nd = OR(a1, a2)\nq = DFF(d)\nREADY = NOT(q)';
  R.SUMCTL = 'moore\ninputs START Z\noutputs READY\nstart IDLE\nIDLE/1: 00 -> IDLE, 01 -> IDLE, 10 -> ADD, 11 -> ADD\nADD/0: 00 -> ADD, 01 -> IDLE, 10 -> ADD, 11 -> IDLE';
  R.GCDCTL = 'moore\ninputs START EQ\noutputs READY\nstart IDLE\nIDLE/1: 00 -> IDLE, 01 -> IDLE, 10 -> CMP, 11 -> CMP\nCMP/0: 00 -> CMP, 01 -> IDLE, 10 -> CMP, 11 -> IDLE';

  const ex = (o) => C.exercise(o);
  const bin = (v, n) => v.toString(2).padStart(n, '0');
  const after = (ch, inputs, n, regs) => A.run(ch, { inputs, maxCycles: n, regs });
  /** START = 1 in the first clock only, with the data inputs held */
  const startWith = (data) => (k) => Object.assign({ START: k === 0 ? 1 : 0 }, data);
  /** the clock (counting the START clock as 1) in which the chart is back in its start state */
  const backAt = (ch, inputs) => { const r = A.run(ch, { inputs, maxCycles: 200 }); const k = r.trace.findIndex((t, i) => i > 0 && t.state === ch.start); return { k: k + 1, trace: r.trace }; };
  const chartText = (lines) => ({ math: lines.join('\n') });
  const SUM_TEXT = chartText(['IDLE:  READY', '       if START: N ← NIN, S ← 0; go to ADD', 'ADD:   if Z (N = 0): go to IDLE', '       else: S ← S + N, N ← N − 1; stay in ADD']);
  const ONES_TEXT = chartText(['IDLE:  READY', '       if START: R ← RIN, C ← 0; go to SCAN', 'SCAN:  if Z (R = 0): go to IDLE', '       else: R ← R >> 1, and if B (R[0] = 1): C ← C + 1', '       stay in SCAN']);
  const TIMER_TEXT = chartText(['IDLE:  if GO: T ← 0; go to RUN', 'RUN:   BUSY, T ← T + 1', '       if END (T = 3): go to IDLE, else stay in RUN']);

  // ===========================================================================================================
  // Chapter 1: transfers and ASM charts
  // ===========================================================================================================
  {
    const ch = R.steps({ R1: 8, R2: 8 }, ['R1 ← 6', 'R2 ← R1 + 3', 'R1 ← R1 + R2']), r = after(ch, {}, 3);
    ex({
      id: 'rtl-ex-copy', chapter: 'rtl-asm', title: 'Three transfers, three clocks', level: 1, kind: 'number',
      text: ['Two 8-bit registers start at 0. One transfer happens per clock:', { math: 'clock 1:  R1 ← 6\nclock 2:  R2 ← R1 + 3\nclock 3:  R1 ← R1 + R2' }, 'What does R1 hold after the third clock edge?'],
      answer: r.regs.R1, higherLower: true,
      hints: ['A transfer copies: the source keeps its value.', 'After clock 2, R1 = 6 and R2 = 9.', 'Clock 3 adds them: R1 = 6 + 9 = ' + r.regs.R1 + '.'],
      solution: r.regs.R1, wrong: [12, 9], why: 'After the three edges R1 = ' + r.regs.R1 + ' and R2 = ' + r.regs.R2 + '.',
    });
  }
  {
    const ch = R.steps({ A: 8, B: 8 }, [['A ← B', 'B ← A']]), r = after(ch, {}, 1, { A: 5, B: 9 });
    const opts = ['A = 9, B = 5', 'A = 9, B = 9', 'A = 5, B = 5', 'A = 5, B = 9'];
    const ans = opts.indexOf('A = ' + r.regs.A + ', B = ' + r.regs.B);
    ex({
      id: 'rtl-ex-swap', chapter: 'rtl-asm', title: 'Two transfers in one clock', level: 2, kind: 'choice',
      text: ['A = 5 and B = 9. One ASM block holds both transfers A ← B and B ← A, so they happen at the same clock edge. What do the registers hold after that edge?'],
      options: opts, answer: ans,
      whyNot: { 1: 'That is what happens if B ← A reads the new A. It does not: every transfer reads the values from before the edge.', 2: 'A ← B reads B = 9, so A becomes 9.', 3: 'The edge does load both registers.' },
      hints: ['All the transfers of a clock are worked out from the values before the edge, and written together at the edge.', 'A ← B computes 9; B ← A computes 5; then both are written.', 'A = ' + r.regs.A + ', B = ' + r.regs.B + ': a swap in one clock, with no temporary register.'],
      solution: ans, wrong: [1, 2],
      why: 'In software a swap needs a temporary; with registers clocked together it does not.',
    });
  }
  {
    const ch = R.steps({ C: 1, A: 4, Q: 4 }, ['{C, A, Q} ← {C, A, Q} >> 1']), r = after(ch, {}, 1, { C: 1, A: 6, Q: 11 });
    ex({
      id: 'rtl-ex-shift-cat', chapter: 'rtl-asm', title: 'Shifting joined registers', level: 2, kind: 'number',
      text: ['C is 1 bit, A and Q are 4 bits each. Before the edge C = 1, A = 0110 and Q = 1011. The transfer is', { math: '{C, A, Q} ← {C, A, Q} >> 1' }, 'which treats C, A and Q as one 9-bit register and shifts it right, a 0 entering at the left. What is A after the edge (as a decimal number)?'],
      answer: r.regs.A, higherLower: true,
      hints: ['Write the 9 bits side by side: 1 0110 1011.', 'Shift right by one: 0 1011 0101. The low bit of A moves into Q, and C moves into A.', 'C = ' + r.regs.C + ', A = ' + bin(r.regs.A, 4) + ' = ' + r.regs.A + ', Q = ' + bin(r.regs.Q, 4) + '.'],
      solution: r.regs.A, wrong: [3, 5], why: 'A = ' + bin(r.regs.A, 4) + ' and Q = ' + bin(r.regs.Q, 4) + '.',
    });
  }
  ex({
    id: 'rtl-ex-cond-transfer', chapter: 'rtl-asm', title: 'A transfer with a condition', level: 1, kind: 'choice',
    text: ['A controller description says: T_ADD · Q0:  {C, A} ← A + M. When does the transfer happen?'],
    options: ['At the clock edge that ends a clock in which the controller is in ADD and Q0 = 1', 'Whenever Q0 changes', 'In every clock in ADD', 'Only when C = 1'],
    answer: 0,
    whyNot: { 1: 'Registers change only at a clock edge; the condition only enables the load.', 2: 'The Q0 term means it also needs Q0 = 1: it sits in a conditional box under a decision on Q0.', 3: 'C is the destination, not a condition.' },
    hints: ['The part before the colon is the control condition that enables the load.', 'T_ADD is 1 during the clocks spent in ADD; Q0 is the low bit of Q, a status signal.', 'Both must be 1 during the clock; the load then happens at the edge that ends it.'],
    solution: 0, wrong: [1, 2],
  });
  {
    const ch = R.timer(), r = A.run(ch, { inputs: (k) => ({ GO: k === 0 ? 1 : 0 }), maxCycles: 12 });
    const busy = r.outputsLog.filter((o) => o.includes('BUSY')).length;
    ex({
      id: 'rtl-ex-timer-busy', chapter: 'rtl-asm', title: 'How long does BUSY last?', level: 2, kind: 'number',
      text: ['A pulse stretcher has a 3-bit register T and this chart:', TIMER_TEXT, 'BUSY and T ← T + 1 are in RUN\'s state box; the decision on END is in the same block. GO is 1 in the first clock only. For how many clocks is BUSY 1?'],
      answer: busy, higherLower: true,
      hints: ['The decision reads T as it is during the clock, before the edge writes T + 1.', 'In RUN, T is 0, 1, 2 and then 3 in successive clocks; only in the clock where T = 3 does END = 1.', 'BUSY is 1 for ' + busy + ' clocks, not 3: the test sees the old value of T.'],
      solution: busy, wrong: [3, 5], why: 'A decision in the same block as a transfer sees the register before that transfer.',
    });
  }
  {
    const ch = R.sum(), r = after(ch, startWith({ NIN: 6 }), 4);
    ex({
      id: 'rtl-ex-sum-s', chapter: 'rtl-asm', title: 'Run a summing chart', level: 2, kind: 'number',
      text: ['This chart adds 1 + 2 + … + N. N is 4 bits, S is 7 bits, and Z = (N = 0).', SUM_TEXT, 'START = 1 with NIN = 6 in the first clock. What is S after the fourth clock edge?'],
      answer: r.regs.S, higherLower: true,
      hints: ['Clock 1 (IDLE) loads N = 6 and S = 0.', 'Each clock in ADD adds N into S and counts N down, both from the values before the edge.', 'Clocks 2, 3, 4 add 6, 5, 4: S = ' + r.regs.S + ' (and N = ' + r.regs.N + ').'],
      solution: r.regs.S, wrong: [21, 11], why: 'The trace: ' + r.trace.map((t) => t.state + (t.changes.length ? ' (' + t.changes.map((c) => c.reg + ' = ' + c.to).join(', ') + ')' : '')).join('; ') + '.',
    });
  }
  {
    const b = backAt(R.sum(), startWith({ NIN: 6 }));
    ex({
      id: 'rtl-ex-sum-clocks', chapter: 'rtl-asm', title: 'When is the sum ready?', level: 2, kind: 'number',
      text: ['The same summing chart, with NIN = 6.', SUM_TEXT, 'Count the clock in which START = 1 as clock 1. In which clock is the chart in IDLE again, with READY = 1?'],
      answer: b.k, higherLower: true,
      hints: ['After the START clock, ADD runs once for each of N = 6, 5, 4, 3, 2, 1: clocks 2 to 7.', 'Clock 8 is spent in ADD too: it finds N = 0 and its edge goes to IDLE.', 'So the chart is in IDLE again in clock ' + b.k + '.'],
      solution: b.k, wrong: [b.k - 1, b.k + 1], why: 'A sum of N terms keeps the chart busy for N + 2 clocks, so READY returns in clock N + 3.',
    });
  }
  {
    const v = 0b11010110, ch = R.ones(), r = after(ch, startWith({ RIN: v }), 6);
    ex({
      id: 'rtl-ex-ones-c', chapter: 'rtl-asm', title: 'Counting ones, part way', level: 3, kind: 'number',
      text: ['This chart counts the 1s in a byte. Z = (R = 0) and B = R[0], the bit about to fall off.', ONES_TEXT, 'START = 1 in the first clock with RIN = ' + bin(v, 8) + '. What does C hold after the sixth clock edge?'],
      answer: r.regs.C, higherLower: true,
      hints: ['Clock 1 loads R; each later clock looks at R[0] before the shift and adds it into C.', 'Clocks 2 to 6 look at the five lowest bits of RIN, from the right: 0, 1, 1, 0, 1.', 'C = ' + r.regs.C + ' after clock 6 (R = ' + bin(r.regs.R, 8) + ').'],
      solution: r.regs.C, wrong: [5, r.regs.C + 1], why: 'The full run counts ' + A.run(ch, { inputs: startWith({ RIN: v }), maxCycles: 20 }).regs.C + ' ones.',
    });
  }
  {
    const opts = ['In IDLE both X ← XIN and X ← YIN write X in the same clock, and Y is never loaded', 'CMP\'s state box clears Y in every clock, on the same path as Y ← Y − X', 'The decision on EQ must come after the decision on LT', 'IDLE should not assert READY'];
    ex({
      id: 'rtl-ex-broken', chapter: 'rtl-asm', title: 'What is wrong with this chart?', level: 2, kind: 'choice',
      text: ['This chart is meant to find the GCD of two numbers by repeated subtraction, but it breaks the rules of an ASM chart. Choose every mistake.', chartText(['IDLE:  READY', '       if START: X ← XIN, X ← YIN; go to CMP', 'CMP:   Y ← 0', '       if EQ: go to IDLE', '       else if LT: Y ← Y − X; stay', '       else: X ← X − Y; stay'])],
      options: opts, answer: [0, 1],
      hints: ['A register may be written at most once on any path through one block: two writes at one edge cannot both win.', 'Look at every path through IDLE and through CMP, and list the registers written on it.', 'IDLE writes X twice (the second should be Y ← YIN); CMP writes Y in its state box and again in a conditional box. The order of the decisions and READY are fine.'],
      solution: [0, 1], wrong: [[0], [0, 1, 2]],
      why: 'The checker of the chart reports the same two problems: X written twice in IDLE, Y twice in CMP.',
    });
  }

  // ===========================================================================================================
  // Chapter 2: datapath and controller
  // ===========================================================================================================
  {
    const n = A.states(A.examples.divider()).length;
    ex({
      id: 'rtl-ex-ff-onehot', chapter: 'rtl-control', title: 'Flip-flops for a one-hot controller', level: 1, kind: 'choice',
      text: ['The divider\'s controller has the states IDLE, SHIFT, SUB and TEST. How many flip-flops does it need if it is built with one flip-flop per state, and how many with a state register and a decoder?'],
      options: ['one-hot: ' + n + ', register and decoder: 2', 'one-hot: 2, register and decoder: ' + n, 'one-hot: ' + n + ', register and decoder: ' + n, 'one-hot: 3, register and decoder: 2'],
      answer: 0,
      whyNot: { 1: 'That is the wrong way round: one-hot spends a flip-flop on every state.', 2: 'A state register holds a code: ' + n + ' states fit in 2 bits.', 3: 'One-hot means exactly one flip-flop per state.' },
      hints: ['One-hot: one flip-flop per state.', 'A binary state register needs ⌈log₂ n⌉ flip-flops.', n + ' states: ' + n + ' flip-flops one-hot, 2 with a register and a 2-to-4 decoder.'],
      solution: 0, wrong: [1, 2], why: 'One-hot saves the decoder; the register saves flip-flops.',
    });
  }
  ex({
    id: 'rtl-ex-sum-ctl', chapter: 'rtl-control', title: 'The summing chart\'s controller', level: 2, kind: 'fsm', machine: R.SUMCTL, stage: 'table',
    text: ['Take the summing chart and keep only what the controller needs: its states, the signals its decisions test, and its outputs. The decisions test START (an input) and Z (a status signal from the datapath, N = 0); the only output is READY, which belongs to IDLE.', SUM_TEXT, 'Write the controller as a Moore machine with inputs START and Z (columns 00, 01, 10, 11 for START Z).'],
    hints: ['IDLE ignores Z; ADD ignores START.', 'IDLE goes to ADD when START = 1; ADD goes to IDLE when Z = 1.', 'IDLE/1: 00 → IDLE, 01 → IDLE, 10 → ADD, 11 → ADD; ADD/0: 00 → ADD, 01 → IDLE, 10 → ADD, 11 → IDLE.'],
    solution: R.SUMCTL,
    wrong: [R.SUMCTL.replace('ADD/0: 00 -> ADD, 01 -> IDLE, 10 -> ADD, 11 -> IDLE', 'ADD/0: 00 -> ADD, 01 -> IDLE, 10 -> ADD, 11 -> ADD'), R.SUMCTL.replace('IDLE/1', 'IDLE/0'), R.SUMCTL.replace('IDLE/1: 00 -> IDLE, 01 -> IDLE', 'IDLE/1: 00 -> IDLE, 01 -> ADD')],
  });
  {
    const d = F.design(F.parse(R.GCDCTL_G), { ff: 'D', assign: 'binary' }), tr = {};
    for (const r of d.rows) { tr[r.state + '|' + r.input + '|next'] = r.nextCode; tr[r.state + '|' + r.input + '|out'] = r.out; }
    ex({
      id: 'rtl-ex-gcd-ctl', chapter: 'rtl-control', title: 'The GCD engine\'s controller', level: 1, kind: 'fsm', machine: R.GCDCTL_G, stages: ['transition', 'equations'], design: { ff: 'D', assign: 'binary' }, minimal: true,
      text: ['The GCD engine\'s controller has two states: IDLE (READY = 1) waits for G (the START input), and CMP stays until E (the status X = Y) is 1. The subtractions are the datapath\'s business: the controller only says which state it is in.', 'With one D flip-flop Q0 (IDLE = 0, CMP = 1), fill in the transition table, then write minimal equations for D0 and READY.'],
      hints: ['The next state is CMP (1) from IDLE when G = 1, and from CMP when E = 0.', 'D0 = Q0′G + Q0E′. READY is 1 in IDLE.', "D0 = Q0E′ + Q0′G, READY = Q0′."],
      solution: { transition: tr, equations: "D0 = Q0E' + Q0'G\nREADY = Q0'" },
      wrong: [{ transition: Object.assign({}, tr, { 'CMP|01|next': '1' }) }, { transition: tr, equations: "D0 = Q0'G\nREADY = Q0'" }, { transition: tr, equations: "D0 = Q0E' + Q0'G\nREADY = Q0" }],
    });
  }
  ex({
    id: 'rtl-ex-gcd-ctl-circuit', chapter: 'rtl-control', title: 'Build the GCD controller', level: 2, kind: 'circuit', machine: R.GCDCTL_G, inputs: ['G', 'E'], outputs: ['READY'], depth: 6,
    text: ['Build the GCD engine\'s controller with one D flip-flop and gates: inputs G (start) and E (X = Y), output READY. The flip-flop starts cleared, which must be IDLE.', { table: [['state', 'G E = 00', '01', '10', '11', 'READY'], ['IDLE', 'IDLE', 'IDLE', 'CMP', 'CMP', '1'], ['CMP', 'CMP', 'IDLE', 'CMP', 'IDLE', '0']], caption: 'The controller\'s state table.' }],
    hints: ['IDLE = 0, CMP = 1: D = Q′G + QE′, READY = Q′.', 'Two AND gates, an OR into the flip-flop, and inverters for Q and E.', 'q = DFF(OR(AND(NOT q, G), AND(q, NOT E))); READY = NOT(q).'],
    solution: R.GCDCTL_C,
    wrong: [R.GCDCTL_C.replace('a1 = AND(q, ne)', 'a1 = AND(q, E)'), R.GCDCTL_C.replace('READY = NOT(q)', 'READY = BUF(q)'), R.GCDCTL_C.replace('a2 = AND(nq, G)', 'a2 = AND(q, G)')],
  });
  {
    const ins = { G: '010000010', E: '000001000' }, want = S.Check.waveExpected({ circuit: R.GCDCTL_C, inputs: ins, clocked: true, outputs: ['READY'] });
    ex({
      id: 'rtl-ex-gcd-ctl-wave', chapter: 'rtl-control', title: 'READY over ten clocks', level: 1, kind: 'waveform', circuit: R.GCDCTL_C, inputs: ins, clocked: true, outputs: ['READY'], given: { READY: '1????????' },
      text: ['The GCD controller as a circuit (IDLE = 0, CMP = 1). G is 1 in clocks 2 and 8; E (X = Y) is 1 in clock 6.', { circuit: R.GCDCTL_C, outputs: ['READY'] }, 'Draw READY for the nine clocks (each slot is the value just before that clock\'s rising edge).'],
      hints: ['G in clock 2 moves the controller to CMP at the end of clock 2: READY falls in clock 3.', 'In CMP it waits for E; E in clock 6 sends it back to IDLE at the end of clock 6.', 'READY = ' + want.READY.split('').join(' ') + '.'],
      solution: want, wrong: [{ READY: '100000110' }, { READY: '110001111' }],
    });
  }
  ex({
    id: 'rtl-ex-mult-ctl-table', chapter: 'rtl-control', title: 'The multiplier\'s controller', level: 2, kind: 'fsm', machine: R.MCTL, stage: 'table',
    text: ['The shift-and-add multiplier has three states. IDLE asserts READY and waits for START. ADD counts P down (call that control signal DEC); its conditional add depends on Q0 but does not change the next state. SHIFT shifts (SHR) and goes to IDLE when Z (P = 0), else back to ADD.', 'Write the controller as a Moore machine with inputs START, Z and outputs READY, DEC, SHR (written in that order, like 100).'],
    hints: ['Q0 decides only a conditional box, which is a control signal, not a change of state: leave it out.', 'ADD always goes to SHIFT. SHIFT tests Z.', 'IDLE/100: START → ADD; ADD/010: always SHIFT; SHIFT/001: Z = 1 → IDLE, Z = 0 → ADD.'],
    solution: R.MCTL,
    wrong: [R.MCTL.replace('ADD/010', 'ADD/011'), R.MCTL.replace('SHIFT/001: 00 -> ADD, 01 -> IDLE', 'SHIFT/001: 00 -> IDLE, 01 -> ADD'), R.MCTL.replace('IDLE/100: 00 -> IDLE, 01 -> IDLE, 10 -> ADD, 11 -> ADD', 'IDLE/100: 00 -> IDLE, 01 -> IDLE, 10 -> SHIFT, 11 -> SHIFT')],
  });
  ex({
    id: 'rtl-ex-mult-onehot', chapter: 'rtl-control', title: 'A one-hot controller', level: 2, kind: 'fsm', machine: R.MCTL_G, stage: 'equations', design: { ff: 'D', assign: { IDLE: '100', ADD: '010', SHIFT: '001' } },
    text: ['Build the multiplier\'s controller with one D flip-flop per state: Q2 is 1 in IDLE, Q1 in ADD, Q0 in SHIFT (IDLE = 100, ADD = 010, SHIFT = 001). Here G is the START input. Write the D input of each flip-flop (D2 for Q2, and so on) and the outputs READY, DEC and SHR.', 'Read the equations straight off the chart: each D collects the arrows into its state.'],
    hints: ['Into IDLE: from IDLE with G = 0, and from SHIFT with Z = 1. Into ADD: from IDLE with G = 1, and from SHIFT with Z = 0. Into SHIFT: from ADD, always.', 'Each output is 1 in one state, so it is that state\'s flip-flop.', "D2 = Q2G′ + Q0Z, D1 = Q2G + Q0Z′, D0 = Q1; READY = Q2, DEC = Q1, SHR = Q0."],
    solution: "D2 = Q2G' + Q0Z\nD1 = Q2G + Q0Z'\nD0 = Q1\nREADY = Q2\nDEC = Q1\nSHR = Q0",
    wrong: ["D2 = Q0Z\nD1 = Q2G + Q0Z'\nD0 = Q1\nREADY = Q2\nDEC = Q1\nSHR = Q0", "D2 = Q2G' + Q0Z\nD1 = Q2G\nD0 = Q1\nREADY = Q2\nDEC = Q1\nSHR = Q0", "D2 = Q2G' + Q0Z\nD1 = Q2G + Q0Z'\nD0 = Q1\nREADY = Q2\nDEC = Q0\nSHR = Q1"],
  });
  {
    const d = F.design(F.parse(R.MCTL_G), { ff: 'D', assign: R.MCTL_CODES }), tr = {};
    for (const r of d.rows) { tr[r.state + '|' + r.input + '|next'] = r.nextCode; tr[r.state + '|' + r.input + '|out'] = r.out; }
    ex({
      id: 'rtl-ex-mult-binary', chapter: 'rtl-control', title: 'A state register for the multiplier', level: 2, kind: 'fsm', machine: R.MCTL_G, stages: ['transition', 'equations'], design: { ff: 'D', assign: R.MCTL_CODES }, minimal: true,
      text: ['Now build the same controller with a 2-bit state register: IDLE = 00, ADD = 01, SHIFT = 10 (11 unused). G is the START input. Fill in the transition table (the columns are G Z), then write minimal equations for D1, D0, READY, DEC and SHR over Q1, Q0, G and Z.'],
      hints: ['D1 is 1 only when the next state is SHIFT, which happens exactly from ADD.', 'D0 is 1 when the next state is ADD: from IDLE with G = 1, or from SHIFT with Z = 0. Use the unused code as a don\'t care.', "D1 = Q0, D0 = Q1Z′ + Q1′Q0′G, READY = Q1′Q0′, DEC = Q0, SHR = Q1."],
      solution: { transition: tr, equations: "D1 = Q0\nD0 = Q1Z' + Q1'Q0'G\nREADY = Q1'Q0'\nDEC = Q0\nSHR = Q1" },
      wrong: [{ transition: Object.assign({}, tr, { 'ADD|00|next': '01' }) }, { transition: tr, equations: "D1 = Q0\nD0 = Q1Z' + Q1'Q0'G\nREADY = Q1'\nDEC = Q0\nSHR = Q1" }, { transition: tr, equations: "D1 = Q0\nD0 = Q1Q0'Z' + Q1'Q0'G\nREADY = Q1'Q0'\nDEC = Q0\nSHR = Q1" }],
    });
  }
  {
    const d = F.design(F.parse(R.MCTL_D(false)), { ff: 'JK', assign: R.MCTL_CODES }), sol = {};
    for (const r of d.rows) for (const n of d.stages.excitation.inputs) sol[r.state + '|' + r.input + '|' + n] = r.exc[n];
    ex({
      id: 'rtl-ex-mult-jk', chapter: 'rtl-control', title: 'JK flip-flops for the controller', level: 2, kind: 'fsm', machine: R.MCTL_D(false), stage: 'excitation', design: { ff: 'JK', assign: R.MCTL_CODES },
      text: ['The multiplier\'s controller with codes IDLE = 00, ADD = 01, SHIFT = 10 and JK flip-flops Q1, Q0. Fill in J1, K1, J0, K0 for every state and every input START Z. Write X for a don\'t-care.'],
      hints: ['First write the next code for each row: IDLE → 01 on START, ADD → 10 always, SHIFT → 00 on Z, else 01.', 'Then each bit through the JK excitation table: 0→0: 0X, 0→1: 1X, 1→0: X1, 1→1: X0.', 'In ADD every row is J1 K1 J0 K0 = 1X X1; in SHIFT with Z = 1 it is X1 0X, with Z = 0 X1 1X; in IDLE 0X 0X without START, 0X 1X with it.'],
      solution: sol,
      wrong: [Object.assign({}, sol, { 'ADD|00|K0': '0' }), Object.assign({}, sol, { 'IDLE|10|J0': '0' })],
    });
  }
  {
    const d = F.design(F.parse(R.MCTL), { ff: 'D', assign: 'binary' }), f = d.functions.find((g) => g.name === 'D0');
    ex({
      id: 'rtl-ex-mult-kmap', chapter: 'rtl-control', title: 'The K-map of D0', level: 2, kind: 'kmap', vars: ['Q1', 'Q0', 'START', 'Z'], minterms: f.ones.slice(), dc: f.dc.slice(),
      text: ['The multiplier\'s controller with IDLE = 00, ADD = 01, SHIFT = 10. D0 is 1 when the next state is ADD: from IDLE with START = 1, and from SHIFT with Z = 0. The code 11 is unused.', 'Circle a minimal cover of D0 over Q1, Q0, START, Z.'],
      hints: ['The 1s: Q1Q0 = 00 with START = 1 (two cells, Z either way), and Q1Q0 = 10 with Z = 0 (two cells).', 'The unused row Q1Q0 = 11 is all don\'t cares: use it to grow the SHIFT group.', "D0 = Q1Z′ + Q1′Q0′START."],
      solution: ['1--0', '001-'], wrong: [['10-0', '001-'], ['1--0']],
    });
  }
  ex({
    id: 'rtl-ex-mult-ctl-circuit', chapter: 'rtl-control', title: 'Build the controller', level: 3, kind: 'circuit', machine: R.MCTL, inputs: ['START', 'Z'], outputs: ['READY', 'DEC', 'SHR'], depth: 6,
    text: ['Build the multiplier\'s controller with D flip-flops and gates: inputs START and Z, outputs READY, DEC and SHR. The flip-flops start cleared, which must be IDLE.', 'It is compared clock by clock with the controller\'s state machine on every input sequence of 6 clocks.'],
    hints: ['With IDLE = 00, ADD = 01, SHIFT = 10: D1 = Q0, D0 = Q1Z′ + Q1′Q0′START.', 'READY = (Q1 + Q0)′, DEC = Q0, SHR = Q1. A BUF passes a signal to an output port.', 'q1 = DFF(q0); q0 = DFF(OR(AND(q1, NOT Z), AND(NOT q1, NOT q0, START))); READY = NOR(q1, q0); DEC = BUF(q0); SHR = BUF(q1).'],
    solution: R.MCTL_C,
    wrong: [R.MCTL_C.replace('a1 = AND(q1, nz)', 'a1 = AND(q1, Z)'), R.MCTL_C.replace('READY = NOR(q1, q0)', 'READY = NOT(q0)'), R.MCTL_C.replace('q1 = DFF(q0)', 'q1 = DFF(q1)')],
  });
  const SIG = 'd = DECODER[k=2](a1=Q1, a0=Q0)\nLD = AND(d.y0, G)\nAM = AND(d.y1, B)\nSH = BUF(d.y2)';
  ex({
    id: 'rtl-ex-ctl-signals', chapter: 'rtl-control', title: 'Control signals from the state', level: 2, kind: 'circuit', ref: { LD: "Q1'Q0'G", AM: "Q1'Q0B", SH: "Q1Q0'" }, inputs: ['Q1', 'Q0', 'G', 'B'], outputs: ['LD', 'AM', 'SH'],
    text: ['The multiplier\'s state register holds IDLE = 00, ADD = 01, SHIFT = 10 in Q1 Q0. G is the START input and B is Q0 of the datapath (the multiplier bit). Build the three control signals:', { list: ['LD (load M and Q, clear A, C, P) = 1 in IDLE when G = 1;', 'AM ({C, A} ← A + M) = 1 in ADD when B = 1;', 'SH (shift) = 1 in SHIFT.'] }, 'A 2-to-4 decoder on Q1 Q0 gives one line per state.'],
    hints: ['Wire Q1 to the decoder\'s a1 and Q0 to its a0. Then y0 is 1 for Q1Q0 = 00 (IDLE), y1 for 01 (ADD), y2 for 10 (SHIFT).', 'Each control signal is a state line ANDed with its condition, if it has one.', 'd = DECODER[k=2](a1=Q1, a0=Q0); LD = AND(d.y0, G); AM = AND(d.y1, B); SH = BUF(d.y2).'],
    solution: SIG,
    wrong: [SIG.replace('AM = AND(d.y1, B)', 'AM = BUF(d.y1)'), SIG.replace('SH = BUF(d.y2)', 'SH = BUF(Q1)'), SIG.replace('LD = AND(d.y0, G)', 'LD = AND(d.y1, G)')],
  });
  ex({
    id: 'rtl-ex-zero-detect', chapter: 'rtl-control', title: 'A status signal: P = 0', level: 1, kind: 'circuit', ref: "P2'P1'P0'", inputs: ['P2', 'P1', 'P0'], outputs: ['Z'], maxGates: 1,
    text: ['The counter P of the multiplier has three bits, P2 P1 P0. Build the status signal Z = 1 when P = 0, with a single gate.'],
    hints: ['Z is 1 for one row only, 000.', 'An OR of the bits is 0 only for 000; its complement is what we want.', 'Z = NOR(P2, P1, P0).'],
    solution: 'Z = NOR(P2, P1, P0)', wrong: ['Z = NAND(P2, P1, P0)', 'Z = NOR(P1, P0)', 'n = OR(P2, P1, P0)\nZ = NOT(n)'],
  });
  {
    const ins = { START: '010000000', Z: '000000010' }, want = S.Check.waveExpected({ circuit: R.MCTL_C, inputs: ins, clocked: true, outputs: ['READY', 'SHR'] });
    ex({
      id: 'rtl-ex-ctl-wave', chapter: 'rtl-control', title: 'Watch the controller run', level: 2, kind: 'waveform', circuit: R.MCTL_C, inputs: ins, clocked: true, outputs: ['READY', 'SHR'], given: { READY: '1????????', SHR: '0????????' },
      text: ['The multiplier\'s controller (IDLE = 00, ADD = 01, SHIFT = 10) built from D flip-flops. START is 1 in clock 2 only; the datapath raises Z in clock 8.', { circuit: R.MCTL_C, outputs: ['READY', 'DEC', 'SHR'] }, 'Draw READY and SHR for the nine clocks (each slot is the value just before that clock\'s rising edge).'],
      hints: ['READY is 1 in IDLE, SHR in SHIFT. The state changes at the edge that ends a clock.', 'START in clock 2 sends it to ADD in clock 3; then ADD and SHIFT alternate.', 'READY = ' + want.READY.split('').join(' ') + '; SHR = ' + want.SHR.split('').join(' ') + '.'],
      solution: want, wrong: [{ READY: '100000001', SHR: '001010101' }, { READY: '110000000', SHR: '000101010' }],
    });
  }
  {
    const t = S.Check.timingAnswer({ circuit: R.MCTL_C, tech: 'CMOS', ask: 'fmax', outputs: ['READY', 'DEC', 'SHR'] }).value;
    ex({
      id: 'rtl-ex-ctl-fmax', chapter: 'rtl-control', title: 'How fast can the controller go?', level: 2, kind: 'timing', circuit: R.MCTL_C, outputs: ['READY', 'DEC', 'SHR'], tech: 'CMOS', ask: 'fmax',
      text: ['The multiplier\'s controller from the last exercise, with the CMOS preset timing. Considering only the controller, what is its maximum clock frequency in MHz?', { circuit: R.MCTL_C, outputs: ['READY', 'DEC', 'SHR'] }],
      hints: ['The period covers clock-to-Q, the slowest path from a flip-flop to a D input, and the setup time.', 'The slowest path: q1 → NOT → the three-input AND → OR → D0.', 'Clock-to-Q 14 ns, NOT 8, a three-input AND 11, OR 10, setup 12: 55 ns, about ' + t + ' MHz.'],
      solution: t, wrong: [25, 10],
    });
  }
  ex({
    id: 'rtl-ex-seq-counter', chapter: 'rtl-control', title: 'When does a sequence counter fit?', level: 2, kind: 'choice',
    text: ['A sequence counter controller holds the state in a counter: most clocks it counts up to the next state, and only some arrows need a load or a clear. For which chart is it the best fit?'],
    options: ['A chart whose states mostly follow one another in a fixed order, like fetch, decode, execute', 'A chart where every state can go to any other state depending on many inputs', 'A chart with one state', 'Any chart with more than eight states'],
    answer: 0,
    whyNot: { 1: 'Then nearly every arrow needs a load, and the counter brings nothing.', 2: 'One state needs no counter at all.', 3: 'The size does not matter; the shape of the arrows does.' },
    hints: ['A counter makes the arrow "to the next state in order" free.', 'Every other arrow costs a load (or a clear) and its logic.', 'It suits long runs of states taken one after another, such as the steps of an instruction cycle.'],
    solution: 0, wrong: [1, 3],
  });
  // ---- Verilog: testbenches built from runs of the charts --------------------------------------------------------
  /** a testbench that drives inputs per clock and checks outputs per clock against strings the engine produced */
  const clockTb = (mod, ports, ins, outs) => {
    const n = Object.values(ins)[0].length, decl = Object.keys(ins).map((k) => k.toLowerCase()), od = Object.keys(outs).map((k) => k.toLowerCase());
    const lines = ['module tb;', '  reg clk = 0, reset = 1; reg ' + decl.join(', ') + '; wire ' + od.join(', ') + ';', '  ' + mod + ' u(.clk(clk), .reset(reset), ' + ports + ');', '  always #5 clk = ~clk;', '  initial begin', '    ' + decl.map((d) => d + ' = 0;').join(' '), '    @(negedge clk); reset = 0;'];
    for (let k = 0; k < n; k++) {
      lines.push('    ' + Object.keys(ins).map((i) => i.toLowerCase() + ' = ' + ins[i][k] + ';').join(' ') + ' #2;');
      for (const [o, s] of Object.entries(outs)) lines.push('    if (' + o.toLowerCase() + ' !== 1\'b' + s[k] + ') $display("FAIL clock ' + (k + 1) + ' (' + Object.keys(ins).map((i) => i.toLowerCase() + ' = ' + ins[i][k]).join(', ') + '): ' + o.toLowerCase() + ' = %b, expected ' + s[k] + '", ' + o.toLowerCase() + ');');
      lines.push('    @(negedge clk);');
    }
    lines.push('    $display("DONE");', '    $finish;', '  end', 'endmodule');
    return lines.join('\n');
  };
  {
    const go = '0100000001000000';
    const r = A.run(R.timer(), { inputs: (k) => ({ GO: +go[k] }), maxCycles: go.length });
    const busy = r.outputsLog.map((o) => (o.includes('BUSY') ? '1' : '0')).join('');
    const V = 'module timer(input clk, input reset, input go, output busy);\n  localparam IDLE = 1\'b0, RUN = 1\'b1;\n  reg state;\n  reg [2:0] t;\n  always @(posedge clk or posedge reset)\n    if (reset) state <= IDLE;\n    else case (state)\n      IDLE: if (go) begin t <= 0; state <= RUN; end\n      RUN: begin t <= t + 1; if (t == 3) state <= IDLE; end\n    endcase\n  assign busy = (state == RUN);\nendmodule\n';
    ex({
      id: 'rtl-ex-vlog-timer', chapter: 'rtl-control', title: 'The pulse stretcher in Verilog', level: 2, kind: 'verilog', module: 'timer', ports: 'input clk, reset, go; output busy', synth: true, pass: 'DONE',
      start: 'module timer(input clk, input reset, input go, output busy);\n\nendmodule\n',
      testbench: clockTb('timer', '.go(go), .busy(busy)', { GO: go }, { BUSY: busy }),
      text: ['Write module timer from this chart. reset = 1 puts it in IDLE. T is a 3-bit register; busy is 1 in RUN.', TIMER_TEXT, 'The testbench pulses go twice and checks busy in every clock, against a run of the chart.'],
      hints: ['A state register with two states, and T, both updated in one always block on posedge clk.', 'In RUN: t <= t + 1, and if (t == 3) go to IDLE. The test reads the old t, exactly like the chart.', 'IDLE: if (go) begin t <= 0; state <= RUN; end  RUN: begin t <= t + 1; if (t == 3) state <= IDLE; end; assign busy = (state == RUN).'],
      solution: V,
      wrong: [V.replace('if (t == 3) state <= IDLE;', 'if (t == 2) state <= IDLE;'), V.replace('assign busy = (state == RUN);', 'assign busy = go;')],
    });
  }
  {
    const START = '0100000001000000000', Z = '0000000100000000100';
    const m = F.parse(R.MCTL), syms = START.split('').map((s, k) => s + Z[k]), run = F.run(m, syms);
    const outs = { READY: '', DEC: '', SHR: '' };
    run.states.slice(0, syms.length).forEach((s) => { const o = m.out[s]; outs.READY += o[0]; outs.DEC += o[1]; outs.SHR += o[2]; });
    const V = 'module mctl(input clk, input reset, input start, input z, output ready, output dec, output shr);\n  localparam IDLE = 2\'d0, ADD = 2\'d1, SHIFT = 2\'d2;\n  reg [1:0] state;\n  always @(posedge clk or posedge reset)\n    if (reset) state <= IDLE;\n    else case (state)\n      IDLE: if (start) state <= ADD;\n      ADD: state <= SHIFT;\n      SHIFT: state <= z ? IDLE : ADD;\n      default: state <= IDLE;\n    endcase\n  assign ready = (state == IDLE);\n  assign dec = (state == ADD);\n  assign shr = (state == SHIFT);\nendmodule\n';
    ex({
      id: 'rtl-ex-vlog-ctl', chapter: 'rtl-control', title: 'The multiplier\'s controller in Verilog', level: 2, kind: 'verilog', module: 'mctl', ports: 'input clk, reset, start, z; output ready, dec, shr', synth: true, pass: 'DONE',
      start: 'module mctl(input clk, input reset, input start, input z, output ready, output dec, output shr);\n\nendmodule\n',
      testbench: clockTb('mctl', '.start(start), .z(z), .ready(ready), .dec(dec), .shr(shr)', { START, Z }, outs),
      text: ['Write the multiplier\'s controller alone, as a Moore machine: IDLE (ready = 1) waits for start; ADD (dec = 1) always goes to SHIFT; SHIFT (shr = 1) goes to IDLE when z = 1, else back to ADD. reset = 1 puts it in IDLE.', 'The testbench drives start and z and compares the three outputs in every clock with a run of the state machine.'],
      hints: ['Three states in a 2-bit register, a case on the state in an always block on posedge clk.', 'The outputs depend on the state only: three continuous assignments comparing the state with a constant.', 'IDLE: if (start) state <= ADD; ADD: state <= SHIFT; SHIFT: state <= z ? IDLE : ADD; assign ready = (state == IDLE); dec and shr likewise.'],
      solution: V,
      wrong: [V.replace('SHIFT: state <= z ? IDLE : ADD;', 'SHIFT: state <= z ? ADD : IDLE;'), V.replace('assign dec = (state == ADD);', 'assign dec = (state == SHIFT);')],
    });
  }
  /** a testbench that starts a design on each case, waits for ready, and checks one register */
  const doneTb = (mod, ports, cases, check) => {
    const lines = ['module tb;', '  reg clk = 0, reset = 1, start = 0; integer k;'].concat(ports.decl, ['  ' + mod + ' u(.clk(clk), .reset(reset), .start(start), ' + ports.conn + ');', '  always #5 clk = ~clk;', '  initial begin', '    @(negedge clk); reset = 0;']);
    for (const c of cases) {
      lines.push('    ' + c.set + ' start = 1; @(negedge clk); start = 0;');
      lines.push('    for (k = 0; k < 60 && !ready; k = k + 1) @(negedge clk);');
      lines.push('    if (!ready) $display("FAIL ' + c.label + ': ready never came back");');
      lines.push('    else if (' + check.got + ' !== ' + c.want + ') $display("FAIL ' + c.label + ': ' + check.name + ' = %0d, expected ' + c.want + '", ' + check.got + ');');
      lines.push('    @(negedge clk);');
    }
    lines.push('    $display("DONE");', '    $finish;', '  end', 'endmodule');
    return lines.join('\n');
  };
  {
    const ns = [6, 1, 0, 15, 9];
    const cases = ns.map((n) => ({ label: 'N = ' + n, set: 'nin = ' + n + ';', want: A.run(R.sum(), { inputs: startWith({ NIN: n }), maxCycles: 40 }).regs.S }));
    const V = 'module sumto(input clk, input reset, input start, input [3:0] nin, output reg [6:0] s, output ready);\n  localparam IDLE = 1\'b0, ADD = 1\'b1;\n  reg state;\n  reg [3:0] n;\n  always @(posedge clk or posedge reset)\n    if (reset) state <= IDLE;\n    else case (state)\n      IDLE: if (start) begin n <= nin; s <= 0; state <= ADD; end\n      ADD: if (n == 0) state <= IDLE;\n           else begin s <= s + n; n <= n - 1; end\n    endcase\n  assign ready = (state == IDLE);\nendmodule\n';
    ex({
      id: 'rtl-ex-vlog-sum', chapter: 'rtl-control', title: 'The summing chart in Verilog', level: 2, kind: 'verilog', module: 'sumto', ports: 'input clk, reset, start, input [3:0] nin; output [6:0] s; output ready', synth: true, pass: 'DONE',
      start: 'module sumto(input clk, input reset, input start, input [3:0] nin, output reg [6:0] s, output ready);\n\nendmodule\n',
      testbench: doneTb('sumto', { decl: ['  reg [3:0] nin; wire [6:0] s; wire ready;'], conn: '.nin(nin), .s(s), .ready(ready)' }, cases, { got: 's', name: 's' }),
      text: ['Write module sumto from the summing chart: start loads N from nin and clears S; then each clock adds N into S and counts N down; when N = 0 it returns to IDLE, where ready = 1.', SUM_TEXT, 'The testbench starts it with several values of nin, waits for ready, and checks s.'],
      hints: ['Two states and two registers, n and s, all in one always block on posedge clk.', 'In ADD: if (n == 0) go to IDLE; else s <= s + n and n <= n − 1, both reading the old n.', 'IDLE: if (start) begin n <= nin; s <= 0; state <= ADD; end  ADD: if (n == 0) state <= IDLE; else begin s <= s + n; n <= n - 1; end; assign ready = (state == IDLE).'],
      solution: V,
      wrong: [V.replace('else begin s <= s + n; n <= n - 1; end', 'else begin n <= n - 1; s <= s + n - 1; end'), V.replace('ADD: if (n == 0) state <= IDLE;', 'ADD: if (n == 1) state <= IDLE;')],
    });
  }
  {
    const vs = [0b11010110, 0, 255, 0b10000001, 0b01110000];
    const cases = vs.map((v) => ({ label: 'rin = ' + bin(v, 8), set: 'rin = 8\'b' + bin(v, 8) + ';', want: A.run(R.ones(), { inputs: startWith({ RIN: v }), maxCycles: 40 }).regs.C }));
    const V = 'module ones(input clk, input reset, input start, input [7:0] rin, output reg [3:0] c, output ready);\n  localparam IDLE = 1\'b0, SCAN = 1\'b1;\n  reg state;\n  reg [7:0] r;\n  always @(posedge clk or posedge reset)\n    if (reset) state <= IDLE;\n    else case (state)\n      IDLE: if (start) begin r <= rin; c <= 0; state <= SCAN; end\n      SCAN: if (r == 0) state <= IDLE;\n            else begin r <= r >> 1; if (r[0]) c <= c + 1; end\n    endcase\n  assign ready = (state == IDLE);\nendmodule\n';
    ex({
      id: 'rtl-ex-vlog-ones', chapter: 'rtl-control', title: 'Count the ones in Verilog', level: 3, kind: 'verilog', module: 'ones', ports: 'input clk, reset, start, input [7:0] rin; output [3:0] c; output ready', synth: true, pass: 'DONE',
      start: 'module ones(input clk, input reset, input start, input [7:0] rin, output reg [3:0] c, output ready);\n\nendmodule\n',
      testbench: doneTb('ones', { decl: ['  reg [7:0] rin; wire [3:0] c; wire ready;'], conn: '.rin(rin), .c(c), .ready(ready)' }, cases, { got: 'c', name: 'c' }),
      text: ['Write module ones from the ones-counting chart: start loads R from rin and clears C; each clock in SCAN adds R\'s low bit into C and shifts R right; when R = 0 it returns to IDLE, where ready = 1.', ONES_TEXT],
      hints: ['The conditional box C ← C + 1 sits under the decision on R[0]: in Verilog, an if inside the else branch.', 'r <= r >> 1 and the test of r[0] both see r from before the edge.', 'SCAN: if (r == 0) state <= IDLE; else begin r <= r >> 1; if (r[0]) c <= c + 1; end.'],
      solution: V,
      wrong: [V.replace('if (r[0]) c <= c + 1;', 'if (r[1]) c <= c + 1;'), V.replace('else begin r <= r >> 1; if (r[0]) c <= c + 1; end', 'else begin r <= r >> 1; c <= c + 1; end')],
    });
  }

  // ===========================================================================================================
  // Chapter 3: worked designs
  // ===========================================================================================================
  const MULT_TEXT = chartText(['IDLE:  READY; if START: A ← 0, C ← 0, P ← 4, M ← MIN, Q ← QIN; go to ADD', 'ADD:   P ← P − 1; if Q0: {C, A} ← A + M; go to SHIFT', 'SHIFT: {C, A, Q} ← {C, A, Q} >> 1; if Z (P = 0): go to IDLE, else ADD']);
  {
    const ch = A.examples.multiplier(), r = after(ch, startWith({ MIN: 11, QIN: 13 }), 5);
    ex({
      id: 'rtl-ex-mult-a', chapter: 'rtl-designs', title: 'Inside the multiplier', level: 2, kind: 'number',
      text: ['The shift-and-add multiplier computes 11 × 13: START = 1 in the first clock with MIN = 11 (1011) and QIN = 13 (1101).', MULT_TEXT, 'What does A hold after the fifth clock edge?'],
      answer: r.regs.A, higherLower: true,
      hints: ['Clock 1 loads; then ADD and SHIFT alternate. Q0 is the low bit of Q at the time of the ADD.', 'Clock 2 (ADD): Q0 = 1, A = 0 + 11 = 11. Clock 3 (SHIFT): C A Q = 0 1011 1101 >> 1 = 0 0101 1110.', 'Clock 4 (ADD): Q0 = 0, nothing added. Clock 5 (SHIFT): A = ' + bin(r.regs.A, 4) + ' = ' + r.regs.A + ', Q = ' + bin(r.regs.Q, 4) + '.'],
      solution: r.regs.A, wrong: [5, 11], why: 'After clock 5: A = ' + r.regs.A + ', Q = ' + r.regs.Q + ', P = ' + r.regs.P + '.',
    });
  }
  {
    const b = backAt(A.examples.multiplier(), startWith({ MIN: 11, QIN: 13 })), fin = A.run(A.examples.multiplier(), { inputs: startWith({ MIN: 11, QIN: 13 }), maxCycles: b.k - 1 }).regs;
    ex({
      id: 'rtl-ex-mult-clocks', chapter: 'rtl-designs', title: 'How long does a product take?', level: 1, kind: 'number',
      text: ['The same multiplier, 11 × 13. Count the clock in which START = 1 as clock 1. In which clock is it back in IDLE with READY = 1?', MULT_TEXT],
      answer: b.k, higherLower: true,
      hints: ['Four rounds, one per bit of Q, each an ADD clock and a SHIFT clock.', 'One clock to load, 8 clocks of rounds.', 'Back in IDLE in clock ' + b.k + ', with the product ' + (fin.A * 16 + fin.Q) + ' in A Q.'],
      solution: b.k, wrong: [b.k - 1, 9 + 4], why: 'The time does not depend on the numbers: every round takes two clocks even when nothing is added.',
    });
  }
  const DIV_TEXT = chartText(['IDLE:  READY; if START: (if DZ: E ← 1, stay)', '       else A ← 0, Q ← DIN, M ← VIN, P ← 4, E ← 0; go to SHIFT', 'SHIFT: {A, Q} ← {A, Q} << 1, P ← P − 1; go to SUB', 'SUB:   A ← A − M; go to TEST', 'TEST:  if NEG (A < 0): A ← A + M   else: Q[0] ← 1', '       then if Z (P = 0): IDLE, else SHIFT']);
  {
    const ch = A.examples.divider(), r = after(ch, startWith({ DIN: 14, VIN: 4 }), 8);
    ex({
      id: 'rtl-ex-div-q', chapter: 'rtl-designs', title: 'Quotient bits as they arrive', level: 2, kind: 'number',
      text: ['The restoring divider computes 14 ÷ 4: START = 1 in the first clock with DIN = 14 (1110) and VIN = 4. A has 5 bits, its top bit the sign.', DIV_TEXT, 'What does Q hold after the eighth clock edge (as a decimal number)?'],
      answer: r.regs.Q, higherLower: true,
      hints: ['Clock 1 loads; each round is SHIFT, SUB, TEST: three clocks.', 'Round 1 (clocks 2 to 4): A Q = 00000 1110 shifts to 00001 1100; 1 − 4 < 0, restore. Round 2 starts in clock 5.', 'Round 2: A = 00011, 3 − 4 < 0, restore in clock 7. Clock 8 is the next SHIFT: Q = ' + bin(r.regs.Q, 4) + ' = ' + r.regs.Q + '.'],
      solution: r.regs.Q, wrong: [3, 14], why: 'After clock 8: A = ' + r.regs.A + ', Q = ' + bin(r.regs.Q, 4) + ', P = ' + r.regs.P + '.',
    });
  }
  {
    const r = A.run(A.examples.divider(), { inputs: startWith({ DIN: 9, VIN: 2 }), maxCycles: 30, until: (st, regs, c) => c > 0 && st === 'IDLE' });
    const restores = r.trace.filter((t) => t.state === 'TEST' && t.tests.some((x) => x.cond === 'NEG' && x.value === 1)).length;
    ex({
      id: 'rtl-ex-div-restores', chapter: 'rtl-designs', title: 'How many restores?', level: 2, kind: 'number',
      text: ['The restoring divider computes 9 ÷ 2 (DIN = 1001, VIN = 2). In how many of its four TEST clocks does it have to restore A (add M back)?', DIV_TEXT],
      answer: restores, higherLower: true,
      hints: ['A restore happens when the trial subtraction goes negative: that quotient bit is 0.', 'The quotient 9 ÷ 2 = 4 = 0100 has one 1 bit and three 0 bits.', restores + ' restores, one for each 0 bit of the quotient; the result is Q = ' + r.regs.Q + ', A = ' + r.regs.A + '.'],
      solution: restores, wrong: [1, 4], why: 'Each quotient bit 0 costs a restore; each 1 keeps the subtraction.',
    });
  }
  {
    const r = A.run(A.examples.divider(), { inputs: startWith({ DIN: 12, VIN: 0 }), maxCycles: 3 });
    const opts = ['It stays in IDLE and sets E = 1', 'It runs four rounds and leaves Q = 15', 'It loops forever in SUB', 'It goes to SHIFT with E = 1'];
    const ans = r.trace.every((t) => t.state === 'IDLE') && r.regs.E === 1 ? 0 : 1;
    ex({
      id: 'rtl-ex-div-zero', chapter: 'rtl-designs', title: 'Division by zero', level: 1, kind: 'choice',
      text: ['The divider is started with DIN = 12 and VIN = 0. Its IDLE block tests DZ = (VIN = 0) right after START. What happens?', DIV_TEXT],
      options: opts, answer: ans,
      whyNot: { 1: 'The DZ decision comes first: with VIN = 0 the load path is never taken.', 2: 'It never leaves IDLE.', 3: 'On the DZ path the next state is IDLE.' },
      hints: ['Follow the path through IDLE\'s block with START = 1 and DZ = 1.', 'That path has one conditional box, E ← 1, and leads back to IDLE.', 'It stays in IDLE (READY stays 1) and E becomes ' + r.regs.E + ': the error flag.'],
      solution: ans, wrong: [1, 3],
    });
  }
  {
    const b = backAt(A.examples.gcd(), startWith({ XIN: 45, YIN: 27 })), cmp = b.trace.slice(0, b.k - 1).filter((t) => t.state === 'CMP').length;
    const r = A.run(A.examples.gcd(), { inputs: startWith({ XIN: 45, YIN: 27 }), maxCycles: b.k - 1 });
    ex({
      id: 'rtl-ex-gcd-clocks', chapter: 'rtl-designs', title: 'Clocks spent comparing', level: 2, kind: 'number',
      text: ['The GCD engine is started with X = 45 and Y = 27. Each clock in CMP either subtracts the smaller register from the larger or, when they are equal, finishes.', chartText(['IDLE:  READY; if START: X ← XIN, Y ← YIN; go to CMP', 'CMP:   if EQ: go to IDLE', '       else if LT: Y ← Y − X; stay', '       else: X ← X − Y; stay'])],
      answer: cmp, higherLower: true,
      hints: ['Write the pairs: (45, 27) → (18, 27) → (18, 9) → …', 'Keep subtracting until the two are equal; count that last clock too, since it is spent in CMP.', 'The pairs: (45, 27), (18, 27), (18, 9), (9, 9). Three subtractions and one clock that finds them equal: ' + cmp + ' clocks in CMP; GCD = ' + r.regs.X + '.'],
      solution: cmp, wrong: [cmp - 1, 9], why: 'GCD(45, 27) = ' + r.regs.X + '.',
    });
  }
  {
    const r = after(A.examples.gcd(), startWith({ XIN: 50, YIN: 15 }), 5);
    ex({
      id: 'rtl-ex-gcd-x', chapter: 'rtl-designs', title: 'Where is the GCD engine after five clocks?', level: 3, kind: 'number',
      text: ['The GCD engine is started with X = 50 and Y = 15 (START in the first clock). What does X hold after the fifth clock edge?'],
      answer: r.regs.X, higherLower: true,
      hints: ['Clock 1 loads X = 50, Y = 15. Each later clock does one subtraction.', 'X is the larger, so X ← X − Y three times in a row: 35, 20, 5.', 'Clock 5 sees X = 5 < Y = 15, so it changes Y: X = ' + r.regs.X + ', Y = ' + r.regs.Y + '.'],
      solution: r.regs.X, wrong: [r.regs.X + 15, 0], why: 'After clock 5: X = ' + r.regs.X + ', Y = ' + r.regs.Y + '.',
    });
  }
  {
    const sc = '000110000000000000', r = A.run(A.examples.traffic(), { inputs: (k) => ({ SC: +sc[k] || 0, PB: 0 }), maxCycles: 12 });
    const opts = ['MG (main green)', 'MY (main yellow)', 'SG (side green)', 'SY (side yellow)'], ans = ['MG', 'MY', 'SG', 'SY'].indexOf(r.state);
    ex({
      id: 'rtl-ex-traffic-state', chapter: 'rtl-designs', title: 'Which lights are on?', level: 2, kind: 'choice',
      text: ['The traffic controller starts in MG with T = 0. The timer T counts the clocks in a phase; LONG = (T = 5), SHORT = (T = 1), DONE = (T = 3).', chartText(['MG: MAIN_G, SIDE_R; if LONG: (if SC or PB: T ← 0, go to MY)  else T ← T + 1', 'MY: MAIN_Y, SIDE_R; if SHORT: T ← 0, go to SG  else T ← T + 1', 'SG: MAIN_R, SIDE_G; if DONE: T ← 0, go to SY  else T ← T + 1', 'SY: MAIN_R, SIDE_Y; if SHORT: T ← 0, go to MG  else T ← T + 1']), 'A side-road car (SC = 1) waits in clocks 4 and 5 only, then drives away; nobody presses PB. Which state is the controller in during clock 13 (after 12 edges)?'],
      options: opts, answer: ans,
      whyNot: { 1: 'MY needs MG to see LONG and a request in the same clock.', 2: 'SG comes only after MY, and MY only after a request seen with LONG = 1.', 3: 'SY comes after SG.' },
      hints: ['MG checks SC only once T = 5 (LONG). Until then it just counts.', 'T reaches 5 in clock 6, but SC was 1 only in clocks 4 and 5: the request has gone by then.', 'The car left before the minimum green was over, so the main road stays green: ' + r.state + '.'],
      solution: ans, wrong: [1, 2],
      why: 'A request is seen only while LONG = 1; this one came too early and was not held.',
    });
  }
  {
    const coins = [10, 10, 5];
    const inputs = (() => { let i = 0; return (k, regs, st) => { if (st !== 'WAIT' || i >= coins.length) return {}; const c = coins[i++]; return { C5: c === 5 ? 1 : 0, C10: c === 10 ? 1 : 0 }; }; })();
    const r = A.run(A.examples.vending(), { inputs, maxCycles: 30 });
    const chg = r.outputsLog.filter((o) => o.includes('CHG')).length, vend = r.outputsLog.filter((o) => o.includes('VEND')).length;
    ex({
      id: 'rtl-ex-vend-chg', chapter: 'rtl-designs', title: 'Change, five cents at a time', level: 2, kind: 'number',
      text: ['The coin controller with a SUM register sells at 20 cents and pays change in 5-cent pulses (CHG).', chartText(['WAIT:   if C10: SUM ← SUM + 10; go to CHECK', '        else if C5: SUM ← SUM + 5; go to CHECK', 'CHECK:  if ENOUGH (SUM ≥ 20): go to VEND, else WAIT', 'VEND:   VEND, SUM ← SUM − 20; go to CHANGE', 'CHANGE: if ZERO (SUM = 0): go to WAIT', '        else: CHG, SUM ← SUM − 5; stay']), 'A customer puts in 10, 10 and then 5 cents (each coin arrives in a WAIT clock). How many CHG pulses does the controller give in all?'],
      answer: chg, higherLower: true,
      hints: ['After two coins SUM = 20: CHECK sees ENOUGH and the controller vends.', 'VEND takes 20 off, leaving 0: CHANGE finds ZERO at once. The 5 arrives later and waits for more.', chg + ' CHG pulses and ' + vend + ' vend; SUM ends at ' + r.regs.SUM + ', still held for the next customer.'],
      solution: chg, wrong: [1, 2], why: 'The third coin comes after the vend, so it is not change: it is the start of the next purchase.',
    });
  }
  {
    const pairs = [[42, 30], [45, 27], [17, 5], [24, 24], [99, 66]];
    const cases = pairs.map(([x, y]) => ({ label: 'gcd(' + x + ', ' + y + ')', set: 'xin = ' + x + '; yin = ' + y + ';', want: A.run(A.examples.gcd(), { inputs: startWith({ XIN: x, YIN: y }), maxCycles: 200, until: (st, regs, c) => c > 1 && st === 'IDLE' }).regs.X }));
    const V = 'module gcd(input clk, input reset, input start, input [7:0] xin, input [7:0] yin, output reg [7:0] x, output ready);\n  localparam IDLE = 1\'b0, CMP = 1\'b1;\n  reg state;\n  reg [7:0] y;\n  always @(posedge clk or posedge reset)\n    if (reset) state <= IDLE;\n    else case (state)\n      IDLE: if (start) begin x <= xin; y <= yin; state <= CMP; end\n      CMP: if (x == y) state <= IDLE;\n           else if (x < y) y <= y - x;\n           else x <= x - y;\n    endcase\n  assign ready = (state == IDLE);\nendmodule\n';
    ex({
      id: 'rtl-ex-vlog-gcd', chapter: 'rtl-designs', title: 'The GCD engine in Verilog', level: 3, kind: 'verilog', module: 'gcd', ports: 'input clk, reset, start, input [7:0] xin, yin; output [7:0] x; output ready', synth: true, pass: 'DONE',
      start: 'module gcd(input clk, input reset, input start, input [7:0] xin, input [7:0] yin, output reg [7:0] x, output ready);\n\nendmodule\n',
      testbench: doneTb('gcd', { decl: ['  reg [7:0] xin, yin; wire [7:0] x; wire ready;'], conn: '.xin(xin), .yin(yin), .x(x), .ready(ready)' }, cases, { got: 'x', name: 'x' }),
      text: ['Write module gcd from the GCD chart: start loads X and Y; each clock in CMP subtracts the smaller from the larger; when they are equal it returns to IDLE (ready = 1) with the GCD in x. Both numbers are at least 1.'],
      hints: ['Two states; x and y are registers written in the always block on posedge clk.', 'CMP is an if / else if / else: equal, x < y, otherwise.', 'CMP: if (x == y) state <= IDLE; else if (x < y) y <= y - x; else x <= x - y;'],
      solution: V,
      wrong: [V.replace('else if (x < y) y <= y - x;', 'else if (x < y) y <= x - y;'), V.replace('CMP: if (x == y) state <= IDLE;', 'CMP: if (x == 0) state <= IDLE;')],
    });
  }
  {
    const pairs = [[13, 11], [15, 15], [9, 0], [6, 5], [1, 14]];
    const cases = pairs.map(([m, q]) => { const r = A.run(A.examples.multiplier(), { inputs: startWith({ MIN: m, QIN: q }), maxCycles: 9 }); return { label: m + ' x ' + q, set: 'm = ' + m + '; q = ' + q + ';', want: r.regs.A * 16 + r.regs.Q }; });
    const V = 'module mult4(input clk, input reset, input start, input [3:0] m, input [3:0] q, output [7:0] p, output ready);\n  localparam IDLE = 2\'d0, ADD = 2\'d1, SHIFT = 2\'d2;\n  reg [1:0] state;\n  reg [3:0] a, mr, qr;\n  reg c;\n  reg [2:0] n;\n  always @(posedge clk or posedge reset)\n    if (reset) state <= IDLE;\n    else case (state)\n      IDLE: if (start) begin a <= 0; c <= 0; n <= 4; mr <= m; qr <= q; state <= ADD; end\n      ADD: begin n <= n - 1; if (qr[0]) {c, a} <= a + mr; state <= SHIFT; end\n      SHIFT: begin {c, a, qr} <= {c, a, qr} >> 1; state <= (n == 0) ? IDLE : ADD; end\n      default: state <= IDLE;\n    endcase\n  assign p = {a, qr};\n  assign ready = (state == IDLE);\nendmodule\n';
    ex({
      id: 'rtl-ex-vlog-mult', chapter: 'rtl-designs', title: 'The multiplier in Verilog', level: 3, kind: 'verilog', module: 'mult4', ports: 'input clk, reset, start, input [3:0] m, q; output [7:0] p; output ready', synth: true, pass: 'DONE',
      start: 'module mult4(input clk, input reset, input start, input [3:0] m, input [3:0] q, output [7:0] p, output ready);\n\nendmodule\n',
      testbench: doneTb('mult4', { decl: ['  reg [3:0] m, q; wire [7:0] p; wire ready;'], conn: '.m(m), .q(q), .p(p), .ready(ready)' }, cases, { got: 'p', name: 'p' }),
      text: ['Write module mult4, the shift-and-add multiplier, from its chart. p is the 8-bit product {A, Q}; ready = 1 in IDLE.', MULT_TEXT],
      hints: ['Registers a, mr, qr (4 bits), c (1 bit) and a counter n (3 bits); a 2-bit state.', 'ADD: n <= n − 1, and if (qr[0]) {c, a} <= a + mr. SHIFT: {c, a, qr} <= {c, a, qr} >> 1, then IDLE if n == 0.', 'Each register is written at most once per clock, and every test reads the old values, exactly as in the chart. assign p = {a, qr}.'],
      solution: V,
      wrong: [V.replace('if (qr[0]) {c, a} <= a + mr;', 'if (qr[0]) a <= a + mr;'), V.replace('state <= (n == 0) ? IDLE : ADD;', 'state <= (n == 1) ? IDLE : ADD;')],
    });
  }

  // ---- what the diagram checker looks at: a sample of these exercises ------------------------------------------
  if (S.Checks) {
    for (const id of ['rtl-ex-timer-busy', 'rtl-ex-broken', 'rtl-ex-mult-onehot', 'rtl-ex-mult-jk', 'rtl-ex-ctl-signals', 'rtl-ex-ctl-wave', 'rtl-ex-vlog-gcd', 'rtl-ex-traffic-state']) S.Checks.push({ group: 'learn', name: 'exercise ' + id, hash: 'exercise=' + id, ready: "document.querySelector('#exerciseView')", sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
