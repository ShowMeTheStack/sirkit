`timescale 1ns/1ps
module tb;
  reg [3:0] a, b;
  wire land, lor, lnot;
  assign land = a && b;
  assign lor = a || b;
  assign lnot = !a;
  task show;
    begin
      #1 $display("a=%b b=%b && %b || %b !a %b", a, b, land, lor, lnot);
    end
  endtask
  initial begin
    $dumpfile("029.vcd");
    $dumpvars(0, tb);
    a = 4'd0; b = 4'd0; show;
    a = 4'd2; b = 4'd0; show;
    a = 4'd2; b = 4'd8; show;
    a = 4'b00x0; b = 4'd1; show;
    a = 4'b01x0; b = 4'd0; show;
    a = 4'b00x0; b = 4'd0; show;
    a = 4'bzzzz; b = 4'd3; show;
    a = 4'b00z1; b = 4'bxxxx; show;
    a = 4'b0000; b = 4'bxxxx; show;
    $display("mix %b %b %b", 1'bx && 1'b0, 1'bx || 1'b1, !1'bz);
    $display("val %0d %0d", (3 && 5) + 1, !(8'd0) + !(8'd7));
    $display("neg %b %b", -1 && 1, !(-4'sd1));
  end
endmodule
