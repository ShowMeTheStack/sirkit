// Intra-assignment delay with blocking assignment: RHS sampled first, process waits
`timescale 1ns/1ns
module tb;
  reg [7:0] a, b, c, d;

  initial begin
    a = 8'd1; b = 8'd0; c = 8'd0; d = 8'd0;
    #10 a = 8'd20;
    #1  a = 8'd30;
    #20 a = 8'd40;
  end

  initial begin
    #5 b = #10 a;          // samples a=1 at 5, assigns at 15
    $display("%0t b=%0d a=%0d", $time, b, a);
    #5 b = a;              // plain: samples at 20
    $display("%0t b=%0d", $time, b);
  end

  initial begin
    #5 #11 c = a;          // delay first, then sample at 16
    $display("%0t c=%0d", $time, c);
    c = @(a) a + 8'd100;   // sample now, wait for change of a
    $display("%0t c=%0d a=%0d", $time, c, a);
  end

  initial begin
    d = #3 8'd7;
    $display("%0t d=%0d", $time, d);
    d = #0 d + 8'd1;
    $display("%0t d=%0d", $time, d);
  end

  initial begin
    $dumpfile("075.vcd");
    $dumpvars(0, tb);
    #50 $finish;
  end
endmodule
