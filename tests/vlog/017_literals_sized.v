module tb;
  reg [15:0] r;
  reg [3:0] n;
  reg [39:0] w;
  initial begin
    $dumpfile("017.vcd");
    $dumpvars(0, tb);
    r = 8'b1010_1010;         $display("a %b", r);
    r = 8'hFF;                $display("b %b", r);
    r = 'hABCD;               $display("c %h", r);
    r = 12'o7654;             $display("d %o %h", r, r);
    r = 16'd65535;            $display("e %d", r);
    r = 4'hFF;                $display("f %h", r);
    r = 3'd9;                 $display("g %d", r);
    r = 16'b1;                $display("h %b", r);
    r = 'd123;                $display("i %d", r);
    r = 456;                  $display("j %d", r);
    r = 16'HdEaD;            $display("k %h", r);
    r = 16'h 1_2_3_4;         $display("l %h", r);
    r = 8'B1111_0000;         $display("m %b", r);
    r = 6'O77;                $display("n %o %b", r, r);
    r = 10'D1023;             $display("o %d", r);
    n = 4'b1;                 $display("p %b", n);
    n = 2'b11 + 2'b11;        $display("q %b", n);
    w = 40'hFF_FFFF_FFFF;     $display("r %h", w);
    w = 'hFF_FFFF_FFFF;       $display("s %h", w);
    w = 40'd1_000_000_000_000; $display("t %0d %h", w, w);
    $display("u %0d %0d %0d", 3'b101, 'o17, 8'hA0 >> 4);
  end
endmodule
