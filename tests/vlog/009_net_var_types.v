`timescale 1ns/100ps
module tb;
  wire w;
  wire [7:0] wv;
  reg r;
  reg [7:0] rv;
  integer i;
  time t;
  reg signed [7:0] sr;
  wand wa;
  wor wo;
  tri [3:0] tb4;
  assign wa = 1'b1;
  assign wa = r;
  assign wo = 1'b0;
  assign wo = r;
  assign wv = rv + 1;
  initial begin
    $dumpfile("009.vcd");
    $dumpvars(0, tb);
    $display("init w=%b wv=%b r=%b rv=%b i=%b t=%0d sr=%b tb4=%b", w, wv, r, rv, i, t, sr, tb4);
    #1;
    $display("after #1 wv=%b wa=%b wo=%b", wv, wa, wo);
    r = 0; rv = 8'd254; i = -1; t = 64'd5000000000; sr = -8'sd1;
    #1;
    $display("r=0 wa=%b wo=%b wv=%d", wa, wo, wv);
    $display("i=%d i=%h i=%0d t=%0d t=%h sr=%d", i, i, i, t, t, sr);
    r = 1;
    #1 $display("r=1 wa=%b wo=%b", wa, wo);
    rv = 8'hFF;
    #1 $display("wv=%d", wv);
    i = 32'h7FFFFFFF; i = i + 1;
    $display("i overflow=%0d", i);
    t = 0; t = t - 1;
    $display("time wrap=%0d", t);
    $display("%t %0t", $time, $time);
    $finish;
  end
endmodule
