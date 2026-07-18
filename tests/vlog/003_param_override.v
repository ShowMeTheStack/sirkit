module counter #(parameter WIDTH = 4, parameter STEP = 1, parameter [WIDTH-1:0] INIT = 0)
  (input clk, input rst, output reg [WIDTH-1:0] q);
  always @(posedge clk)
    if (rst) q <= INIT;
    else q <= q + STEP;
endmodule

module tb;
  reg clk = 0, rst = 1;
  wire [3:0] q0;
  wire [7:0] q1;
  wire [5:0] q2;
  wire [2:0] q3;
  counter c0 (clk, rst, q0);
  counter #(8, 3) c1 (clk, rst, q1);
  counter #(.STEP(5), .WIDTH(6), .INIT(6'd60)) c2 (.clk(clk), .rst(rst), .q(q2));
  counter #(.WIDTH(3)) c3 (.q(q3), .rst(rst), .clk(clk));
  always #5 clk = ~clk;
  initial begin
    $dumpfile("003.vcd");
    $dumpvars(0, tb);
    #12 rst = 0;
    repeat (6) begin
      @(negedge clk);
      $display("%0t q0=%0d q1=%0d q2=%0d q3=%0d", $time, q0, q1, q2, q3);
    end
    $display("wrap q2=%b q3=%b", q2 + 6'd0, q3 + 3'd7);
    $finish;
  end
endmodule
