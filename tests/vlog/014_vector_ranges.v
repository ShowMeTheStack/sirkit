module tb;
  reg [7:4] hi;
  reg [-2:5] odd;
  reg [3:-4] fix;
  reg [0:0] one;
  reg [31:0] big;
  wire [7:0] sh;
  assign sh = {hi, hi};
  initial begin
    $dumpfile("014.vcd");
    $dumpvars(0, tb);
    hi = 4'b1001;
    odd = 8'b1100_0011;
    fix = 8'h5A;
    one = 1'b1;
    big = 32'd0;
    #1;
    $display("hi[7]=%b hi[4]=%b hi[6:5]=%b sh=%b", hi[7], hi[4], hi[6:5], sh);
    $display("odd[-2]=%b odd[5]=%b odd[-2:1]=%b odd[2:5]=%b", odd[-2], odd[5], odd[-2:1], odd[2:5]);
    $display("fix int=%b frac=%b fix[-4]=%b", fix[3:0], fix[-1:-4], fix[-4]);
    $display("one=%b one[0]=%b", one, one[0]);
    big[31:28] = hi;
    big[3:0] = fix[3:0];
    $display("big=%h", big);
    odd[0 +: 3] = 3'b111;
    $display("odd=%b", odd);
    fix[-1 -: 2] = 2'b00;
    $display("fix=%b", fix);
  end
endmodule
