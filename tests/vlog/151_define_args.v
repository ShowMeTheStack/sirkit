// Macros with arguments
`define MAX(p, q) ((p) > (q) ? (p) : (q))
`define MIN(p, q) ((p) < (q) ? (p) : (q))
`define SQ(v) ((v) * (v))
`define BAD_SQ(v) v * v
`define BIT(n) (1 << (n))
`define SHOW(label, val) $display("%s = %0d", label, val)
`define CLAMP(v, lo, hi) `MIN(`MAX(v, lo), hi)

module tb;
  integer i, j;
  reg [7:0] r;
  initial begin
    $dumpfile("151.vcd");
    $dumpvars(0, tb);
    i = 12; j = -4;
    `SHOW("max", `MAX(i, j));
    `SHOW("min", `MIN(i, j));
    `SHOW("sq(i+1)", `SQ(i + 1));
    `SHOW("bad_sq(i+1)", `BAD_SQ(i + 1));
    `SHOW("bit5", `BIT(5));
    for (i = -3; i <= 13; i = i + 4) begin
      r = `CLAMP(i, 0, 9);
      $display("clamp(%0d) = %0d", i, r);
      #1;
    end
    `SHOW("nested", `MAX(`SQ(3), `BIT(3)));
    $finish;
  end
endmodule
