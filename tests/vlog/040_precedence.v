module tb;
  reg [7:0] a, b, c;
  initial begin
    $dumpfile("040.vcd");
    $dumpvars(0, tb);
    a = 8'd6; b = 8'd3; c = 8'd2;
    $display("1 %0d", a + b * c);
    $display("2 %0d", (a + b) * c);
    $display("3 %0d", a - b - c);
    $display("4 %0d", a / b / c);
    $display("5 %0d", 2 ** 3 ** 2);
    $display("6 %0d", -2 ** 2);
    $display("7 %0d", a << 1 + 1);
    $display("8 %b", a & b | c);
    $display("9 %b", a | b & c);
    $display("10 %b", a ^ b & c);
    $display("11 %b", a == 6 && b == 3);
    $display("12 %b", a & b == 3);
    $display("13 %b", !a == 0);
    $display("14 %b", ~a + 1 == -a);
    $display("15 %0d", a > b ? a : b > c ? b : c);
    $display("16 %0d", a < b < c);
    $display("17 %b", a || b && 0);
    $display("18 %0d", a % b + c);
    $display("19 %b", &a | ^b);
    $display("20 %0d", a + b >> 1);
    $display("21 %0d", a - -b);
    $display("22 %0d", 1 ? 2 : 3 ? 4 : 5);
    $display("23 %b", a < b == b < a);
    $display("24 %0d", {a, b} >> 8);
  end
endmodule
