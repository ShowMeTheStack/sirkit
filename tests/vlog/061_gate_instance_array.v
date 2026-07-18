// Arrays of gate instances: vector connections and replicated scalars
module tb;
  reg  [3:0] a, b;
  reg        s;
  wire [3:0] y_and, y_xor, y_nand_s;
  wire [3:0] y_inv;

  and  #2 ga [3:0] (y_and, a, b);
  xor  #4 gx [3:0] (y_xor, a, b);
  nand    gn [3:0] (y_nand_s, a, s);
  not     gi [0:3] (y_inv, a);

  initial begin
    $dumpfile("061.vcd");
    $dumpvars(0, tb);
    a = 4'b1100; b = 4'b1010; s = 1;
    #5 $display("a=%b b=%b and=%b xor=%b nand_s=%b inv=%b", a, b, y_and, y_xor, y_nand_s, y_inv);
    s = 0;
    #1 $display("s=0: nand_s=%b", y_nand_s);
    a = 4'b1x0z; b = 4'b111z; s = 1'bx;
    #1 $display("t=%0t and=%b xor=%b nand_s=%b inv=%b", $time, y_and, y_xor, y_nand_s, y_inv);
    #2 $display("t=%0t and=%b xor=%b", $time, y_and, y_xor);
    #2 $display("t=%0t and=%b xor=%b", $time, y_and, y_xor);
    $finish;
  end
endmodule
