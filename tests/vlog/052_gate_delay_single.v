// Single gate delays and gate-level inertial filtering
`timescale 1ns/100ps
module tb;
  reg a, b;
  wire y1, y2, y3;

  and  #3   ga (y1, a, b);
  nor  #2.5 gb (y2, a, b);
  xor  #4   gc (y3, a, b);

  initial begin
    $dumpfile("052.vcd");
    $dumpvars(0, tb);
    $monitor("%t a=%b b=%b and=%b nor=%b xor=%b", $realtime, a, b, y1, y2, y3);
    a = 0; b = 0;
    #10 a = 1;
    #10 b = 1;
    #1  b = 0;      // 1 ns pulse on b: shorter than every gate delay
    #10 b = 1;
    #3.5 a = 0;     // xor output would change at 35: pulse filtered
    #10 a = 1; b = 0;
    #2  a = 0;
    #10 $finish;
  end
endmodule
