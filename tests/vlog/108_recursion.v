module tb;
  function automatic integer fact;
    input integer n;
    begin
      if (n <= 1) fact = 1;
      else fact = n * fact(n - 1);
    end
  endfunction

  function automatic integer fib;
    input integer n;
    if (n < 2) fib = n;
    else fib = fib(n - 1) + fib(n - 2);
  endfunction

  function automatic [31:0] gcd;
    input [31:0] a, b;
    gcd = (b == 0) ? a : gcd(b, a % b);
  endfunction

  function automatic integer ackermann;
    input integer m, n;
    begin
      if (m == 0) ackermann = n + 1;
      else if (n == 0) ackermann = ackermann(m - 1, 1);
      else ackermann = ackermann(m - 1, ackermann(m, n - 1));
    end
  endfunction

  function automatic [15:0] pow;
    input [15:0] b;
    input [3:0] e;
    reg [15:0] h;
    begin
      if (e == 0) pow = 1;
      else begin
        h = pow(b, e >> 1);
        pow = e[0] ? h * h * b : h * h;
      end
    end
  endfunction

  integer i;
  initial begin
    for (i = 0; i <= 10; i = i + 1)
      $display("fact(%0d)=%0d fib(%0d)=%0d", i, fact(i), i, fib(i));
    $display("fact(12)=%0d fact(13)=%0d", fact(12), fact(13));
    $display("gcd=%0d %0d %0d", gcd(84, 36), gcd(17, 5), gcd(0, 9));
    $display("ack(2,3)=%0d ack(3,2)=%0d", ackermann(2, 3), ackermann(3, 2));
    $display("pow=%0d %0d %0d %h", pow(3, 4), pow(2, 15), pow(7, 0), pow(16'hFF, 3));
    $finish;
  end
endmodule
