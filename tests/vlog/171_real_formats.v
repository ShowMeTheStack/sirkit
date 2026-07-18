// %e and %f with reals, integers converted, precision and width
module tb;
  real a, b, c;
  integer i;
  initial begin
    a = 1.0 / 3.0;
    b = -2500.125;
    c = 6.02e23;
    $display("f: %f %f %f", a, b, c);
    $display("e: %e %e %e", a, b, c);
    $display("p: %.2f %.0f %.3e %.1e", a, b, a, c);
    $display("w: [%10.3f] [%12.2e] [%0f]", b, b, 0.5);
    $display("zero: %f %e", 0.0, 0.0);
    $display("small: %e %f", 1.5e-9, 1.5e-9);
    i = 7;
    $display("int as real: %f %e", i, i);
    $display("real as int: %0d %d", a * 30, b);
    a = 0.1 + 0.2;
    $display("sum: %.17f", a);
    $display("neg zero-ish: %.2f", -0.001);
    $display("rtoi=%0d itor=%f", $rtoi(9.99), $itor(12));
    $display("conv: %0d %0d %0d %0d", 2.5, 3.5, -2.5, 1.4999);
  end
endmodule
