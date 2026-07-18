// Combinational always block with default assignments first (no latches)
module arbiter_comb (
  input      [3:0] req,
  input      [1:0] last,
  output reg [3:0] grant,
  output reg       busy,
  output reg [1:0] who
);
  integer k;
  reg [1:0] cand;
  always @* begin
    grant = 4'b0000;
    busy = 1'b0;
    who = last;
    cand = 2'd0;
    for (k = 1; k <= 4; k = k + 1) begin
      cand = last + k[1:0];
      if (!busy && req[cand]) begin
        grant[cand] = 1'b1;
        busy = 1'b1;
        who = cand;
      end
    end
  end
endmodule
