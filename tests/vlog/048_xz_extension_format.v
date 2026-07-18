module tb;
  reg [11:0] r;
  reg signed [11:0] s;
  reg [3:0] n;
  integer i;
  initial begin
    $dumpfile("048.vcd");
    $dumpvars(0, tb);
    n = 4'bx01z;
    r = n;              $display("1 %b", r);
    s = n;              $display("2 %b", s);
    s = $signed(n);     $display("3 %b", s);
    n = 4'bz101;
    s = $signed(n);     $display("4 %b", s);
    r = 12'bx;          $display("5 %b", r);
    r = 4'bx;           $display("6 %b", r);
    r = 4'bzx;          $display("7 %b", r);
    r = 4'b1z;          $display("8 %b", r);
    r = 12'bz_1x0;      $display("9 %b", r);
    r = 12'b0000_xxxx_1111; $display("10 %h %o %d", r, r, r);
    r = 12'b0000_xx11_1111; $display("11 %h %o %d", r, r, r);
    r = 12'bzzzz_0000_1111; $display("12 %h %o %d", r, r, r);
    r = 12'bzzzz_zz00_1111; $display("13 %h %o %d", r, r, r);
    r = 12'bzzzz_xxxx_0000; $display("14 %h %o %d", r, r, r);
    r = 12'bz00x_0000_0000; $display("15 %h %o %d", r, r, r);
    i = 12'b1x;         $display("16 %b", i);
    i = -12'b1x;        $display("17 %b", i);
    r = 12'hzzz;        $display("18 %d|%0d|%h|%0h", r, r, r, r);
    r = 12'hxxx;        $display("19 %d|%0d|%h|%0h", r, r, r, r);
    r = 12'h0x0;        $display("20 %d|%0d|%0h|%0o", r, r, r, r);
  end
endmodule
