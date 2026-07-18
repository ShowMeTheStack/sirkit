// $timeformat changes how %t prints
`timescale 1ns/1ps

module tb;
  reg q;
  initial begin
    $dumpfile("162.vcd");
    $dumpvars(0, tb);
    q = 0;
    #12.345 q = 1;
    $display("default [%t]", $realtime);
    $display("default [%t] (time)", $time);
    $timeformat(-9, 3, " ns", 12);
    $display("ns,3 [%t]", $realtime);
    $display("ns,3 [%t] (time)", $time);
    $timeformat(-12, 0, " ps", 10);
    $display("ps,0 [%t]", $realtime);
    $timeformat(-6, 4, "us", 0);
    $display("us,4 [%t]", $realtime);
    $timeformat(-9, 1, "", 8);
    #7.77 q = 0;
    $display("ns,1 [%t] [%0t]", $realtime, $realtime);
    $finish;
  end
endmodule
