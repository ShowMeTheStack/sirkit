// Delay values rounded to the time precision
`timescale 1ns/10ps

module tb;
  reg [7:0] step;
  initial begin
    $dumpfile("160.vcd");
    $dumpvars(0, tb);
    step = 0;
    #0.004 step = 1;   // rounds to 0
    $display("1 rt=%.3f", $realtime);
    #0.005 step = 2;   // rounds to 0.01
    $display("2 rt=%.3f", $realtime);
    #0.123 step = 3;   // 0.12
    $display("3 rt=%.3f", $realtime);
    #0.126 step = 4;   // 0.13
    $display("4 rt=%.3f", $realtime);
    #1.999 step = 5;   // 2.00
    $display("5 rt=%.3f time=%0d", $realtime, $time);
    #0.6 step = 6;
    $display("6 rt=%.3f time=%0d", $realtime, $time);
    #0.6 step = 7;
    $display("7 rt=%.3f time=%0d", $realtime, $time);
    $finish;
  end
endmodule
