// Accumulator with clear, saturating add of signed samples
module accum (
  input                    clk,
  input                    rst,
  input                    clr,
  input                    valid,
  input  signed      [7:0] sample,
  output reg signed [11:0] total,
  output reg               sat
);
  wire signed [12:0] sum = total + sample;
  always @(posedge clk) begin
    if (rst || clr) begin
      total <= 12'sd0;
      sat <= 1'b0;
    end else if (valid) begin
      if (sum > 13'sd2047) begin
        total <= 12'sd2047;
        sat <= 1'b1;
      end else if (sum < -13'sd2048) begin
        total <= -12'sd2048;
        sat <= 1'b1;
      end else begin
        total <= sum[11:0];
      end
    end
  end
endmodule
