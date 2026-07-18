// Tasks containing delays and non-blocking writes, called from several processes
`timescale 1ns/1ns
module tb;
  reg [7:0] bus;
  reg       valid;
  reg [7:0] log0, log1;

  task send;
    input [7:0] val;
    input integer hold;
    begin
      bus <= val;
      valid <= 1'b1;
      #(hold);
      valid <= 1'b0;
      #1;
    end
  endtask

  task pulse_wait;
    output [7:0] got;
    begin
      @(posedge valid);
      #0 got = bus;            // read after the whole NBA batch
    end
  endtask

  initial begin
    $dumpfile("096.vcd");
    $dumpvars(0, tb);
    bus = 0; valid = 0;
    #2 send(8'hA1, 3);
    send(8'h5C, 1);
    #4 send(8'h0F, 2);
    $display("%0t sender done bus=%h valid=%b", $time, bus, valid);
  end

  initial begin
    pulse_wait(log0);
    $display("%0t got %h", $time, log0);
    pulse_wait(log1);
    $display("%0t got %h", $time, log1);
    @(negedge valid) $display("%0t valid fell, bus=%h", $time, bus);
    #20 $finish;
  end
endmodule
