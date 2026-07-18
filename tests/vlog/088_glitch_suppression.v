// Zero-time glitches: intermediate values inside a step are invisible to $strobe and the VCD
`timescale 1ns/1ns
module tb;
  reg a, b;
  reg [3:0] y;
  reg flag;
  wire n, g;

  assign n = ~a;
  assign g = a & n;            // logically always 0 once settled

  always @(a or b) begin
    y = 4'd0;                  // default first
    if (a) y = y + 4'd1;
    if (b) y = y + 4'd2;
    if (a & b) y = 4'hF;
  end

  task show;
    $strobe("%0t a=%b b=%b y=%h flag=%b g=%b n=%b", $time, a, b, y, flag, g, n);
  endtask

  initial begin
    $dumpfile("088.vcd");
    $dumpvars(0, tb);
    #1 a = 0; b = 0; flag = 0; show;
    #4 a = 1; show;
    #5 b = 1; show;
    #5 a = 0; show;
    #5 flag = 1; flag = 0; flag = 1; flag = 0; show;   // zero-width pulses
    #5 b = 0; a = 1; show;
    #5 flag = 1; flag <= 0;
    $display("%0t flag=%b during the step", $time, flag);
    show;
    #5 a = 0; a = 1; show;
    #5 flag = 0; flag <= 1; flag = 0; show;
    #5 $finish;
  end
endmodule
