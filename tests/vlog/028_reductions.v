module tb;
  reg [7:0] v;
  integer i;
  reg [7:0] tests [0:7];
  initial begin
    $dumpfile("028.vcd");
    $dumpvars(0, tb);
    tests[0] = 8'h00;
    tests[1] = 8'hFF;
    tests[2] = 8'h01;
    tests[3] = 8'b1111_111x;
    tests[4] = 8'b0000_000z;
    tests[5] = 8'b0110_x001;
    tests[6] = 8'b1z11_1111;
    tests[7] = 8'b1011_0111;
    for (i = 0; i < 8; i = i + 1) begin
      v = tests[i];
      #1 $display("%b & %b ~& %b | %b ~| %b ^ %b ~^ %b ^~ %b", v, &v, ~&v, |v, ~|v, ^v, ~^v, ^~v);
    end
    $display("in expr %b %b", &v + 1'b1, |v ? 3 : 4);
    $display("width %0d", (&v) + 8'd255);
    $display("not vs lnot %b %b %b", !v, ~v, !(|v));
    $display("parity of 6 %b and 7 %b", ^3'd6, ^3'd7);
  end
endmodule
