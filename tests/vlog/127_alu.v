module alu #(parameter W = 8) (
  input [3:0] op,
  input signed [W-1:0] a, b,
  output reg signed [W-1:0] y,
  output reg cf, output zf, output nf, output reg vf);
  localparam ADD = 4'h0, SUB = 4'h1, AND = 4'h2, OR = 4'h3, XOR = 4'h4, NOR = 4'h5,
             SHL = 4'h6, SHR = 4'h7, SRA = 4'h8, SLT = 4'h9, SLTU = 4'hA, PASS = 4'hB;
  assign zf = (y == 0);
  assign nf = y[W-1];
  always @* begin
    cf = 0; vf = 0;
    case (op)
      ADD: begin {cf, y} = {1'b0, a} + {1'b0, b}; vf = (a[W-1] == b[W-1]) && (y[W-1] != a[W-1]); end
      SUB: begin {cf, y} = {1'b0, a} - {1'b0, b}; vf = (a[W-1] != b[W-1]) && (y[W-1] != a[W-1]); end
      AND: y = a & b;
      OR:  y = a | b;
      XOR: y = a ^ b;
      NOR: y = ~(a | b);
      SHL: y = a << b[2:0];
      SHR: y = a >> b[2:0];
      SRA: y = a >>> b[2:0];
      SLT: y = (a < b) ? 1 : 0;
      SLTU: y = ($unsigned(a) < $unsigned(b)) ? 1 : 0;
      PASS: y = a;
      default: y = {W{1'bx}};
    endcase
  end
endmodule

module tb;
  reg [3:0] op;
  reg signed [7:0] a, b;
  wire signed [7:0] y;
  wire c, z, n, v;
  alu u (.op(op), .a(a), .b(b), .y(y), .cf(c), .zf(z), .nf(n), .vf(v));
  integer k;
  task run;
    input signed [7:0] x1, x2;
    begin
      a = x1; b = x2;
      for (k = 0; k < 13; k = k + 1) begin
        op = k;
        #1 $display("op=%h a=%4d b=%4d y=%4d (%b) c=%b z=%b n=%b v=%b", op, a, b, y, y, c, z, n, v);
      end
    end
  endtask
  initial begin
    run(8'sd100, 8'sd50);
    run(-8'sd128, 8'sd1);
    run(-8'sd3, -8'sd3);
    a = 8'b1010x101; b = 8'd1; op = 0;
    #1 $display("x: y=%b c=%b z=%b v=%b", y, c, z, v);
    $finish;
  end
endmodule
