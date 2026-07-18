// Default field widths of unformatted arguments and of %d/%h/%o/%b
module tb;
  reg [0:0] b1;
  reg [3:0] n4;
  reg [9:0] n10;
  reg [31:0] n32;
  reg [63:0] n64;
  reg signed [9:0] sn10;
  integer i;
  time t;
  real r;
  initial begin
    b1 = 1; n4 = 9; n10 = 1000; n32 = 1; n64 = 64'd123456789012; sn10 = -500;
    i = -1; t = 55; r = 1.5;
    $display(b1, n4, n10, n32);
    $display(n64, sn10, i);
    $display(t, r);
    $display("d: [%d] [%d] [%d] [%d] [%d]", b1, n4, n10, n32, n64);
    $display("h: [%h] [%h] [%h] [%h] [%h]", b1, n4, n10, n32, n64);
    $display("o: [%o] [%o] [%o] [%o]", b1, n4, n10, n32);
    $display("b: [%b] [%b]", n4, n10);
    $display("signed: [%d] [%d] [%h]", sn10, i, sn10);
    $display("time: [%d] [%t]", t, t);
    $display("literal %d then", 1'b1, " and ", 7);
    $display("trailing args:", n4, " ", n10);
    $display();
    $display("after empty line");
    $display("x as default ", 4'bx01z);
  end
endmodule
