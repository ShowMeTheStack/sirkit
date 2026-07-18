// A continuous assignment driven by a register updated with <=: when does the net follow?
`timescale 1ns/1ns
module tb;
  reg clk;
  reg [7:0] r;
  wire [7:0] w2 = r * 8'd2;
  wire [7:0] w3;
  wire       parity;

  assign #1 w3 = r + 8'd3;
  assign parity = ^r;

  always @(posedge clk) r <= r + 8'd1;

  initial begin
    $dumpfile("094.vcd");
    $dumpvars(0, tb);
    clk = 0; r = 8'd10;
    #5 clk = 1;
    $display("%0t edge:    r=%0d w2=%0d w3=%0d p=%b", $time, r, w2, w3, parity);
    #0 $display("%0t #0:      r=%0d w2=%0d w3=%0d p=%b", $time, r, w2, w3, parity);
    $strobe("%0t strobe:  r=%0d w2=%0d w3=%0d p=%b", $time, r, w2, w3, parity);
    @(w2) $display("%0t @(w2):  r=%0d w2=%0d w3=%0d", $time, r, w2, w3);
    #1 $display("%0t +1:      r=%0d w2=%0d w3=%0d p=%b", $time, r, w2, w3, parity);
    #4 clk = 0;
    #5 clk = 1;
    #1 $display("%0t +1:      r=%0d w2=%0d w3=%0d p=%b", $time, r, w2, w3, parity);
    $finish;
  end
endmodule
