// $monitor with expressions and formats, NBA changes, a second $monitor replaces the first
module tb;
  reg clk, rst;
  reg [7:0] acc;
  reg [2:0] sel;
  wire [7:0] shifted = acc << sel;
  wire [8:0] sum = acc + sel;
  initial begin
    $dumpfile("190.vcd");
    $dumpvars(0, tb);
    clk = 0; rst = 1; acc = 0; sel = 0;
    $monitor("%t: rst=%b acc=%h sel=%0d shifted=%b sum=%0d", $time, rst, acc, sel, shifted, sum);
    #7 rst = 0;
    #30 sel = 3;
    #20 sel = 3'bx;
    #10 $monitor("second: acc=%0d", acc);
    #25 $finish;
  end
  always #5 clk = ~clk;
  always @(posedge clk)
    if (rst) acc <= 0;
    else acc <= acc + 8'd7;
endmodule
