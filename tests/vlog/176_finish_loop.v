// $finish from inside a loop and from an always block; later events never run
module tb;
  reg clk;
  reg [7:0] count;
  integer i;
  initial begin
    $dumpfile("176.vcd");
    $dumpvars(0, tb);
    clk = 0; count = 0;
    for (i = 0; i < 1000; i = i + 1) begin
      #3 clk = ~clk;
    end
    $display("loop finished (should not appear)");
  end
  always @(posedge clk) begin
    count <= count + 1;
    $display("t=%0t count=%0d", $time, count);
    if (count == 6) begin
      $display("stopping at %0t", $time);
      $finish;
    end
  end
  initial #1000 $display("late initial (should not appear)");
endmodule
