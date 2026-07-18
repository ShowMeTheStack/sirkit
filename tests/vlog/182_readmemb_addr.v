// $readmemb with @address, underscores, x/z digits and block comments
module tb;
  reg [3:0] m [0:15];
  integer i;
  initial begin
    for (i = 0; i < 16; i = i + 1) m[i] = 4'd0;
    $readmemb("182_bits.bin", m);
    for (i = 0; i < 16; i = i + 1)
      $display("m[%0d] = %b", i, m[i]);
  end
endmodule
