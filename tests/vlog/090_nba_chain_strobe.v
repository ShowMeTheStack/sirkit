// Chains of non-blocking updates within one time step, observed by $display and $strobe
`timescale 1ns/1ns
module tb;
  reg clk;
  reg [7:0] in, a, b, c;
  integer wake_b, wake_c;

  always @(posedge clk) a <= in;
  always @(a) b <= a + 8'd1;
  always @(b) begin
    c <= b * 8'd2;
    $display("%0t  [b changed] a=%0d b=%0d c=%0d", $time, a, b, c);
  end

  initial begin
    $dumpfile("090.vcd");
    $dumpvars(0, tb);
    clk = 0; in = 8'd3;
    #1 c = 0; a = 0; b = 0;
    #4 clk = 1;
    $display("%0t edge: a=%0d b=%0d c=%0d", $time, a, b, c);
    $strobe ("%0t strobe: a=%0d b=%0d c=%0d", $time, a, b, c);
    #5 clk = 0; in = 8'd10;
    #5 clk = 1;
    $strobe ("%0t strobe: a=%0d b=%0d c=%0d", $time, a, b, c);
    #5 clk = 0;
    #5 clk = 1;                 // in unchanged: a keeps its value, no chain
    $strobe ("%0t strobe: a=%0d b=%0d c=%0d", $time, a, b, c);
    #1 $finish;
  end
endmodule
