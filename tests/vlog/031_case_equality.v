module tb;
  reg [3:0] a, b;
  reg eq, ne, ceq, cne;
  integer i;
  reg [3:0] av [0:5];
  reg [3:0] bv [0:5];
  always @* begin
    eq = (a == b);
    ne = (a != b);
    ceq = (a === b);
    cne = (a !== b);
  end
  initial begin
    $dumpfile("031.vcd");
    $dumpvars(0, tb);
    av[0] = 4'b1010; bv[0] = 4'b1010;
    av[1] = 4'b1010; bv[1] = 4'b1011;
    av[2] = 4'b10x0; bv[2] = 4'b10x0;
    av[3] = 4'b10x0; bv[3] = 4'b11x0;
    av[4] = 4'b10z0; bv[4] = 4'b10x0;
    av[5] = 4'bzzzz; bv[5] = 4'bzzzz;
    for (i = 0; i < 6; i = i + 1) begin
      a = av[i]; b = bv[i];
      #1 $display("%b vs %b: == %b != %b === %b !== %b", a, b, eq, ne, ceq, cne);
    end
    $display("widths %b %b", 3'b0x1 === 4'b00x1, 3'b1x1 === 4'b11x1);
    $display("signed %b %b", 3'sb1x1 === 4'sb11x1, 3'sb1x1 === 4'b11x1);
    $display("int x %b %b", 32'bx === 'bx, 32'bz === 'bx);
    $display("as cond %0d %0d", (4'b1x00 == 4'b1x00) ? 1 : 2, (4'b1x00 === 4'b1x00) ? 1 : 2);
  end
endmodule
