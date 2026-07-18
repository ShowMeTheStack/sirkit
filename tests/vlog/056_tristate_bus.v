// Shared 8-bit bus with three tri-state drivers and contention
module driver (output [7:0] bus, input [7:0] val, input oe);
  bufif1 b[7:0] (bus, val, {8{oe}});
endmodule

module tb;
  reg  [7:0] va, vb, vc;
  reg  ea, eb, ec;
  wire [7:0] bus;

  driver da (.bus(bus), .val(va), .oe(ea));
  driver db (.bus(bus), .val(vb), .oe(eb));
  driver dc (bus, vc, ec);

  initial begin
    $dumpfile("056.vcd");
    $dumpvars(0, tb);
    va = 8'hA5; vb = 8'h0F; vc = 8'hFF;
    {ea, eb, ec} = 3'b000;
    #1 $display("none     : %b %h", bus, bus);
    ea = 1;
    #1 $display("a        : %b %h", bus, bus);
    ea = 0; eb = 1;
    #1 $display("b        : %b %h", bus, bus);
    ea = 1;
    #1 $display("a+b      : %b %h", bus, bus);
    vb = 8'hA5;
    #1 $display("a+b same : %b %h", bus, bus);
    ea = 0; eb = 0; ec = 1'bx;
    #1 $display("c en=x   : %b %h", bus, bus);
    vc = 8'h00; eb = 1; vb = 8'hF0;
    #1 $display("b+c(x)   : %b %h", bus, bus);
    ec = 0;
    #1 $display("b        : %b %h %0d %o", bus, bus, bus, bus);
    $finish;
  end
endmodule
