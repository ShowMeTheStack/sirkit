// Signed values in every radix, minimum widths of %d for signed vectors
module tb;
  reg signed [3:0] s4;
  reg signed [7:0] s8;
  reg signed [15:0] s16;
  reg signed [31:0] s32;
  integer i;
  initial begin
    $dumpfile("189.vcd");
    $dumpvars(0, tb);
    for (i = -8; i < 8; i = i + 3) begin
      s4 = i;
      #1 $display("s4: [%d] [%0d] [%b] [%h] [%o]", s4, s4, s4, s4, s4);
    end
    s8 = -128;
    $display("s8 min: [%d] [%h]", s8, s8);
    s8 = 127;
    $display("s8 max: [%d] [%h]", s8, s8);
    s16 = -16'sd1;
    $display("s16: [%d] [%0d] [%h] [%o]", s16, s16, s16, s16);
    s32 = 32'sh8000_0000;
    $display("s32 min: [%d] [%0d]", s32, s32);
    s8 = 8'bx000_0001;
    $display("s8 x: [%d] [%h]", s8, s8);
    s8 = 8'bzzzz_zzzz;
    $display("s8 z: [%d] [%h]", s8, s8);
    $display("expr: [%d] [%d]", s4 + s8, -s4);
    $finish;
  end
endmodule
