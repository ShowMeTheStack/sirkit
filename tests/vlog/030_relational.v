module tb;
  reg [7:0] u1, u2;
  reg signed [7:0] s1, s2;
  initial begin
    $dumpfile("030.vcd");
    $dumpvars(0, tb);
    u1 = 8'd200; u2 = 8'd50;
    s1 = -8'sd56; s2 = 8'sd50;
    $display("u: < %b <= %b > %b >= %b", u1 < u2, u1 <= u2, u1 > u2, u1 >= u2);
    $display("s: < %b <= %b > %b >= %b", s1 < s2, s1 <= s2, s1 > s2, s1 >= s2);
    $display("mixed s1<u2 %b  s1<s2 %b", s1 < u2, s1 < s2);
    $display("s1 < 0 %b  s1 < 0u %b  s1 < 8'sd0 %b", s1 < 0, s1 < 'd0, s1 < 8'sd0);
    $display("int -1 > 1'b0? %b  -1 > 32'd0? %b", -1 > 1'b0, -1 > 32'd0);
    $display("eq %b %b %b", u1 == 200, s1 == 200, s1 == -56);
    $display("width zero-ext %b %b", 4'b1111 == 8'b0000_1111, 4'sb1111 == 8'sb1111_1111);
    $display("mix ext %b", 4'sb1111 == 8'b1111_1111);
    u1 = 8'b0000_x000;
    $display("x: %b %b %b %b", u1 < 8'd100, u1 > 8'd100, u1 <= 8'd255, u1 >= 0);
    u1 = 8'bz;
    $display("z: %b", u1 < 1);
    $display("equal edges %b %b", 8'd5 <= 8'd5, 8'd5 >= 8'd6);
    $display("in arith %0d", (u2 > 10) + (u2 > 20) + (u2 > 60));
    $display("chained %b", 3 > 2 > 1);
  end
endmodule
