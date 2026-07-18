module tb;
  parameter N = 6;
  reg [N-1:0] a, b;
  reg cin;
  wire [N:0] c;
  wire [N-1:0] s;
  wire [N-1:0] g;
  assign c[0] = cin;

  genvar i;
  generate
    for (i = 0; i < N; i = i + 1) begin : bit
      wire p = a[i] ^ b[i];
      assign s[i] = p ^ c[i];
      assign c[i+1] = (a[i] & b[i]) | (p & c[i]);
    end
  endgenerate

  generate
    for (i = N - 1; i >= 0; i = i - 1) begin : gray
      if (i == N - 1) begin : top
        wire v = a[i];
        assign g[i] = v;
      end else begin : rest
        wire v = a[i] ^ a[i+1];
        assign g[i] = v;
      end
    end
  endgenerate

  reg [3:0] mem_in [0:3];
  wire [15:0] packed_w;
  genvar j;
  for (j = 0; j < 4; j = j + 1) begin : pk
    reg [3:0] r;
    always @* r = mem_in[j] + j;
    assign packed_w[4*j +: 4] = r;
  end

  integer k;
  initial begin
    $dumpfile("114.vcd");
    $dumpvars(0, tb);
    a = 6'd21; b = 6'd14; cin = 0;
    #1 $display("%0d+%0d+%b = %0d carry=%b s=%b", a, b, cin, s, c[N], s);
    $display("p bits: %b%b%b%b%b%b", bit[5].p, bit[4].p, bit[3].p, bit[2].p, bit[1].p, bit[0].p);
    a = 6'd63; b = 6'd1; cin = 1;
    #1 $display("%0d+%0d+%b = %0d carry=%b c=%b", a, b, cin, s, c[N], c);
    a = 6'b10x011; b = 0; cin = 0;
    #1 $display("x in: s=%b c=%b", s, c);
    for (k = 0; k < 8; k = k + 1) begin
      a = k;
      #1 $display("bin %b gray %b", a[2:0], g[2:0]);
    end
    a = 6'b101101;
    #1 $display("gray6 %b top=%b rest3=%b", g, gray[5].top.v, gray[3].rest.v);
    for (k = 0; k < 4; k = k + 1) mem_in[k] = 4'hA + k;
    #1 $display("packed %h pk2.r=%h", packed_w, pk[2].r);
    $finish;
  end
endmodule
