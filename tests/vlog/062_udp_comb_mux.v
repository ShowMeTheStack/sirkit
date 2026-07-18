// Combinational UDPs: 2:1 mux with x-pessimism reduction, and a majority function
primitive mux2 (y, s, a, b);
  output y;
  input s, a, b;
  table
  // s a b : y
     0 0 ? : 0;
     0 1 ? : 1;
     1 ? 0 : 0;
     1 ? 1 : 1;
     ? 0 0 : 0;
     ? 1 1 : 1;
  endtable
endprimitive

primitive maj3 (m, a, b, c);
  output m;
  input a, b, c;
  table
     0 0 ? : 0;
     0 ? 0 : 0;
     ? 0 0 : 0;
     1 1 ? : 1;
     1 ? 1 : 1;
     ? 1 1 : 1;
  endtable
endprimitive

module tb;
  reg s, a, b, c;
  wire y, m;
  reg [3:0] v;
  integer i, j, k;

  mux2 u_mux (y, s, a, b);
  maj3 u_maj (m, a, b, c);

  initial begin
    v = 4'b01xz;
    $display("s a b | y");
    for (i = 2; i >= 0; i = i - 1)
      for (j = 3; j >= 0; j = j - 1)
        for (k = 3; k >= 2; k = k - 1) begin
          s = v[i]; a = v[j]; b = v[k];
          #1 $display("%b %b %b | %b", s, a, b, y);
        end
    s = 1'bx; a = 1'bz; b = 1'bz;
    #1 $display("x z z | %b (z input is x)", y);
    $display("a b c | m");
    for (i = 0; i < 27; i = i + 1) begin
      a = v[3 - i / 9]; b = v[3 - (i / 3) % 3]; c = v[3 - i % 3];
      #1 $write("%b%b%b:%b ", a, b, c, m);
      if (i % 9 == 8) $display;
    end
    $finish;
  end
endmodule
