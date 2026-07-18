module tb;
  reg sel;
  reg [7:0] a;
  reg [7:0] r;
  reg signed [7:0] s;
  wire [7:0] y = sel ? a + 8'd1 : a - 8'd1;
  wire [7:0] z = sel ? a : a;
  wire [3:0] m = sel ? 4'b1100 : 4'b1010;
  initial begin
    $dumpfile("047.vcd");
    $dumpvars(0, tb);
    a = 8'd10;
    sel = 1; #1 $display("1 y=%0d z=%0d m=%b", y, z, m);
    sel = 0; #1 $display("2 y=%0d z=%0d m=%b", y, z, m);
    sel = 1'bx; #1 $display("3 y=%b z=%b m=%b", y, z, m);
    a = 8'd0;
    #1 $display("4 y=%b", y);
    a = 8'b0000_x000;
    #1 $display("5 y=%b z=%b", y, z);
    r = sel ? 8'd7 : 8'd7;               $display("6 %0d", r);
    r = sel ? 8'bz : 8'b0;               $display("7 %b", r);
    r = sel ? 8'b0000_00x1 : 8'b0000_00x1; $display("8 %b", r);
    r = (sel ? 8'd4 : 8'd6) + 1;         $display("9 %b", r);
    r = sel ? 8'd255 : 8'd0;             $display("10 %b", r);
    s = sel ? -8'sd1 : 8'sd1;            $display("11 %b", s);
    r = (2'b1x == 2'b11) ? 8'hA5 : 8'hA4;  $display("12 %h", r);
    r = (2'b1x === 2'b1x) ? 8'hA5 : 8'hA4; $display("13 %h", r);
    r = sel ? (sel ? 1 : 2) : 3;          $display("14 %b", r);
    sel = 1;
    r = sel ? 8'bx : 8'd3;               $display("15 %b", r);
  end
endmodule
