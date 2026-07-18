`timescale 1ns/100ps
module tb;
  reg sig;
  reg [3:0] bus;
  integer pe, ne, any;
  integer bc;
  always @(posedge sig) pe = pe + 1;
  always @(negedge sig) ne = ne + 1;
  always @(sig) any = any + 1;
  always @(bus) bc = bc + 1;
  initial begin
    $dumpfile("049.vcd");
    $dumpvars(0, tb);
    pe = 0; ne = 0; any = 0; bc = 0;
    #1 sig = 0;   #1 $display("x->0 pe=%0d ne=%0d any=%0d", pe, ne, any);
    #1 sig = 1'bx; #1 $display("0->x pe=%0d ne=%0d any=%0d", pe, ne, any);
    #1 sig = 1;   #1 $display("x->1 pe=%0d ne=%0d any=%0d", pe, ne, any);
    #1 sig = 1'bz; #1 $display("1->z pe=%0d ne=%0d any=%0d", pe, ne, any);
    #1 sig = 0;   #1 $display("z->0 pe=%0d ne=%0d any=%0d", pe, ne, any);
    #1 sig = 1'bz; #1 $display("0->z pe=%0d ne=%0d any=%0d", pe, ne, any);
    #1 sig = 1'bx; #1 $display("z->x pe=%0d ne=%0d any=%0d", pe, ne, any);
    #1 sig = 1'bx; #1 $display("x->x pe=%0d ne=%0d any=%0d", pe, ne, any);
    #1 sig = 0;   #1 $display("x->0 pe=%0d ne=%0d any=%0d", pe, ne, any);
    #1 sig = 1;   #1 $display("0->1 pe=%0d ne=%0d any=%0d", pe, ne, any);
    #1 sig = 0;   #1 $display("1->0 pe=%0d ne=%0d any=%0d", pe, ne, any);
    #1 bus = 4'b0000; #1 $display("bus=%b bc=%0d", bus, bc);
    #1 bus = 4'b000x; #1 $display("bus=%b bc=%0d", bus, bc);
    #1 bus = 4'b000z; #1 $display("bus=%b bc=%0d", bus, bc);
    #1 bus = 4'b000z; #1 $display("bus=%b bc=%0d", bus, bc);
    #1 bus = 4'b0000; #1 $display("bus=%b bc=%0d", bus, bc);
    $display("%t", $time);
  end
endmodule
