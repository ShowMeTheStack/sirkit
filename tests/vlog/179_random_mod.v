// $random % n is signed, {$random} % n is not
module tb;
  integer seed, i, a, b;
  reg [3:0] nib;
  initial begin
    seed = 2024;
    for (i = 0; i < 12; i = i + 1) begin
      a = $random(seed) % 10;
      b = {$random(seed)} % 10;
      nib = $random(seed);
      $display("i=%0d a=%0d b=%0d nib=%h", i, a, b, nib);
    end
    seed = 99;
    for (i = 0; i < 6; i = i + 1) begin
      a = $unsigned($random(seed)) % 100;
      b = ($random(seed) & 32'h7fff_ffff) % 7;
      $display("u=%0d m=%0d", a, b);
    end
  end
endmodule
