// Rise and fall delays on gates; transitions to x take the smaller delay
module tb;
  reg a, b;
  wire y_and, y_not, y_or;

  and #(2, 5) g1 (y_and, a, b);
  not #(4, 1) g2 (y_not, a);
  or  #(3, 6) g3 (y_or, a, b);

  initial begin
    $dumpfile("053.vcd");
    $dumpvars(0, tb);
    $monitor("%0t: a=%b b=%b and=%b not=%b or=%b", $time, a, b, y_and, y_not, y_or);
    a = 0; b = 1;
    #10 a = 1;
    #10 a = 0;
    #10 a = 1'bx;
    #10 a = 1;
    #10 b = 1'bx;
    #10 b = 0;
    #10 $finish;
  end
endmodule
