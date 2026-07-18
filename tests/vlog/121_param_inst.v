module counter (clk, rst, q, wrap);
  parameter W = 4;
  parameter MAX = (1 << W) - 1;
  parameter [W-1:0] STEP = 1;
  input clk, rst;
  output reg [W-1:0] q;
  output wrap;
  assign wrap = (q == MAX);
  always @(posedge clk)
    if (rst || q == MAX) q <= 0;
    else q <= q + STEP;
endmodule

module tb;
  reg clk, rst;
  wire [3:0] q0;
  wire [2:0] q1;
  wire [7:0] q2;
  wire [4:0] q3;
  wire w0, w1, w2, w3;
  counter c0 (clk, rst, q0, w0);
  counter #(3) c1 (clk, rst, q1, w1);
  counter #(.W(8), .MAX(21), .STEP(7)) c2 (.clk(clk), .rst(rst), .q(q2), .wrap(w2));
  counter c3 (.clk(clk), .rst(rst), .q(q3), .wrap(w3));
  defparam c3.W = 5;
  defparam c3.MAX = 9;
  integer i;
  initial begin
    clk = 0;
    forever #5 clk = ~clk;
  end
  initial begin
    $dumpfile("121.vcd");
    $dumpvars(0, tb);
    $display("params c0 %0d %0d c1 %0d %0d c2 %0d %0d c3 %0d %0d", c0.W, c0.MAX, c1.W, c1.MAX, c2.W, c2.MAX, c3.W, c3.MAX);
    rst = 1;
    @(negedge clk) rst = 0;
    for (i = 0; i < 12; i = i + 1)
      @(negedge clk) $display("%2d: q0=%2d q1=%0d q2=%3d q3=%2d wraps=%b%b%b%b", i, q0, q1, q2, q3, w0, w1, w2, w3);
    $finish;
  end
endmodule
