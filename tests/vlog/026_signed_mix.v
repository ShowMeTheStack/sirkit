module tb;
  reg signed [7:0] s;
  reg [7:0] u;
  reg signed [15:0] r;
  reg [15:0] ru;
  integer i;
  initial begin
    $dumpfile("026.vcd");
    $dumpvars(0, tb);
    s = -10; u = 20;
    r = s + u;            $display("1 %d %h", r, r);
    r = s + 20;           $display("2 %d", r);
    r = s + 8'sd20;       $display("3 %d", r);
    r = s * 2;            $display("4 %d", r);
    r = s * 2'd2;         $display("5 %d", r);
    r = s / 3;            $display("6 %d", r);
    r = s / 3'd3;         $display("7 %d", r);
    r = s % 3;            $display("8 %d", r);
    i = s;                $display("9 %0d", i);
    i = u;                $display("10 %0d", i);
    i = s + u;            $display("11 %0d", i);
    i = s + i;            $display("12 %0d", i);
    ru = s;               $display("13 %d", ru);
    r = {8'h00, s};       $display("14 %d", r);
    r = -s;               $display("15 %d", r);
    r = -u;               $display("16 %d", r);
    r = s - u;            $display("17 %d", r);
    r = (s - u) >>> 2;    $display("18 %d", r);
    i = -7;
    $display("19 %0d %0d %0d %0d", i / 2, i % 2, 7 / -2, 7 % -2);
    $display("20 %0d %0d", -7 % -2, i / -2);
    r = s * u;            $display("21 %d", r);
    $display("22 %0d", s * u);
  end
endmodule
