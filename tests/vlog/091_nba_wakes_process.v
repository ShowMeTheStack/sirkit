// A process woken by an NBA update runs in the same time step, after the edge processes
`timescale 1ns/1ns
module tb;
  reg clk, rst;
  reg [3:0] q, d;
  reg [3:0] seen_edge, seen_change;
  event done;

  always @(posedge clk or posedge rst)
    if (rst) q <= 4'd0;
    else     q <= d;

  always @(q) begin
    seen_change = q;
    $display("%0t q changed to %0d", $time, q);
  end

  initial begin
    $dumpfile("091.vcd");
    $dumpvars(0, tb);
    clk = 0; rst = 0; d = 4'd5;
    #2 rst = 1;
    #1 rst = 0;
    #2 clk = 1;
    seen_edge = q;
    $display("%0t at edge (same process) q=%0d", $time, seen_edge);
    #0 $display("%0t after #0 q=%0d", $time, q);
    @(q) #0 $display("%0t after @(q) and #0 q=%0d seen_change=%0d", $time, q, seen_change);
    d = 4'd9;
    #5 clk = 0;
    #5 clk = 1;
    #1 $display("%0t q=%0d", $time, q);
    d = 4'd1;
    #4 clk = 0;
    #5 clk = 1;
    #1 $display("%0t q=%0d", $time, q);
    $finish;
  end
endmodule
