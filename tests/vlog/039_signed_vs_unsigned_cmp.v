module tb;
  reg signed [7:0] s;
  reg [7:0] u;
  integer i;
  reg [31:0] u32;
  reg r1, r2, r3, r4;
  initial begin
    $dumpfile("039.vcd");
    $dumpvars(0, tb);
    s = -1; u = 1;
    r1 = s < u; r2 = s < $signed(u); r3 = $unsigned(s) < u; r4 = s < 1;
    $display("1 %b %b %b %b", r1, r2, r3, r4);
    i = -1; u32 = 1;
    $display("2 %b %b %b", i < u32, i < 1, i < $signed(u32));
    $display("3 %b %b", -1 < 1'b1, -1 < 1'sb1);
    $display("4 %b %b", 8'sd0 > -8'sd1, 8'd0 > -8'sd1);
    s = -128; u = 128;
    $display("5 %b %b %b", s == u, s === u, $unsigned(s) == u);
    $display("6 %b %b", s == -128, u == -128);
    $display("7 %b", u == 8'sb1000_0000);
    $display("8 %b", 16'hFF80 == s);
    $display("9 %b", 16'shFF80 == s);
    i = -5;
    $display("10 %b %b", i < 0, i < 'd0);
    $display("11 %b", i < 3'd0);
    $display("12 %b", i > 0 ? 1'b1 : 1'b0);
    s = 8'sb1000_000x;
    $display("13 %b %b", s < 0, s == s);
    $display("14 %0d", (s < 0) === 1'bx);
  end
endmodule
