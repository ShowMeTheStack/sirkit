`timescale 1ns/100ps
module bcd_digit (input clk, input clr, input inc, output reg [3:0] q, output carry);
  assign carry = inc && (q == 4'd9);
  always @(posedge clk)
    if (clr) q <= 0;
    else if (inc) q <= (q == 4'd9) ? 4'd0 : q + 4'd1;
endmodule

module bcd_counter #(parameter DIGITS = 3) (input clk, input clr, input en, output [4*DIGITS-1:0] value, output ovf);
  wire [DIGITS:0] c;
  assign c[0] = en;
  assign ovf = c[DIGITS];
  genvar i;
  generate
    for (i = 0; i < DIGITS; i = i + 1) begin : dig
      bcd_digit u (.clk(clk), .clr(clr), .inc(c[i]), .q(value[4*i +: 4]), .carry(c[i+1]));
    end
  endgenerate
endmodule

module tb;
  reg clk, clr, en;
  wire [11:0] v;
  wire ovf;
  integer n;
  bcd_counter #(3) bc (.clk(clk), .clr(clr), .en(en), .value(v), .ovf(ovf));
  always #2.5 clk = ~clk;
  always @(posedge clk) if (ovf) $display("%t overflow at %h", $time, v);
  initial begin
    $dumpfile("141.vcd");
    $dumpvars(1, tb);
    $dumpvars(1, tb.bc);
    clk = 0; clr = 1; en = 0;
    #6 clr = 0; en = 1;
    for (n = 0; n < 1003; n = n + 1) begin
      @(negedge clk);
      if (n % 97 == 0 || n > 997) $display("%t n=%0d v=%h digits=%0d%0d%0d", $time, n, v, bc.dig[2].u.q, bc.dig[1].u.q, bc.dig[0].u.q);
    end
    en = 0;
    @(negedge clk) $display("held v=%h", v);
    clr = 1;
    @(negedge clk) $display("cleared v=%h", v);
    $finish;
  end
endmodule
