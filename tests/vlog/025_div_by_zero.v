module tb;
  reg [7:0] a, b, q, r;
  integer i, z;
  reg signed [7:0] s;
  wire [7:0] wq = a / b;
  wire [7:0] wr = a % b;
  initial begin
    $dumpfile("025.vcd");
    $dumpvars(0, tb);
    a = 42; b = 0;
    #1 $display("wq=%b wr=%b", wq, wr);
    q = a / b; r = a % b;
    $display("q=%b r=%b q=%d", q, r, q);
    i = 100; z = 0;
    $display("int /0=%0d %%0=%0d", i / z, i % z);
    $display("int /0 bin %b", i / z);
    i = i / z;
    $display("i=%d", i);
    s = -5;
    $display("s/0=%b", s / 0);
    b = 7;
    #1 $display("wq=%0d wr=%0d", wq, wr);
    b = 8'b0000_0x00;
    #1 $display("x div wq=%b wr=%b", wq, wr);
    b = 0; a = 0;
    #1 $display("0/0 wq=%b wr=%b", wq, wr);
    $display("lit %b %b", 8'd5 / 8'd0, 4'd0 % 4'd0);
    $display("real %f", 1.0 * 3 / 2);
  end
endmodule
