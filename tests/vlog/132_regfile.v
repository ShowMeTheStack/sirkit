`timescale 1ns/1ps
module regfile #(parameter W = 16, parameter N = 8, parameter AW = 3) (
  input clk, input we,
  input [AW-1:0] wa, ra1, ra2,
  input [W-1:0] wd,
  output [W-1:0] rd1, rd2);
  reg [W-1:0] r [0:N-1];
  integer k;
  initial for (k = 0; k < N; k = k + 1) r[k] = 0;
  always @(posedge clk)
    if (we && wa != 0) r[wa] <= wd;
  // write-through bypass on port 1 only
  assign rd1 = (we && wa == ra1 && wa != 0) ? wd : r[ra1];
  assign rd2 = r[ra2];
endmodule

module tb;
  reg clk, we;
  reg [2:0] wa, ra1, ra2;
  reg [15:0] wd;
  wire [15:0] rd1, rd2;
  regfile rf (.clk(clk), .we(we), .wa(wa), .ra1(ra1), .ra2(ra2), .wd(wd), .rd1(rd1), .rd2(rd2));
  always #5 clk = ~clk;
  integer i;
  task wr;
    input [2:0] a;
    input [15:0] d;
    begin
      @(negedge clk);
      we = 1; wa = a; wd = d; ra1 = a; ra2 = a;
      #1 $display("%t write r%0d<=%h bypass rd1=%h rd2=%h", $time, a, d, rd1, rd2);
      @(negedge clk) we = 0;
      $display("%t after edge rd1=%h rd2=%h", $time, rd1, rd2);
    end
  endtask
  initial begin
    $dumpfile("132.vcd");
    $dumpvars(0, tb);
    clk = 0; we = 0; wa = 0; ra1 = 0; ra2 = 0; wd = 0;
    wr(3'd1, 16'hBEEF);
    wr(3'd0, 16'hDEAD);
    wr(3'd7, 16'h1234);
    wr(3'd1, 16'h00x1);
    for (i = 0; i < 8; i = i + 1) begin
      ra1 = i; ra2 = 7 - i;
      #1 $display("r%0d=%h r%0d=%h", ra1, rd1, ra2, rd2);
    end
    $display("direct r[7]=%h r[1]=%b", rf.r[7], rf.r[1]);
    ra1 = 3'bx1x;
    #1 $display("x addr rd1=%h", rd1);
    $finish;
  end
endmodule
