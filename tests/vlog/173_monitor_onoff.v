// $monitoroff / $monitoron, replacing a monitor, changes within one step
module tb;
  reg [7:0] a, b;
  initial begin
    $dumpfile("173.vcd");
    $dumpvars(0, tb);
    a = 0; b = 0;
    $monitor("M1 t=%0t a=%0d", $time, a);
    #1 a = 1;
    #1 a = 2; a = 3; a = 4;
    #1 a = 4;
    #1 b = 9;
    #1 $monitoroff;
    #1 a = 5;
    #1 a = 6;
    #1 $monitoron;
    #1 a = 7;
    #1 $monitor("M2 t=%0t a=%0d b=%0d", $time, a, b);
    #1 b = 10;
    #1 a = 8; b = 11;
    #1 a = 8;
    #1 $finish;
  end
endmodule
