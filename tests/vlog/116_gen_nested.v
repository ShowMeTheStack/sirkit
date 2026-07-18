`timescale 1ns/1ns
module pe (input a, input b, output reg y);
  parameter R = 0, C = 0;
  always @* y = (R + C) % 2 ? a | b : a & b;
endmodule

module tb;
  localparam ROWS = 3, COLS = 4;
  reg [COLS-1:0] in_a [0:ROWS-1];
  reg [COLS-1:0] in_b;
  wire [ROWS*COLS-1:0] flat;
  genvar r, c;
  generate
    for (r = 0; r < ROWS; r = r + 1) begin : row
      wire [COLS-1:0] outs;
      for (c = 0; c < COLS; c = c + 1) begin : col
        pe #(.R(r), .C(c)) u (.a(in_a[r][c]), .b(in_b[c]), .y(outs[c]));
        if (c == 0) begin : first
          wire tag = 1'b1;
        end
      end
      assign flat[r*COLS +: COLS] = outs;
    end
  endgenerate

  generate
    for (r = 0; r < 2; r = r + 1) begin : lvl1
      for (c = 0; c < 2; c = c + 1) begin : lvl2
        localparam integer ID = r * 10 + c;
        reg [7:0] val;
        initial val = ID;
      end
    end
  endgenerate

  initial begin
    $dumpfile("116.vcd");
    $dumpvars(0, tb);
    in_a[0] = 4'b1100; in_a[1] = 4'b1010; in_a[2] = 4'b0110;
    in_b = 4'b0101;
    #1 $display("flat=%b", flat);
    $display("row1.outs=%b row2.col3.u.y=%b tag=%b", row[1].outs, row[2].col[3].u.y, row[0].col[0].first.tag);
    $display("ids %0d %0d %0d %0d", lvl1[0].lvl2[0].val, lvl1[0].lvl2[1].val, lvl1[1].lvl2[0].val, lvl1[1].lvl2[1].val);
    $display("params R=%0d C=%0d", row[2].col[1].u.R, row[2].col[1].u.C);
    in_b = 4'b1x1z;
    #1 $display("flat=%b", flat);
    in_a[1] = 4'bzzzz;
    #1 $display("flat=%b", flat);
    $finish;
  end
endmodule
