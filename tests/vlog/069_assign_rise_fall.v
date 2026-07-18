// Continuous assignments with rise/fall and rise/fall/turn-off delays
module tb;
  reg a, en;
  reg [1:0] bus_v;
  wire y_rf, y_z;
  wire [1:0] y_bus;

  assign #(2, 7)    y_rf  = a;
  assign #(1, 3, 6) y_z   = en ? a : 1'bz;
  assign #(4, 2)    y_bus = bus_v;

  initial begin
    $dumpfile("069.vcd");
    $dumpvars(0, tb);
    $monitor("%0t a=%b en=%b rf=%b z=%b bus_v=%b y_bus=%b", $time, a, en, y_rf, y_z, bus_v, y_bus);
    a = 0; en = 0; bus_v = 2'b00;
    #10 a = 1;
    #10 en = 1;
    #10 a = 0;
    #10 en = 0;
    #10 a = 1; en = 1;
    #4  a = 0;          // falling 4 ns after rise: rf (7) never shows the 1
    #10 bus_v = 2'b01;
    #10 bus_v = 2'b10;  // vector: lsb falls, msb rises
    #10 bus_v = 2'bx1;
    #10 $finish;
  end
endmodule
