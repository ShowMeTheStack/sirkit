// Named-event triggers run waiters in the active region, before pending NBA updates
module tb;
  reg [7:0] r, s;
  event e1, e2;

  always @(e1) $display("t=%0t e1 waiter: r=%0d s=%0d", $time, r, s);

  always @(e2) begin
    $display("t=%0t e2 waiter: r=%0d", $time, r);
    #0 $display("t=%0t e2 waiter after #0: r=%0d", $time, r);
    $strobe("t=%0t e2 strobe: r=%0d", $time, r);
  end

  initial begin
    r = 0; s = 0;
    #1;
    r <= 8'd5;
    s = 8'd7;
    -> e1;                       // waiter sees s=7 but r still 0
    #1;
    r <= 8'd6;
    -> e2;
    #1;
    r <= 8'd9;
    #0 -> e1;                    // still before the NBA
    #1;
    fork
      r <= 8'd1;
      @(r) $display("t=%0t fork saw r change to %0d", $time, r);
    join
    $display("t=%0t joined r=%0d", $time, r);
    #1 $finish;
  end
endmodule
