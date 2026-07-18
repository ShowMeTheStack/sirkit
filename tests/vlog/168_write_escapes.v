// $write without newline, escape sequences, %%
module tb;
  integer i;
  initial begin
    $write("a");
    $write("b");
    $write("c\n");
    $display("tab:\t|end");
    $display("backslash: \\ quote: \" percent: %% done");
    $display("two\nlines");
    $write("100%% sure\n");
    $display("octal escape: \101\102\103");
    for (i = 0; i < 4; i = i + 1)
      $write("%0d,", i);
    $write("\n");
    $write("no args then newline\n");
    $display("%s|%s", "\t", "x");
    $display("mixed %0d\t%0d\\%0d", 1, 2, 3);
    $write("end without newline");
    $display("");
  end
endmodule
