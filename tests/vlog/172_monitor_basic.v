// $monitor prints once per time step when any argument changes
module tb;
  reg clk;
  reg [3:0] cnt;
  reg en;
  initial begin
    $dumpfile("172.vcd");
    $dumpvars(0, tb);
    clk = 0; cnt = 0; en = 0;
    $monitor("t=%0t clk=%b en=%b cnt=%0d", $time, clk, en, cnt);
    #12 en = 1;
    #40 en = 0;
    #20 $finish;
  end
  always #5 clk = ~clk;
  always @(posedge clk) if (en) cnt <= cnt + 1;
endmodule
