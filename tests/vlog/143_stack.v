module lifo (clk, rst, push, pop, din, top, depth, overflow, underflow);
  parameter W = 8, N = 4;
  input clk, rst, push, pop;
  input [W-1:0] din;
  output [W-1:0] top;
  output [2:0] depth;
  output reg overflow, underflow;
  reg [W-1:0] st [0:N-1];
  reg [2:0] sp;
  assign depth = sp;
  assign top = (sp == 0) ? {W{1'bz}} : st[sp - 1];
  always @(posedge clk) begin
    if (rst) begin sp <= 0; overflow <= 0; underflow <= 0; end
    else begin
      overflow <= 0; underflow <= 0;
      case ({push, pop})
        2'b10: if (sp == N) overflow <= 1; else begin st[sp] <= din; sp <= sp + 1; end
        2'b01: if (sp == 0) underflow <= 1; else sp <= sp - 1;
        2'b11: if (sp != 0) st[sp - 1] <= din;
        default: ;
      endcase
    end
  end
endmodule

module tb;
  reg clk, rst, push, pop;
  reg [7:0] din;
  wire [7:0] top;
  wire [2:0] depth;
  wire ov, un;
  lifo #(.W(8), .N(4)) s (.clk(clk), .rst(rst), .push(push), .pop(pop), .din(din),
       .top(top), .depth(depth), .overflow(ov), .underflow(un));
  always #5 clk = ~clk;
  task op;
    input [1:0] pp;
    input [7:0] d;
    begin
      {push, pop} = pp; din = d;
      @(negedge clk);
      $display("push=%b pop=%b din=%h -> top=%h depth=%0d ov=%b un=%b", pp[1], pp[0], d, top, depth, ov, un);
    end
  endtask
  initial begin
    clk = 0; rst = 1; push = 0; pop = 0; din = 0;
    @(negedge clk) rst = 0;
    op(2'b01, 0);
    op(2'b10, 8'hA1);
    op(2'b10, 8'hB2);
    op(2'b11, 8'hC3);
    op(2'b10, 8'hD4);
    op(2'b10, 8'hE5);
    op(2'b10, 8'hF6);
    op(2'b00, 0);
    op(2'b01, 0);
    op(2'b01, 0);
    op(2'b01, 0);
    op(2'b01, 0);
    op(2'b01, 0);
    $display("mem %h %h %h %h", s.st[0], s.st[1], s.st[2], s.st[3]);
    $finish;
  end
endmodule
