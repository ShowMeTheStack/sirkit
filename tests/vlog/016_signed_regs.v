module tb;
  reg signed [7:0] s8;
  reg [7:0] u8;
  reg signed [15:0] s16;
  reg [15:0] u16;
  wire signed [3:0] sw;
  assign sw = 4'b1010;
  initial begin
    $dumpfile("016.vcd");
    $dumpvars(0, tb);
    s8 = 8'hF0; u8 = 8'hF0;
    s16 = s8; u16 = s8;
    $display("s8=%d u8=%d s16=%d u16=%d", s8, u8, s16, u16);
    s16 = u8; u16 = u8;
    $display("from u8: s16=%d u16=%d", s16, u16);
    s16 = s8 + u8;
    $display("s8+u8=%d (%h)", s16, s16);
    s16 = s8 + 8'sd0;
    $display("s8+8'sd0=%d", s16);
    s16 = s8[7:0];
    $display("s8[7:0]=%d", s16);
    s16 = {s8};
    $display("{s8}=%d", s16);
    #1 $display("sw=%d sw=%b sw+0=%d", sw, sw, sw + 0);
    s8 = -128;
    s8 = -s8;
    $display("-(-128)=%d", s8);
    s8 = 127; s8 = s8 + 1;
    $display("127+1=%d", s8);
    $display("%d %d %d", 8'sd255, -8'sd1, 4'sb1000);
  end
endmodule
