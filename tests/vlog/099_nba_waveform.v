// A waveform built up front with delayed non-blocking writes, plus $time formats
`timescale 1ns/1ns
module tb;
  reg [3:0] w;
  reg       s;
  integer i;

  initial begin
    $dumpfile("099.vcd");
    $dumpvars(0, tb);
    $timeformat(-9, 1, " ns", 9);
    #1 w = 0; s = 0;
    for (i = 1; i <= 6; i = i + 1)
      w <= #(i * 3) i;             // scheduled now, applied at 4, 7, ..., 19
    for (i = 0; i < 4; i = i + 1) begin
      s <= #(i * 4 + 1) 1'b1;
      s <= #(i * 4 + 3) 1'b0;
    end
    s <= #9 1'bx;                 // collides with the 1 for the same time: issued later, wins
    $display("%t scheduled in %m, w=%0d s=%b", $time, w, s);
  end

  initial #1 $monitor("%t w=%0d s=%b", $time, w, s);

  initial #25 $finish;
endmodule
