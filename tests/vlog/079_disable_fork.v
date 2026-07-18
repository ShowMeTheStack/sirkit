// fork/join timing, named blocks and disable
`timescale 1ns/1ns
module tb;
  reg [7:0] x;
  integer i;

  initial begin
    $dumpfile("079.vcd");
    $dumpvars(0, tb);
    x = 0;
    fork
      #10 x = x + 8'd1;
      #5  x = x + 8'd10;
      #20 $display("%0t fork branch 3, x=%0d", $time, x);
    join
    $display("%0t join done x=%0d", $time, x);

    begin : search
      for (i = 0; i < 100; i = i + 1) begin
        #1;
        if (i * i > 50) begin
          $display("%0t found i=%0d", $time, i);
          disable search;
        end
      end
      $display("never printed");
    end
    $display("%0t after search i=%0d", $time, i);

    fork : race_two
      begin #7 $display("%0t slow branch", $time); end
      begin #3 $display("%0t fast branch wins", $time); disable race_two; end
    join
    $display("%0t after disable of fork", $time);
    #10 $display("%0t end, x=%0d", $time, x);
    $finish;
  end

  initial begin : watcher
    forever begin
      @(x);
      $display("%0t watcher sees x=%0d", $time, x);
      if (x > 8'd10) disable watcher;
    end
  end
endmodule
