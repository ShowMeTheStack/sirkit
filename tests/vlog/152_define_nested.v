// Macros that use other macros, macros in module headers and ports
`define BUS_W 4
`define BUS [`BUS_W-1:0]
`define WIDE [2*`BUS_W-1:0]
`define ADD(a, b) ((a) + (b))
`define ADD3(a, b, c) `ADD(`ADD(a, b), c)
`define ZEXT(v) {{`BUS_W{1'b0}}, v}
`define STAGE_DELAY #2

module adder_w (input `BUS x, input `BUS y, output `WIDE s);
  assign `STAGE_DELAY s = `ADD(`ZEXT(x), `ZEXT(y));
endmodule

module tb;
  reg `BUS p, q;
  wire `WIDE sum;
  integer k;
  adder_w u0 (.x(p), .y(q), .s(sum));
  initial begin
    $dumpfile("152.vcd");
    $dumpvars(0, tb);
    $display("ADD3 = %0d", `ADD3(1, 2, 3));
    $display("ZEXT = %b", `ZEXT(4'b1011));
    for (k = 0; k < 5; k = k + 1) begin
      p = k * 3; q = 15 - k;
      #3 $display("t=%0t p=%0d q=%0d sum=%0d (%b)", $time, p, q, sum, sum);
    end
    p = 4'b1x01; q = 1;
    #3 $display("t=%0t sum=%b", $time, sum);
    $finish;
  end
endmodule
