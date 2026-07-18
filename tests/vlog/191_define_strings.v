// Macros that expand to format strings, task calls and statements
`define FMT "%s=%0d"
`define LOG(n, v) $display(`FMT, n, v)
`define TICK(n) #(n)
`define SWAP(a, b) begin tmp = a; a = b; b = tmp; end
`define REPEAT3(stmt) begin stmt; stmt; stmt; end
`define COMMA ,
`define PAIR(a, b) {a `COMMA b}

module tb;
  reg [7:0] x, y, tmp;
  reg [15:0] p;
  initial begin
    $dumpfile("191.vcd");
    $dumpvars(0, tb);
    x = 3; y = 200;
    `LOG("x", x);
    `LOG("y", y);
    `TICK(4) `SWAP(x, y)
    `LOG("x after swap", x);
    `LOG("y after swap", y);
    `REPEAT3(x = x + 1)
    `LOG("x+3", x);
    `TICK(2);
    p = `PAIR(x, y);
    $display("pair=%h at %0t", p, $time);
    `define LATE 77
    `LOG("late", `LATE);
    $finish;
  end
endmodule
