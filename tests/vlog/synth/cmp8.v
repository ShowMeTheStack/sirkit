// Magnitude comparator, unsigned or signed selectable
module cmp8 (
  input  [7:0] a,
  input  [7:0] b,
  input        is_signed,
  output       eq,
  output       lt,
  output       gt
);
  wire ult = a < b;
  wire slt = $signed(a) < $signed(b);
  assign eq = (a == b);
  assign lt = is_signed ? slt : ult;
  assign gt = ~eq & ~lt;
endmodule
