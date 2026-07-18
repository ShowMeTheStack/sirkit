`timescale 1ns/1ns
module dec3to8 (input [2:0] a, input en, output reg [7:0] y);
  integer k;
  always @* begin
    y = 8'b0;
    if (en)
      for (k = 0; k < 8; k = k + 1)
        if (a == k) y[k] = 1'b1;
  end
endmodule

module dec2to4_gates (a, en, y);
  input [1:0] a;
  input en;
  output [3:0] y;
  wire na0, na1;
  not (na0, a[0]);
  not (na1, a[1]);
  and (y[0], en, na1, na0);
  and (y[1], en, na1, a[0]);
  and (y[2], en, a[1], na0);
  and (y[3], en, a[1], a[0]);
endmodule

module dec4to16 (input [3:0] a, output [15:0] y);
  wire [3:0] grp;
  dec2to4_gates hi (.a(a[3:2]), .en(1'b1), .y(grp));
  dec2to4_gates lo0 (a[1:0], grp[0], y[3:0]);
  dec2to4_gates lo1 (a[1:0], grp[1], y[7:4]);
  dec2to4_gates lo2 (a[1:0], grp[2], y[11:8]);
  dec2to4_gates lo3 (a[1:0], grp[3], y[15:12]);
endmodule

module tb;
  reg [3:0] a;
  reg en;
  wire [7:0] y8;
  wire [15:0] y16;
  wire [7:0] shift_dec = en ? (8'b1 << a[2:0]) : 8'b0;
  dec3to8 d8 (.a(a[2:0]), .en(en), .y(y8));
  dec4to16 d16 (.a(a), .y(y16));
  integer i;
  initial begin
    en = 1;
    for (i = 0; i < 16; i = i + 1) begin
      a = i;
      #1 $display("a=%h y8=%b sh=%b y16=%b", a, y8, shift_dec, y16);
    end
    en = 0; a = 3;
    #1 $display("disabled y8=%b sh=%b", y8, shift_dec);
    en = 1; a = 4'b01x1;
    #1 $display("x addr y8=%b sh=%b y16=%b", y8, shift_dec, y16);
    en = 1'bx; a = 4'd2;
    #1 $display("x en y8=%b sh=%b", y8, shift_dec);
    $finish;
  end
endmodule
