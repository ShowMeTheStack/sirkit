`timescale 1ns/1ns
// detects 1101 (overlapping), Moore output, two-block style
module det_moore (input clk, input rst, input x, output reg z);
  localparam S0 = 3'd0, S1 = 3'd1, S11 = 3'd2, S110 = 3'd3, S1101 = 3'd4;
  reg [2:0] st, nx;
  always @(posedge clk)
    if (rst) st <= S0; else st <= nx;
  always @* begin
    nx = S0;
    z = (st == S1101);
    case (st)
      S0:    nx = x ? S1 : S0;
      S1:    nx = x ? S11 : S0;
      S11:   nx = x ? S11 : S110;
      S110:  nx = x ? S1101 : S0;
      S1101: nx = x ? S11 : S0;
      default: nx = S0;
    endcase
  end
endmodule

module tb;
  reg clk, rst, x;
  wire z;
  reg [0:19] pattern;
  integer i;
  det_moore d (.clk(clk), .rst(rst), .x(x), .z(z));
  initial begin
    clk = 0;
    forever #5 clk = ~clk;
  end
  initial begin
    $dumpfile("124.vcd");
    $dumpvars(0, tb);
    pattern = 20'b1101_1011_0110_1110_1101;
    rst = 1; x = 0;
    @(negedge clk) rst = 0;
    for (i = 0; i < 20; i = i + 1) begin
      x = pattern[i];
      @(negedge clk);
      $display("t=%0t i=%0d x=%b st=%0d z=%b", $time, i, x, d.st, z);
    end
    $finish;
  end
endmodule
