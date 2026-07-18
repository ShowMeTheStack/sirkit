// `include of a header with opcode macros
`include "156_defs.vh"

module alu_small (input [1:0] op, input [`DW-1:0] a, b, output reg [`DW-1:0] y);
  always @* begin
    case (op)
      `OP_ADD: y = a + b;
      `OP_SUB: y = a - b;
      `OP_AND: y = a & b;
      `OP_OR:  y = a | b;
    endcase
  end
endmodule

module tb;
  reg [1:0] op;
  reg [`DW-1:0] a, b;
  wire [`DW-1:0] y;
  integer i;
  alu_small u (op, a, b, y);
  initial begin
    $dumpfile("156.vcd");
    $dumpvars(0, tb);
    a = 8'd200; b = 8'd77;
    for (i = 0; i < 4; i = i + 1) begin
      op = i;
      #1 $display("op=%0d a=%0d b=%0d y=%0d (%h)", op, a, b, y, y);
    end
    a = 8'h0F; b = 8'hF0;
    op = `OP_OR;
    #1 $display("or: %b", y);
    op = `OP_SUB;
    #1 $display("sub: %b", y);
    $finish;
  end
endmodule
