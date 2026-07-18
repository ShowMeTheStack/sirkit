`timescale 1ns/1ps
module fa (input a, b, ci, output s, co);
  wire t1, t2, t3;
  xor #1 g1 (t1, a, b);
  xor #1 g2 (s, t1, ci);
  and #1 g3 (t2, a, b);
  and #1 g4 (t3, t1, ci);
  or  #1 g5 (co, t2, t3);
endmodule

module ripple #(parameter N = 4) (input [N-1:0] a, b, input ci, output [N-1:0] s, output co);
  wire [N:0] c;
  assign c[0] = ci;
  assign co = c[N];
  genvar i;
  generate
    for (i = 0; i < N; i = i + 1) begin : st
      fa f (.a(a[i]), .b(b[i]), .ci(c[i]), .s(s[i]), .co(c[i+1]));
    end
  endgenerate
endmodule

module cla4 (input [3:0] a, b, input ci, output [3:0] s, output co, output pg, output gg);
  wire [3:0] g = a & b, p = a ^ b;
  wire [4:0] c;
  assign c[0] = ci;
  assign c[1] = g[0] | p[0] & c[0];
  assign c[2] = g[1] | p[1] & g[0] | p[1] & p[0] & c[0];
  assign c[3] = g[2] | p[2] & g[1] | p[2] & p[1] & g[0] | p[2] & p[1] & p[0] & c[0];
  assign c[4] = g[3] | p[3] & c[3];
  assign s = p ^ c[3:0];
  assign co = c[4];
  assign pg = &p;
  assign gg = c[4] & ~(pg & ci);
endmodule

module tb;
  reg [3:0] a, b;
  reg ci;
  wire [3:0] s_r, s_c;
  wire co_r, co_c, pg, gg;
  ripple #(4) r (.a(a), .b(b), .ci(ci), .s(s_r), .co(co_r));
  cla4 c (a, b, ci, s_c, co_c, pg, gg);
  integer i, errs;
  initial begin
    $dumpfile("128.vcd");
    $dumpvars(0, tb);
    errs = 0;
    a = 0; b = 0; ci = 0;
    #20;
    for (i = 0; i < 512; i = i + 37) begin
      {ci, a, b} = i;
      #20;
      if ({co_r, s_r} !== {co_c, s_c} || {co_r, s_r} !== a + b + ci) errs = errs + 1;
      $display("%2d+%2d+%b ripple=%b_%b cla=%b_%b pg=%b", a, b, ci, co_r, s_r, co_c, s_c, pg);
    end
    $display("errors=%0d", errs);
    a = 4'b1111; b = 4'b0000; ci = 0;
    #20 ci = 1;
    #1 $display("t=%0t settling s=%b co=%b", $time, s_r, co_r);
    #2 $display("t=%0t settling s=%b co=%b", $time, s_r, co_r);
    #3 $display("t=%0t settling s=%b co=%b", $time, s_r, co_r);
    #10 $display("t=%0t settled  s=%b co=%b cla=%b", $time, s_r, co_r, s_c);
    $finish;
  end
endmodule
