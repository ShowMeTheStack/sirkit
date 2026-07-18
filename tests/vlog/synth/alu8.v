// Small ALU with case on opcode and status flags
module alu8 (
  input      [7:0] a,
  input      [7:0] b,
  input      [2:0] op,
  output reg [7:0] y,
  output reg       carry,
  output           zero,
  output           neg
);
  localparam OP_ADD = 3'd0, OP_SUB = 3'd1, OP_AND = 3'd2, OP_OR = 3'd3,
             OP_XOR = 3'd4, OP_SHL = 3'd5, OP_SHR = 3'd6, OP_PASS = 3'd7;
  always @* begin
    carry = 1'b0;
    case (op)
      OP_ADD: {carry, y} = a + b;
      OP_SUB: {carry, y} = {1'b0, a} - {1'b0, b};
      OP_AND: y = a & b;
      OP_OR:  y = a | b;
      OP_XOR: y = a ^ b;
      OP_SHL: {carry, y} = {a, 1'b0};
      OP_SHR: {y, carry} = {1'b0, a};
      default: y = b;
    endcase
  end
  assign zero = (y == 8'd0);
  assign neg = y[7];
endmodule
