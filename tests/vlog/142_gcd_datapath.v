`timescale 1ns/1ps
module gcd_dp (input clk, input ld, input sel_a, input sel_b, input [15:0] ain, bin,
               output reg [15:0] a, b, output eq, output lt);
  assign eq = (a == b);
  assign lt = (a < b);
  always @(posedge clk) begin
    if (ld) begin a <= ain; b <= bin; end
    else begin
      if (sel_a) a <= a - b;
      if (sel_b) b <= b - a;
    end
  end
endmodule

module gcd_ctl (input clk, input rst, input start, input eq, input lt,
                output reg ld, output reg sel_a, output reg sel_b, output reg done);
  localparam S_IDLE = 2'd0, S_LOAD = 2'd1, S_RUN = 2'd2, S_DONE = 2'd3;
  reg [1:0] s, ns;
  always @(posedge clk or posedge rst)
    if (rst) s <= S_IDLE; else s <= ns;
  always @* begin
    ns = s;
    case (s)
      S_IDLE: if (start) ns = S_LOAD;
      S_LOAD: ns = S_RUN;
      S_RUN:  if (eq) ns = S_DONE;
      S_DONE: if (!start) ns = S_IDLE;
    endcase
  end
  always @* begin
    {ld, sel_a, sel_b, done} = 4'b0000;
    case (s)
      S_LOAD: ld = 1;
      S_RUN:  if (!eq) begin sel_a = !lt; sel_b = lt; end
      S_DONE: done = 1;
      default: ;
    endcase
  end
endmodule

module gcd_top (input clk, rst, start, input [15:0] x, y, output [15:0] g, output done);
  wire ld, sa, sb, eq, lt;
  wire [15:0] a, b;
  gcd_dp dp (.clk(clk), .ld(ld), .sel_a(sa), .sel_b(sb), .ain(x), .bin(y), .a(a), .b(b), .eq(eq), .lt(lt));
  gcd_ctl ctl (.clk(clk), .rst(rst), .start(start), .eq(eq), .lt(lt), .ld(ld), .sel_a(sa), .sel_b(sb), .done(done));
  assign g = a;
endmodule

module tb;
  reg clk, rst, start;
  reg [15:0] x, y;
  wire [15:0] g;
  wire done;
  integer cyc;
  gcd_top u (clk, rst, start, x, y, g, done);
  always #5 clk = ~clk;
  task run;
    input [15:0] p, q;
    begin
      @(negedge clk) begin x = p; y = q; start = 1; end
      cyc = 0;
      while (!done) begin @(negedge clk); cyc = cyc + 1; end
      $display("%t gcd(%0d,%0d)=%0d cycles=%0d a=%0d b=%0d", $time, p, q, g, cyc, u.dp.a, u.dp.b);
      start = 0;
      @(negedge clk);
    end
  endtask
  initial begin
    $dumpfile("142.vcd");
    $dumpvars(0, tb);
    clk = 0; rst = 1; start = 0; x = 0; y = 0;
    #7 rst = 0;
    run(48, 18);
    run(17, 5);
    run(1000, 1000);
    run(7, 91);
    $finish;
  end
endmodule
