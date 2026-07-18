// buf and not with several outputs, z and x inputs
`timescale 1ns/1ps
module tb;
  reg in;
  wire o1, o2, o3, n1, n2;
  wire [3:0] bus;

  buf  b1 (o1, o2, o3, in);
  not  n_1 (n1, n2, in);
  buf  b2 (bus[0], bus[2], in);
  not  n_2 (bus[1], bus[3], in);

  initial begin
    $dumpfile("051.vcd");
    $dumpvars(0, tb);
    $monitor("%t in=%b buf=%b%b%b not=%b%b bus=%b", $time, in, o1, o2, o3, n1, n2, bus);
    in = 1'b0;
    #2 in = 1'b1;
    #2 in = 1'bz;
    #2 in = 1'bx;
    #2 in = 1'b0;
    #2 $finish;
  end
endmodule
