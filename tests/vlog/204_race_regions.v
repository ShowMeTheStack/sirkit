// The order of regions in one time step: active, inactive (#0), non-blocking, postponed
module tb;
  reg [7:0] a, b, c;
  reg clk;
  initial begin
    clk = 0; a = 1; b = 1; c = 1;
    #10;
    a <= 2;
    b = 3;
    #0 $display("after #0: a=%0d b=%0d c=%0d", a, b, c);
    $strobe("strobe: a=%0d b=%0d c=%0d", a, b, c);
    c <= a + b;
    $display("active: a=%0d b=%0d c=%0d", a, b, c);
    #1 $display("next step: a=%0d b=%0d c=%0d", a, b, c);
    a <= 10; a <= 11; a = 12;
    $display("blocking wins until the NBA lands: a=%0d", a);
    #1 $display("last NBA wins: a=%0d", a);
    b <= #2 50;
    b <= #1 40;
    #1 $display("t+1 b=%0d", b);
    #1 $display("t+2 b=%0d", b);
    clk = 1;
    #0 $display("#0 after clk: c=%0d", c);
  end
  always @(posedge clk) c <= c + 100;
  always @(c) $display("c changed to %0d at %0t", c, $time);
endmodule
