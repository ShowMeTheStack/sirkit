// $dumpvars(1, tb): only the top scope's signals are dumped
module inner (input clk, input [3:0] d, output reg [3:0] q);
  reg [3:0] hidden;
  always @(posedge clk) begin
    hidden <= d ^ 4'b1010;
    q <= hidden;
  end
endmodule

module outer (input clk, input [3:0] d, output [3:0] q);
  wire [3:0] mid;
  inner i0 (.clk(clk), .d(d), .q(mid));
  inner i1 (.clk(clk), .d(mid), .q(q));
endmodule

module tb;
  reg clk;
  reg [3:0] d;
  wire [3:0] q;
  outer u (.clk(clk), .d(d), .q(q));
  initial begin
    $dumpfile("185.vcd");
    $dumpvars(1, tb);
    clk = 0; d = 4'h3;
    repeat (8) begin
      #5 clk = 1;
      #5 clk = 0; d = d + 5;
    end
    $display("q=%h", q);
    $finish;
  end
  always @(q) $display("t=%0t q=%h", $time, q);
endmodule
