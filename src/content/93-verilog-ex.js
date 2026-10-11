// Part 12, Verilog: the exercises. The lessons, the tour and the course are in 93-verilog.js. Most exercises are
// modules run against a hidden testbench (exhaustive for small combinational modules, random plus directed cases
// for clocked ones, each printing FAIL with the inputs and values on a mismatch). Two ask for a testbench: the
// student writes a tester module with ports, and the hidden top wires it to a correct design and to broken ones.
// The rest are predictions whose answers come from running Sirkit.Verilog, lint questions whose answers are the
// lint's own warnings, and flip-flop counts from Sirkit.Verilog.synthesise. Every module and testbench is our own.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.exercises.has('p12x-alarm')) return;

  // the chapters (93-verilog.js registers them too; whichever file loads first makes them)
  C.chapter({ id: 'p12-ch-structure', part: 'verilog', n: 1, title: 'Describing structure', blurb: 'Modules and ports, gate primitives and continuous assignment, Verilog\'s width rules and its four values, and designs built from copies of smaller ones.' });
  C.chapter({ id: 'p12-ch-behaviour', part: 'verilog', n: 2, title: 'Behaviour in always blocks', blurb: 'Always blocks and what wakes them, if and case, casez and loops, blocking against non-blocking assignment, and the latches incomplete code builds.' });
  C.chapter({ id: 'p12-ch-clocked', part: 'verilog', n: 3, title: 'Clocked designs and state machines', blurb: 'Registers, counters and shift registers, a register file, Moore and Mealy machines, and a switch debouncer built from a counter and a comparison.' });
  C.chapter({ id: 'p12-ch-verify', part: 'verilog', n: 4, title: 'Testbenches and synthesis', blurb: 'Initial blocks, delays and printing, testbenches that check themselves, test vectors from a file, and what a synthesis tool can and cannot draw.' });

  const ex = (o) => C.exercise(Object.assign({ pass: o.kind === 'verilog' ? 'DONE' : undefined }, o));
  /** a code block with line numbers, for questions that name lines */
  const numbered = (src) => src.split('\n').map((l, i) => String(i + 1).padStart(2, ' ') + '  ' + l).join('\n');
  /** accept(text) for a printed line: the exact text (spaces ignored), or a message for each expected mistake */
  const printed = (want, mistakes) => (t) => {
    const k = String(t).replace(/\s+/g, '');
    if (k === want.replace(/\s+/g, '')) return true;
    for (const [w, msg] of Object.entries(mistakes || {})) if (k === w.replace(/\s+/g, '')) return msg;
    return 'Not quite: run it in your head one statement at a time, keeping track of each variable.';
  };

  // ===========================================================================================================
  // Chapter 1: describing structure
  // ===========================================================================================================
  const ALARM = `module alarm(input door, input window, input armed, input panic, output siren);
  wire open, intruder;
  or  g1(open, door, window);
  and g2(intruder, armed, open);
  or  g3(siren, intruder, panic);
endmodule
`;
  const TB_ALARM = `module tb;
  reg door, window, armed, panic; wire siren; reg want; integer i;
  alarm dut(.door(door), .window(window), .armed(armed), .panic(panic), .siren(siren));
  initial begin
    for (i = 0; i < 16; i = i + 1) begin
      {door, window, armed, panic} = i; #1;
      want = panic | (armed & (door | window));
      if (siren !== want) $display("FAIL door=%b window=%b armed=%b panic=%b: siren=%b, expected %b", door, window, armed, panic, siren, want);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-alarm', chapter: 'p12-ch-structure', title: 'A burglar alarm from gate primitives', level: 1, kind: 'verilog', module: 'alarm', ports: 'input door, window, armed, panic; output siren', synth: true,
    start: 'module alarm(input door, input window, input armed, input panic, output siren);\n  // gate primitives: and, or, not, ... with the output first\n\nendmodule\n',
    testbench: TB_ALARM,
    text: ['Write module alarm. The siren sounds when the panic button is pressed, or when the system is armed and the door or the window is open. Use gate primitives (and, or, not), with wires of your own between them.', 'The hidden testbench tries all 16 settings of the four inputs.'],
    hints: ['Name the middle signals: open = door or window; intruder = armed and open.', 'A primitive lists its output first: or g1(open, door, window);', 'or g1(open, door, window); and g2(intruder, armed, open); or g3(siren, intruder, panic); with wire open, intruder; declared.'],
    solution: ALARM,
    wrong: [ALARM.replace('or  g3(siren, intruder, panic);', 'buf g3(siren, intruder);'), ALARM.replace('and g2(intruder, armed, open);', 'and g2(intruder, armed, door);'), ALARM.replace('module alarm', 'module alarms')],
    why: 'Three gates, three primitives: the netlist reads like the drawing.',
  });

  const CMP2 = `module cmp2(input [1:0] a, input [1:0] b, output eq, output gt, output lt);
  assign eq = (a == b);
  assign gt = (a > b);
  assign lt = (a < b);
endmodule
`;
  const TB_CMP2 = `module tb;
  reg [1:0] a, b; wire eq, gt, lt; integer i;
  cmp2 dut(.a(a), .b(b), .eq(eq), .gt(gt), .lt(lt));
  initial begin
    for (i = 0; i < 16; i = i + 1) begin
      {a, b} = i; #1;
      if (eq !== (a == b)) $display("FAIL a=%0d b=%0d: eq=%b, expected %b", a, b, eq, a == b);
      if (gt !== (a > b)) $display("FAIL a=%0d b=%0d: gt=%b, expected %b", a, b, gt, a > b);
      if (lt !== (a < b)) $display("FAIL a=%0d b=%0d: lt=%b, expected %b", a, b, lt, a < b);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-cmp2', chapter: 'p12-ch-structure', title: 'Compare two 2-bit numbers', level: 1, kind: 'verilog', module: 'cmp2', ports: 'input [1:0] a, b; output eq, gt, lt', synth: true,
    start: 'module cmp2(input [1:0] a, input [1:0] b, output eq, output gt, output lt);\n\nendmodule\n',
    testbench: TB_CMP2,
    text: ['Write module cmp2 with continuous assignments: eq = 1 when a equals b, gt = 1 when a is greater, lt = 1 when a is less. a and b are unsigned 2-bit numbers.', 'The testbench tries all 16 pairs.'],
    hints: ['Each output is one assign.', 'Relational operators give a 1-bit result: (a > b) is 1 or 0.', 'assign eq = (a == b); assign gt = (a > b); assign lt = (a < b);'],
    solution: CMP2,
    wrong: [CMP2.replace('assign lt = (a < b);', 'assign lt = ~gt;'), CMP2.replace('assign eq = (a == b);', 'assign eq = &(a ~^ b[0]);'), CMP2.replace('assign gt = (a > b);', 'assign gt = (a[1] > b[1]);')],
  });

  const SAT = `module satadd4(input [3:0] a, input [3:0] b, output [3:0] s);
  wire [4:0] t;
  assign t = a + b;
  assign s = t[4] ? 4'd15 : t[3:0];
endmodule
`;
  const TB_SAT = `module tb;
  reg [3:0] a, b; wire [3:0] s; integer i, want;
  satadd4 dut(.a(a), .b(b), .s(s));
  initial begin
    for (i = 0; i < 256; i = i + 1) begin
      {a, b} = i; #1;
      want = a + b; if (want > 15) want = 15;
      if (s !== want) $display("FAIL a=%0d b=%0d: s=%0d, expected %0d", a, b, s, want);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-satadd', chapter: 'p12-ch-structure', title: 'An adder that sticks at the top', level: 2, kind: 'verilog', module: 'satadd4', ports: 'input [3:0] a, b; output [3:0] s', synth: true,
    start: 'module satadd4(input [3:0] a, input [3:0] b, output [3:0] s);\n\nendmodule\n',
    testbench: TB_SAT,
    text: ['Write module satadd4, a saturating adder: s = a + b when the sum fits in 4 bits, and s = 15 when it does not (a volume control that stops at full instead of wrapping to quiet).', 'The testbench tries all 256 pairs.'],
    hints: ['The sum of two 4-bit numbers needs 5 bits. Keep the fifth: a 5-bit wire t = a + b.', 'If t[4] is 1 the sum did not fit. The width of the target decides how wide the addition is done.', "wire [4:0] t; assign t = a + b; assign s = t[4] ? 4'd15 : t[3:0];"],
    solution: SAT,
    wrong: ['module satadd4(input [3:0] a, input [3:0] b, output [3:0] s);\n  assign s = a + b;\nendmodule\n', SAT.replace('wire [4:0] t;', 'wire [3:0] t;').replace("t[4] ? 4'd15 : t[3:0]", "(t > 15) ? 4'd15 : t"), SAT.replace("4'd15", "4'd0")],
    why: 'The fifth bit of the sum is the carry: it says the result went past 15.',
  });

  const DEC = `module dec38(input [2:0] a, input en, output [7:0] y);
  assign y = en ? (8'b1 << a) : 8'b0;
endmodule
`;
  const TB_DEC = `module tb;
  reg [2:0] a; reg en; wire [7:0] y; reg [7:0] want; integer i;
  dec38 dut(.a(a), .en(en), .y(y));
  initial begin
    for (i = 0; i < 16; i = i + 1) begin
      {en, a} = i; #1;
      want = en ? (8'b1 << a) : 8'b0;
      if (y !== want) $display("FAIL en=%b a=%0d: y=%b, expected %b", en, a, y, want);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-dec38', chapter: 'p12-ch-structure', title: 'A 3-to-8 decoder with enable', level: 1, kind: 'verilog', module: 'dec38', ports: 'input [2:0] a; input en; output [7:0] y', synth: true,
    start: 'module dec38(input [2:0] a, input en, output [7:0] y);\n\nendmodule\n',
    testbench: TB_DEC,
    text: ['Write module dec38: when en = 1, exactly one output is 1, the one numbered by a (y[a] = 1); when en = 0 every output is 0. One assign is enough.', 'The testbench tries all 16 settings of en and a.'],
    hints: ['A 1 shifted left a places lands at bit a.', "Use the conditional operator for the enable: en ? (something) : 8'b0.", "assign y = en ? (8'b1 << a) : 8'b0;"],
    solution: DEC,
    wrong: ['module dec38(input [2:0] a, input en, output [7:0] y);\n  assign y = 8\'b1 << a;\nendmodule\n', 'module dec38(input [2:0] a, input en, output [7:0] y);\n  assign y = en ? (8\'b10000000 >> a) : 8\'b0;\nendmodule\n', 'module dec38(input [2:0] a, input en, output [7:0] y);\n  assign y = en ? ~(8\'b1 << a) : 8\'b0;\nendmodule\n'],
  });

  const PICK = `module pick3(input [3:0] d0, input [3:0] d1, input [3:0] d2, input [1:0] s, output [3:0] y);
  assign y = (s == 2'd0) ? d0 :
             (s == 2'd1) ? d1 :
             (s == 2'd2) ? d2 : 4'd0;
endmodule
`;
  const TB_PICK = `module tb;
  reg [3:0] d0, d1, d2; reg [1:0] s; wire [3:0] y; reg [3:0] want; integer i, seed;
  pick3 dut(.d0(d0), .d1(d1), .d2(d2), .s(s), .y(y));
  task check; begin
    #1; want = (s == 0) ? d0 : (s == 1) ? d1 : (s == 2) ? d2 : 4'd0;
    if (y !== want) $display("FAIL s=%0d d0=%0d d1=%0d d2=%0d: y=%0d, expected %0d", s, d0, d1, d2, y, want);
  end endtask
  initial begin
    seed = 12;
    d0 = 4'd3; d1 = 4'd12; d2 = 4'd9;
    for (i = 0; i < 4; i = i + 1) begin s = i; check; end
    d0 = 4'd15; d1 = 4'd0; d2 = 4'd15;
    for (i = 0; i < 4; i = i + 1) begin s = i; check; end
    for (i = 0; i < 200; i = i + 1) begin
      d0 = $random(seed); d1 = $random(seed); d2 = $random(seed); s = $random(seed); check;
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-pick3', chapter: 'p12-ch-structure', title: 'Choose one of three buses', level: 2, kind: 'verilog', module: 'pick3', ports: 'input [3:0] d0, d1, d2; input [1:0] s; output [3:0] y', synth: true,
    start: 'module pick3(input [3:0] d0, input [3:0] d1, input [3:0] d2, input [1:0] s, output [3:0] y);\n\nendmodule\n',
    testbench: TB_PICK,
    text: ['Write module pick3, a multiplexer for 4-bit buses: y = d0, d1 or d2 when s is 0, 1 or 2, and y = 0 when s = 3.', 'The testbench tries every s with two fixed sets of data, then 200 random settings.'],
    hints: ['Conditional operators can be chained: each : leads to the next test.', 'Test s == 0, then s == 1, then s == 2; whatever is left is s == 3.', "assign y = (s == 2'd0) ? d0 : (s == 2'd1) ? d1 : (s == 2'd2) ? d2 : 4'd0;"],
    solution: PICK,
    wrong: [PICK.replace("(s == 2'd2) ? d2 : 4'd0;", 'd2;'), PICK.replace('output [3:0] y', 'output y'), PICK.replace("(s == 2'd1) ? d1 :", "(s == 2'd1) ? d2 :")],
    why: 'A chain of ?: is a chain of multiplexers; a case statement in an always block says the same thing.',
  });

  const ADDN = `module fa(input a, input b, input ci, output s, output co);
  assign s  = a ^ b ^ ci;
  assign co = (a & b) | (ci & (a ^ b));
endmodule

module addn #(parameter N = 4) (input [N-1:0] a, input [N-1:0] b, input ci, output [N-1:0] s, output co);
  wire [N:0] c;
  assign c[0] = ci;
  genvar k;
  generate
    for (k = 0; k < N; k = k + 1) begin : stage
      fa u(.a(a[k]), .b(b[k]), .ci(c[k]), .s(s[k]), .co(c[k+1]));
    end
  endgenerate
  assign co = c[N];
endmodule
`;
  const TB_ADDN = `module tb;
  reg [2:0] a3, b3; reg ci3; wire [2:0] s3; wire co3;
  reg [7:0] a8, b8; reg ci8; wire [7:0] s8; wire co8;
  reg [8:0] w; reg [4:0] lo; integer i, seed;
  addn #(.N(3)) d3(.a(a3), .b(b3), .ci(ci3), .s(s3), .co(co3));
  addn #(.N(8)) d8(.a(a8), .b(b8), .ci(ci8), .s(s8), .co(co8));
  task check8; begin
    #1; w = a8 + b8 + ci8; lo = a8[3:0] + b8[3:0] + ci8;
    if ({co8, s8} !== w) $display("FAIL N=8: %0d + %0d + %0d gives co=%b s=%0d, expected co=%b s=%0d", a8, b8, ci8, co8, s8, w[8], w[7:0]);
    if (d8.stage[3].u.co !== lo[4]) $display("FAIL N=8: %0d + %0d + %0d: the carry out of stage[3].u is %b, expected %b", a8, b8, ci8, d8.stage[3].u.co, lo[4]);
  end endtask
  initial begin
    for (i = 0; i < 128; i = i + 1) begin
      {a3, b3, ci3} = i; #1; w = a3 + b3 + ci3;
      if ({co3, s3} !== w[3:0]) $display("FAIL N=3: %0d + %0d + %0d gives co=%b s=%0d, expected co=%b s=%0d", a3, b3, ci3, co3, s3, w[3], w[2:0]);
    end
    a8 = 255; b8 = 0; ci8 = 1; check8;
    a8 = 255; b8 = 255; ci8 = 1; check8;
    a8 = 15; b8 = 1; ci8 = 0; check8;
    a8 = 0; b8 = 0; ci8 = 0; check8;
    a8 = 170; b8 = 85; ci8 = 1; check8;
    seed = 7;
    for (i = 0; i < 300; i = i + 1) begin a8 = $random(seed); b8 = $random(seed); ci8 = $random(seed); check8; end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-addn', chapter: 'p12-ch-structure', title: 'An adder of any width, by generate', level: 3, kind: 'verilog', module: 'addn', synth: true,
    ports: 'fa(a, b, ci, s, co) and addn #(N)(input [N-1:0] a, b, input ci, output [N-1:0] s, output co), with a generate block named stage holding one fa named u',
    start: 'module fa(input a, input b, input ci, output s, output co);\n\nendmodule\n\nmodule addn #(parameter N = 4) (input [N-1:0] a, input [N-1:0] b, input ci,\n                                output [N-1:0] s, output co);\n  // a generate loop: one fa per bit, the carries chained\n\nendmodule\n',
    testbench: TB_ADDN,
    text: ['Write a full adder fa, and a ripple-carry adder addn with a parameter N (4 unless told otherwise) built from N copies of fa by a generate loop. Name the loop\'s block stage and the copy inside it u, so that the k-th full adder is stage[k].u.', 'The testbench builds a 3-bit adder (all 128 inputs) and an 8-bit one (directed cases such as 255 + 255 + 1, then 300 random ones), and also looks inside at the carry out of stage[3].u.'],
    hints: ['Declare a carry wire one longer than the adder, wire [N:0] c; c[0] is ci and c[N] is co.', 'genvar k; generate for (k = 0; k < N; k = k + 1) begin : stage ... end endgenerate. Inside, one fa joined to a[k], b[k], c[k], s[k] and c[k+1].', 'fa u(.a(a[k]), .b(b[k]), .ci(c[k]), .s(s[k]), .co(c[k+1])); inside the loop, assign c[0] = ci; and assign co = c[N]; outside it.'],
    solution: ADDN,
    wrong: [ADDN.replace('begin : stage', 'begin : bitpos'), ADDN.replace('.ci(c[k]), .s(s[k])', '.ci(1\'b0), .s(s[k])'), ADDN.replace('assign co = (a & b) | (ci & (a ^ b));', 'assign co = a & b;'), ADDN.replace('assign co = c[N];', 'assign co = c[N-1];')],
    why: 'One loop, N copies: change the parameter and the same text builds a wider adder.',
  });

  const MAXN = `module maxn #(parameter W = 8) (input [W-1:0] a, input [W-1:0] b, output [W-1:0] m);
  assign m = (a > b) ? a : b;
endmodule
`;
  const TB_MAXN = `module tb;
  reg [2:0] a3, b3; wire [2:0] m3;
  reg [7:0] a8, b8; wire [7:0] m8;
  reg [12:0] a13, b13; wire [12:0] m13;
  integer i, seed;
  maxn #(.W(3)) u3(.a(a3), .b(b3), .m(m3));
  maxn u8(.a(a8), .b(b8), .m(m8));
  maxn #(.W(13)) u13(.a(a13), .b(b13), .m(m13));
  task check; begin
    #1;
    if (m8 !== ((a8 > b8) ? a8 : b8)) $display("FAIL W=8 (the default): a=%0d b=%0d gives m=%0d, expected %0d", a8, b8, m8, (a8 > b8) ? a8 : b8);
    if (m13 !== ((a13 > b13) ? a13 : b13)) $display("FAIL W=13: a=%0d b=%0d gives m=%0d, expected %0d", a13, b13, m13, (a13 > b13) ? a13 : b13);
  end endtask
  initial begin
    for (i = 0; i < 64; i = i + 1) begin
      {a3, b3} = i; #1;
      if (m3 !== ((a3 > b3) ? a3 : b3)) $display("FAIL W=3: a=%0d b=%0d gives m=%0d, expected %0d", a3, b3, m3, (a3 > b3) ? a3 : b3);
    end
    a8 = 255; b8 = 0; a13 = 8191; b13 = 0; check;
    a8 = 0; b8 = 255; a13 = 0; b13 = 8191; check;
    a8 = 128; b8 = 127; a13 = 4096; b13 = 4095; check;
    a8 = 77; b8 = 77; a13 = 300; b13 = 5000; check;
    seed = 3;
    for (i = 0; i < 200; i = i + 1) begin a8 = $random(seed); b8 = $random(seed); a13 = $random(seed); b13 = $random(seed); check; end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-maxn', chapter: 'p12-ch-structure', title: 'The larger of two, at any width', level: 2, kind: 'verilog', module: 'maxn', ports: 'maxn #(W)(input [W-1:0] a, b, output [W-1:0] m), W = 8 by default', synth: true,
    start: 'module maxn #(parameter W = 8) (input [W-1:0] a, input [W-1:0] b, output [W-1:0] m);\n\nendmodule\n',
    testbench: TB_MAXN,
    text: ['Write module maxn with a parameter W, the width, 8 unless told otherwise: m is the larger of the unsigned numbers a and b.', 'The testbench builds three copies: W = 3 (every pair), the default W = 8 and W = 13 (edge cases, then 200 random pairs).'],
    hints: ['Every width in the module must be written in terms of W.', 'One conditional: if a is greater, a, else b.', 'assign m = (a > b) ? a : b; with the ports declared [W-1:0].'],
    solution: MAXN,
    wrong: [MAXN.replace('(a > b) ? a : b', '(a > b) ? b : a'), 'module maxn #(parameter W = 8) (input [W-1:0] a, input [W-1:0] b, output [W-1:0] m);\n  assign m = (a[7:0] > b[7:0]) ? a : b;\nendmodule\n', 'module maxn #(parameter W = 8) (input [W-1:0] a, input [W-1:0] b, output [W-1:0] m);\n  assign m = (a[W-1] > b[W-1]) ? a : b;\nendmodule\n'],
  });

  // ---- predictions about widths and the four values ------------------------------------------------------------
  const WIDTH = `module tb;
  reg [3:0] a, b, s;
  reg [4:0] w;
  initial begin
    a = 4'd11; b = 4'd7;
    s = a + b;
    w = a + b;
    $display("%0d %0d", s, w);
  end
endmodule`;
  ex({
    id: 'p12x-width', chapter: 'p12-ch-structure', title: 'Where did the 16 go?', level: 1, kind: 'string', placeholder: 'two numbers, like 3 19', answer: '2 18',
    accept: printed('2 18', { '18 18': 'The sum is worked out in the width of the widest operand or target. s has 4 bits, so 18 loses its top bit there.', '2 2': 'w has 5 bits, so the second sum is done in 5 bits and keeps its carry.', '18 2': 'Which target is the narrow one?' }),
    text: ['What does this testbench print?', { code: WIDTH, lang: 'verilog' }],
    hints: ['11 + 7 = 18 = 10010 in binary: five bits.', 'An expression is worked out in the width of its widest part, the target included. s has 4 bits; w has 5.', 's keeps 0010 = 2; w keeps all of 10010 = 18. It prints "2 18".'],
    solution: '2 18', wrong: ['18 18', '2 2'],
  });
  const XS = `module tb;
  reg a, b, c;
  initial begin
    a = 1'bx; b = 1'b0; c = 1'b1;
    #1 $display("%b %b %b %b %b %b", a & b, a | b, a & c, a | c, a ^ c, ~a);
  end
endmodule`;
  ex({
    id: 'p12x-xvalues', chapter: 'p12-ch-structure', title: 'Which answers are unknown?', level: 1, kind: 'choice',
    options: ['a & b', 'a | b', 'a & c', 'a | c', 'a ^ c', '~a'], answer: [1, 2, 4, 5],
    text: ['a is x, b is 0 and c is 1. Which of these expressions give x? Choose every one.', { code: XS, lang: 'verilog' }],
    hints: ['Ask for each one: would the answer change if x were 0 instead of 1?', '0 & anything is 0 and 1 | anything is 1: there the x cannot matter.', 'a & b = 0 and a | c = 1. The other four depend on a, so they are x: the line prints 0 x x 1 x x.'],
    solution: [1, 2, 4, 5], wrong: [[0, 1, 2, 3, 4, 5], [2, 4, 5], [1, 2, 4]],
    why: 'x stays x only when the answer depends on it.',
  });
  const EQX = `module tb;
  reg [1:0] r;
  initial begin
    r = 2'b1x;
    if (r == 2'b1x) $display("A"); else $display("B");
    if (r === 2'b1x) $display("C"); else $display("D");
  end
endmodule`;
  ex({
    id: 'p12x-eqx', chapter: 'p12-ch-structure', title: '== against ===', level: 2, kind: 'choice',
    options: ['A and C', 'B and C', 'A and D', 'B and D'], answer: 1,
    whyNot: { 0: '== with an x bit on either side does not give 1.', 2: '=== compares the four values exactly, x against x included.', 3: 'One of the two comparisons does see the x.' },
    text: ['Which two letters does this testbench print?', { code: EQX, lang: 'verilog' }],
    hints: ['== compares values. When a bit is x, it cannot say whether they are equal, so its result is x.', 'if treats an x condition as false and takes the else. === compares x with x and z with z literally.', 'r == 2\'b1x is x, so "B"; r === 2\'b1x is 1, so "C".'],
    solution: 1, wrong: [0, 3],
    why: '=== is for testbenches: hardware can never see an x, but a testbench must.',
  });

  // ===========================================================================================================
  // Chapter 2: behaviour in always blocks
  // ===========================================================================================================
  const MUX8 = `module mux8(input [7:0] d, input [2:0] s, output reg y);
  always @* begin
    case (s)
      3'd0: y = d[0];
      3'd1: y = d[1];
      3'd2: y = d[2];
      3'd3: y = d[3];
      3'd4: y = d[4];
      3'd5: y = d[5];
      3'd6: y = d[6];
      default: y = d[7];
    endcase
  end
endmodule
`;
  const TB_MUX8 = `module tb;
  reg [7:0] d; reg [2:0] s; wire y; integer i;
  mux8 dut(.d(d), .s(s), .y(y));
  initial begin
    for (i = 0; i < 2048; i = i + 1) begin
      {d, s} = i; #1;
      if (y !== d[s]) $display("FAIL s=%0d d=%b: y=%b, expected %b", s, d, y, d[s]);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-mux8', chapter: 'p12-ch-behaviour', title: 'An 8-to-1 multiplexer with case', level: 1, kind: 'verilog', module: 'mux8', ports: 'input [7:0] d; input [2:0] s; output reg y', synth: true,
    start: 'module mux8(input [7:0] d, input [2:0] s, output reg y);\n  always @* begin\n\n  end\nendmodule\n',
    testbench: TB_MUX8,
    text: ['Write module mux8 with a case statement inside always @*: y is the data bit d numbered by s.', 'The testbench tries all 2048 settings of d and s.'],
    hints: ['One case arm per value of s, each a blocking assignment to y.', 'Make the last arm default, so that every path assigns y and no latch is needed.', "case (s) 3'd0: y = d[0]; ... 3'd6: y = d[6]; default: y = d[7]; endcase"],
    solution: MUX8,
    wrong: [MUX8.replace('default: y = d[7];', "3'd7: y = d[6];"), MUX8.replace('3\'d5: y = d[5];', '3\'d5: y = d[4];'), MUX8.replace('always @*', 'always @(s)')],
    why: 'A bit select with a variable, y = d[s], is the same multiplexer in one line.',
  });

  const PENC = `module penc8(input [7:0] r, output reg [2:0] n, output reg v);
  always @* begin
    v = 1'b1;
    casez (r)
      8'b1???????: n = 3'd7;
      8'b01??????: n = 3'd6;
      8'b001?????: n = 3'd5;
      8'b0001????: n = 3'd4;
      8'b00001???: n = 3'd3;
      8'b000001??: n = 3'd2;
      8'b0000001?: n = 3'd1;
      8'b00000001: n = 3'd0;
      default: begin n = 3'd0; v = 1'b0; end
    endcase
  end
endmodule
`;
  const TB_PENC = `module tb;
  reg [7:0] r; wire [2:0] n; wire v; reg [2:0] wn; reg wv; integer i, k;
  penc8 dut(.r(r), .n(n), .v(v));
  initial begin
    for (i = 0; i < 256; i = i + 1) begin
      r = i; #1;
      wn = 0; wv = 0;
      for (k = 0; k < 8; k = k + 1) if (r[k]) begin wn = k; wv = 1; end
      if (v !== wv) $display("FAIL r=%b: v=%b, expected %b", r, v, wv);
      if (n !== wn) $display("FAIL r=%b: n=%0d, expected %0d", r, n, wn);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-penc', chapter: 'p12-ch-behaviour', title: 'A priority encoder with casez', level: 2, kind: 'verilog', module: 'penc8', ports: 'input [7:0] r; output reg [2:0] n; output reg v', synth: true,
    start: 'module penc8(input [7:0] r, output reg [2:0] n, output reg v);\n  always @* begin\n\n  end\nendmodule\n',
    testbench: TB_PENC,
    text: ['Write module penc8, an 8-input priority encoder: n is the number of the highest request bit r that is 1, and v = 1 when any bit is 1. When r = 0, v = 0 and n = 0.', 'Use casez with ? for the bits that do not matter. The testbench tries all 256 values of r.'],
    hints: ['The labels are tried from the top, so put the highest bit first: 8\'b1??????? means "bit 7 is 1, the rest anything".', 'Each following label has one more 0 at the top. Give v a value before the casez so every path sets it.', "v = 1; casez (r) 8'b1???????: n = 7; 8'b01??????: n = 6; ... 8'b00000001: n = 0; default: begin n = 0; v = 0; end endcase"],
    solution: PENC,
    wrong: [PENC.replace('casez (r)', 'case (r)'), PENC.replace("8'b1???????: n = 3'd7;", "8'b1???????: n = 3'd0;"), PENC.replace("default: begin n = 3'd0; v = 1'b0; end", "default: n = 3'd0;")],
    why: 'Label order is priority: the first match wins, so the highest bit is tested first.',
  });

  const LZC = `module lzc8(input [7:0] x, output reg [3:0] n);
  integer i;
  reg seen;
  always @* begin
    n = 4'd0;
    seen = 1'b0;
    for (i = 7; i >= 0; i = i - 1) begin
      if (x[i]) seen = 1'b1;
      if (!seen) n = n + 4'd1;
    end
  end
endmodule
`;
  const TB_LZC = `module tb;
  reg [7:0] x; wire [3:0] n; integer i, k, want;
  lzc8 dut(.x(x), .n(n));
  initial begin
    for (i = 0; i < 256; i = i + 1) begin
      x = i; #1;
      want = 8;
      for (k = 0; k < 8; k = k + 1) if (x[k]) want = 7 - k;
      if (n !== want) $display("FAIL x=%b: n=%0d, expected %0d", x, n, want);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-lzc', chapter: 'p12-ch-behaviour', title: 'Count the leading zeros', level: 2, kind: 'verilog', module: 'lzc8', ports: 'input [7:0] x; output reg [3:0] n', synth: true,
    start: 'module lzc8(input [7:0] x, output reg [3:0] n);\n  integer i;\n  always @* begin\n\n  end\nendmodule\n',
    testbench: TB_LZC,
    text: ['Write module lzc8 with a for loop: n is the number of 0s at the top of x before the first 1 (x = 00010110 gives 3), and 8 when x is all 0s.', 'The testbench tries all 256 values.'],
    hints: ['Walk from bit 7 down to bit 0, counting while no 1 has been seen.', 'A second variable remembers whether a 1 has turned up. Set both before the loop, so nothing is left to a latch.', "n = 0; seen = 0; for (i = 7; i >= 0; i = i - 1) begin if (x[i]) seen = 1; if (!seen) n = n + 1; end"],
    solution: LZC,
    wrong: [LZC.replace("      if (x[i]) seen = 1'b1;\n", ''), LZC.replace('for (i = 7; i >= 0; i = i - 1)', 'for (i = 0; i <= 7; i = i + 1)'), LZC.replace('for (i = 7; i >= 0; i = i - 1)', 'for (i = 7; i > 0; i = i - 1)')],
    why: 'The tool unrolls the loop into eight copies of its body, so the count of turns must be fixed, as it is here.',
  });

  const ALU = `module alu4(input [3:0] a, input [3:0] b, input [1:0] op, output reg [3:0] y, output z);
  always @* begin
    case (op)
      2'b00: y = a + b;
      2'b01: y = a - b;
      2'b10: y = a & b;
      default: y = a ^ b;
    endcase
  end
  assign z = (y == 4'd0);
endmodule
`;
  const TB_ALU = `module tb;
  reg [3:0] a, b; reg [1:0] op; wire [3:0] y; wire z; reg [3:0] want; integer i;
  alu4 dut(.a(a), .b(b), .op(op), .y(y), .z(z));
  initial begin
    for (i = 0; i < 1024; i = i + 1) begin
      {op, a, b} = i; #1;
      case (op) 0: want = a + b; 1: want = a - b; 2: want = a & b; default: want = a ^ b; endcase
      if (y !== want) $display("FAIL op=%b a=%0d b=%0d: y=%0d, expected %0d", op, a, b, y, want);
      if (z !== (want == 0)) $display("FAIL op=%b a=%0d b=%0d: z=%b, expected %b", op, a, b, z, want == 0);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-alu', chapter: 'p12-ch-behaviour', title: 'A four-operation ALU', level: 2, kind: 'verilog', module: 'alu4', ports: 'input [3:0] a, b; input [1:0] op; output reg [3:0] y; output z', synth: true,
    start: 'module alu4(input [3:0] a, input [3:0] b, input [1:0] op, output reg [3:0] y, output z);\n\nendmodule\n',
    testbench: TB_ALU,
    text: ['Write module alu4. op picks the operation: 00 add, 01 subtract (a − b), 10 AND, 11 XOR, all in 4 bits (carries and borrows dropped). The flag z is 1 when the result y is 0.', 'The testbench tries all 1024 settings.'],
    hints: ['A case on op inside always @*, one arm per operation, with default for the last.', 'z depends only on y: a continuous assignment outside the block.', "case (op) 2'b00: y = a + b; 2'b01: y = a - b; 2'b10: y = a & b; default: y = a ^ b; endcase, and assign z = (y == 4'd0);"],
    solution: ALU,
    wrong: [ALU.replace('2\'b01: y = a - b;', '2\'b01: y = b - a;'), ALU.replace("assign z = (y == 4'd0);", 'assign z = ~|a;'), ALU.replace('default: y = a ^ b;', 'default: y = a | b;')],
  });

  // ---- blocking and non-blocking: predictions ------------------------------------------------------------------
  const NB1 = `module tb;
  integer p, q, r;
  initial begin
    p = 1; q = 2; r = 3;
    p = q;
    q = r;
    r = p;
    $display("%0d %0d %0d", p, q, r);
  end
endmodule`;
  ex({
    id: 'p12x-blocking', chapter: 'p12-ch-behaviour', title: 'Three blocking assignments', level: 1, kind: 'string', placeholder: 'three numbers', answer: '2 3 2',
    accept: printed('2 3 2', { '2 3 1': 'That would be true of <=. With =, r = p reads p after the first line has already changed it.', '1 2 3': 'Blocking assignments take effect at once, before the next line runs.' }),
    text: ['What does this print?', { code: NB1, lang: 'verilog' }],
    hints: ['= changes the variable at once: the next statement already sees the new value.', 'After p = q, p is 2. After q = r, q is 3.', 'r = p reads the new p, 2. It prints "2 3 2".'],
    solution: '2 3 2', wrong: ['2 3 1', '1 2 3'],
  });
  const NB2 = `module tb;
  integer p, q, r;
  initial begin
    p = 1; q = 2; r = 3;
    p <= q;
    q <= r;
    r <= p;
    $display("%0d %0d %0d", p, q, r);
    #1 $display("%0d %0d %0d", p, q, r);
  end
endmodule`;
  ex({
    id: 'p12x-nonblocking', chapter: 'p12-ch-behaviour', title: 'Two lines, one rotation', level: 2, kind: 'string', placeholder: 'two lines of three numbers, like 1 2 3 / 4 5 6', answer: '1 2 3 / 2 3 1',
    accept: (t) => {
      const k = String(t).replace(/[\s/,;|]+/g, '');
      if (k === '123231') return true;
      if (k === '231231') return 'The first $display runs before the non-blocking updates are made: they wait for the NBA region of the time step.';
      if (k === '123232') return 'With <= each right side is read before any update, so r gets the old p, 1.';
      if (k.length !== 6) return 'Give both lines, three numbers each.';
      return 'Not quite: work out each right side first, then make all three updates together.';
    },
    text: ['What are the two lines this prints? Write them one after the other, like 1 2 3 / 4 5 6.', { code: NB2, lang: 'verilog' }],
    hints: ['<= works out its right side at once but makes the change later, after everything else at this time.', 'The first $display runs at time 0, before the updates.', 'Time 0: 1 2 3. The updates use the old values: p = 2, q = 3, r = 1. At time 1: 2 3 1.'],
    solution: '1 2 3 / 2 3 1', wrong: ['2 3 1 / 2 3 1', '1 2 3 / 2 3 2', '2 3 1'],
  });
  const NB3 = `module tb;
  reg clk;
  reg [3:0] a, b, c;
  always @(posedge clk) begin
    a <= a + 1;
    b = a;
    c <= b;
  end
  initial begin
    clk = 0; a = 0; b = 0; c = 0;
    repeat (3) begin
      #5 clk = 1;
      #5 clk = 0;
    end
    $display("a=%0d b=%0d c=%0d", a, b, c);
  end
endmodule`;
  ex({
    id: 'p12x-mixed', chapter: 'p12-ch-behaviour', title: 'Mixing = and <= on a clock', level: 2, kind: 'string', placeholder: 'a=? b=? c=?', answer: 'a=3 b=2 c=2',
    accept: (t) => {
      const k = String(t).replace(/[\s,]+/g, '').replace(/^a=?/, 'a=').toLowerCase();
      const m = /^a=?(\d+)b=?(\d+)c=?(\d+)$/.exec(k) || /^(\d)(\d)(\d)$/.exec(k);
      if (!m) return 'Write the three values, like a=1 b=2 c=3.';
      const v = m.slice(1).join(' ');
      if (v === '3 2 2') return true;
      if (v === '3 2 1') return 'b = a is blocking, so c <= b on the line after it reads the b just written, not the old one.';
      if (v === '3 3 3') return 'a <= a + 1 has not happened yet when b = a runs: b gets the old a.';
      return 'Not quite: follow one edge at a time, noting which right sides are read before the updates.';
    },
    text: ['After three rising edges, what does the $display print?', { code: NB3, lang: 'verilog' }],
    hints: ['At each edge, a <= a + 1 reads a now and updates it later; b = a changes b at once; c <= b reads that new b.', 'Edge 1: b = 0, then a becomes 1, c becomes 0. Edge 2: b = 1, then a = 2, c = 1.', 'Edge 3: b = 2, then a = 3, c = 2. It prints "a=3 b=2 c=2". (The lint warns about b: = in a clocked block is a trap.)'],
    solution: 'a=3 b=2 c=2', wrong: ['a=3 b=2 c=1', 'a=3 b=3 c=3'],
  });

  // ---- lint: latches and sensitivity lists ------------------------------------------------------------------------
  const LATCH1 = `module ctl(input [1:0] op, input go,
           output reg run, output reg [1:0] sel, output reg busy);
  always @* begin
    busy = 1'b0;
    run = go;
    case (op)
      2'd0: sel = 2'd1;
      2'd1: sel = 2'd2;
      2'd2: begin sel = 2'd0; busy = 1'b1; end
    endcase
  end
endmodule`;
  ex({
    id: 'p12x-latch-line', chapter: 'p12-ch-behaviour', title: 'Which output becomes a latch?', level: 1, kind: 'choice',
    options: ['run (line 5)', 'sel (lines 7 to 9)', 'busy (lines 4 and 9)', 'None: the block is combinational'], answer: 1,
    whyNot: { 0: 'run is assigned on every path: line 5 always runs.', 2: 'busy gets a value on line 4 before the case, so every path assigns it.', 3: 'Try op = 3 and follow the block: which output is not assigned?' },
    text: ['A synthesis tool reads this block. Which output does it have to build a latch for?', { code: numbered(LATCH1), lang: 'verilog' }],
    hints: ['A latch is needed when some path through the block leaves an output unassigned: it must keep its old value.', 'The case has arms for op = 0, 1 and 2. What happens when op = 3?', 'With op = 3 no arm runs, and sel is not assigned anywhere else: sel keeps its old value, a latch. busy and run get values before the case.'],
    solution: 1, wrong: [2, 3],
    why: 'A default arm, or a value for sel before the case, removes it.',
  });
  const LW = {
    A: 'always @*\n  if (en) y = d;',
    B: "always @* begin\n  y = 1'b0;\n  if (en) y = d;\nend",
    C: 'always @*\n  if (s) y = a;\n  else if (t) y = b;',
    D: "always @*\n  case (k)\n    2'd0: y = a;\n    2'd1: y = b;\n    default: y = 1'b0;\n  endcase",
    E: 'always @(posedge clk)\n  if (en) q <= d;',
  };
  ex({
    id: 'p12x-latch-which', chapter: 'p12-ch-behaviour', title: 'Latches or not?', level: 2, kind: 'choice',
    options: ['A', 'B', 'C', 'D', 'E'], answer: [0, 2],
    text: ['Which of these blocks make a synthesis tool build a latch? Choose every one.', { code: Object.entries(LW).map(([k, v]) => '// ' + k + '\n' + v).join('\n\n'), lang: 'verilog' }],
    hints: ['A combinational block (@*) builds a latch when some path leaves its output unassigned.', 'Look for an if with no else and no value set before it, and a case with no default.', 'A (en = 0) and C (s = 0 and t = 0) leave y unassigned. B sets y first, D has a default, and E is clocked: holding q there is just a flip-flop with an enable.'],
    solution: [0, 2], wrong: [[0, 2, 4], [0], [0, 1, 2]],
    why: 'In a clocked block, keeping the old value is what a flip-flop does anyway; in a combinational one it needs a latch.',
  });
  const SENS = `module sel2(input s, input a, input b, output reg y);
  always @(s or a)
    y = s ? b : a;
endmodule`;
  ex({
    id: 'p12x-sens', chapter: 'p12-ch-behaviour', title: 'A name missing from the list', level: 1, kind: 'choice',
    options: ['s', 'a', 'b', 'None: the list is complete'], answer: 2,
    whyNot: { 3: 'The block reads three signals; count the names in the list.' },
    text: ['The simulation of this module disagrees with the circuit built from it. Which change does the always block miss?', { code: SENS, lang: 'verilog' }],
    hints: ['The block runs only when a signal in its list changes.', 'It reads s, a and b; the list names s and a.', 'A change of b alone does not wake it, so y keeps an old value while the multiplexer would follow b. Write @* instead.'],
    solution: 2, wrong: [0, 3],
  });

  // ===========================================================================================================
  // Chapter 3: clocked designs and state machines
  // ===========================================================================================================
  const CLK = '  always #5 clk = ~clk;\n';
  const SIPO = `module sipo4(input clk, input rst, input sin, output reg [3:0] q);
  always @(posedge clk)
    if (rst) q <= 4'd0;
    else     q <= {q[2:0], sin};
endmodule
`;
  const TB_SIPO = `module tb;
  reg clk = 0, rst = 1, sin = 0; wire [3:0] q; reg [3:0] m; integer i, seed;
  sipo4 dut(.clk(clk), .rst(rst), .sin(sin), .q(q));
${CLK}  initial begin
    seed = 21; m = 0;
    @(negedge clk); rst = 0;
    if (q !== 0) $display("FAIL after reset: q=%b, expected 0000", q);
    for (i = 0; i < 80; i = i + 1) begin
      sin = (i < 4) ? 1 : $random(seed);
      rst = (i == 40);
      @(posedge clk); m = rst ? 4'd0 : {m[2:0], sin};
      @(negedge clk);
      if (q !== m) $display("FAIL edge %0d (rst=%b, sin=%b): q=%b, expected %b", i + 1, rst, sin, q, m);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-sipo', chapter: 'p12-ch-clocked', title: 'A shift register, serial in', level: 1, kind: 'verilog', module: 'sipo4', ports: 'input clk, rst, sin; output reg [3:0] q', synth: true,
    start: 'module sipo4(input clk, input rst, input sin, output reg [3:0] q);\n\nendmodule\n',
    testbench: TB_SIPO,
    text: ['Write module sipo4, a 4-bit shift register: at each rising edge of clk every bit moves one place up (q[0] to q[1], and so on) and sin comes in at q[0]. rst = 1 at an edge clears q (a synchronous reset).', 'The testbench clocks in 80 bits, with a reset in the middle, and checks q after every edge.'],
    hints: ['One clocked block, always @(posedge clk), with non-blocking assignments.', 'A concatenation does the shift in one line: the low three bits move up, sin fills the bottom.', "if (rst) q <= 4'd0; else q <= {q[2:0], sin};"],
    solution: SIPO,
    wrong: [SIPO.replace('{q[2:0], sin}', '{sin, q[3:1]}'), SIPO.replace("if (rst) q <= 4'd0;\n    else     q <= {q[2:0], sin};", 'q <= {q[2:0], sin};'), SIPO.replace('{q[2:0], sin}', '{q[3:1], sin}')],
  });

  const USH = `module ushift4(input clk, input rst, input [1:0] mode, input sr, input sl, input [3:0] d, output reg [3:0] q);
  always @(posedge clk)
    if (rst) q <= 4'd0;
    else case (mode)
      2'b00: q <= q;
      2'b01: q <= {sr, q[3:1]};
      2'b10: q <= {q[2:0], sl};
      default: q <= d;
    endcase
endmodule
`;
  const TB_USH = `module tb;
  reg clk = 0, rst = 1, sr = 0, sl = 0; reg [1:0] mode = 0; reg [3:0] d = 0;
  wire [3:0] q; reg [3:0] m; integer i, seed;
  ushift4 dut(.clk(clk), .rst(rst), .mode(mode), .sr(sr), .sl(sl), .d(d), .q(q));
${CLK}  initial begin
    seed = 5; m = 0;
    @(negedge clk); rst = 0;
    for (i = 0; i < 300; i = i + 1) begin
      if (i < 4) begin mode = 3; d = 4'b1001 + i; end
      else if (i < 8) begin mode = 1; sr = i[0]; end
      else if (i < 12) begin mode = 2; sl = ~i[0]; end
      else if (i < 14) mode = 0;
      else begin mode = $random(seed); sr = $random(seed); sl = $random(seed); d = $random(seed); end
      rst = (i == 150);
      @(posedge clk);
      if (rst) m = 0;
      else case (mode) 0: m = m; 1: m = {sr, m[3:1]}; 2: m = {m[2:0], sl}; default: m = d; endcase
      @(negedge clk);
      if (q !== m) $display("FAIL edge %0d (rst=%b mode=%b sr=%b sl=%b d=%b): q=%b, expected %b", i + 1, rst, mode, sr, sl, d, q, m);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-ushift', chapter: 'p12-ch-clocked', title: 'A universal shift register', level: 3, kind: 'verilog', module: 'ushift4', ports: 'input clk, rst; input [1:0] mode; input sr, sl; input [3:0] d; output reg [3:0] q', synth: true,
    start: 'module ushift4(input clk, input rst, input [1:0] mode, input sr, input sl,\n               input [3:0] d, output reg [3:0] q);\n\nendmodule\n',
    testbench: TB_USH,
    text: ['Write module ushift4. At each rising edge: rst = 1 clears q; otherwise mode 00 holds q, 01 shifts right (each bit one place down, sr coming in at q[3]), 10 shifts left (each bit one place up, sl coming in at q[0]) and 11 loads d.', 'The testbench runs every mode in turn, then 290 random edges with a reset among them, and checks q after each edge against its own model.'],
    hints: ['A case on mode inside the else of the reset, all with <=.', 'Shift right: {sr, q[3:1]}. Shift left: {q[2:0], sl}.', "if (rst) q <= 0; else case (mode) 2'b00: q <= q; 2'b01: q <= {sr, q[3:1]}; 2'b10: q <= {q[2:0], sl}; default: q <= d; endcase"],
    solution: USH,
    wrong: [USH.replace("2'b01: q <= {sr, q[3:1]};", "2'b01: q <= {q[3:1], sr};"), USH.replace("2'b10: q <= {q[2:0], sl};", "2'b10: q <= {q[2:0], sr};"), USH.replace("2'b00: q <= q;", "2'b00: q <= 4'd0;")],
    why: 'One register, four sources at its D inputs: a 4-way multiplexer in front of each flip-flop.',
  });

  const UPD = `module updown4(input clk, input rst, input en, input up, output reg [3:0] q, output tc);
  always @(posedge clk)
    if (rst) q <= 4'd0;
    else if (en) q <= up ? q + 4'd1 : q - 4'd1;
  assign tc = en & (up ? (q == 4'd15) : (q == 4'd0));
endmodule
`;
  const TB_UPD = `module tb;
  reg clk = 0, rst = 1, en = 0, up = 1; wire [3:0] q; wire tc; reg [3:0] m; reg wtc; integer i, seed;
  updown4 dut(.clk(clk), .rst(rst), .en(en), .up(up), .q(q), .tc(tc));
${CLK}  initial begin
    seed = 9; m = 0;
    @(negedge clk); rst = 0;
    for (i = 0; i < 260; i = i + 1) begin
      if (i < 20) begin en = 1; up = 1; end
      else if (i < 40) begin en = 1; up = 0; end
      else if (i < 44) begin en = 0; up = i[0]; end
      else begin en = ($random(seed) % 4) != 0; up = ($random(seed) % 3) != 0; end
      rst = (i == 200);
      #1; wtc = en & (up ? (m == 15) : (m == 0));
      if (!rst && tc !== wtc) $display("FAIL before edge %0d: q=%0d en=%b up=%b gives tc=%b, expected %b", i + 1, m, en, up, tc, wtc);
      @(posedge clk);
      if (rst) m = 0; else if (en) m = up ? m + 1 : m - 1;
      @(negedge clk);
      if (q !== m) $display("FAIL edge %0d (rst=%b en=%b up=%b): q=%0d, expected %0d", i + 1, rst, en, up, q, m);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-updown', chapter: 'p12-ch-clocked', title: 'An up/down counter with terminal count', level: 2, kind: 'verilog', module: 'updown4', ports: 'input clk, rst, en, up; output reg [3:0] q; output tc', synth: true,
    start: 'module updown4(input clk, input rst, input en, input up, output reg [3:0] q, output tc);\n\nendmodule\n',
    testbench: TB_UPD,
    text: ['Write module updown4, a 4-bit counter: at each rising edge rst = 1 clears it; otherwise while en = 1 it counts up (up = 1) or down (up = 0), wrapping round, and with en = 0 it holds.', 'tc (terminal count) is combinational: 1 when en = 1 and the next count wraps, that is q = 15 counting up or q = 0 counting down. Counters are chained by tc.', 'The testbench counts up past 15, down past 0, then makes 216 random edges; it checks q after each edge and tc before it.'],
    hints: ['The register in one clocked block; tc in a continuous assignment, since it must answer en and up at once.', 'Counting down is q - 1; 4-bit arithmetic wraps 0 to 15 by itself.', "always @(posedge clk) if (rst) q <= 0; else if (en) q <= up ? q + 1 : q - 1;  assign tc = en & (up ? (q == 15) : (q == 0));"],
    solution: UPD,
    wrong: [UPD.replace("assign tc = en & (up ? (q == 4'd15) : (q == 4'd0));", "assign tc = (q == 4'd15);"), UPD.replace("else if (en) q <= up ? q + 4'd1 : q - 4'd1;", "else q <= up ? q + 4'd1 : q - 4'd1;"), UPD.replace("assign tc = en & (up ? (q == 4'd15) : (q == 4'd0));", "assign tc = up ? (q == 4'd15) : (q == 4'd0);")],
  });

  const MODN = `module modn #(parameter M = 10, parameter W = 4) (input clk, input rst, input en, output reg [W-1:0] q, output wrap);
  assign wrap = en && (q == M - 1);
  always @(posedge clk)
    if (rst) q <= 0;
    else if (en) q <= wrap ? 0 : q + 1;
endmodule
`;
  const TB_MODN = `module tb;
  reg clk = 0, rst = 1, en = 0;
  wire [3:0] q10, q13; wire [2:0] q6; wire w10, w6, w13;
  integer i, seed, m10, m6, m13;
  modn u10(.clk(clk), .rst(rst), .en(en), .q(q10), .wrap(w10));
  modn #(.M(6), .W(3)) u6(.clk(clk), .rst(rst), .en(en), .q(q6), .wrap(w6));
  modn #(.M(13), .W(4)) u13(.clk(clk), .rst(rst), .en(en), .q(q13), .wrap(w13));
${CLK}  initial begin
    seed = 77; m10 = 0; m6 = 0; m13 = 0;
    @(negedge clk); rst = 0;
    for (i = 0; i < 200; i = i + 1) begin
      en = (i < 30) ? 1 : ($random(seed) % 5) != 0;
      rst = (i == 120);
      #1;
      if (!rst && w10 !== (en && m10 == 9)) $display("FAIL M=10: q=%0d en=%b gives wrap=%b, expected %b", m10, en, w10, en && m10 == 9);
      if (!rst && w6 !== (en && m6 == 5)) $display("FAIL M=6: q=%0d en=%b gives wrap=%b, expected %b", m6, en, w6, en && m6 == 5);
      if (!rst && w13 !== (en && m13 == 12)) $display("FAIL M=13: q=%0d en=%b gives wrap=%b, expected %b", m13, en, w13, en && m13 == 12);
      @(posedge clk);
      if (rst) begin m10 = 0; m6 = 0; m13 = 0; end
      else if (en) begin m10 = (m10 + 1) % 10; m6 = (m6 + 1) % 6; m13 = (m13 + 1) % 13; end
      @(negedge clk);
      if (q10 !== m10) $display("FAIL M=10, edge %0d (en=%b rst=%b): q=%0d, expected %0d", i + 1, en, rst, q10, m10);
      if (q6 !== m6) $display("FAIL M=6, edge %0d (en=%b rst=%b): q=%0d, expected %0d", i + 1, en, rst, q6, m6);
      if (q13 !== m13) $display("FAIL M=13, edge %0d (en=%b rst=%b): q=%0d, expected %0d", i + 1, en, rst, q13, m13);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-modn', chapter: 'p12-ch-clocked', title: 'A counter modulo any M', level: 2, kind: 'verilog', module: 'modn', ports: 'modn #(M, W)(input clk, rst, en, output reg [W-1:0] q, output wrap), M = 10 and W = 4 by default', synth: true,
    start: 'module modn #(parameter M = 10, parameter W = 4)\n            (input clk, input rst, input en, output reg [W-1:0] q, output wrap);\n\nendmodule\n',
    testbench: TB_MODN,
    text: ['Write module modn with parameters M (the modulus, 10 unless told otherwise) and W (the width of q, 4). While en = 1 it counts 0, 1, …, M − 1 and back to 0, one step per rising edge; rst = 1 at an edge clears it.', 'wrap is combinational: 1 when en = 1 and q = M − 1, so the next edge wraps (a decade counter\'s carry to the next digit).', 'The testbench runs three copies side by side: M = 10, M = 6 with W = 3, and M = 13.'],
    hints: ['Compare q with M - 1, not with 9: the parameter is the whole point.', 'wrap already says "this edge goes back to 0", so the counter can use it.', 'assign wrap = en && (q == M - 1); always @(posedge clk) if (rst) q <= 0; else if (en) q <= wrap ? 0 : q + 1;'],
    solution: MODN,
    wrong: [MODN.replace('(q == M - 1)', '(q == 9)'), MODN.replace('(q == M - 1)', '(q == M)'), MODN.replace('assign wrap = en && (q == M - 1);', 'assign wrap = (q == M - 1);')],
    why: 'Three counters from one module: M = 6 and M = 10 together make the seconds of a clock.',
  });

  const RF = `module regfile(input clk, input we, input [1:0] wa, input [7:0] wd,
               input [1:0] ra, input [1:0] rb, output [7:0] da, output [7:0] db);
  reg [7:0] r [0:3];
  always @(posedge clk)
    if (we) r[wa] <= wd;
  assign da = r[ra];
  assign db = r[rb];
endmodule
`;
  const TB_RF = `module tb;
  reg clk = 0, we = 0; reg [1:0] wa = 0, ra = 0, rb = 0; reg [7:0] wd = 0;
  wire [7:0] da, db; reg [7:0] m [0:3]; integer i, seed;
  regfile dut(.clk(clk), .we(we), .wa(wa), .wd(wd), .ra(ra), .rb(rb), .da(da), .db(db));
${CLK}  initial begin
    seed = 31;
    for (i = 0; i < 4; i = i + 1) begin
      @(negedge clk); we = 1; wa = i; wd = 8'h11 * (i + 1);
      @(posedge clk); m[i] = wd;
    end
    for (i = 0; i < 300; i = i + 1) begin
      @(negedge clk);
      we = (i < 8) ? 0 : $random(seed); wa = $random(seed); wd = $random(seed);
      ra = (i < 4) ? i : $random(seed); rb = (i < 4) ? 3 - i : (i % 7 == 0) ? wa : $random(seed);
      #1;
      if (da !== m[ra]) $display("FAIL read port a, register %0d: da=%h, expected %h (we=%b wa=%0d)", ra, da, m[ra], we, wa);
      if (db !== m[rb]) $display("FAIL read port b, register %0d: db=%h, expected %h (we=%b wa=%0d)", rb, db, m[rb], we, wa);
      @(posedge clk); if (we) m[wa] = wd;
      #1;
      if (da !== m[ra]) $display("FAIL after writing %h to register %0d: da (register %0d) = %h, expected %h", wd, wa, ra, da, m[ra]);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-regfile', chapter: 'p12-ch-clocked', title: 'A register file with two read ports', level: 3, kind: 'verilog', module: 'regfile', ports: 'input clk, we; input [1:0] wa; input [7:0] wd; input [1:0] ra, rb; output [7:0] da, db', synth: true,
    start: 'module regfile(input clk, input we, input [1:0] wa, input [7:0] wd,\n               input [1:0] ra, input [1:0] rb, output [7:0] da, output [7:0] db);\n\nendmodule\n',
    testbench: TB_RF,
    text: ['Write module regfile: four 8-bit registers. At a rising edge with we = 1, register wa takes wd. The two read ports are combinational: da shows register ra and db register rb at all times, so reading the register being written gives the old value until the edge and the new one after it.', 'The testbench fills the four registers, then makes 300 random reads and writes, checking both ports before every edge and port a after it.'],
    hints: ['An array of registers: reg [7:0] r [0:3]; indexed by a signal, r[wa].', 'The write is clocked (<= inside always @(posedge clk)); the reads are continuous assignments.', 'always @(posedge clk) if (we) r[wa] <= wd;  assign da = r[ra]; assign db = r[rb];'],
    solution: RF,
    wrong: [RF.replace('assign db = r[rb];', 'assign db = r[ra];'), RF.replace('if (we) r[wa] <= wd;', 'r[wa] <= wd;'), RF.replace('reg [7:0] r [0:3];\n  always @(posedge clk)\n    if (we) r[wa] <= wd;\n  assign da = r[ra];\n  assign db = r[rb];', 'reg [7:0] r [0:3];\n  reg [7:0] qa, qb;\n  always @(posedge clk) begin\n    if (we) r[wa] <= wd;\n    qa <= r[ra]; qb <= r[rb];\n  end\n  assign da = qa;\n  assign db = qb;')],
    why: 'This is the register file of a small processor: two operands read at once, one result written per clock.',
  });

  const MOORE = `module seen1001(input clk, input rst, input x, output z);
  localparam S0 = 3'd0, S1 = 3'd1, S10 = 3'd2, S100 = 3'd3, S1001 = 3'd4;
  reg [2:0] st, nx;
  always @(posedge clk)
    if (rst) st <= S0;
    else     st <= nx;
  always @* begin
    case (st)
      S0:      nx = x ? S1 : S0;
      S1:      nx = x ? S1 : S10;
      S10:     nx = x ? S1 : S100;
      S100:    nx = x ? S1001 : S0;
      S1001:   nx = x ? S1 : S10;
      default: nx = S0;
    endcase
  end
  assign z = (st == S1001);
endmodule
`;
  const TB_MOORE = `module tb;
  reg clk = 0, rst = 1, x = 0; wire z; reg [3:0] h; integer i, n, seed, hits; reg [15:0] pat;
  seen1001 dut(.clk(clk), .rst(rst), .x(x), .z(z));
${CLK}  initial begin
    seed = 4; h = 0; hits = 0; pat = 16'b1001001100110010;
    @(negedge clk); rst = 0;
    for (i = 0; i < 216; i = i + 1) begin
      x = (i < 16) ? pat[15 - i] : $random(seed);
      rst = (i == 100);
      #1;
      if (z !== (h == 4'b1001)) $display("FAIL before edge %0d (x=%b, last four bits %b): z=%b, expected %b", i + 1, x, h, z, h == 4'b1001);
      @(posedge clk); h = rst ? 4'b0000 : {h[2:0], x};
      @(negedge clk);
      if (z !== (h == 4'b1001)) $display("FAIL after edge %0d (last four bits %b): z=%b, expected %b", i + 1, h, z, h == 4'b1001);
      if (z === 1) hits = hits + 1;
    end
    if (hits < 3) $display("FAIL the pattern was seen only %0d times", hits);
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-moore', chapter: 'p12-ch-clocked', title: 'A Moore detector for 1001', level: 2, kind: 'verilog', module: 'seen1001', ports: 'input clk, rst, x; output z', synth: true,
    start: 'module seen1001(input clk, input rst, input x, output z);\n  // states, a state register, next-state logic, and z from the state alone\n\nendmodule\n',
    testbench: TB_MOORE,
    text: ['Write module seen1001, a Moore machine. At each rising edge it reads x; z = 1 during the clock period after the last four bits read were 1, 0, 0, 1. Patterns may overlap: 1001001 holds two. rst = 1 at an edge returns it to the start.', 'A Moore output depends on the state only. The testbench changes x just after each falling edge and checks z both before and after each rising edge, so a z that follows x is caught.'],
    hints: ['Five states: nothing yet, seen 1, seen 10, seen 100, seen 1001. z = 1 only in the last.', 'From "seen 1001", a 0 means the last bits are 10 (the final 1 starts a new pattern), and a 1 means "seen 1".', 'S0: x ? S1 : S0; S1: x ? S1 : S10; S10: x ? S1 : S100; S100: x ? S1001 : S0; S1001: x ? S1 : S10; assign z = (st == S1001);'],
    solution: MOORE,
    wrong: [MOORE.replace('S1001:   nx = x ? S1 : S10;', 'S1001:   nx = x ? S1 : S0;'), MOORE.replace('assign z = (st == S1001);', 'assign z = (st == S100) & x;'), MOORE.replace('S100:    nx = x ? S1001 : S0;', 'S100:    nx = x ? S1001 : S100;')],
  });

  const VEND = `module vend15(input clk, input rst, input n, input d, output vend);
  reg [4:0] credit;
  wire [4:0] total = credit + (n ? 5'd5 : 5'd0) + (d ? 5'd10 : 5'd0);
  assign vend = (total >= 15);
  always @(posedge clk)
    if (rst) credit <= 5'd0;
    else if (vend) credit <= 5'd0;
    else credit <= total;
endmodule
`;
  const TB_VEND = `module tb;
  reg clk = 0, rst = 1, n = 0, d = 0; wire vend; integer i, seed, c, t, sold; integer coin;
  vend15 dut(.clk(clk), .rst(rst), .n(n), .d(d), .vend(vend));
${CLK}  initial begin
    seed = 15; c = 0; sold = 0;
    @(negedge clk); rst = 0;
    for (i = 0; i < 240; i = i + 1) begin
      if (i < 12) coin = (i % 4 == 3) ? 0 : (i < 6) ? 1 : 2;
      else coin = $random(seed) % 3;
      if (coin < 0) coin = -coin;
      n = (coin == 1); d = (coin == 2);
      rst = (i == 120);
      #1; t = c + (n ? 5 : 0) + (d ? 10 : 0);
      if (!rst && vend !== (t >= 15)) $display("FAIL credit %0d, coin n=%b d=%b: vend=%b, expected %b", c, n, d, vend, t >= 15);
      if (!rst && vend === 1) sold = sold + 1;
      @(posedge clk);
      if (rst || t >= 15) c = 0; else c = t;
      @(negedge clk);
    end
    if (sold < 10) $display("FAIL only %0d sales in 240 clocks", sold);
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-vend', chapter: 'p12-ch-clocked', title: 'A Mealy coin collector', level: 3, kind: 'verilog', module: 'vend15', ports: 'input clk, rst, n, d; output vend', synth: true,
    start: 'module vend15(input clk, input rst, input n, input d, output vend);\n\nendmodule\n',
    testbench: TB_VEND,
    text: ['A machine sells a ticket for 15 cents. In each clock period at most one coin arrives: n = 1 for a 5-cent coin, d = 1 for a 10-cent coin (never both). Write module vend15, a Mealy machine whose state is the credit so far: 0, 5 or 10 cents.', 'vend = 1 during the period in which the coin arrives that brings the credit to 15 or more, and at that edge the credit goes back to 0 (no change is given). Otherwise the coin is added to the credit at the edge. rst = 1 at an edge clears the credit.', 'The testbench drops in coins in a fixed order, then 228 random ones (or none), and checks vend before every edge.'],
    hints: ['vend depends on the state and the inputs together: a continuous assignment, not a register.', 'Work out the total the coin would make; vend is total ≥ 15. At the edge, the credit becomes 0 if vend, else the total.', "Keep the credit in cents, 5 bits wide: total = credit + (n ? 5 : 0) + (d ? 10 : 0); assign vend = (total >= 15); at the edge credit <= vend ? 0 : total."],
    solution: VEND,
    wrong: [VEND.replace('assign vend = (total >= 15);', 'assign vend = (total > 15);'), VEND.replace('    else if (vend) credit <= 5\'d0;\n', ''), 'module vend15(input clk, input rst, input n, input d, output reg vend);\n  reg [4:0] credit;\n  wire [4:0] total = credit + (n ? 5\'d5 : 5\'d0) + (d ? 5\'d10 : 5\'d0);\n  always @(posedge clk)\n    if (rst) begin credit <= 5\'d0; vend <= 1\'b0; end\n    else begin vend <= (total >= 15); credit <= (total >= 15) ? 5\'d0 : total; end\nendmodule\n'],
    why: 'A Mealy output answers in the same clock period as the input; a registered (Moore-style) vend would come one period late.',
  });

  const RISE = `module rise(input clk, input rst, input b, output p);
  reg last;
  always @(posedge clk)
    if (rst) last <= 1'b0;
    else     last <= b;
  assign p = b & ~last;
endmodule
`;
  const TB_RISE = `module tb;
  reg clk = 0, rst = 1, b = 0; wire p; reg l; integer i, seed, pulses;
  rise dut(.clk(clk), .rst(rst), .b(b), .p(p));
${CLK}  initial begin
    seed = 2; l = 0; pulses = 0;
    @(negedge clk); rst = 0;
    for (i = 0; i < 160; i = i + 1) begin
      b = (i < 10) ? (i >= 2 && i < 6) : (i % 9 == 0) ? 1 : ($random(seed) % 3 != 0);
      rst = (i == 80);
      #1;
      if (!rst && p !== (b & ~l)) $display("FAIL before edge %0d: b=%b, b at the last edge %b, so p should be %b, not %b", i + 1, b, l, b & ~l, p);
      if (p === 1) pulses = pulses + 1;
      @(posedge clk); l = rst ? 0 : b;
      @(negedge clk);
    end
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-rise', chapter: 'p12-ch-clocked', title: 'Catch the rising edge', level: 1, kind: 'verilog', module: 'rise', ports: 'input clk, rst, b; output p', synth: true,
    start: 'module rise(input clk, input rst, input b, output p);\n\nendmodule\n',
    testbench: TB_RISE,
    text: ['A button b is held for many clocks, but each press should count once. Write module rise: p = 1 while b = 1 and b was 0 at the last rising edge, so p is high for one clock period per press. rst = 1 at an edge makes the remembered value 0.', 'The testbench holds b for runs of different lengths and checks p before every edge.'],
    hints: ['Remember b in one flip-flop: last takes b at each edge.', 'p compares b now with last: a 1 now and a 0 before is a rising edge.', "always @(posedge clk) if (rst) last <= 0; else last <= b;  assign p = b & ~last;"],
    solution: RISE,
    wrong: [RISE.replace('assign p = b & ~last;', 'assign p = b ^ last;'), RISE.replace('assign p = b & ~last;', 'assign p = b;'), RISE.replace('assign p = b & ~last;', 'assign p = ~b & last;')],
  });

  const DEB = `module debounce #(parameter N = 4) (input clk, input rst, input b, output reg q);
  reg [3:0] cnt;
  always @(posedge clk)
    if (rst) begin q <= 1'b0; cnt <= 4'd0; end
    else if (b == q) cnt <= 4'd0;
    else if (cnt == N - 1) begin q <= b; cnt <= 4'd0; end
    else cnt <= cnt + 4'd1;
endmodule
`;
  const TB_DEB = `module tb;
  reg clk = 0, rst = 1, b = 0; wire q4, q2;
  reg m4, m2; integer c4, c2, i, seed, run, level, changes;
  debounce u4(.clk(clk), .rst(rst), .b(b), .q(q4));
  debounce #(.N(2)) u2(.clk(clk), .rst(rst), .b(b), .q(q2));
${CLK}  initial begin
    seed = 11; m4 = 0; m2 = 0; c4 = 0; c2 = 0; run = 0; level = 0; changes = 0;
    @(negedge clk); rst = 0;
    for (i = 0; i < 400; i = i + 1) begin
      if (i < 24) b = (i == 2 || i == 3 || i == 5 || (i >= 8 && i < 13) || (i >= 14 && i < 20));
      else begin
        if (run == 0) begin level = !level; run = 2 + ($random(seed) & 7); end
        run = run - 1;
        b = (($random(seed) & 7) == 0) ? !level : level;
      end
      rst = (i == 300);
      @(posedge clk);
      if (rst) begin m4 = 0; c4 = 0; m2 = 0; c2 = 0; end
      else begin
        if (b == m4) c4 = 0; else if (c4 == 3) begin m4 = b; c4 = 0; changes = changes + 1; end else c4 = c4 + 1;
        if (b == m2) c2 = 0; else if (c2 == 1) begin m2 = b; c2 = 0; end else c2 = c2 + 1;
      end
      @(negedge clk);
      if (q4 !== m4) $display("FAIL N=4, edge %0d (b=%b): q=%b, expected %b", i + 1, b, q4, m4);
      if (q2 !== m2) $display("FAIL N=2, edge %0d (b=%b): q=%b, expected %b", i + 1, b, q2, m2);
    end
    if (changes < 6) $display("FAIL the test made too few changes (%0d)", changes);
    $display("DONE"); $finish;
  end
endmodule`;
  ex({
    id: 'p12x-debounce', chapter: 'p12-ch-clocked', title: 'A switch debouncer', level: 3, kind: 'verilog', module: 'debounce', ports: 'debounce #(N)(input clk, rst, b, output reg q), N = 4 by default', synth: true,
    start: 'module debounce #(parameter N = 4) (input clk, input rst, input b, output reg q);\n  reg [3:0] cnt;\n\nendmodule\n',
    testbench: TB_DEB,
    text: ['A mechanical switch bounces: for a few milliseconds after it moves, b flickers. Write module debounce: q follows b, but only once b has differed from q at N rising edges in a row (N up to 15, 4 unless told otherwise). At any edge where b equals q the count starts again. rst = 1 at an edge sets q = 0 and the count to 0.', 'The testbench runs N = 4 and N = 2 side by side on a bouncing input and checks q after every edge.'],
    hints: ['Two registers: q and a counter of edges in a row with b ≠ q.', 'At each edge: if b == q, clear the count. Otherwise, if the count has reached N − 1 this is the N-th edge: copy b into q and clear the count. Otherwise count up.', "if (rst) begin q <= 0; cnt <= 0; end else if (b == q) cnt <= 0; else if (cnt == N - 1) begin q <= b; cnt <= 0; end else cnt <= cnt + 1;"],
    solution: DEB,
    wrong: [DEB.replace('else if (cnt == N - 1)', 'else if (cnt == N)'), DEB.replace("    else if (b == q) cnt <= 4'd0;\n", ''), DEB.replace('else if (cnt == N - 1)', 'else if (cnt == 3)')],
    why: 'A counter and a comparison: a glitch shorter than N clocks never reaches q.',
  });

  const MM_CHOICE = ['The Mealy output rises in the same clock period as that bit; the Moore output rises one period later, after the next rising edge.', 'Both rise together at the next rising edge.', 'The Moore output rises first, because it depends on the state alone.', 'The Mealy output rises one period after the Moore output.'];
  ex({
    id: 'p12x-mealy-moore', chapter: 'p12-ch-clocked', title: 'Which answers first?', level: 1, kind: 'choice', options: MM_CHOICE, answer: 0,
    whyNot: { 1: 'A Mealy output is a combination of the state and the input: it does not wait for an edge.', 2: 'Depending on the state alone is exactly why the Moore output must wait for the state to change.', 3: 'Look at what each output depends on: the Mealy one sees the input directly.' },
    text: ['A Mealy detector and a Moore detector for the same pattern watch the same input x. The last bit of the pattern is set on x just after a falling edge. When does each output go to 1?'],
    hints: ['A Mealy output is worked out from the state and the input together; a Moore output from the state alone.', 'The Moore machine needs the next rising edge to move into its "found" state.', 'Mealy: as soon as x changes, in the same period. Moore: after the next rising edge, one period later.'],
    solution: 0, wrong: [1, 2],
  });
  const FSMZ = {
    a: "assign z = (st == FOUND);",
    b: "always @* z = (st == WAIT) & x;",
    c: "always @(posedge clk) z <= (nx == FOUND);",
    d: "assign z = x & ~prev;",
  };
  ex({
    id: 'p12x-zreg', chapter: 'p12-ch-clocked', title: 'An output straight from a flip-flop', level: 2, kind: 'choice',
    options: ['(a) ' + FSMZ.a, '(b) ' + FSMZ.b, '(c) ' + FSMZ.c, '(d) ' + FSMZ.d], answer: 2,
    whyNot: { 0: 'A Moore output, but it is decoded from the state bits by gates after the flip-flops; it can glitch while several state bits change.', 1: 'A Mealy output: gates on the state and on x.', 3: 'Gates on x and a stored bit: still combinational.' },
    text: ['In which line is z itself the output of a flip-flop, so that it changes only at the clock edge and never glitches? (st is the state register and nx its next value.)'],
    hints: ['A flip-flop is built only from a clocked block.', 'Lines (a), (b) and (d) are combinational: gates after the state register.', 'Line (c) registers z, using the next state, so it still rises in the same period a Moore output would.'],
    solution: 2, wrong: [0, 1],
    why: 'Computing it from nx keeps the timing of a Moore output and adds a clean, registered z.',
  });

  // ---- synthesis: count the flip-flops ------------------------------------------------------------------------
  const FFMIX = `module mix(input clk, input rst, input x,
           output reg [2:0] cnt, output reg [4:0] sh,
           output reg flag, output y);
  wire t = cnt[0] & x;
  always @(posedge clk) begin
    if (rst) cnt <= 3'd0;
    else     cnt <= cnt + 3'd1;
    sh <= {sh[3:0], x};
    flag <= t;
  end
  assign y = flag ^ sh[4];
endmodule`;
  ex({
    id: 'p12x-ffcount', chapter: 'p12-ch-clocked', title: 'How many flip-flops?', level: 2, kind: 'number', answer: 9, higherLower: true,
    text: ['How many flip-flops does a synthesis tool build for this module? Count every bit.', { code: FFMIX, lang: 'verilog' }],
    hints: ['Each bit of each variable that holds its value from one clock edge to the next needs a flip-flop.', 'Only what is assigned inside always @(posedge clk) is stored: cnt, sh and flag.', 't and y are continuous assignments: gates, no storage. cnt has 3 bits, sh 5 and flag 1: 3 + 5 + 1 = 9.'],
    solution: 9, wrong: [10, 8, 11],
    why: 'Count the bits assigned in clocked blocks; everything else is gates.',
  });
  const ONEHOT = `module ring5(input clk, input rst, input go, output [4:0] st);
  reg [4:0] s;
  always @(posedge clk)
    if (rst)     s <= 5'b00001;
    else if (go) s <= {s[3:0], s[4]};
  assign st = s;
endmodule`;
  ex({
    id: 'p12x-onehot', chapter: 'p12-ch-clocked', title: 'One-hot costs flip-flops', level: 2, kind: 'number', answer: 5, higherLower: true,
    text: ['This controller steps through five states, coded one-hot (one bit per state). How many flip-flops does it need? How many would a binary code of the same five states need?', { code: ONEHOT, lang: 'verilog' }, 'Answer with the one-hot count.'],
    hints: ['One-hot: one flip-flop per state.', 's has 5 bits and every one of them is kept from edge to edge.', '5 flip-flops (a binary code would need 3, since 2² < 5 ≤ 2³).'],
    solution: 5, wrong: [3, 1],
    why: 'One-hot spends flip-flops to save logic: each state is one bit, so decoding a state is just reading a wire.',
  });

  // ===========================================================================================================
  // Chapter 4: testbenches and synthesis
  // ===========================================================================================================
  // ---- fix a testbench: the student's tester is run against a correct squarer and three broken ones --------------
  const SQ_DUTS = `module sq3(input [2:0] x, output [5:0] y);
  assign y = x * x;
endmodule
module sq3_top(input [2:0] x, output [5:0] y);
  assign y = (x == 3'd7) ? 6'd48 : x * x;
endmodule
module sq3_unknown(input [2:0] x, output [5:0] y);
  assign y = (x == 3'd5) ? 6'bxxxxxx : x * x;
endmodule
module sq3_low(input [2:0] x, output [5:0] y);
  assign y = (x == 3'd3) ? 6'd8 : x * x;
endmodule`;
  const TB_SQ = SQ_DUTS + `
module tb;
  wire [2:0] x0, x1, x2, x3; wire [5:0] y0, y1, y2, y3;
  check_sq t0(.x(x0), .y(y0)); sq3 d0(.x(x0), .y(y0));
  check_sq t1(.x(x1), .y(y1)); sq3_top d1(.x(x1), .y(y1));
  check_sq t2(.x(x2), .y(y2)); sq3_unknown d2(.x(x2), .y(y2));
  check_sq t3(.x(x3), .y(y3)); sq3_low d3(.x(x3), .y(y3));
  initial begin
    #500;
    if (t0.errors !== 0) $display("FAIL on a correct squarer your tester counts %0d errors; it should count none", t0.errors);
    if ((t3.errors > 0) !== 1'b1) $display("FAIL your tester counts no error on a squarer that gives 8 for 3 x 3");
    if ((t1.errors > 0) !== 1'b1) $display("FAIL your tester counts no error on a squarer that gives 48 for 7 x 7");
    if ((t2.errors > 0) !== 1'b1) $display("FAIL your tester counts no error on a squarer whose output is x when x = 5");
    $display("DONE"); $finish;
  end
endmodule`;
  const SQ_BUGGY = `module check_sq(output reg [2:0] x, input [5:0] y);
  integer i, errors;
  reg [2:0] want;
  initial begin
    errors = 0;
    for (i = 0; i < 7; i = i + 1) begin
      x = i;
      want = x * x;
      if (y != want) begin
        errors = errors + 1;
        $display("ERROR x=%0d: y=%0d, want %0d", x, y, want);
      end
    end
  end
endmodule
`;
  const SQ_FIXED = SQ_BUGGY.replace('reg [2:0] want;', 'reg [5:0] want;').replace('i < 7', 'i < 8').replace('      x = i;\n', '      x = i; #1;\n').replace('y != want', 'y !== want');
  ex({
    id: 'p12x-tb-fix', chapter: 'p12-ch-verify', title: 'Fix a testbench that passes everything', level: 2, kind: 'verilog', module: 'check_sq', lint: true,
    ports: 'check_sq(output reg [2:0] x, input [5:0] y), with integer errors',
    start: SQ_BUGGY,
    testbench: TB_SQ,
    text: ['check_sq is a tester for a squarer, a module with y = x × x (x has 3 bits, y has 6). It drives x through its output port, reads y, and counts mismatches in errors. It has four bugs, and as written it reports no error even for a squarer that is badly wrong.', 'Fix it. It is checked by wiring it to a correct squarer, which must give errors = 0, and to three broken ones, each of which must give errors > 0. Print lines that start with ERROR (not FAIL), and do not call $finish: the checking top reads errors at time 500.'],
    hints: ['Look at the loop bounds, the time between setting x and reading y, the width of want, and the comparison.', 'x * x is worked out in the width of want: 3 bits cannot hold 49. And with no delay, y has not answered the new x yet.', 'i < 8; x = i; #1; reg [5:0] want; and !== instead of !=, so that an x in y counts as a mismatch.'],
    solution: SQ_FIXED,
    wrong: [SQ_BUGGY, SQ_FIXED.replace('i < 8', 'i < 7'), SQ_FIXED.replace('y !== want', 'y != want'), SQ_FIXED.replace('reg [5:0] want;', 'reg [2:0] want;')],
    why: 'A testbench is code too: it is worth checking that it fails on a design that is wrong.',
  });

  // ---- write a testbench: the student's tester is run against a correct absolute difference and four broken ones ---
  const AD_DUTS = `module absdiff(input [3:0] a, input [3:0] b, output [3:0] d);
  assign d = (a > b) ? a - b : b - a;
endmodule
module ad_wrap(input [3:0] a, input [3:0] b, output [3:0] d);
  assign d = a - b;
endmodule
module ad_corner(input [3:0] a, input [3:0] b, output [3:0] d);
  assign d = (a == 4'd15 && b == 4'd0) ? 4'd14 : (a > b) ? a - b : b - a;
endmodule
module ad_unknown(input [3:0] a, input [3:0] b, output [3:0] d);
  assign d = (a == 4'd9 && b == 4'd6) ? 4'bxxxx : (a > b) ? a - b : b - a;
endmodule
module ad_bit3(input [3:0] a, input [3:0] b, output [3:0] d);
  wire [3:0] t = (a > b) ? a - b : b - a;
  assign d = {1'b0, t[2:0]};
endmodule`;
  const TB_AD = AD_DUTS + `
module tb;
  wire [3:0] a0, b0, d0, a1, b1, d1, a2, b2, d2, a3, b3, d3, a4, b4, d4;
  check_abs t0(.a(a0), .b(b0), .d(d0)); absdiff u0(.a(a0), .b(b0), .d(d0));
  check_abs t1(.a(a1), .b(b1), .d(d1)); ad_wrap u1(.a(a1), .b(b1), .d(d1));
  check_abs t2(.a(a2), .b(b2), .d(d2)); ad_corner u2(.a(a2), .b(b2), .d(d2));
  check_abs t3(.a(a3), .b(b3), .d(d3)); ad_unknown u3(.a(a3), .b(b3), .d(d3));
  check_abs t4(.a(a4), .b(b4), .d(d4)); ad_bit3 u4(.a(a4), .b(b4), .d(d4));
  initial begin
    #2000;
    if (t0.errors !== 0) $display("FAIL on a correct module your tester counts %0d errors; it should count none", t0.errors);
    if ((t1.errors > 0) !== 1'b1) $display("FAIL your tester finds nothing wrong with d = a - b, which wraps round when a < b");
    if ((t4.errors > 0) !== 1'b1) $display("FAIL your tester finds nothing wrong with a module whose d[3] is stuck at 0");
    if ((t2.errors > 0) !== 1'b1) $display("FAIL your tester finds nothing wrong with a module that is wrong only for a = 15, b = 0");
    if ((t3.errors > 0) !== 1'b1) $display("FAIL your tester finds nothing wrong with a module whose d is x only for a = 9, b = 6");
    $display("DONE"); $finish;
  end
endmodule`;
  const AD_TESTER = `module check_abs(output reg [3:0] a, output reg [3:0] b, input [3:0] d);
  integer i, errors;
  reg [3:0] want;
  initial begin
    errors = 0;
    for (i = 0; i < 256; i = i + 1) begin
      {a, b} = i;
      #1;
      want = (a > b) ? a - b : b - a;
      if (d !== want) begin
        errors = errors + 1;
        $display("ERROR a=%0d b=%0d: d=%b, want %0d", a, b, d, want);
      end
    end
  end
endmodule
`;
  ex({
    id: 'p12x-tb-write', chapter: 'p12-ch-verify', title: 'Write a tester that misses nothing', level: 3, kind: 'verilog', module: 'check_abs',
    ports: 'check_abs(output reg [3:0] a, b, input [3:0] d), with integer errors',
    start: 'module check_abs(output reg [3:0] a, output reg [3:0] b, input [3:0] d);\n  integer errors;\n  // drive a and b, wait, compare d with what it should be, count the mismatches\n\nendmodule\n',
    testbench: TB_AD,
    text: ['A module absdiff gives d = |a − b| for unsigned 4-bit a and b. Write check_abs, a tester for it: it drives a and b through its output ports, reads d, and counts in the integer errors every case where d is not what it should be (print a line starting ERROR for each, not FAIL).', 'It is checked by wiring it to a correct absdiff, which must give errors = 0, and to four broken ones, each of which must give errors > 0. One of them is wrong for a single pair of inputs only. Do not call $finish; the checking top reads errors at time 2000.'],
    hints: ['There are only 256 pairs: try them all, with a delay after each change so d can answer.', 'Work out the expected value in the tester itself, and compare with !== so that an x in d counts.', 'errors = 0; for (i = 0; i < 256; i = i + 1) begin {a, b} = i; #1; want = (a > b) ? a - b : b - a; if (d !== want) errors = errors + 1; end'],
    solution: AD_TESTER,
    wrong: [AD_TESTER.replace('d !== want', 'd != want'), AD_TESTER.replace('i < 256', 'i < 128'), AD_TESTER.replace('want = (a > b) ? a - b : b - a;', 'want = a - b;'), AD_TESTER.replace("      #1;\n", '')],
    why: 'Exhaustive and exact: the only way to catch a fault that hides in one pair out of 256.',
  });

  // ---- predictions about testbench output ------------------------------------------------------------------------
  const MON = `module tb;
  reg [2:0] n;
  initial begin
    $monitor("n=%0d", n);
    n = 0;
    #2 n = 1;
    #2 n = 1;
    #2 n = 3; n = 4;
    #2 $finish;
  end
endmodule`;
  ex({
    id: 'p12x-monitor', chapter: 'p12-ch-verify', title: 'How often does $monitor speak?', level: 1, kind: 'number', answer: 3, higherLower: true,
    text: ['How many lines does this testbench print?', { code: MON, lang: 'verilog' }],
    hints: ['$monitor prints once at the end of each time step in which a value it watches changed.', 'At time 4, n is set to 1 again: no change. At time 6 it changes twice in the same step.', 'Time 0 (n=0), time 2 (n=1), time 6 (n=4, printed once with the settled value): 3 lines.'],
    solution: 3, wrong: [4, 5],
  });
  const AVG = `module avg(input [2:0] a, input [2:0] b, output [2:0] m);
  wire [2:0] s = a + b;        // the bug: the sum needs 4 bits
  assign m = s >> 1;
endmodule

module tb;
  reg [2:0] a, b; wire [2:0] m; integer i, bad;
  avg dut(.a(a), .b(b), .m(m));
  initial begin
    bad = 0;
    for (i = 0; i < 64; i = i + 1) begin
      {a, b} = i; #1;
      if (m !== (a + b) / 2) begin
        bad = bad + 1;
        $display("ERROR %0d and %0d: m=%0d", a, b, m);
      end
    end
    $display("%0d errors", bad);
  end
endmodule`;
  ex({
    id: 'p12x-errcount', chapter: 'p12-ch-verify', title: 'How many errors does it report?', level: 2, kind: 'number', answer: 28, higherLower: true,
    text: ['avg should give the average of a and b, rounded down. Its sum is one bit too narrow. The self-checking testbench below tries every pair: what number does its last line print?', { code: AVG, lang: 'verilog' }],
    hints: ['The sum s keeps only 3 bits, so it is wrong exactly when a + b ≥ 8. In the comparison, (a + b) / 2 is worked out in 32 bits (the 2 is an integer), so the expected value is right.', 'Count the pairs (a, b), each from 0 to 7, with a + b ≥ 8.', 'For a = 1 one pair (b = 7), for a = 2 two, … for a = 7 seven: 1 + 2 + … + 7 = 28.'],
    solution: 28, wrong: [36, 0, 27],
  });
  const MEMF = '// three words\n@1\n0a\n0b\n@0\n05\n';
  const MEMV = `module tb;
  reg [7:0] m [0:3];
  initial begin
    m[3] = 8'hff;
    $readmemh("words.hex", m);
    $display("%h %h %h %h", m[0], m[1], m[2], m[3]);
  end
endmodule`;
  ex({
    id: 'p12x-readmem', chapter: 'p12-ch-verify', title: 'Where does $readmemh put each word?', level: 2, kind: 'string', placeholder: 'four hex words', answer: '05 0a 0b ff',
    accept: printed('05 0a 0b ff', { '0a 0b 05 ff': '@0 moves back to word 0 before 05 is read: an @ address says where the next word goes.', '05 0a 0b xx': 'm[3] was set to ff before the read, and the file never reaches word 3, so it keeps ff.', '0a 0b 05 xx': 'Two things: @ addresses, and a word the file does not reach keeps its old value.' }),
    text: ['The file words.hex holds:', { code: MEMF, lang: 'text' }, 'What does this testbench print?', { code: MEMV, lang: 'verilog' }],
    hints: ['$readmemh reads hex words in order into m, starting at word 0; @n moves to word n.', '@1: 0a goes to m[1] and 0b to m[2]. Then @0: 05 goes to m[0].', 'Word 3 is never reached, so it keeps ff: "05 0a 0b ff".'],
    solution: '05 0a 0b ff', wrong: ['0a 0b 05 ff', '05 0a 0b xx'],
  });
  const UDP = `primitive choose(y, s, a, b);
  output y;
  input s, a, b;
  table
  // s a b : y
     0 0 ? : 0;
     0 1 ? : 1;
     1 ? 0 : 0;
     1 ? 1 : 1;
     x 0 0 : 0;
     x 1 1 : 1;
  endtable
endprimitive

module tb;
  reg s, a, b; wire y;
  choose c(y, s, a, b);
  initial begin
    s = 1'bx; a = 1; b = 1; #1 $write("%b", y);
    s = 1'bx; a = 0; b = 1; #1 $write("%b", y);
    s = 1;    a = 1; b = 0; #1 $display("%b", y);
  end
endmodule`;
  ex({
    id: 'p12x-udp', chapter: 'p12-ch-verify', title: 'Read a primitive\'s table', level: 1, kind: 'string', placeholder: 'three characters, like 01x', answer: '1x0', caseless: true,
    accept: printed('1x0', { '100': 'For s = x, a = 0, b = 1 no row of the table matches: a primitive gives x then.', '110': 'Look for a row matching x 0 1: there is none.', '1x1': 'With s = 1 the output follows b.' }),
    text: ['A user-defined primitive is a gate given by its truth table. ? in a row matches 0, 1 or x, and when no row matches, the output is x. What does this print? ($write prints without ending the line.)', { code: UDP, lang: 'verilog' }],
    hints: ['Find the row that matches each input, from the top.', 's = x, a = 1, b = 1 matches the row x 1 1 : 1. s = x, a = 0, b = 1 matches no row.', 'It prints 1, then x, then 0 (s = 1 follows b): "1x0".'],
    solution: '1x0', wrong: ['100', '110'],
    why: 'The table says the multiplexer\'s output is known even when s is not, as long as a and b agree.',
  });
  ex({
    id: 'p12x-synth-which', chapter: 'p12-ch-verify', title: 'Which one cannot be built?', level: 1, kind: 'choice',
    options: ['assign y = a & b;', 'always @(posedge clk) q <= d;', 'always @* begin n = 0; t = v; while (t != 0) begin n = n + 1; t = t & (t - 1); end end', "always @(posedge clk or posedge rst) if (rst) q <= 1'b0; else q <= d;"], answer: 2,
    whyNot: { 0: 'An AND gate.', 1: 'A D flip-flop.', 3: 'A D flip-flop with an asynchronous reset: the tool knows this shape.' },
    text: ['Which of these can a synthesis tool not turn into gates?'],
    hints: ['A loop is built by drawing one copy of its body per turn.', 'How many turns does the while loop make? It depends on v.', 'The while loop has no fixed number of turns, so there is no fixed number of copies to draw. A for loop with constant bounds is fine.'],
    solution: 2, wrong: [3, 0],
    why: 'For a count of 1s, write a for loop over the four bits instead: four fixed copies of n = n + v[i].',
  });

  // ---- what the diagram checker looks at on these pages -------------------------------------------------------
  if (S.Checks && !S.Checks.some((c) => c.name === 'exercise p12x-alarm')) {
    const exReady = "document.querySelector('#exerciseView')";
    for (const id of C.chapters.filter((c) => c.part === 'verilog').flatMap((c) => c.exercises))
      S.Checks.push({ group: 'learn', name: 'exercise ' + id, hash: 'exercise=' + id, ready: exReady, sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
