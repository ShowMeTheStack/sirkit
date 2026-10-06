// Part 9 lessons: register-transfer design and ASM charts. Three chapters in teaching order: transfers and ASM
// charts (registers and the transfers between them, the boxes and blocks of a chart, what one clock edge does),
// datapath and controller (the split, the controller three ways and as gates, the chart in Verilog), and worked
// designs (a multiplier, a divider, a GCD engine, a traffic light and a coin controller). The exercises are in
// 90-rtl-ex.js, which also holds the small charts of our own that both files use; a tour and a course close this
// file.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.lessons.has('rtl-l-transfers')) return;
  const A = S.Asm;
  const R = S.RtlContent || {};

  C.chapter({ id: 'rtl-asm', part: 'rtl', n: 1, title: 'Transfers and ASM charts', blurb: 'Registers and the transfers between them, the ASM chart that says which transfers happen in which clock, and what one clock edge does.' });
  C.chapter({ id: 'rtl-control', part: 'rtl', n: 2, title: 'Datapath and controller', blurb: 'Every design splits into registers that do the work and a controller that says when; the controller built three ways, and the whole design in Verilog.' });
  C.chapter({ id: 'rtl-designs', part: 'rtl', n: 3, title: 'Worked designs', blurb: 'A multiplier, a divider, a GCD engine, a traffic light and a coin controller, run one clock at a time.' });

  const L = (x) => C.lesson(x);
  const X = (id) => ({ exercise: id });
  // the summing chart in Verilog, with a small testbench that starts it on N = 6 and prints the registers
  const SUM_TB = 'module tb;\n  reg clk = 0, reset = 0, START = 0; reg [3:0] NIN = 0;\n  wire READY; wire [3:0] N; wire [6:0] S;\n  sumto u(.clk(clk), .reset(reset), .START(START), .NIN(NIN), .READY(READY), .N(N), .S(S));\n  always #5 clk = ~clk;\n  initial begin\n    #1 reset = 1; #1 reset = 0;\n    NIN = 6; START = 1; #10 START = 0;\n    repeat (8) begin #10 $display("N = %0d  S = %0d  READY = %b", N, S, READY); end\n    $finish;\n  end\nendmodule';
  const SUM_V = R.sum ? A.verilog(R.sum()) + '\n' + SUM_TB : '';
  // the summing chart's controller as gates, one flip-flop: IDLE = 0, ADD = 1 (G is START)
  const SUMCTL_C = 'nz = NOT(Z)\nnq = NOT(q)\na1 = AND(q, nz)\na2 = AND(nq, G)\nd = OR(a1, a2)\nq = DFF(d)\nREADY = NOT(q)';

  // =========================================================================================================
  // Chapter 1: transfers and ASM charts
  // =========================================================================================================
  L({
    id: 'rtl-l-transfers', chapter: 'rtl-asm', title: 'Registers and transfers', minutes: 8,
    summary: 'Bigger designs are described by what moves between registers on each clock. A register transfer copies a value, possibly through an adder or a shifter, into a register at the clock edge.',
    blocks: [
      'A multiplier, a divider or a small processor has dozens of flip-flops. Drawing a state diagram over all of them is hopeless: a pair of 8-bit registers alone has 65 536 combinations. Instead, the design is described one level up: *which registers exist, and what moves between them in each clock*. That is the **register-transfer level**.',
      { def: 'Register transfer', text: 'R1 ← R2 + R3 means: at the next clock edge, R1 takes the value R2 + R3 had during the clock. The sources keep their values.' },
      { code: 'R1 ← R2           copy\nA ← A + R1        add, result into A\n{C, A} ← A + M    a 5-bit sum split into C and A\n{A, Q} ← {A, Q} << 1   two registers shifted as one\nQ[0] ← 1          set one bit\nT1: R1 ← R2       only in clocks where T1 = 1', lang: 'text' },
      { topic: 'rtl-transfers', input: { prog: 'R1 ← 5; R2 ← 9; A ← R1; R1 ← R2; R2 ← A' }, frame: 7, caption: 'A swap through A on a single bus: clock 4 copies R2 into R1. Only one register can drive the bus in a clock, so the swap takes three clocks.' },
      { predict: { q: 'If R1 ← R2 and R2 ← R1 are done in the same clock, with separate paths (no shared bus), what happens?', options: ['R1 and R2 swap', 'Both end up with R2\'s value', 'It is not allowed'], answer: 0, explain: 'Every transfer of a clock reads the values from before the edge, so each register gets the other\'s old value.' } },
      'That last point is what makes register-transfer descriptions easy to read: inside one clock, order does not matter. All transfers are worked out from the present values and land together at the edge, exactly as a set of flip-flops sharing a clock behaves.',
      { warn: 'A register may receive only one transfer in a clock. Two transfers into the same register at the same edge describe a circuit with two drivers on its input, which is a mistake.' },
      { h: 'Recap' },
      { list: ['A ← B copies B into A at the clock edge; B is unchanged.', 'Transfers of one clock all read the old values; their order does not matter.', 'One write per register per clock.', 'A condition before a colon enables the transfer.'] },
      X('rtl-ex-copy'), X('rtl-ex-swap'), X('rtl-ex-shift-cat'), X('rtl-ex-cond-transfer'),
    ],
  });

  L({
    id: 'rtl-l-asm', chapter: 'rtl-asm', title: 'ASM charts: boxes and blocks', minutes: 10,
    summary: 'An ASM chart is a flowchart with a clock in it. State boxes take one clock each, decision boxes choose a path, and conditional boxes hold transfers that happen only on their path. A state box and everything under it is one ASM block.',
    blocks: [
      'A state diagram says how a controller moves; it says nothing about the registers it drives. An **algorithmic state machine (ASM) chart** says both, in the shape of a flowchart, with one strict rule about time.',
      { list: ['**State box** (a rectangle): one state, one clock. Inside: the outputs that are 1 for that whole clock, and transfers that happen at its end.', '**Decision box** (a diamond): tests an input or a status signal and picks the exit. It takes no time.', '**Conditional box** (rounded ends): outputs and transfers that happen only when the path through the decisions reaches it, like a Mealy output.'] },
      { topic: 'asm-elements', input: { c: 'multiplier' }, frame: 3, caption: 'The conditional box under IDLE: the loads happen only on the START = 1 path, at the edge that ends the IDLE clock.' },
      { def: 'ASM block', text: 'a state box with all the decision and conditional boxes below it, down to the next state boxes. One block is one clock: everything in it happens in that clock, and the paths out of it are the possible next states.' },
      { topic: 'asm-elements', input: { c: 'multiplier' }, frame: 6, caption: 'The SHIFT block has two paths, both shifting; Z picks the next state.' },
      { h: 'A chart in words' },
      'Here is a small chart of our own, used in the exercises. It adds 1 + 2 + … + N with two registers, N and S, and one status signal Z = (N = 0).',
      { math: 'IDLE:  READY\n       if START: N ← NIN, S ← 0; go to ADD\nADD:   if Z: go to IDLE\n       else: S ← S + N, N ← N − 1; stay in ADD' },
      { predict: { q: 'How many ASM blocks does this chart have?', options: ['2', '3', '4'], answer: 0, explain: 'One per state box: IDLE and ADD. Decisions and conditional boxes belong to the block above them.' } },
      { topic: 'asm-elements', input: { c: 'broken' }, frame: 5, caption: 'A GCD chart with mistakes in it: the CMP block and its three paths. List what each path writes; the first exercise below asks what is wrong.' },
      { h: 'Recap' },
      { list: ['State box: one clock. Decision: no time. Conditional box: only on its path.', 'A block is a state box and everything under it: one clock.', 'Outputs in a state box are Moore-like; in a conditional box, Mealy-like.', 'On any path through a block, each register is written at most once.'] },
      X('rtl-ex-broken'), X('rtl-ex-sum-s'),
    ],
  });

  L({
    id: 'rtl-l-timing', chapter: 'rtl-asm', title: 'What one clock edge does', minutes: 8,
    summary: 'During a clock the decisions read the registers as they are, and the transfers are worked out from the same values. At the edge every register is written at once and the state moves. A test written under a transfer still sees the old value.',
    blocks: [
      'Here is the one fact about ASM charts that catches everybody once. In a block with T ← T + 1 in the state box and a decision on T = 3 below it, which T does the decision see: before the increment, or after?',
      { topic: 'asm-timing', input: { c: 'gcd', n: 3 }, frame: 3, caption: 'Before the edge in CMP: the decisions read X = 12, Y = 18, and the transfer Y ← Y − X is worked out from those values.' },
      { topic: 'asm-timing', input: { c: 'gcd', n: 3 }, frame: 4, caption: 'The edge: Y becomes 6 and the state stays CMP. Nothing in this clock saw the 6.' },
      'So the decision sees the value from *before* the edge, even if it is drawn below the transfer. The picture is a flowchart, but the hardware is a set of flip-flops: they all change together, at the edge, and the decisions are gates reading their outputs during the clock.',
      { math: 'IDLE:  if GO: T ← 0; go to RUN\nRUN:   BUSY, T ← T + 1\n       if END (T = 3): go to IDLE, else stay in RUN' },
      { predict: { q: 'In this pulse stretcher, GO arrives once. For how many clocks is BUSY 1?', options: ['3', '4', '5'], answer: 1, explain: 'In RUN, T reads 0, 1, 2, 3 in four successive clocks; only in the fourth does END = 1. The increment in the same block is not seen.' } },
      { tip: 'To check a chart by hand, keep a table with one row per clock: the state, the values read, and the values written at the edge. Never use a value in the row it is written.' },
      { h: 'Recap' },
      { list: ['During the clock: decisions and transfers read the present values.', 'At the edge: all registers written together; the state moves.', 'A decision below a transfer in the same block still sees the old value.'] },
      X('rtl-ex-timer-busy'), X('rtl-ex-sum-clocks'), X('rtl-ex-ones-c'),
    ],
  });

  // =========================================================================================================
  // Chapter 2: datapath and controller
  // =========================================================================================================
  L({
    id: 'rtl-l-split', chapter: 'rtl-control', title: 'Datapath and controller', minutes: 9,
    summary: 'A design splits into a datapath (registers, adders, comparators, multiplexers) and a controller (a state machine). Control signals go from the controller to the datapath; status signals come back.',
    blocks: [
      'Look at any ASM chart and two kinds of thing appear. Some parts *do the work*: registers, the adder that computes A + M, the comparator behind X < Y. Other parts *decide when*: the states and the arrows between them. Building them as two separate circuits is the standard method.',
      { topic: 'datapath-controller', input: { c: 'gcd' }, frame: 5, caption: 'Each transfer becomes a control signal, 1 in its state (and on its path). Y ← Y − X is enabled when the controller is in CMP with EQ = 0 and LT = 1.' },
      { topic: 'datapath-controller', input: { c: 'gcd' }, frame: 7, caption: 'The whole GCD engine: control signals to the right, the status signals EQ and LT back to the controller.' },
      { list: ['**Control signals**: one per transfer (or per group of transfers that always happen together). Each is the state line of its block, ANDed with the conditions on its path.', '**Status signals**: one bit each, computed in the datapath from the registers: P = 0, X < Y, the low bit of Q.', 'The controller sees only inputs and status signals; it never sees a whole register.'] },
      { predict: { q: 'The summing chart tests Z = (N = 0). Is Z an input to the controller, or one of its outputs?', options: ['An input: a status signal from the datapath', 'An output: a control signal'], answer: 0, explain: 'The comparison is made in the datapath, on the register N; the controller only receives its one-bit answer.' } },
      'The controller is then an ordinary state machine, with START and the status signals as its inputs and the control signals as its outputs, and all the methods of Part 6 apply to it.',
      { h: 'Recap' },
      { list: ['Datapath: registers and the logic between them. Controller: the states.', 'Transfers become control signals: T_state · (path conditions).', 'Tests on registers become status signals.', 'The controller is a state machine like any other.'] },
      X('rtl-ex-sum-ctl'), X('rtl-ex-mult-ctl-table'), X('rtl-ex-zero-detect'), X('rtl-ex-ctl-signals'),
    ],
  });

  L({
    id: 'rtl-l-control3', chapter: 'rtl-control', title: 'Three ways to build the controller', minutes: 10,
    summary: 'A controller can hold its state as a binary code with a decoder, as one flip-flop per state, or in a counter that mostly counts. The behaviour is the same; the flip-flops and the logic differ.',
    blocks: [
      'Once the controller is a state table, there is a choice of how to hold the state. Three are common, and each one wins somewhere.',
      { topic: 'control-three-ways', input: { c: 'multiplier', m: 'decoder' }, frame: 1, caption: 'State register and decoder: D1 = T_ADD and D0 = T_IDLE·START + T_SHIFT·Z′, written with the decoder\'s state lines.' },
      { topic: 'control-three-ways', input: { c: 'multiplier', m: 'onehot' }, frame: 1, caption: 'One-hot: each D collects the arrows into its state, read straight off the chart.' },
      { topic: 'control-three-ways', input: { c: 'multiplier', m: 'counter' }, frame: 1, caption: 'A sequence counter: counting up is the free move; only the arrows back to IDLE and from SHIFT to ADD need a clear or a load.' },
      { table: [['', 'register + decoder', 'one-hot', 'sequence counter'], ['flip-flops for n states', '⌈log₂ n⌉', 'n', '⌈log₂ n⌉'], ['next-state logic', 'K-maps', 'read off the chart', 'count, clear, load'], ['state lines', 'from a decoder', 'the flip-flops themselves', 'from a decoder'], ['suits', 'few flip-flops wanted', 'speed, easy changes', 'mostly-in-order charts']] },
      { predict: { q: 'A controller has 12 states. How many flip-flops for one-hot, and how many with a state register?', options: ['12 and 4', '12 and 3', '4 and 12'], answer: 0, explain: 'One-hot needs one per state; 3 bits give only 8 codes, so a register needs 4.' } },
      { h: 'Recap' },
      { list: ['Register + decoder: fewest flip-flops, a decoder makes the state lines.', 'One-hot: a flip-flop per state, equations read off the chart.', 'Sequence counter: good when the states mostly follow one another.', 'Whatever the method, the control signals are the same functions of the state lines.'] },
      X('rtl-ex-ff-onehot'), X('rtl-ex-gcd-ctl'), X('rtl-ex-mult-onehot'), X('rtl-ex-mult-binary'), X('rtl-ex-mult-jk'), X('rtl-ex-mult-kmap'), X('rtl-ex-seq-counter'),
    ],
  });

  L({
    id: 'rtl-l-ctl-gates', chapter: 'rtl-control', title: 'The controller as gates', minutes: 7,
    summary: 'A small controller is a handful of gates and one or two flip-flops. Built and simulated, it shows the control signals moving clock by clock, and its slowest path sets how fast the whole design can run.',
    blocks: [
      'The summing chart\'s controller has two states, so one flip-flop q does: IDLE = 0, ADD = 1. With G for START, its equations are D = q′G + qZ′ and READY = q′.',
      { circuit: SUMCTL_C, outputs: ['READY'], caption: 'The summing chart\'s controller. Open it in the workbench to clock it by hand.' },
      { predict: { q: 'The controller is in ADD (q = 1). In this clock Z = 0. What is q after the edge?', options: ['0: back to IDLE', '1: stays in ADD'], answer: 1, explain: 'D = q′G + qZ′ = 0 + 1·1 = 1: it keeps adding until Z = 1.' } },
      { waveform: { circuit: SUMCTL_C, inputs: { G: '010000000', Z: '000000100' }, clocked: true, outputs: ['READY'] }, caption: 'START (G) in clock 2, Z in clock 7: READY is 0 for the five clocks spent in ADD.' },
      'The controller is usually small and fast, but it sits in the middle of every path: a status signal from the datapath goes through the next-state logic into a state flip-flop, and a control signal from the controller goes into the datapath\'s multiplexers. The clock period must cover the slowest of those paths.',
      { tip: 'One-hot controllers are popular in FPGAs: flip-flops are plentiful there, and the next-state logic of each flip-flop stays small however many states there are.' },
      { h: 'Recap' },
      { list: ['A two-state controller needs one flip-flop.', 'Simulate the controller with made-up status signals before joining it to the datapath.', 'The clock period covers controller and datapath paths together.'] },
      X('rtl-ex-mult-ctl-circuit'), X('rtl-ex-gcd-ctl-circuit'), X('rtl-ex-gcd-ctl-wave'), X('rtl-ex-ctl-wave'), X('rtl-ex-ctl-fmax'),
    ],
  });

  L({
    id: 'rtl-l-verilog', chapter: 'rtl-control', title: 'From chart to Verilog', minutes: 9,
    summary: 'An ASM chart translates into Verilog almost line by line: a state register, a case arm per block, if-else per decision, a non-blocking assignment per transfer, and the outputs in a combinational block.',
    blocks: [
      'The chart is already a program; Verilog just needs it in a fixed shape. Every block becomes a case arm in an always block on the rising clock edge, and the meaning of "all transfers read the old values" comes for free from non-blocking assignments (<=).',
      { topic: 'asm-verilog', input: { c: 'gcd' }, frame: 3, caption: 'The CMP block as a case arm: the decisions become if-else, each transfer a non-blocking assignment, each path ends by setting the next state.' },
      { table: [['Chart', 'Verilog'], ['state box', 'a case arm'], ['decision box', 'if (…) … else …'], ['transfer', 'reg <= expression;'], ['next state', 'state <= S_X;'], ['state-box output', 'set in an always @* block']] },
      'Here is the summing chart, written out the same way.',
      { verilog: SUM_V, run: true, caption: 'The summing chart in Verilog, with a testbench after it that starts it with NIN = 6. Run it: S grows 6, 11, 15, 18, 20, 21 while N counts down, then READY returns.' },
      { predict: { q: 'Why non-blocking (<=) for the transfers, and not blocking (=)?', options: ['So that every transfer reads the values from before the edge, as in the chart', 'Because blocking assignments are not allowed in always blocks', 'To make the simulation faster'], answer: 0, explain: 'With S <= S + N and N <= N − 1, both right-hand sides use the old N. With = the second line would see the new value in simulation, unlike the hardware.' } },
      { warn: 'Every register should be written in one always block only, and every path through a case arm should set the next state (or leave it unchanged on purpose). A forgotten else is a forgotten arrow.' },
      { h: 'Recap' },
      { list: ['One always @(posedge clk) block: state and registers.', 'One case arm per block; if-else per decision; <= per transfer.', 'Outputs from the state (and conditions) in a combinational block or continuous assignments.'] },
      X('rtl-ex-vlog-timer'), X('rtl-ex-vlog-ctl'), X('rtl-ex-vlog-sum'), X('rtl-ex-vlog-ones'),
    ],
  });

  // =========================================================================================================
  // Chapter 3: worked designs
  // =========================================================================================================
  L({
    id: 'rtl-l-multiplier', chapter: 'rtl-designs', title: 'A shift-and-add multiplier', minutes: 9,
    summary: 'Multiplying 4-bit numbers the way long multiplication does: look at the multiplier\'s low bit, add the multiplicand into the upper half if it is 1, shift everything right, four times. The product ends in A and Q.',
    blocks: [
      'Long multiplication in binary is easy: each bit of the multiplier is 0 or 1, so each partial product is either 0 or the multiplicand. A circuit can add them one at a time, shifting as it goes, and needs only one adder.',
      { topic: 'asm-multiplier', input: { m: 6, q: 5 }, frame: 3, caption: 'ADD with Q0 = 1: M = 6 is added into A. The carry, if any, goes to C.' },
      { topic: 'asm-multiplier', input: { m: 6, q: 5 }, frame: 4, caption: 'SHIFT: C, A and Q move right as one 9-bit register. The bit just used falls off the end of Q; a bit of the product moves into Q from A.' },
      { predict: { q: 'With Q = 0101, in how many of the four ADD clocks is M actually added?', options: ['1', '2', '4'], answer: 1, explain: 'M is added when the bit being looked at is 1. 0101 has two 1s.' } },
      { topic: 'asm-multiplier', input: { m: 6, q: 5 }, frame: 11, caption: 'After four rounds: A Q = 0001 1110 = 30.' },
      { tip: 'The multiplier register Q does double duty: its bits are used up from the right while the low half of the product fills it from the left. No extra register is needed.' },
      { h: 'Recap' },
      { list: ['Registers: M (multiplicand), Q (multiplier, then the low half), A and C (high half), P (count).', 'Each round: ADD (if Q0), then SHIFT {C, A, Q} right.', 'Four rounds, two clocks each, plus the clock that loads.'] },
      X('rtl-ex-mult-a'), X('rtl-ex-mult-clocks'), X('rtl-ex-vlog-mult'),
    ],
  });

  L({
    id: 'rtl-l-divider', chapter: 'rtl-designs', title: 'A restoring divider', minutes: 9,
    summary: 'Division by trial subtraction: shift the next dividend bit into the remainder, subtract the divisor, and if the result went negative, add the divisor back and record a 0; otherwise keep it and record a 1.',
    blocks: [
      'Long division asks, at each step, "does the divisor fit?". In binary the answer is a single bit: 1 if it fits, 0 if not. The restoring divider finds out by trying: it subtracts, and if the remainder went negative it undoes the subtraction.',
      { topic: 'asm-divider', input: { d: 15, v: 4 }, frame: 4, caption: 'The trial subtraction 1 − 4 goes negative: A = 11101. The sign bit A[4] is the status signal NEG.' },
      { predict: { q: '15 ÷ 4 = 3 remainder 3. How many restores will the four rounds need?', options: ['1', '2', '3'], answer: 1, explain: 'The quotient 3 is 0011 in four bits: two 0s, so two rounds restore.' } },
      { topic: 'asm-divider', input: { d: 15, v: 4 }, frame: 15, caption: 'Done: Q holds the quotient 3 and A the remainder 3.' },
      { list: ['A has one extra bit, so a negative result can be seen in its top bit.', 'Each round is three clocks: SHIFT, SUB, TEST.', 'IDLE checks DZ (divisor 0) before loading anything, and raises E instead.'] },
      { warn: 'Restoring costs a clock in every round that fails. Faster dividers (non-restoring ones) skip the add-back and fix the sign in the next round, at the price of a slightly harder controller.' },
      { h: 'Recap' },
      { list: ['Shift, subtract, test the sign; restore on negative.', 'The quotient bits arrive in Q, from the right.', 'Division by zero is caught before it starts.'] },
      X('rtl-ex-div-q'), X('rtl-ex-div-restores'), X('rtl-ex-div-zero'),
    ],
  });

  L({
    id: 'rtl-l-gcd', chapter: 'rtl-designs', title: 'A GCD engine', minutes: 7,
    summary: 'The greatest common divisor by repeated subtraction: subtract the smaller register from the larger until they are equal. Two states, two registers, two status signals.',
    blocks: [
      'Some algorithms are already almost a chart. The GCD of two numbers does not change if the smaller is subtracted from the larger, and when the two are equal, that value is the GCD. One block of an ASM chart does one subtraction per clock.',
      { topic: 'asm-gcd', input: { x: 35, y: 14 }, frame: 5, caption: 'X = 7 < Y = 14: LT = 1, so this clock does Y ← Y − X.' },
      { predict: { q: 'Started with X = 35 and Y = 14, how many clocks does the engine spend in CMP?', options: ['3', '4', '7'], answer: 1, explain: 'Three subtractions (35 → 21 → 7 in X, then 14 → 7 in Y) and one clock that sees X = Y: four.' } },
      { topic: 'asm-gcd', input: { x: 35, y: 14 }, frame: 7, caption: 'X = Y = 7: the GCD. READY is back on.' },
      'The number of clocks depends on the data. With X = 99 and Y = 1 the engine subtracts 98 times. A real design would add a check for a zero input, which would otherwise never finish, and might subtract a shifted copy to go faster.',
      { h: 'Recap' },
      { list: ['Two registers, a subtractor, and the comparisons EQ and LT.', 'One subtraction per clock in CMP; equal means done.', 'The run time depends on the numbers.'] },
      X('rtl-ex-gcd-clocks'), X('rtl-ex-gcd-x'), X('rtl-ex-vlog-gcd'),
    ],
  });

  L({
    id: 'rtl-l-timers', chapter: 'rtl-designs', title: 'Controllers with timers and counters', minutes: 9,
    summary: 'A traffic light holds each phase for a number of clocks counted in a timer register; a coin controller keeps the money in a SUM register instead of a state per amount. Registers keep the chart small.',
    blocks: [
      'Some controllers have little arithmetic to do but need to wait, or to count. A **timer register** does the waiting: the chart stays in one state, counting, and moves on when a status signal says the count is reached.',
      { topic: 'asm-traffic', input: { sc: '000000000000000000000000', pb: '000000011000000000000000', n: 20 }, frame: 8, caption: 'The main road has had its minimum green (LONG = 1), and the pedestrian button is pressed: T is cleared and the lights go to main yellow.' },
      { predict: { q: 'A side-road car arrives while T = 2 in MG and leaves before T = 5. Does the side road get green?', options: ['Yes, at once', 'Yes, once T = 5', 'No: the request is gone when MG looks for it'], answer: 2, explain: 'MG reads SC only when LONG = 1. A request that has gone by then is not seen; a real design would latch it.' } },
      { h: 'A register instead of states' },
      'The coin controller of Part 6 had a state for every amount of money. With a SUM register, the chart keeps four states whatever the price: WAIT adds the coin, CHECK compares, VEND takes the price off, and CHANGE pays back 5 at a time.',
      { topic: 'asm-vending', input: { coins: '5 10 10' }, frame: 8, caption: '5 + 10 + 10 = 25: after vending, CHANGE pays the extra 5 in one CHG pulse.' },
      { tip: 'When a state diagram grows a long chain of states that differ only by a number (amounts, counts, positions), move the number into a register and let a status signal end the chain.' },
      { h: 'Recap' },
      { list: ['A timer register counts clocks inside one state; status signals end the wait.', 'A data register replaces a chain of states.', 'Inputs that are tested only at certain times may need to be latched.'] },
      X('rtl-ex-traffic-state'), X('rtl-ex-vend-chg'),
    ],
  });

  // ---- a guided tour -------------------------------------------------------------------------------------------
  C.tour({
    id: 'rtl-tour', title: 'Tour: register-transfer design', blurb: 'From one register transfer to a working multiplier, in eight steps.',
    steps: [
      { route: 'part=rtl', target: '#main', text: 'Part 9: designs described by what moves between registers on each clock, and the ASM charts that say when.' },
      { route: 'topic=rtl-transfers', target: '#stageWrap', text: 'Registers on a bus: one source drives the bus in each clock, the destination loads at the edge.' },
      { route: 'topic=asm-elements', target: '#stageWrap', text: 'The parts of an ASM chart: state boxes take a clock, decisions take none, conditional boxes happen only on their path.' },
      { route: 'topic=asm-timing', target: '#stageWrap', text: 'One clock edge in slow motion: everything reads the old values, everything is written at once.' },
      { route: 'topic=control-three-ways', target: '#inputs', text: 'Pick a design and a kind of controller: a state register and decoder, one flip-flop per state, or a sequence counter.' },
      { route: 'topic=asm-multiplier', target: '#stageWrap', text: 'A complete design running: the chart\'s present block is lit, and the registers change beside it.' },
      { route: 'topic=asm-verilog', target: '#stageWrap', text: 'The same chart written as Verilog, block by block.' },
      { route: 'learn', target: '[data-chapter="rtl-asm"]', text: 'The lessons of Part 9 start here. The exercises ask for register values after a number of clocks, controllers as tables and gates, and designs in Verilog run against hidden testbenches.' },
    ],
  });

  // ---- a course -----------------------------------------------------------------------------------------------
  C.course({
    id: 'rtl-course', title: 'Register-transfer design, start to finish', blurb: 'Every topic of Part 9 in order, from a single transfer to complete designs, with lessons and exercises along the way.',
    steps: [
      { topic: 'rtl-transfers', note: 'A transfer copies; the source keeps its value.' },
      { lesson: 'rtl-l-transfers', note: 'The notation, and why order inside a clock does not matter.' },
      { topic: 'asm-elements', note: 'Three kinds of box, and the block that is one clock.' },
      { topic: 'asm-timing', note: 'Decisions see the values from before the edge.' },
      { exercise: 'rtl-ex-timer-busy', note: 'The classic trap, worked out with a run of the chart.' },
      { topic: 'datapath-controller', note: 'Control signals out, status signals back.' },
      { topic: 'control-three-ways', note: 'The same controller three ways.' },
      { exercise: 'rtl-ex-mult-ctl-table', note: 'The controller as a state table.' },
      { exercise: 'rtl-ex-mult-ctl-circuit', note: 'Build it; it is compared clock by clock.' },
      { topic: 'asm-verilog', note: 'A case arm per block.' },
      { exercise: 'rtl-ex-vlog-sum', note: 'A whole chart in Verilog, against a hidden testbench.' },
      { topic: 'asm-multiplier', note: 'Shift and add, four rounds.' },
      { topic: 'asm-divider', note: 'Subtract, test the sign, restore.' },
      { topic: 'asm-gcd', note: 'One subtraction per clock.' },
      { topic: 'asm-traffic', note: 'A timer register counts the phases.' },
      { topic: 'asm-vending', note: 'A SUM register instead of a state per amount.' },
      { lesson: 'rtl-l-timers', note: 'When to move a count into a register.' },
    ],
  });

  // ---- what the diagram checker looks at on these pages -------------------------------------------------------
  if (S.Checks) {
    const ready = (sel) => "document.querySelector('" + sel + "')";
    for (const l of C.lessons.values()) if (/^rtl-l-/.test(l.id)) S.Checks.push({ group: 'learn', name: 'rtl lesson ' + l.id, hash: 'lesson=' + l.id, ready: ready('#lessonView'), sel: '#main' });
    S.Checks.push({ group: 'courses', name: 'rtl course', hash: 'course=rtl-course', ready: ready('#courseView'), sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
