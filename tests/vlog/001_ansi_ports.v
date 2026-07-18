`timescale 1ns/1ps
module adder4 (input [3:0] a, input [3:0] b, input cin, output [3:0] s, output cout);
  assign {cout, s} = a + b + cin;
endmodule

module tb;
  reg [3:0] a, b;
  reg cin;
  wire [3:0] s;
  wire cout;
  adder4 u0 (a, b, cin, s, cout);
  initial begin
    $dumpfile("001.vcd");
    $dumpvars(0, tb);
    a = 4'd3; b = 4'd4; cin = 0;
    #1 $display("%0t a=%d b=%d cin=%b s=%d cout=%b", $time, a, b, cin, s, cout);
    a = 4'hF; b = 4'h1; cin = 0;
    #1 $display("%0t a=%h b=%h s=%h cout=%b", $time, a, b, s, cout);
    a = 4'hF; b = 4'hF; cin = 1;
    #1 $display("%0t a=%b b=%b s=%b cout=%b", $time, a, b, s, cout);
    a = 4'b10x1; b = 4'd1; cin = 0;
    #1 $display("%0t a=%b s=%b cout=%b", $time, a, s, cout);
    cin = 1'bz; a = 4'd2; b = 4'd2;
    #1 $display("%0t cin=%b s=%b cout=%b", $time, cin, s, cout);
    $finish;
  end
endmodule
