module narrow_out (input [7:0] d, output [3:0] q);
  assign q = d[7:4];
endmodule

module wide_in (input [7:0] d, output [7:0] q);
  assign q = d;
endmodule

module sgn (input signed [3:0] d, output signed [7:0] q);
  assign q = d;
endmodule

module tb;
  reg [11:0] big;
  reg [2:0] tiny;
  wire [7:0] got_wide1, got_wide2;
  wire [1:0] got_narrow;
  wire [7:0] got_pad;
  wire [7:0] s1, s2;
  wire [15:0] s3;

  wide_in w1 (.d(big), .q(got_wide1));
  wide_in w2 (.d(tiny), .q(got_wide2));
  narrow_out n1 (.d(big[7:0]), .q(got_narrow));
  narrow_out n2 (.d(8'hC3), .q(got_pad));
  sgn g1 (.d(tiny), .q(s1));
  sgn g2 (.d(4'sb1010), .q(s2));
  sgn g3 (.d(-3), .q(s3));

  initial begin
    big = 12'hABC; tiny = 3'b101;
    #1;
    $display("wide1=%h wide2=%h narrow=%b pad=%h", got_wide1, got_wide2, got_narrow, got_pad);
    $display("s1=%b s2=%b s3=%b", s1, s2, s3);
    $display("inner w2.d=%b g1.d=%b g3.d=%b", w2.d, g1.d, g3.d);
    big = 12'hF5x; tiny = 3'bz10;
    #1;
    $display("wide1=%h wide2=%h narrow=%b", got_wide1, got_wide2, got_narrow);
    $display("s1=%b g1.d=%b", s1, g1.d);
    $finish;
  end
endmodule
