// $display runs immediately, $strobe and $monitor at the end of the time step
module tb;
  reg [7:0] x, y;

  initial begin
    x = 1; y = 1;
    #1;
    x = 2;
    $display("display1 t=%0t x=%0d y=%0d", $time, x, y);
    $strobe ("strobe1  t=%0t x=%0d y=%0d", $time, x, y);
    x <= 3;
    y = 5;
    $display("display2 t=%0t x=%0d y=%0d", $time, x, y);
    $strobe ("strobe2  t=%0t x=%0d y=%0d", $time, x, y);
    y <= 6;
    x = 4;
    $display("display3 t=%0t x=%0d y=%0d", $time, x, y);
    #1;
    $monitor("monitor  t=%0t x=%0d y=%0d", $time, x, y);
    x = 7;
    $display("display4 t=%0t x=%0d (monitor prints after)", $time, x);
    x <= 12;
    #1;
    x = 7; x = 8;                 // two changes in one step: monitor prints once
    #1;
    x = 8;                        // no change: nothing from monitor
    #1;
    x <= 10; x <= 11;
    $display("display5 t=%0t x=%0d", $time, x);
    #1 y <= 6;                    // same value: no monitor line
    #1 y <= 0;
    #1 $finish;
  end
endmodule
