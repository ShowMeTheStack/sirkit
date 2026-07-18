`timescale 1ns/1ps
module tb;
  reg [3:0] c;
  reg a, b;
  integer r;
  reg [7:0] y;

  task check;
    input [3:0] cc;
    begin
      if (cc) $display("%b -> true", cc);
      else $display("%b -> false", cc);
    end
  endtask

  initial begin
    $dumpfile("100.vcd");
    $dumpvars(0, tb);
    check(4'b0000);
    check(4'b0001);
    check(4'b000x);
    check(4'b100x);
    check(4'bzzzz);
    check(4'b0z00);
    check(4'b1z00);
    a = 1; b = 0; r = 0;
    if (a) if (b) r = 1; else r = 2;
    $display("dangling a=1: r=%0d", r);
    a = 0; r = 0;
    if (a) if (b) r = 1; else r = 2;
    $display("dangling a=0: r=%0d", r);
    a = 0; r = 0;
    if (a) begin if (b) r = 1; end else r = 3;
    $display("blocked: r=%0d", r);
    for (r = 0; r < 6; r = r + 1) begin
      c = r;
      if (c == 0) y = 8'h10;
      else if (c < 2) y = 8'h20;
      else if (c == 4'bx) y = 8'hEE;
      else if (c[0]) y = 8'h30;
      else y = 8'h40;
      #1 $display("t=%0t c=%0d y=%h", $time, c, y);
    end
    a = 1'bx;
    if (a == 1'b1) $display("x==1 true"); else $display("x==1 not true");
    if (a != 1'b1) $display("x!=1 true"); else $display("x!=1 not true");
    if (a === 1'bx) $display("x===x true");
    if (!a) $display("!x true"); else $display("!x not true");
    b = 1;
    if (a || b) $display("x||1 true");
    if (a && b) $display("x&&1 true"); else $display("x&&1 not true");
    b = 0;
    if (a && b) $display("x&&0 true"); else $display("x&&0 not true");
    c = 4'bx;
    y = c[0] ? 8'b1100_1010 : 8'b1010_1010;
    $display("merge y=%b", y);
    #1 c = 4'b0110;
    y = c[1] ? 8'd200 : 8'd100;
    $display("pick y=%0d t=%t", y, $time);
    $finish;
  end
endmodule
