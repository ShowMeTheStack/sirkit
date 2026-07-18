module tb;
  reg [1:0] s;
  reg c;
  reg [7:0] r;
  integer n;
  task check_if;
    begin
      if (c) r = 1; else r = 2;
      $write("if(%b)->%0d ", c, r);
      if (!c) r = 1; else r = 2;
      $display("if(!%b)->%0d", c, r);
    end
  endtask
  task check_case;
    begin
      case (s)
        2'b00: r = 10;
        2'b01: r = 11;
        2'b1x: r = 12;
        2'bx1: r = 13;
        2'bzz: r = 14;
        default: r = 99;
      endcase
      $write("case(%b)=%0d ", s, r);
      casez (s)
        2'b1?: r = 20;
        2'b0z: r = 21;
        default: r = 98;
      endcase
      $write("casez=%0d ", r);
      casex (s)
        2'b0x: r = 30;
        2'b1z: r = 31;
        default: r = 97;
      endcase
      $display("casex=%0d", r);
    end
  endtask
  initial begin
    c = 1; check_if;
    c = 0; check_if;
    c = 1'bx; check_if;
    c = 1'bz; check_if;
    s = 2'b00; check_case;
    s = 2'b11; check_case;
    s = 2'b1x; check_case;
    s = 2'bx1; check_case;
    s = 2'bzz; check_case;
    s = 2'bxx; check_case;
    s = 2'bz0; check_case;
    n = 0;
    r = 8'bx;
    while (r < 5) n = n + 1;
    $display("while x ran %0d", n);
    for (r = 8'b0000_00x0; r != 4; r = r + 1) n = n + 1;
    $display("for x ran %0d", n);
    r = 8'd3;
    repeat (r - 1) n = n + 10;
    $display("repeat ran %0d", n);
  end
endmodule
