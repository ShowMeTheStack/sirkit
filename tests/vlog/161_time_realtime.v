// $time rounds to the unit, $realtime keeps the fraction
`timescale 1ns/1ps

module tb;
  time t1;
  real r1;
  integer i;
  initial begin
    for (i = 0; i < 6; i = i + 1) begin
      #0.3;
      t1 = $time;
      r1 = $realtime;
      $display("i=%0d time=%0d realtime=%.3f stime=%0d", i, t1, r1, $stime);
    end
    #0.2;
    $display("time=%0t realtime=%0t", $time, $realtime);
    $display("as real: %f  as time: %0d", $time * 1.0, $realtime);
    $finish;
  end
endmodule
