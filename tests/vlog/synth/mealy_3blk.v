// Mealy FSM, three-block style: vending controller taking 5 and 10 coins, price 15
module mealy_3blk (
  input      clk,
  input      rst,
  input      c5,
  input      c10,
  output reg vend,
  output reg change
);
  localparam S0 = 2'd0, S5 = 2'd1, S10 = 2'd2;
  reg [1:0] state, next;
  always @(posedge clk)
    if (rst) state <= S0;
    else     state <= next;
  always @* begin
    next = state;
    case (state)
      S0:  if (c10) next = S10; else if (c5) next = S5;
      S5:  if (c10) next = S0;  else if (c5) next = S10;
      S10: if (c10 || c5) next = S0;
      default: next = S0;
    endcase
  end
  always @* begin
    vend = 1'b0;
    change = 1'b0;
    case (state)
      S5:  if (c10) vend = 1'b1;
      S10: if (c10) begin vend = 1'b1; change = 1'b1; end
           else if (c5) vend = 1'b1;
      default: ;
    endcase
  end
endmodule
