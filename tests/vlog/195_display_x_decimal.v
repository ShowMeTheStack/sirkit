// Decimal display rules for vectors with x/z in various widths
module tb;
  reg [3:0] a;
  reg [15:0] b;
  reg [31:0] c;
  initial begin
    a = 4'bxxxx; $display("[%d] [%0d]", a, a);
    a = 4'bzzzz; $display("[%d] [%0d]", a, a);
    a = 4'b1x10; $display("[%d] [%0d]", a, a);
    a = 4'b1z10; $display("[%d] [%0d]", a, a);
    a = 4'bxz10; $display("[%d] [%0d]", a, a);
    b = 16'hxxxx; $display("[%d] [%0d]", b, b);
    b = 16'hzzzz; $display("[%d] [%0d]", b, b);
    b = 16'h12x4; $display("[%d] [%0d] [%h] [%o]", b, b, b, b);
    b = 16'hz000; $display("[%d] [%0d] [%h] [%o]", b, b, b, b);
    c = 32'bx; $display("[%d] [%0d]", c, c);
    c = 32'bz; $display("[%d] [%h]", c, c);
    c = {16'hzzzz, 16'hxxxx}; $display("[%d] [%h] [%o]", c, c, c);
    c = {31'd0, 1'bx}; $display("[%d] [%h] [%o] [%b]", c, c, c, c);
  end
endmodule
