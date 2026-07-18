module tb;
  reg [63:0] w;
  reg [47:0] v;
  reg [7:0] b;
  initial begin
    $dumpfile("021.vcd");
    $dumpvars(0, tb);
    w = 'hFFFF_FFFF_FFFF;       $display("1 %h", w);
    w = 'h1_0000_0000;          $display("2 %h", w);
    w = 'b1 << 40;              $display("3 %h", w);
    w = 1 << 40;                $display("4 %h", w);
    w = 64'd1 << 40;            $display("5 %h", w);
    w = 'bx;                    $display("6 %h", w);
    w = 'bz1;                   $display("7 %h", w);
    w = 64'hx;                  $display("8 %h", w);
    w = 33'h1_FFFF_FFFF + 1;    $display("9 %h", w);
    w = 32'hFFFF_FFFF + 1;      $display("10 %h", w);
    w = 32'hFFFF_FFFF + 33'd1;  $display("11 %h", w);
    v = 48'd281474976710655;    $display("12 %0d %h", v, v);
    v = v + 1;                  $display("13 %0d", v);
    b = 'd300;                  $display("14 %0d", b);
    w = 4294967296;             $display("15 %h", w);
    w = -1;                     $display("16 %h", w);
    w = -32'd1;                 $display("17 %h", w);
    w = {8{8'hA5}};             $display("18 %h %0d", w, w[63]);
  end
endmodule
