module tb;
  reg [2:0] s;
  reg [3:0] v;
  reg [7:0] out, pr;
  integer i;

  always @(s) begin
    case (s)
      3'd0: out = 8'hA0;
      3'd1, 3'd2: out = 8'hA1;
      3'd3: begin out = 8'hA3; end
      3'b1x0: out = 8'hBB;
      3'bz11: out = 8'hCC;
      default: out = 8'hFF;
    endcase
  end

  always @(v)
    case (1'b1)
      v[3]: pr = 3;
      v[2]: pr = 2;
      v[1]: pr = 1;
      v[0]: pr = 0;
      default: pr = 8'hxx;
    endcase

  initial begin
    for (i = 0; i < 8; i = i + 1) begin
      s = i;
      #1 $display("s=%b out=%h", s, out);
    end
    s = 3'b1x0; #1 $display("s=%b out=%h", s, out);
    s = 3'b1z0; #1 $display("s=%b out=%h", s, out);
    s = 3'bz11; #1 $display("s=%b out=%h", s, out);
    s = 3'bx11; #1 $display("s=%b out=%h", s, out);
    s = 3'bxxx; #1 $display("s=%b out=%h", s, out);
    for (i = 0; i < 16; i = i + 3) begin
      v = i;
      #1 $display("v=%b pr=%0d", v, pr);
    end
    v = 4'b0000; #1 $display("v=%b pr=%h", v, pr);
    v = 4'b0x10; #1 $display("v=%b pr=%0d", v, pr);
    // no default: unmatched keeps old value
    out = 8'h55;
    case (v)
      4'd9: out = 8'h09;
      4'd8: out = 8'h08;
    endcase
    $display("nomatch out=%h", out);
    // item expressions are evaluated in order; first match wins
    v = 4'd6;
    case (v)
      4'd2 + 4'd4: $display("matched sum first");
      4'd6: $display("matched literal");
      default: $display("none");
    endcase
    // widths extended to the widest: 5'b10110 vs 4-bit v
    v = 4'b0110;
    case (v)
      5'b10110: $display("5-bit item matched");
      5'b00110: $display("zero-extended match");
    endcase
    case (3'sb111)
      -1: $display("signed -1 matched");
      7: $display("unsigned 7 matched");
    endcase
    $finish;
  end
endmodule
