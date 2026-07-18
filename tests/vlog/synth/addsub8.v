// 8-bit adder/subtractor built from full adders, with carry and overflow
module full_adder (input a, input b, input cin, output s, output cout);
  assign s = a ^ b ^ cin;
  assign cout = (a & b) | (cin & (a ^ b));
endmodule

module addsub8 (
  input  [7:0] a,
  input  [7:0] b,
  input        sub,
  output [7:0] s,
  output       cout,
  output       ovf
);
  wire [8:0] c;
  wire [7:0] bx = b ^ {8{sub}};
  assign c[0] = sub;
  genvar i;
  generate
    for (i = 0; i < 8; i = i + 1) begin : fa
      full_adder u (.a(a[i]), .b(bx[i]), .cin(c[i]), .s(s[i]), .cout(c[i+1]));
    end
  endgenerate
  assign cout = c[8];
  assign ovf = c[8] ^ c[7];
endmodule
