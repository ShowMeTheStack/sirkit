// Multi-input logic gates driven with all four values
module tb;
  reg [1:0] a, b;
  reg c;
  wire y_and, y_or, y_nand, y_nor, y_xor, y_xnor, y_and3, y_xor3;
  integer i, j;
  reg [3:0] v;

  and  g1 (y_and, a[0], b[0]);
  or   g2 (y_or, a[0], b[0]);
  nand g3 (y_nand, a[0], b[0]);
  nor  g4 (y_nor, a[0], b[0]);
  xor  g5 (y_xor, a[0], b[0]);
  xnor g6 (y_xnor, a[0], b[0]);
  and  g7 (y_and3, a[0], b[0], c);
  xor  g8 (y_xor3, a[0], b[0], c);

  initial begin
    v = 4'b01xz;
    c = 1'b1;
    $display(" a b | and or nand nor xor xnor and3 xor3");
    for (i = 3; i >= 0; i = i - 1)
      for (j = 3; j >= 0; j = j - 1) begin
        a[0] = v[i]; b[0] = v[j];
        #1 $display(" %b %b |  %b   %b   %b    %b   %b   %b    %b    %b",
                    a[0], b[0], y_and, y_or, y_nand, y_nor, y_xor, y_xnor, y_and3, y_xor3);
      end
    c = 1'b0; a[0] = 1'bx; b[0] = 1'b1;
    #1 $display("c=0: and3=%b xor3=%b", y_and3, y_xor3);
    $finish;
  end
endmodule
