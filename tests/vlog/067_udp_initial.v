// Sequential UDPs with an initial statement: toggle flip-flop and set/reset latch
primitive tff (q, t);
  output q;
  reg q;
  input t;
  initial q = 1'b1;
  table
  // falling edge of t toggles
     (10) : 0 : 1;
     (10) : 1 : 0;
     (0?) : ? : -;
     (1x) : ? : -;
     (x0) : ? : x;
     (x1) : ? : -;
  endtable
endprimitive

primitive srl (q, s, r);
  output q;
  reg q;
  input s, r;
  initial q = 1'b0;
  table
     1 0 : ? : 1;
     0 1 : ? : 0;
     0 0 : ? : -;
     1 1 : ? : x;
  endtable
endprimitive

module tb;
  reg t, s, r;
  wire q1, q2, q3;

  tff t1 (q1, t);
  tff t2 (q2, q1);
  srl l1 (q3, s, r);

  initial begin
    $dumpfile("067.vcd");
    $dumpvars(0, tb);
    #1 $display("init: q1=%b q2=%b q3=%b", q1, q2, q3);
    t = 1; s = 0;
    #1 $display("t=1 s=0 r=x: q1=%b q2=%b q3=%b", q1, q2, q3);
    r = 1; #1 $display("s=0 r=1: q3=%b", q3);
    r = 0; #1 $display("s=0 r=0: q3=%b", q3);
    repeat (5) begin
      t = 0; #1 t = 1; #1;
      $display("pulse: q1=%b q2=%b", q1, q2);
    end
    s = 1; #1 $display("set: q3=%b", q3);
    s = 0; #1 $display("hold: q3=%b", q3);
    r = 1; #1 $display("reset: q3=%b", q3);
    s = 1; #1 $display("both: q3=%b", q3);
    r = 0; #1 $display("set again: q3=%b", q3);
    s = 0; #1 $display("hold: q3=%b", q3);
    t = 1'bx; #1 t = 0; #1 $display("x->0: q1=%b", q1);
    $finish;
  end
endmodule
