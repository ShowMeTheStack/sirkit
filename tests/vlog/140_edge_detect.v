module sync_edge (input clk, input d, output rise, output fall, output any);
  reg s1, s2, s3;
  always @(posedge clk) begin
    s1 <= d;
    s2 <= s1;
    s3 <= s2;
  end
  assign rise = s2 & ~s3;
  assign fall = ~s2 & s3;
  assign any = s2 ^ s3;
endmodule

module debounce #(parameter N = 3) (input clk, input raw, output reg clean);
  reg [3:0] cnt;
  initial begin clean = 0; cnt = 0; end
  always @(posedge clk)
    if (raw == clean) cnt <= 0;
    else if (cnt == N - 1) begin clean <= raw; cnt <= 0; end
    else cnt <= cnt + 1;
endmodule

module tb;
  reg clk, d;
  wire r, f, a, c;
  reg [0:29] wave;
  integer i, rises, falls;
  sync_edge se (.clk(clk), .d(d), .rise(r), .fall(f), .any(a));
  debounce #(.N(3)) db (.clk(clk), .raw(d), .clean(c));
  always @(posedge clk) begin
    if (r) rises <= rises + 1;
    if (f) falls <= falls + 1;
  end
  initial begin
    clk = 0; d = 0; rises = 0; falls = 0;
    wave = 30'b0011_0111_1111_0010_0000_1111_1101_00;
    for (i = 0; i < 30; i = i + 1) begin
      d = wave[i];
      #3 clk = 1;
      #3 clk = 0;
      $display("%2d d=%b sync=%b%b%b rise=%b fall=%b any=%b clean=%b", i, d, se.s1, se.s2, se.s3, r, f, a, c);
    end
    $display("rises=%0d falls=%0d", rises, falls);
    $finish;
  end
endmodule
