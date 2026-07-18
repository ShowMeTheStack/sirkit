module tb;
  reg [7:0] u;
  reg signed [7:0] s;
  reg signed [15:0] r;
  reg [15:0] ru;
  wire signed [11:0] ws;
  assign ws = $signed(u);
  initial begin
    $dumpfile("035.vcd");
    $dumpvars(0, tb);
    u = 8'hF0; s = -8'sd16;
    #1 $display("1 ws=%d %h", ws, ws);
    r = $signed(u);          $display("2 %d", r);
    r = $unsigned(s);        $display("3 %d", r);
    ru = $signed(u);         $display("4 %h", ru);
    r = $signed(u) + 1;      $display("5 %d", r);
    r = $signed(u) + 1'b1;   $display("6 %d", r);
    r = $signed(u) + 1'sb1;  $display("7 %d", r);
    $display("8 %b %b", $signed(u) < 0, u < 0);
    $display("9 %b %b", $unsigned(s) > 8'd100, s > 8'sd100);
    r = $signed(u[7:4]);     $display("10 %d", r);
    r = $signed(4'b0111);    $display("11 %d", r);
    r = $signed({1'b1, 3'b000}); $display("12 %d", r);
    r = $signed(u) >>> 4;    $display("13 %d", r);
    r = $unsigned($signed(u)) >>> 4; $display("14 %d", r);
    r = $signed(8'bx000_0001); $display("15 %b", r);
    $display("16 %0d %0d", $signed(3'b111), $unsigned(-3'sd1));
    r = $signed(u) * $signed(8'd2); $display("17 %d", r);
    r = $signed(u) * 8'd2;   $display("18 %d", r);
    r = -$unsigned(s);       $display("19 %d %h", r, r);
  end
endmodule
