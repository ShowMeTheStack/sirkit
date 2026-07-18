// Shift register from separate flip-flop instances: non-blocking makes the order irrelevant
`timescale 1ns/1ns
module dff (clk, d, q);
  input clk, d;
  output q;
  reg q;
  always @(posedge clk) q <= d;
endmodule

module tb;
  reg clk, din;
  wire [3:0] q;
  reg [7:0] pattern;
  integer n;

  // instances listed in scrambled order on purpose
  dff s2 (.clk(clk), .d(q[1]), .q(q[2]));
  dff s0 (.clk(clk), .d(din),  .q(q[0]));
  dff s3 (.clk(clk), .d(q[2]), .q(q[3]));
  dff s1 (.clk(clk), .d(q[0]), .q(q[1]));

  initial begin clk = 0; forever #5 clk = ~clk; end

  initial begin
    $dumpfile("086.vcd");
    $dumpvars(0, tb);
    pattern = 8'b1011_0010;
    din = 0;
    for (n = 7; n >= 0; n = n - 1) begin
      @(negedge clk) din = pattern[n];
      @(posedge clk);
      $display("%0t edge: before update q=%b din=%b", $time, q, din);
      $strobe ("%0t edge: after  update q=%b", $time, q);
    end
    repeat (4) @(posedge clk);
    #1 $display("%0t final q=%b", $time, q);
    $finish;
  end
endmodule
