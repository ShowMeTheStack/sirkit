// MOS switches as one-way pass devices: nmos, pmos and cmos
module tb;
  reg d, n, p;
  wire yn, yp, yc;
  nmos  m1 (yn, d, n);
  pmos  m2 (yp, d, p);
  cmos  m3 (yc, d, n, p);
  integer k;
  initial begin
    $dumpfile("202.vcd");
    $dumpvars(0, tb);
    for (k = 0; k < 8; k = k + 1) begin
      {d, n, p} = k;
      #1 $display("d=%b n=%b p=%b  nmos=%b pmos=%b cmos=%b", d, n, p, yn, yp, yc);
    end
    d = 1; n = 1'bx; p = 1'bx;
    #1 $display("x controls: nmos=%b pmos=%b", yn, yp);
    d = 1'bz; n = 1; p = 0;
    #1 $display("z data: nmos=%b pmos=%b cmos=%b", yn, yp, yc);
  end
endmodule
