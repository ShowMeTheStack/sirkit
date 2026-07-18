// Three delays on tri-state gates: rise, fall, turn-off
`timescale 10ns/1ns
module tb;
  reg d, en;
  wire y1, y0, yn;

  bufif1 #(2, 3, 4) t1 (y1, d, en);
  bufif0 #(1, 2, 5) t0 (y0, d, en);
  notif1 #(3)       t2 (yn, d, en);

  initial begin
    $dumpfile("054.vcd");
    $dumpvars(0, tb);
    $monitor("%t d=%b en=%b bufif1=%b bufif0=%b notif1=%b", $time, d, en, y1, y0, yn);
    d = 1; en = 0;
    #10 en = 1;
    #10 d = 0;
    #10 d = 1;
    #10 en = 0;
    #10 d = 0;
    #10 en = 1'bx;
    #10 en = 1;
    #10 $finish;
  end
endmodule
