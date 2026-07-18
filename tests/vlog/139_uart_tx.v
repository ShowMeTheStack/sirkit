`timescale 1ns/1ns
module uart_tx #(parameter DIV = 4) (input clk, input rst, input send, input [7:0] data,
  output reg tx, output busy);
  reg [9:0] frame;
  reg [3:0] nbits;
  reg [7:0] tick;
  assign busy = (nbits != 0);
  always @(posedge clk) begin
    if (rst) begin tx <= 1; nbits <= 0; tick <= 0; end
    else if (!busy) begin
      if (send) begin frame <= {1'b1, data, 1'b0}; nbits <= 10; tick <= 0; end
    end else if (tick == DIV - 1) begin
      tick <= 0;
      tx <= frame[0];
      frame <= frame >> 1;
      nbits <= nbits - 1;
    end else tick <= tick + 1;
  end
endmodule

module uart_rx_model (input line);
  parameter BIT = 40;
  reg [7:0] got;
  integer k;
  always begin
    @(negedge line);
    #(BIT + BIT / 2);
    for (k = 0; k < 8; k = k + 1) begin
      got[k] = line;
      #BIT;
    end
    $display("t=%0t rx byte %h '%c' stop=%b", $time, got, got, line);
  end
endmodule

module tb;
  reg clk, rst, send;
  reg [7:0] data;
  wire tx, busy;
  uart_tx #(.DIV(4)) t (.clk(clk), .rst(rst), .send(send), .data(data), .tx(tx), .busy(busy));
  uart_rx_model #(.BIT(40)) r (.line(tx));
  always #5 clk = ~clk;
  task put;
    input [7:0] c;
    begin
      @(negedge clk) begin data = c; send = 1; end
      @(negedge clk) send = 0;
      wait (!busy);
    end
  endtask
  initial begin
    $dumpfile("139.vcd");
    $dumpvars(0, tb);
    clk = 0; rst = 1; send = 0; data = 0;
    #20 rst = 0;
    put("O");
    put("k");
    put(8'h7E);
    #100 $finish;
  end
endmodule
