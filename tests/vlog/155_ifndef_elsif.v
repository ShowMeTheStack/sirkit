// `ifndef with `elsif, and macros defined inside conditional blocks
`ifndef GUARD_X
  `define GUARD_X
  `define PICK 10
`else
  `define PICK 20
`endif

`ifndef GUARD_X
  `define SECOND 1
`elsif PICK
  `define SECOND 2
`else
  `define SECOND 3
`endif

`ifndef UNKNOWN_MACRO
  `define THIRD "third-yes"
`endif

module tb;
  wire [7:0] w = `PICK + `SECOND;
  initial begin
    #1;
    $display("PICK=%0d SECOND=%0d w=%0d", `PICK, `SECOND, w);
    $display("THIRD=%s", `THIRD);
`ifndef GUARD_X
    $display("never");
`elsif THIRD
    $display("elsif after ifndef taken");
`endif
`ifndef PICK
    $display("PICK undefined");
`else
  `ifndef SECOND
    $display("SECOND undefined");
  `else
    $display("both defined");
  `endif
`endif
    $finish;
  end
endmodule
