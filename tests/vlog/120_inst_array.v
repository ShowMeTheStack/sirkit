`timescale 1ns/1ns
module dff (input clk, input d, input rst, output reg q);
  always @(posedge clk or posedge rst)
    if (rst) q <= 1'b0; else q <= d;
endmodule

module inv_buf (input a, output y, output z);
  assign y = ~a;
  assign z = a;
endmodule

module tb;
  reg clk, rst, sin;
  wire [3:0] q;
  wire [3:0] ny, nz;
  reg [3:0] v;
  dff chain [3:0] (.clk(clk), .d({q[2:0], sin}), .rst(rst), .q(q));
  inv_buf ib [3:0] (v, ny, nz);
  initial begin
    clk = 0;
    forever #5 clk = ~clk;
  end
  initial begin
    $dumpfile("120.vcd");
    $dumpvars(0, tb);
    rst = 1; sin = 0; v = 4'b1x0z;
    #1 $display("ny=%b nz=%b", ny, nz);
    #3 rst = 0;
    sin = 1;
    @(negedge clk) $display("t=%0t q=%b", $time, q);
    sin = 0;
    @(negedge clk) $display("t=%0t q=%b", $time, q);
    sin = 1;
    @(negedge clk) $display("t=%0t q=%b", $time, q);
    @(negedge clk) $display("t=%0t q=%b", $time, q);
    @(negedge clk) $display("t=%0t q=%b chain[2].q=%b", $time, q, chain[2].q);
    #2 rst = 1;
    #1 $display("t=%0t after async reset q=%b", $time, q);
    $finish;
  end
endmodule
