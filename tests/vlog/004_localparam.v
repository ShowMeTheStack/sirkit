module fsm_names #(parameter N = 3) (output [31:0] total);
  localparam SQ = N * N;
  localparam [7:0] MASK = (1 << N) - 1;
  localparam integer NEG = -N;
  assign total = SQ + MASK;
  initial #1 $display("%m: N=%0d SQ=%0d MASK=%b NEG=%0d total=%0d", N, SQ, MASK, NEG, total);
endmodule

module tb;
  localparam A = 10;
  localparam B = A + 5;
  localparam [3:0] C = 4'hA;
  localparam S = "hi";
  parameter P = 8'sd200;
  parameter integer Q = 3'b111;
  parameter R = 1'b1 + 1'b1;
  wire [31:0] t0, t1;
  fsm_names u_a (t0);
  fsm_names #(5) u_b (t1);
  initial begin
    $display("A=%0d B=%0d C=%b C=%d S=%s S=%h", A, B, C, C, S, S);
    $display("P=%0d Q=%0d R=%0d", P, Q, R);
    $display("C+1=%0d ~C=%b", C + 1, ~C);
    #2 $display("t0=%0d t1=%0d", t0, t1);
  end
endmodule
