// Synchroniser plus rising/falling edge detector
module edge_detect (
  input      clk,
  input      rst_n,
  input      sig,
  output     rise,
  output     fall
);
  reg s1, s2, s3;
  always @(posedge clk or negedge rst_n)
    if (!rst_n) {s1, s2, s3} <= 3'b000;
    else        {s1, s2, s3} <= {sig, s1, s2};
  assign rise = s2 & ~s3;
  assign fall = ~s2 & s3;
endmodule
