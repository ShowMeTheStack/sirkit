module tb;
  reg [7:0] a, b;
  reg [15:0] p;
  reg [7:0] q;
  wire [8:0] sum = a + b;
  wire [7:0] diff = a - b;
  wire [15:0] prod = a * b;
  initial begin
    $dumpfile("023.vcd");
    $dumpvars(0, tb);
    a = 200; b = 100;
    #1 $display("sum=%0d diff=%0d prod=%0d", sum, diff, prod);
    $display("a/b=%0d a%%b=%0d b/a=%0d b%%a=%0d", a / b, a % b, b / a, b % a);
    a = 13; b = 4;
    #1 $display("sum=%0d diff=%0d prod=%0d", sum, diff, prod);
    $display("a/b=%0d a%%b=%0d", a / b, a % b);
    b = 20;
    #1 $display("diff=%0d diff=%b", diff, diff);
    p = a - b;
    $display("p=%0d %h", p, p);
    q = a - b;
    $display("q=%0d", q);
    $display("self a-b=%0d", a - b);
    $display("unary -a=%0d +a=%0d", -a, +a);
    p = -a;
    $display("p=-a %0d", p);
    a = 255; b = 255;
    #1 $display("sum=%0d prod=%0d", sum, prod);
    q = a * b;
    $display("q=a*b %0d", q);
    p = a * b;
    $display("p=a*b %0d", p);
    $display("chain %0d", 7 + 3 * 2 - 8 / 4 % 3);
  end
endmodule
