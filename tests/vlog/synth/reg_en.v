// Register with load enable and synchronous clear
module reg_en (
  input             clk,
  input             rst,
  input             en,
  input             clr,
  input      [15:0] d,
  output reg [15:0] q
);
  always @(posedge clk) begin
    if (rst)
      q <= 16'd0;
    else if (clr)
      q <= 16'd0;
    else if (en)
      q <= d;
  end
endmodule
