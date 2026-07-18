`timescale 1ns/1ns
module acc (input clk, input rst, input [3:0] d, output reg [7:0] sum, output reg [7:0] cnt);
  always @(posedge clk) begin
    if (rst) begin
      sum <= 0;
      cnt <= 0;
    end else begin
      sum <= sum + d;
      cnt <= cnt + 1;
    end
  end
endmodule

module tb;
  reg clk = 0, rst;
  reg [3:0] d;
  wire [7:0] sum, cnt;
  wire half = sum[0];
  acc u (.clk(clk), .rst(rst), .d(d), .sum(sum), .cnt(cnt));
  always #5 clk = ~clk;
  initial begin
    $dumpfile("042.vcd");
    $dumpvars(0, tb);
    rst = 0; d = 4'd1;
    repeat (2) @(negedge clk) $display("%0t pre-reset sum=%b cnt=%b half=%b", $time, sum, cnt, half);
    rst = 1'bx;
    @(negedge clk) $display("%0t rst=x sum=%b cnt=%b", $time, sum, cnt);
    rst = 1;
    @(negedge clk) $display("%0t reset sum=%0d cnt=%0d", $time, sum, cnt);
    rst = 0;
    repeat (2) @(negedge clk) $display("%0t sum=%0d cnt=%0d", $time, sum, cnt);
    d = 4'b01x0;
    @(negedge clk) $display("%0t x-in sum=%b cnt=%0d", $time, sum, cnt);
    d = 4'd3;
    repeat (2) @(negedge clk) $display("%0t after sum=%b %d cnt=%0d", $time, sum, sum, cnt);
    d = 4'bzzzz;
    @(negedge clk) $display("%0t z-in sum=%h cnt=%0d", $time, sum, cnt);
    $finish;
  end
endmodule
