`timescale 1ns/1ps
module leaf (input [3:0] x, output [3:0] y);
  wire [3:0] inv = ~x;
  assign y = inv + 1;
endmodule

module mid (input [3:0] p, output [3:0] q, output [3:0] r);
  wire [3:0] t;
  leaf l0 (.x(p), .y(t));
  leaf l1 (.x(t), .y(q));
  assign r = t ^ p;
endmodule

module upper (input [3:0] u, output [3:0] v, output flag);
  wire [3:0] q, r;
  mid m (.p(u), .q(q), .r(r));
  assign v = q;
  assign flag = (q == u);
  reg [7:0] note;
  initial note = "U";
endmodule

module top_level (input [3:0] in, output [3:0] out);
  wire flag;
  upper up (.u(in), .v(out), .flag(flag));
endmodule

module tb;
  reg [3:0] in;
  wire [3:0] out;
  top_level dut (.in(in), .out(out));
  integer i;
  initial begin
    $dumpfile("117.vcd");
    $dumpvars(0, tb);
    for (i = 0; i < 16; i = i + 5) begin
      in = i;
      #1 $display("in=%d out=%d neg=%d t=%b r=%b flag=%b", in, out, tb.dut.up.m.t,
                  dut.up.m.t, tb.dut.up.m.r, dut.flag);
    end
    $display("leaf inv: %b %b", tb.dut.up.m.l0.inv, dut.up.m.l1.inv);
    $display("note=%s", dut.up.note);
    in = 4'b10x1;
    #1 $display("x: out=%b t=%b flag=%b", out, dut.up.m.t, dut.up.flag);
    $finish;
  end
endmodule
