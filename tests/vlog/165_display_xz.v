// x and z in each radix: all-x / all-z digits vs mixed digits
module tb;
  reg [7:0] v;
  reg [11:0] w;
  wire [7:0] zw;
  initial begin
    v = 8'bxxxxxxxx;
    $display("allx   b=%b h=%h o=%o d=%d 0d=%0d", v, v, v, v, v);
    v = 8'bzzzzzzzz;
    $display("allz   b=%b h=%h o=%o d=%d 0d=%0d", v, v, v, v, v);
    v = 8'b1010xxxx;
    $display("lowx   b=%b h=%h o=%o d=%d", v, v, v, v);
    v = 8'b10x01100;
    $display("onex   b=%b h=%h o=%o d=%d", v, v, v, v);
    v = 8'bzzzz0101;
    $display("highz  b=%b h=%h o=%o d=%d", v, v, v, v);
    v = 8'b0z0z0z0z;
    $display("somez  b=%b h=%h o=%o d=%d", v, v, v, v);
    v = 8'bxz00zx11;
    $display("xzmix  b=%b h=%h o=%o d=%d", v, v, v, v);
    w = 12'hx3z;
    $display("w      b=%b h=%h o=%o d=%d", w, w, w, w);
    w = 12'b000_xxx_zzz_111;
    $display("octal  o=%o h=%h", w, w);
    w = 12'bxxx_xxx_zzz_zzz;
    $display("octal2 o=%o h=%h d=%d", w, w, w);
    $display("zw (undriven) b=%b h=%h d=%d", zw, zw, zw);
    $display("x arith %b %d", v + 1, v + 1);
    $display("widths %5h|%0h|%3b|%0b", 8'hx5, 8'hx5, 3'bz1x, 3'bz1x);
  end
endmodule
