module mux2 (input a, b, s, output y);
  assign y = s ? b : a;
endmodule

module mux4_tree (input [3:0] d, input [1:0] s, output y);
  wire lo, hi;
  mux2 m0 (.a(d[0]), .b(d[1]), .s(s[0]), .y(lo));
  mux2 m1 (.a(d[2]), .b(d[3]), .s(s[0]), .y(hi));
  mux2 m2 (.a(lo), .b(hi), .s(s[1]), .y(y));
endmodule

module mux4_case (input [3:0] d, input [1:0] s, output reg y);
  always @* case (s)
    2'd0: y = d[0];
    2'd1: y = d[1];
    2'd2: y = d[2];
    2'd3: y = d[3];
    default: y = 1'bx;
  endcase
endmodule

module muxn #(parameter W = 8, N = 5) (input [W*N-1:0] d, input [2:0] s, output [W-1:0] y);
  assign y = (s < N) ? d[s*W +: W] : {W{1'b0}};
endmodule

module tb;
  reg [3:0] d;
  reg [1:0] s;
  wire yt, yc, yi;
  reg [39:0] wide;
  reg [2:0] sel;
  wire [7:0] yw;
  mux4_tree t (d, s, yt);
  mux4_case c (d, s, yc);
  assign yi = d[s];
  muxn #(8, 5) w (.d(wide), .s(sel), .y(yw));
  integer i;
  initial begin
    d = 4'b1001;
    for (i = 0; i < 4; i = i + 1) begin
      s = i;
      #1 $display("d=%b s=%0d tree=%b case=%b index=%b", d, s, yt, yc, yi);
    end
    d = 4'b1x0z;
    for (i = 0; i < 4; i = i + 1) begin
      s = i;
      #1 $display("d=%b s=%0d tree=%b case=%b index=%b", d, s, yt, yc, yi);
    end
    d = 4'b1100; s = 2'b0x;
    #1 $display("d=%b s=%b tree=%b case=%b index=%b", d, s, yt, yc, yi);
    d = 4'b1111; s = 2'bx1;
    #1 $display("d=%b s=%b tree=%b case=%b index=%b", d, s, yt, yc, yi);
    wide = 40'hEE_DD_CC_BB_AA;
    for (i = 0; i < 8; i = i + 1) begin
      sel = i;
      #1 $display("sel=%0d yw=%h", sel, yw);
    end
    $finish;
  end
endmodule
