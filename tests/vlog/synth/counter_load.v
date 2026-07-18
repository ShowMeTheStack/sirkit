// Loadable modulo-N counter with wrap pulse
module counter_load #(parameter W = 6, parameter MOD = 50) (
  input              clk,
  input              rst,
  input              load,
  input      [W-1:0] din,
  output reg [W-1:0] count,
  output reg         wrap
);
  always @(posedge clk) begin
    wrap <= 1'b0;
    if (rst)
      count <= {W{1'b0}};
    else if (load)
      count <= din;
    else if (count == MOD - 1) begin
      count <= {W{1'b0}};
      wrap <= 1'b1;
    end else
      count <= count + 1'b1;
  end
endmodule
