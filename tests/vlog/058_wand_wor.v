// Wired-AND and wired-OR nets, including triand/trior
module tb;
  reg [3:0] a, b;
  wand [3:0] wa;
  wor  [3:0] wo;
  triand ta;
  trior  to;
  reg x1, x2;

  assign wa = a;
  assign wa = b;
  assign wo = a;
  assign wo = b;
  assign ta = x1;
  assign ta = x2;
  assign to = x1;
  assign to = x2;

  initial begin
    $dumpfile("058.vcd");
    $dumpvars(0, tb);
    a = 4'b1100; b = 4'b1010;
    #1 $display("a=%b b=%b wand=%b wor=%b", a, b, wa, wo);
    a = 4'b01xz; b = 4'b1111;
    #1 $display("a=%b b=%b wand=%b wor=%b", a, b, wa, wo);
    b = 4'b0000;
    #1 $display("a=%b b=%b wand=%b wor=%b", a, b, wa, wo);
    b = 4'bzzzz;
    #1 $display("a=%b b=%b wand=%b wor=%b", a, b, wa, wo);
    a = 4'bxxxx; b = 4'bz10x;
    #1 $display("a=%b b=%b wand=%b wor=%b", a, b, wa, wo);
    x1 = 1; x2 = 0;
    #1 $display("x1=%b x2=%b triand=%b trior=%b", x1, x2, ta, to);
    x1 = 1'bz;
    #1 $display("x1=%b x2=%b triand=%b trior=%b", x1, x2, ta, to);
    x2 = 1'bz;
    #1 $display("x1=%b x2=%b triand=%b trior=%b", x1, x2, ta, to);
    $finish;
  end
endmodule
