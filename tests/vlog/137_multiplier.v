`timescale 1ns/1ps
// sequential shift-add multiplier with start/done handshake
module seqmul #(parameter W = 8) (input clk, input rst, input start,
  input [W-1:0] a, input [W-1:0] b, output reg [2*W-1:0] p, output reg busy, output reg done);
  reg [W-1:0] mcand, mplier;
  reg [$clog2(W+1)-1:0] cnt;
  always @(posedge clk) begin
    if (rst) begin
      busy <= 0; done <= 0; p <= 0; cnt <= 0;
    end else begin
      done <= 0;
      if (start && !busy) begin
        mcand <= a; mplier <= b; p <= 0; cnt <= W; busy <= 1;
      end else if (busy) begin
        if (mplier[0]) p <= p + ({{W{1'b0}}, mcand} << (W - cnt));
        mplier <= mplier >> 1;
        cnt <= cnt - 1;
        if (cnt == 1) begin busy <= 0; done <= 1; end
      end
    end
  end
endmodule

module tb;
  reg clk, rst, start;
  reg [7:0] a, b;
  wire [15:0] p;
  wire busy, done;
  integer cycles;
  seqmul #(8) m (.clk(clk), .rst(rst), .start(start), .a(a), .b(b), .p(p), .busy(busy), .done(done));
  always #4 clk = ~clk;
  task mul;
    input [7:0] x, y;
    begin
      @(negedge clk);
      a = x; b = y; start = 1;
      @(negedge clk) start = 0;
      cycles = 1;
      while (!done) begin
        @(negedge clk);
        cycles = cycles + 1;
      end
      $display("%t %0d*%0d=%0d (%h) cycles=%0d ok=%b", $time, x, y, p, p, cycles, p == x * y);
    end
  endtask
  initial begin
    $dumpfile("137.vcd");
    $dumpvars(0, tb);
    clk = 0; rst = 1; start = 0; a = 0; b = 0;
    #10 rst = 0;
    mul(8'd13, 8'd11);
    mul(8'd255, 8'd255);
    mul(8'd0, 8'd77);
    mul(8'd128, 8'd2);
    $finish;
  end
endmodule
