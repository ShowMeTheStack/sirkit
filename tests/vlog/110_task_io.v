module tb;
  reg [7:0] a, b, s, d;
  reg [7:0] acc;
  reg c;
  integer calls;

  task addsub;
    input [7:0] x, y;
    output [7:0] sum, diff;
    output carry;
    begin
      {carry, sum} = x + y;
      diff = x - y;
      calls = calls + 1;
    end
  endtask

  task bump;
    inout [7:0] v;
    input [7:0] by;
    begin
      v = v + by;
    end
  endtask

  task swap;
    inout [7:0] p, q;
    reg [7:0] t;
    begin
      t = p; p = q; q = t;
    end
  endtask

  task show;
    input [8*8:1] tag;
    $display("%0s: a=%0d b=%0d s=%0d d=%0d c=%b acc=%h calls=%0d", tag, a, b, s, d, c, acc, calls);
  endtask

  task early;
    input [7:0] v;
    begin : body
      if (v == 0) begin
        $display("early exit");
        disable early;
      end
      $display("v=%0d", v);
    end
  endtask

  initial begin
    calls = 0;
    a = 200; b = 100;
    addsub(a, b, s, d, c);
    show("first");
    addsub(8'd3, 8'd5, s, d, c);
    show("second");
    acc = 8'hF0;
    bump(acc, 8'h0F);
    bump(acc, 8'h01);
    show("bump");
    swap(a, b);
    show("swap");
    addsub(a, b, acc[7:0], d, c);
    show("slice");
    addsub(8'hxF, 8'h01, s, d, c);
    show("xin");
    early(0);
    early(9);
    $finish;
  end
endmodule
