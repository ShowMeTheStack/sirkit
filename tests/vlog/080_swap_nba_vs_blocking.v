// Swapping on a clock edge: two non-blocking always blocks swap, blocking in one block does not
`timescale 1ns/1ns
module tb;
  reg clk;
  reg [3:0] a, b;       // swapped with <= in two blocks
  reg [3:0] c, d;       // "swapped" with = in one block (wrong)
  reg [3:0] e, f, t;    // swapped with = through a temporary
  reg [3:0] g, h;       // swapped with <= in one block

  always @(posedge clk) a <= b;
  always @(posedge clk) b <= a;
  always @(posedge clk) begin c = d; d = c; end
  always @(posedge clk) begin t = e; e = f; f = t; end
  always @(posedge clk) begin g <= h; h <= g; end

  initial begin
    $dumpfile("080.vcd");
    $dumpvars(0, tb);
    clk = 0;
    a = 4'd1; b = 4'd2; c = 4'd3; d = 4'd4; e = 4'd5; f = 4'd6; g = 4'd7; h = 4'd8;
    repeat (3) begin
      #5 clk = 1;
      #1 $display("%0t a=%0d b=%0d | c=%0d d=%0d | e=%0d f=%0d | g=%0d h=%0d", $time, a, b, c, d, e, f, g, h);
      #4 clk = 0;
    end
    $finish;
  end
endmodule
