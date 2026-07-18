`timescale 1ns/1ps
module tb;
  reg clk, sda, scl;
  reg [7:0] rx;
  reg [7:0] bus;
  reg valid;

  initial begin
    clk = 0;
    forever #5 clk = ~clk;
  end

  task send_byte;
    input [7:0] b;
    integer k;
    begin
      for (k = 7; k >= 0; k = k - 1) begin
        @(negedge clk) sda = b[k];
        scl = 1;
        #2 scl = 0;
      end
      @(negedge clk) sda = 1'bz;
    end
  endtask

  task bus_write;
    input [7:0] v;
    begin
      @(negedge clk);
      bus = v;
      valid = 1;
      @(negedge clk);
      valid = 0;
      bus = 8'bz;
    end
  endtask

  task wait_cycles;
    input integer n;
    repeat (n) @(posedge clk);
  endtask

  always @(posedge scl) rx <= {rx[6:0], sda};
  always @(posedge clk) if (valid) $display("%t bus=%h", $time, bus);

  initial begin
    $dumpfile("111.vcd");
    $dumpvars(0, tb);
    sda = 1'bz; scl = 0; rx = 0; valid = 0; bus = 8'bz;
    send_byte(8'hA5);
    $display("%t rx=%h", $time, rx);
    send_byte(8'h3C);
    $display("%t rx=%h", $time, rx);
    bus_write(8'h11);
    bus_write(8'h22);
    wait_cycles(3);
    $display("%t after wait", $time);
    #0.25 $display("%t %t fractional", $time, $realtime);
    #1.5;
    $display("%t %t done", $time, $realtime);
    $finish;
  end
endmodule
