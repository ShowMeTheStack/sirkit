// $display with each radix and format letter
module tb;
  reg [11:0] v;
  reg signed [7:0] s;
  reg [15:0] word;
  integer n;
  initial begin
    v = 12'hA3C;
    s = -8'sd37;
    word = "Hi";
    n = -123;
    $display("b=%b o=%o d=%d h=%h x=%x", v, v, v, v, v);
    $display("B=%B O=%O D=%D H=%H X=%X", v, v, v, v, v);
    $display("0b=%0b 0o=%0o 0d=%0d 0h=%0h", v, v, v, v);
    $display("signed s: d=%d 0d=%0d b=%b h=%h", s, s, s, s);
    $display("int n: d=%d 0d=%0d h=%h o=%o", n, n, n, n);
    $display("c=%c%c s=%s", word[15:8], word[7:0], word);
    $display("m=%m");
    $display("%%=%% literal");
    $display("mixed %0d+%0d=%0d %h", 3, 4, 3 + 4, 255);
    $display("unsized consts: %d %h %b", 5, 'hf, 'b101);
    $display("sized consts: %d %h %b", 4'd5, 8'hf, 3'b101);
    $display("negative sized: %d %0d %h", -4'sd3, -4'sd3, -4'sd3);
    $display("upper hex %h", 32'hDEADBEEF);
    $display("e=%e f=%f", 1234.5678, 0.0001234);
    $display("t=%t", 0);
  end
endmodule
