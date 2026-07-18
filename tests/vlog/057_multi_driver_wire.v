// Several continuous drivers on plain wires: resolution of 0/1/x/z
module tb;
  reg [3:0] p, q;
  wire [3:0] w;
  wire       s;
  reg r1, r2, r3;

  assign w = p;
  assign w = q;
  assign s = r1;
  assign s = r2;
  assign s = r3;

  initial begin
    $dumpfile("057.vcd");
    $dumpvars(0, tb);
    p = 4'b0011; q = 4'bzzzz;
    #1 $display("p=%b q=%b w=%b", p, q, w);
    q = 4'b0101;
    #1 $display("p=%b q=%b w=%b", p, q, w);
    p = 4'bz1z0; q = 4'b1zz0;
    #1 $display("p=%b q=%b w=%b", p, q, w);
    p = 4'bx0z1; q = 4'bz0zx;
    #1 $display("p=%b q=%b w=%b", p, q, w);
    r1 = 1'bz; r2 = 1'bz; r3 = 1'bz;
    #1 $display("s: %b%b%b -> %b", r1, r2, r3, s);
    r2 = 1'b1;
    #1 $display("s: %b%b%b -> %b", r1, r2, r3, s);
    r3 = 1'b1;
    #1 $display("s: %b%b%b -> %b", r1, r2, r3, s);
    r1 = 1'b0;
    #1 $display("s: %b%b%b -> %b", r1, r2, r3, s);
    $finish;
  end
endmodule
