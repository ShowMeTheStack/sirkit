// Plain text macros: constants, expressions, widths
`define WIDTH 8
`define TOP (`WIDTH-1)
`define INIT_VAL 8'hA5
`define MSG "macro text"
`define DOUBLE_IT x + x
`define ZERO 0

module tb;
  reg [`TOP:0] a;
  reg [`WIDTH*2-1:0] b;
  integer x;
  initial begin
    $dumpfile("150.vcd");
    $dumpvars(0, tb);
    a = `INIT_VAL;
    b = {a, ~a};
    x = 7;
    $display("WIDTH=%0d TOP=%0d", `WIDTH, `TOP);
    $display("a=%h b=%h", a, b);
    $display("%s", `MSG);
    // macro without parentheses: precedence follows the text
    $display("2*DOUBLE_IT = %0d", 2 * `DOUBLE_IT);
    $display("(DOUBLE_IT)*2 = %0d", (`DOUBLE_IT) * 2);
    #5 a = a + `ZERO + 1;
    $display("t=%0t a=%b", $time, a);
    #5 a = `WIDTH'd3;
    $display("t=%0t a=%b", $time, a);
    $finish;
  end
endmodule
