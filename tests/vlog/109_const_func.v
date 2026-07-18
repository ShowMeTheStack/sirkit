`timescale 1ns/1ns
module ram #(parameter DEPTH = 10, parameter W = 8) (input clk, input we,
    input [clog2(DEPTH)-1:0] addr, input [W-1:0] d, output [W-1:0] q);
  function integer clog2;
    input integer v;
    integer t;
    begin
      t = v - 1;
      for (clog2 = 0; t > 0; clog2 = clog2 + 1) t = t >> 1;
    end
  endfunction
  localparam AW = clog2(DEPTH);
  reg [W-1:0] m [0:DEPTH-1];
  always @(posedge clk) if (we) m[addr] <= d;
  assign q = m[addr];
  initial $display("%m DEPTH=%0d AW=%0d W=%0d", DEPTH, AW, W);
endmodule

module tb;
  function integer max2;
    input integer a, b;
    max2 = a > b ? a : b;
  endfunction
  localparam A = 12, B = 5;
  localparam M = max2(A, B * 3);
  localparam [M-1:0] ALL = {M{1'b1}};
  reg clk, we;
  reg [3:0] ad;
  reg [7:0] din;
  wire [7:0] q1;
  wire [15:0] q2;
  ram #(.DEPTH(10)) r1 (.clk(clk), .we(we), .addr(ad), .d(din), .q(q1));
  ram #(33, 16) r2 (.clk(clk), .we(1'b0), .addr(6'd0), .d(16'h0), .q(q2));
  ram #(.DEPTH(2), .W(1)) r3 (.clk(clk), .we(1'b0), .addr(1'b0), .d(1'b0), .q());
  integer i;
  initial begin
    $dumpfile("109.vcd");
    $dumpvars(0, tb);
    $display("M=%0d ALL=%b ALL+1=%0d", M, ALL, ALL + 1);
    clk = 0; we = 1;
    for (i = 0; i < 10; i = i + 1) begin
      ad = i; din = 8'h10 + i * i;
      #5 clk = 1; #5 clk = 0;
    end
    we = 0;
    for (i = 9; i >= 0; i = i - 3) begin
      ad = i;
      #1 $display("r1[%0d]=%h", ad, q1);
    end
    $finish;
  end
endmodule
