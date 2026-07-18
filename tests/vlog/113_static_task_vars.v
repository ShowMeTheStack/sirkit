module tb;
  integer seen;

  task tally;
    input [7:0] v;
    reg [7:0] total;
    integer n;
    begin
      if (v == 0) begin
        total = 0;
        n = 0;
      end else begin
        total = total + v;
        n = n + 1;
      end
      $display("tally v=%0d total=%0d n=%0d", v, total, n);
    end
  endtask

  task automatic fresh;
    input [7:0] v;
    reg [7:0] total;
    begin
      total = v;
      $display("fresh v=%0d total=%0d", v, total);
    end
  endtask

  function [7:0] acc;
    input [7:0] v;
    reg [7:0] keep;
    begin
      keep = keep + v;
      acc = keep;
    end
  endfunction

  function [7:0] next_id;
    input dummy;
    integer counter;
    begin
      if (counter === 32'bx) counter = 100;
      counter = counter + 1;
      next_id = counter;
    end
  endfunction

  initial begin
    tally(5);
    tally(0);
    tally(5);
    tally(7);
    tally(250);
    $display("peek total=%0d n=%0d", tally.total, tally.n);
    fresh(3);
    fresh(4);
    acc.keep = 0;
    $display("acc %0d %0d %0d", acc(1), acc(2), acc(3));
    $display("ids %0d %0d %0d", next_id(0), next_id(0), next_id(0));
    tally.n = 40;
    tally(1);
    $finish;
  end
endmodule
