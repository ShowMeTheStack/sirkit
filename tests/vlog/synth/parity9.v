// Even/odd parity generator and checker
module parity9 (
  input  [7:0] data,
  input        odd_mode,
  input        rx_parity,
  output       parity,
  output       error
);
  assign parity = ^data ^ odd_mode;
  assign error = parity ^ rx_parity;
endmodule
