`timescale 1ns/1ns
module traffic (input clk, input rst, input car, output reg [2:0] main_l, output reg [2:0] side_l);
  localparam MG = 2'd0, MY = 2'd1, SG = 2'd2, SY = 2'd3;
  localparam RED = 3'b100, YEL = 3'b010, GRN = 3'b001;
  reg [1:0] st;
  reg [3:0] tmr;
  always @(posedge clk) begin
    if (rst) begin st <= MG; tmr <= 0; end
    else begin
      tmr <= tmr + 1;
      case (st)
        MG: if (car && tmr >= 4) begin st <= MY; tmr <= 0; end
        MY: if (tmr == 1) begin st <= SG; tmr <= 0; end
        SG: if (!car || tmr == 3) begin st <= SY; tmr <= 0; end
        SY: if (tmr == 1) begin st <= MG; tmr <= 0; end
      endcase
    end
  end
  always @* begin
    case (st)
      MG: begin main_l = GRN; side_l = RED; end
      MY: begin main_l = YEL; side_l = RED; end
      SG: begin main_l = RED; side_l = GRN; end
      SY: begin main_l = RED; side_l = YEL; end
    endcase
  end
endmodule

module tb;
  reg clk, rst, car;
  wire [2:0] m, s;
  traffic t (clk, rst, car, m, s);
  function [8*3:1] nm;
    input [2:0] l;
    nm = l == 3'b100 ? "RED" : l == 3'b010 ? "YEL" : l == 3'b001 ? "GRN" : "???";
  endfunction
  always #5 clk = ~clk;
  initial begin
    $dumpfile("136.vcd");
    $dumpvars(0, tb);
    clk = 0; rst = 1; car = 0;
    #12 rst = 0;
    #30 car = 1;
    #100 car = 0;
    #40 car = 1;
    #20 car = 0;
    #60 $finish;
  end
  always @(negedge clk) if (!rst)
    $display("%0t car=%b st=%0d tmr=%0d main=%s side=%s", $time, car, t.st, t.tmr, nm(m), nm(s));
endmodule
