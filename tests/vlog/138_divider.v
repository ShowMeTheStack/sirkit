// restoring divider, one quotient bit per clock, 2-block FSM style
module div_unit (clk, rst, go, n, d, q, r, ready, err);
  input clk, rst, go;
  input [7:0] n, d;
  output reg [7:0] q, r;
  output ready, err;
  reg err;
  localparam IDLE = 1'b0, RUN = 1'b1;
  reg state;
  reg [3:0] i;
  reg [8:0] rem;
  reg [7:0] dv;
  wire [8:0] trial = {rem[7:0], q[7]} - {1'b0, dv};
  assign ready = (state == IDLE);
  always @(posedge clk) begin
    if (rst) begin state <= IDLE; err <= 0; q <= 0; r <= 0; end
    else case (state)
      IDLE: if (go) begin
              if (d == 0) err <= 1;
              else begin
                err <= 0; q <= n; dv <= d; rem <= 0; i <= 0; state <= RUN;
              end
            end
      RUN: begin
             if (trial[8]) begin rem <= {rem[7:0], q[7]}; q <= {q[6:0], 1'b0}; end
             else begin rem <= trial; q <= {q[6:0], 1'b1}; end
             i <= i + 1;
             if (i == 7) state <= IDLE;
           end
    endcase
  end
  always @* if (state == IDLE) r = rem[7:0];
endmodule

module tb;
  reg clk, rst, go;
  reg [7:0] n, d;
  wire [7:0] q, r;
  wire ready, err;
  div_unit u (clk, rst, go, n, d, q, r, ready, err);
  initial begin clk = 0; forever #5 clk = ~clk; end
  task divide;
    input [7:0] nn, dd;
    begin
      @(negedge clk) begin n = nn; d = dd; go = 1; end
      @(negedge clk) go = 0;
      wait (ready);
      @(negedge clk);
      $display("%0d / %0d = %0d rem %0d err=%b (t=%0t)", nn, dd, q, r, err, $time);
    end
  endtask
  initial begin
    $dumpfile("138.vcd");
    $dumpvars(0, tb);
    rst = 1; go = 0; n = 0; d = 0;
    #12 rst = 0;
    divide(100, 7);
    divide(255, 16);
    divide(9, 10);
    divide(200, 1);
    divide(42, 0);
    divide(144, 12);
    $finish;
  end
endmodule
