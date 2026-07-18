// $dumpvars with no arguments dumps everything; $dumpoff / $dumpon
module toggler (input clk, output reg t);
  initial t = 0;
  always @(posedge clk) t <= ~t;
endmodule

module tb;
  reg clk;
  reg [5:0] n;
  wire t;
  toggler tg (.clk(clk), .t(t));
  initial begin
    $dumpfile("198.vcd");
    $dumpvars;
    clk = 0; n = 0;
    #22 $dumpoff;
    #20 $dumpon;
    #20 $display("done n=%0d t=%b", n, t);
    $finish;
  end
  always #3 clk = ~clk;
  always @(negedge clk) n <= n + 1;
endmodule
