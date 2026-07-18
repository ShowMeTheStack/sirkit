// Fewer words than memory: the rest keep their values; uninitialised words are x
module tb;
  reg [11:0] mem [0:5];
  reg [11:0] fresh [0:3];
  reg [11:0] q;
  integer i;
  initial begin
    $dumpfile("184.vcd");
    $dumpvars(0, tb);
    mem[3] = 12'h333;
    mem[5] = 12'h555;
    $readmemh("184_part.hex", mem);
    $readmemh("184_part.hex", fresh, 1);
    for (i = 0; i < 6; i = i + 1) begin
      #1 q = mem[i];
      $display("mem[%0d] = %h", i, q);
    end
    for (i = 0; i < 4; i = i + 1)
      $display("fresh[%0d] = %h %b", i, fresh[i], fresh[i]);
    $display("out of range read: %h", mem[7]);
    $finish;
  end
endmodule
