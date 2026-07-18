// Mealy FSM, two-block style: rising-edge detector on a serial input
module mealy_2blk (
  input      clk,
  input      rst,
  input      x,
  output reg rise
);
  localparam LOW = 1'b0, HIGH = 1'b1;
  reg state, next;
  always @(posedge clk)
    if (rst) state <= LOW;
    else     state <= next;
  always @* begin
    next = state;
    rise = 1'b0;
    case (state)
      LOW:  if (x) begin next = HIGH; rise = 1'b1; end
      HIGH: if (!x) next = LOW;
    endcase
  end
endmodule
