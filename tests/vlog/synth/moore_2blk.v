// Moore FSM, two-block style: detects the sequence 1,0,1 (overlapping)
module moore_2blk (
  input      clk,
  input      rst,
  input      x,
  output reg found
);
  localparam S_IDLE = 2'd0, S_ONE = 2'd1, S_TEN = 2'd2, S_HIT = 2'd3;
  reg [1:0] state, next;
  always @(posedge clk)
    if (rst) state <= S_IDLE;
    else     state <= next;
  always @* begin
    next = state;
    found = (state == S_HIT);
    case (state)
      S_IDLE: next = x ? S_ONE : S_IDLE;
      S_ONE:  next = x ? S_ONE : S_TEN;
      S_TEN:  next = x ? S_HIT : S_IDLE;
      S_HIT:  next = x ? S_ONE : S_TEN;
    endcase
  end
endmodule
