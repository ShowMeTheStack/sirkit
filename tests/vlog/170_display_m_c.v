// %m in nested instances, tasks, functions and named blocks; %c with various values
module leaf #(parameter D = 1) ();
  task hello;
    $display("task in %m");
  endtask
  initial #D begin : body
    $display("leaf %m");
    hello;
  end
endmodule

module mid;
  leaf #(1) la ();
  leaf #(2) lb ();
  initial #3 $display("mid %m");
endmodule

module tb;
  mid m1 ();
  integer i;
  function [7:0] fn;
    input [7:0] x;
    begin
      $display("function %m x=%0d", x);
      fn = x + 1;
    end
  endfunction
  initial begin : named_block
    $display("block %m");
    #5;
    for (i = 33; i < 127; i = i + 7)
      $write("%c", i);
    $write("\n");
    $display("[%c][%c][%c]", 16'h4142, 65, "q");
    $display("fn=%0d", fn(9));
    begin : inner
      $display("inner %m");
    end
    $finish;
  end
endmodule
