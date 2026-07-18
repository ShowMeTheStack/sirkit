// Net declaration assignments, with and without delays
`timescale 1ns/100ps
module tb;
  reg [7:0] a, b;
  wire [7:0] sum = a + b;
  wire [7:0] #3 diff = a - b;
  wire #(1.5, 2.5) gt = a > b;
  wire [3:0] hi = sum[7:4], lo = sum[3:0];
  wor flag = a[0];

  assign flag = b[0];

  initial begin
    $dumpfile("070.vcd");
    $dumpvars(0, tb);
    a = 8'd20; b = 8'd7;
    #1 $display("%t sum=%0d diff=%0d gt=%b hi=%h lo=%h flag=%b", $realtime, sum, diff, gt, hi, lo, flag);
    #4 $display("%t sum=%0d diff=%0d gt=%b hi=%h lo=%h flag=%b", $realtime, sum, diff, gt, hi, lo, flag);
    b = 8'd30;
    #2 $display("%t sum=%0d diff=%0d gt=%b", $realtime, sum, diff, gt);
    #2 $display("%t sum=%0d diff=%0d gt=%b", $realtime, sum, diff, gt);
    a = 8'd250; b = 8'd10;
    #1 $display("%t sum=%0d hi=%h lo=%h flag=%b gt=%b", $realtime, sum, hi, lo, flag, gt);
    #1 $display("%t gt=%b diff=%0d", $realtime, gt, diff);
    #3 $display("%t diff=%0d %h", $realtime, diff, diff);
    $finish;
  end
endmodule
