// Modules with different timescales in one design
`timescale 10ns/1ns
module slow_tick (output reg s);
  initial begin
    s = 0;
    #1 s = 1;        // 10 ns
    #1.5 s = 0;      // 25 ns
    #0.37 s = 1;     // rounded to 4 ns -> 29 ns
    $display("slow: time=%0d realtime=%f (%m)", $time, $realtime);
  end
endmodule

`timescale 1ns/100ps
module fast_tick (output reg f);
  initial begin
    f = 0;
    #3.33 f = 1;     // 3.3 ns
    #4.06 f = 0;     // 7.4 ns (rounded to 0.1)
    #20 f = 1;       // 27.4 ns
    $display("fast: time=%0d realtime=%f (%m)", $time, $realtime);
  end
endmodule

`timescale 1us/1ns
module tb;
  wire s, f;
  slow_tick u_s (s);
  fast_tick u_f (f);
  initial begin
    $dumpfile("159.vcd");
    $dumpvars(0, tb);
    #0.031;
    $display("tb: time=%0d realtime=%f s=%b f=%b", $time, $realtime, s, f);
    $finish;
  end
  initial $monitor("tb sees s=%b f=%b at realtime %f", s, f, $realtime);
endmodule
