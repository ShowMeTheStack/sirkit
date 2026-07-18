module tb;
  reg [7:0] out_a, out_b, out_c;

  task automatic delayed_copy;
    input [7:0] v;
    input integer dly;
    output [7:0] o;
    reg [7:0] local_v;
    begin
      local_v = v;
      #dly;
      o = local_v + 1;
      $display("t=%0t copy of %0d after %0d -> %0d", $time, v, dly, o);
    end
  endtask

  task static_copy;
    input [7:0] v;
    input integer dly;
    output [7:0] o;
    reg [7:0] local_v;
    begin
      local_v = v;
      #dly;
      o = local_v + 1;
    end
  endtask

  task automatic countdown;
    input [8*4:1] tag;
    input integer n;
    integer k;
    begin
      for (k = n; k > 0; k = k - 1) begin
        #3 $display("t=%0t %0s %0d", $time, tag, k);
      end
    end
  endtask

  initial begin
    fork
      delayed_copy(8'd10, 7, out_a);
      delayed_copy(8'd20, 3, out_b);
      delayed_copy(8'd30, 5, out_c);
    join
    $display("auto: a=%0d b=%0d c=%0d", out_a, out_b, out_c);
    out_a = 0; out_b = 0; out_c = 0;
    fork
      static_copy(8'd10, 7, out_a);
      #1 static_copy(8'd20, 3, out_b);
      #2 static_copy(8'd30, 5, out_c);
    join
    $display("static: a=%0d b=%0d c=%0d", out_a, out_b, out_c);
    fork
      countdown("ab", 3);
      #1 countdown("cd", 2);
      #2 countdown("ef", 4);
    join
    $display("t=%0t done", $time);
    $finish;
  end
endmodule
