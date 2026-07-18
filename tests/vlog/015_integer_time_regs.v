`timescale 1ns/1ps
module tb;
  integer a, b;
  reg [31:0] u;
  time t1, t2;
  reg [63:0] r64;
  integer arr [0:3];
  initial begin
    $dumpfile("015.vcd");
    $dumpvars(0, tb);
    a = -7; b = 2;
    u = -7;
    $display("a/b=%0d a%%b=%0d u/b=%0d u%%b=%0d", a / b, a % b, u / b, u % b);
    $display("a>>1=%0d a>>>1=%0d u>>>1=%0d", a >> 1, a >>> 1, u >>> 1);
    $display("a<b=%b u<b=%b", a < b, u < b);
    a = 'bx;
    $display("a=%b a=%d", a, a);
    a = 4'b1x01;
    $display("a=%d a=%h", a, a);
    #3.5;
    t1 = $time;
    #2.25;
    t2 = $time;
    $display("t1=%0d t2=%0d t2-t1=%0d", t1, t2, t2 - t1);
    t1 = 0 - 1;
    $display("t1=%h", t1);
    r64 = {32'hFFFF_FFFF, 32'h0} + 64'd1;
    $display("r64=%h", r64);
    arr[0] = 10; arr[1] = -20; arr[2] = arr[0] + arr[1]; arr[3] = arr[2] * arr[2];
    $display("arr %0d %0d %0d %0d", arr[0], arr[1], arr[2], arr[3]);
    $display("arr[1] hex=%h", arr[1]);
  end
endmodule
