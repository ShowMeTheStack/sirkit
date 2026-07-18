`timescale 10ns/1ns
module tb;
  reg clk;
  integer count;
  reg [3:0] st;

  initial begin
    clk = 0;
    forever #1 clk = ~clk;
  end

  initial begin : counter
    count = 0;
    forever @(posedge clk) begin
      count = count + 1;
    end
  end

  task slow_job;
    output [3:0] s;
    begin
      s = 1;
      #4 s = 2;
      #4 s = 3;
      #4 s = 4;
    end
  endtask

  initial begin
    $dumpfile("105.vcd");
    $dumpvars(0, tb);
    #10 disable counter;
    $display("t=%0t stopped counter at %0d", $time, count);
    #10 $display("t=%0t count still %0d", $time, count);
    st = 0;
    fork
      slow_job(st);
      #6 disable slow_job;
    join
    $display("t=%0t job cut short st=%0d", $time, st);
    fork : race_two
      begin #3 $display("t=%0t first branch done", $time); disable race_two; end
      begin #8 $display("never"); end
    join
    $display("t=%0t after race_two", $time);
    fork
      begin : waiter
        @(posedge clk);
        @(posedge clk);
        $display("waiter not printed");
      end
      begin
        #0.5 disable waiter;
        $display("t=%0t waiter disabled", $time);
      end
    join
    $display("t=%0t done", $time);
    $finish;
  end
endmodule
