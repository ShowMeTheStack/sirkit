// Sequential UDP with r/f/p/n/* shorthands and an asynchronous active-low clear
primitive dffr (q, clk, d, rst_n);
  output q;
  reg q;
  input clk, d, rst_n;
  table
  // clk d rst_n : q : q+
     ?   ?   0   : ? : 0;
     r   0   1   : ? : 0;
     r   1   1   : ? : 1;
     p   1   1   : 1 : 1;
     p   0   1   : 0 : 0;
     n   ?   1   : ? : -;
     ?   *   1   : ? : -;
     ?   ?   p   : ? : -;
     ?   ?   x   : 0 : 0;
  endtable
endprimitive

module tb;
  reg clk, d, rst_n;
  wire q;
  reg [7:0] trace;

  dffr u (q, clk, d, rst_n);

  always #5 clk = ~clk;

  initial begin
    $dumpfile("066.vcd");
    $dumpvars(0, tb);
    clk = 0; d = 1; rst_n = 1; trace = 0;
    #2 rst_n = 0;
    #1 $display("%0t after clear q=%b", $time, q);
    #1 rst_n = 1;
    repeat (6) begin
      @(negedge clk) d = ~d;
      #1 trace = {trace[6:0], q};
      $display("%0t q=%b d=%b", $time, q, d);
    end
    @(negedge clk) rst_n = 1'bx;
    #1 $display("%0t rst=x q=%b", $time, q);
    @(posedge clk) #1 $display("%0t edge with rst=x q=%b", $time, q);
    #1 rst_n = 1'b0;
    #1 $display("%0t q=%b trace=%b", $time, q, trace);
    $finish;
  end
endmodule
