// Named events: trigger with ->, wait with @, several waiters, events in or-lists
module tb;
  event start, stop, tick;
  integer a_hits, b_hits, any_hits;
  reg [7:0] data;

  initial begin a_hits = 0; b_hits = 0; any_hits = 0; data = 0; end

  always @(start) begin
    a_hits = a_hits + 1;
    $display("%0t A saw start, data=%0d", $time, data);
  end

  always @(tick) begin
    b_hits = b_hits + 1;
    data = data + 8'd3;
  end

  always @(start or stop) any_hits = any_hits + 1;

  initial begin
    #1 -> start;
    #1 data = 8'd10;
    #1 -> start;
    #1 repeat (4) begin -> tick; #1; end
    $display("%0t after ticks data=%0d", $time, data);
    -> stop;
    #1 -> stop;
    -> tick;
    #1 $display("hits: A=%0d B=%0d any=%0d data=%0d", a_hits, b_hits, any_hits, data);
    fork
      begin @(tick) $display("%0t forked waiter woke", $time); end
      begin #3 -> tick; end
    join
    #1 $display("final data=%0d B=%0d", data, b_hits);
    $finish;
  end
endmodule
