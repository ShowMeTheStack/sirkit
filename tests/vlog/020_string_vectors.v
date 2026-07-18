module tb;
  reg [8*5-1:0] s5;
  reg [8*8-1:0] s8;
  reg [8*2-1:0] s2;
  reg [7:0] ch;
  reg [8*12-1:0] msg;
  integer i;
  initial begin
    $dumpfile("020.vcd");
    $dumpvars(0, tb);
    s5 = "hello";
    s8 = "hi";
    s2 = "abcd";
    $display("[%s] [%s] [%s]", s5, s8, s2);
    $display("%h | %h | %h", s5, s8, s2);
    $display("%0d", "A");
    ch = "Z";
    $display("ch=%c %d %b", ch, ch, ch);
    ch = ch + 1;
    $display("ch+1=%c", ch);
    for (i = 4; i >= 0; i = i - 1)
      $write("%c.", s5[i*8 +: 8]);
    $display("");
    s5[39:32] = "j";
    $display("%s", s5);
    msg = {s5, " ", "world!"};
    $display("[%s]", msg);
    $display("eq %b %b", s5 == "jello", "ab" == 16'h6162);
    $display("[%s]", 24'h414243);
    $display("[%0s]", s8);
    $display("%s", "tab\there");
    $display("q\"x\\y");
    ch = 0;
    $display("[%c]", ch + 8'd48);
  end
endmodule
