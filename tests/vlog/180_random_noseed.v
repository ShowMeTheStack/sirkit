// $random without an argument uses its own internal seed
module tb;
  integer i;
  reg [15:0] r;
  initial begin
    $dumpfile("180.vcd");
    $dumpvars(0, tb);
    for (i = 0; i < 10; i = i + 1) begin
      #1 r = $random;
      $display("r=%0d (%h) full=%0d", r, r, $random);
    end
    $display("mod: %0d %0d %0d", $random % 4, {$random} % 4, {$random} % 1000);
    $finish;
  end
endmodule
