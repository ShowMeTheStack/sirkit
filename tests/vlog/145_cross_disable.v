module worker (input clk, output reg [7:0] count, output reg active);
  initial begin
    count = 0;
    active = 0;
  end
  always @(posedge clk) begin : work
    active = 1;
    count = count + 1;
    #12 count = count + 100;
    active = 0;
  end
endmodule

module tb;
  reg clk;
  wire [7:0] count;
  wire active;
  event stop_it, ping;
  integer pings;
  worker w (.clk(clk), .count(count), .active(active));
  initial begin
    clk = 0;
    forever #10 clk = ~clk;
  end
  always @(stop_it) begin
    disable w.work;
    $display("t=%0t disabled worker count=%0d active=%b", $time, count, active);
  end
  initial begin
    pings = 0;
    forever begin : listen
      @(ping) pings = pings + 1;
    end
  end
  initial begin
    $dumpfile("145.vcd");
    $dumpvars(0, tb);
    #25 $display("t=%0t count=%0d active=%b", $time, count, active);
    #10 $display("t=%0t count=%0d active=%b", $time, count, active);
    #20 -> stop_it;
    #1 $display("t=%0t count=%0d active=%b", $time, count, active);
    #30 $display("t=%0t count=%0d active=%b", $time, count, active);
    -> ping;
    #1 -> ping;
    #1 -> ping;
    #1 $display("pings=%0d", pings);
    $finish;
  end
endmodule
