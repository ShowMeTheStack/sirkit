// Continuous assignment delays are inertial: pulses shorter than the delay vanish
`timescale 1ns/1ns
module tb;
  reg a, b;
  wire y_d5, y_d2, y_and;
  wire [3:0] y_vec;
  reg [3:0] v;

  assign #5 y_d5 = a;
  assign #2 y_d2 = a;
  assign #3 y_and = a & b;
  assign #4 y_vec = v + 4'd1;

  initial begin
    $dumpfile("068.vcd");
    $dumpvars(0, tb);
    $monitor("%0t a=%b b=%b d5=%b d2=%b and=%b v=%h vec=%h", $time, a, b, y_d5, y_d2, y_and, v, y_vec);
    a = 0; b = 1; v = 4'h0;
    #10 a = 1;
    #3  a = 0;      // 3 ns pulse: passes #2, swallowed by #5
    #10 a = 1;
    #1  a = 0;      // 1 ns pulse: swallowed by all
    #10 v = 4'h7;
    #2  v = 4'h9;   // first change never appears
    #2  v = 4'hE;
    #10 a = 1; b = 0;
    #2  b = 1;
    #2  b = 0;
    #10 $finish;
  end
endmodule
