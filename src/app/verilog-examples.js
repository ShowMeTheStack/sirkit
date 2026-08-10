// The Verilog page's example projects: each a few files, a module and the testbench that drives it.
(function (S) {
  'use strict';
  S.VerilogExamples = [
    {
      id: 'half-adder', title: 'Half adder', blurb: 'Dataflow assigns, and a testbench that walks the truth table.', top: 'tb_half_adder',
      files: [
        { name: 'half_adder.v', text: `// A half adder: the sum and the carry of two bits.
module half_adder (
  input  wire a,
  input  wire b,
  output wire sum,
  output wire carry
);
  assign sum   = a ^ b;   // 1 when exactly one input is 1
  assign carry = a & b;   // 1 only when both are
endmodule
` },
        { name: 'tb_half_adder.v', text: `\`timescale 1ns/1ps
// Tries all four input pairs and prints a row of the truth table for each.
module tb_half_adder;
  reg  a, b;
  wire sum, carry;
  integer i;

  half_adder dut (.a(a), .b(b), .sum(sum), .carry(carry));

  initial begin
    $display(" a b | carry sum");
    for (i = 0; i < 4; i = i + 1) begin
      {a, b} = i;
      #10 $display(" %b %b |   %b    %b", a, b, carry, sum);
    end
    $finish;
  end
endmodule
` },
      ],
    },
    {
      id: 'counter', title: '4-bit counter', blurb: 'A clocked always block with reset and enable, watched by $monitor.', top: 'tb_counter4',
      files: [
        { name: 'counter4.v', text: `// A 4-bit up counter with an asynchronous reset and a count enable.
// wrap is 1 during the count that rolls 15 over to 0.
module counter4 (
  input  wire       clk,
  input  wire       rst,
  input  wire       en,
  output reg  [3:0] q,
  output wire       wrap
);
  assign wrap = en & (q == 4'd15);

  always @(posedge clk or posedge rst)
    if (rst)
      q <= 4'd0;
    else if (en)
      q <= q + 4'd1;
endmodule
` },
        { name: 'tb_counter4.v', text: `\`timescale 1ns/1ps
module tb_counter4;
  reg        clk = 0, rst = 1, en = 0;
  wire [3:0] q;
  wire       wrap;

  counter4 dut (.clk(clk), .rst(rst), .en(en), .q(q), .wrap(wrap));

  always #5 clk = ~clk;          // a 10 ns clock

  initial begin
    $monitor("%4d ns  q = %2d  wrap = %b", $time, q, wrap);
    #12 rst = 0;                 // out of reset between edges
    #10 en  = 1;
    #170 en = 0;                 // hold the count for a while
    #30 $finish;
  end
endmodule
` },
      ],
    },
    {
      id: 'mux3', title: 'One mux, three ways', blurb: 'Gate primitives, a conditional assign and a case statement, checked against each other.', top: 'tb_mux',
      files: [
        { name: 'mux_ways.v', text: `// The same 2-to-1 multiplexer written three ways: y = s ? d1 : d0.

// 1. Gate primitives: the circuit itself.
module mux_gates (input wire d0, d1, s, output wire y);
  wire sn, t0, t1;
  not g0 (sn, s);
  and g1 (t0, d0, sn);
  and g2 (t1, d1, s);
  or  g3 (y, t0, t1);
endmodule

// 2. A continuous assignment with the conditional operator.
module mux_assign (input wire d0, d1, s, output wire y);
  assign y = s ? d1 : d0;
endmodule

// 3. A combinational always block with a case statement.
module mux_case (input wire d0, d1, s, output reg y);
  always @* begin
    case (s)
      1'b0:    y = d0;
      default: y = d1;
    endcase
  end
endmodule
` },
        { name: 'tb_mux.v', text: `\`timescale 1ns/1ps
// Drives all eight input combinations into the three multiplexers and checks that they agree.
module tb_mux;
  reg  d0, d1, s;
  wire y1, y2, y3;
  integer i, bad = 0;

  mux_gates  m1 (.d0(d0), .d1(d1), .s(s), .y(y1));
  mux_assign m2 (.d0(d0), .d1(d1), .s(s), .y(y2));
  mux_case   m3 (.d0(d0), .d1(d1), .s(s), .y(y3));

  initial begin
    #1;                          // let every always block start waiting first
    for (i = 0; i < 8; i = i + 1) begin
      {s, d1, d0} = i;
      #5;
      if (y1 !== y2 || y2 !== y3) begin
        $display("mismatch at s=%b d1=%b d0=%b: %b %b %b", s, d1, d0, y1, y2, y3);
        bad = bad + 1;
      end
    end
    if (bad == 0) $display("all three agree on all 8 inputs");
    $finish;
  end
endmodule
` },
      ],
    },
    {
      id: 'fsm', title: 'Pattern detector (FSM)', blurb: 'A Moore machine in the two-process style: a state register and next-state logic.', top: 'tb_detect110',
      files: [
        { name: 'detect110.v', text: `// A Moore machine that raises found for one clock after it has seen 1, 1, 0 on bit_in.
// Two processes: the state register, and the combinational next-state and output logic.
module detect110 (
  input  wire clk,
  input  wire rst,
  input  wire bit_in,
  output reg  found
);
  localparam IDLE = 2'd0,   // nothing useful seen
             GOT1 = 2'd1,   // the last bit was 1
             GOT2 = 2'd2,   // the last two bits were 1 1
             HIT  = 2'd3;   // just saw 1 1 0

  reg [1:0] state, next;

  // the state register
  always @(posedge clk or posedge rst)
    if (rst) state <= IDLE;
    else     state <= next;

  // next state and output
  always @* begin
    next  = state;
    found = 1'b0;
    case (state)
      IDLE: next = bit_in ? GOT1 : IDLE;
      GOT1: next = bit_in ? GOT2 : IDLE;
      GOT2: next = bit_in ? GOT2 : HIT;
      HIT: begin
        found = 1'b1;
        next  = bit_in ? GOT1 : IDLE;
      end
    endcase
  end
endmodule
` },
        { name: 'tb_detect110.v', text: `\`timescale 1ns/1ps
module tb_detect110;
  reg  clk = 0, rst = 1, bit_in = 0;
  wire found;
  reg  [11:0] stream = 12'b0110_1101_1000;   // sent left to right
  integer i;

  detect110 dut (.clk(clk), .rst(rst), .bit_in(bit_in), .found(found));

  always #5 clk = ~clk;

  initial begin
    #7 rst = 0;
    for (i = 11; i >= 0; i = i - 1) begin
      bit_in = stream[i];
      @(posedge clk); #1;
      $display("%4d ns  in = %b  state = %0d  found = %b", $time, bit_in, dut.state, found);
    end
    $finish;
  end
endmodule
` },
      ],
    },
    {
      id: 'race', title: 'Blocking vs non-blocking', blurb: 'Two always blocks swap two registers: with = they race, with <= they really swap.', top: 'swap_race',
      files: [
        { name: 'swap_race.v', text: `\`timescale 1ns/1ps
// Two registers swapped on a clock edge by two always blocks.
// With blocking assignments (=) the first block to run overwrites a value the second still needs,
// so both end up holding the same number (which one depends on the order the blocks run in).
// With non-blocking assignments (<=) both right-hand sides are read before either register changes.
module swap_race;
  reg       clk = 0;
  reg [3:0] a1 = 4'd3, b1 = 4'd9;   // swapped with =
  reg [3:0] a2 = 4'd3, b2 = 4'd9;   // swapped with <=

  always @(posedge clk) a1 = b1;
  always @(posedge clk) b1 = a1;

  always @(posedge clk) a2 <= b2;
  always @(posedge clk) b2 <= a2;

  initial begin
    $display("before:       a = 3, b = 9");
    #5 clk = 1;
    #1;
    $display("blocking:     a1 = %0d, b1 = %0d", a1, b1);
    $display("non-blocking: a2 = %0d, b2 = %0d", a2, b2);
    $finish;
  end
endmodule
` },
      ],
    },
    {
      id: 'dreg', title: 'Parameterised register', blurb: 'One module, two widths: parameters set by name and by position.', top: 'tb_dreg',
      files: [
        { name: 'dreg.v', text: `// A register of any width with a load enable and an active-low asynchronous reset to a chosen value.
module dreg #(
  parameter WIDTH = 8,
  parameter [WIDTH-1:0] RESET = 0
) (
  input  wire             clk,
  input  wire             rst_n,
  input  wire             load,
  input  wire [WIDTH-1:0] d,
  output reg  [WIDTH-1:0] q
);
  always @(posedge clk or negedge rst_n)
    if (!rst_n)    q <= RESET;
    else if (load) q <= d;
endmodule
` },
        { name: 'tb_dreg.v', text: `\`timescale 1ns/1ps
module tb_dreg;
  reg         clk = 0, rst_n = 1, load = 0;
  reg  [11:0] d = 12'h000;
  wire [11:0] wide_q;
  wire [3:0]  narrow_q;

  // parameters by name, then by position
  dreg #(.WIDTH(12), .RESET(12'hA5C)) wide   (.clk(clk), .rst_n(rst_n), .load(load), .d(d),      .q(wide_q));
  dreg #(4, 4'h3)                     narrow (.clk(clk), .rst_n(rst_n), .load(load), .d(d[3:0]), .q(narrow_q));

  always #5 clk = ~clk;

  initial begin
    #1  rst_n = 0;               // a reset pulse between clock edges
    #2  $display("in reset:  wide = %h, narrow = %h", wide_q, narrow_q);
    rst_n = 1;
    d = 12'h7E1; load = 1;
    #10 $display("loaded:    wide = %h, narrow = %h", wide_q, narrow_q);
    load = 0; d = 12'hFFF;
    #10 $display("held:      wide = %h, narrow = %h", wide_q, narrow_q);
    $finish;
  end
endmodule
` },
      ],
    },
  ];
})(globalThis.Sirkit = globalThis.Sirkit || {});
