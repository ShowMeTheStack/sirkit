`timescale 1ns/1ns
module tb;
  reg [7:0] mem [0:15];
  reg [3:0] rev [7:0];
  reg [7:0] d;
  reg [3:0] a;
  integer i;
  initial begin
    $dumpfile("012.vcd");
    $dumpvars(0, tb);
    $display("uninit mem[0]=%b", mem[0]);
    for (i = 0; i < 16; i = i + 1)
      mem[i] = i * 17;
    for (i = 0; i < 8; i = i + 1)
      rev[i] = 15 - i;
    $display("mem[3]=%h mem[15]=%h rev[0]=%d rev[7]=%d", mem[3], mem[15], rev[0], rev[7]);
    a = 4'd5;
    d = mem[a];
    $display("mem[a]=%h bit3=%b nibble=%h", d, mem[a][3], mem[a][7:4]);
    mem[a][0] = 1'b0;
    mem[a][7:6] = 2'b00;
    $display("mem[5]=%b", mem[5]);
    a = 4'bx;
    $display("mem[x]=%b", mem[a]);
    mem[a] = 8'h00;
    $display("after write x: mem[0]=%h mem[1]=%h", mem[0], mem[1]);
    i = 20;
    $display("mem[20]=%b", mem[i]);
    mem[i] = 8'h11;
    i = -3;
    $display("mem[-3]=%b", mem[i]);
    mem[2] = 8'bz0z0_x1x1;
    $display("mem[2]=%b", mem[2]);
    #1 $display("sum %0d", mem[1] + mem[3] + mem[4]);
  end
endmodule
