// Shift registers in a single always block: statement order matters with =, not with <=
module tb;
  reg clk;
  reg d;
  reg [2:0] good, bad, nb;   // [0] is the first stage

  always @(posedge clk) begin
    good[2] = good[1];
    good[1] = good[0];
    good[0] = d;
  end

  always @(posedge clk) begin
    bad[0] = d;
    bad[1] = bad[0];
    bad[2] = bad[1];
  end

  always @(posedge clk) begin
    nb[0] <= d;
    nb[1] <= nb[0];
    nb[2] <= nb[1];
  end

  initial begin
    $dumpfile("087.vcd");
    $dumpvars(0, tb);
    clk = 0; d = 0; good = 3'b000; bad = 3'b000; nb = 3'b000;
    #1 d = 1;
    #1 clk = 1; #1 clk = 0;
    $display("1: good=%b bad=%b nb=%b", good, bad, nb);
    d = 0;
    #1 clk = 1; #1 clk = 0;
    $display("2: good=%b bad=%b nb=%b", good, bad, nb);
    #1 clk = 1; #1 clk = 0;
    $display("3: good=%b bad=%b nb=%b", good, bad, nb);
    d = 1;
    #1 clk = 1; #1 clk = 0;
    $display("4: good=%b bad=%b nb=%b", good, bad, nb);
    #1 clk = 1; #1 clk = 0;
    $display("5: good=%b bad=%b nb=%b", good, bad, nb);
    $finish;
  end
endmodule
