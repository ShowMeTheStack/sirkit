module tb;
  reg [7:0] r;
  reg [11:0] w;
  reg [31:0] big;
  initial begin
    $dumpfile("018.vcd");
    $dumpvars(0, tb);
    r = 8'bx;            $display("1 %b %h %d", r, r, r);
    r = 8'bz;            $display("2 %b %h %d", r, r, r);
    r = 8'b1x;           $display("3 %b", r);
    r = 8'bz1;           $display("4 %b", r);
    r = 8'b0x;           $display("5 %b", r);
    r = 8'hx5;           $display("6 %b %h", r, r);
    r = 8'h?a;           $display("7 %b %h", r, r);
    r = 8'b1?0?_x1z0;    $display("8 %b %h %o", r, r, r);
    r = 8'o3x;           $display("9 %b %o", r, r);
    w = 12'hzx1;         $display("10 %b %h %o", w, w, w);
    w = 12'bx0;          $display("11 %b", w);
    w = 'bz;             $display("12 %b", w);
    big = 'bx;           $display("13 %h", big);
    big = 'hz;           $display("14 %h", big);
    big = 32'bx01;       $display("15 %h", big);
    w = 12'o7z7x;        $display("16 %b %o %h", w, w, w);
    r = 8'dx;            $display("17 %b", r);
    r = 8'dz;            $display("18 %b %d", r, r);
    r = 8'b0000_0z00;    $display("19 %d %h", r, r);
    r = 8'b0000_1x00;    $display("20 %d %h", r, r);
  end
endmodule
