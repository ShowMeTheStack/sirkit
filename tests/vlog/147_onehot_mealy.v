// one-hot Mealy FSM using reverse case; serial two's-complement of an LSB-first stream
module twos_comp (input clk, input rst, input x, output reg y);
  localparam S_COPY = 0, S_INV = 1;
  reg [1:0] state, next;
  always @(posedge clk)
    if (rst) state <= 2'b01;
    else state <= next;
  always @* begin
    next = 2'b00;
    y = 1'bx;
    case (1'b1)
      state[S_COPY]: begin
        y = x;
        if (x) next[S_INV] = 1'b1; else next[S_COPY] = 1'b1;
      end
      state[S_INV]: begin
        y = ~x;
        next[S_INV] = 1'b1;
      end
    endcase
  end
endmodule

module tb;
  reg clk, rst, x;
  wire y;
  reg [11:0] val, res;
  integer i, t;
  twos_comp u (.clk(clk), .rst(rst), .x(x), .y(y));
  task send;
    input [11:0] v;
    begin
      rst = 1;
      #1 clk = 1; #1 clk = 0;
      rst = 0;
      for (i = 0; i < 12; i = i + 1) begin
        x = v[i];
        #1 res[i] = y;
        clk = 1; #1 clk = 0;
      end
      $display("val=%b (%0d) neg=%b (%0d) ok=%b state=%b", v, $signed(v), res, $signed(res), res == -v, u.state);
    end
  endtask
  initial begin
    clk = 0; x = 0;
    send(12'd1);
    send(12'd100);
    send(12'hFFF);
    send(12'd0);
    send(12'h800);
    send(12'h0A8);
    rst = 0;
    u.state = 2'b11;
    #1 $display("bad state y=%b next=%b", y, u.next);
    u.state = 2'b00;
    #1 $display("no state y=%b next=%b", y, u.next);
    $finish;
  end
endmodule
