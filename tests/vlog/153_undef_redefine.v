// `undef and redefinition change what later text expands to
`define LEVEL 1
`define NAME "first"

module tb;
  integer a, b, c;
  initial begin
    a = `LEVEL;
    $display("a=%0d name=%s", a, `NAME);
`undef LEVEL
`define LEVEL 22
    b = `LEVEL;
`undef NAME
`define NAME "second"
    $display("b=%0d name=%s", b, `NAME);
`ifdef LEVEL
    $display("LEVEL defined");
`endif
`undef LEVEL
`ifdef LEVEL
    $display("LEVEL still defined");
`else
    $display("LEVEL gone");
`endif
`define LEVEL (3 + 4)
    c = `LEVEL * 2;
    $display("c=%0d", c);
`undef NAME
`ifndef NAME
    $display("NAME gone");
`endif
    $finish;
  end
endmodule
