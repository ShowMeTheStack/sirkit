// Conditional compilation choosing ports, logic and instances
`define HAS_PARITY
`define USE_ALT_ADD

module unit (
  input [3:0] a,
  input [3:0] b,
`ifdef HAS_PARITY
  output par,
`endif
  output [4:0] s
);
`ifdef USE_ALT_ADD
  assign s = {1'b0, a} - {1'b0, ~b} - 5'd1;
`else
  assign s = a + b;
`endif
`ifdef HAS_PARITY
  assign par = ^s;
`endif
endmodule

module tb;
  reg [3:0] a, b;
  wire [4:0] s;
  wire p;
  integer i;
  unit u (.a(a), .b(b),
`ifdef HAS_PARITY
    .par(p),
`endif
    .s(s));
  initial begin
    $dumpfile("197.vcd");
    $dumpvars(0, tb);
    for (i = 0; i < 6; i = i + 1) begin
      a = i * 3; b = 4'd9 - i;
      #2 $display("a=%0d b=%0d s=%b p=%b", a, b, s, p);
    end
`ifndef USE_ALT_ADD
    $display("plain adder");
`else
    $display("alt adder");
`endif
    $finish;
  end
endmodule
