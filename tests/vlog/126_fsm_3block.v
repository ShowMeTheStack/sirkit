`timescale 1ns/100ps
// vending-style controller: three-block FSM with registered outputs
module vend (input clk, input rst, input [1:0] coin, output reg give, output reg [1:0] change);
  localparam [2:0] IDLE = 3'b001, HAVE5 = 3'b010, HAVE10 = 3'b100;
  reg [2:0] cur, nxt;
  always @(posedge clk) begin
    if (rst) cur <= IDLE;
    else cur <= nxt;
  end
  always @* begin
    nxt = cur;
    case (cur)
      IDLE:   if (coin == 2'd1) nxt = HAVE5;
              else if (coin == 2'd2) nxt = HAVE10;
      HAVE5:  if (coin == 2'd1) nxt = HAVE10;
              else if (coin == 2'd2) nxt = IDLE;
      HAVE10: if (coin != 2'd0) nxt = IDLE;
      default: nxt = IDLE;
    endcase
  end
  always @(posedge clk) begin
    if (rst) begin give <= 0; change <= 0; end
    else begin
      give <= 0; change <= 0;
      case (cur)
        HAVE5:  if (coin == 2'd2) give <= 1;
        HAVE10: if (coin == 2'd1) give <= 1;
                else if (coin == 2'd2) begin give <= 1; change <= 2'd1; end
        default: ;
      endcase
    end
  end
endmodule

module tb;
  reg clk, rst;
  reg [1:0] coin;
  wire give;
  wire [1:0] change;
  vend v (.clk(clk), .rst(rst), .coin(coin), .give(give), .change(change));
  initial clk = 0;
  always #5 clk = !clk;
  task put;
    input [1:0] c;
    begin
      coin = c;
      @(negedge clk);
      $display("%t coin=%0d state=%b give=%b change=%0d", $time, c, v.cur, give, change);
    end
  endtask
  initial begin
    $dumpfile("126.vcd");
    $dumpvars(0, tb);
    rst = 1; coin = 0;
    @(negedge clk);
    @(negedge clk) rst = 0;
    put(1); put(1); put(1); put(0);
    put(2); put(2); put(0);
    put(1); put(2); put(0);
    put(2); put(1); put(3); put(0);
    $finish;
  end
endmodule
