module tb;
  reg signed [7:0] a;
  reg [7:0] u;
  reg signed [11:0] r;
  initial begin
    $dumpfile("022.vcd");
    $dumpvars(0, tb);
    r = 4'sd7;          $display("1 %d %b", r, r);
    r = 4'sh8;          $display("2 %d %b", r, r);
    r = 4'h8;           $display("3 %d %b", r, r);
    r = 4'so7 + 4'so1;  $display("4 %d", r);
    r = 4'sd7 + 4'd1;   $display("5 %d", r);
    r = 3'sb100 * 2'sb11; $display("6 %d", r);
    r = 3'sb100 * 2'b11;  $display("7 %d", r);
    a = 8'sd100;
    u = 8'd100;
    $display("8 %b %b", a > -8'sd1, u > -8'sd1);
    $display("9 %b %b", a > -1, u > -1);
    $display("10 %b", 4'sd3 < 4'sb1111);
    $display("11 %b", 4'sd3 < 4'b1111);
    r = 'sd5 - 'sd9;    $display("12 %d", r);
    r = 5 - 9;          $display("13 %d", r);
    r = 'd5 - 'd9;      $display("14 %d %h", r, r);
    r = 4'sd5 - 4'sd9;  $display("15 %d", r);
    $display("16 %0d %0d", 2'sb10, 2'sb01);
    $display("17 %d", 8'sb1000_0000 >>> 3);
    $display("18 %d", 8'b1000_0000 >>> 3);
  end
endmodule
