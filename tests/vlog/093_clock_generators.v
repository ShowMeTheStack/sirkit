// Clock generation styles: always toggling, forever loops, uneven duty, divided clocks
`timescale 1ns/100ps
module tb;
  reg clk_a, clk_b, clk_c, div2, div4;
  integer ra, rb, rc, r2, r4;

  initial clk_a = 0;
  always #5 clk_a = ~clk_a;                 // period 10

  initial begin
    clk_b = 1;
    forever #3.5 clk_b = ~clk_b;           // period 7, starts high
  end

  always begin                               // period 8, 25% duty
    clk_c = 1; #2;
    clk_c = 0; #6;
  end

  initial begin div2 = 0; div4 = 0; end
  always @(posedge clk_a) div2 <= ~div2;
  always @(posedge div2)  div4 <= ~div4;

  initial begin ra = 0; rb = 0; rc = 0; r2 = 0; r4 = 0; end
  always @(posedge clk_a) if ($time > 0) ra = ra + 1;
  always @(posedge clk_b) if ($time > 0) rb = rb + 1;
  always @(posedge clk_c) if ($time > 0) rc = rc + 1;
  always @(posedge div2) if ($time > 0) r2 = r2 + 1;
  always @(posedge div4) if ($time > 0) r4 = r4 + 1;

  initial begin
    $dumpfile("093.vcd");
    $dumpvars(0, tb);
    #60.5 $display("%t rises: a=%0d b=%0d c=%0d div2=%0d div4=%0d", $realtime, ra, rb, rc, r2, r4);
    #39 $display("%t rises: a=%0d b=%0d c=%0d div2=%0d div4=%0d", $realtime, ra, rb, rc, r2, r4);
    $display("levels a=%b b=%b c=%b div2=%b div4=%b", clk_a, clk_b, clk_c, div2, div4);
    $finish;
  end
endmodule
