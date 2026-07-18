// Indexed part-selects +: and -: for reading and writing, with variable starts
module tb;
  reg [31:0] word;
  reg [0:15] be;
  reg [7:0] byte_r;
  integer i;
  initial begin
    word = 32'hDEADBEEF;
    be = 16'h1234;
    for (i = 0; i < 4; i = i + 1)
      $display("word[%0d*8 +: 8] = %h, word[%0d -: 4] = %h", i, word[i*8 +: 8], 31 - i*4, word[31 - i*4 -: 4]);
    for (i = 0; i < 4; i = i + 1)
      $display("be[%0d +: 4] = %h  be[%0d -: 4] = %h", i*4, be[i*4 +: 4], i*4 + 3, be[i*4+3 -: 4]);
    word[8 +: 8] = 8'h00;
    $display("cleared byte 1: %h", word);
    word[31 -: 8] = 8'h12;
    $display("top byte: %h", word);
    for (i = 0; i < 4; i = i + 1) begin
      byte_r = word[i*8 +: 8];
      word[(3-i)*8 +: 8] = byte_r;
    end
    $display("mirrored halves: %h", word);
    i = 30;
    $display("partly outside: %h", word[i +: 4]);
    i = -2;
    $display("below zero: %b", word[i +: 4]);
    i = 1'bx;
    $display("x start: %h", word[i +: 8]);
  end
endmodule
