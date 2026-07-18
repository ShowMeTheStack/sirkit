// Strings stored in vectors: padding, truncation, compare, concat
module tb;
  reg [8*8-1:0] s8;
  reg [8*3-1:0] s3;
  reg [8*12-1:0] big;
  reg [7:0] ch;
  integer k;
  initial begin
    $dumpfile("169.vcd");
    $dumpvars(0, tb);
    s8 = "hello";
    $display("[%s] [%0s] h=%h", s8, s8, s8);
    s3 = "abcdef";
    $display("trunc [%s] h=%h", s3, s3);
    big = {"key", "=", "val"};
    $display("concat [%s] [%0s]", big, big);
    #1 s8 = "WORLD!!!";
    $display("full [%s] d=%0d", s8, s8[7:0]);
    for (k = 7; k >= 0; k = k - 1) begin
      ch = s8 >> (8 * k);
      $write("%c", ch + 8'd32);
    end
    $write("\n");
    #1 s3 = "abc";
    $display("eq=%b ne=%b", s3 == "abc", s3 != "abd");
    s3 = s3 + 1;
    $display("plus one [%s]", s3);
    ch = "Z";
    $display("char %c %0d %h %b", ch, ch, ch, ch);
    s8 = 0;
    $display("zero [%s] [%0s]", s8, s8);
    $display("literal width %0d bits", 8 * 4);
    $finish;
  end
endmodule
