// `timescale 1ns/1ps: fractional delays, $time vs $realtime, %t
`timescale 1ns/1ps

module tb;
  reg [3:0] c;
  real r;
  initial begin
    $dumpfile("158.vcd");
    $dumpvars(0, tb);
    c = 0;
    #1.5 c = c + 1;
    $display("A time=%0d realtime=%f t=%t", $time, $realtime, $realtime);
    #0.25 c = c + 1;
    $display("B time=%0d realtime=%f", $time, $realtime);
    #0.0004 c = c + 1;
    $display("C time=%0d realtime=%f", $time, $realtime);
    #0.0006 c = c + 1;
    $display("D time=%0d realtime=%.4f", $time, $realtime);
    #2.4999 c = c + 1;
    $display("E time=%0d realtime=%.4f", $time, $realtime);
    #0.5 c = c + 1;
    $display("F time=%0d realtime=%.3f stime=%0d", $time, $realtime, $stime);
    r = 0.125;
    #r c = c + 1;
    $display("G realtime=%.3f c=%0d", $realtime, c);
    $finish;
  end
endmodule
