// supply0/supply1 nets and tri0/tri1 pulls on undriven nets
module tb;
  supply0 gnd;
  supply1 vdd;
  tri0 [1:0] t0;
  tri1 [1:0] t1;
  reg  [1:0] d;
  reg        en;
  wire y_hi, y_lo, mix;

  bufif1 b0 (t0[0], d[0], en);
  bufif1 b1 (t0[1], d[1], en);
  bufif1 b2 (t1[0], d[0], en);
  bufif1 b3 (t1[1], d[1], en);
  and a1 (y_hi, vdd, d[0]);
  or  o1 (y_lo, gnd, d[1]);
  nand n1 (mix, vdd, gnd);

  initial begin
    $dumpfile("059.vcd");
    $dumpvars(0, tb);
    d = 2'b10; en = 0;
    #1 $display("gnd=%b vdd=%b mix=%b", gnd, vdd, mix);
    #1 $display("en=%b d=%b t0=%b t1=%b and=%b or=%b", en, d, t0, t1, y_hi, y_lo);
    en = 1;
    #1 $display("en=%b d=%b t0=%b t1=%b and=%b or=%b", en, d, t0, t1, y_hi, y_lo);
    d = 2'bzx;
    #1 $display("en=%b d=%b t0=%b t1=%b and=%b or=%b", en, d, t0, t1, y_hi, y_lo);
    en = 0;
    #1 $display("en=%b d=%b t0=%b t1=%b mix=%b", en, d, t0, t1, mix);
    $finish;
  end
endmodule
