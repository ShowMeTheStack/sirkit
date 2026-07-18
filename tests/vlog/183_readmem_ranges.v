// Start and end addresses, descending range, memories with offset index
module tb;
  reg [7:0] a [0:7];
  reg [7:0] b [0:7];
  reg [7:0] c [0:7];
  reg [7:0] d [8:15];
  integer i;
  initial begin
    for (i = 0; i < 8; i = i + 1) begin
      a[i] = 0; b[i] = 0; c[i] = 0; d[i + 8] = 0;
    end
    $readmemh("183_seq.hex", a, 2);
    $readmemh("183_seq.hex", b, 1, 4);
    $readmemh("183_seq.hex", c, 6, 3);
    $readmemh("183_seq.hex", d);
    for (i = 0; i < 8; i = i + 1)
      $display("i=%0d a=%h b=%h c=%h d[%0d]=%h", i, a[i], b[i], c[i], i + 8, d[i + 8]);
  end
endmodule
