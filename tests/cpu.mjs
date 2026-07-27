// The processor: the example programs, the hard-wired and microprogrammed control units cycle for cycle, and
// random programs against an instruction-level interpreter written here: node tests/cpu.mjs [count] [seed]
import { load, harness, rng } from './load.mjs';

const S = load(['core', 'schematic']);
const C = S.Cpu;
const t = harness('cpu');
const COUNT = +(process.argv[2] || 150), R = rng(+(process.argv[3] || 777));
const int = (n) => Math.floor(R() * n);
const pick = (a) => a[int(a.length)];

// ---------------------------------------------------------------- an oracle: the instruction set, directly
function interpret(mem0, start, input, max) {
  const mem = mem0.slice(), out = [], inp = input.slice();
  let pc = start, ac = 0, sp = 0, Z = 0, Cf = 0, N = 0, steps = 0;
  const zn = (v) => { Z = v === 0 ? 1 : 0; N = (v >> 7) & 1; };
  while (steps++ < max) {
    const b = mem[pc], op = b >> 4, mode = b & 3;
    pc = (pc + 1) & 255;
    const ins = C.ISA.find((i) => i.op === op && (i.sub == null || i.sub === (b & 1)));
    if (ins.kind === 'mem') {
      const a = mem[pc]; pc = (pc + 1) & 255;
      const md = ['dir', 'ind', 'imm', 'bad'][mode];
      if (!ins.modes.includes(md)) return { halted: true, ac, out, mem, pc, sp, Z, C: Cf, N };
      const addr = md === 'ind' ? mem[a] : a;
      const val = md === 'imm' ? a : mem[addr];
      switch (ins.m) {
        case 'LDA': ac = val; zn(ac); break;
        case 'STA': mem[addr] = ac; break;
        case 'ADD': { const r = ac + val; Cf = r > 255 ? 1 : 0; ac = r & 255; zn(ac); break; }
        case 'SUB': { Cf = ac >= val ? 1 : 0; ac = (ac - val) & 255; zn(ac); break; }
        case 'AND': ac &= val; zn(ac); break;
        case 'OR': ac |= val; zn(ac); break;
        case 'JMP': pc = addr; break;
        case 'JZ': if (Z) pc = addr; break;
        case 'JC': if (Cf) pc = addr; break;
        case 'CALL': sp = (sp - 1) & 255; mem[sp] = pc; pc = addr; break;
      }
    } else {
      switch (ins.m) {
        case 'HLT': return { halted: true, ac, out, mem, pc, sp, Z, C: Cf, N };
        case 'NOT': ac = ~ac & 255; zn(ac); break;
        case 'SHL': Cf = (ac >> 7) & 1; ac = (ac << 1) & 255; zn(ac); break;
        case 'SHR': Cf = ac & 1; ac >>= 1; zn(ac); break;
        case 'IN': ac = inp.length ? inp.shift() : 0; zn(ac); break;
        case 'OUT': out.push(ac); break;
        case 'RET': pc = mem[sp]; sp = (sp + 1) & 255; break;
      }
    }
  }
  return { halted: false, ac, out, mem, pc, sp, Z, C: Cf, N };
}

/** run both control units side by side; false (with the cycle) at the first difference */
function lockstep(prog, input, max) {
  const h = C.machine(prog, { control: 'hardwired', input }), m = C.machine(prog, { control: 'micro', input });
  for (let k = 0; k < max && h.st.S; k++) {
    const a = h.cycle(), b = m.cycle();
    if (!b || JSON.stringify([a.T, a.ops, a.regs, a.end]) !== JSON.stringify([b.T, b.ops, b.regs, b.end])) return { same: false, at: k, a, b };
  }
  return { same: h.st.S === m.st.S && JSON.stringify(h.st.mem) === JSON.stringify(m.st.mem) && JSON.stringify(h.st.output) === JSON.stringify(m.st.output), h, m };
}

// ---------------------------------------------------------------- the examples
for (const [k, p] of Object.entries(C.programs)) {
  const prog = C.assemble(p.src);
  t.eq(prog.errors, [], k + ' assembles');
  for (const control of ['hardwired', 'micro']) {
    const r = C.runExample(k, { control });
    t.ok(r.ok && r.run.halted, k + ' gives ' + JSON.stringify(p.answer) + ' with ' + control + ' control (got ' + JSON.stringify(r.run.output) + ')');
  }
  const o = interpret(prog.mem, prog.start, p.input || [], 100000);
  t.eq(o.out, p.answer, k + ': the interpreter agrees');
  const ls = lockstep(prog, p.input, 100000);
  t.ok(ls.same, k + ': the two control units agree cycle for cycle' + (ls.same ? '' : ' (cycle ' + ls.at + ')'));
  t.ok(ls.h.trace.every((s) => typeof s.say === 'string' && s.say.length > 3), k + ': every step says something');
}

// ---------------------------------------------------------------- random programs
// straight-line arithmetic and I/O, forward conditional jumps over a block, and a subroutine call
function randomProgram() {
  const lines = ['start:'], n = 6 + int(14);
  const data = ['d0', 'd1', 'd2', 'd3', 'p'];
  let label = 0;
  for (let i = 0; i < n; i++) {
    const r = R();
    if (r < 0.45) {
      const m = pick(['LDA', 'ADD', 'SUB', 'AND', 'OR']), mode = R();
      lines.push('  ' + m + ' ' + (mode < 0.4 ? '#' + int(256) : mode < 0.6 ? '@p' : pick(data.slice(0, 4))));
    } else if (r < 0.6) lines.push('  STA ' + pick(['d0', 'd1', 'd2', 'd3', '@p']));
    else if (r < 0.75) lines.push('  ' + pick(['NOT', 'SHL', 'SHR', 'OUT', 'IN']));
    else if (r < 0.88) { const l = 'L' + label++; lines.push('  ' + pick(['JZ', 'JC']) + ' ' + l, '  ' + pick(['NOT', 'SHL', 'OUT']), '  ADD #' + int(256), l + ':'); } else lines.push('  CALL sub');
  }
  lines.push('  OUT', '  HLT', 'sub: ADD #3', '  OUT', '  RET');
  for (const d of data.slice(0, 4)) lines.push(d + ': DB ' + int(256));
  lines.push('p: DB d' + int(4));
  return lines.join('\n');
}
let agreeOracle = 0, agreeCtl = 0;
for (let i = 0; i < COUNT; i++) {
  const src = randomProgram(), prog = C.assemble(src);
  if (prog.errors.length) { t.eq(prog.errors, [], 'random program assembles'); continue; }
  const input = Array.from({ length: 8 }, () => int(256));
  const o = interpret(prog.mem, prog.start, input, 10000);
  const ls = lockstep(prog, input, 50000);
  if (ls.same) agreeCtl++; else t.ok(false, 'control units differ at cycle ' + ls.at + ': ' + (ls.a && ls.a.say) + ' / ' + (ls.b && ls.b.say));
  const h = ls.h || C.machine(prog, { input });
  const st = h.st;
  const same = o.halted && !st.S && JSON.stringify(o.out) === JSON.stringify(st.output) && o.ac === st.AC && JSON.stringify(o.mem) === JSON.stringify(st.mem) && o.sp === st.SP && o.Z === st.F.Z && o.C === st.F.C && o.N === st.F.N;
  if (same) agreeOracle++; else t.ok(false, 'random program differs from the interpreter:\n' + src);
}
t.eq(agreeOracle, COUNT, 'random programs match the interpreter');
t.eq(agreeCtl, COUNT, 'random programs: hard-wired and microprogrammed control agree cycle for cycle');

// ---------------------------------------------------------------- assembler and disassembler
{
  // every instruction in every mode round-trips through the disassembler
  const lines = [];
  for (const ins of C.ISA) {
    if (ins.kind === 'inherent') lines.push(ins.m);
    else for (const md of ins.modes) lines.push(ins.m + ' ' + (md === 'imm' ? '#' + int(256) : (md === 'ind' ? '@' : '') + int(256)));
  }
  const a = C.assemble(lines.join('\n'));
  t.eq(a.errors, [], 'every instruction assembles');
  const dis = C.disassemble(a.mem, 0, lines.length);
  t.eq(dis.map((d) => d.text), lines, 'disassembly gives the source back');
  const b = C.assemble(dis.map((d) => d.text).join('\n'));
  t.eq(b.mem, a.mem, 'and it reassembles to the same bytes');
  const errs = C.assemble('x: LDA #300\nx: STA #3\n JMP nowhere\n FOO\n LDA\n NOT 5\n DB 1, 2\n ORG 255\n LDA 1').errors.map((e) => e.line + ' ' + e.msg);
  t.eq(errs, ['1 300 does not fit in a byte', '2 the label x is defined twice', '2 STA cannot take an immediate operand', '3 unknown name nowhere', '4 unknown instruction FOO', '5 LDA needs one operand', '6 NOT takes no operand', '9 the program runs past address 255'], 'assembler errors with their lines');
  const eq = C.assemble('SIZE EQU 4\n ORG 0x10\nstart: LDA #SIZE\n ADD tab+1\n HLT\ntab: DB 1, 2, 0b11\n DS 2\nend: DB 9');
  t.eq([eq.errors.length, eq.start, eq.mem[0x10], eq.mem[0x11], eq.mem[0x13], eq.symbols.tab, eq.symbols.end, eq.mem[eq.symbols.end]], [0, 0x10, 0x12, 4, eq.symbols.tab + 1, 0x15, 0x1A, 9], 'ORG, EQU, DB, DS and label arithmetic');
}

// ---------------------------------------------------------------- the control units themselves
{
  const mp = C.microprogram();
  t.ok(mp.words.every((w) => w.ops.length === new Set(w.ops.map((u) => C.MICRO[u].f)).size), 'no two operations of one field share a microinstruction');
  t.ok(mp.words.every((w) => w.binary.replace(/ /g, '').length === mp.width), 'every word has the format width (' + mp.width + ' bits)');
  t.ok(mp.map.every((a) => a != null && a < mp.words.length), 'the mapping ROM covers every opcode and mode');
  t.ok(mp.words.every((w) => w.br === 'MAP' || w.ad < mp.words.length), 'every branch address is in the control memory');
  const rows = C.hardwired();
  t.ok(rows.every((r) => /^T\d/.test(r.cond) && r.rtl), 'every control function starts with its timing signal');
  // exactly one row is active in each cycle of each routine (checked by running every instruction)
  for (const [key, r] of Object.entries(C.routines())) {
    const byte = r.ins ? (r.ins.op << 4) | (r.ins.sub || 0) | (r.mode ? C.MODES[r.mode] : 0) : 0x23;
    for (const flags of [{ Z: 0, C: 0 }, { Z: 1, C: 1 }]) {
      const mem = new Array(256).fill(0); mem[0] = byte; mem[1] = 0x40; mem[0x40] = 0x50;
      for (const control of ['hardwired', 'micro']) {
        const cpu = C.machine({ mem, start: 0 }, { control, input: [7] });
        Object.assign(cpu.st.F, flags);
        cpu.st.SP = 0x80;
        let ok = true;
        try { cpu.instruction(); } catch (e) { ok = false; }
        t.ok(ok && cpu.SC === 0, key + ' runs one instruction under ' + control + ' control');
      }
    }
  }
  const tm = C.timing();
  t.ok(tm.length === Object.keys(C.routines()).length && tm.every((r) => r.steps[0].T === 0), 'the timing table lists every instruction from T0');
  // the bus carries one source a cycle, and the trace says which
  const r = C.runExample('sum');
  t.ok(r.cpu.trace.filter((s) => s.kind === 'cycle').every((s) => !s.bus || s.bus.sel != null), 'every bus transfer has its select code');
}

// ---------------------------------------------------------------- the drawings
{
  const dp = C.datapathCircuit();
  t.eq(dp.validate(), [], 'the datapath circuit is well formed');
  const L = S.Layout.layout(dp);
  t.eq(S.Verify.check(L).problems.map((p) => p.msg), [], 'the datapath drawing keeps the rules');
  t.eq(L.style, 'cpu', 'the datapath is drawn in its own style');
  t.ok(L.crossingCount <= 7, 'the datapath drawing has at most 7 crossings (' + L.crossingCount + ')');
  const cu = C.controlCircuit();
  t.eq(cu.validate(), [], 'the control-unit circuit is well formed');
  t.eq(S.Verify.check(S.Layout.layout(cu)).problems.map((p) => p.msg), [], 'the control-unit drawing keeps the rules');
}

t.done();
