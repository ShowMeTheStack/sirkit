// bufif0/bufif1/notif0/notif1 with all data and control values
module tb;
  reg d, c;
  wire y_b1, y_b0, y_n1, y_n0;
  integer i, j;
  reg [3:0] v;

  bufif1 u1 (y_b1, d, c);
  bufif0 u2 (y_b0, d, c);
  notif1 u3 (y_n1, d, c);
  notif0 u4 (y_n0, d, c);

  initial begin
    v = 4'b01xz;
    $display("d c : bufif1 bufif0 notif1 notif0");
    for (i = 3; i >= 0; i = i - 1)
      for (j = 3; j >= 0; j = j - 1) begin
        d = v[i]; c = v[j];
        #1 $display("%b %b :   %b      %b      %b      %b", d, c, y_b1, y_b0, y_n1, y_n0);
      end
    $finish;
  end
endmodule
