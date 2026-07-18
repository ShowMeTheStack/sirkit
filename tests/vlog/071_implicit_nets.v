// Implicit one-bit nets from port connections and from assign targets
module inv2 (input i, output o);
  assign o = ~i;
endmodule

module and2 (a, b, y);
  input a, b;
  output y;
  and (y, a, b);
endmodule

module tb;
  reg x, y;

  inv2 u1 (.i(x), .o(nx));        // nx implicit
  inv2 u2 (y, ny);                 // ny implicit
  and2 u3 (nx, ny, both_low);      // both_low implicit
  assign odd = x ^ y;              // implicit net on the left side
  inv2 u4 (.i(odd), .o(even));

  initial begin
    $dumpfile("071.vcd");
    $dumpvars(0, tb);
    x = 0; y = 0;
    #1 $display("x=%b y=%b nx=%b ny=%b both_low=%b odd=%b even=%b", x, y, nx, ny, both_low, odd, even);
    y = 1;
    #1 $display("x=%b y=%b nx=%b ny=%b both_low=%b odd=%b even=%b", x, y, nx, ny, both_low, odd, even);
    x = 1;
    #1 $display("x=%b y=%b nx=%b ny=%b both_low=%b odd=%b even=%b", x, y, nx, ny, both_low, odd, even);
    x = 1'bz;
    #1 $display("x=%b y=%b nx=%b ny=%b both_low=%b odd=%b even=%b", x, y, nx, ny, both_low, odd, even);
    $display("width of implicit net: %0d", $bits(odd));
    $finish;
  end
endmodule
