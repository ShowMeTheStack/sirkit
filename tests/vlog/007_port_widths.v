module sink (input [7:0] d, output [7:0] e, output [3:0] f);
  assign e = d;
  assign f = d[7:4];
endmodule

module tb;
  reg [3:0] narrow;
  reg [11:0] wide;
  reg signed [3:0] sn;
  wire [7:0] e0, e1, e2;
  wire [3:0] f0, f1, f2;
  wire [1:0] cut;
  wire [5:0] big;
  sink a (narrow, e0, f0);
  sink b (.d(wide), .e(e1), .f(f1));
  sink c (.d(sn), .e(e2), .f(f2));
  sink d (.d(8'hA5), .e(big), .f(cut));
  initial begin
    $dumpfile("007.vcd");
    $dumpvars(0, tb);
    narrow = 4'b1011; wide = 12'hABC; sn = -4'sd3;
    #1 $display("e0=%b f0=%b", e0, f0);
    $display("e1=%h f1=%h", e1, f1);
    $display("e2=%b f2=%b", e2, f2);
    $display("big=%b cut=%b", big, cut);
    narrow = 4'bz1x0;
    #1 $display("e0=%b f0=%b", e0, f0);
  end
endmodule
