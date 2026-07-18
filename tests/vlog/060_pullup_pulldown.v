// pullup/pulldown primitives against tri-state drivers (open-drain style)
module tb;
  wire line, sel;
  wire [1:0] pair;
  reg  n1, n2, en;

  pullup   (line);
  pulldown (sel);
  pullup   pu[1:0] (pair);

  // open-drain: drive 0 when request is 1, else release
  bufif1 od1 (line, 1'b0, n1);
  bufif1 od2 (line, 1'b0, n2);
  bufif1 dr  (sel, 1'b1, en);
  bufif1 p0 (pair[0], n1, en);
  notif1 p1 (pair[1], n2, en);

  initial begin
    $dumpfile("060.vcd");
    $dumpvars(0, tb);
    $monitor("%0d: n1=%b n2=%b en=%b line=%b sel=%b pair=%b", $time, n1, n2, en, line, sel, pair);
    n1 = 0; n2 = 0; en = 0;
    #5 n1 = 1;
    #5 n2 = 1;
    #5 n1 = 0;
    #5 n2 = 0; en = 1;
    #5 n1 = 1'bx;
    #5 en = 1'bx;
    #5 $finish;
  end
endmodule
