// Part 12, Verilog: lessons, a tour and a course. Four chapters: describing structure (modules, ports, gate
// primitives, continuous assignment, widths, the four values, hierarchy and generate), behaviour in always blocks
// (sensitivity, if and case, casez and loops, blocking and non-blocking, latches), clocked designs and state
// machines (registers, counters, Moore and Mealy, a debouncer), and testbenches and synthesis. The exercises are in
// 93-verilog-ex.js. Every module and testbench here is our own, and every printed value quoted was run on
// Sirkit.Verilog.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.lessons.has('p12l-modules')) return;

  C.chapter({ id: 'p12-ch-structure', part: 'verilog', n: 1, title: 'Describing structure', blurb: 'Modules and ports, gate primitives and continuous assignment, Verilog\'s width rules and its four values, and designs built from copies of smaller ones.' });
  C.chapter({ id: 'p12-ch-behaviour', part: 'verilog', n: 2, title: 'Behaviour in always blocks', blurb: 'Always blocks and what wakes them, if and case, casez and loops, blocking against non-blocking assignment, and the latches incomplete code builds.' });
  C.chapter({ id: 'p12-ch-clocked', part: 'verilog', n: 3, title: 'Clocked designs and state machines', blurb: 'Registers, counters and shift registers, a register file, Moore and Mealy machines, and a switch debouncer built from a counter and a comparison.' });
  C.chapter({ id: 'p12-ch-verify', part: 'verilog', n: 4, title: 'Testbenches and synthesis', blurb: 'Initial blocks, delays and printing, testbenches that check themselves, test vectors from a file, and what a synthesis tool can and cannot draw.' });

  const L = (x) => C.lesson(x);
  const X = (id) => ({ exercise: id });
  /** the values of a topic's preset, by its label (the topics are loaded before the content) */
  const pre = (id, label) => {
    const t = S.byId && S.byId(id);
    const p = t && (t.presets || []).find((x) => x.label === label);
    return p ? p.values : undefined;
  };

  // ---- the live examples (each one run on Sirkit.Verilog; the outputs quoted are what it prints) ------------------
  const ODD3 = `// odd3: 1 when an odd number of its inputs are 1
module odd3(input a, input b, input c, output y);
  wire t;
  xor g1(t, a, b);
  xor g2(y, t, c);
endmodule

module tb;
  reg a, b, c;
  wire y;
  integer i;
  odd3 dut(.a(a), .b(b), .c(c), .y(y));
  initial begin
    for (i = 0; i < 8; i = i + 1) begin
      {a, b, c} = i;
      #1 $display("%b%b%b -> %b", a, b, c, y);
    end
  end
endmodule`;
  const XPROP = `module tb;
  reg [3:0] a;
  reg en;
  wire [3:0] masked = a & {4{en}};
  wire [3:0] sum = a + 4'd1;
  initial begin
    a = 4'b10x1; en = 0;
    #1 $display("en=0: masked=%b sum=%b", masked, sum);
    en = 1;
    #1 $display("en=1: masked=%b sum=%b", masked, sum);
  end
endmodule`;
  const QUARTER = `// which quarter of a 0-15 dial is v in? a one-hot answer from a case
module quarter(input [3:0] v, output reg [3:0] q);
  always @* begin
    case (v[3:2])
      2'd0:    q = 4'b0001;
      2'd1:    q = 4'b0010;
      2'd2:    q = 4'b0100;
      default: q = 4'b1000;
    endcase
  end
endmodule

module tb;
  reg [3:0] v;
  wire [3:0] q;
  quarter dut(.v(v), .q(q));
  initial begin
    v = 4'd2;  #1 $display("v=%0d q=%b", v, q);
    v = 4'd7;  #1 $display("v=%0d q=%b", v, q);
    v = 4'd13; #1 $display("v=%0d q=%b", v, q);
  end
endmodule`;
  const JOHNSON = `// A 4-bit Johnson (twisted-ring) counter: eight states, one bit changing per clock
module johnson(input clk, input rst, output reg [3:0] q);
  always @(posedge clk)
    if (rst) q <= 4'b0000;
    else     q <= {q[2:0], ~q[3]};
endmodule

module tb;
  reg clk = 0, rst = 1;
  wire [3:0] q;
  integer k;
  johnson dut(.clk(clk), .rst(rst), .q(q));
  always #5 clk = ~clk;
  initial begin
    @(negedge clk) rst = 0;
    for (k = 1; k <= 9; k = k + 1) begin
      @(negedge clk) $display("after edge %0d: q = %b", k, q);
    end
    $finish;
  end
endmodule`;
  const TWICE = `// Mealy: z = 1 while x equals the bit read at the last edge (two equal bits in a row)
module twice(input clk, input rst, input x, output z);
  localparam NONE = 2'd0, LAST0 = 2'd1, LAST1 = 2'd2;
  reg [1:0] st, nx;
  always @(posedge clk)            // the state register
    if (rst) st <= NONE;
    else     st <= nx;
  always @* begin                  // the next-state logic
    case (st)
      NONE:    nx = x ? LAST1 : LAST0;
      LAST0:   nx = x ? LAST1 : LAST0;
      default: nx = x ? LAST1 : LAST0;
    endcase
  end
  assign z = (st == LAST0 && !x) || (st == LAST1 && x);   // a Mealy output
endmodule

module tb;
  reg clk = 0, rst = 1, x = 0;
  wire z;
  reg [9:0] bits = 10'b0110001011;
  integer i;
  twice dut(.clk(clk), .rst(rst), .x(x), .z(z));
  always #5 clk = ~clk;
  initial begin
    @(negedge clk) rst = 0;
    for (i = 9; i >= 0; i = i - 1) begin
      x = bits[i];
      #1 $write("%b", z);
      @(negedge clk);
    end
    $display("");
    $finish;
  end
endmodule`;
  const TWICE_FSM = 'mealy\ninputs X\noutputs Z\nNONE: 0 -> LAST0/0, 1 -> LAST1/0\nLAST0: 0 -> LAST0/1, 1 -> LAST1/0\nLAST1: 0 -> LAST0/0, 1 -> LAST1/1';
  const DEB3 = `// A debouncer that keeps the last three samples of b: q moves only when all three agree
module deb3(input clk, input rst, input b, output reg q);
  reg [2:0] h;
  always @(posedge clk)
    if (rst) begin h <= 3'b000; q <= 1'b0; end
    else begin
      h <= {h[1:0], b};
      if (h == 3'b111) q <= 1'b1;
      else if (h == 3'b000) q <= 1'b0;
    end
endmodule

module tb;
  reg clk = 0, rst = 1, b = 0;
  wire q;
  reg [15:0] pat = 16'b0101100111111010;
  integer i;
  deb3 dut(.clk(clk), .rst(rst), .b(b), .q(q));
  always #5 clk = ~clk;
  initial begin
    @(negedge clk) rst = 0;
    $display("b: %b", pat);
    $write("q: ");
    for (i = 15; i >= 0; i = i - 1) begin
      b = pat[i];
      @(negedge clk) $write("%b", q);
    end
    $display("");
    $finish;
  end
endmodule`;
  const TBDEMO = `module tb;
  reg [3:0] n;
  initial begin
    $monitor("t=%0t n=%0d", $time, n);
    n = 4'd1;
    #3 n = n * 2;
    #3 n = n * 2;
    #3 n = n * 2;
    #1 $display("done at %0t", $time);
    $finish;
  end
endmodule`;
  const TESTER = `// The design: the larger of two 3-bit numbers, and a copy with a mistake
module big(input [2:0] a, input [2:0] b, output [2:0] m);
  assign m = (a > b) ? a : b;
endmodule
module big_bad(input [2:0] a, input [2:0] b, output [2:0] m);
  assign m = (a[2] > b[2]) ? a : b;   // looks only at the top bit
endmodule

// The tester: drives a and b, checks m, counts the errors
module tester(output reg [2:0] a, output reg [2:0] b, input [2:0] m);
  integer i, errors;
  initial begin
    errors = 0;
    for (i = 0; i < 64; i = i + 1) begin
      {a, b} = i;
      #1 if (m !== ((a > b) ? a : b)) errors = errors + 1;
    end
  end
endmodule

// The top: one tester per design
module tb;
  wire [2:0] a1, b1, m1, a2, b2, m2;
  tester t1(.a(a1), .b(b1), .m(m1));  big     d1(.a(a1), .b(b1), .m(m1));
  tester t2(.a(a2), .b(b2), .m(m2));  big_bad d2(.a(a2), .b(b2), .m(m2));
  initial #100 $display("big: %0d errors, big_bad: %0d errors", t1.errors, t2.errors);
endmodule`;
  const MAJ = `// A user-defined primitive: the majority of three, given by its table
primitive maj(y, a, b, c);
  output y;
  input a, b, c;
  table
  // a b c : y
     1 1 ? : 1;
     1 ? 1 : 1;
     ? 1 1 : 1;
     0 0 ? : 0;
     0 ? 0 : 0;
     ? 0 0 : 0;
  endtable
endprimitive

module tb;
  reg a, b, c;
  wire y;
  maj m(y, a, b, c);
  initial begin
    a = 1; b = 1; c = 1'bx; #1 $display("1 1 x -> %b", y);
    a = 0; b = 1; c = 1'bx; #1 $display("0 1 x -> %b", y);
    a = 0; b = 0; c = 1;    #1 $display("0 0 1 -> %b", y);
  end
endmodule`;

  // =========================================================================================================
  // Chapter 1: describing structure
  // =========================================================================================================
  L({
    id: 'p12l-modules', chapter: 'p12-ch-structure', title: 'Modules, ports and gate primitives', minutes: 8,
    summary: 'A module is a box with named pins. Inside, gate primitives list the gates and the wires between them; outside, a testbench places the box and drives its inputs.',
    blocks: [
      'A schematic is a picture, and pictures are hard to search, compare or send to a tool. A **hardware description language** says the same thing as text. In Verilog the unit of description is the **module**: a box with a name, a list of pins, and whatever sits inside.',
      { code: 'module odd3(input a, input b, input c, output y);\n  wire t;\n  xor g1(t, a, b);\n  xor g2(y, t, c);\nendmodule', lang: 'verilog' },
      { def: 'Module', text: 'a named block of hardware. Its header lists the ports, each with a direction (input, output or inout) and a width; its body says what is inside.' },
      'The body of odd3 is two **gate primitives**. Verilog has one for each basic gate (and, or, nand, nor, xor, xnor, not, buf). Each line is one gate: an optional name, then the output first and the inputs after it. The wire t joins the two gates, exactly as a line in a drawing would.',
      { topic: 'vl-module', frame: 4, caption: 'A testbench is a module with no ports: it is the whole world for the design. Here it places one copy, named dut, and joins the ports by name. Step on to see the inputs change and the output answer.' },
      'A module never runs by itself. A **testbench** places it, connects regs to its inputs and wires to its outputs, and changes the inputs over time. Run this one and the console shows the whole truth table:',
      { predict: { q: 'Before you run it: what does the line for 110 end with?', options: ['-> 0', '-> 1', '-> x'], answer: 0, explain: 'Two of the three inputs are 1, an even number, so y = 0. The first xor gives 1 ⊕ 1 = 0 and the second 0 ⊕ 0 = 0.' } },
      { verilog: ODD3, run: true, caption: 'odd3 and a testbench that walks the eight rows. {a, b, c} = i sets three 1-bit regs from the bits of i at once.' },
      { h: 'Delays' },
      'A primitive may carry a delay, written #n, the time from an input changing to its output following. Delays matter only in simulation: they let you watch a change ripple through the gates, and see what unequal paths do.',
      { topic: 'vl-gates', frame: 10, caption: 'a and b rise at 10 ns. g1 answers 2 ns later and the OR gate g4 3 ns after that: y rises at 15 ns.' },
      { topic: 'vl-gates', input: pre('vl-gates', 'A glitch from unequal delays'), frame: 13, caption: 'With unequal delays, one AND gate lets go before the other takes over, and y dips to 0 for 3 ns: a hazard, visible only because the delays are modelled.' },
      { tip: 'A synthesis tool ignores #: real gates have the delays their transistors give them. Write delays in testbenches and in models you only simulate.' },
      { h: 'What to take away' },
      { list: ['A module is a box: a header with ports, a body with what is inside.', 'A gate primitive is one gate: output first, then the inputs.', 'A testbench is a module with no ports that places the design and drives it.', '#n delays are for simulation only.'] },
      X('p12x-alarm'),
    ],
  });

  L({
    id: 'p12l-assign', chapter: 'p12-ch-structure', title: 'Continuous assignment, widths and four values', minutes: 9,
    summary: 'assign drives a wire with an expression, for ever. The expression is worked out in the width of its widest part, the target included; and every bit can be 0, 1, x or z.',
    blocks: [
      'Here is a 4-bit adder in one line: `assign s = a + b;`. Give it a = 13 and b = 6. What is s?',
      { def: 'Continuous assignment', text: 'assign target = expression; the target (a wire) is driven by the expression at every moment: whenever anything on the right changes, the target follows.' },
      { topic: 'vl-assign', input: pre('vl-assign', '13 + 6 in 4 bits'), frame: 3, caption: '13 + 6 = 19 needs 5 bits. s has 4, so the sum is done in 4 bits and the top bit falls off: s = 3.' },
      'Verilog works an expression out in the width of its **widest operand or target**. Make the target wider and the carry is kept. A concatenation on the left, `{co, s} = a + b`, is one 5-bit target whose top bit is the carry:',
      { topic: 'vl-assign', input: pre('vl-assign', '{co, s} = 9 + 9'), frame: 3, caption: '9 + 9 = 18 = 10010: co = 1 and s = 0010.' },
      { predict: { q: 'a is 4\'b1101, declared signed (−3). b is 4\'b0010 (2), declared without signed. What is a < b?', options: ['1, since −3 < 2', '0, since 13 < 2 is false', 'x'], answer: 1, explain: 'When one operand is unsigned the whole comparison is unsigned, and 1101 reads as 13. Verilog does not mix signed and unsigned.' } },
      { topic: 'vl-assign', input: pre('vl-assign', '−3 < 2 with b unsigned'), frame: 2, caption: 'The unsigned b makes the comparison unsigned. $signed(b), or declaring b signed, fixes it.' },
      { h: 'Four values' },
      'A wire in Verilog is not just 0 or 1. **x** means unknown: never set, or driven two ways at once. **z** means not driven at all, a wire left floating. The operators are careful about x: they give x only when the answer really depends on the unknown bit.',
      { topic: 'vl-4state', frame: 12, caption: '0 & x is 0 and 1 | x is 1, because the x cannot matter there; 1 & x, 0 | x and anything ^ x stay x.' },
      'Arithmetic is not so careful. Any x bit in an operand of + makes the whole sum x, while a bitwise AND keeps the bits it can:',
      { verilog: XPROP, run: true, caption: 'a has one unknown bit. Masking with en = 0 gives a clean 0000; masking with en = 1 keeps the x where it was. a + 1 is xxxx either way.' },
      { topic: 'vl-4state', input: pre('vl-4state', 'A shared bus: z and fights'), frame: 13, caption: 'Two tristate drivers on one wire. With neither enabled the bus is z; with both enabled and disagreeing it is x.' },
      { warn: '== with an x on either side gives x, and if treats that as false. To test for x in a testbench, use ===, which compares 0, 1, x and z exactly.' },
      { h: 'What to take away' },
      { list: ['assign drives a wire with an expression at every moment.', 'An expression is worked out in the width of its widest part, the target included; extra bits are dropped.', 'Mixing signed and unsigned makes the whole expression unsigned.', 'x is unknown, z is undriven; === sees them, == does not.'] },
      X('p12x-cmp2'), X('p12x-dec38'), X('p12x-satadd'), X('p12x-width'), X('p12x-xvalues'), X('p12x-eqx'),
    ],
  });

  L({
    id: 'p12l-hier', chapter: 'p12-ch-structure', title: 'Hierarchy, parameters and generate', minutes: 9,
    summary: 'Modules place copies of other modules. Parameters let one module come in many widths, and a generate loop places as many copies as a parameter asks for.',
    blocks: [
      'An 8-bit ripple-carry adder is eight full adders in a row. You could write the full adder once and place it eight times by hand, but what about a 32-bit one? Verilog has three tools for this: hierarchy, parameters and generate.',
      { h: 'Modules inside modules' },
      'A module places a copy of another by naming the module, then the copy, then the connections. Connections **by name**, `.x(a)`, say which port each wire goes to. Connections **by position** just list the wires in the order the ports were declared, and nothing checks that the order is the one you meant.',
      { topic: 'vl-hier', input: pre('vl-hier', 'By position, two swapped'), frame: 11, caption: 'Two wires swapped in a positional list: legal, silent, and wrong in six rows of eight. Named connections would have shown it at a glance.' },
      { tip: 'Connect by name. It costs a few characters and catches a whole class of mistakes.' },
      { h: 'Parameters' },
      'A **parameter** is a constant a module is built with, given a default in the header and changed per copy with #( ). Write every width in terms of it, and one module serves every width:',
      { code: 'module reg_n #(parameter W = 8) (input clk, input [W-1:0] d, output reg [W-1:0] q);\n  always @(posedge clk) q <= d;\nendmodule\n\n// in some other module:\nreg_n #(.W(12)) wide(.clk(clk), .d(x12), .q(y12));   // a 12-bit copy\nreg_n           byte0(.clk(clk), .d(x8),  .q(y8));    // the default, 8 bits', lang: 'verilog' },
      { h: 'Generate' },
      'A **generate loop** places one copy of its body for each value of a genvar, at build time. The loop\'s block gets a name, and each copy is known by it: stage[0], stage[1], and so on.',
      { topic: 'vl-generate', frame: 4, caption: 'Building with N = 4: four full adders, bit[0].f to bit[3].f, each joined to its own bits and to the carry of the one before.' },
      { predict: { q: 'The same adder is built with N = 6. How many full adders does the generate loop place?', options: ['4', '6', '7'], answer: 1, explain: 'One per value of k from 0 to N − 1: six copies. The carry wire has N + 1 = 7 bits, but the adders are six.' } },
      { topic: 'vl-generate', input: pre('vl-generate', 'N = 2: 3 + 1 overflows'), frame: 6, caption: 'Change N and the same text builds a different adder. With N = 2, 3 + 1 = 4 overflows into the carry out.' },
      { h: 'What to take away' },
      { list: ['A module places copies of others; connect by name.', 'A parameter sets a module\'s size per copy: write widths as [W-1:0].', 'A generate loop places one copy per value of a genvar, each named by the loop\'s block.'] },
      X('p12x-pick3'), X('p12x-maxn'), X('p12x-addn'),
    ],
  });

  // =========================================================================================================
  // Chapter 2: behaviour in always blocks
  // =========================================================================================================
  L({
    id: 'p12l-always', chapter: 'p12-ch-behaviour', title: 'Always blocks, if and case', minutes: 9,
    summary: 'An always block runs its statements whenever something in its list changes. With @* and a value for every output on every path, it describes combinational logic in the style of a program.',
    blocks: [
      'Some logic is easier to say as a procedure than as an expression: "if the select is 2, pass c; otherwise …". An **always block** holds statements that run, top to bottom, every time it is woken. What wakes it is its **sensitivity list**, written after @.',
      { code: 'always @(a or b)      // wakes when a or b changes\n  y = a & b & c;      // ... but it also reads c', lang: 'verilog' },
      { predict: { q: 'a = b = 1 and y = 0. Now c changes from 0 to 1. What does the simulation do?', options: ['y becomes 1 at once', 'Nothing: the block sleeps and y stays 0', 'y becomes x'], answer: 1, explain: 'c is not in the list, so the change does not wake the block. A synthesis tool reads only the statement and builds an AND gate, which would answer: simulation and hardware now disagree.' } },
      { topic: 'vl-always', frame: 3, caption: 'c changes, the block sleeps, and the gate the tool would build gives 1 while the simulation keeps 0. The lint warns about exactly this.' },
      { topic: 'vl-always', input: pre('vl-always', '@* lists them for you'), frame: 10, caption: 'always @* builds the list from what the block reads. It can never forget a name.' },
      { warn: 'output reg y does not make a register. reg only means "assigned inside an always block". Whether hardware stores anything depends on the block, not the keyword.' },
      { h: 'if and case' },
      'Inside the block, **if … else if … else** tries its conditions in order and the first true one wins. That order is a priority, and it is built as a chain of multiplexers. A **case** compares one value against a list of labels, the natural shape for decoding a select.',
      { topic: 'vl-ifcase', frame: 24, caption: 'The chain s1, then s0, then the rest: the first condition sits nearest the output, so it has the last word.' },
      { verilog: QUARTER, run: true, caption: 'A case on the top two bits of v. The default arm makes sure q is assigned whatever v is.' },
      { h: 'What to take away' },
      { list: ['An always block runs when something in its list changes; write @* for combinational logic.', 'reg means "assigned in an always block", not "a register".', 'if … else if is a priority chain; case decodes one value.', 'Give every output a value on every path (more on this in a later lesson).'] },
      X('p12x-mux8'), X('p12x-alu'), X('p12x-sens'),
    ],
  });

  L({
    id: 'p12l-casez-loops', chapter: 'p12-ch-behaviour', title: 'casez, loops, functions and tasks', minutes: 8,
    summary: 'casez lets a label say "any value" in some bits. A for loop with a fixed count is unrolled into copies of its body. Functions compute a value; tasks may also wait.',
    blocks: [
      'A priority encoder has eight request lines and must report the highest one that is 1. Listing all 256 input values in a case would work, but most bits do not matter once a higher one is 1. **casez** lets a label say so: a **?** in a label matches anything in that bit.',
      { topic: 'vl-casez', frame: 13, caption: 'r = 1011 matches 1??? on the first line. The labels are tried in order, so they act as a priority.' },
      { predict: { q: 'With the labels 1???, 01??, 001?, 0001 in that order, which line matches r = 0101?', options: ['1???', '01??', '001?', 'none: the default runs'], answer: 1, explain: 'Bit 3 is 0, so 1??? fails; bit 3 is 0 and bit 2 is 1, so 01?? matches.' } },
      { topic: 'vl-casez', input: pre('vl-casez', 'casex with an unknown input'), frame: 4, caption: 'casex also treats x in the input as a wildcard, so an unknown input can quietly match a label. casez is the safer habit.' },
      { h: 'Loops' },
      'A **for** loop in an always block runs, in simulation, all within the same instant. A synthesis tool cannot run anything; it **unrolls** the loop into one copy of the body per turn. That works only when the number of turns is fixed when the circuit is built.',
      { topic: 'vl-loops', frame: 16, caption: 'Four turns, four copies of n = n + v[i]: a little adder tree counting the 1s of v.' },
      { h: 'Functions and tasks' },
      'A **function** takes inputs and returns one value, with no waiting; use it for a calculation you need in several places, and the tool pastes its logic wherever it is called. A **task** may wait (#, @) and hands results back through output arguments, which makes it the tool of testbenches.',
      { topic: 'vl-func', frame: 17, caption: 'A function inside an assign, and a task that sets the input, waits 5 ns and prints. The initial block waits along with the task it called.' },
      { h: 'What to take away' },
      { list: ['casez: ? in a label matches any bit; labels are tried in order.', 'Prefer casez to casex: casex can hide x.', 'A for loop is unrolled; its count must be fixed.', 'Functions compute (no waiting); tasks may wait.'] },
      X('p12x-penc'), X('p12x-lzc'),
    ],
  });

  L({
    id: 'p12l-nba', chapter: 'p12-ch-behaviour', title: 'Blocking and non-blocking assignment', minutes: 10,
    summary: '= changes a variable at once; <= reads its right side now and makes the change after everything else at that moment. Clocked blocks use <=, so that all registers change together.',
    blocks: [
      'Two registers a and b should swap their values at every clock edge, as two D flip-flops cross-wired would. Write it with two always blocks, each copying one into the other. Does it swap?',
      'Verilog has two assignments. **Blocking** `a = b;` changes a at once, so the next statement already sees the new value. **Non-blocking** `a <= b;` works out b now but only writes the change down; all such changes are made together once nothing else is left to run at that moment.',
      { topic: 'vl-nba', frame: 6, caption: 'At the edge both blocks read the old values (1 and 0) and write their updates down. In the NBA region both changes are made together: the values swap.' },
      { predict: { q: 'Now both blocks use = instead (a = b; and b = a;). a = 0 and b = 1 before the edge. What do they hold after it?', options: ['a = 1, b = 0: swapped', 'a = 1, b = 1, or a = 0, b = 0, depending on which block runs first', 'a = x, b = x'], answer: 1, explain: 'Whichever block runs first changes its variable at once; the other then copies the new value. The order of two blocks on the same edge is not promised, so this is a race.' } },
      { topic: 'vl-nba', input: pre('vl-nba', 'Swap with = in two blocks'), frame: 9, caption: 'This simulator happened to run a = b first: both end as 1. Another could pick the other order. Either way, no swap.' },
      'The same trap catches a shift register written with = in one block: the statement order becomes the wiring.',
      { topic: 'vl-race', input: pre('vl-race', '= in order: three copies of d'), frame: 9, caption: 'q1 = d; q2 = q1; q3 = q2; with = each line sees the line before, so all three copy d at once.' },
      { topic: 'vl-race', frame: 9, caption: 'With <= every right side is read before any update: a bit moves one place per edge, whatever the order of the lines.' },
      'Blocking assignments are right where they belong: in combinational always @* blocks, where a value worked out on one line is meant to be used on the next. The [Verilog page](#verilog) has a ready example, Blocking vs non-blocking, under Examples.',
      { list: ['Clocked block (posedge clk): use <= for every register.', 'Combinational block (@*): use =.', 'Never assign the same variable from two always blocks.'] },
      { h: 'What to take away' },
      { list: ['= changes at once; <= reads now and updates at the end of the time step.', 'With <= the order of statements and of blocks does not matter.', 'Two blocks with = on one edge race.'] },
      X('p12x-blocking'), X('p12x-nonblocking'), X('p12x-mixed'),
    ],
  });

  L({
    id: 'p12l-latches', chapter: 'p12-ch-behaviour', title: 'Latches nobody asked for', minutes: 7,
    summary: 'When a combinational always block leaves an output unassigned on some path, the output must remember its old value, and the tool builds a latch. Give every output a value on every path.',
    blocks: [
      'Write `always @* if (en) q = d;` and ask what q is when en = 0. The block does not say. In simulation q simply keeps its old value. A synthesis tool must build something that keeps a value: a **latch**.',
      { topic: 'vl-latch', frame: 11, caption: 'From 20 ns to 40 ns en = 0 and q held 1 while d fell: memory, from a block that was meant to be combinational.' },
      'Latches are hard to time, and in a design built around clock edges they are almost always a mistake. The cure is to make sure every output gets a value on every path through the block: an else for each if, a default for each case, or simplest of all, a value given at the top of the block before any decision.',
      { topic: 'vl-latch', input: pre('vl-latch', 'A value first: a gate'), frame: 11, caption: 'q = 0 first, then if (en) q = d: every path gives q a value, and the tool builds q = en & d.' },
      { predict: { q: 'always @* case (sel) 2\'d0: y = a; 2\'d1: y = b; 2\'d2: y = c; endcase — is y a latch?', options: ['No: it is a multiplexer', 'Yes: for sel = 3 nothing assigns y', 'Only if sel is x'], answer: 1, explain: 'sel = 3 matches no label and there is no default, so y must keep its old value then. Add default: y = 1\'b0; (or any value).' } },
      { tip: 'The lint on the Verilog page warns about every inferred latch, naming the variable and the always block. Treat the warning as an error.' },
      'In a **clocked** block the same pattern is no mistake. `always @(posedge clk) if (en) q <= d;` keeps q when en = 0, and keeping is what a flip-flop does anyway: the tool builds a flip-flop with an enable.',
      { h: 'What to take away' },
      { list: ['An output unassigned on some path of an @* block becomes a latch.', 'Cure: a default value at the top, or else and default everywhere.', 'In a clocked block, holding a value is just a flip-flop.'] },
      X('p12x-latch-line'), X('p12x-latch-which'),
    ],
  });

  // =========================================================================================================
  // Chapter 3: clocked designs and state machines
  // =========================================================================================================
  L({
    id: 'p12l-registers', chapter: 'p12-ch-clocked', title: 'Registers, counters and shift registers', minutes: 9,
    summary: 'always @(posedge clk) with <= is how Verilog says "flip-flops". A reset, an enable, an adder or a concatenation in front of them gives registers, counters and shift registers.',
    blocks: [
      'How do you say "a D flip-flop" in Verilog? There is no flip-flop primitive. Instead you describe what happens at the clock edge, and the tool recognises the shape:',
      { code: "always @(posedge clk)               // a register with a synchronous reset\n  if (rst) q <= 4'd0;               //   rst acts only at an edge\n  else     q <= d;\n\nalways @(posedge clk or posedge rst) // an asynchronous reset\n  if (rst) q <= 4'd0;               //   rst acts at once, edge or not\n  else     q <= d;", lang: 'verilog' },
      { topic: 'vl-synth', input: pre('vl-synth', 'An asynchronous reset'), frame: 2, caption: 'Two edges in the list and an if that tests the reset first: the tool knows this shape as a flip-flop with an asynchronous clear.' },
      'Everything assigned with <= inside such a block becomes flip-flops, one per bit. What sits in front of them is ordinary logic: q + 1 makes a counter, {q[2:0], s} a shift register, a case on a mode a universal register.',
      { predict: { q: 'Before you run it: the Johnson counter starts at 0000. What does it hold after the fifth edge?', options: ['0101', '1111', '1110', '0000'], answer: 2, explain: 'It fills with 1s from the bottom (0001, 0011, 0111, 1111), then with 0s: the fifth edge shifts in ~1 = 0, giving 1110. Run it to see all nine edges.' } },
      { verilog: JOHNSON, run: true, caption: 'A Johnson counter: the inverted top bit is shifted in at the bottom. Four flip-flops, eight states.' },
      { h: 'A register file' },
      'A processor keeps its registers in a **register file**: an array of registers, written one at a time at the clock edge and read through combinational ports. Verilog declares an array with a second range after the name:',
      { code: "reg [7:0] r [0:3];                  // four 8-bit registers\nalways @(posedge clk)\n  if (we) r[wa] <= wd;              // one write port, clocked\nassign da = r[ra];                  // read ports: just multiplexers", lang: 'verilog' },
      { tip: 'Only what is assigned in a clocked block is stored. Count the bits assigned there and you know how many flip-flops the tool will build.' },
      { h: 'What to take away' },
      { list: ['always @(posedge clk) with <= describes flip-flops.', 'Synchronous reset: tested inside the block. Asynchronous: also in the list, and tested first.', 'Counters, shift registers and register files are flip-flops with logic in front.'] },
      X('p12x-sipo'), X('p12x-updown'), X('p12x-modn'), X('p12x-ushift'), X('p12x-regfile'), X('p12x-ffcount'),
    ],
  });

  L({
    id: 'p12l-fsm', chapter: 'p12-ch-clocked', title: 'State machines: Moore and Mealy', minutes: 10,
    summary: 'A state machine in Verilog is a state register, next-state logic and output logic. A Moore output is decoded from the state; a Mealy output also reads the inputs and answers in the same clock period.',
    blocks: [
      'Every synchronous state machine has the same three parts: a **state register** that holds the present state, **next-state logic** that works out the next state from the state and the inputs, and **output logic**. The usual Verilog style writes them as three separate pieces.',
      { topic: 'vl-fsm', frame: 7, caption: 'Two always blocks: the register (clocked, <=) and the next-state logic (a case on the state, @*). At the edge at 35 ns the register loads D, and z = 1.' },
      'Give the states names with localparam, so the case reads like the state diagram. Whether you put the output in the next-state block, in its own block, or in an assign, the tool builds the same machine:',
      { topic: 'vl-fsm-synth', frame: 4, caption: 'The register is always there; the styles differ only in how the logic is grouped.' },
      { h: 'Moore and Mealy' },
      'A **Moore** output depends on the state alone, so it changes only after a clock edge. A **Mealy** output depends on the state and the inputs, so it can answer an input as soon as the input changes, one clock period earlier than a Moore machine could. Here is a small Mealy machine: z = 1 while x repeats the bit read at the last edge.',
      { fsm: TWICE_FSM, caption: 'Each arc is labelled input/output: the output belongs to the transition, not to the state.' },
      { predict: { q: 'The input bits are 0, 1, 1, 0, 0, 0, 1, 0, 1, 1. Before which edges is z = 1?', options: ['3, 5, 6 and 10', '2, 4, 5 and 9', '3 and 10 only'], answer: 0, explain: 'z = 1 when the bit equals the one before: bits 3 (1 after 1), 5 and 6 (0 after 0), and 10 (1 after 1). The run prints 0010110001.' } },
      { verilog: TWICE, run: true, caption: 'The testbench sends 0110001011 and prints z before each edge, just after setting x.' },
      { tip: 'A Mealy output can glitch while inputs settle, and it passes input timing straight through to the output. When that matters, register the output: always @(posedge clk) z <= (next state is the found state).' },
      { h: 'What to take away' },
      { list: ['State register (clocked, <=), next-state logic (@*, a case), output logic.', 'Name the states with localparam.', 'Moore: output from the state, one period later. Mealy: from the state and inputs, at once.'] },
      X('p12x-mealy-moore'), X('p12x-moore'), X('p12x-rise'), X('p12x-vend'), X('p12x-zreg'), X('p12x-onehot'),
    ],
  });

  L({
    id: 'p12l-debounce', chapter: 'p12-ch-clocked', title: 'Debouncing a switch', minutes: 8,
    summary: 'A mechanical contact bounces for a few milliseconds. A debouncer passes a change on only once the input has held steady for several clocks, built from a few flip-flops and a comparison.',
    blocks: [
      'Wire a push button to a counter and press it once. The counter jumps by three, or seven. The contacts of a switch do not close cleanly: they bounce, opening and closing many times in the first few milliseconds, and a clocked circuit fast enough to see them counts every one.',
      'The cure is to believe a change only once it has lasted. Sample the input on every clock, and let the clean output q change only when enough samples in a row agree with the new value. A short flicker never gets that far.',
      { h: 'One way: keep the last few samples' },
      'The simplest debouncer keeps the last three samples in a small shift register and changes q only when all three agree:',
      { verilog: DEB3, run: true, caption: 'Run it. The flickers at the start and the lone 0 near the end never reach q; the steady run of 1s does, three clocks late.' },
      { predict: { q: 'In this debouncer, b goes to 1 for two clocks and back to 0. Does q change?', options: ['Yes, after two clocks', 'No: three samples in a row never agree on 1', 'It becomes x'], answer: 1, explain: 'The history holds at most two 1s, so h never equals 111, and q stays 0.' } },
      { h: 'Another: count' },
      'Keeping N samples costs N flip-flops. For a long wait, say a million clocks of a fast clock, count instead: a counter of the edges in a row at which b differs from q, cleared whenever they agree, and q copies b when the count reaches N. The counter needs only about log₂ N bits. Building it, as a module with N as a parameter, is the exercise of this lesson.',
      { steps: ['Two registers: q, and a count.', 'At each edge, if b equals q, clear the count: nothing is changing.', 'Otherwise, if this is the N-th edge in a row, copy b into q and clear the count.', 'Otherwise, count up.'] },
      { tip: 'A switch is also asynchronous to the clock. In a real design, pass b through two flip-flops (a synchroniser) before the debouncer, and through an edge detector after it if each press should count once.' },
      { h: 'What to take away' },
      { list: ['A bouncing input must hold steady for N clocks before it is believed.', 'A shift register of samples is simple; a counter is cheaper for large N.', 'Synchronise, debounce, then detect the edge.'] },
      X('p12x-debounce'),
    ],
  });

  // =========================================================================================================
  // Chapter 4: testbenches and synthesis
  // =========================================================================================================
  L({
    id: 'p12l-testbench', chapter: 'p12-ch-verify', title: 'Testbenches: time, printing and waveforms', minutes: 8,
    summary: 'A testbench drives a design from initial blocks. #n waits, $display prints once, $monitor prints whenever a value changes, $finish stops, and $dumpvars records waveforms in a VCD file.',
    blocks: [
      'A design module describes hardware; a **testbench** describes an experiment. Its tools are the parts of Verilog no chip can have: time you can wait for, and a console to print on.',
      { list: ['initial begin … end runs once, starting at time 0. Several initial blocks run side by side.', '#n waits n time units; @(posedge clk) waits for an edge.', '$display prints once, now. $strobe prints at the end of the time step. $monitor prints whenever one of its values changes.', '$time is the current time; $finish ends the simulation.'] },
      { topic: 'vl-initial', frame: 19, caption: 'Each #n waits from the statement before. The simulator jumps from one moment where something is due to the next, never through the time in between.' },
      { predict: { q: 'How many lines does this testbench print?', options: ['4', '5', '6'], answer: 1, explain: '$monitor prints at times 0, 3, 6 and 9 (n changes each time), and $display adds "done at 10": five lines.' } },
      { verilog: TBDEMO, run: true, caption: 'Run it to check your count. The $monitor is set up once and keeps printing.' },
      { topic: 'vl-initial', input: pre('vl-initial', 'Two initial blocks at once'), frame: 18, caption: 'Two initial blocks run at the same time, each with its own delays.' },
      { h: 'Waveforms' },
      'A long run is easier to read as waveforms. $dumpfile names a file and $dumpvars(0, tb) records every change of every signal below tb into it, in the Value Change Dump (VCD) format any waveform viewer reads.',
      { topic: 'vl-vcd', frame: 11, caption: 'Only changes are written, each under a time mark: a VCD file stays small even for long runs. The Verilog page can export one from any run.' },
      { h: 'What to take away' },
      { list: ['initial blocks start at 0 and run in parallel.', '#n waits; @(...) waits for an event.', '$display once, $monitor on every change, $finish to stop.', '$dumpvars records waveforms as VCD.'] },
      X('p12x-monitor'),
    ],
  });

  L({
    id: 'p12l-selfcheck', chapter: 'p12-ch-verify', title: 'Testbenches that check themselves', minutes: 10,
    summary: 'A self-checking testbench works out the expected answer itself, compares with !==, and reports each mismatch. Test small designs exhaustively, larger ones with directed and random cases, and test the testbench too.',
    blocks: [
      'Reading 256 printed lines to check an adder is how bugs slip through. A **self-checking** testbench computes what each output should be, compares, and prints only the cases that go wrong, with the inputs and both values. A run with no complaints is a pass.',
      { topic: 'vl-selfcheck', input: pre('vl-selfcheck', 'An adder that drops the carry'), frame: 10, caption: 'Six of sixteen pairs fail, and the list of failures points at the bug: every pair whose sum needs the carry.' },
      { list: ['Work the expected value out in a different way from the design (a loop where the design has a case, an integer where it has bits).', 'Compare with !==, so that x and z count as wrong.', 'Wait (#1, or a clock edge) between setting the inputs and reading the outputs.', 'Print every mismatch with the inputs, the value got and the value expected.'] },
      { h: 'Which cases?' },
      'A combinational module with up to a dozen input bits can be tried on **every** input: a loop over all of them takes a moment. Beyond that, combine **directed** cases (the corners: 0, all 1s, the values either side of a carry or a wrap) with many **random** ones from $random(seed). A fixed seed gives the same sequence every run, so a failure can be repeated.',
      'Test vectors can also come from a file: $readmemh reads hex words into a memory, one per line, and the testbench loops over them. Test data can be wrong too:',
      { topic: 'vl-readmemh', input: pre('vl-readmemh', 'A wrong expected sum'), frame: 10, caption: 'One row fails, and here the vector is wrong, not the module.' },
      { h: 'Testing the tester' },
      'How do you know the testbench would notice a bug? Run it on designs that are wrong on purpose. That is easy when the testbench is a **tester module with ports**: it drives the inputs through its outputs, reads the design\'s outputs through its inputs, and counts mismatches. A top module wires one copy to the real design and another to a broken one.',
      { predict: { q: 'Before you run it: big_bad compares only the top bits of a and b. In how many of the 64 pairs is it wrong?', options: ['0', '12', '32', '64'], answer: 1, explain: 'It is wrong when the top bits are equal but a > b in the low bits, choosing b. With top bits both 0 or both 1 there are 6 such pairs each: 12. Run it and the second count is 12.' } },
      { verilog: TESTER, run: true, caption: 'The same tester, wired to a correct design and to one with a mistake. tb reads each tester\'s count through a hierarchical name, t1.errors.' },
      { h: 'What to take away' },
      { list: ['Compute the expected value independently; compare with !==.', 'Exhaustive for small designs; directed plus seeded random for large ones.', 'A testbench that never fails proves nothing: try it on a broken design.'] },
      X('p12x-errcount'), X('p12x-readmem'), X('p12x-tb-fix'), X('p12x-tb-write'),
    ],
  });

  L({
    id: 'p12l-synthesis', chapter: 'p12-ch-verify', title: 'What synthesis can draw', minutes: 9,
    summary: 'A synthesis tool turns Verilog into gates and flip-flops by recognising shapes it knows how to draw. Delays, initial blocks, $display and loops with no fixed count have nothing to draw.',
    blocks: [
      'Everything in Verilog simulates, but only part of it describes hardware. A **synthesis tool** reads a module and draws a circuit: gates for expressions, multiplexers for if and case, flip-flops for clocked blocks. A construct is **synthesisable** when the tool can say what to draw for it.',
      { topic: 'vl-synth', input: pre('vl-synth', 'A loop with no fixed count'), frame: 2, caption: 'A while loop whose turns depend on an input: there is no fixed number of copies to draw, so the tool refuses.' },
      { topic: 'vl-synth', input: pre('vl-synth', 'An initial value'), frame: 2, caption: 'A flip-flop powers up as it likes. To start in a known state, build a reset.' },
      { topic: 'vl-synth', input: pre('vl-synth', 'Two blocks drive one signal'), frame: 2, caption: 'Two blocks would mean two flip-flops driving one wire. Put every assignment to a signal in one block.' },
      { predict: { q: 'Which of these does a synthesis tool keep: $display, #5, always @(posedge clk) q <= d;, initial q = 1;?', options: ['All four', 'Only the clocked block', 'The clocked block and the initial value'], answer: 1, explain: '$display and #5 are for the person running the simulation; the initial value has nothing to draw (on most tools). The clocked block is a flip-flop.' } },
      { h: 'Both directions' },
      'The tool also goes the other way: a circuit drawn in the workbench can be written out as structural Verilog, one primitive per gate. Drawing and writing are two ways into the same design.',
      { topic: 'vl-roundtrip', frame: 9, caption: 'A drawn circuit and a one-line assign of the same function, compared on every input: one function, two netlists.' },
      { h: 'User-defined primitives' },
      'Verilog also lets you define a gate by its truth table, a **UDP**. Each row lists the inputs and the output; ? matches 0, 1 or x, and when no row matches the output is x. UDPs are mostly used in libraries that model real cells:',
      { verilog: MAJ, run: true, caption: 'A majority gate as a table. With two 1s the third input does not matter, even when it is x; with 0, 1, x no row matches, so the output is x.' },
      { h: 'What to take away' },
      { list: ['Synthesis draws what it recognises: logic, multiplexers, flip-flops.', 'Dropped or refused: delays, initial values, printing, loops with no fixed count, real numbers, two drivers.', 'Structural Verilog and schematics are the same thing written two ways.', 'A UDP is a gate given by its table.'] },
      X('p12x-synth-which'), X('p12x-udp'),
    ],
  });

  // =========================================================================================================
  // Tour and course
  // =========================================================================================================
  C.tour({
    id: 'p12-tour', title: 'Tour: Verilog', blurb: 'Where the Verilog topics, the Verilog page and the exercises are, in eight steps.',
    steps: [
      { route: 'part=verilog', target: '#main', text: 'Part 12 of the catalogue: Verilog. Six families of topics, from modules and ports to synthesis, each one running real Verilog step by step.' },
      { route: 'topic=vl-nba', target: '#stageWrap', text: 'Blocking against non-blocking, region by region: the scheduler of a time step, with every update written down and then made.' },
      { target: '#inputs', text: 'Every program topic takes your own Verilog. Edit it here, or pick an example: a swap with = in two blocks shows the race.' },
      { route: 'topic=vl-fsm-synth', target: '#stageWrap', text: 'What a state machine becomes: the register, the next-state logic and the outputs the tool finds in the code.' },
      { route: 'verilog', target: '#vlCode', before() { if (S.VerilogPage && S.VerilogPage.loadExample) S.VerilogPage.loadExample('race'); }, text: 'The Verilog page: several files, a top module, Run for the console and the waveforms, and Synthesise to see the circuit drawn.' },
      { target: '#vlExamples', text: 'Examples opens ready-made projects, among them a counter, a state machine and this blocking-against-non-blocking race.' },
      { route: 'exercise=p12x-alarm', target: '#exerciseView', text: 'Most exercises ask for a module. It is compiled, linted and run against a hidden testbench, which names the first case that fails.' },
      { route: 'learn', target: '[data-chapter="p12-ch-structure"]', text: 'The lessons and exercises of Part 12 start here: four chapters, from structure to testbenches and synthesis.' },
    ],
  });

  C.course({
    id: 'p12-course', title: 'Verilog, from modules to synthesis',
    blurb: 'Every topic of Part 12 in order, with the lessons that explain them and exercises on the way.',
    steps: [
      { topic: 'vl-module', note: 'A box with named pins, and a testbench around it.' },
      { topic: 'vl-gates', note: 'One primitive per gate, and what delays show.' },
      { lesson: 'p12l-modules' },
      { exercise: 'p12x-alarm', note: 'Your first module.' },
      { topic: 'vl-assign', note: 'Widths decide what a sum keeps.' },
      { topic: 'vl-4state', note: '0, 1, x and z.' },
      { lesson: 'p12l-assign' },
      { exercise: 'p12x-satadd', note: 'Keep the carry, then use it.' },
      { topic: 'vl-hier', note: 'Modules inside modules; connect by name.' },
      { topic: 'vl-generate', note: 'N copies from one loop.' },
      { exercise: 'p12x-addn', note: 'A ripple adder of any width.' },
      { topic: 'vl-always', note: 'What wakes an always block.' },
      { topic: 'vl-ifcase', note: 'Priority chains and decoders.' },
      { topic: 'vl-casez', note: 'Labels with don\'t-care bits.' },
      { topic: 'vl-loops', note: 'Loops are unrolled.' },
      { topic: 'vl-func', note: 'Functions compute, tasks wait.' },
      { exercise: 'p12x-penc', note: 'The highest request wins; ? for the bits below it.' },
      { topic: 'vl-nba', note: 'The scheduler, region by region.' },
      { topic: 'vl-race', note: 'With = the statement order becomes the wiring.' },
      { lesson: 'p12l-nba' },
      { topic: 'vl-latch', note: 'Unassigned paths build latches.' },
      { exercise: 'p12x-latch-which', note: 'Spot them.' },
      { lesson: 'p12l-registers', note: 'Flip-flops, counters, shift registers, a register file.' },
      { exercise: 'p12x-updown', note: 'A counter with terminal count.' },
      { topic: 'vl-fsm', note: 'Three ways to write one machine.' },
      { topic: 'vl-fsm-synth', note: 'What the tool builds from them.' },
      { lesson: 'p12l-fsm' },
      { exercise: 'p12x-moore', note: 'A Moore detector.' },
      { exercise: 'p12x-debounce', note: 'A counter and a comparison.' },
      { topic: 'vl-initial', note: 'Time, delays and printing.' },
      { topic: 'vl-selfcheck', note: 'Expected values worked out, mismatches counted.' },
      { topic: 'vl-readmemh', note: 'Vectors from a file.' },
      { topic: 'vl-vcd', note: 'Waveforms as text.' },
      { exercise: 'p12x-tb-fix', note: 'Make a tester notice the bugs.' },
      { topic: 'vl-synth', note: 'What can be drawn, and what cannot.' },
      { topic: 'vl-roundtrip', note: 'Drawn and written: one function.' },
      { lesson: 'p12l-synthesis' },
    ],
  });

  // ---- what the diagram checker looks at on these pages -------------------------------------------------------
  if (S.Checks && !S.Checks.some((c) => c.name === 'lesson p12l-modules')) {
    for (const id of C.chapters.filter((c) => c.part === 'verilog').flatMap((c) => c.lessons)) S.Checks.push({ group: 'learn', name: 'lesson ' + id, hash: 'lesson=' + id, ready: "document.querySelector('#lessonView')", sel: '#main' });
    S.Checks.push({ group: 'courses', name: 'course p12-course', hash: 'course=p12-course', ready: "document.querySelector('#courseView')", sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
