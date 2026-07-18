// Combinational UDP with unlisted rows (output x) and a gate delay on the instance
primitive pick (o, a, b, c);
  output o;
  input a, b, c;
  table
  // only the one-hot cases are listed
     1 0 0 : 1;
     0 1 0 : 0;
     0 0 1 : 1;
     0 0 0 : 0;
  endtable
endprimitive

module tb;
  reg [2:0] in;
  wire o_fast, o_slow;

  pick p0 (o_fast, in[2], in[1], in[0]);
  pick #(3, 5) p1 (o_slow, in[2], in[1], in[0]);

  initial begin
    $dumpfile("063.vcd");
    $dumpvars(0, tb);
    $monitor("%0t in=%b fast=%b slow=%b", $time, in, o_fast, o_slow);
    in = 3'b000;
    #10 in = 3'b100;
    #10 in = 3'b010;
    #10 in = 3'b001;
    #10 in = 3'b011;
    #10 in = 3'b000;
    #10 in = 3'b0x0;
    #10 in = 3'b001;
    #2  in = 3'b100;
    #10 $finish;
  end
endmodule
