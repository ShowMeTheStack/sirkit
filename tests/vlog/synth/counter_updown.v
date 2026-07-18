// Up/down counter with enable, terminal count outputs
module counter_updown (
  input            clk,
  input            rst_n,
  input            en,
  input            up,
  output reg [3:0] count,
  output           at_max,
  output           at_min
);
  always @(posedge clk or negedge rst_n)
    if (!rst_n)
      count <= 4'd0;
    else if (en)
      count <= up ? count + 4'd1 : count - 4'd1;
  assign at_max = (count == 4'hF);
  assign at_min = (count == 4'h0);
endmodule
