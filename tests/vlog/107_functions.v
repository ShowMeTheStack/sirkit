module tb;
  function [7:0] rev8;
    input [7:0] x;
    integer k;
    begin
      for (k = 0; k < 8; k = k + 1) rev8[k] = x[7-k];
    end
  endfunction

  function integer ones;
    input [31:0] x;
    integer k;
    begin
      ones = 0;
      for (k = 0; k < 32; k = k + 1) ones = ones + x[k];
    end
  endfunction

  function signed [15:0] mac;
    input signed [7:0] a, b;
    input signed [15:0] acc;
    mac = acc + a * b;
  endfunction

  function [3:0] sat_add;
    input [3:0] a;
    input [3:0] b;
    reg [4:0] t;
    begin
      t = a + b;
      sat_add = t[4] ? 4'hF : t[3:0];
    end
  endfunction

  function parity;
    input [15:0] v;
    parity = ^v;
  endfunction

  function [8*6:1] name_of;
    input [1:0] code;
    case (code)
      2'd0: name_of = "red";
      2'd1: name_of = "green";
      2'd2: name_of = "blue";
      default: name_of = "other";
    endcase
  endfunction

  reg [7:0] r;
  wire [7:0] w = rev8(r);
  wire p = parity({r, w});
  integer i;

  initial begin
    $dumpfile("107.vcd");
    $dumpvars(0, tb);
    r = 8'b1100_0001;
    #1 $display("rev8(%b)=%b p=%b", r, w, p);
    r = 8'b0000_0111;
    #1 $display("rev8(%b)=%b p=%b", r, w, p);
    r = 8'b1x0z_0000;
    #1 $display("rev8(%b)=%b p=%b", r, w, p);
    $display("ones=%0d %0d %0d", ones(32'hFFFF_FFFF), ones(0), ones(32'h8000_0101));
    $display("mac=%0d", mac(-8'sd5, 8'sd7, 16'sd100));
    $display("mac=%0d", mac(-8'sd128, -8'sd128, -16'sd1));
    $display("sat=%h %h %h", sat_add(4'd7, 4'd8), sat_add(4'd9, 4'd9), sat_add(4'hx, 4'd1));
    for (i = 0; i < 4; i = i + 1) $display("name %0d=%s|%0s|", i, name_of(i), name_of(i));
    $display("nested %b", rev8(rev8(8'h3C) ^ 8'hFF));
    $display("in expr %0d", ones(32'hF) * 10 + sat_add(4'd1, 4'd2));
    $finish;
  end
endmodule
