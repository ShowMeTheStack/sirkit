// A header whose content depends on a macro defined before the include
`define USE_INVERT
`include "192_cfg.vh"

module tb;
  reg [`CFG_W-1:0] r;
  integer n;
  initial begin
    $dumpfile("192.vcd");
    $dumpvars(0, tb);
    r = `CFG_RESET;
    for (n = 0; n < 4; n = n + 1) begin
      #3 r = `CFG_OP(r);
      $display("t=%0t r=%b", $time, r);
    end
`ifdef USE_INVERT
    $display("invert mode, width %0d", `CFG_W);
`endif
    $finish;
  end
endmodule
