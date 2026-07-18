// $dumpvars with several scopes and levels, and single signals
module bitcell (input clk, input in, output reg out);
  reg state;
  initial begin state = 0; out = 0; end
  always @(posedge clk) begin
    state <= in;
    out <= state ^ in;
  end
endmodule

module chain (input clk, input in, output out);
  wire m;
  bitcell c0 (clk, in, m);
  bitcell c1 (clk, m, out);
endmodule

module tb;
  reg clk, in;
  wire o1, o2;
  reg [7:0] pattern;
  integer i;
  chain ch_a (clk, in, o1);
  chain ch_b (clk, o1, o2);
  initial begin
    $dumpfile("186.vcd");
    $dumpvars(2, tb.ch_a);
    $dumpvars(0, tb.ch_b.c1);
    $dumpvars(1, tb.clk, tb.pattern);
    clk = 0; in = 0; pattern = 8'b1011_0010;
    for (i = 7; i >= 0; i = i - 1) begin
      in = pattern[i];
      #4 clk = 1;
      #4 clk = 0;
      $display("t=%0t in=%b o1=%b o2=%b", $time, in, o1, o2);
    end
    $finish;
  end
endmodule
