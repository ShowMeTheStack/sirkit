module tb;
  reg [3:0] a, b;
  wire [3:0] wand_, wor_, wxor, wxnor, wnot;
  assign wand_ = a & b;
  assign wor_ = a | b;
  assign wxor = a ^ b;
  assign wxnor = a ~^ b;
  assign wnot = ~a;
  initial begin
    $dumpfile("027.vcd");
    $dumpvars(0, tb);
    a = 4'b01xz;
    b = 4'b0000;
    #1 $display("a=%b b=%b and=%b or=%b xor=%b xnor=%b not=%b", a, b, wand_, wor_, wxor, wxnor, wnot);
    b = 4'b1111;
    #1 $display("a=%b b=%b and=%b or=%b xor=%b xnor=%b not=%b", a, b, wand_, wor_, wxor, wxnor, wnot);
    b = 4'bxxxx;
    #1 $display("a=%b b=%b and=%b or=%b xor=%b xnor=%b not=%b", a, b, wand_, wor_, wxor, wxnor, wnot);
    b = 4'bzzzz;
    #1 $display("a=%b b=%b and=%b or=%b xor=%b xnor=%b not=%b", a, b, wand_, wor_, wxor, wxnor, wnot);
    $display("^~ %b  ~& %b", 4'b10xz ^~ 4'b1100, ~(4'b10xz & 4'b0z1z));
    $display("width %b %b", 4'b1010 & 8'b1111_1111, 2'b11 | 6'b100000);
    $display("signed ext %b", 4'sb1000 | 8'b0000_0000);
    $display("unsigned ext %b", 4'b1000 | 8'b0000_0000);
    $display("mix %b", ~4'b0 ^ 4'bz0x1);
  end
endmodule
