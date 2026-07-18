module ram #(parameter AW = 3, DW = 6) (
  input clk, input we, input [AW-1:0] addr, input [DW-1:0] wd, output reg [DW-1:0] rd);
  reg [DW-1:0] cells [0:(1<<AW)-1];
  always @(posedge clk) begin
    if (we) cells[addr] <= wd;
    rd <= cells[addr];
  end
endmodule

module tb;
  reg clk, we;
  reg [2:0] addr;
  reg [5:0] wd;
  wire [5:0] rd;
  integer i;
  ram r (.clk(clk), .we(we), .addr(addr), .wd(wd), .rd(rd));
  initial clk = 0;
  always #5 clk = !clk;
  initial begin
    $dumpfile("013.vcd");
    $dumpvars(0, tb);
    we = 1;
    for (i = 0; i < 8; i = i + 1) begin
      addr = i; wd = 6'd63 - i * 5;
      @(posedge clk);
      #1 $display("w addr=%0d wd=%0d rd=%b", addr, wd, rd);
    end
    we = 0;
    for (i = 7; i >= 0; i = i - 2) begin
      addr = i;
      @(posedge clk);
      #1 $display("r addr=%0d rd=%0d %o", addr, rd, rd);
    end
    we = 1; addr = 3; wd = 6'b111111;
    @(posedge clk) #1 $display("rw rd=%0d cell=%0d", rd, r.cells[3]);
    $finish;
  end
endmodule
