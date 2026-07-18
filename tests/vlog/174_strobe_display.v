// $display sees values before nonblocking updates, $strobe sees final values
module tb;
  reg [7:0] r, s;
  reg clk;
  initial begin
    $dumpfile("174.vcd");
    $dumpvars(0, tb);
    r = 1; s = 100; clk = 0;
    #1;
    r <= 2;
    s = s + 1;
    $display("display: r=%0d s=%0d", r, s);
    $strobe("strobe:  r=%0d s=%0d", r, s);
    #1;
    r <= r + 5;
    r = 50;
    $display("display2: r=%0d", r);
    $strobe("strobe2:  r=%0d", r);
    #1;
    $strobe("strobe3 at %0t: r=%0d", $time, r);
    r = 60;
    #0 r = 61;
    $display("display3: r=%0d", r);
    #1 clk = 1;
    #1 $finish;
  end
  always @(posedge clk) begin
    s <= s * 2;
    $display("edge display s=%0d", s);
    $strobe("edge strobe s=%0d", s);
  end
endmodule
