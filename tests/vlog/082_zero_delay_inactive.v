// #0 moves a process to the inactive region: after all active events, before NBA updates
module tb;
  reg [7:0] a, b, q, seen0, seen00, seen_nba;

  initial begin
    a = 0; b = 0; q = 0;
  end

  // writer: sets a at time 5
  initial #5 a = 8'd11;

  // reader: also at time 5 but delayed by #0, so sees the writer's value
  initial begin
    #5 #0 seen0 = a;
    $display("t=%0t after #0 a=%0d", $time, seen0);
  end

  // NBA and #0 in the same process
  initial begin
    #10;
    q <= 8'd42;
    b = 8'd1;
    #0 seen00 = q;
    $display("t=%0t after #0 q=%0d b=%0d (NBA pending)", $time, seen00, b);
    #0 $display("t=%0t after second #0 q=%0d", $time, q);
    @(q) seen_nba = q;
    $display("t=%0t woke on q change q=%0d", $time, seen_nba);
    $strobe("t=%0t strobe q=%0d", $time, q);
  end

  // a #0 chain from another process lands in the same step
  initial begin
    #10 #0 #0 #0 $display("t=%0t triple #0 sees q=%0d b=%0d", $time, q, b);
    #1  $display("t=%0t next step q=%0d", $time, q);
    $finish;
  end
endmodule
