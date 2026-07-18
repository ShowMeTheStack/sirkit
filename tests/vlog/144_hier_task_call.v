`timescale 1ns/1ns
module bus_model (input clk);
  reg [7:0] mem [0:15];
  reg [7:0] last;
  integer writes;
  initial writes = 0;
  task write;
    input [3:0] a;
    input [7:0] d;
    begin
      @(posedge clk);
      mem[a] = d;
      writes = writes + 1;
    end
  endtask
  task read;
    input [3:0] a;
    output [7:0] d;
    begin
      @(posedge clk);
      d = mem[a];
      last = d;
    end
  endtask
  function [7:0] peek;
    input [3:0] a;
    peek = mem[a];
  endfunction
endmodule

module system (input clk);
  bus_model bus (clk);
  reg [3:0] mode;
endmodule

module tb;
  reg clk;
  reg [7:0] v;
  integer i;
  system sys (clk);
  always #5 clk = ~clk;
  initial begin
    $dumpfile("144.vcd");
    $dumpvars(0, tb);
    clk = 0;
    sys.mode = 4'h3;
    for (i = 0; i < 4; i = i + 1) sys.bus.write(i, 8'h40 + i * 3);
    $display("t=%0t writes=%0d", $time, sys.bus.writes);
    sys.bus.read(2, v);
    $display("t=%0t read 2 -> %h last=%h", $time, v, sys.bus.last);
    $display("peek 3=%h peek 9=%h", sys.bus.peek(3), tb.sys.bus.peek(9));
    sys.bus.mem[9] = 8'h99;
    tb.sys.bus.mem[10] = sys.bus.peek(9) + 1;
    sys.bus.read(10, v);
    $display("t=%0t read 10 -> %h mode=%h", $time, v, sys.mode);
    sys.bus.writes = 100;
    sys.bus.write(4'hF, 8'hFF);
    $display("t=%0t writes=%0d mem15=%h", $time, sys.bus.writes, sys.bus.mem[15]);
    $finish;
  end
endmodule
