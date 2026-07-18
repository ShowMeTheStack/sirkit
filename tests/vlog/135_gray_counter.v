module gray_ctr #(parameter N = 4) (input clk, input rst_n, output [N-1:0] gray, output [N-1:0] back);
  reg [N-1:0] bin;
  always @(posedge clk or negedge rst_n)
    if (!rst_n) bin <= 0;
    else bin <= bin + 1;
  assign gray = bin ^ (bin >> 1);
  genvar i;
  generate
    for (i = 0; i < N; i = i + 1) begin : g2b
      assign back[i] = ^gray[N-1:i];
    end
  endgenerate
endmodule

module tb;
  reg clk, rst_n;
  wire [3:0] g, b;
  reg [3:0] prev;
  integer i, bad;
  gray_ctr #(4) dut (.clk(clk), .rst_n(rst_n), .gray(g), .back(b));
  function integer hamming;
    input [3:0] x, y;
    integer k;
    begin
      hamming = 0;
      for (k = 0; k < 4; k = k + 1) hamming = hamming + (x[k] ^ y[k]);
    end
  endfunction
  initial begin
    clk = 0; rst_n = 0; bad = 0;
    #2 rst_n = 1;
    prev = g;
    for (i = 0; i < 18; i = i + 1) begin
      #5 clk = 1;
      #5 clk = 0;
      if (hamming(prev, g) != 1) bad = bad + 1;
      $display("bin=%2d gray=%b back=%2d dist=%0d", dut.bin, g, b, hamming(prev, g));
      prev = g;
    end
    $display("bad=%0d", bad);
    $finish;
  end
endmodule
