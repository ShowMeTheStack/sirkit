// 4-to-1 multiplexer, 8 bits wide
module mux4 (
  input  [1:0] sel,
  input  [7:0] d0,
  input  [7:0] d1,
  input  [7:0] d2,
  input  [7:0] d3,
  output [7:0] y
);
  assign y = sel[1] ? (sel[0] ? d3 : d2) : (sel[0] ? d1 : d0);
endmodule
