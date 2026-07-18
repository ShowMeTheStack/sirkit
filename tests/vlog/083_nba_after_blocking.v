// Blocking and non-blocking writes to the same variable within one step
module tb;
  reg [7:0] r, s;
  reg [3:0] v;

  initial begin
    r = 8'd1;
    r <= 8'd2;
    $display("A r=%0d", r);
    r = 8'd3;
    $display("B r=%0d", r);
    #1 $display("C r=%0d (NBA overwrote the later blocking write)", r);

    s <= 8'd10;
    s = s + 8'd1;          // s was x: becomes x
    $display("D s=%b", s);
    #1 $display("E s=%0d", s);

    s <= s + 8'd5;         // reads s=10 now
    s = 8'd100;
    s <= s + 8'd1;         // reads s=100 now; later NBA wins
    #1 $display("F s=%0d", s);

    v = 4'b0000;
    v[0] <= 1'b1;
    v[1] = 1'b1;
    v[2] <= 1'b1;
    v = v | 4'b1000;
    $display("G v=%b", v);
    #1 $display("H v=%b", v);
    $finish;
  end
endmodule
