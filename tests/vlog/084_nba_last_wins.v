// Several non-blocking assignments to one variable in a step: the last scheduled wins
`timescale 1ns/1ns
module tb;
  reg clk;
  reg [7:0] acc, cnt, sel;
  reg [7:0] arr [0:3];
  integer i;

  always @(posedge clk) begin
    cnt <= cnt + 8'd1;
    cnt <= cnt + 8'd1;      // still +1, not +2: both read the old cnt
    acc <= 8'd0;
    if (cnt[0]) acc <= cnt; // overrides the default
    sel <= 8'hFF;
    for (i = 0; i < 4; i = i + 1)
      if (i <= cnt) sel <= i;
  end

  always @(posedge clk)
    for (i = 0; i < 4; i = i + 1)
      arr[i] <= arr[i] + cnt;

  initial begin
    $dumpfile("084.vcd");
    $dumpvars(0, tb);
    clk = 0; cnt = 0; acc = 0; sel = 0;
    for (i = 0; i < 4; i = i + 1) arr[i] = i * 10;
    repeat (5) begin
      #5 clk = 1;
      #5 clk = 0;
      $display("%0t cnt=%0d acc=%0d sel=%0d arr=%0d,%0d,%0d,%0d", $time, cnt, acc, sel,
               arr[0], arr[1], arr[2], arr[3]);
    end
    $finish;
  end
endmodule
