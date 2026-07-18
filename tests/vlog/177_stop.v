// $stop ends the run when the simulator is not interactive
module tb;
  reg [3:0] n;
  initial begin
    $dumpfile("177.vcd");
    $dumpvars(0, tb);
    n = 0;
    repeat (5) begin
      #2 n = n + 3;
      $display("t=%0t n=%0d", $time, n);
    end
    #1 $stop;
    $display("after stop (should not appear)");
    $finish;
  end
  always @(n) if (n > 10) $strobe("big n=%0d at %0t", n, $time);
endmodule
