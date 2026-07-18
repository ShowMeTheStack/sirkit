// 8-bit Fibonacci LFSR, taps 8,6,5,4; never stuck at zero
module lfsr8 (
  input            clk,
  input            rst,
  input            step,
  output reg [7:0] state
);
  wire fb = state[7] ^ state[5] ^ state[4] ^ state[3];
  always @(posedge clk) begin
    if (rst)
      state <= 8'h01;
    else if (step)
      state <= {state[6:0], fb};
  end
endmodule
