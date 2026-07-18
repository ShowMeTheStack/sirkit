// Reduction and logical operators on vectors holding x and z
module tb;
  reg [3:0] v;
  integer k;
  reg [3:0] list [0:7];
  initial begin
    list[0] = 4'b0000; list[1] = 4'b1111; list[2] = 4'b10x1; list[3] = 4'b00z0;
    list[4] = 4'bxxxx; list[5] = 4'b1z1z; list[6] = 4'b0x0x; list[7] = 4'bzzzz;
    for (k = 0; k < 8; k = k + 1) begin
      v = list[k];
      $display("%b: & %b ~& %b | %b ~| %b ^ %b ~^ %b ! %b ~ %b -%b", v, &v, ~&v, |v, ~|v, ^v, ~^v, !v, ~v, -v);
      $display("      v&&1 %b v||0 %b v==0 %b v!=4'b1111 %b v===v %b v+1 %b v<<1 %b v>>1 %b", v && 1'b1, v || 1'b0, v == 4'd0, v != 4'b1111, v === v, v + 4'd1, v << 1, v >> 1);
    end
  end
endmodule
