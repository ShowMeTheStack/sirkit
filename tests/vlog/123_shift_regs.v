module shreg (clk, mode, sin, pin, q);
  input clk;
  input [1:0] mode;
  input sin;
  input [7:0] pin;
  output [7:0] q;
  reg [7:0] q;
  always @(posedge clk)
    case (mode)
      2'b00: q <= q;
      2'b01: q <= {q[6:0], sin};
      2'b10: q <= {sin, q[7:1]};
      2'b11: q <= pin;
    endcase
endmodule

module tb;
  reg clk;
  reg [1:0] mode;
  reg sin;
  reg [7:0] pin;
  wire [7:0] q;
  reg [7:0] a, b, c;
  shreg s (clk, mode, sin, pin, q);

  // blocking vs nonblocking pipelines
  always @(posedge clk) begin
    a <= pin;
    b <= a;
    c <= b;
  end

  task step;
    input [1:0] m;
    input s_in;
    begin
      mode = m; sin = s_in;
      #5 clk = 1;
      #5 clk = 0;
      $display("mode=%b sin=%b q=%b  pipe a=%h b=%h c=%h", m, s_in, q, a, b, c);
    end
  endtask

  initial begin
    $dumpfile("123.vcd");
    $dumpvars(0, tb);
    clk = 0; pin = 8'hA7;
    step(2'b11, 0);
    pin = 8'h01;
    step(2'b01, 1);
    pin = 8'h02;
    step(2'b01, 0);
    pin = 8'h03;
    step(2'b00, 1);
    step(2'b10, 1);
    step(2'b10, 0);
    step(2'b10, 1'bx);
    step(2'b01, 1'bz);
    step(2'bx1, 1);
    $finish;
  end
endmodule
