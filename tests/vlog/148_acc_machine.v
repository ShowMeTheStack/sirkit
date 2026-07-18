`timescale 1ns/100ps
// tiny accumulator machine: fetch/execute in two-phase FSM, program set by initial block
module cpu (input clk, input rst, output reg [7:0] acc, output reg halted);
  reg [11:0] rom [0:15];
  reg [7:0] ram [0:7];
  reg [3:0] pc;
  reg [11:0] ir;
  reg phase;
  wire [3:0] opc = ir[11:8];
  wire [7:0] arg = ir[7:0];
  always @(posedge clk) begin
    if (rst) begin pc <= 0; acc <= 0; halted <= 0; phase <= 0; end
    else if (!halted) begin
      if (phase == 0) begin
        ir <= rom[pc];
        pc <= pc + 1;
        phase <= 1;
      end else begin
        phase <= 0;
        casez (opc)
          4'h0: acc <= arg;
          4'h1: acc <= acc + arg;
          4'h2: acc <= acc - arg;
          4'h3: ram[arg[2:0]] <= acc;
          4'h4: acc <= ram[arg[2:0]];
          4'h5: acc <= acc + ram[arg[2:0]];
          4'h6: if (acc != 0) pc <= arg[3:0];
          4'b10??: acc <= acc << opc[1:0];
          4'hF: halted <= 1;
          default: $display("bad opcode %h at pc %0d", opc, pc - 1);
        endcase
      end
    end
  end
endmodule

module tb;
  reg clk, rst;
  wire [7:0] acc;
  wire halted;
  integer cycles;
  cpu c (.clk(clk), .rst(rst), .acc(acc), .halted(halted));
  always #5 clk = ~clk;
  always @(negedge clk) if (!rst && c.phase == 0 && !halted)
    $display("%t pc=%0d acc=%0d ram0=%0d ram1=%0d", $time, c.pc, acc, c.ram[0], c.ram[1]);
  initial begin
    $dumpfile("148.vcd");
    $dumpvars(0, tb);
    // sum 5+4+3+2+1 into ram1, using ram0 as the counter
    c.rom[0] = 12'h005;
    c.rom[1] = 12'h300;
    c.rom[2] = 12'h000;
    c.rom[3] = 12'h301;
    c.rom[4] = 12'h401;
    c.rom[5] = 12'h500;
    c.rom[6] = 12'h301;
    c.rom[7] = 12'h400;
    c.rom[8] = 12'h201;
    c.rom[9] = 12'h300;
    c.rom[10] = 12'h604;
    c.rom[11] = 12'h401;
    c.rom[12] = 12'h900;
    c.rom[13] = 12'hC00;
    c.rom[14] = 12'hF00;
    clk = 0; rst = 1; cycles = 0;
    #12 rst = 0;
    while (!halted) @(posedge clk) cycles = cycles + 1;
    #1 $display("halted acc=%0d (%b) ram1=%0d cycles=%0d", acc, acc, c.ram[1], cycles);
    $finish;
  end
endmodule
