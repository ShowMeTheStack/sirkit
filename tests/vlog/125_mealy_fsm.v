// Mealy: detects 1101 overlapping; output asserted in the same cycle as the last bit
module det_mealy (clk, rst, x, z);
  input clk, rst, x;
  output z;
  reg z;
  parameter A = 2'b00, B = 2'b01, C = 2'b10, D = 2'b11;
  reg [1:0] st, nx;
  always @(posedge clk or posedge rst)
    if (rst) st <= A;
    else st <= nx;
  always @(st or x) begin
    z = 1'b0;
    case (st)
      A: nx = x ? B : A;
      B: nx = x ? C : A;
      C: nx = x ? C : D;
      D: begin
           nx = x ? B : A;
           z = x;
         end
    endcase
  end
endmodule

module tb;
  reg clk, rst, x;
  wire z;
  reg [23:0] bits;
  integer i, hits;
  det_mealy m (clk, rst, x, z);
  always #10 clk = ~clk;
  always @(posedge clk) if (z) hits = hits + 1;
  initial begin
    $dumpfile("125.vcd");
    $dumpvars(0, tb);
    clk = 0; rst = 1; x = 0; hits = 0;
    bits = 24'b1101_1101_0011_0110_1101_0110;
    #15 rst = 0;
    for (i = 23; i >= 0; i = i - 1) begin
      x = bits[i];
      #1 $write("%b", z);
      @(negedge clk);
    end
    $display("");
    $display("hits=%0d st=%b", hits, m.st);
    x = 1'bx;
    #1 $display("x input: z=%b nx=%b", z, m.nx);
    $finish;
  end
endmodule
