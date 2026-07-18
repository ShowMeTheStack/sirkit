`timescale 1ns/1ps
module tb;
  reg en1, en2;
  reg [3:0] d1, d2;
  wire [3:0] bus;
  wire [4:0] inc = bus + 1;
  wire [3:0] inv = ~bus;
  wire par = ^bus;
  wire any = |bus;
  wire same = (bus === 4'bzzzz);
  assign bus = en1 ? d1 : 4'bz;
  assign bus = en2 ? d2 : 4'bz;
  task show;
    #1 $display("%0t en=%b%b bus=%b inc=%b inv=%b par=%b any=%b floating=%b", $time, en1, en2, bus, inc, inv, par, any, same);
  endtask
  initial begin
    $dumpfile("045.vcd");
    $dumpvars(0, tb);
    d1 = 4'b1010; d2 = 4'b1001;
    en1 = 0; en2 = 0; show;
    en1 = 1; show;
    en1 = 0; en2 = 1; show;
    en1 = 1; show;
    d2 = d1; show;
    en1 = 1'bx; en2 = 0; show;
    d1 = 4'b0000; show;
    en1 = 0; en2 = 1; d2 = 4'b10z1; show;
    $finish;
  end
endmodule
