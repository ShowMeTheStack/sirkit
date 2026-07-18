// Four-phase request/acknowledge between two processes using wait and non-blocking writes
`timescale 1ns/1ns
module tb;
  reg req, ack;
  reg [7:0] data, received;
  reg [7:0] items [0:3];
  integer k, sum;

  // producer
  initial begin
    items[0] = 8'd12; items[1] = 8'd200; items[2] = 8'd7; items[3] = 8'd255;
    req = 0; data = 8'hxx;
    for (k = 0; k < 4; k = k + 1) begin
      #2 data <= items[k];
      req <= 1'b1;
      wait (ack);
      $display("%0t producer: ack seen for %0d", $time, data);
      #1 req <= 1'b0;
      data <= 8'hzz;
      wait (!ack);
    end
    #3 $display("%0t sum=%0d", $time, sum);
    $finish;
  end

  // consumer: responds with fixed latencies
  initial begin
    ack = 0; sum = 0;
    forever begin
      @(posedge req);
      received = data;          // req and data were written in one NBA batch
      #3 ack <= 1'b1;
      sum = sum + received;
      $display("%0t consumer: took %0d (%h) %b", $time, received, received, data);
      wait (!req) #1 ack <= 1'b0;
    end
  end

  initial begin
    $dumpfile("098.vcd");
    $dumpvars(0, tb);
  end
endmodule
