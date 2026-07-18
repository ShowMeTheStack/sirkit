// Shift register: serial in, parallel load, shift left or right
module shift_reg (
  input            clk,
  input            rst,
  input            load,
  input            shift,
  input            dir_left,
  input            sin,
  input      [7:0] pdata,
  output reg [7:0] q,
  output           sout
);
  always @(posedge clk) begin
    if (rst)
      q <= 8'd0;
    else if (load)
      q <= pdata;
    else if (shift) begin
      if (dir_left) q <= {q[6:0], sin};
      else          q <= {sin, q[7:1]};
    end
  end
  assign sout = dir_left ? q[7] : q[0];
endmodule
