module fifo_ptrs #(parameter DEPTH = 10) (output [31:0] aw);
  localparam AW = $clog2(DEPTH);
  reg [AW-1:0] ptr;
  assign aw = AW;
  initial begin
    ptr = DEPTH - 1;
    #1 $display("%m DEPTH=%0d AW=%0d ptr=%b", DEPTH, AW, ptr);
  end
endmodule

module tb;
  integer i;
  wire [31:0] a0, a1, a2;
  fifo_ptrs f0 (a0);
  fifo_ptrs #(16) f1 (a1);
  fifo_ptrs #(.DEPTH(17)) f2 (a2);
  initial begin
    for (i = 0; i <= 9; i = i + 1)
      $write("%0d:%0d ", i, $clog2(i));
    $display("");
    $display("%0d %0d %0d %0d", $clog2(255), $clog2(256), $clog2(257), $clog2(32'hFFFF_FFFF));
    $display("%0d %0d", $clog2(64'h1_0000_0000), $clog2(64'h1_0000_0001));
    $display("%0d", $clog2(-1));
    #2 $display("aw %0d %0d %0d", a0, a1, a2);
  end
endmodule
