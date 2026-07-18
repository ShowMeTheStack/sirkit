module leaf (output [15:0] v);
  parameter K = 1;
  parameter M = 2;
  assign v = K * 100 + M;
endmodule

module mid (output [15:0] a, output [15:0] b);
  parameter SCALE = 1;
  leaf la (a);
  leaf #(SCALE, SCALE + 1) lb (b);
endmodule

module tb;
  wire [15:0] x0, x1, y0, y1;
  mid m0 (x0, x1);
  mid m1 (y0, y1);
  defparam m0.la.K = 7;
  defparam m1.SCALE = 4;
  defparam m1.la.M = 9;
  initial begin
    $dumpfile("005.vcd");
    $dumpvars(0, tb);
    #1;
    $display("m0.la=%0d m0.lb=%0d", x0, x1);
    $display("m1.la=%0d m1.lb=%0d", y0, y1);
    $display("params %0d %0d %0d", m0.SCALE, m1.SCALE, m1.lb.K);
  end
endmodule
