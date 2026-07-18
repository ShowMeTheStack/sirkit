module tb;
  reg sel;
  reg [7:0] a, b;
  reg [1:0] s2;
  wire [7:0] y = sel ? a : b;
  initial begin
    $dumpfile("034.vcd");
    $dumpvars(0, tb);
    a = 8'b1100_1010; b = 8'b1010_1100;
    sel = 1; #1 $display("sel=%b y=%b", sel, y);
    sel = 0; #1 $display("sel=%b y=%b", sel, y);
    sel = 1'bx; #1 $display("sel=%b y=%b", sel, y);
    sel = 1'bz; #1 $display("sel=%b y=%b", sel, y);
    b = a;
    sel = 1'bx; #1 $display("same sel=%b y=%b", sel, y);
    a = 8'b0000_xxzz; b = 8'b0000_xzxz;
    #1 $display("xz merge y=%b", y);
    s2 = 2'b0x;
    $display("multi bit cond %b", s2 ? 4'hF : 4'h0);
    s2 = 2'b1x;
    $display("multi bit cond %b", s2 ? 4'hF : 4'h0);
    s2 = 2'b00;
    $display("nested %0d", s2 == 0 ? 10 : s2 == 1 ? 20 : 30);
    $display("width %b", 1'bx ? 2'b10 : 6'b10_1010);
    $display("signed %0d %0d", 1'b1 ? -4'sd3 : 4'sd1, 1'b1 ? -4'sd3 : 4'd1);
    $display("int %0d", 1'bx ? 5 : 7);
    $display("int same %0d", 1'bx ? 6 : 6);
  end
endmodule
