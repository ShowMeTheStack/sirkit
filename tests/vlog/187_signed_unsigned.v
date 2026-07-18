// $signed / $unsigned in expressions, comparisons, shifts, extension
module tb;
  reg [7:0] u;
  reg signed [7:0] s;
  reg [15:0] w;
  reg signed [15:0] sw;
  initial begin
    $dumpfile("187.vcd");
    $dumpvars(0, tb);
    u = 8'hF0; s = -8'sd16;
    $display("u=%0d signed(u)=%0d s=%0d unsigned(s)=%0d", u, $signed(u), s, $unsigned(s));
    #1 w = $signed(u);
    sw = u;
    $display("w=%h sw=%h", w, sw);
    #1 w = $unsigned(s);
    sw = s;
    $display("w=%h sw=%h", w, sw);
    $display("cmp: %b %b %b %b", u > 8'd3, $signed(u) > 8'sd3, s < 0, $unsigned(s) < 0);
    $display("mixed cmp: %b", s < 8'd5);
    $display("shift: %b %b %b", u >>> 2, $signed(u) >>> 2, s >> 2);
    $display("div: %0d %0d", $signed(u) / 3, u / 3);
    $display("mod: %0d %0d", $signed(8'hF9) % 4, 8'hF9 % 4);
    $display("add ext: %h %h", $signed(4'b1000) + 8'sd0, $unsigned(4'b1000) + 8'd0);
    $display("nested: %0d", $signed($unsigned(-3'sd1)));
    sw = $signed(u) * $signed(8'h02);
    $display("mul: %0d", sw);
    sw = u * 2;
    $display("mul unsigned: %0d", sw);
    $display("x: %b %d", $signed(4'b1x00), $signed(4'b1x00));
    $finish;
  end
endmodule
