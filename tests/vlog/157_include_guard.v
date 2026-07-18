// Nested includes with an include guard; header included twice
`include "157_consts.vh"
`include "157_more.vh"
`include "157_consts.vh"

module tb;
  reg [7:0] v;
  integer i;
  initial begin
    $dumpfile("157.vcd");
    $dumpvars(0, tb);
    v = `K_SEED;
    $display("K_LEN=%0d K_TWICE=%0d", `K_LEN, `K_TWICE);
    for (i = 0; i < `K_LEN; i = i + 1) begin
      #2 v = `ROT(v);
      $display("t=%0t v=%b", $time, v);
    end
`ifdef CONSTS_157_VH
    $display("guard defined");
`endif
    $finish;
  end
endmodule
