// Directives and tasks together: timescale, macros, include-free table load, monitor, strobe
`timescale 1ns/100ps
`define N 8
`define AW $clog2(`N)
`define TRACE(msg) $display("[%t] %s", $realtime, msg)

module stepper (input clk, input rst_n, output reg [7:0] out);
  reg [7:0] table_q [0:`N-1];
  reg [`AW-1:0] idx;
  initial $readmemh("199_prog.hex", table_q);
  always @(posedge clk or negedge rst_n)
    if (!rst_n) begin
      idx <= 0;
      out <= 8'h00;
    end else begin
      out <= table_q[idx];
      idx <= idx + 1'b1;
    end
endmodule

module tb;
  reg clk, rst_n;
  wire [7:0] out;
  stepper u (.clk(clk), .rst_n(rst_n), .out(out));
  initial begin
    $dumpfile("199.vcd");
    $dumpvars(0, tb);
    $timeformat(-9, 1, " ns", 10);
    clk = 0; rst_n = 0;
    `TRACE("reset");
    #1.2 rst_n = 1;
    `TRACE("run");
    $monitor("%t out=%b idx=%0d", $realtime, out, u.idx);
    #45 $monitoroff;
    `TRACE("quiet");
    #20 $strobe("%t final out=%h", $realtime, out);
    #0.1 $finish;
  end
  always #2.5 clk = ~clk;
endmodule
