module penc_casez (input [7:0] r, output reg [2:0] idx, output reg valid);
  always @* begin
    valid = 1'b1;
    casez (r)
      8'b1???????: idx = 3'd7;
      8'b01??????: idx = 3'd6;
      8'b001?????: idx = 3'd5;
      8'b0001????: idx = 3'd4;
      8'b00001???: idx = 3'd3;
      8'b000001??: idx = 3'd2;
      8'b0000001?: idx = 3'd1;
      8'b00000001: idx = 3'd0;
      default: begin idx = 3'd0; valid = 1'b0; end
    endcase
  end
endmodule

module penc_loop (input [7:0] r, output reg [2:0] idx, output reg valid);
  integer k;
  always @* begin
    idx = 0; valid = 0;
    for (k = 0; k < 8; k = k + 1)
      if (r[k]) begin idx = k; valid = 1; end
  end
endmodule

module penc_low (input [7:0] r, output reg [2:0] idx);
  integer k;
  always @* begin : find
    idx = 3'bxxx;
    for (k = 0; k < 8; k = k + 1)
      if (r[k]) begin idx = k; disable find; end
  end
endmodule

module tb;
  reg [7:0] r;
  wire [2:0] i1, i2, i3;
  wire v1, v2;
  penc_casez a (r, i1, v1);
  penc_loop b (.r(r), .idx(i2), .valid(v2));
  penc_low c (.r(r), .idx(i3));
  integer n;
  initial begin
    $dumpfile("131.vcd");
    $dumpvars(0, tb);
    r = 0;
    for (n = 0; n < 12; n = n + 1) begin
      #1 $display("r=%b high=%0d/%b loop=%0d/%b low=%b", r, i1, v1, i2, v2, i3);
      r = (r << 1) ^ (n * 5 + 1);
    end
    r = 8'b0010_1x00;
    #1 $display("r=%b high=%0d/%b loop=%0d/%b low=%b", r, i1, v1, i2, v2, i3);
    r = 8'b0000_0z00;
    #1 $display("r=%b high=%0d/%b loop=%0d/%b low=%b", r, i1, v1, i2, v2, i3);
    $finish;
  end
endmodule
