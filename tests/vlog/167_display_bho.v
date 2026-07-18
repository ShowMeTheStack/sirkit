// $displayb / $displayh / $displayo / $writeb / $writeh / $writeo
module tb;
  reg [11:0] v;
  reg [5:0] w;
  integer i;
  initial begin
    $dumpfile("167.vcd");
    $dumpvars(0, tb);
    v = 12'd1234; w = 6'b101x0z; i = 77;
    $displayb(v);
    $displayh(v);
    $displayo(v);
    $display(v);
    $displayb("v=", v, " w=", w);
    $displayh("v=", v, " w=", w, " i=", i);
    $displayo("v=", v, " i=", i);
    $displayh("fmt still works %d", v, " after");
    $writeb(v, " ");
    $writeh(v, " ");
    $writeo(v);
    $write("\n");
    #1 v = v + 1;
    $writeh("t=", $time, " v=", v);
    $display;
    $displayb(3'd5, 2'b10);
    $displayh(-1);
    $finish;
  end
endmodule
