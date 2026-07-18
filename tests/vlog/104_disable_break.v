module tb;
  integer i, found, cnt;
  reg [15:0] data;
  reg [7:0] mem [0:9];

  initial begin
    $dumpfile("104.vcd");
    $dumpvars(0, tb);
    for (i = 0; i < 10; i = i + 1) mem[i] = i * 7 + 3;
    found = -1;
    begin : search
      for (i = 0; i < 10; i = i + 1)
        if (mem[i] > 30) begin
          found = i;
          disable search;
        end
    end
    $display("first >30 at %0d value %0d i=%0d", found, mem[found], i);
    cnt = 0;
    for (i = 0; i < 10; i = i + 1) begin : body
      if (mem[i] % 2 == 0) disable body;
      cnt = cnt + 1;
      $write("%0d ", mem[i]);
    end
    $display("| odd count %0d", cnt);
    data = 16'b0000_0100_1000_0000;
    i = 0;
    begin : scan
      while (1) begin
        if (data[i]) disable scan;
        i = i + 1;
      end
    end
    $display("lowest set bit %0d", i);
    begin : outer
      for (i = 0; i < 4; i = i + 1) begin : inner
        cnt = 0;
        forever begin
          cnt = cnt + 1;
          if (cnt > i) disable inner;
          if (i == 3 && cnt == 2) disable outer;
        end
      end
    end
    $display("outer left with i=%0d cnt=%0d", i, cnt);
    begin : blk
      $display("before disable");
      #3 disable blk;
      $display("not printed");
    end
    $display("after blk t=%0t", $time);
    $finish;
  end
endmodule
