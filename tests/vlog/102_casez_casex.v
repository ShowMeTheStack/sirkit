`timescale 1ns/100ps
module tb;
  reg [7:0] op;
  reg [3:0] kz, kx;

  always @* begin
    casez (op)
      8'b1???_????: kz = 4'd1;
      8'b01??_????: kz = 4'd2;
      8'b001?_????: kz = 4'd3;
      8'b0001_????: kz = 4'd4;
      8'b0000_1zz1: kz = 4'd5;
      8'b0000_1???: kz = 4'd6;
      default: kz = 4'd0;
    endcase
  end

  always @* begin
    casex (op)
      8'b11xx_xxxx: kx = 4'd1;
      8'b10x0_xxxx: kx = 4'd2;
      8'b0000_0000: kx = 4'd3;
      8'b0zz0_1111: kx = 4'd4;
      default: kx = 4'd15;
    endcase
  end

  task show;
    input [7:0] val;
    begin
      op = val;
      #2 $display("%t op=%b kz=%0d kx=%0d", $time, op, kz, kx);
    end
  endtask

  initial begin
    show(8'b1000_0000);
    show(8'b0100_0001);
    show(8'b0010_1111);
    show(8'b0001_0000);
    show(8'b0000_1001);
    show(8'b0000_1011);
    show(8'b0000_0000);
    show(8'b1010_0101);
    show(8'b1011_0101);
    show(8'b0110_1111);
    show(8'b0000_0001);
    // x and z in the case expression itself
    show(8'bz000_0000);
    show(8'bx000_0000);
    show(8'b0z00_0000);
    show(8'b0x00_0000);
    show(8'b0000_1zz1);
    show(8'b0000_1xx1);
    show(8'b1x11_0000);
    show(8'bxxxx_xxxx);
    show(8'bzzzz_zzzz);
    $finish;
  end
endmodule
