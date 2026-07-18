// $random with a seed variable: repeatable sequences
module tb;
  integer seed, seed2, i, v;
  reg [7:0] b;
  initial begin
    seed = 1;
    for (i = 0; i < 8; i = i + 1) begin
      v = $random(seed);
      $display("seed1 #%0d: v=%0d h=%h seed=%0d", i, v, v, seed);
    end
    seed = 1;
    v = $random(seed);
    $display("restart: %0d", v);
    seed2 = 12345;
    for (i = 0; i < 6; i = i + 1) begin
      b = $random(seed2);
      $display("seed12345 b=%0d %b", b, b);
    end
    seed = -7;
    for (i = 0; i < 5; i = i + 1)
      $display("neg seed: %0d", $random(seed));
    seed = 0;
    for (i = 0; i < 5; i = i + 1)
      $display("zero seed: %0d", $random(seed));
  end
endmodule
