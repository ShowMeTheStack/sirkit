// The second half of tests/vlog.mjs: error and lint messages, synthesis against simulation, fromCircuit and VCD.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { load } from '../load.mjs';

export function run({ V, t, dir, want, rng, S }) {
const sec = (name) => want(name) || want('extra');

// ---- error and lint messages ------------------------------------------------------------------------------------------
if (sec('errors')) {
  const err = (src, line, re, label) => {
    const c = V.compile(src);
    const e = c.errors[0];
    t.ok(e && e.line === line && re.test(e.msg), 'error ' + label + ': got ' + JSON.stringify(c.errors.slice(0, 2)));
  };
  const warn = (src, re, label, none) => {
    const c = V.compile(src);
    const w = c.warnings.find((x) => re.test(x.msg));
    t.ok(!c.errors.length && (none ? !w : !!w), 'lint ' + label + ': errors ' + JSON.stringify(c.errors.slice(0, 1)) + ' warnings ' + JSON.stringify(c.warnings.map((x) => x.msg)));
  };
  err('module m(input a, output y);\n  assign y = a\nendmodule', 2, /missing ';' at the end of line 2/, 'missing semicolon');
  err('module m;\n  reg a\n  wire b;\nendmodule', 2, /missing ';'/, 'missing semicolon in a declaration');
  err('module m;\nendmodule;\n', 2, /endmodule takes no semicolon/, 'semicolon after endmodule');
  err('module m(input a, output y);\n  assign y = b;\nendmodule', 2, /b is not declared/, 'undeclared');
  err('module m(input a, output y);\n  always @* y = a;\nendmodule', 2, /y is a wire.*declare it as reg/, 'procedural assignment to a wire');
  err('module m(input a, output reg y);\n  assign y = a;\nendmodule', 2, /y is a reg.*declare it as a wire/, 'assign to a reg');
  err('module m;\n  initial begin\n    if (a = 1) ;\n  end\nendmodule', 3, /use == to compare/, '= in an if');
  err('module m;\n  initial begin\n    $display("x");\nendmodule', 4, /"begin" at line 2 has no matching "end"/, 'begin without end');
  err('module m;\n  sub u1 (.a(1));\nendmodule', 2, /no module called sub/, 'unknown module');
  err('module s(input a); endmodule\nmodule m;\n  s u1 (.b(1));\nendmodule', 3, /s has no port called b/, 'unknown port');
  err('module m;\n  always begin x = 1; end\n  reg x;\nendmodule', 2, /no delay or event control/, 'always without timing');
  err('module m;\n  reg [3:0] r;\n  initial r[1:2] = 0;\nendmodule', 3, /runs the other way/, 'reversed part-select');
  err('module m;\n  wire w;\n  initial #1 $display("%d");\nendmodule', 3, /no argument/, 'missing $display argument');
  err('module m;\n  initial x = 4\'hg;\nendmodule', 2, /not a digit/, 'bad digit');
  err('module m;\n  function f; input a; begin #1 f = a; end endfunction\nendmodule', 2, /function cannot contain delays/, 'delay in a function');
  err('`include "nofile.vh"\nmodule m; endmodule', 1, /cannot find the file "nofile.vh"/, 'missing include');
  err('module m;\n  initial begin\n    else x = 1;\n  end\nendmodule', 3, /else has no matching if/, 'stray else');
  err('module m;\n  task t; input a; begin end endtask\n  initial t(1, 2);\nendmodule', 3, /takes 1 argument/, 'task argument count');
  warn('module m(input a, b, output reg y);\n  always @(a) y = a & b;\nendmodule', /reads b but b is not in its sensitivity list/, 'incomplete sensitivity');
  warn('module m(input a, b, output reg y);\n  always @(a or b) y = a & b;\nendmodule', /sensitivity/, 'complete sensitivity', true);
  warn('module m(input s, a, output reg y);\n  always @* if (s) y = a;\nendmodule', /latch/, 'latch inferred');
  warn('module m(input s, a, output reg y);\n  always @* begin y = 0; if (s) y = a; end\nendmodule', /latch/, 'default stops the latch', true);
  warn('module m(input [1:0] s, input a, output reg y);\n  always @* case (s) 0: y = a; 1: y = ~a; endcase\nendmodule', /latch/, 'case without default');
  warn('module m(input [1:0] s, input a, output reg y);\n  always @* case (s) 0: y = a; 1: y = ~a; 2, 3: y = 0; endcase\nendmodule', /latch/, 'full case', true);
  warn('module m(input clk, d, output reg q);\n  always @(posedge clk) q = d;\nendmodule', /use q <= /, 'blocking in a clocked block');
  warn('module m(input clk, d, output reg q);\n  always @(posedge clk) q <= d;\nendmodule', /use q <= /, 'non-blocking in a clocked block', true);
  warn('module m(input [7:0] a, output [3:0] y);\n  assign y = a;\nendmodule', /y is 4 bits wide but gets an 8-bit value; the top 4 bits are dropped/, 'width mismatch');
  warn('module m(input [3:0] a, output [3:0] y);\n  assign y = a + 1;\nendmodule', /bits/, 'unsized constant is no width problem', true);
  warn('module m(input [3:0] a, b, output [4:0] y);\n  assign y = a + b;\nendmodule', /bits/, 'carry kept is no width problem', true);
  warn('module m(input clk, d, output reg q);\n  always @(posedge clk) q <= d;\n  always @(posedge clk) q <= ~d;\nendmodule', /assigned in two always blocks/, 'two always blocks');
  warn('module m(input [3:0] a, output y);\n  assign y = a;\nendmodule', /1 bit wide but gets a 4-bit value/, 'vector into one bit');
  // runtime: a loop that never waits is stopped with a message
  const r = V.run('module m; integer i; initial begin i = 0; while (1) i = i + 1; end endmodule', { stepLimit: 100000 });
  t.ok(r.errors.length && /loop keeps running/.test(r.errors[0].msg), 'runaway loop: ' + JSON.stringify(r.errors));
}

// ---- synthesis against simulation --------------------------------------------------------------------------------------
/** a zero-delay three-valued (0, 1, 2 = X) evaluator of a netlist, for the comparison */
function netEval(c) {
  const val = new Map();
  const nets = c.nets;
  for (const n of nets) val.set(n, new Array(n.width).fill(2));
  const inputs = new Map();
  for (const p of c.parts) if (p.type === 'IN') inputs.set(p.params.name, p);
  const state = new Map();
  for (const p of c.parts) if (p.type === 'DFF' || p.type === 'LATCH') state.set(p, 2);
  const get = (p, pin) => { const n = p.net[pin]; return n ? val.get(n) : [2]; };
  const b = (p, pin) => get(p, pin)[0];
  const and = (x, y) => (x === 0 || y === 0 ? 0 : x === 1 && y === 1 ? 1 : 2), or = (x, y) => (x === 1 || y === 1 ? 1 : x === 0 && y === 0 ? 0 : 2);
  const xor = (x, y) => (x === 2 || y === 2 ? 2 : x ^ y), not = (x) => (x === 2 ? 2 : 1 - x);
  const prevClk = new Map();
  function outs(p) {
    switch (p.type) {
      case 'IN': return { y: p.cur || new Array(p.params.w || 1).fill(2) };
      case 'CONST': return { y: [p.params.value ? 1 : 0] };
      case 'NOT': return { y: [not(b(p, 'i0'))] };
      case 'BUF': return { y: [b(p, 'i0')] };
      case 'AND': case 'NAND': case 'OR': case 'NOR': case 'XOR': case 'XNOR': {
        const ins = p.pins.filter((q) => q.dir === 'in').map((q) => b(p, q.name));
        const base = p.type.replace(/^N(AND|OR)$/, '$1').replace('XNOR', 'XOR');
        let y = ins.reduce((x, z) => (base === 'AND' ? and(x, z) : base === 'OR' ? or(x, z) : xor(x, z)));
        if (/^N|XNOR/.test(p.type)) y = not(y);
        return { y: [y] };
      }
      case 'MUX': { const s = b(p, 's0'), d0 = b(p, 'd0'), d1 = b(p, 'd1'); return { y: [s === 0 ? d0 : s === 1 ? d1 : d0 === d1 ? d0 : 2] }; }
      case 'FA': {
        const a = b(p, 'a'), bb = b(p, 'b'), ci = b(p, 'cin');
        const ones = [a, bb, ci].filter((x) => x === 1).length, zeros = [a, bb, ci].filter((x) => x === 0).length;
        return { s: [xor(xor(a, bb), ci)], cout: [ones >= 2 ? 1 : zeros >= 2 ? 0 : 2] };
      }
      case 'SPLIT': { const a = get(p, 'a'), o = {}; a.forEach((x, i) => { o['y' + i] = [x]; }); return o; }
      case 'MERGE': { const w = p.params.w, y = []; for (let i = 0; i < w; i++) y.push(b(p, 'a' + i)); return { y }; }
      case 'DFF': case 'LATCH': {
        let q = state.get(p);
        if (p.type === 'DFF') { const s = p.params.set ? b(p, 'set') : 0, r = p.params.reset ? b(p, 'rst') : 0; if (r === 1) q = 0; else if (s === 1) q = 1; else if (r === 2 || s === 2) q = 2; state.set(p, q); }
        else { const e = b(p, 'en'); if (e === 1) q = b(p, 'd'); else if (e === 2 && b(p, 'd') !== q) q = 2; state.set(p, q); }
        return { q: [q] };
      }
    }
    return {};
  }
  function settle() {
    for (let it = 0; it < 500; it++) {
      let changed = false;
      for (const p of c.parts) {
        const o = outs(p);
        for (const [pin, v] of Object.entries(o)) { const n = p.net[pin]; if (!n) continue; const old = val.get(n); if (old.join() !== v.join()) { val.set(n, v); changed = true; } }
      }
      if (!changed) return;
    }
    throw new Error('netlist does not settle');
  }
  return {
    set(name, bits) { const p = inputs.get(name); p.cur = bits; },
    settle,
    clock() {
      // the D inputs before the edge, then the edge
      const ds = new Map();
      for (const p of c.parts) if (p.type === 'DFF') ds.set(p, b(p, 'd'));
      return ds;
    },
    edge(ds) {
      for (const p of c.parts) {
        if (p.type !== 'DFF') continue;
        const k = b(p, 'clk'), was = prevClk.has(p) ? prevClk.get(p) : 2;
        const rising = p.params.edge === 'fall' ? was === 1 && k === 0 : was === 0 && k === 1;
        if (rising) { const s = p.params.set ? b(p, 'set') : 0, r = p.params.reset ? b(p, 'rst') : 0; if (r !== 1 && s !== 1) state.set(p, ds.get(p)); }
      }
    },
    noteClk() { for (const p of c.parts) if (p.type === 'DFF') prevClk.set(p, b(p, 'clk')); },
    out(name) { const p = c.parts.find((q) => q.type === 'OUT' && q.params.name === name); return val.get(p.net.a) || [2]; },
  };
}

/** a testbench for module m applying the given vectors, printing the outputs before each clock edge */
function testbench(mod, ports, vecs, clk) {
  const ins = ports.filter((p) => p.dir === 'input' && p.name !== clk), outs = ports.filter((p) => p.dir === 'output');
  const L = ['module tb_auto;'];
  for (const p of ports) L.push('  ' + (p.dir === 'input' ? 'reg' : 'wire') + (p.width > 1 ? ' [' + (p.width - 1) + ':0]' : '') + ' ' + p.name + ';');
  L.push('  ' + mod + ' dut (' + ports.map((p) => '.' + p.name + '(' + p.name + ')').join(', ') + ');');
  L.push('  initial begin');
  if (clk) L.push('    ' + clk + ' = 0;');
  for (const v of vecs) {
    L.push('    ' + ins.map((p) => p.name + ' = ' + p.width + "'b" + v[p.name] + ';').join(' ') + ' #1 $display("' + outs.map(() => '%b').join(' ') + '"' + outs.map((p) => ', ' + p.name).join('') + ');');
    if (clk) L.push('    #1 ' + clk + ' = 1; #1 ' + clk + ' = 0; #1;');
  }
  L.push('  end');
  L.push('endmodule');
  return L.join('\n');
}

function vectors(ports, clk, n, rnd) {
  const out = [];
  const rst = ports.find((p) => p.dir === 'input' && /^(rst|reset|clr)$/i.test(p.name));
  const rstn = ports.find((p) => p.dir === 'input' && /^(rst_n|rstn|reset_n|resetn|nrst)$/i.test(p.name));
  for (let k = 0; k < n; k++) {
    const v = {};
    for (const p of ports) {
      if (p.dir !== 'input' || p.name === clk) continue;
      let s = '';
      for (let i = 0; i < p.width; i++) s += rnd() < 0.5 ? '1' : '0';
      v[p.name] = s;
    }
    if (rst) v[rst.name] = k < 2 || rnd() < 0.04 ? '1' : '0';
    if (rstn) v[rstn.name] = k < 2 || rnd() < 0.04 ? '0' : '1';
    out.push(v);
  }
  return out;
}

function compare(label, expLines, got, outs) {
  // got: [[bits per output]] per vector; compare where the behaviour is known
  let bad = 0, unknown = 0;
  for (let k = 0; k < expLines.length; k++) {
    const fields = expLines[k].split(' ');
    outs.forEach((o, j) => {
      const e = fields[j], g = got[k][j];
      for (let i = 0; i < e.length; i++) {
        if (e[i] !== '0' && e[i] !== '1') continue;
        if (g[i] !== e[i]) { if (g[i] === 'x') unknown++; else bad++; if (bad === 1 && g[i] !== 'x') t.ok(false, label + ': vector ' + k + ' output ' + o.name + ' is ' + g + ', the simulation gives ' + e); }
      }
    });
  }
  return { bad, unknown };
}

if (sec('synth')) {
  const sdir = join(dir, 'synth');
  const designs = [];
  if (existsSync(sdir)) for (const f of readdirSync(sdir).filter((x) => x.endsWith('.v')).sort()) designs.push({ name: f.slice(0, -2), src: readFileSync(join(sdir, f), 'utf8') });
  // a few more, written here
  designs.push({ name: 'inline_casez', src: 'module pe(input [7:0] r, output reg [2:0] y, output reg v);\n always @* begin v = 1; casez (r) 8\'b1???????: y = 7; 8\'b01??????: y = 6; 8\'b001?????: y = 5; 8\'b0001????: y = 4; 8\'b00001???: y = 3; 8\'b000001??: y = 2; 8\'b0000001?: y = 1; 8\'b00000001: y = 0; default: begin y = 0; v = 0; end endcase end\nendmodule' });
  designs.push({ name: 'inline_arith', src: 'module ar(input [5:0] a, b, input signed [5:0] c, output [11:0] p, output lt, slt, output [5:0] sh, output [5:0] q4);\n assign p = a * b; assign lt = a < b; assign slt = c < $signed(b); assign sh = a >> b[2:0]; assign q4 = a / 4 + (a % 4);\nendmodule' });
  designs.push({ name: 'inline_func', src: 'module fn(input [7:0] x, output [3:0] n);\n function [3:0] ones; input [7:0] v; integer i; begin ones = 0; for (i = 0; i < 8; i = i + 1) ones = ones + v[i]; end endfunction\n assign n = ones(x);\nendmodule' });
  designs.push({ name: 'inline_latch', src: 'module la(input en, input [1:0] d, output reg [1:0] q);\n always @* if (en) q = d;\nendmodule' });
  designs.push({ name: 'inline_negedge', src: 'module ne(input clk, input rst_n, input [2:0] d, output reg [2:0] q, output reg [2:0] r);\n always @(negedge clk or negedge rst_n) if (!rst_n) q <= 3\'b101; else q <= d;\n always @(posedge clk) r <= q ^ d;\nendmodule' });
  designs.push({ name: 'inline_gen', src: 'module rc(input [3:0] a, b, input ci, output [3:0] s, output co);\n wire [4:0] c; assign c[0] = ci;\n genvar i;\n generate for (i = 0; i < 4; i = i + 1) begin : st\n  xor (s[i], a[i], b[i], c[i]);\n  assign c[i+1] = (a[i] & b[i]) | (c[i] & (a[i] ^ b[i]));\n end endgenerate\n assign co = c[4];\nendmodule' });
  designs.push({ name: 'inline_rom', src: 'module rom(input [2:0] a, output [5:0] d, output [3:0] sq);\n reg [5:0] t [0:7]; reg [3:0] k; integer i;\n initial begin for (i = 0; i < 8; i = i + 1) t[i] = i * i; k = 4\'d9; end\n assign d = t[a]; assign sq = k ^ a;\nendmodule' });
  designs.push({ name: 'inline_mem_bitsel', src: 'module mb(input clk, we, input [1:0] wa, ra, input [2:0] bi, input [7:0] din, output [7:0] dout, output bit_o, output [3:0] nib);\n reg [7:0] m [0:3];\n always @(posedge clk) if (we) m[wa] <= din;\n assign dout = m[ra]; assign bit_o = dout[bi]; assign nib = dout[bi +: 4];\nendmodule' });
  const rnd = rng(2024), PHASE = 5000;
  let ok = 0, tried = 0, simOk = 0, simTried = 0, rtOk = 0, unknownBits = 0;
  for (const d of designs) {
    if (!want(d.name) && !want('synth')) continue;
    tried++;
    const c = V.compile(d.src);
    if (c.errors.length) { t.ok(false, d.name + ': does not compile: ' + JSON.stringify(c.errors[0])); continue; }
    const circ = V.synthesise(c);
    if (!circ.ok) { t.ok(false, d.name + ': not synthesised: ' + JSON.stringify(circ.reasons)); continue; }
    const probs = circ.validate();
    t.ok(!probs.length, d.name + ': netlist problems: ' + probs.slice(0, 3).join('; '));
    const top = c.tops[0];
    const ports = circ.ports.map((p) => ({ name: p.name, dir: p.dir, width: p.width }));
    const clk = ports.find((p) => p.dir === 'input' && /^(clk|clock)$/i.test(p.name)) ? ports.find((p) => /^(clk|clock)$/i.test(p.name)).name : null;
    const vecs = vectors(ports, clk, clk ? 60 : 80, rnd);
    const tb = testbench(top, ports, vecs, clk);
    const beh = V.run(d.src + '\n' + tb, { top: 'tb_auto' });
    if (beh.errors.length) { t.ok(false, d.name + ': testbench errors ' + JSON.stringify(beh.errors[0])); continue; }
    const outs = ports.filter((p) => p.dir === 'output');
    // the netlist, zero delay
    const ev = netEval(circ), got = [];
    if (clk) { ev.set(clk, [0]); }
    for (const v of vecs) {
      for (const p of ports) if (p.dir === 'input' && p.name !== clk) ev.set(p.name, v[p.name].split('').reverse().map(Number));
      ev.settle();
      got.push(outs.map((o) => ev.out(o.name).slice().reverse().map((x) => (x === 2 ? 'x' : String(x))).join('')));
      if (clk) for (const lv of [1, 0]) { ev.noteClk(); const ds = ev.clock(); ev.set(clk, [lv]); ev.settle(); ev.edge(ds); ev.settle(); }
    }
    const r1 = compare(d.name + ' (netlist)', beh.output, got, outs);
    t.ok(r1.bad === 0, d.name + ': ' + r1.bad + ' wrong output bits from the netlist');
    if (!r1.bad) ok++;
    unknownBits += r1.unknown;
    // the same netlist on Sirkit.Sim, when it is there
    if (S.Sim && S.Sim.create) {
      simTried++;
      try {
        const sim = S.Sim.create(circ, { tech: 'CMOS' });
        const sg = [];
        if (clk) sim.set(clk, 0);
        sim.run(PHASE);
        for (const v of vecs) {
          for (const p of ports) if (p.dir === 'input' && p.name !== clk) sim.set(p.name, v[p.name]);
          sim.run(PHASE);
          sg.push(outs.map((o) => { const x = sim.get(o.name); const arr = Array.isArray(x) ? x : [x]; return arr.slice().reverse().map((y) => (y === 'X' || y === 'Z' ? 'x' : String(y))).join(''); }));
          if (clk) { sim.set(clk, 1); sim.run(PHASE); sim.set(clk, 0); sim.run(PHASE); }
        }
        const r2 = compare(d.name + ' (Sirkit.Sim)', beh.output, sg, outs);
        t.ok(r2.bad === 0, d.name + ': ' + r2.bad + ' wrong output bits on Sirkit.Sim');
        if (!r2.bad) simOk++;
      } catch (e) { t.ok(false, d.name + ': Sirkit.Sim failed: ' + String(e.stack || e).split('\n').slice(0, 2).join(' | ')); }
    }
    // the netlist written back as Verilog behaves the same
    const text = V.fromCircuit(circ);
    const rt = V.run(text + '\n' + tb, { top: 'tb_auto' });
    if (rt.errors.length) t.ok(false, d.name + ': fromCircuit Verilog has errors: ' + JSON.stringify(rt.errors[0]) + '\n' + text.split('\n').slice(0, 6).join('\n'));
    else {
      const r3 = compare(d.name + ' (fromCircuit)', beh.output, rt.output.map((l) => l.split(' ')), outs);
      t.ok(r3.bad === 0, d.name + ': ' + r3.bad + ' wrong bits from the Verilog written back');
      if (!r3.bad) rtOk++;
    }
  }
  console.log('synth      ' + ok + ' of ' + tried + ' designs match on the netlist' + (simTried ? ', ' + simOk + ' of ' + simTried + ' on Sirkit.Sim' : '') + ', ' + rtOk + ' written back (' + unknownBits + ' output bits X in the netlist where the simulation knew them, from x-optimism)');
  // random combinational expressions: the netlist (written back as Verilog) against the expressions
  {
    const r2 = rng(77);
    const pick = (a) => a[Math.floor(r2() * a.length)];
    let fz = 0, fzBad = 0;
    for (let prog = 0; prog < 30; prog++) {
      const vars = [];
      for (let i = 0; i < 4; i++) vars.push({ name: 'v' + i, w: pick([1, 2, 3, 4, 5, 8]), s: r2() < 0.4 });
      const lit = () => { const w = pick([1, 2, 3, 4]); let b = ''; for (let i = 0; i < w; i++) b += pick(['0', '1']); return r2() < 0.4 ? String(Math.floor(r2() * 9)) : (r2() < 0.3 ? w + "'sb" : w + "'b") + b; };
      const ex = (dp) => {
        if (dp <= 0 || r2() < 0.2) return r2() < 0.7 ? pick(vars).name : lit();
        const r = r2();
        if (r < 0.45) return '(' + ex(dp - 1) + ' ' + pick(['+', '-', '*', '&', '|', '^', '~^', '<<', '>>', '>>>', '<<<', '==', '!=', '<', '<=', '>', '>=', '&&', '||']) + ' ' + ex(dp - 1) + ')';
        if (r < 0.6) return pick(['-', '~', '!', '&', '|', '^', '~&', '~|', '~^']) + '(' + ex(dp - 1) + ')';
        if (r < 0.75) return '(' + ex(dp - 1) + ' ? ' + ex(dp - 1) + ' : ' + ex(dp - 1) + ')';
        if (r < 0.85) return pick(['$signed', '$unsigned']) + '(' + ex(dp - 1) + ')';
        const vv = vars.filter((x) => x.w > 2); if (!vv.length) return lit(); const v = pick(vv);
        return r2() < 0.5 ? v.name + '[' + pick(vars).name + ']' : v.name + '[' + pick(vars.filter((x) => x.w <= 2).map((x) => x.name).concat(['1'])) + ' +: 2]';
      };
      const outs = [];
      for (let i = 0; i < 3; i++) outs.push({ name: 'o' + i, w: pick([1, 3, 6, 9]), s: r2() < 0.3, e: ex(3) });
      const decl = (v, dir) => dir + ' ' + (v.s ? 'signed ' : '') + (v.w > 1 ? '[' + (v.w - 1) + ':0] ' : '') + v.name;
      const src = 'module dut(' + vars.map((v) => decl(v, 'input')).concat(outs.map((o) => decl(o, 'output'))).join(', ') + ');\n' + outs.map((o) => '  assign ' + o.name + ' = ' + o.e + ';').join('\n') + '\nendmodule\n';
      const circ = V.synthesise(src);
      if (!circ.ok) { t.ok(false, 'random expressions ' + prog + ': ' + JSON.stringify(circ.reasons[0])); continue; }
      const back = V.fromCircuit(circ).replace(/module dut/, 'module dut_n');
      const L = ['module tb;'];
      for (const v of vars) L.push('  reg ' + (v.w > 1 ? '[' + (v.w - 1) + ':0] ' : '') + v.name + ';');
      for (const o of outs) L.push('  wire ' + (o.w > 1 ? '[' + (o.w - 1) + ':0] ' : '') + o.name + ', n_' + o.name + ';');
      L.push('  dut a(' + vars.map((v) => '.' + v.name + '(' + v.name + ')').concat(outs.map((o) => '.' + o.name + '(' + o.name + ')')).join(', ') + ');');
      L.push('  dut_n b(' + vars.map((v) => '.' + v.name + '(' + v.name + ')').concat(outs.map((o) => '.' + o.name + '(n_' + o.name + ')')).join(', ') + ');');
      L.push('  integer k; initial for (k = 0; k < 48; k = k + 1) begin ' + vars.map((v) => v.name + ' = $random;').join(' ') + ' #1 $display("' + outs.map(() => '%b/%b').join(' ') + '"' + outs.map((o) => ', ' + o.name + ', n_' + o.name).join('') + '); end');
      L.push('endmodule');
      const r = V.run(src + back + L.join('\n'), { top: 'tb' });
      fz++;
      const diff = r.errors.length ? r.errors[0].msg : r.output.find((l) => l.split(' ').some((p) => { const [a, b] = p.split('/'); return [...a].some((c, i) => (c === '0' || c === '1') && c !== b[i]); }));
      if (diff) { fzBad++; t.ok(false, 'random expressions ' + prog + ': ' + diff + '\n' + src); } else t.ok(true);
    }
    console.log('synth      ' + (fz - fzBad) + ' of ' + fz + ' random expression modules agree after synthesis');
  }
  // not synthesisable: reasons with lines
  const why = (src, re, label) => { const r = V.synthesise(src); t.ok(!r.ok && r.reasons.some((x) => re.test(x.msg) && x.line > 0), 'synth reason ' + label + ': ' + JSON.stringify(r.reasons)); };
  why('module m(input a, output reg y);\n always begin #5 y = a; end\nendmodule', /must start with @/, 'always without @');
  why('module m(input [7:0] a, b, output [7:0] y);\n assign y = a / b;\nendmodule', /division/, 'division');
  why('module m(input clk, input a, output reg y);\n always @(posedge clk) begin @(negedge clk); y <= a; end\nendmodule', /event control/, 'event inside');
  why('module m(input clk, rst, a, output reg y);\n always @(posedge clk or posedge rst) if (rst) y <= a; else y <= ~a;\nendmodule', /reset value of y must be a constant/, 'non-constant reset');
  why('module m(input a, output y);\n assign y = ~y;\nendmodule', /combinational loop/, 'loop');
  why('module m(input clk, a, output reg y);\n always @(posedge clk) y <= a;\n always @(posedge clk) y <= ~a;\nendmodule', /two always blocks/, 'two always blocks');
}

// ---- VCD and the result shape -------------------------------------------------------------------------------------------
// ---- synthesis notes: complete cases, temporaries, state lists, counts that add up ------------------------------------------
if (sec('synth') || sec('notes')) {
  const kinds = (c) => c.parts.map((p) => p.type);
  const full = V.synthesise('module m(input [2:0] s, input [7:0] d, output reg y);\nalways @* case (s) 0: y = d[0]; 1: y = d[1]; 2: y = d[2]; 3: y = d[3]; 4: y = d[4]; 5: y = d[5]; 6: y = d[6]; 7: y = d[7]; endcase\nendmodule');
  t.ok(full.ok && !kinds(full).includes('LATCH') && full.trace.some((x) => x.kind === 'full-case'), 'a case covering all 8 values needs no default: no latch');
  const part = V.synthesise('module m(input [1:0] s, input a, b, output reg y);\nalways @* case (s) 0: y = a; 1: y = b; 2: y = a; endcase\nendmodule');
  t.ok(part.ok && kinds(part).includes('LATCH'), 'a case missing a value still makes a latch');
  const cz = V.synthesise("module m(input [1:0] s, input a, b, output reg y);\nalways @* casez (s) 2'b1?: y = a; 2'b0?: y = b; endcase\nendmodule");
  t.ok(cz.ok && !kinds(cz).includes('LATCH'), 'a casez whose patterns cover everything: no latch');
  const tmp = V.synthesise('module m(input clk, a, b, c, output reg q);\nreg t;\nalways @(posedge clk) begin t = a & b; q <= t | c; end\nendmodule');
  t.ok(tmp.ok && kinds(tmp).filter((k) => k === 'DFF').length === 1 && tmp.trace.some((x) => x.kind === 'temp' && x.name === 't'), 'a blocking temporary read at once is a wire, not a flip-flop');
  const kept = V.synthesise('module m(input clk, a, b, c, output reg q, output w);\nreg t;\nalways @(posedge clk) begin t = a & b; q <= t | c; end\nassign w = t;\nendmodule');
  t.ok(kept.ok && kinds(kept).filter((k) => k === 'DFF').length === 2, 'read outside its block, it stays a flip-flop');
  const held = V.synthesise('module m(input clk, a, c, output reg q);\nreg t;\nalways @(posedge clk) begin if (a) t = c; q <= t; end\nendmodule');
  t.ok(held.ok && kinds(held).filter((k) => k === 'DFF').length === 2, 'not set on every path, it holds a value: a flip-flop');
  const fsm = V.synthesise('module det(input clk, rst, x, output reg z);\nlocalparam A = 2\'d0, B = 2\'d1, C = 2\'d2, D = 2\'d3;\nreg [1:0] st, nx;\nalways @(posedge clk) if (rst) st <= A; else st <= nx;\nalways @* begin z = (st == D); case (st) A: nx = x ? B : A; B: nx = x ? C : A; C: nx = x ? C : D; default: nx = x ? B : A; endcase end\nendmodule');
  const f = fsm.ok && fsm.trace.find((x) => x.kind === 'fsm');
  t.ok(f && f.states.join() === 'A,B,C,D' && /D through the default arm/.test(f.say), 'the state list has D, taken by the default arm: ' + (f && f.say));
  const sumOf = (say) => { const o = {}; for (const m of (say.match(/\d+ [A-Za-z ]+?(?=,|$)/g) || [])) { const [n, ...w] = m.split(' '); const k = w.join(' ').replace(/ gates?$| gate$/, '').replace(/^NOT$/, 'inverter').replace(/s$/, ''); o[k] = (o[k] || 0) + +n; } return o; };
  const notes = {};
  for (const x of fsm.trace.filter((x) => x.kind === 'comb' || x.kind === 'seq' || x.kind === 'assign')) { const m = / becomes (.*)$/.exec(x.say); if (m && m[1] !== 'wires only') for (const [k, v] of Object.entries(sumOf(m[1]))) notes[k] = (notes[k] || 0) + v; }
  const total = {};
  for (const [k, v] of Object.entries(fsm.stats)) { if (k === 'flip-flops' || k === 'latches') continue; const kk = k.replace(/ gates$/, '').replace(/s$/, ''); total[kk] = v; }
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort());
  t.eq(sorted(notes), sorted(total), 'the notes of each block add up to the summary');
}

if (sec('vcd')) {
  const r = V.run('`timescale 1ns/1ps\nmodule tb; reg clk = 0; reg [3:0] n; always #5 clk = ~clk; initial begin n = 0; $dumpfile("d.vcd"); $dumpvars(0, tb); repeat (4) @(posedge clk) n <= n + 1; #1 $finish; end endmodule');
  const text = r.vcd();
  t.ok(/\$timescale 1ps \$end/.test(text) && /\$var reg 4 \S+ n \[3:0\] \$end/.test(text) && /\$var reg 1 \S+ clk \$end/.test(text) && /#5000/.test(text), 'vcd text from a Verilog run: regs are $var reg');
  // no `timescale: a unit is 1 ns; $dumpoff and $dumpon write their blocks, and a net stays a wire
  const r2 = V.run('module tb; reg a = 0; wire b; assign b = ~a; initial begin $dumpvars(0, tb); #2 a = 1; #3 $dumpoff; #4 a = 0; #5 $dumpon; #1 a = 1; #1 $finish; end endmodule');
  const t2 = r2.vcd();
  t.ok(/\$timescale 1ns \$end/.test(t2), 'vcd with no timescale is in 1ns:\n' + t2);
  t.ok(/\$var wire 1 \S+ b \$end/.test(t2) && /\$var reg 1 \S+ a \$end/.test(t2), 'vcd declares the net as wire and the reg as reg');
  t.ok(/#5\n\$dumpoff\nx\S+\nx\S+\n\$end/.test(t2) && /#14\n\$dumpon\n0\S+\n1\S+\n\$end/.test(t2) && !/#9\n/.test(t2), 'vcd writes $dumpoff and $dumpon blocks, and nothing while off:\n' + t2);
  t.ok(r.waves.get('tb.n') && Array.isArray(r.waves.get('tb.n')[1][1]) && r.waves.get('tb.clk')[0][1] === 0, 'waves in the Sim shape: ' + JSON.stringify(r.waves.get('tb.n').slice(0, 2)));
  t.ok(r.events.length > 5 && r.events.every((e) => 'cause' in e), 'events have causes');
  const w = new Map([['A', [[0, 0], [5, 1], [7.5, 'X']]], ['B', [[0, [1, 0, 'Z']], [2, [0, 0, 1]]]]]);
  const v2 = V.vcd(w);
  t.ok(/\$timescale 1ps/.test(v2) && /#7500/.test(v2) && /b1z0|bz01/.test(v2) && /\$var wire 3/.test(v2), 'vcd from Sim waves:\n' + v2);
}

// ---- fromCircuit on the drawn demo circuits ------------------------------------------------------------------------------
if (sec('fromcircuit') && S.Netlist) {
  let n = 0, good = 0;
  const N = S.Netlist;
  const sample = [N.fromExpressions('maj', { F: "AB + AC + BC" }), N.fromExpressions('xo', { F: 'A ^ B ^ C', G: "(A + B)'" }, 'multi'), N.fromExpressions('nn', { F: "AB' + C" }, 'nand-nand')];
  // and every circuit of the demo gallery
  const SD = load(['core', 'schematic', 'demo']);
  const demos = SD.Demo ? SD.Demo.list().map((d) => { try { return d.build(); } catch (e) { return null; } }).filter((c) => c && c.parts) : [];
  const evalOk = new Set(['IN', 'OUT', 'CONST', 'NOT', 'BUF', 'AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR', 'MUX', 'FA', 'SPLIT', 'MERGE']);
  let dn = 0, dgood = 0;
  for (const c of demos) {
    dn++;
    const text = SD.Verilog.fromCircuit(c);
    const cc = SD.Verilog.compile(text);
    t.ok(!cc.errors.length, 'fromCircuit of the demo ' + c.title + ': ' + JSON.stringify(cc.errors[0]));
    if (cc.errors.length) continue;
    // small combinational ones: every input row against the netlist evaluator
    const ins = c.parts.filter((p) => p.type === 'IN'), outs = c.parts.filter((p) => p.type === 'OUT');
    const bits = ins.reduce((a, p) => a + (p.params.w || 1), 0);
    if (!c.parts.every((p) => evalOk.has(p.type) && (p.type !== 'MUX' || (p.params.n || 2) === 2 && (p.params.w || 1) === 1 && !p.params.en)) || bits > 8 || !outs.length) { dgood++; continue; }
    const names = ins.map((p) => p.params.name), onames = outs.map((p) => p.params.name);
    const id = (x) => x.replace(/[^A-Za-z0-9_]/g, '_');
    const tb = 'module tb_auto; ' + ins.map((p) => 'reg ' + ((p.params.w || 1) > 1 ? '[' + (p.params.w - 1) + ':0] ' : '') + id(p.params.name) + ';').join(' ') + ' ' + outs.map((p) => 'wire ' + ((p.params.w || 1) > 1 ? '[' + (p.params.w - 1) + ':0] ' : '') + 'o_' + id(p.params.name) + ';').join(' ') +
      '\n ' + cc.tops[0] + ' u (' + names.map((x) => '.' + id(x) + '(' + id(x) + ')').concat(onames.map((x) => '.' + id(x) + '(o_' + id(x) + ')')).join(', ') + ');\n integer k; initial for (k = 0; k < ' + (1 << bits) + '; k = k + 1) begin {' + names.map(id).join(', ') + '} = k; #1 $display("' + onames.map(() => '%b').join(' ') + '"' + onames.map((x) => ', o_' + id(x)).join('') + '); end\nendmodule';
    const r = SD.Verilog.run(text + '\n' + tb, { top: 'tb_auto' });
    let same = !r.errors.length;
    const ev = netEval(c);
    for (let k = 0; k < 1 << bits && same; k++) {
      let off = bits;
      for (const p of ins) { const w = p.params.w || 1; off -= w; const v = (k >> off) & ((1 << w) - 1); ev.set(p.params.name, Array.from({ length: w }, (_, i) => (v >> i) & 1)); }
      ev.settle();
      const want = onames.map((o) => ev.out(o).slice().reverse().map((x) => (x === 2 ? 'x' : String(x))).join('')).join(' ');
      if (r.output[k] !== want) { same = false; t.ok(false, 'demo ' + c.title + ' row ' + k + ': Verilog ' + r.output[k] + ', netlist ' + want); }
    }
    if (same) { dgood++; t.ok(true); }
  }
  console.log('fromcirc   ' + dgood + ' of ' + dn + ' demo circuits written as Verilog compile (and agree, where small and combinational)');
  for (const c of sample) {
    n++;
    const text = V.fromCircuit(c);
    const cc = V.compile(text);
    if (cc.errors.length) { t.ok(false, 'fromCircuit ' + c.title + ': ' + JSON.stringify(cc.errors[0]) + '\n' + text); continue; }
    // compare with the expressions on every input
    const names = c.parts.filter((p) => p.type === 'IN').map((p) => p.params.name);
    const outs = c.parts.filter((p) => p.type === 'OUT').map((p) => p.params.name);
    let tb = 'module tb_auto; reg ' + names.join(', ') + '; wire ' + outs.join(', ') + ';\n ' + cc.tops[0] + ' u (' + names.concat(outs).map((x) => '.' + x + '(' + x + ')').join(', ') + ');\n integer k; initial for (k = 0; k < ' + (1 << names.length) + '; k = k + 1) begin {' + names.join(', ') + '} = k; #1 $display("' + outs.map(() => '%b').join('') + '"' + outs.map((o) => ', ' + o).join('') + '); end\nendmodule';
    const r = V.run(text + '\n' + tb, { top: 'tb_auto' });
    let same = !r.errors.length;
    for (let k = 0; k < 1 << names.length && same; k++) {
      const env = {}; names.forEach((x, i) => { env[x] = (k >> (names.length - 1 - i)) & 1; });
      // evaluate the expression circuit directly
      const ev = netEval(c);
      names.forEach((x) => ev.set(x, [env[x]]));
      ev.settle();
      if (r.output[k] !== outs.map((o) => String(ev.out(o)[0])).join('')) same = false;
    }
    t.ok(same, 'fromCircuit ' + c.title + ' behaves like the circuit');
    if (same) good++;
  }
  console.log('fromcirc   ' + good + ' of ' + n + ' expression circuits written as Verilog agree');
}
}
