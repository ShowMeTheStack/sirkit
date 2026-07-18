// wait (level-sensitive) versus @ (edge): wait does not block if already true
`timescale 1ns/1ns
module tb;
  reg ready, go;
  reg [3:0] count;
  integer log;

  initial begin
    ready = 0; go = 0; count = 0; log = 0;
  end

  initial begin
    #2;
    wait (ready);
    $display("%0t first wait passed", $time);
    wait (ready);
    $display("%0t second wait passed at once", $time);
    @(ready);
    $display("%0t @ waited for a change, ready=%b", $time, ready);
    wait (count == 4'd5);
    $display("%0t count reached %0d", $time, count);
    wait (count > 4'd9 && go);
    $display("%0t count=%0d go=%b", $time, count, go);
  end

  initial begin
    #5 ready = 1;
    #5 ready = 0;
    repeat (12) #1 count = count + 1;
    #3 go = 1;
    #3 ready = 1'bx;
    #1 $display("%0t done count=%0d", $time, count);
    $finish;
  end

  initial begin
    $dumpfile("074.vcd");
    $dumpvars(0, tb);
  end
endmodule
