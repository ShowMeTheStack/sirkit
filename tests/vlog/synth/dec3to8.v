// 3-to-8 decoder with enable
module dec3to8 (
  input            en,
  input      [2:0] a,
  output reg [7:0] y
);
  always @* begin
    y = 8'b0;
    if (en)
      case (a)
        3'd0: y = 8'b0000_0001;
        3'd1: y = 8'b0000_0010;
        3'd2: y = 8'b0000_0100;
        3'd3: y = 8'b0000_1000;
        3'd4: y = 8'b0001_0000;
        3'd5: y = 8'b0010_0000;
        3'd6: y = 8'b0100_0000;
        default: y = 8'b1000_0000;
      endcase
  end
endmodule
