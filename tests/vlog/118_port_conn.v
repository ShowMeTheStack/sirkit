module blk (a, b, c, sum, cout, tag);
  input [3:0] a, b;
  input c;
  output [3:0] sum;
  output cout;
  output [1:0] tag;
  assign {cout, sum} = a + b + c;
  assign tag = {a[3], b[3]};
endmodule

module probe #(parameter D = 1) (input i, input [1:0] j, output o);
  assign o = i;
  initial #D $display("%m: i=%b j=%b", i, j);
endmodule

module tb;
  reg [3:0] x, y;
  reg ci;
  wire [3:0] s1, s2, s3, s4;
  wire c1, c2, c3;
  wire [1:0] t1, t3;
  wire o1, o2;

  blk ordered (x, y, ci, s1, c1, t1);
  blk named (.sum(s2), .cout(c2), .c(ci), .b(y), .a(x), .tag());
  blk expr (.a(x & 4'b0011), .b({y[1:0], 2'b11}), .c(~ci), .sum(s3), .cout(c3), .tag(t3));
  blk partial (.a(x), .b(y), .sum(s4));
  blk gaps (x, , ci, , , );
  probe #(1) p1 (.i(), .j(2'b10), .o(o1));
  probe #(2) p2 (1'b1, , o2);

  initial begin
    x = 4'd9; y = 4'd12; ci = 1;
    #3 $display("ordered s=%0d c=%b t=%b", s1, c1, t1);
    $display("named   s=%0d c=%b", s2, c2);
    $display("expr    s=%0d c=%b t=%b", s3, c3, t3);
    $display("partial s=%b c=%b", s4, partial.cout);
    $display("gaps    s=%b c=%b tag=%b", gaps.sum, gaps.cout, gaps.tag);
    $display("o1=%b o2=%b", o1, o2);
    x = 4'd3; y = 4'd3; ci = 0;
    #1 $display("ordered s=%0d expr s=%0d c=%b", s1, s3, c3);
    $finish;
  end
endmodule
