`timescale 10ns/1ns
module lfsr #(parameter W = 5, parameter [W-1:0] TAPS = 5'b10100, parameter [W-1:0] SEED = 1) (
  input clk, input rst, output reg [W-1:0] q);
  always @(posedge clk)
    if (rst) q <= SEED;
    else q <= {q[W-2:0], ^(q & TAPS)};
endmodule

module tb;
  reg clk, rst;
  wire [4:0] q5;
  wire [7:0] q8;
  wire [3:0] q4;
  lfsr l5 (.clk(clk), .rst(rst), .q(q5));
  lfsr #(.W(8), .TAPS(8'b1011_1000), .SEED(8'hA5)) l8 (.clk(clk), .rst(rst), .q(q8));
  lfsr #(4, 4'b1100, 4'b0000) l4 (clk, rst, q4);
  integer period;
  reg [4:0] start;
  initial begin
    clk = 0;
    forever #1 clk = ~clk;
  end
  initial begin
    $dumpfile("134.vcd");
    $dumpvars(0, tb);
    rst = 1;
    #3.5 rst = 0;
    @(negedge clk);
    start = q5;
    period = 0;
    begin : count_period
      forever begin
        @(negedge clk);
        period = period + 1;
        $write("%h ", q5);
        if (q5 == start) disable count_period;
      end
    end
    $display("");
    $display("period5=%0d t=%0t", period, $time);
    repeat (6) begin
      @(negedge clk) $display("q8=%b q4=%b", q8, q4);
    end
    $finish;
  end
endmodule
