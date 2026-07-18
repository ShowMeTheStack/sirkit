module tb;
  reg [7:0] a, b;
  reg [7:0] r;
  reg signed [7:0] s;
  wire [7:0] add = a + b, sub = a - b, mul = a * b, dv = a / b, md = a % b;
  wire [7:0] neg = -a;
  initial begin
    $dumpfile("041.vcd");
    $dumpvars(0, tb);
    a = 8'b0000_000x; b = 8'd1;
    #1 $display("1 add=%b sub=%b mul=%b div=%b mod=%b neg=%b", add, sub, mul, dv, md, neg);
    a = 8'b1000_0000; b = 8'bz000_0000;
    #1 $display("2 add=%b sub=%b mul=%b div=%b mod=%b", add, sub, mul, dv, md);
    a = 8'd0; b = 8'bx;
    #1 $display("3 mul=%b add=%b", mul, add);
    a = 8'd12; b = 8'd5;
    #1 $display("4 add=%0d sub=%0d mul=%0d div=%0d mod=%0d neg=%0d", add, sub, mul, dv, md, neg);
    r = 8'd10 + 1'bx;         $display("5 %b %d", r, r);
    r = 8'd10 + 1'bz;         $display("6 %b", r);
    r = 8'b0101_0101 * 0;     $display("7 %b", r);
    r = 8'b0101_010x * 0;     $display("8 %b", r);
    r = 8'b0000_00zz - 1;     $display("9 %b", r);
    s = -8'sb0000_x000;       $display("10 %b %d", s, s);
    r = +8'b0000_x001;        $display("11 %b", r);
    r = 8'b1x00_0000 ** 1;    $display("12 %b", r);
    r = 8'd2 ** 8'b0000_000x; $display("13 %b", r);
    r = {4'b1111, 4'b000x} + 8'd0; $display("14 %b", r);
    r = 8'b0000_x000 / 8'd3;  $display("15 %b", r);
    r = 8'd5 % 8'b0z00_0001;  $display("16 %b", r);
    $display("17 %d %d %h %o", 8'bx + 0, 8'b0000_00x0 + 0, 8'bx + 0, 8'bz + 0);
  end
endmodule
