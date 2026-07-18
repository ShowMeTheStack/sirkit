// Intra-assignment event controls and event controls on expressions
module tb;
  reg clk, a;
  reg [3:0] q, w, cnt;
  initial begin
    $dumpfile("207.vcd");
    $dumpvars(0, tb);
    clk = 0; a = 0; q = 0; w = 0; cnt = 0;
    forever #5 clk = ~clk;
  end
  initial begin
    #1 q = @(posedge clk) 4'd7;
    $display("%0t blocking intra event: q=%0d", $time, q);
    w <= @(negedge clk) 4'd9;
    $display("%0t nba scheduled, w=%0d", $time, w);
    @(w) $display("%0t w became %0d", $time, w);
    w <= repeat (3) @(posedge clk) 4'd3;
    @(w) $display("%0t after three edges w=%0d", $time, w);
    #2 $finish;
  end
  always @(cnt[1] or q[0]) $display("%0t cnt[1]=%b q[0]=%b", $time, cnt[1], q[0]);
  always @(negedge clk) #1 cnt <= cnt + 1;
endmodule
