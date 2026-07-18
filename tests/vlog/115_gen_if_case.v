module shifter #(parameter KIND = 0, parameter W = 8) (input [W-1:0] d, input [2:0] n, output [W-1:0] q);
  generate
    if (KIND == 0) begin : lsl
      assign q = d << n;
    end else if (KIND == 1) begin : lsr
      assign q = d >> n;
    end else begin : rot
      wire [2*W-1:0] dd = {d, d};
      assign q = dd >> n;
    end
  endgenerate
endmodule

module reducer #(parameter OP = "and") (input [7:0] d, output y);
  generate
    case (OP)
      "and": begin : g_and assign y = &d; end
      "or":  begin : g_or  assign y = |d; end
      "xor": begin : g_xor assign y = ^d; end
      default: begin : g_none assign y = 1'bz; end
    endcase
  endgenerate
endmodule

module tb;
  reg [7:0] d;
  reg [2:0] n;
  wire [7:0] q0, q1, q2;
  wire [3:0] q4;
  wire ya, yo, yx, yn;
  shifter #(0) s0 (d, n, q0);
  shifter #(1) s1 (d, n, q1);
  shifter #(.KIND(2)) s2 (.d(d), .n(n), .q(q2));
  shifter #(2, 4) s4 (.d(d[3:0]), .n(n), .q(q4));
  reducer #("and") ra (d, ya);
  reducer #("or") ro (d, yo);
  reducer #("xor") rx (d, yx);
  reducer #("nand") rn (d, yn);
  localparam USE_FAST = 1;
  generate
    if (USE_FAST) begin : mode
      initial $display("fast mode from %m");
    end else begin : mode
      initial $display("slow mode from %m");
    end
  endgenerate
  initial begin
    d = 8'b1001_0110; n = 0;
    repeat (4) begin
      #1 $display("n=%0d lsl=%b lsr=%b rot=%b rot4=%b", n, q0, q1, q2, q4);
      n = n + 3;
    end
    d = 8'hFF; #1 $display("d=%h and=%b or=%b xor=%b none=%b", d, ya, yo, yx, yn);
    d = 8'h00; #1 $display("d=%h and=%b or=%b xor=%b none=%b", d, ya, yo, yx, yn);
    d = 8'h0E; #1 $display("d=%h and=%b or=%b xor=%b none=%b", d, ya, yo, yx, yn);
    d = 8'h1x; #1 $display("d=%h and=%b or=%b xor=%b none=%b", d, ya, yo, yx, yn);
    $display("rot dd=%h", s2.rot.dd);
    $finish;
  end
endmodule
