// Synchronous RAM: 16 words of 4 bits, registered read
module ram16x4 (
  input            clk,
  input            we,
  input      [3:0] addr,
  input      [3:0] din,
  output reg [3:0] dout
);
  reg [3:0] mem [0:15];
  always @(posedge clk) begin
    if (we) mem[addr] <= din;
    dout <= mem[addr];
  end
endmodule
