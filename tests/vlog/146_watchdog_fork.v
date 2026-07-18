`timescale 1ns/1ns
module tb;
  reg clk, req, ack;
  integer tries;
  reg [3:0] lat;

  initial begin
    clk = 0;
    forever #5 clk = ~clk;
  end

  // responder answers after lat cycles
  always @(posedge req) begin : responder
    repeat (lat) @(posedge clk);
    #1 ack = 1;
    #10 ack = 0;
  end

  task automatic transact;
    input integer limit;
    output ok;
    begin
      ok = 0;
      fork : guard
        begin
          @(posedge ack);
          ok = 1;
          disable guard;
        end
        begin
          #limit;
          $display("  timeout after %0d", limit);
          disable guard;
        end
      join
    end
  endtask

  reg ok;
  initial begin
    $dumpfile("146.vcd");
    $dumpvars(0, tb);
    req = 0; ack = 0;
    for (tries = 0; tries < 4; tries = tries + 1) begin
      lat = tries * 3;
      #2 req = 1;
      transact(40, ok);
      $display("t=%0t try %0d lat=%0d ok=%b", $time, tries, lat, ok);
      req = 0;
      disable responder;
      ack = 0;
      #20;
    end
    fork : outer
      fork : inner
        #3 $display("t=%0t inner a", $time);
        #9 $display("t=%0t inner b (late)", $time);
      join
      #5 begin
        $display("t=%0t killing outer", $time);
        disable outer;
      end
    join
    $display("t=%0t end", $time);
    $finish;
  end
endmodule
