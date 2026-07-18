module box (input [3:0] a, input b, output [3:0] y, output z);
  assign y = a ^ {4{b}};
  assign z = &a;
endmodule

module tb;
  reg [3:0] a;
  wire [3:0] y0, y1, y2;
  wire z0, z2;
  box u0 (.a(a), .b(1'b1), .y(y0), .z(z0));
  box u1 (.a(a), .b(), .y(y1), .z());
  box u2 (a, , y2, z2);
  initial begin
    $dumpfile("008.vcd");
    $dumpvars(0, tb);
    a = 4'b1111;
    #1 $display("y0=%b z0=%b y1=%b y2=%b z2=%b", y0, z0, y1, y2, z2);
    a = 4'b0101;
    #1 $display("y0=%b z0=%b y1=%b y2=%b z2=%b", y0, z0, y1, y2, z2);
    $display("u1.b=%b u2.b=%b", u1.b, u2.b);
  end
endmodule
