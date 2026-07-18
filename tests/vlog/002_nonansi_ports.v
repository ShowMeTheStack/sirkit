module mux2 (y, a, b, sel);
  output y;
  input a, b, sel;
  wire y;
  assign y = sel ? b : a;
endmodule

module swap8 (din, dout, mode);
  input [7:0] din;
  input [1:0] mode;
  output [7:0] dout;
  reg [7:0] dout;
  always @(din or mode)
    case (mode)
      2'd0: dout = din;
      2'd1: dout = {din[3:0], din[7:4]};
      2'd2: dout = ~din;
      default: dout = {din[0], din[1], din[2], din[3], din[4], din[5], din[6], din[7]};
    endcase
endmodule

module tb;
  reg a, b, sel;
  wire y;
  reg [7:0] d;
  reg [1:0] m;
  wire [7:0] q;
  mux2 m0 (.y(y), .sel(sel), .a(a), .b(b));
  swap8 s0 (.dout(q), .din(d), .mode(m));
  integer i;
  initial begin
    $dumpfile("002.vcd");
    $dumpvars(0, tb);
    a = 0; b = 1; sel = 0;
    #1 $display("sel=%b y=%b", sel, y);
    sel = 1;
    #1 $display("sel=%b y=%b", sel, y);
    sel = 1'bx;
    #1 $display("sel=%b y=%b", sel, y);
    a = 1;
    #1 $display("sel=%b a=b=1 y=%b", sel, y);
    d = 8'b1100_1010;
    for (i = 0; i < 4; i = i + 1) begin
      m = i;
      #1 $display("mode=%0d din=%b dout=%b", m, d, q);
    end
    $finish;
  end
endmodule
