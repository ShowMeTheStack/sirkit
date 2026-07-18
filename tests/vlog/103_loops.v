module tb;
  integer i, j, n, sum;
  reg [7:0] r;
  reg clk;
  integer ticks;

  initial begin
    clk = 0;
    ticks = 0;
    forever begin
      #5 ticks = ticks + 1;
      clk = ~clk;
    end
  end

  initial begin
    $dumpfile("103.vcd");
    $dumpvars(0, tb);
    sum = 0;
    for (i = 1; i <= 10; i = i + 1) sum = sum + i;
    $display("for sum=%0d i=%0d", sum, i);
    sum = 0;
    for (i = 10; i > 0; i = i - 3) begin
      $write("%0d ", i);
      sum = sum + i;
    end
    $display("| sum=%0d", sum);
    n = 27; j = 0;
    while (n != 1) begin
      if (n % 2) n = 3 * n + 1; else n = n / 2;
      j = j + 1;
    end
    $display("collatz 27 steps=%0d", j);
    n = 0;
    while (n > 5) n = n + 1;
    $display("while skipped n=%0d", n);
    r = 8'h01;
    repeat (5) r = r << 1 | r[7];
    $display("repeat r=%b", r);
    n = 3;
    repeat (n) begin
      n = n + 1;
      $write("n=%0d ", n);
    end
    $display("");
    repeat (-2) $display("never");
    repeat (1'bx) $display("never x");
    for (i = 0; i < 3; i = i + 1)
      for (j = 0; j < i; j = j + 1)
        $display("pair %0d %0d", i, j);
    r = 0;
    for (r = 250; r != 4; r = r + 3) ;
    $display("wrap r=%0d", r);
    repeat (3) @(posedge clk);
    $display("after 3 posedges t=%0t ticks=%0d", $time, ticks);
    @(negedge clk) $display("negedge t=%0t", $time);
    wait (ticks == 12) $display("wait done t=%0t", $time);
    $finish;
  end
endmodule
