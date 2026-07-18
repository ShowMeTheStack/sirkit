// Explicit field widths
module tb;
  reg [7:0] a;
  reg [15:0] b;
  reg signed [7:0] s;
  integer i;
  initial begin
    a = 8'd5; b = 16'h1234; s = -8'sd9; i = 42;
    $display("[%5d] [%3d] [%1d] [%0d]", a, a, a, a);
    $display("[%08b] [%4b] [%12b]", a, a, a);
    $display("[%6h] [%2h] [%1h] [%0h]", b, b, b, b);
    $display("[%6o] [%0o] [%10o]", b, b, b);
    $display("[%5d] [%2d] [%0d]", s, s, s);
    $display("[%10d] [%3d] [%0d]", i, i, i);
    $display("[%10s] [%2s] [%0s]", "abc", "abc", "abc");
    $display("[%3c] [%c]", 8'h41, 8'h42);
    $display("[%8.3f] [%.1f] [%0.2f] [%10.4e]", 3.14159, 2.76, -0.0061, 12345.678);
    $display("[%12t] [%0t]", 64'd77, 64'd77);
    $display("[%-6d] [%-8h] [%-5s]", a, b, "xy");
    $display("[%3d] wider than field: [%2d]", 1000, 12345);
  end
endmodule
