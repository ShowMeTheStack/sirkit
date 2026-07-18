// $time, $stime and time variables, large times
`timescale 1ns/1ns
module tb;
  time t0, t1;
  reg [31:0] st;
  initial begin
    $dumpfile("175.vcd");
    $dumpvars(0, tb);
    t0 = $time;
    #100 t1 = $time;
    $display("t0=%0d t1=%0d diff=%0d", t0, t1, t1 - t0);
    #4294967200;
    st = $stime;
    $display("time=%0d stime=%0d", $time, st);
    #200;
    st = $stime;
    $display("time=%0d stime=%0d (wrapped)", $time, st);
    $display("time hex=%h width check [%d]", $time, $time);
    t0 = 64'hFFFF_FFFF_FFFF_FFFF;
    $display("max time var=%0d", t0);
    $finish;
  end
endmodule
