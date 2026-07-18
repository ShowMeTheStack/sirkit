// $monitoroff/$monitoron and replacing the active monitor
module tb;
  reg [3:0] c;
  reg [7:0] d;

  initial begin
    c = 0; d = 8'h10;
    $monitor("M1 %0t c=%0d d=%h", $time, c, d);
    repeat (3) #1 c = c + 1;
    #1 $monitoroff;
    #1 c = 4'd9;
    #1 d = 8'h20;
    #1 $monitoron;            // prints at once with current values
    #1 c = 4'd9;              // no change
    #1 d = 8'h21;
    #1 $monitor("M2 %0t d=%b c=%h", $time, d, c);
    #1 c = 4'hA;
    #1 c = 4'hA; d = 8'h21;   // nothing changes
    #1 d = 8'bxxxx_0000;
    #1 d = 8'bzzzz_0000;
    #1 $finish;
  end
endmodule
