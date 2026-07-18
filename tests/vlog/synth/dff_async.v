// D register with asynchronous active-low reset
module dff_async (
  input            clk,
  input            rst_n,
  input      [7:0] d,
  output reg [7:0] q
);
  always @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 8'h00;
    else        q <= d;
endmodule
