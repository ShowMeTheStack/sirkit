module tb;
  reg [7:0] u;
  reg signed [7:0] s;
  reg [15:0] u16;
  reg signed [15:0] s16;
  integer i;
  initial begin
    $dumpfile("019.vcd");
    $dumpvars(0, tb);
    u = -8'd1;           $display("1 %b %d", u, u);
    s = -8'd1;           $display("2 %b %d", s, s);
    u16 = -8'd1;         $display("3 %h", u16);
    s16 = -8'd1;         $display("4 %h %d", s16, s16);
    u16 = -8'sd1;        $display("5 %h", u16);
    s16 = -8'sd1;        $display("6 %h %d", s16, s16);
    u = -3;              $display("7 %b %d", u, u);
    s = -4'd3;           $display("8 %b %d", s, s);
    s = -4'sd3;          $display("9 %b %d", s, s);
    i = -4'd3;           $display("10 %0d", i);
    i = -4'sd3;          $display("11 %0d", i);
    i = -'d3;            $display("12 %0d", i);
    i = -'sd3;           $display("13 %0d", i);
    i = 4'sd15;          $display("14 %0d", i);
    i = 4'sb1111;        $display("15 %0d", i);
    i = 'sh80000000;     $display("16 %0d", i);
    i = 'h80000000;      $display("17 %0d", i);
    u16 = 4'sb1000;      $display("18 %b", u16);
    u16 = 4'b1000;       $display("19 %b", u16);
    s16 = 3'sb1x0;       $display("20 %b", s16);
    s16 = 3'sbz11;       $display("21 %b", s16);
    $display("22 %0d %0d", -8'd5 / 2, -8'sd5 / 2);
    $display("23 %0d %0d", -5 / 2, -5 % 2);
  end
endmodule
