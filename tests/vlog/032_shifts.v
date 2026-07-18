module tb;
  reg [7:0] u;
  reg signed [7:0] s;
  reg [3:0] n;
  reg [15:0] w;
  reg signed [15:0] sw;
  initial begin
    $dumpfile("032.vcd");
    $dumpvars(0, tb);
    u = 8'b1001_0110; s = 8'sb1001_0110;
    $display("1 %b %b %b %b", u << 2, u >> 2, u <<< 2, u >>> 2);
    $display("2 %b %b %b %b", s << 2, s >> 2, s <<< 2, s >>> 2);
    $display("3 %b %b", u << 9, s >>> 9);
    w = u << 4;       $display("4 %b", w);
    w = s << 4;       $display("5 %b", w);
    sw = s >>> 2;     $display("6 %b", sw);
    sw = s >> 2;      $display("7 %b", sw);
    w = s >>> 2;      $display("8 %b", w);
    sw = u >>> 2;     $display("9 %b", sw);
    n = 4'd3;
    $display("10 %b", u >> n);
    n = 4'bx;
    $display("11 %b %b", u >> n, u << n);
    n = 4'b1z00;
    $display("12 %b", s >>> n);
    u = 8'b10x1_z001;
    $display("13 %b %b", u << 1, u >> 3);
    s = 8'sbx000_0000;
    $display("14 %b", s >>> 3);
    $display("15 %b", 4'sb1000 >>> 1'b1);
    $display("16 %0d", -16 >>> 2);
    $display("17 %0d", -16 >> 2);
    $display("18 %b", 1 << 31);
    $display("19 %b", 4'b1 << -1);
    sw = -1;
    $display("20 %b", sw >>> 16);
    $display("21 %b", $signed(u) >>> 2);
  end
endmodule
