`timescale 1ns/1ps
module updown #(parameter W = 4) (
  input clk, input rst_n, input en, input up, input load, input [W-1:0] d,
  output reg [W-1:0] q, output tc);
  assign tc = en & (up ? &q : ~|q);
  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) q <= {W{1'b0}};
    else if (load) q <= d;
    else if (en) q <= up ? q + 1'b1 : q - 1'b1;
  end
endmodule

module tb;
  reg clk, rst_n, en, up, load;
  reg [3:0] d;
  wire [3:0] q;
  wire tc;
  updown u (.clk(clk), .rst_n(rst_n), .en(en), .up(up), .load(load), .d(d), .q(q), .tc(tc));
  always #5 clk = ~clk;
  initial $monitor("%t q=%h tc=%b en=%b up=%b ld=%b", $time, q, tc, en, up, load);
  initial begin
    $dumpfile("122.vcd");
    $dumpvars(0, tb);
    clk = 0; rst_n = 0; en = 0; up = 1; load = 0; d = 4'hC;
    #12 rst_n = 1;
    #10 en = 1;
    #40 load = 1;
    #10 load = 0;
    #50 up = 0;
    #30 en = 0;
    #20 en = 1;
    #150 rst_n = 0;
    #2 rst_n = 1;
    #10 $finish;
  end
endmodule
