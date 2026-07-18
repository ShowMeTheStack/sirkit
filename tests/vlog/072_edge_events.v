// posedge/negedge including x and z transitions, event or, comma lists
module tb;
  reg s, a, b;
  reg [3:0] v;
  integer np, nn, nany, nor_, ncomma, nvec;

  initial begin np = 0; nn = 0; nany = 0; nor_ = 0; ncomma = 0; nvec = 0; end

  always @(posedge s) begin np = np + 1; $display("%0t posedge s=%b", $time, s); end
  always @(negedge s) begin nn = nn + 1; $display("%0t negedge s=%b", $time, s); end
  always @(s) nany = nany + 1;
  always @(a or b) nor_ = nor_ + 1;
  always @(a, posedge b) ncomma = ncomma + 1;
  always @(posedge v) begin nvec = nvec + 1; $display("%0t posedge v=%b", $time, v); end

  initial begin
    #1 s = 0;  #1 s = 1;  #1 s = 0;  #1 s = 1'bx;
    #1 s = 1;  #1 s = 1'bz; #1 s = 0; #1 s = 1'bz;
    #1 s = 1'bx; #1 s = 0;
    #1 a = 0;
    #1 b = 0;
    #1 a = 1;
    #1 b = 1;
    #1 b = 0;
    #1 a = 1;       // same value: no event
    #1 v = 4'b0000;
    #1 v = 4'b1110;
    #1 v = 4'b1111;
    #1 v = 4'b0000;
    #1 v = 4'b000x;
    #1 v = 4'b0001;
    #1 $display("posedge=%0d negedge=%0d any=%0d or=%0d comma=%0d vec=%0d", np, nn, nany, nor_, ncomma, nvec);
    $finish;
  end
endmodule
