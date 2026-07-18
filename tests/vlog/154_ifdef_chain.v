// `ifdef / `elsif / `else selection with nesting
`define MODE_B
`define FAST
`define DEPTH 3

module tb;
  reg [7:0] r;
  initial begin
    $dumpfile("154.vcd");
    $dumpvars(0, tb);
`ifdef MODE_A
    r = 8'd1;
    $display("mode A");
`elsif MODE_B
    r = 8'd2;
    $display("mode B");
  `ifdef FAST
    $display("  fast variant");
    `ifdef SLOW
    $display("  impossible");
    `else
    $display("  not slow");
    `endif
  `else
    $display("  normal variant");
  `endif
`elsif MODE_C
    r = 8'd3;
    $display("mode C");
`else
    r = 8'd0;
    $display("no mode");
`endif
    #1 r = r << `DEPTH;
`ifdef DEPTH
    $display("depth=%0d r=%0d", `DEPTH, r);
`endif
`ifdef MODE_C
`elsif NOPE
`else
    $display("fell through to else");
`endif
`ifdef FAST `ifdef MODE_B $display("both on one line"); `endif `endif
    $finish;
  end
endmodule
