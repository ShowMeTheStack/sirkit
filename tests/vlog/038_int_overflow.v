module tb;
  integer i, j;
  reg [31:0] u;
  reg signed [31:0] s;
  reg [63:0] w;
  initial begin
    $dumpfile("038.vcd");
    $dumpvars(0, tb);
    i = 2147483647;
    j = i + 1;             $display("1 %0d", j);
    j = i * 2;             $display("2 %0d", j);
    j = -i - 2;            $display("3 %0d", j);
    j = (-i - 1) / -1;     $display("4 %0d", j);
    j = (-i - 1) % -1;     $display("5 %0d", j);
    u = 32'hFFFF_FFFF;
    u = u + 1;             $display("6 %0d", u);
    u = 0 - 1;             $display("7 %0d", u);
    s = 32'h8000_0000;     $display("8 %0d", s);
    s = -s;                $display("9 %0d", s);
    w = i * 2;             $display("10 %0d", w);
    w = i + i;             $display("11 %0d", w);
    w = 64'd0 + i + i;     $display("12 %0d", w);
    w = i * i;             $display("13 %h", w);
    i = 65536;
    j = i * i;             $display("14 %0d", j);
    j = 100000 * 100000;   $display("15 %0d", j);
    w = 100000 * 100000;   $display("16 %0d", w);
    w = 64'd100000 * 100000; $display("17 %0d", w);
    j = -2147483648;       $display("18 %0d %h", j, j);
    j = 'd4294967295;      $display("19 %0d", j);
    j = 4294967296;        $display("20 %0d", j);
    $display("21 %0d", 32'd4000000000 + 32'd4000000000);
  end
endmodule
