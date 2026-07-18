module tb;
  reg [7:0] v;
  reg [2:0] i;
  reg [7:0] r;
  reg [15:0] w;
  initial begin
    $dumpfile("046.vcd");
    $dumpvars(0, tb);
    v = 8'b1x0z_1001;
    r = v << 2;               $display("1 %b", r);
    r = v >> 5;               $display("2 %b", r);
    r = $signed(v) >>> 1;     $display("3 %b", r);
    r = v + (v >> 8);         $display("4 %b", r);
    r = (v & 8'h0F) + 1;      $display("5 %b %0d", r, r);
    r = (v | 8'hF0) & 8'h0F;  $display("6 %b", r);
    i = 3'b0x1;
    r = 8'd1 << i;            $display("7 %b", r);
    r = v[i];                 $display("8 %b", r);
    r = v[i +: 2];            $display("9 %b", r);
    i = 3'd4;
    r = v[i] + 1;             $display("10 %b", r);
    r = v[i +: 2] + 1;        $display("11 %b", r);
    r = v[3:0] + 1;           $display("12 %b", r);
    w = {v, v} >> 4;          $display("13 %b", w);
    w = {8{v[0]}} + 1;        $display("14 %b", w);
    w = {8{v[4]}};            $display("15 %b", w);
    r = ~v ^ v;               $display("16 %b", r);
    r = v & ~v;               $display("17 %b", r);
    r = v | ~v;               $display("18 %b", r);
    r = v ^ v;                $display("19 %b", r);
    r = v - v;                $display("20 %b", r);
  end
endmodule
