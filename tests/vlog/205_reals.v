// Real numbers: arithmetic, conversion to integers, comparison and printing
module tb;
  real x, y, z;
  integer i;
  reg [7:0] r8;
  initial begin
    x = 2.5; y = -1.25;
    z = x * y + 0.5;
    $display("%f %f %f", x, y, z);
    $display("%e %g %10.4f|", z, z, x / 3.0);
    i = x;  $display("2.5 -> integer %0d", i);
    i = y;  $display("-1.25 -> integer %0d", i);
    i = -2.5; $display("-2.5 -> integer %0d", i);
    r8 = 300.7; $display("300.7 -> 8 bits %0d", r8);
    i = $rtoi(-7.9); $display("rtoi(-7.9) = %0d", i);
    x = $itor(7) / 2; $display("itor(7)/2 = %f", x);
    $display("compare %b %b %b", x > 3.0, x == 3.5, y < -2.0);
    x = 10; y = 4;
    $display("int to real division %f, ints %0d", x / y, 10 / 4);
    z = 1.0e-3 + 2e2;
    $display("%f %0.2f %g", z, z, 0.0001);
    x = 3; i = x ** 2; $display("power %0d %f", i, 2.0 ** 0.5);
  end
endmodule
