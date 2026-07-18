// Level-sensitive sequential UDP: transparent latch with '-' (no change)
primitive dlatch (q, en, d);
  output q;
  reg q;
  input en, d;
  table
  // en d : q : q+
     1  0 : ? : 0;
     1  1 : ? : 1;
     0  ? : ? : -;
     x  0 : 0 : 0;
     x  1 : 1 : 1;
  endtable
endprimitive

module tb;
  reg en, d;
  wire q;

  dlatch L (q, en, d);

  initial begin
    $dumpfile("064.vcd");
    $dumpvars(0, tb);
    $monitor("%0t en=%b d=%b q=%b", $time, en, d, q);
    en = 0; d = 0;
    #5 d = 1;
    #5 en = 1;
    #5 d = 0;
    #5 d = 1;
    #5 en = 0;
    #5 d = 0;
    #5 en = 1'bx;
    #5 d = 1;
    #5 en = 1;
    #5 en = 1'bx;
    #5 d = 0;
    #5 en = 0;
    #5 $finish;
  end
endmodule
