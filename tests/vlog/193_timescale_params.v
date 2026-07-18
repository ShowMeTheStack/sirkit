// Delay parameters and specparam-free gate delays under 1ns/100ps
`timescale 1ns/100ps

module delay_buf #(parameter real D = 1.25) (input a, output y);
  assign #D y = a;
endmodule

module tb;
  reg a;
  wire y1, y2, y3;
  delay_buf #(0.5) b1 (a, y1);
  delay_buf b2 (a, y2);
  delay_buf #(2.77) b3 (a, y3);
  initial begin
    $dumpfile("193.vcd");
    $dumpvars(0, tb);
    $timeformat(-9, 2, "ns", 9);
    a = 0;
    #5 a = 1;
    #5 a = 0;
    #1 a = 1;
    #10 $finish;
  end
  always @(y1) $display("%t y1=%b", $realtime, y1);
  always @(y2) $display("%t y2=%b", $realtime, y2);
  always @(y3) $display("%t y3=%b", $realtime, y3);
endmodule
