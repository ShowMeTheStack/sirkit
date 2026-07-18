// Binary to Gray and Gray to binary converters
module bin2gray (input [3:0] b, output [3:0] g);
  assign g = b ^ (b >> 1);
endmodule

module gray2bin (input [3:0] g, output [3:0] b);
  assign b[3] = g[3];
  assign b[2] = b[3] ^ g[2];
  assign b[1] = b[2] ^ g[1];
  assign b[0] = b[1] ^ g[0];
endmodule

module gray4 (
  input  [3:0] bin_in,
  input  [3:0] gray_in,
  output [3:0] gray_out,
  output [3:0] bin_out
);
  bin2gray u_b2g (.b(bin_in), .g(gray_out));
  gray2bin u_g2b (.g(gray_in), .b(bin_out));
endmodule
