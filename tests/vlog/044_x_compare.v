module tb;
  reg [3:0] a, b;
  reg eq, lt, ge, ceq;
  initial begin
    $dumpfile("044.vcd");
    $dumpvars(0, tb);
    $display("a      b      ==  !=  <   <=  >   >=  === !==");
    a = 4'b1x00; b = 4'b0x00; #1 show;
    a = 4'b1x00; b = 4'b1x00; #1 show;
    a = 4'b0x00; b = 4'b1000; #1 show;
    a = 4'b1100; b = 4'b1z00; #1 show;
    a = 4'b0000; b = 4'b0000; #1 show;
    a = 4'b10x1; b = 4'b01x1; #1 show;
    a = 4'bzzzz; b = 4'bxxxx; #1 show;
    eq = (a == b); lt = (a < b); ge = (a >= b); ceq = (a === b);
    #1 $display("stored %b %b %b %b", eq, lt, ge, ceq);
    $display("lone x %b %b", 1'bx == 1'bx, 1'bx != 1'b0);
    $display("partial mismatch %b %b", 8'b1111_000x == 8'b0111_0000, 8'b1111_000x != 8'b0111_0000);
    $display("signed %b %b", 4'sbx000 < 4'sd1, 4'sb1x00 < 4'sb0000);
  end
  task show;
    $display("%b   %b   %b   %b   %b   %b   %b   %b   %b   %b",
      a, b, a == b, a != b, a < b, a <= b, a > b, a >= b, a === b, a !== b);
  endtask
endmodule
