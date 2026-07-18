// 8-bit barrel shifter: logical left/right and rotate, three mux stages
module barrel8 (
  input      [7:0] d,
  input      [2:0] amt,
  input            right,
  input            rotate,
  output     [7:0] y
);
  wire [7:0] s0, s1, s2;
  wire [7:0] fill = {8{1'b0}};
  // reverse bits so one left shifter serves both directions
  function [7:0] rev;
    input [7:0] v;
    integer k;
    begin
      for (k = 0; k < 8; k = k + 1) rev[k] = v[7-k];
    end
  endfunction
  wire [7:0] din = right ? rev(d) : d;
  assign s0 = amt[0] ? {din[6:0], rotate ? din[7]   : fill[0]}   : din;
  assign s1 = amt[1] ? {s0[5:0],  rotate ? s0[7:6]  : fill[1:0]} : s0;
  assign s2 = amt[2] ? {s1[3:0],  rotate ? s1[7:4]  : fill[3:0]} : s1;
  assign y = right ? rev(s2) : s2;
endmodule
