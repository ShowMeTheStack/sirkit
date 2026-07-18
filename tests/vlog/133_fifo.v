module fifo #(parameter W = 8, DEPTH = 4, AW = 2) (
  input clk, rst, wr, rd, input [W-1:0] din,
  output [W-1:0] dout, output full, output empty, output reg [AW:0] count);
  reg [W-1:0] mem [0:DEPTH-1];
  reg [AW-1:0] wp, rp;
  assign full = (count == DEPTH);
  assign empty = (count == 0);
  assign dout = mem[rp];
  wire do_wr = wr && !full;
  wire do_rd = rd && !empty;
  always @(posedge clk) begin
    if (rst) begin
      wp <= 0; rp <= 0; count <= 0;
    end else begin
      if (do_wr) begin mem[wp] <= din; wp <= wp + 1'b1; end
      if (do_rd) rp <= rp + 1'b1;
      case ({do_wr, do_rd})
        2'b10: count <= count + 1'b1;
        2'b01: count <= count - 1'b1;
        default: count <= count;
      endcase
    end
  end
endmodule

module tb;
  reg clk, rst, wr, rd;
  reg [7:0] din;
  wire [7:0] dout;
  wire full, empty;
  wire [2:0] count;
  fifo #(.W(8), .DEPTH(4), .AW(2)) f (clk, rst, wr, rd, din, dout, full, empty, count);
  initial begin clk = 0; forever #5 clk = ~clk; end
  task cyc;
    input w, r;
    input [7:0] d;
    begin
      wr = w; rd = r; din = d;
      @(negedge clk);
      $display("wr=%b rd=%b din=%h | dout=%h cnt=%0d full=%b empty=%b wp=%0d rp=%0d",
               w, r, d, dout, count, full, empty, f.wp, f.rp);
    end
  endtask
  initial begin
    $dumpfile("133.vcd");
    $dumpvars(0, tb);
    rst = 1; wr = 0; rd = 0; din = 0;
    @(negedge clk) rst = 0;
    cyc(1, 0, 8'h11);
    cyc(1, 0, 8'h22);
    cyc(1, 0, 8'h33);
    cyc(1, 0, 8'h44);
    cyc(1, 0, 8'h55);
    cyc(0, 1, 8'h00);
    cyc(1, 1, 8'h66);
    cyc(0, 1, 8'h00);
    cyc(0, 1, 8'h00);
    cyc(0, 1, 8'h00);
    cyc(0, 1, 8'h00);
    cyc(0, 1, 8'h00);
    cyc(1, 1, 8'h77);
    cyc(0, 0, 8'h00);
    $finish;
  end
endmodule
