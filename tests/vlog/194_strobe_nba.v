// $strobe in clocked logic sees the values after all nonblocking updates
module tb;
  reg clk;
  reg [3:0] a, b, c;
  initial begin
    $dumpfile("194.vcd");
    $dumpvars(0, tb);
    clk = 0; a = 1; b = 2; c = 3;
    repeat (4) #5 clk = ~clk;
    #5 clk = ~clk;
    #1 $finish;
  end
  // rotate a -> b -> c -> a each rising edge
  always @(posedge clk) begin
    a <= c;
    b <= a;
    c <= b;
    $display("disp   %0t: %0d %0d %0d", $time, a, b, c);
    $strobe("strobe %0t: %0d %0d %0d", $time, a, b, c);
  end
  always @(negedge clk) $write("neg %0t\n", $time);
endmodule
