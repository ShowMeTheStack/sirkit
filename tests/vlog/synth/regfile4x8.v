// Register file: 4 x 8 bits, one write port, two read ports, register 0 reads as zero
module regfile4x8 (
  input        clk,
  input        we,
  input  [1:0] waddr,
  input  [7:0] wdata,
  input  [1:0] raddr_a,
  input  [1:0] raddr_b,
  output [7:0] rdata_a,
  output [7:0] rdata_b
);
  reg [7:0] regs [0:3];
  always @(posedge clk)
    if (we) regs[waddr] <= wdata;
  assign rdata_a = (raddr_a == 2'd0) ? 8'd0 : regs[raddr_a];
  assign rdata_b = (raddr_b == 2'd0) ? 8'd0 : regs[raddr_b];
endmodule
