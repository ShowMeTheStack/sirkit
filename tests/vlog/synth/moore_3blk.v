// Moore FSM, three-block style: traffic light with timed phases
module moore_3blk (
  input            clk,
  input            rst_n,
  input            car,
  output reg [2:0] light
);
  localparam GREEN = 2'b00, YELLOW = 2'b01, RED = 2'b10, HOLD = 2'b11;
  reg [1:0] state, next;
  reg [2:0] timer;
  // state register and timer
  always @(posedge clk or negedge rst_n)
    if (!rst_n) begin
      state <= GREEN;
      timer <= 3'd0;
    end else begin
      state <= next;
      timer <= (next == state) ? timer + 3'd1 : 3'd0;
    end
  // next-state logic
  always @* begin
    next = state;
    case (state)
      GREEN:  if (car && timer >= 3'd3) next = YELLOW;
      YELLOW: if (timer == 3'd1) next = RED;
      RED:    if (timer == 3'd4) next = HOLD;
      HOLD:   next = GREEN;
    endcase
  end
  // output logic (red, yellow, green)
  always @* begin
    case (state)
      GREEN:   light = 3'b001;
      YELLOW:  light = 3'b010;
      RED:     light = 3'b100;
      default: light = 3'b110;
    endcase
  end
endmodule
