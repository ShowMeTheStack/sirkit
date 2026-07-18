// repeat event control, intra-assignment event controls, and event counting
`timescale 1ns/1ns
module tb;
  reg clk;
  reg [7:0] cnt, cap1, cap2, cap3;

  initial clk = 0;
  always #5 clk = ~clk;

  always @(posedge clk) cnt <= cnt + 8'd1;

  initial begin
    $dumpfile("078.vcd");
    $dumpvars(0, tb);
    cnt = 0;
    repeat (3) @(posedge clk);
    $display("%0t after 3 edges cnt=%0d", $time, cnt);
    cap1 = repeat (2) @(posedge clk) cnt;   // samples now, assigns 2 edges later
    $display("%0t cap1=%0d cnt=%0d", $time, cap1, cnt);
    cap2 <= repeat (2) @(negedge clk) cnt;  // non-blocking: process continues
    $display("%0t cap2=%b (not yet)", $time, cap2);
    @(negedge clk) #1 $display("%0t cap2=%b", $time, cap2);
    @(negedge clk) #1 $display("%0t cap2=%0d", $time, cap2);
    cap3 = @(posedge clk) cnt;
    $display("%0t cap3=%0d cnt=%0d", $time, cap3, cnt);
    #1 $display("%0t cnt=%0d", $time, cnt);
    $finish;
  end
endmodule
