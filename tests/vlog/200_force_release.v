// force and release on a net and on a variable, and procedural assign / deassign
module tb;
  reg a, b;
  wire y = a & b;
  reg q;
  reg [3:0] r;
  initial begin
    $dumpfile("200.vcd");
    $dumpvars(0, tb);
    a = 1; b = 1; q = 0; r = 4'h3;
    #1 $display("start y=%b q=%b r=%h", y, q, r);
    force y = 1'b0;
    #1 $display("forced y=%b", y);
    a = 0; b = 0;
    #1 $display("inputs low, still forced y=%b", y);
    release y;
    #1 $display("released y=%b", y);
    a = 1; b = 1;
    #1 $display("inputs high y=%b", y);
    force q = 1'b0;
    #1 $display("q forced to 0: %b", q);
    a = 0;
    #1 $display("a=0 and q=%b", q);
    q = 1;
    #1 $display("assignment ignored while forced: q=%b", q);
    release q;
    #1 $display("released q keeps %b", q);
    q = 1;
    #1 $display("now q=%b", q);
    assign r = 4'b0101;
    #1 $display("procedural assign r=%b", r);
    r = 4'b1111;
    #1 $display("ordinary assignment ignored: r=%b", r);
    deassign r;
    r = 4'hc;
    #1 $display("after deassign r=%h", r);
    $finish;
  end
endmodule
