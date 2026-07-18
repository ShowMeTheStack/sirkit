`timescale 1ns/1ns
module tb;
  reg [7:0] a, b, c;
  event go;

  initial begin
    $dumpfile("106.vcd");
    $dumpvars(0, tb);
    a = 0; b = 0; c = 0;
    fork
      #10 a = 1;
      #5 b = 2;
      #15 c = 3;
    join
    $display("t=%0t a=%0d b=%0d c=%0d", $time, a, b, c);
    fork
      begin
        #2 a = 10;
        #2 a = 11;
      end
      begin
        fork
          #1 b = 20;
          #6 b = 21;
        join
        #1 c = 30;
      end
    join
    $display("t=%0t a=%0d b=%0d c=%0d", $time, a, b, c);
    fork : named
      begin : left
        #3 $display("t=%0t in %m", $time);
      end
      begin : right
        #4 $display("t=%0t in %m", $time);
      end
    join
    fork
      @go $display("t=%0t got go", $time);
      #7 -> go;
    join
    fork
    join
    $display("t=%0t empty fork ok", $time);
    begin : seq
      fork
        #2 a = a + 1;
        #2 b = b + 1;
      join
      fork
        #1 c = a + b;
      join
    end
    $display("t=%0t a=%0d b=%0d c=%0d", $time, a, b, c);
    $finish;
  end
endmodule
