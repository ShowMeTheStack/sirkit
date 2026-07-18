// $readmemh: whitespace, comments, case, short and long words
module tb;
  reg [7:0] rom [0:9];
  integer i;
  initial begin
    $dumpfile("181.vcd");
    $dumpvars(0, tb);
    for (i = 0; i < 10; i = i + 1) rom[i] = 8'h11;
    $readmemh("181_rom.hex", rom);
    for (i = 0; i < 10; i = i + 1)
      $display("rom[%0d] = %h (%0d)", i, rom[i], rom[i]);
    #1 $finish;
  end
endmodule
