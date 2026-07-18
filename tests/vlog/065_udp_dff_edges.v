// Edge-sensitive UDP: rising-edge D flip-flop written with explicit edge pairs
primitive dff_up (q, clk, d);
  output q;
  reg q;
  input clk, d;
  table
  // clk  d : q : q+
     (01) 0 : ? : 0;
     (01) 1 : ? : 1;
     (0x) 1 : 1 : 1;
     (0x) 0 : 0 : 0;
     (?0) ? : ? : -;
     (1x) ? : ? : -;
     ?  (??) : ? : -;
  endtable
endprimitive

module tb;
  reg clk, d;
  wire q;
  integer n;

  dff_up ff (q, clk, d);

  initial begin
    $dumpfile("065.vcd");
    $dumpvars(0, tb);
    clk = 0; d = 0; n = 0;
    #1 $display("start q=%b", q);
    d = 1; #1 clk = 1; #1 $display("rise d=1 -> q=%b", q);
    d = 0; #1 $display("d change, no edge -> q=%b", q);
    clk = 0; #1 $display("fall -> q=%b", q);
    clk = 1; #1 $display("rise d=0 -> q=%b", q);
    clk = 1'bx; #1 $display("1->x -> q=%b", q);
    clk = 0; #1 $display("x->0 -> q=%b", q);
    d = 1; clk = 1'bx; #1 $display("0->x d=1, q was 0 -> q=%b", q);
    clk = 0; #1 clk = 1; #1 $display("rise d=1 -> q=%b", q);
    clk = 0; #1 clk = 1'bx; #1 $display("0->x d=1, q=1 -> q=%b", q);
    clk = 1; #1 $display("x->1 (unlisted) -> q=%b", q);
    $finish;
  end
endmodule
