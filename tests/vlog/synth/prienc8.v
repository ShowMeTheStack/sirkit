// 8-input priority encoder using casez; bit 7 has highest priority
module prienc8 (
  input      [7:0] req,
  output reg [2:0] idx,
  output reg       valid
);
  always @* begin
    valid = 1'b1;
    casez (req)
      8'b1???????: idx = 3'd7;
      8'b01??????: idx = 3'd6;
      8'b001?????: idx = 3'd5;
      8'b0001????: idx = 3'd4;
      8'b00001???: idx = 3'd3;
      8'b000001??: idx = 3'd2;
      8'b0000001?: idx = 3'd1;
      8'b00000001: idx = 3'd0;
      default: begin
        idx = 3'd0;
        valid = 1'b0;
      end
    endcase
  end
endmodule
