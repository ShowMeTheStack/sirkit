// Non-blocking with intra-assignment delay: transport behaviour, every edge kept
`timescale 1ns/1ns
module tb;
  reg a;
  reg q_nba, q_blk;
  reg [3:0] v, w;
  wire q_net;

  assign #4 q_net = a;

  initial begin
    $dumpfile("076.vcd");
    $dumpvars(0, tb);
    v = 0;
    #1  a = 0;
    #9  a = 1;
    #1  a = 0;
    #1  a = 1;
    #1  a = 0;
    #10 $finish;
  end

  // each change of a is replayed 4 ns later, even 1 ns pulses
  always @(a) q_nba <= #4 a;
  // blocking intra delay: the process is busy and misses changes
  always @(a) q_blk = #4 a;

  initial begin
    w = 4'd0;
    #2;
    w <= #6 4'd1;
    w <= #4 4'd2;
    w <= #2 4'd3;
    #1 $display("%0t w=%0d", $time, w);
    #2 $display("%0t w=%0d", $time, w);
    #2 $display("%0t w=%0d", $time, w);
    #2 $display("%0t w=%0d", $time, w);
  end

  initial
    $monitor("%0t a=%b q_nba=%b q_blk=%b q_net=%b", $time, a, q_nba, q_blk, q_net);
endmodule
