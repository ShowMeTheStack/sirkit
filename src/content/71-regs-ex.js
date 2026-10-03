// Part 7 exercises: registers and counters. Waveforms are checked slot by slot against the simulator, circuits by
// exhaustive simulation over input sequences, timing numbers by Sirkit.Sim.sta, state-machine stages by
// Sirkit.Fsm, and Verilog against hidden testbenches. Every hard-coded answer here was worked out by those engines.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.exercises.has('p7x-load-wave')) return;
  const P = S.P7 || {};
  const ex = (chapter) => (o) => C.exercise(Object.assign({ chapter, level: 2 }, o));

  // =========================================================================================================
  // Registers
  // =========================================================================================================
  const X1 = ex('p7-ch-registers');
  X1({
    id: 'p7x-load-wave', title: 'Load or hold', level: 1, kind: 'waveform', circuit: P.load2, clocked: true,
    inputs: { LD: '01101001', D1: '10110110', D0: '11010011' }, outputs: ['Q1', 'Q0'], given: { Q1: '0???????', Q0: '0???????' },
    text: ['A 2-bit register with parallel load starts at 00. At each edge it takes D1 D0 if LD = 1 and holds if LD = 0. Each slot shows Q before its edge. Complete Q1 and Q0.'],
    hints: ['A load at the edge of slot k shows up in slot k + 1.', 'Loads happen at the edges of slots 2, 3, 5 and 8: D1 D0 = 01, 11, 00 and 11.', 'Q1: 0 0 0 1 1 0 0 0. Q0: 0 0 1 0 0 0 0 0.'],
    solution: { Q1: '00011000', Q0: '00100000' },
    wrong: [{ Q1: '10110110', Q0: '11010011' }, { Q1: '00111000', Q0: '01100000' }, { Q1: '00011000', Q0: '00110000' }],
  });
  X1({
    id: 'p7x-load-build', title: 'Build a register with load', kind: 'circuit', refCircuit: P.load2, inputs: ['LD', 'D1', 'D0'], outputs: ['Q1', 'Q0'], parts: ['DFF', 'MUX'], maxGates: 4,
    text: ['Build a 2-bit register: at each clock edge, Q1 Q0 take D1 D0 when LD = 1 and keep their value when LD = 0. Use D flip-flops and 2-to-1 multiplexers only, and leave the clock alone.', 'A multiplexer is written m = MUX(d0=…, d1=…, s0=…): it passes d1 when s0 = 1.'],
    hints: ['Each flip-flop needs a multiplexer in front of its D.', 'With LD = 0 the multiplexer must give the flip-flop its own Q back.', 'm1 = MUX(d0=q1, d1=D1, s0=LD); q1 = DFF(m1); the same for bit 0; Q1 = q1; Q0 = q0.'],
    solution: P.load2,
    wrong: ['q1 = DFF(D1)\nq0 = DFF(D0)\nQ1 = q1\nQ0 = q0', 'm1 = MUX(d0=D1, d1=q1, s0=LD)\nq1 = DFF(m1)\nm0 = MUX(d0=D0, d1=q0, s0=LD)\nq0 = DFF(m0)\nQ1 = q1\nQ0 = q0', 'a = AND(D1, LD)\nq1 = DFF(a)\nb = AND(D0, LD)\nq0 = DFF(b)\nQ1 = q1\nQ0 = q0'],
  });
  X1({
    id: 'p7x-gated-clock', title: 'Why not gate the clock?', kind: 'choice',
    text: ['To make a register hold, someone feeds its flip-flops the clock ANDed with LD instead of using multiplexers. Which problems does this cause? Choose all that apply.'],
    options: ['The AND gate delays the register\'s clock, so it is skewed against every other flip-flop', 'A glitch on LD while the clock is high becomes an extra clock edge', 'If LD rises while the clock is high, the register sees a rising edge at the wrong time', 'The register can no longer be loaded at all'],
    answer: [0, 1, 2],
    hints: ['Think about what the AND gate does to the timing of the edge.', 'Think about what a short pulse on LD does while the clock is 1.', 'The first three are all real: skew, glitches turned into edges, and edges at the wrong moment. Loading still works.'],
    solution: [0, 1, 2], wrong: [[0], [0, 1, 2, 3], [3]],
  });
  X1({
    id: 'p7x-shift-wave', title: 'Bits marching through', level: 1, kind: 'waveform', circuit: P.shift3, clocked: true,
    inputs: { SI: '10110010' }, outputs: ['Q0', 'Q1', 'Q2'], given: { Q0: '0???????', Q1: '0???????', Q2: '0???????' },
    text: ['A 3-bit shift register SI → Q0 → Q1 → Q2 starts at 000. Complete all three outputs, read before each edge.'],
    hints: ['Q0 in slot k + 1 is SI of slot k.', 'Q1 is Q0 one slot later, and Q2 is Q1 one slot later.', 'Q0: 0 1 0 1 1 0 0 1. Q1: 0 0 1 0 1 1 0 0. Q2: 0 0 0 1 0 1 1 0.'],
    solution: { Q0: '01011001', Q1: '00101100', Q2: '00010110' },
    wrong: [{ Q0: '10110010', Q1: '01011001', Q2: '00101100' }, { Q0: '01011001', Q1: '01011001', Q2: '01011001' }],
  });
  X1({
    id: 'p7x-shift-build', title: 'Build a shift register', level: 1, kind: 'circuit', refCircuit: P.shift3, inputs: ['SI'], outputs: ['Q0', 'Q1', 'Q2'], parts: ['DFF'], maxGates: 3,
    text: ['Build a 3-bit serial-in, parallel-out shift register: SI enters Q0, Q0 moves to Q1, Q1 to Q2, at each edge.'],
    hints: ['Three D flip-flops in a chain.', 'Each D comes from the Q before it.', 'q0 = DFF(SI); q1 = DFF(q0); q2 = DFF(q1); Q0 = q0; Q1 = q1; Q2 = q2.'],
    solution: P.shift3,
    wrong: ['q0 = DFF(SI)\nq1 = DFF(SI)\nq2 = DFF(SI)\nQ0 = q0\nQ1 = q1\nQ2 = q2', 'q0 = DFF(SI)\nq1 = DFF(q0)\nq2 = DFF(q1)\nQ0 = q2\nQ1 = q1\nQ2 = q0'],
  });
  X1({
    id: 'p7x-serial-clocks', title: 'How many clocks to move a byte?', level: 1, kind: 'number', answer: 8, higherLower: true,
    text: ['Two 8-bit shift registers are joined so that A\'s serial output feeds B\'s serial input. How many clock edges with shifting enabled does it take to move all of A\'s word into B?'],
    hints: ['Each edge moves every bit one place.', 'A\'s last bit must travel all the way into B.', 'One edge per bit: 8.'],
    solution: 8, wrong: [7, 16], why: 'Serial transfer trades wires for time: one wire, one edge per bit.',
  });
  X1({
    id: 'p7x-shift-en-wave', title: 'Shifting only when told', kind: 'waveform', circuit: 'q0 = DFF[en](SI, SH)\nq1 = DFF[en](q0, SH)\nq2 = DFF[en](q1, SH)\nQ2 = q2', clocked: true,
    inputs: { SI: '110110010', SH: '110101101' }, outputs: ['Q2'], given: { Q2: '0????????' },
    text: ['A 3-bit shift register shifts only at edges where SH = 1 (each flip-flop has a clock enable wired to SH). It starts at 000. Complete Q2, the bit that leaves the register.'],
    hints: ['An edge with SH = 0 changes nothing, so count only the edges with SH = 1.', 'Shifts happen at the edges of slots 1, 2, 4, 6, 7 and 9, and the bits that enter there are 1, 1, 1, 0, 0, 0. Each reaches Q2 three shifts later.', 'Q2: 0 0 0 0 1 1 1 1 1.'],
    solution: { Q2: '000011111' },
    wrong: [{ Q2: '000110110' }, { Q2: '000011110' }],
  });
  X1({
    id: 'p7x-usr-mode', title: 'Which mode?', level: 1, kind: 'choice',
    text: ['A 74194 holds QA..QD = 0110. After one clock edge it holds 1011. Which mode was it in, and which serial input was 1?'],
    options: ['S1 S0 = 01, shift right, with SR = 1', 'S1 S0 = 10, shift left, with SL = 1', 'S1 S0 = 11, load', 'S1 S0 = 00, hold'],
    answer: 0, whyNot: { 1: 'Shift left takes each bit from its right-hand neighbour: from 0110 it gives 1 1 0 and then SL, never 1011.', 2: 'A load could produce any word, but only if A..D were 1011; nothing says so, and a shift explains it.', 3: 'Hold would leave 0110.' },
    hints: ['Shift right moves each bit one place toward QD, with SR entering QA; shift left moves them toward QA, with SL entering QD.', 'Shift left from 0110 gives 1 1 0 and then SL: 110x. That cannot be 1011.', 'Shift right from 0110 gives SR 0 1 1: with SR = 1 that is 1011. Mode 01, SR = 1.'],
    solution: 0, wrong: [1, 3],
  });
  X1({
    id: 'p7x-usr-table', title: 'Four edges of a 74194', kind: 'table', table: 'custom', cellKind: 'text',
    rows: ['edge 1: S1 S0 = 11, A..D = 1001', 'edge 2: S1 S0 = 01, SR = 0', 'edge 3: S1 S0 = 00', 'edge 4: S1 S0 = 10, SL = 1', 'edge 5: S1 S0 = 01, SR = 1'], cols: ['QA..QD after'], corner: 'from 0000',
    cells: { 'edge 1: S1 S0 = 11, A..D = 1001|QA..QD after': '1001', 'edge 2: S1 S0 = 01, SR = 0|QA..QD after': '0100', 'edge 3: S1 S0 = 00|QA..QD after': '0100', 'edge 4: S1 S0 = 10, SL = 1|QA..QD after': '1001', 'edge 5: S1 S0 = 01, SR = 1|QA..QD after': '1100' },
    text: ['A 74194 starts at QA..QD = 0000 and sees these five edges in turn. Write QA..QD after each, as four bits.'],
    hints: ['11 loads A..D; 01 shifts right (SR into QA); 10 shifts left (SL into QD); 00 holds.', 'After the load, 1001 shifted right with SR = 0 is 0100.', '1001, 0100, 0100, 1001, 1100.'],
    solution: { 'edge 1: S1 S0 = 11, A..D = 1001|QA..QD after': '1001', 'edge 2: S1 S0 = 01, SR = 0|QA..QD after': '0100', 'edge 3: S1 S0 = 00|QA..QD after': '0100', 'edge 4: S1 S0 = 10, SL = 1|QA..QD after': '1001', 'edge 5: S1 S0 = 01, SR = 1|QA..QD after': '1100' },
    wrong: [{ 'edge 1: S1 S0 = 11, A..D = 1001|QA..QD after': '1001', 'edge 2: S1 S0 = 01, SR = 0|QA..QD after': '0010', 'edge 3: S1 S0 = 00|QA..QD after': '0010', 'edge 4: S1 S0 = 10, SL = 1|QA..QD after': '0101', 'edge 5: S1 S0 = 01, SR = 1|QA..QD after': '1010' }, { 'edge 1: S1 S0 = 11, A..D = 1001|QA..QD after': '1001', 'edge 2: S1 S0 = 01, SR = 0|QA..QD after': '0100', 'edge 3: S1 S0 = 00|QA..QD after': '0000', 'edge 4: S1 S0 = 10, SL = 1|QA..QD after': '0001', 'edge 5: S1 S0 = 01, SR = 1|QA..QD after': '1000' }],
  });
  X1({
    id: 'p7x-shift-verilog', title: 'A shift register in Verilog', kind: 'verilog', module: 'sipo4', ports: 'input clk, si; output reg [3:0] q', synth: true,
    start: 'module sipo4(input clk, input si, output reg [3:0] q);\n  \nendmodule\n',
    testbench: 'module tb;\n  reg clk, si; wire [3:0] q; integer i; reg [7:0] pat;\n  sipo4 u(.clk(clk), .si(si), .q(q));\n  initial begin\n    clk = 0; pat = 8\'b10110010;\n    for (i = 7; i >= 0; i = i - 1) begin\n      si = pat[i]; #1 clk = 1; #1 clk = 0;\n      if (i <= 4 && q !== pat[i +: 4]) $display("FAIL after shifting in bit %0d: q=%b, expected %b", 7 - i, q, pat[i +: 4]);\n    end\n    $display("DONE");\n  end\nendmodule',
    pass: 'DONE',
    text: ['Write a 4-bit serial-in, parallel-out shift register: at each rising edge of clk, si enters q[0] and every bit moves up one place (q[0] to q[1], and so on); q[3] is the oldest bit.'],
    hints: ['One clocked always block with a non-blocking assignment.', 'The new q is the old q[2:0] with si stuck on the right.', 'always @(posedge clk) q <= {q[2:0], si};'],
    solution: 'module sipo4(input clk, input si, output reg [3:0] q);\n  always @(posedge clk) q <= {q[2:0], si};\nendmodule\n',
    wrong: ['module sipo4(input clk, input si, output reg [3:0] q);\n  always @(posedge clk) q <= {si, q[3:1]};\nendmodule\n', 'module sipo4(input clk, input si, output reg [3:0] q);\n  always @(posedge clk) q[0] <= si;\nendmodule\n'],
  });
  X1({
    id: 'p7x-usr-verilog', title: 'A universal shift register in Verilog', level: 3, kind: 'verilog', module: 'usr4', ports: 'input clk, clr_n, sr, sl; input [1:0] s; input [3:0] d; output reg [3:0] q', synth: true,
    start: 'module usr4(input clk, input clr_n,\n            input [1:0] s, input sr, input sl,\n            input [3:0] d, output reg [3:0] q);\n  // q[0] is QA, q[3] is QD\n  \nendmodule\n',
    testbench: 'module tb;\n  reg clk, clr_n, sr, sl; reg [1:0] s; reg [3:0] d; wire [3:0] q;\n  usr4 u(.clk(clk), .clr_n(clr_n), .s(s), .sr(sr), .sl(sl), .d(d), .q(q));\n  task edge_(input [3:0] want, input [8*12:1] what);\n    begin #1 clk = 1; #1 clk = 0; if (q !== want) $display("FAIL %0s: q=%b, expected %b", what, q, want); end\n  endtask\n  initial begin\n    clk = 0; clr_n = 1; s = 0; sr = 0; sl = 0; d = 0; #1;\n    clr_n = 0; #1;\n    if (q !== 4\'b0000) $display("FAIL clr_n=0 with no edge: q=%b, expected 0000 at once", q);\n    clr_n = 1;\n    s = 3; d = 4\'b1001; edge_(4\'b1001, "load");\n    s = 1; sr = 1; edge_(4\'b0011, "shift right");\n    s = 0; edge_(4\'b0011, "hold");\n    s = 2; sl = 1; edge_(4\'b1001, "shift left");\n    s = 2; sl = 0; edge_(4\'b0100, "shift left");\n    s = 1; sr = 0; edge_(4\'b1000, "shift right");\n    $display("DONE");\n  end\nendmodule',
    pass: 'DONE',
    text: ['Write a 4-bit universal shift register like the 74194, with q[0] as QA and q[3] as QD. clr_n = 0 clears q at once (asynchronous). At each rising edge, s chooses: 0 hold; 1 shift right (sr enters q[0], each bit moves toward q[3]); 2 shift left (sl enters q[3], each bit moves toward q[0]); 3 load d.'],
    hints: ['Put the clear in the sensitivity list: always @(posedge clk or negedge clr_n).', 'A case on s: shift right is {q[2:0], sr}; shift left is {sl, q[3:1]}.', 'if (!clr_n) q <= 0; else case (s) 1: q <= {q[2:0], sr}; 2: q <= {sl, q[3:1]}; 3: q <= d; default: q <= q; endcase'],
    solution: 'module usr4(input clk, input clr_n, input [1:0] s, input sr, input sl, input [3:0] d, output reg [3:0] q);\n  always @(posedge clk or negedge clr_n)\n    if (!clr_n) q <= 4\'b0000;\n    else case (s)\n      2\'d1: q <= {q[2:0], sr};\n      2\'d2: q <= {sl, q[3:1]};\n      2\'d3: q <= d;\n      default: q <= q;\n    endcase\nendmodule\n',
    wrong: ['module usr4(input clk, input clr_n, input [1:0] s, input sr, input sl, input [3:0] d, output reg [3:0] q);\n  always @(posedge clk or negedge clr_n)\n    if (!clr_n) q <= 4\'b0000;\n    else case (s)\n      2\'d1: q <= {sl, q[3:1]};\n      2\'d2: q <= {q[2:0], sr};\n      2\'d3: q <= d;\n      default: q <= q;\n    endcase\nendmodule\n', 'module usr4(input clk, input clr_n, input [1:0] s, input sr, input sl, input [3:0] d, output reg [3:0] q);\n  always @(posedge clk)\n    if (!clr_n) q <= 4\'b0000;\n    else case (s)\n      2\'d1: q <= {q[2:0], sr};\n      2\'d2: q <= {sl, q[3:1]};\n      2\'d3: q <= d;\n      default: q <= q;\n    endcase\nendmodule\n'],
  });

  // =========================================================================================================
  // Ripple counters
  // =========================================================================================================
  const X2 = ex('p7-ch-ripple');
  X2({
    id: 'p7x-ripple-settle', title: 'The worst ripple', level: 1, kind: 'number', answer: 56, higherLower: true,
    text: ['A 4-bit ripple counter is built from CMOS flip-flops with a clock-to-Q of 14 ns. What is the longest time, in ns, from a clock edge until the count is settled?'],
    hints: ['The worst edge is the one where every bit changes.', 'From 0111 to 1000 (or 1111 to 0000) the change passes through all four flip-flops, one after another.', '4 × 14 = 56 ns. The ripple-counter topic with 4 bits says the same.'],
    solution: 56, wrong: [14, 42],
  });
  X2({
    id: 'p7x-ripple-false', title: 'The false counts', kind: 'string', answer: ['6, 4, 0', '6 4 0'],
    text: ['A 4-bit ripple counter goes from 7 to 8. Which counts, in decimal and in order, do its outputs show on the way? Write them separated by commas.'],
    hints: ['7 is 0111. Q0 changes first, then Q1, then Q2, then Q3.', 'After Q0: 0110. After Q1: 0100.', 'After Q2: 0000, and only then Q3 gives 1000. The false counts are 6, 4, 0.'],
    solution: '6, 4, 0', wrong: ['8', '0, 4, 6'], whyNot: 'Work it bit by bit from 0111: Q0 changes first, and each later bit waits for the one before it.',
  });
  X2({
    id: 'p7x-ripple-down', title: 'A ripple counter that counts down', kind: 'choice',
    text: ['In a ripple counter of rising-edge T flip-flops (T = 1), each stage after the first is clocked from Q′ of the stage before, and it counts up. What happens if each stage is clocked from Q instead?'],
    options: ['It counts down', 'It still counts up, only slower', 'It stops counting', 'Every stage toggles together'],
    answer: 0, whyNot: { 1: 'The speed does not change: one clock-to-Q per stage either way.', 2: 'Each stage still sees edges: they are just the other edges.', 3: 'The stages are still clocked one after another.' },
    hints: ['Counting up, a bit flips when the bit below it falls from 1 to 0.', 'Q rises exactly when Q′ falls: clocking from Q makes a bit flip when the bit below it rises from 0 to 1.', 'That is the rule for counting down: 000 → 111 → 110 → …'],
    solution: 0, wrong: [1, 2],
  });
  X2({
    id: 'p7x-ripple-read', title: 'When may the count be decoded?', level: 3, kind: 'number', answer: 68, higherLower: true,
    text: ['A 4-bit CMOS ripple counter (clock-to-Q 14 ns) drives a 4-input AND gate that detects 1111 (12 ns, as the timing analysis puts a 4-input CMOS AND). How long after a clock edge, in ns, is the AND gate\'s output certain to be valid, whatever the edge?'],
    hints: ['First the count must settle, in the worst case.', 'The worst ripple is four clock-to-Q delays.', '4 × 14 + 12 = 68 ns.'],
    solution: 68, wrong: [56, 26],
  });
  X2({
    id: 'p7x-bcd-glitch', title: 'The glitch of the decade counter', level: 1, kind: 'choice',
    text: ['A 4-bit ripple counter is made to count 0 to 9 by a NAND of Q3 and Q1 driving the asynchronous clear of every flip-flop. Which is true?'],
    options: ['The count 10 never appears at the outputs', 'The count 10 appears for a few nanoseconds after every tenth clock edge', 'The count goes 0 to 10', 'The count goes 1 to 10'],
    answer: 1, whyNot: { 0: 'The NAND can only see 1010 once it is there, so it is there, briefly.', 2: 'The clear acts at once, long before the next edge: 10 is not a full count.', 3: 'The clear takes the counter to 0000.' },
    hints: ['What does the NAND need to see before it clears?', 'It needs 1010 on Q3..Q0.', 'So 1010 exists until the clear acts: a short pulse every tenth edge.'],
    solution: 1, wrong: [0, 2],
  });
  X2({
    id: 'p7x-bcd-clear', title: 'Detecting ten', kind: 'expr', ref: "(Q3Q1)'", vars: ['Q3', 'Q2', 'Q1', 'Q0'], maxLiterals: 2,
    text: ['A counter that only ever reaches 0 to 10 must be cleared, through an active-low CLR′, the moment it reaches 10 (1010). Write CLR′ with two literals, using the fact that 11 to 15 never occur.'],
    hints: ['CLR′ must be 0 exactly at 1010 among 0 to 10.', 'Of 0 to 10, only 1010 has both Q3 = 1 and Q1 = 1.', "CLR′ = (Q3Q1)′, a two-input NAND."],
    solution: "(Q3Q1)'", wrong: ["(Q3Q2'Q1Q0')'", "Q3Q1", "(Q3Q0)'"],
  });

  // =========================================================================================================
  // Synchronous counters
  // =========================================================================================================
  const X3 = ex('p7-ch-sync');
  X3({
    id: 'p7x-sync-wave', title: 'A counter with enable', level: 1, kind: 'waveform', circuit: P.sync3, clocked: true,
    inputs: { EN: '110111101' }, outputs: ['Q2', 'Q1', 'Q0'], given: { Q2: '0????????', Q1: '0????????', Q0: '0????????' },
    text: ['A 3-bit synchronous counter counts up at each edge with EN = 1 and holds at each edge with EN = 0. It starts at 000. Complete Q2, Q1 and Q0.'],
    hints: ['Read the count before each edge: it goes up by one after each slot with EN = 1.', 'The counts before the edges are 0, 1, 2, 2, 3, 4, 5, 6, 6.', 'Q2: 0 0 0 0 0 1 1 1 1. Q1: 0 0 1 1 1 0 0 1 1. Q0: 0 1 0 0 1 0 1 0 0.'],
    solution: { Q2: '000001111', Q1: '001110011', Q0: '010010100' },
    wrong: [{ Q2: '000011110', Q1: '001100110', Q0: '010101010' }, { Q2: '000001111', Q1: '001110011', Q0: '010101010' }],
  });
  X3({
    id: 'p7x-sync-build', title: 'Build a synchronous counter', kind: 'circuit', refCircuit: P.sync3, inputs: ['EN'], outputs: ['Q0', 'Q1', 'Q2'], parts: ['TFF', 'AND'], maxGates: 5,
    text: ['Build a 3-bit synchronous up counter with enable EN from T flip-flops and two-input AND gates, at most five parts in all.'],
    hints: ['Bit i toggles when EN = 1 and every bit below it is 1.', 'T0 = EN, T1 = EN·Q0, T2 = T1·Q1.', 'q0 = TFF(EN); t1 = AND(EN, q0); q1 = TFF(t1); t2 = AND(t1, q1); q2 = TFF(t2); Q0 = q0; Q1 = q1; Q2 = q2.'],
    solution: P.sync3,
    wrong: ['q0 = TFF(EN)\nq1 = TFF(q0)\nt2 = AND(q0, q1)\nq2 = TFF(t2)\nQ0 = q0\nQ1 = q1\nQ2 = q2', 'q0 = TFF(EN)\nt1 = AND(EN, q0)\nq1 = TFF(t1)\nq2 = TFF(q1)\nQ0 = q0\nQ1 = q1\nQ2 = q2'],
  });
  X3({
    id: 'p7x-sync-fmax', title: 'Four bits, chained carries', kind: 'timing', tech: 'CMOS', ask: 'fmax',
    circuit: 'q0 = TFF(EN)\nt1 = AND(EN, q0)\nq1 = TFF(t1)\nt2 = AND(t1, q1)\nq2 = TFF(t2)\nt3 = AND(t2, q2)\nq3 = TFF(t3)\nQ0 = q0\nQ1 = q1\nQ2 = q2\nQ3 = q3',
    text: ['A 4-bit synchronous counter with enable uses chained AND gates: T1 = EN·Q0, T2 = T1·Q1, T3 = T2·Q2. With the CMOS preset (clock-to-Q 14 ns, AND 10 ns, setup 12 ns), what is its maximum clock frequency, in MHz?'],
    hints: ['The slowest path runs from q0 through all three AND gates to T3.', 'Period: 14 + 3 × 10 + 12 = 56 ns.', '1 / 56 ns = 17.857 MHz.'],
    solution: 17.857, wrong: [27.778, 21.739],
  });
  X3({
    id: 'p7x-sync-ttl', title: 'The 3-bit counter in TTL', kind: 'timing', circuit: P.sync3, tech: 'TTL', ask: 'tmin',
    text: ['The 3-bit synchronous counter with enable (T1 = EN·Q0, T2 = T1·Q1) built with the TTL preset: clock-to-Q 20 ns, AND 17.5 ns, setup 20 ns. What is its minimum clock period, in ns?'],
    hints: ['The slowest path goes from a flip-flop through two AND gates.', 'q0 → t1 → t2: 20 + 17.5 + 17.5 = 55 ns to T2.', '55 + 20 = 75 ns.'],
    solution: 75, wrong: [57.5, 55],
  });
  X3({
    id: 'p7x-updown-wave', title: 'Up and down', kind: 'waveform', circuit: P.updown2, clocked: true,
    inputs: { UP: '10011100' }, outputs: ['Q1', 'Q0'], given: { Q1: '0???????', Q0: '0???????' },
    text: ['A 2-bit up/down counter starts at 00. At each edge it counts up if UP = 1 and down if UP = 0, wrapping round both ways. Complete Q1 and Q0.'],
    hints: ['Down from 00 is 11.', 'The counts before each edge: 0, 1, 0, 3, 0, 1, 2, 1.', 'Q1: 0 0 0 1 0 0 1 0. Q0: 0 1 0 1 0 1 0 1.'],
    solution: { Q1: '00010010', Q0: '01010101' },
    wrong: [{ Q1: '00000010', Q0: '01010101' }, { Q1: '00110011', Q0: '01010101' }],
  });
  X3({
    id: 'p7x-updown-build', title: 'Build an up/down counter', level: 3, kind: 'circuit', refCircuit: P.updown2, inputs: ['UP'], outputs: ['Q0', 'Q1'], parts: ['TFF', 'XOR', 'XNOR', 'AND', 'OR', 'NOT'], maxGates: 3,
    text: ['Build a 2-bit counter that counts up when UP = 1 and down when UP = 0, from two T flip-flops and one gate.'],
    hints: ['Q0 toggles at every edge either way: T0 = 1.', 'Q1 toggles counting up when Q0 = 1, and counting down when Q0 = 0: T1 = UP·Q0 + UP′·Q0′.', 'q0 = TFF(1); t1 = XNOR(UP, q0); q1 = TFF(t1); Q0 = q0; Q1 = q1.'],
    solution: P.updown2,
    wrong: ['q0 = TFF(1)\nt1 = XOR(UP, q0)\nq1 = TFF(t1)\nQ0 = q0\nQ1 = q1', 'q0 = TFF(1)\nq1 = TFF(q0)\nQ0 = q0\nQ1 = q1', 'q0 = TFF(UP)\nt1 = XNOR(UP, q0)\nq1 = TFF(t1)\nQ0 = q0\nQ1 = q1'],
  });
  X3({
    id: 'p7x-counter-verilog', title: 'A decade counter in Verilog', kind: 'verilog', module: 'dec10', ports: 'input clk, clr, en; output reg [3:0] q', synth: true,
    start: 'module dec10(input clk, input clr, input en, output reg [3:0] q);\n  \nendmodule\n',
    testbench: 'module tb;\n  reg clk, clr, en; wire [3:0] q; integer i; reg [3:0] want;\n  dec10 u(.clk(clk), .clr(clr), .en(en), .q(q));\n  initial begin\n    clk = 0; clr = 1; en = 0; #1 clk = 1; #1 clk = 0;\n    if (q !== 0) $display("FAIL after an edge with clr=1: q=%b, expected 0000", q);\n    clr = 0; en = 1; want = 0;\n    for (i = 0; i < 23; i = i + 1) begin\n      en = (i != 5); #1 clk = 1; #1 clk = 0;\n      if (en) want = (want == 9) ? 0 : want + 1;\n      if (q !== want) $display("FAIL edge %0d (en=%b): q=%0d, expected %0d", i + 1, en, q, want);\n    end\n    clr = 1; #1;\n    if (q !== want) $display("FAIL clr rose with no edge: q=%0d, expected %0d (the clear is synchronous)", q, want);\n    $display("DONE");\n  end\nendmodule',
    pass: 'DONE',
    text: ['Write a synchronous decade counter: at each rising edge, clr = 1 sets q to 0; otherwise, if en = 1, q counts up, from 9 back to 0; if en = 0 it holds. The clear acts only at an edge.'],
    hints: ['One always @(posedge clk) block; clr first, then en.', 'At 9 the next value is 0, not 10.', 'if (clr) q <= 0; else if (en) q <= (q == 9) ? 0 : q + 1;'],
    solution: 'module dec10(input clk, input clr, input en, output reg [3:0] q);\n  always @(posedge clk)\n    if (clr) q <= 4\'d0;\n    else if (en) q <= (q == 4\'d9) ? 4\'d0 : q + 4\'d1;\nendmodule\n',
    wrong: ['module dec10(input clk, input clr, input en, output reg [3:0] q);\n  always @(posedge clk)\n    if (clr) q <= 4\'d0;\n    else if (en) q <= q + 4\'d1;\nendmodule\n', 'module dec10(input clk, input clr, input en, output reg [3:0] q);\n  always @(posedge clk or posedge clr)\n    if (clr) q <= 4\'d0;\n    else if (en) q <= (q == 4\'d9) ? 4\'d0 : q + 4\'d1;\nendmodule\n'],
  });
  X3({
    id: 'p7x-mod10-choice', title: 'Clear at ten or at nine?', level: 1, kind: 'choice',
    text: ['To make a 4-bit counter chip count 0 to 9, a NAND gate decodes one count and drives the chip\'s active-low CLR′. Which count must it decode on a 74161 (asynchronous clear) and on a 74163 (synchronous clear)?'],
    options: ['74161: 10; 74163: 9', '74161: 9; 74163: 10', 'Both: 10', 'Both: 9'],
    answer: 0, whyNot: { 1: 'It is the other way round: the clear that waits for the edge must be told one count earlier.', 2: 'On the 74163 the clear waits for the edge after 10, so 10 would be a full count.', 3: 'On the 74161 the clear acts at once, so decoding 9 would skip 9.' },
    hints: ['An asynchronous clear acts the moment the decoded count appears.', 'A synchronous clear acts at the next edge, after the decoded count has had its full clock period.', '74161: decode 10 (it flashes for a moment); 74163: decode 9.'],
    solution: 0, wrong: [1, 2, 3],
  });
  X3({
    id: 'p7x-mod12-detect', title: 'A mod-12 counter on a 74163', kind: 'simplify', vars: ['Q3', 'Q2', 'Q1', 'Q0'], minterms: [11], dc: [12, 13, 14, 15], form: 'sop', maxLiterals: 3,
    text: ['A 74163 is to count 0 to 11. A NAND gate drives its synchronous CLR′, so the NAND\'s inputs must all be 1 at exactly the count that comes before the clear. Write that AND term, F = 1 at the count to decode, using as few literals as you can (counts 12 to 15 never occur).'],
    hints: ['The synchronous clear must act at the edge after 11, so decode 11 = 1011.', 'Counts 12 to 15 are don\'t-cares. Among 0 to 11, which bits are 1 only in 1011?', 'F = Q3Q1Q0: the NAND of Q3, Q1 and Q0 drives CLR′.'],
    solution: 'Q3Q1Q0', wrong: ["Q3Q2'Q1Q0", 'Q3Q1', 'Q3Q2'],
  });
  X3({
    id: 'p7x-lab-mod10', title: 'Mod-10 two ways on the bench', kind: 'lab', lab: 'p7lab-mod10',
    text: ['Wire both counters of the experiment, find the glitch on the analyser, fill in the table and check.'],
    hints: ['Each 74161: VCC pin 16, GND pin 8, CLK pin 2, ENP pin 7 and ENT pin 10 high, A to D low.', 'U2\'s CLR′ is QD·QB of U2 ANDed with S7 (three NAND gates); U3\'s LOAD′ is the NAND of its own QD and QA, and its CLR′ is S7.', 'Both count 0 to 9 and go back to 0; only U2 shows 10 for a moment.'],
    solution: { bench: C.labs.get('p7lab-mod10').reference, observe: Object.assign({}, C.labs.get('p7lab-mod10').observe.cells) },
    wrong: [{ bench: { chips: C.labs.get('p7lab-mod10').reference.chips, jumpers: C.labs.get('p7lab-mod10').reference.jumpers.filter((j) => j[1] !== 'sw7') } }, { bench: C.labs.get('p7lab-mod10').reference, observe: Object.assign({}, C.labs.get('p7lab-mod10').observe.cells, { '10 flashes on QB|U3 (load)': '1' }) }],
  });
  X3({
    id: 'p7x-lockout', title: 'Locked out', kind: 'choice',
    text: ['A 3-bit Johnson counter (Q2′ fed back to D0, then D1 = Q0, D2 = Q1) runs through 000, 100, 110, 111, 011, 001. Noise leaves it in 010. What happens next?'],
    options: ['It goes to 101 and back to 010 for ever', 'It goes to 001 and rejoins the count', 'It goes to 000', 'It stops changing'],
    answer: 0, whyNot: { 1: 'Shift 010 with Q2′ = 1 entering Q0: the next state is 1 0 1, not 001.', 2: 'Nothing clears it; the shift rule just keeps applying.', 3: 'It keeps shifting at every edge.' },
    hints: ['Q0 takes Q2′, Q1 takes Q0, Q2 takes Q1.', 'From Q0 Q1 Q2 = 010: Q0 = 1, Q1 = 0, Q2 = 1, so 101.', 'From 101: Q0 = 0, Q1 = 1, Q2 = 0, back to 010: a cycle of its own, lock-out.'],
    solution: 0, wrong: [1, 2],
  });
  const U6 = { '110|next': '111', '111|next': '100' };
  X3({
    id: 'p7x-unused-next', title: 'Where the unused states go', kind: 'table', table: 'custom', cellKind: 'text', rows: ['110', '111'], cols: ['next'], corner: 'Q2 Q1 Q0', cells: U6,
    text: ['A mod-6 counter was designed with D2 = Q2Q0′ + Q1Q0, D1 = Q2′Q1′Q0 + Q1Q0′ and D0 = Q0′. Its sequence is 000 to 101. Where does it go from each unused state? Write the next Q2 Q1 Q0.'],
    hints: ['Put the state into the three equations.', 'From 110: D2 = 1·1 + 1·0 = 1, D1 = 0 + 1·1 = 1, D0 = 1.', 'From 110 to 111, and from 111 to 100: back in the sequence, so the counter is self-correcting.'],
    solution: U6, wrong: [{ '110|next': '000', '111|next': '000' }, { '110|next': '111', '111|next': '110' }],
  });
  const MOD6 = 'moore\ninputs E\noutputs Y2 Y1 Y0\nC0/000: 0 -> C0, 1 -> C1\nC1/001: 0 -> C1, 1 -> C2\nC2/010: 0 -> C2, 1 -> C3\nC3/011: 0 -> C3, 1 -> C4\nC4/100: 0 -> C4, 1 -> C5\nC5/101: 0 -> C5, 1 -> C0';
  const MOD6_EQ = "D2 = Q2Q0' + Q2E' + Q1Q0E\nD1 = Q1Q0' + Q1E' + Q2'Q1'Q0E\nD0 = Q0E' + Q0'E\nY2 = Q2\nY1 = Q1\nY0 = Q0";
  X3({
    id: 'p7x-mod6-eq', title: 'Design a mod-6 counter', level: 3, kind: 'fsm', machine: MOD6, stage: 'equations', design: { ff: 'D', assign: 'binary' }, minimal: true,
    text: ['A mod-6 counter with enable E counts 000, 001, … 101 and back to 000 at each edge with E = 1, and holds with E = 0. Its outputs Y2 Y1 Y0 are the state bits Q2 Q1 Q0. With D flip-flops and the codes 110 and 111 as don\'t-cares, write minimal equations for D2, D1, D0 and the outputs.'],
    hints: ['With E = 0 every D is its own Q; with E = 1, D is the next count. Rows 110 and 111 are don\'t-cares.', 'D0 = Q0 ⊕ E. D2 is 1 when Q2 = 1 and the count does not wrap (Q0 = 0, or E = 0), or when 011 counts up.', "D2 = Q2Q0' + Q2E' + Q1Q0E; D1 = Q1Q0' + Q1E' + Q2'Q1'Q0E; D0 = Q0E' + Q0'E; Y2 = Q2; Y1 = Q1; Y0 = Q0."],
    solution: MOD6_EQ,
    wrong: [MOD6_EQ.replace("D1 = Q1Q0' + Q1E' + Q2'Q1'Q0E", "D1 = Q1Q0' + Q1E' + Q1'Q0E"), MOD6_EQ.replace("D2 = Q2Q0' + Q2E' + Q1Q0E", "D2 = Q2Q1'Q0' + Q2E' + Q1Q0E"), MOD6_EQ.replace("D0 = Q0E' + Q0'E", "D0 = Q0'")],
  });
  const GRAY = 'moore\ninputs E\noutputs Y1 Y0\nG0/00: 0 -> G0, 1 -> G1\nG1/01: 0 -> G1, 1 -> G2\nG2/11: 0 -> G2, 1 -> G3\nG3/10: 0 -> G3, 1 -> G0';
  const GRAY_EXC = { 'G0|0|J1': '0', 'G0|0|K1': 'X', 'G0|0|J0': '0', 'G0|0|K0': 'X', 'G0|1|J1': '0', 'G0|1|K1': 'X', 'G0|1|J0': '1', 'G0|1|K0': 'X', 'G1|0|J1': '0', 'G1|0|K1': 'X', 'G1|0|J0': 'X', 'G1|0|K0': '0', 'G1|1|J1': '1', 'G1|1|K1': 'X', 'G1|1|J0': 'X', 'G1|1|K0': '0', 'G2|0|J1': 'X', 'G2|0|K1': '0', 'G2|0|J0': 'X', 'G2|0|K0': '0', 'G2|1|J1': 'X', 'G2|1|K1': '0', 'G2|1|J0': 'X', 'G2|1|K0': '1', 'G3|0|J1': 'X', 'G3|0|K1': '0', 'G3|0|J0': '0', 'G3|0|K0': 'X', 'G3|1|J1': 'X', 'G3|1|K1': '1', 'G3|1|J0': '0', 'G3|1|K0': 'X' };
  X3({
    id: 'p7x-gray-jk', title: 'A Gray-code counter with JK flip-flops', level: 3, kind: 'fsm', machine: GRAY, stage: 'excitation', design: { ff: 'JK', assign: { G0: '00', G1: '01', G2: '11', G3: '10' } },
    text: ['A 2-bit counter steps through the Gray code 00, 01, 11, 10 at each edge with E = 1 and holds with E = 0. The states G0 to G3 have the codes 00, 01, 11, 10 (Q1 Q0). Fill in the JK excitation table: J1, K1, J0, K0 for every state and input, with X for don\'t-care.'],
    hints: ['JK excitation: 0→0 needs J = 0, K = X; 0→1 J = 1, K = X; 1→0 J = X, K = 1; 1→1 J = X, K = 0.', 'Only one bit changes per step: G0 to G1 changes Q0, G1 to G2 changes Q1, G2 to G3 changes Q0, G3 to G0 changes Q1.', 'For example G1 with E = 1 (01 → 11): J1 = 1, K1 = X, J0 = X, K0 = 0. With E = 0 every bit holds.'],
    solution: GRAY_EXC,
    wrong: [Object.assign({}, GRAY_EXC, { 'G1|1|J1': '0' }), Object.assign({}, GRAY_EXC, { 'G3|1|K1': '0', 'G3|1|J0': '1' })],
  });

  // =========================================================================================================
  // Ring, Johnson and sequence generators
  // =========================================================================================================
  const X4 = ex('p7-ch-shiftcount');
  X4({
    id: 'p7x-ring-wave', title: 'A self-starting ring', kind: 'waveform', circuit: P.ring3, clocked: true,
    inputs: { EN: '11011111' }, outputs: ['Q0', 'Q1', 'Q2'], given: { Q0: '0???????', Q1: '0???????', Q2: '0???????' },
    text: ['A 3-bit ring counter shifts Q0 → Q1 → Q2 at each edge with EN = 1, with D0 = (Q0 + Q1)′ so that it starts itself from 000. With EN = 0 it holds. Complete all three outputs.'],
    hints: ['From 000, D0 = 1: a single 1 enters Q0.', 'Then the 1 moves along: 100, 010, 001, and when it reaches Q2, Q0 and Q1 are both 0, so D0 = 1 again.', 'Q0: 0 1 0 0 0 1 0 0. Q1: 0 0 1 1 0 0 1 0. Q2: 0 0 0 0 1 0 0 1.'],
    solution: { Q0: '01000100', Q1: '00110010', Q2: '00001001' },
    wrong: [{ Q0: '01001001', Q1: '00100100', Q2: '00010010' }, { Q0: '00000000', Q1: '00000000', Q2: '00000000' }],
  });
  X4({
    id: 'p7x-johnson-states', title: 'How many states?', level: 1, kind: 'number', answer: 10, higherLower: true,
    text: ['How many states does a Johnson counter with five flip-flops go through before it repeats?'],
    hints: ['From all zeros, ones fill in one at a time, then zeros follow them.', 'Five steps to fill with ones, five to empty again.', '2 × 5 = 10.'],
    solution: 10, wrong: [5, 32],
  });
  X4({
    id: 'p7x-johnson-build', title: 'Build a Johnson counter', kind: 'circuit', refCircuit: P.johnson3, inputs: ['EN'], outputs: ['Q0', 'Q1', 'Q2'], parts: ['DFF'], maxGates: 3,
    text: ['Build a 3-bit Johnson counter from three D flip-flops with clock enables (q = DFF[en](d, EN)): at each edge with EN = 1, Q0 takes Q2′, Q1 takes Q0 and Q2 takes Q1. Remember that q2\' names Q′ of q2.'],
    hints: ['It is a shift register whose input is the complement of its last bit.', 'Each flip-flop is DFF[en](its input, EN).', "q0 = DFF[en](q2', EN); q1 = DFF[en](q0, EN); q2 = DFF[en](q1, EN); Q0 = q0; Q1 = q1; Q2 = q2."],
    solution: P.johnson3,
    wrong: ['q0 = DFF[en](q2, EN)\nq1 = DFF[en](q0, EN)\nq2 = DFF[en](q1, EN)\nQ0 = q0\nQ1 = q1\nQ2 = q2', "q0 = DFF(q2')\nq1 = DFF(q0)\nq2 = DFF(q1)\nQ0 = q0\nQ1 = q1\nQ2 = q2"],
  });
  X4({
    id: 'p7x-johnson-decode', title: 'Decode one Johnson state', kind: 'expr', ref: "Q2Q3'", vars: ['Q0', 'Q1', 'Q2', 'Q3'], maxLiterals: 2,
    text: ['A 4-bit Johnson counter runs Q0 Q1 Q2 Q3 = 0000, 1000, 1100, 1110, 1111, 0111, 0011, 0001. Write a two-literal AND term that is 1 in state 1110 and in no other state of the sequence.'],
    hints: ['In a Johnson sequence each state has one place where the bits change from 1 to 0, or from 0 to 1, or none.', 'In 1110 the boundary is between Q2 = 1 and Q3 = 0.', "Q2·Q3′."],
    solution: "Q2Q3'", wrong: ["Q0Q1Q2Q3'", "Q1Q2", "Q2'Q3"],
  });
  X4({
    id: 'p7x-johnson-verilog', title: 'A Johnson counter in Verilog', kind: 'verilog', module: 'johnson4', ports: 'input clk, rst; output reg [3:0] q', synth: true,
    start: 'module johnson4(input clk, input rst, output reg [3:0] q);\n  \nendmodule\n',
    testbench: 'module tb;\n  reg clk, rst; wire [3:0] q; integer i; reg [3:0] want;\n  johnson4 u(.clk(clk), .rst(rst), .q(q));\n  initial begin\n    clk = 0; rst = 1; #1 clk = 1; #1 clk = 0;\n    if (q !== 0) $display("FAIL after a reset edge: q=%b, expected 0000", q);\n    rst = 0; want = 0;\n    for (i = 0; i < 10; i = i + 1) begin\n      #1 clk = 1; #1 clk = 0;\n      want = {want[2:0], ~want[3]};\n      if (q !== want) $display("FAIL edge %0d: q=%b, expected %b", i + 1, q, want);\n    end\n    $display("DONE");\n  end\nendmodule',
    pass: 'DONE',
    text: ['Write a 4-bit Johnson counter with a synchronous active-high reset: rst = 1 at an edge sets q to 0000; otherwise each edge shifts q up one place (q[0] to q[1] and so on), with the complement of q[3] entering q[0]. From 0000 it runs 0001, 0011, 0111, 1111, 1110, ….'],
    hints: ['One always @(posedge clk) block.', 'The new q is q[2:0] with ~q[3] stuck on the right.', 'if (rst) q <= 0; else q <= {q[2:0], ~q[3]};'],
    solution: 'module johnson4(input clk, input rst, output reg [3:0] q);\n  always @(posedge clk)\n    if (rst) q <= 4\'b0000;\n    else q <= {q[2:0], ~q[3]};\nendmodule\n',
    wrong: ['module johnson4(input clk, input rst, output reg [3:0] q);\n  always @(posedge clk)\n    if (rst) q <= 4\'b0000;\n    else q <= {q[2:0], q[3]};\nendmodule\n', 'module johnson4(input clk, input rst, output reg [3:0] q);\n  always @(posedge clk)\n    if (rst) q <= 4\'b0000;\n    else q <= {~q[0], q[3:1]};\nendmodule\n'],
  });
  X4({
    id: 'p7x-lab-194', title: 'Ring and Johnson on the bench', level: 3, kind: 'lab', lab: 'p7lab-194',
    text: ['Build both counters of the experiment on 74194s, record their states from the analyser, and check.'],
    hints: ['Both 74194s shift right: S1 (pin 10) low, S0 (pin 9) high. CLR′ (pin 1) from S7; A to D and SL low.', 'The ring feed is NOR(NOR(NOR(QA, QB), same), QC) into SR (pin 2); the Johnson feed is NOR(QD, QD).', 'Ring: 1000, 0100, 0010, 0001 and round. Johnson: 1000, 1100, 1110, 1111, 0111, 0011, 0001, 0000.'],
    solution: { bench: C.labs.get('p7lab-194').reference, observe: Object.assign({}, C.labs.get('p7lab-194').observe.cells) },
    wrong: [{ bench: { chips: C.labs.get('p7lab-194').reference.chips, jumpers: C.labs.get('p7lab-194').reference.jumpers.filter((j) => j[1] !== 'Rtp21') } }, { bench: C.labs.get('p7lab-194').reference, observe: Object.assign({}, C.labs.get('p7lab-194').observe.cells, { '5|J: QD': '0' }) }],
  });
  X4({
    id: 'p7x-lfsr-wave', title: 'A sequence from three flip-flops', kind: 'waveform', circuit: P.lfsr3, clocked: true,
    inputs: { EN: '111111111' }, outputs: ['Q2'], given: { Q2: '0????????' },
    text: ['A 3-bit shift register Q0 → Q1 → Q2 takes D0 = (Q1 ⊕ Q2)′ (XNOR feedback) and starts at 000. Complete its output Q2 for nine clocks.'],
    hints: ['Track Q0 Q1 Q2: from 000, D0 = XNOR(0, 0) = 1.', 'The states run 000, 100, 110, 011, 101, 010, 001, then 000 again.', 'Q2: 0 0 0 1 1 0 1 0 0.'],
    solution: { Q2: '000110100' },
    wrong: [{ Q2: '000000000' }, { Q2: '000110101' }],
  });
  X4({
    id: 'p7x-lfsr-period', title: 'The longest sequence', level: 1, kind: 'number', answer: 15, higherLower: true,
    text: ['A 4-bit shift register with XOR feedback from the best taps. How many clocks before its state repeats?'],
    hints: ['A 4-bit register has 16 states.', 'With XOR feedback, 0000 only ever leads to 0000.', 'All the others form one cycle: 2⁴ − 1 = 15.'],
    solution: 15, wrong: [16, 8],
  });

  // every exercise page, for the diagram checker
  if (S.Checks) for (const x of C.exercises.values()) if (/^p7x-/.test(x.id)) S.Checks.push({ group: 'learn', name: 'p7 exercise ' + x.id, hash: 'exercise=' + x.id, ready: "document.querySelector('#exerciseView')", sel: '#main' });
})(globalThis.Sirkit = globalThis.Sirkit || {});
