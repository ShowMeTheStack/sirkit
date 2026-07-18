`define CFG_W 6
`define CFG_RESET 6'b10_1010
`ifdef USE_INVERT
  `define CFG_OP(v) (~(v))
`else
  `define CFG_OP(v) ((v) + 1)
`endif
