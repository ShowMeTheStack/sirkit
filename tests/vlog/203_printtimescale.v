// $printtimescale and %t across modules with different time units
`timescale 1us/10ns
module slow;
  initial begin
    $printtimescale;
    #2 $display("slow at %t (%0d units)", $time, $time);
  end
endmodule
`timescale 1ns/1ps
module tb;
  slow s();
  initial begin
    $printtimescale;
    $printtimescale(tb.s);
    #1500 $display("tb at %t (%0d units)", $time, $time);
    #0.5 $display("half: %t %0.3f", $realtime, $realtime);
  end
endmodule
