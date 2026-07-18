// $strobe evaluates its arguments at the end of the step; $display at the call
module tb;
  integer i;
  reg [7:0] m [0:2];
  reg [7:0] acc;

  initial begin
    acc = 0;
    for (i = 0; i < 3; i = i + 1) begin
      $display("display i=%0d", i);
      $strobe("strobe  i=%0d", i);
      m[i] = i * 4;
    end
    $strobe("strobe  m[1]=%0d acc=%0d", m[1], acc);
    m[1] = 8'd77;
    acc <= 8'd5;
    acc = 8'd2;
    #1;
    for (i = 0; i < 3; i = i + 1)
      acc <= acc + m[i];          // each reads the same acc; last wins
    $strobe("t=%0t strobe acc=%0d i=%0d", $time, acc, i);
    $display("t=%0t display acc=%0d", $time, acc);
    #1;
    $write("t=%0t write without newline; ", $time);
    $strobe("t=%0t strobe after write", $time);
    $display("display ends the line");
    #1 $display("%c%c %s", 8'h4F, 8'h4B, "done");
    $finish;
  end
endmodule
