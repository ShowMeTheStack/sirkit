// Delayed non-blocking assignments: ordering at the target time against blocking writes
`timescale 1ns/1ns
module tb;
  reg [7:0] q, p;

  initial begin
    $dumpfile("085.vcd");
    $dumpvars(0, tb);
    q = 0; p = 0;
    #1;
    q <= #3 8'd5;
    q <= #3 8'd6;            // same target time: the later one wins
    q <= #5 8'd7;
    q <= #2 8'd8;            // matures first
    p <= #4 8'd1;
  end

  initial begin
    #3 $display("t=%0t q=%0d", $time, q);
    #1 q = 8'd99;            // time 4: blocking write, NBA of the same step comes after
    $display("t=%0t q=%0d after blocking", $time, q);
    $strobe("t=%0t strobe q=%0d", $time, q);
    #1 $display("t=%0t q=%0d p=%0d", $time, q, p);
    p = 8'd50;               // the NBA to p for time 5 still lands after this
    $strobe("t=%0t strobe p=%0d", $time, p);
    #1 $display("t=%0t q=%0d p=%0d", $time, q, p);
    $strobe("t=%0t strobe q=%0d", $time, q);
    #2 $finish;
  end
endmodule
