// More escapes, %% next to formats, strings with embedded escapes stored in regs
module tb;
  reg [8*6-1:0] s;
  initial begin
    $display("A\101B\102");
    $display("%%d is %d, %%b is %b, %%%%", 5, 2'b10);
    s = "a\tb\nc";
    $display("[%s]", s);
    $display("hex of tab-string: %h", s);
    s = "q\\\"z";
    $display("[%s] %h", s, s);
    $display("\\n literal: \\n");
    $write("%0d%%\n", 50);
    $display("%c%c%c", "\101", 8'd10, "!");
    $display("end");
  end
endmodule
