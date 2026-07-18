// Posedge and negedge registers sharing data: each edge sees the other's settled value
`timescale 10ns/1ns
module stage #(parameter W = 4) (
  input              clk,
  input      [W-1:0] d,
  output reg [W-1:0] q
);
  always @(posedge clk) q <= d;
endmodule

module tb;
  reg clk;
  reg [3:0] src;
  wire [3:0] p1, p2;
  reg  [3:0] n1;
  wire [3:0] nclk_q;

  stage #(4) u_p1 (.clk(clk),  .d(src), .q(p1));
  stage #(.W(4)) u_p2 (.clk(clk), .d(n1), .q(p2));
  stage u_n (.clk(~clk), .d(p1), .q(nclk_q));

  always @(negedge clk) n1 <= p1 + 4'd1;

  always @(posedge clk) src <= src + 4'd3;

  initial begin
    $dumpfile("097.vcd");
    $dumpvars(0, tb);
    src = 4'd0; n1 = 4'd0;
    #1 clk = 0;                // x->0 is a negedge: n1 and nq capture x from p1
    $monitor("%t clk=%b src=%0d p1=%0d n1=%0d p2=%0d nq=%0d", $time, clk, src, p1, n1, p2, nclk_q);
    repeat (8) #1 clk = ~clk;
    #1 $finish;
  end
endmodule
