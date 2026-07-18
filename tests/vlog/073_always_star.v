// always @* infers sensitivity from the right-hand sides, indices and conditions
module tb;
  reg [3:0] a, b;
  reg [1:0] sel;
  reg [7:0] mem_like;
  reg       mode;
  reg [3:0] y, z;
  reg       bit_out;
  always @* begin
    case (sel)
      2'd0: y = a;
      2'd1: y = b;
      2'd2: y = a & b;
      default: y = ~a;
    endcase
  end

  always @(*) begin
    if (mode) z = a + b;
    else      z = a - b;
  end

  always @* begin
    bit_out = mem_like[sel];
  end

  initial begin
    #1 a = 4'd5; b = 4'd3; sel = 2'd0; mode = 1'b1; mem_like = 8'b1010_0110;
    #1 $display("y=%d z=%d bit=%b", y, z, bit_out);
    sel = 2'd1;
    #1 $display("y=%d z=%d bit=%b", y, z, bit_out);
    mode = 1'b0;
    #1 $display("y=%d z=%d bit=%b", y, z, bit_out);
    sel = 2'd2; mem_like[2] = 1'b0;
    #1 $display("y=%d z=%d bit=%b", y, z, bit_out);
    sel = 2'd3; b = 4'd9;
    #1 $display("y=%d z=%d (signed view %0d) bit=%b", y, z, $signed(z), bit_out);
    mem_like[0] = 1'b1;
    #1 $display("bit=%b", bit_out);
    $finish;
  end
endmodule
