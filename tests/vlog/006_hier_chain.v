`timescale 10ns/1ns
module inv (input a, output y);
  assign #1 y = ~a;
endmodule

module chain #(parameter N = 4) (input i, output o);
  wire [N:0] w;
  assign w[0] = i;
  genvar g;
  generate
    for (g = 0; g < N; g = g + 1) begin : st
      inv u (.a(w[g]), .y(w[g+1]));
    end
  endgenerate
  assign o = w[N];
endmodule

module tb;
  reg in;
  wire o3, o4;
  chain #(3) c3 (in, o3);
  chain c4 (.i(in), .o(o4));
  initial begin
    $dumpfile("006.vcd");
    $dumpvars(0, tb);
    $monitor("%t in=%b o3=%b o4=%b", $time, in, o3, o4);
    in = 0;
    #6 in = 1;
    #6 in = 0;
    #2 in = 1;
    #8 $finish;
  end
endmodule
