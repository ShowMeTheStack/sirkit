// $clog2 in constant and runtime contexts
module mem_sized #(parameter DEPTH = 10) ();
  localparam AW = $clog2(DEPTH);
  reg [AW:0] addr;
endmodule

module tb;
  integer i;
  mem_sized #(.DEPTH(1)) m1 ();
  mem_sized #(.DEPTH(2)) m2 ();
  mem_sized #(.DEPTH(1000)) m3 ();
  initial begin
    for (i = 0; i <= 17; i = i + 1)
      $display("clog2(%0d)=%0d", i, $clog2(i));
    $display("clog2(255)=%0d clog2(256)=%0d clog2(257)=%0d", $clog2(255), $clog2(256), $clog2(257));
    $display("clog2(2**20)=%0d clog2(2**31)=%0d", $clog2(2**20), $clog2(32'h8000_0000));
    $display("clog2(33'h1_0000_0001)=%0d", $clog2(33'h1_0000_0001));
    #1 $display("AW: %0d %0d %0d", m1.AW, m2.AW, m3.AW);
    $finish;
  end
endmodule
