module tb;
  reg [31:0] w;
  reg [0:31] bw;
  reg [7:0] byte_out;
  integer i;
  reg [2:0] sel;
  initial begin
    $dumpfile("011.vcd");
    $dumpvars(0, tb);
    w = 32'hDEADBEEF;
    bw = 32'hDEADBEEF;
    for (i = 0; i < 4; i = i + 1) begin
      byte_out = w[i*8 +: 8];
      $display("w[%0d +: 8]=%h  bw[%0d +: 8]=%h", i*8, byte_out, i*8, bw[i*8 +: 8]);
    end
    for (i = 31; i > 0; i = i - 8)
      $display("w[%0d -: 8]=%h  bw[%0d -: 8]=%h", i, w[i -: 8], i, bw[i -: 8]);
    w[4 +: 4] = 4'h0;
    w[31 -: 4] = 4'h1;
    $display("w=%h", w);
    sel = 3'd5;
    $display("w[sel +: 3]=%b w[sel -: 3]=%b", w[sel +: 3], w[sel -: 3]);
    $display("w[30 +: 4]=%b", w[30 +: 4]);
    $display("w[1 -: 4]=%b", w[1 -: 4]);
    sel = 3'bx1x;
    $display("w[x +: 4]=%b", w[sel +: 4]);
    i = 28;
    w[i +: 8] = 8'hFF;
    $display("w=%h", w);
    i = -2;
    w[i +: 4] = 4'b0000;
    $display("w=%h", w);
  end
endmodule
