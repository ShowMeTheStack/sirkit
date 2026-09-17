// Part 13: the small processor. Every value the narration quotes (registers, the bus and its select code, flags,
// memory bytes, assembled bytes and addresses, symbol-table entries, control products, control-memory words and
// addresses, cycle and instruction counts, outputs) is checked against the engine's state at that frame and
// against a reference written here from the instruction set alone: an assembler, and a processor that runs the
// same register transfers cycle by cycle.

const hex = (v) => (v & 0xff).toString(16).toUpperCase().padStart(2, '0');

// ---- the instruction set, as the programmer sees it ----
const OPS = { HLT: 0, LDA: 1, STA: 2, ADD: 3, SUB: 4, AND: 5, OR: 6, NOT: 7, SHL: 8, SHR: 9, JMP: 10, JZ: 11, JC: 12, IN: 13, OUT: 13, CALL: 14, RET: 15 };
const MEMREF = { LDA: 'dir ind imm', STA: 'dir ind', ADD: 'dir ind imm', SUB: 'dir ind imm', AND: 'dir ind imm', OR: 'dir ind imm', JMP: 'dir ind', JZ: 'dir ind', JC: 'dir ind', CALL: 'dir ind' };
const MODE_BITS = { dir: 0, ind: 1, imm: 2 };
const NAMES = Object.fromEntries(Object.entries(OPS).filter(([m]) => m !== 'IN' && m !== 'OUT').map(([m, o]) => [o, m]));
function decode(b) {
  const op = b >> 4, low = b & 3;
  if (op === 13) return { m: (b & 1) ? 'OUT' : 'IN', op, mode: null };
  const m = NAMES[op];
  if (!MEMREF[m]) return { m, op, mode: null };
  const mode = ['dir', 'ind', 'imm', null][low];
  return { m, op, mode: mode && MEMREF[m].split(' ').includes(mode) ? mode : 'bad' };
}

// ---- a reference assembler ----
export function assemble(src) {
  const rows = [], syms = {}, errors = [], defLine = {};
  const num = (t) => (/^0x[0-9a-f]+$/i.test(t) ? parseInt(t, 16) : /^0b[01]+$/i.test(t) ? parseInt(t.slice(2), 2) : /^-?\d+$/.test(t) ? +t : null);
  src.split('\n').forEach((raw, i) => {
    let t = raw.replace(/;.*/, '').trim();
    const r = { line: i + 1, raw, label: null, op: null, args: [] };
    let m = /^([A-Za-z_]\w*)\s*:\s*(.*)$/.exec(t);
    if (m) { r.label = m[1]; t = m[2]; }
    m = /^([A-Za-z_]\w*)\s+EQU\s+(.+)$/i.exec(t);
    if (m) { r.equ = m[1]; r.args = [m[2].trim()]; }
    else if (t) { m = /^([A-Za-z]+)\s*(.*)$/.exec(t); r.op = m[1].toUpperCase(); r.args = m[2] ? m[2].split(',').map((a) => a.trim()) : []; }
    if (raw.trim()) rows.push(r);
  });
  const names = (a) => (String(a).replace(/^[#@]/, '').match(/[A-Za-z_]\w*/g) || []).filter((n) => !/^0[xb]/i.test(n) && num(n) === null);
  const val = (a, pass, r) => {
    let s = String(a).replace(/^[#@]/, '').trim(), v = 0, sign = 1;
    for (const part of s.split(/\s*([+-])\s*/)) {
      if (part === '+') { sign = 1; continue; } if (part === '-') { sign = -1; continue; }
      let x = num(part);
      if (x === null) { if (part in syms) x = syms[part]; else { if (pass === 2) errors.push({ line: r.line, name: part }); x = 0; } }
      v += sign * x;
    }
    return v;
  };
  let pc = 0;
  for (const r of rows) {
    if (r.equ) { syms[r.equ] = val(r.args[0], 1, r); defLine[r.equ] = r.line; continue; }
    if (r.op === 'ORG') { pc = val(r.args[0], 1, r) & 0xff; }
    if (r.label) { syms[r.label] = pc; defLine[r.label] = r.line; }
    r.addr = pc;
    r.size = !r.op || r.op === 'ORG' ? 0 : r.op === 'DB' ? r.args.length : r.op === 'DS' ? val(r.args[0], 1, r) : MEMREF[r.op] ? 2 : 1;
    pc += r.size;
  }
  const mem = new Array(256).fill(0);
  let start = null;
  for (const r of rows) {
    r.bytes = [];
    if (!r.op || r.op === 'ORG') continue;
    if (r.op === 'DB') r.bytes = r.args.map((a) => val(a, 2, r) & 0xff);
    else if (r.op === 'DS') r.bytes = new Array(r.size).fill(0);
    else {
      if (start === null) start = r.addr;
      if (MEMREF[r.op]) {
        const a = r.args[0], mode = a[0] === '@' ? 'ind' : a[0] === '#' ? 'imm' : 'dir';
        r.mode = mode;
        r.bytes = [(OPS[r.op] << 4) | MODE_BITS[mode], val(a, 2, r) & 0xff];
      } else r.bytes = [(OPS[r.op] << 4) | (r.op === 'OUT' ? 1 : 0)];
    }
    r.bytes.forEach((b, k) => { mem[r.addr + k] = b; });
  }
  // names used on a line above the one that defines them
  const forward = [];
  for (const r of rows) for (const a of r.args) for (const n of names(a)) if (defLine[n] > r.line && !forward.includes(n)) forward.push(n);
  const unknown = [...new Set(errors.map((e) => e.name))];
  return { rows, syms, mem, errors, forward, unknown, start: start || 0, size: rows.reduce((s, r) => s + r.bytes.length, 0) };
}

// ---- a reference processor, cycle by cycle ----
const RTL = {
  'AR←PC': 'AR ← PC', 'IR←M': 'IR ← M[AR]', 'AR←M': 'AR ← M[AR]', 'DR←M': 'DR ← M[AR]', 'M←AC': 'M[AR] ← AC', 'M←PC': 'M[AR] ← PC',
  'PC←AR': 'PC ← AR', 'PC←DR': 'PC ← DR', 'PC←M': 'PC ← M[AR]', 'DR←AR': 'DR ← AR', 'AR←SP': 'AR ← SP', 'DR←IN': 'DR ← INPR', 'OUTR←AC': 'OUTR ← AC',
  'PC+': 'PC ← PC + 1', 'SP-': 'SP ← SP − 1', 'SP+': 'SP ← SP + 1', 'AC←DR': 'AC ← DR', ADD: 'AC ← AC + DR', SUB: 'AC ← AC − DR', AND: 'AC ← AC ∧ DR', OR: 'AC ← AC ∨ DR', NOT: 'AC ← AC′', SHL: '{C, AC} ← AC << 1', SHR: '{AC, C} ← AC >> 1', HLT: 'S ← 0',
};
const SEL = { INPR: 0, PC: 1, DR: 2, AC: 3, IR: 4, SP: 5, AR: 6, 'M[AR]': 7 };
const FETCH = [{ ops: ['AR←PC'] }, { ops: ['IR←M', 'PC+'] }, { ops: ['AR←PC'] }];
/** the cycles after T2 of the instruction in IR */
export function routine(m, mode) {
  const end = (ops) => ({ ops, end: true });
  if (mode === 'bad') return [end(['HLT'])];
  const addr = { dir: [{ ops: ['AR←M', 'PC+'] }], ind: [{ ops: ['AR←M', 'PC+'] }, { ops: ['AR←M'] }], imm: [{ ops: ['DR←M', 'PC+'] }] }[mode] || [];
  const read = mode === 'imm' ? [] : [{ ops: ['DR←M'] }];
  switch (m) {
    case 'HLT': case 'NOT': case 'SHL': case 'SHR': return [end([m])];
    case 'IN': return [{ ops: ['DR←IN'] }, end(['AC←DR'])];
    case 'OUT': return [end(['OUTR←AC'])];
    case 'RET': return [{ ops: ['AR←SP'] }, end(['PC←M', 'SP+'])];
    case 'LDA': return [...addr, ...read, end(['AC←DR'])];
    case 'ADD': case 'SUB': case 'AND': case 'OR': return [...addr, ...read, end([m])];
    case 'STA': return [...addr, end(['M←AC'])];
    case 'JMP': return [...addr, end(['PC←AR'])];
    case 'JZ': case 'JC': return [...addr, { flag: m[1], t: end(['PC←AR']), f: end([]) }];
    case 'CALL': return [...addr, { ops: ['SP-', 'DR←AR'] }, { ops: ['AR←SP'] }, { ops: ['M←PC'] }, end(['PC←DR'])];
  }
  return [end(['HLT'])];
}
/** do one cycle's transfers, all reading the values from before the edge: { bus, changes {reg: value}, error } */
export function transfer(st, ops) {
  const o = { ...st, F: { ...st.F } }, w = {}, f = {};
  let bus = null, error = null, mw = null;
  const src = { 'AR←PC': 'PC', 'IR←M': 'M[AR]', 'AR←M': 'M[AR]', 'DR←M': 'M[AR]', 'M←AC': 'AC', 'M←PC': 'PC', 'PC←AR': 'AR', 'PC←DR': 'DR', 'PC←M': 'M[AR]', 'DR←AR': 'AR', 'AR←SP': 'SP', 'DR←IN': 'INPR', 'OUTR←AC': 'AC' };
  const read = (s) => (s === 'M[AR]' ? st.mem[o.AR] : s === 'INPR' ? (st.input.length ? st.input[0] : 0) : o[s]);
  const set = (r, v) => { if (r in w) error = 'two operations write ' + r + ' in one cycle'; w[r] = v & 0xff; };
  const zn = (v) => { f.Z = (v & 0xff) === 0 ? 1 : 0; f.N = (v >> 7) & 1; };
  for (const u of ops) {
    if (src[u]) {
      if (bus && bus.src !== src[u]) { error = 'two sources on the bus: ' + bus.src + ' and ' + src[u]; continue; }
      if (!bus) bus = { src: src[u], sel: SEL[src[u]], value: read(src[u]) };
      const dst = u.split('←')[0];
      if (dst === 'M') mw = { addr: o.AR, value: bus.value }; else if (dst === 'OUTR') w.OUTR = bus.value; else set(dst, bus.value);
      continue;
    }
    if (u === 'PC+') set('PC', o.PC + 1);
    else if (u === 'SP-') set('SP', o.SP - 1);
    else if (u === 'SP+') set('SP', o.SP + 1);
    else if (u === 'AC←DR') { set('AC', o.DR); zn(o.DR); }
    else if (u === 'ADD') { const r = o.AC + o.DR; set('AC', r); zn(r); f.C = r > 255 ? 1 : 0; }
    else if (u === 'SUB') { const r = (o.AC - o.DR) & 0xff; set('AC', r); zn(r); f.C = o.AC >= o.DR ? 1 : 0; }
    else if (u === 'AND') { set('AC', o.AC & o.DR); zn(o.AC & o.DR); }
    else if (u === 'OR') { set('AC', o.AC | o.DR); zn(o.AC | o.DR); }
    else if (u === 'NOT') { set('AC', ~o.AC); zn(~o.AC & 0xff); }
    else if (u === 'SHL') { set('AC', o.AC << 1); zn((o.AC << 1) & 0xff); f.C = (o.AC >> 7) & 1; }
    else if (u === 'SHR') { set('AC', o.AC >> 1); zn(o.AC >> 1); f.C = o.AC & 1; }
    else if (u === 'HLT') w.HALT = 1;
  }
  if (error) return { error };
  const changes = {};
  for (const [r, v] of Object.entries(w)) {
    if (r === 'HALT') { st.S = 0; continue; }
    if (r === 'OUTR') { st.output.push(v); st.OUTR = v; continue; }
    if (st[r] !== v) changes[r] = v;
    st[r] = v;
  }
  for (const [k, v] of Object.entries(f)) { if (st.F[k] !== v) changes[k] = v; st.F[k] = v; }
  // a memory write is reported even when the byte keeps its value: the write still happens
  if (mw) { changes['M[' + hex(mw.addr) + ']'] = mw.value; st.mem[mw.addr] = mw.value; }
  if (ops.includes('DR←IN') && st.input.length) st.input.shift();
  return { bus, changes };
}
/** a processor: step() does one clock and returns { T, ops, rtl, bus, changes, end, insAddr, ins } */
export function machine(mem, start, input) {
  const st = { mem: mem.slice(), PC: start || 0, AR: 0, IR: 0, AC: 0, DR: 0, SP: 0, F: { Z: 0, C: 0, N: 0 }, S: 1, input: (input || []).slice(), output: [] };
  let T = 0, plan = null, insAddr = 0, cycles = 0, count = 0;
  const M = {
    st,
    get cycles() { return cycles; }, get count() { return count; },
    regs: () => ({ PC: st.PC, AR: st.AR, IR: st.IR, AC: st.AC, DR: st.DR, SP: st.SP, Z: st.F.Z, C: st.F.C, N: st.F.N }),
    step() {
      if (!st.S) return null;
      if (T === 0) insAddr = st.PC;
      let c = T < 3 ? FETCH[T] : plan[T - 3];
      let flag = null;
      if (c.flag) { flag = { name: c.flag, value: st.F[c.flag] }; c = st.F[c.flag] ? c.t : c.f; }
      const ops = c.ops;
      const r = transfer(st, ops);
      if (r.error) throw new Error(r.error);
      if (T === 2) { const d = decode(st.IR); plan = routine(d.m, d.mode); }
      const out = { T, ops, rtl: ops.map((u) => RTL[u]).concat(c.end ? ['SC ← 0'] : []), bus: r.bus, changes: r.changes, end: !!c.end || !st.S, insAddr, flag, regs: M.regs(), output: st.output.slice() };
      cycles++;
      if (out.end) { T = 0; count++; } else T++;
      return out;
    },
    instruction() { const out = []; let s; do { s = M.step(); if (s) out.push(s); } while (s && !s.end); return out; },
  };
  return M;
}

// ---- reading the narration ----
const becomes = (s) => [...s.matchAll(/(M\[[0-9A-F]{2}\]|\b[A-Z]{1,2}) becomes ([0-9A-F]+)/g)].map((m) => [m[1], m[2]]);
/** "T3: AR ← M[AR], PC ← PC + 1. The bus carries M[AR] = 07 (select 7). AR becomes 07, PC becomes 02." */
function cycleSay(say) {
  const m = /(?:^|[.:] )T(\d+): (.+?)\.(?= |$)/.exec(say);
  if (!m) return null;
  const bus = /The bus carries (\S+) = ([0-9A-F]{2}) \(select (\d)\)/.exec(say);
  return { T: +m[1], rtl: m[2], bus: bus ? { src: bus[1], value: bus[2], sel: +bus[3] } : null, becomes: becomes(say) };
}
const fmtChange = (r, v) => (r.length === 1 ? String(v) : hex(v));
/** compare a narrated cycle with the reference cycle */
function sameCycle(fail, where, said, ref) {
  const rtl = ref.rtl.join(', ') || 'no operation';
  if (said.T !== ref.T) fail(where + ': says T' + said.T + ', the reference is at T' + ref.T);
  if (said.rtl !== rtl) fail(where + ': says "' + said.rtl + '", the reference does "' + rtl + '"');
  const rb = ref.bus ? { src: ref.bus.src, value: hex(ref.bus.value), sel: ref.bus.sel } : null;
  if (JSON.stringify(said.bus) !== JSON.stringify(rb)) fail(where + ': says the bus carries ' + JSON.stringify(said.bus) + ', the reference ' + JSON.stringify(rb));
  const want = Object.entries(ref.changes).map(([r, v]) => [r, fmtChange(r, v)]);
  if (JSON.stringify([...said.becomes].sort()) !== JSON.stringify([...want].sort())) fail(where + ': says ' + JSON.stringify(said.becomes) + ' change, the reference ' + JSON.stringify(want));
}
/** the datapath picture of a frame: registers, flags and memory as drawn */
function drawn(frame) {
  const regs = {}, mem = {};
  for (const it of frame.items) {
    let m = /^dp:r:(\w+)$/.exec(it.key || '');
    if (m && it.lines && /^[0-9A-F]{2}$/.test(it.lines[1])) regs[m[1]] = parseInt(it.lines[1], 16);
    m = /^dp:f:(\w)$/.exec(it.key || '');
    if (m) regs[m[1]] = +it.text.split(' ')[1];
    m = /^dp:m:(\d+)$/.exec(it.key || '');
    if (m) mem[+m[1]] = parseInt(it.text.slice(3, 5), 16);
  }
  return { regs, mem };
}
function drawnMatches(fail, where, frame, st) {
  const d = drawn(frame);
  for (const [r, v] of Object.entries(d.regs)) {
    const want = r.length === 1 ? st.F[r] : st[r];
    if (want !== undefined && v !== (want & 0xff)) fail(where + ': the picture shows ' + r + ' = ' + v + ', the reference has ' + want);
  }
  for (const [a, v] of Object.entries(d.mem)) if (v !== st.mem[a]) fail(where + ': the picture shows M[' + hex(+a) + '] = ' + hex(v) + ', the reference has ' + hex(st.mem[a]));
}

// ---- the programs the topics run (their source text is the topics' input; the working-out is ours) ----
const DATAPATH_BASE = `; a small program for the datapath to work on
start:  LDA num
        ADD #5
        STA num
        HLT
num:    DB 37`;
const FORMAT = (ins) => `        ${ins}
        HLT
        ORG 0x10
num:    DB 42
ptr:    DB num
val:    DB 7`;
const FETCH_PROGS = {
  three: '        LDA num\n        ADD #5\n        STA num\n        HLT\nnum:    DB 37',
  jump: '        LDA #0\n        JZ there\n        HLT\nthere:  NOT\n        HLT',
  stack: '        CALL sub\n        HLT\nsub:    LDA #1\n        RET',
};
const CLS = {
  'LDA.dir': ['', 'LDA val'], 'LDA.ind': ['', 'LDA @ptr'], 'LDA.imm': ['', 'LDA #9'], STA: ['LDA #77', 'STA val'], ADD: ['LDA #200', 'ADD #100'], SUB: ['LDA #5', 'SUB #9'],
  NOT: ['LDA #0x0F', 'NOT'], SHL: ['LDA #0x81', 'SHL'], JMP: ['', 'JMP far'], JZt: ['LDA #0', 'JZ far'], JZn: ['LDA #1', 'JZ far'], CALL: ['', 'CALL far'], IN: ['', 'IN'], OUT: ['LDA #42', 'OUT'],
};
const clsSrc = (k) => (CLS[k][0] ? '        ' + CLS[k][0] + '\n' : '') + '        ' + CLS[k][1] + '\n        HLT\n        ORG 0x20\nval:    DB 13\nptr:    DB val\n        ORG 0x30\nfar:    HLT';
const READ_OPS = (text) => String(text).split(';').map((c) => c.split(',').map((t) => t.replace(/\s+/g, '').replace(/<-/g, '←').replace(/M\[AR\]/g, 'M').replace(/^PC←PC\+1$|^PC\+1$/, 'PC+').replace(/^SP←SP-1$|^SP-1$/, 'SP-').replace(/^SP←SP\+1$|^SP\+1$/, 'SP+')).filter(Boolean)).filter((c) => c.length);

/** the source line at an address, as the narration quotes it */
const lineAt = (A, addr) => { const r = A.rows.find((q) => q.addr === addr && q.bytes.length && q.op !== 'DB' && q.op !== 'DS'); return r ? r.raw.replace(/;.*/, '').replace(/^\s*[A-Za-z_]\w*\s*:/, '').replace(/\s+/g, ' ').trim() : null; };

// ---- the checks, topic by topic ----
const checks = {
  'cpu-datapath'({ input, r, fail, S }) {
    const A = assemble(DATAPATH_BASE), M = machine(A.mem, 0), st = M.st, F = r.frames;
    const prog = DATAPATH_BASE.split('\n').slice(1).map((l) => l.replace(/\s+/g, ' ').trim()).join('; ');
    if (!F[0].say.includes('"' + prog + '"')) fail('frame 0 should quote the program as "' + prog + '": ' + F[0].say);
    drawnMatches(fail, 'frame 0', F[0], st);
    const cycles = READ_OPS(input.ops);
    cycles.forEach((ops, k) => {
      const f = F[k + 1], where = 'frame ' + (k + 1);
      const res = transfer(st, ops);
      if (!f.say.startsWith('Cycle ' + (k + 1) + ': ' + ops.map((u) => RTL[u]).join(', ') + '.')) fail(where + ': the transfers are not "' + ops.map((u) => RTL[u]).join(', ') + '": ' + f.say);
      if (res.error) { if (!f.say.includes('Not allowed: ' + res.error)) fail(where + ': should refuse (' + res.error + '): ' + f.say); return; }
      const bus = /The select code (\d) puts (\S+) = ([0-9A-F]{2}) on the bus/.exec(f.say);
      const rb = res.bus ? [String(res.bus.sel), res.bus.src, hex(res.bus.value)] : null;
      if (JSON.stringify(bus ? bus.slice(1) : null) !== JSON.stringify(rb)) fail(where + ': bus ' + JSON.stringify(bus && bus.slice(1)) + ', the reference ' + JSON.stringify(rb));
      const said = [...f.say.matchAll(/(M\[[0-9A-F]{2}\]|\b[A-Z]{1,2}) ← ([0-9A-F]+)(?=[,.])/g)].map((m) => [m[1], m[2]]);
      const want = Object.entries(res.changes).map(([q, v]) => [q, fmtChange(q, v)]);
      if (JSON.stringify(said.sort()) !== JSON.stringify(want.sort())) fail(where + ': says ' + JSON.stringify(said) + ' load, the reference ' + JSON.stringify(want));
      if (!want.length && !/nothing changes/.test(f.say)) fail(where + ': nothing changes, but the text does not say so');
      drawnMatches(fail, where, f, st);
    });
    const last = F[F.length - 1].say;
    const want = 'After ' + cycles.length + ' cycle' + (cycles.length > 1 ? 's' : '') + ': PC = ' + hex(st.PC) + ', AR = ' + hex(st.AR) + ', IR = ' + hex(st.IR) + ', DR = ' + hex(st.DR) + ', AC = ' + hex(st.AC) + '.';
    if (!last.startsWith(want)) fail('the last frame should start "' + want + '": ' + last);
    drawnMatches(fail, 'the last frame', F[F.length - 1], st);
  },

  'cpu-formats'({ input, r, fail }) {
    const ins = String(input.ins).trim(), A = assemble(FORMAT(ins)), F = r.frames, b0 = A.mem[0], b1 = A.mem[1], d = decode(b0), two = !!MEMREF[d.m];
    const bytes = two ? hex(b0) + ' ' + hex(b1) : hex(b0);
    if (F[0].say !== '"' + ins.replace(/\s+/g, ' ') + '" assembles to ' + bytes + ' at address 00. ' + (two ? 'Two bytes: the first holds the opcode and the mode, the second the operand.' : 'One byte: an inherent instruction needs no operand.')) fail('frame 0: ' + F[0].say + ' (the reference: ' + bytes + ')');
    const m = /The high four bits, ([01]{4}) = ([0-9A-F]), are the opcode: (\w+),/.exec(F[1].say);
    if (!m || parseInt(m[1], 2) !== b0 >> 4 || m[2] !== hex(b0 >> 4)[1] || m[3] !== d.m) fail('frame 1: the opcode is ' + d.m + ' ' + (b0 >> 4) + ': ' + F[1].say);
    if (two && !F[1].say.includes('The two low bits, ' + (b0 & 3).toString(2).padStart(2, '0') + ', are the mode: ' + { dir: 'direct', ind: 'indirect', imm: 'immediate' }[d.mode] + '.')) fail('frame 1: the mode is ' + d.mode + ': ' + F[1].say);
    if (two) {
      const s = F[2].say;
      if (d.mode === 'dir' && !s.includes('the operand ' + hex(b1) + ' is the address of the data. M[' + hex(b1) + '] = ' + hex(A.mem[b1]) + '.')) fail('frame 2: ' + s);
      if (d.mode === 'ind' && !s.includes('M[' + hex(b1) + '] = ' + hex(A.mem[b1]) + ', and M[' + hex(A.mem[b1]) + '] = ' + hex(A.mem[A.mem[b1]]))) fail('frame 2: ' + s);
      if (d.mode === 'imm' && !s.includes('the operand ' + hex(b1) + ' is the data itself')) fail('frame 2: ' + s);
    }
    const M = machine(A.mem, 0), cyc = M.instruction();
    const st = M.st, last = F[F.length - 1].say;
    const m2 = /Run it: (\d+) clock cycles \(3 to fetch, (\d+) to execute\)\. (.*)/.exec(last);
    if (!m2 || +m2[1] !== cyc.length || +m2[2] !== cyc.length - 3) fail('the last frame: ' + cyc.length + ' cycles: ' + last);
    const wantAfter = d.m === 'STA' ? 'M[' + hex(cyc[cyc.length - 1].regs.AR) + '] = ' + hex(st.AC) : /^(JMP|JZ|JC|CALL|RET)$/.test(d.m) ? 'PC = ' + hex(st.PC) : 'AC = ' + hex(st.AC) + ' (' + st.AC + ')';
    if (!last.includes(wantAfter)) fail('the last frame should say ' + wantAfter + ': ' + last);
    const ac = F[F.length - 1].items.find((it) => it.key === 'ac');
    if (ac && ac.lines[1] !== hex(st.AC)) fail('the last frame draws AC = ' + ac.lines[1] + ', the reference ' + hex(st.AC));
  },

  'cpu-assemble'({ input, r, fail, S }) {
    const A = assemble(String(input.src)), E = S.Cpu.assemble(String(input.src)), F = r.frames;
    // the engine's assembler against ours
    if (JSON.stringify(E.mem) !== JSON.stringify(A.mem)) fail('the engine assembles different bytes from the reference');
    if (JSON.stringify(E.symbols) !== JSON.stringify(A.syms)) fail('the engine\'s symbol table ' + JSON.stringify(E.symbols) + ', the reference ' + JSON.stringify(A.syms));
    if (JSON.stringify([...new Set(E.errors.map((e) => (/unknown name (\w+)/.exec(e.msg) || [])[1]).filter(Boolean))]) !== JSON.stringify(A.unknown)) fail('the engine\'s unknown names differ from the reference');
    const quote = (raw) => raw.replace(/;.*/, '').replace(/\s+/g, ' ').trim();
    if (F[0].say.indexOf('The source, ' + A.rows.length + ' lines.') !== 0) fail('frame 0: ' + A.rows.length + ' lines: ' + F[0].say);
    let pass1 = 0, pass2 = 0, done = null, cursor = 0;
    const rowOf = {};
    F.forEach((f, i) => {
      const s = f.say, where = 'frame ' + i;
      let m = /^Pass 1, "(.*?)": (?:the label (\w+) = ([0-9A-F]{2}) goes in the symbol table\. )?(?:(\w+) is defined as ([0-9A-F]{2})\. )?(?:It will take (\d+) bytes?, so the counter moves from ([0-9A-F]{2}) to ([0-9A-F]{2})\.)?$/.exec(s);
      if (/^Pass 1, "/.test(s) && !m) { fail(where + ': cannot read: ' + s); return; }
      if (m) {
        pass1++;
        const k = A.rows.findIndex((q, j) => j >= cursor && quote(q.raw) === m[1]);
        const row = A.rows[k];
        cursor = k + 1;
        rowOf[i] = k;
        if (!row) { fail(where + ': no line "' + m[1] + '"'); return; }
        if (m[2] && (m[2] !== row.label || parseInt(m[3], 16) !== A.syms[row.label])) fail(where + ': the label ' + row.label + ' = ' + hex(A.syms[row.label]) + ': ' + s);
        if (row.label && !m[2]) fail(where + ': the label ' + row.label + ' is not named');
        if (m[6] && (+m[6] !== row.size || parseInt(m[7], 16) !== row.addr || parseInt(m[8], 16) !== ((row.addr + row.size) & 0xff))) fail(where + ': ' + row.size + ' bytes at ' + hex(row.addr) + ': ' + s);
        return;
      }
      if (/^Pass 1 is done/.test(s)) {
        done = s;
        const fw = A.forward.filter((n) => !A.unknown.includes(n));
        const named = (/before they are defined \(([^)]*)\)/.exec(s) || [])[1];
        if (fw.length ? named !== fw.join(', ') : named !== undefined) fail(where + ': the names used before their definition are ' + (fw.join(', ') || 'none') + ': ' + s);
        for (const u of A.unknown) if (!s.includes(u)) fail(where + ': should say ' + u + ' is never defined: ' + s);
        if (A.unknown.length && /every name has an address/.test(s)) fail(where + ': not every name has an address: ' + s);
        return;
      }
      m = /^Pass 2: ([0-9A-F]{2}): (.*)$/.exec(s);
      if (m) {
        pass2++;
        const addr = parseInt(m[1], 16), row = A.rows.find((q) => q.addr === addr && q.bytes.length);
        if (!row) { fail(where + ': nothing is assembled at ' + m[1]); return; }
        const t = m[2];
        if (row.op === 'DB' || row.op === 'DS') { if (t !== 'data, ' + row.bytes.map(hex).join(' ') + '.') fail(where + ': data ' + row.bytes.map(hex).join(' ') + ': ' + s); return; }
        const d = decode(row.bytes[0]);
        if (!t.startsWith(row.op + ' is opcode ' + hex(OPS[row.op])[1])) fail(where + ': ' + row.op + ' is opcode ' + OPS[row.op] + ': ' + s);
        if (row.bytes.length === 2) {
          if (!t.includes('mode ' + row.mode + ' (' + MODE_BITS[row.mode] + '), so the first byte is ' + hex(row.bytes[0]) + ';')) fail(where + ': the first byte is ' + hex(row.bytes[0]) + ': ' + s);
          const name = (row.args[0].replace(/^[#@]/, '').match(/[A-Za-z_]\w*/) || [])[0];
          if (name && A.unknown.includes(name)) { if (!new RegExp('\\b' + name + '\\b.*(not|never)').test(t)) fail(where + ': ' + name + ' is unknown, the text gives it a value: ' + s); }
          else if (!t.endsWith(' is ' + hex(row.bytes[1]) + '.')) fail(where + ': the operand byte is ' + hex(row.bytes[1]) + ': ' + s);
        } else if (!t.endsWith('(' + hex(row.bytes[0]) + ').')) fail(where + ': the byte is ' + hex(row.bytes[0]) + ': ' + s);
        if (d.m !== row.op) fail(where + ': the byte decodes to ' + d.m);
      }
    });
    const wantP1 = A.rows.filter((q) => q.label || q.equ || q.bytes.length).length, wantP2 = A.rows.filter((q) => q.bytes.length).length;
    if (pass1 !== wantP1) fail('pass 1 shows ' + pass1 + ' lines, the reference ' + wantP1);
    if (pass2 !== wantP2) fail('pass 2 shows ' + pass2 + ' lines, the reference ' + wantP2);
    if (!done) fail('no "Pass 1 is done" frame');
    const last = F[F.length - 1].say;
    if (A.unknown.length) { for (const u of A.unknown) if (!last.includes('unknown name ' + u)) fail('the last frame should report ' + u + ': ' + last); }
    else if (!last.startsWith(A.size + ' bytes of machine code, ready to load at ' + hex(A.start) + '.')) fail('the last frame: ' + A.size + ' bytes at ' + hex(A.start) + ': ' + last);
    // every prediction answer agrees with the reference
    F.forEach((f, i) => {
      if (!f.predict) return;
      const q = f.predict;
      let m = /What is the first byte of "(.*)"\?/.exec(q.ask);
      if (m) { const row = A.rows.find((x) => quote(x.raw) === m[1]); if (!row || hex(row.bytes[0]) !== q.answer) fail('frame ' + i + ': the prediction answer ' + q.answer + ' for "' + m[1] + '"'); }
      if (/What address will the next instruction get/.test(q.ask)) { const nx = A.rows.slice(rowOf[i] + 1).find((x) => x.bytes.length); if (!nx || hex(nx.addr) !== q.answer) fail('frame ' + i + ': the next address is ' + (nx && hex(nx.addr)) + ', the prediction says ' + q.answer); }
    });
  },

  'cpu-fetch'({ input, r, fail }) {
    const A = assemble(FETCH_PROGS[input.prog]), M = machine(A.mem, A.start), F = r.frames;
    const ins = [];
    let k = 0;
    for (let i = 1; i < F.length - 1; i++) {
      const said = cycleSay(F[i].say);
      if (!said) { fail('frame ' + i + ': not a cycle: ' + F[i].say); continue; }
      const ref = M.step();
      if (ref.T === 0) ins.push({ addr: ref.insAddr, n: 0 });
      ins[ins.length - 1].n++;
      sameCycle(fail, 'frame ' + i, said, ref);
      if (ref.T === 2 && !F[i].say.includes('decoder (D' + hex(M.st.IR >> 4)[1] + ')')) fail('frame ' + i + ': the decoder output is D' + hex(M.st.IR >> 4)[1]);
      if (ref.end !== /SC is cleared/.test(F[i].say)) fail('frame ' + i + ': SC is ' + (ref.end ? '' : 'not ') + 'cleared here');
      drawnMatches(fail, 'frame ' + i, F[i], M.st);
      k++;
    }
    if (ins.length !== input.n && M.st.S) fail(input.n + ' instructions asked for, ' + ins.length + ' shown');
    const want = ins.length + ' instruction' + (ins.length > 1 ? 's' : '') + ' in ' + k + ' cycles: ' + ins.map((x) => lineAt(A, x.addr) + ' ' + x.n).join(', ') + '.';
    if (!F[F.length - 1].say.startsWith(want)) fail('the last frame should start "' + want + '": ' + F[F.length - 1].say);
  },

  'cpu-exec'({ input, r, fail }) {
    const [setup, text] = CLS[input.k], A = assemble(clsSrc(input.k)), M = machine(A.mem, A.start, [99]), F = r.frames;
    if (setup) M.instruction();
    const b = M.regs(), addr = M.st.PC;
    const head = (setup ? 'Set up by ' + setup + ' (AC = ' + hex(b.AC) + ', Z = ' + b.Z + ', C = ' + b.C + '). ' : '') + 'Now ' + text + ' at ' + hex(addr) + '.';
    if (!F[0].say.startsWith(head)) fail('frame 0 should start "' + head + '": ' + F[0].say);
    drawnMatches(fail, 'frame 0', F[0], M.st);
    const cyc = [];
    for (let i = 1; i < F.length - 1; i++) {
      const said = cycleSay(F[i].say), ref = M.step();
      cyc.push(ref);
      if (!said) { fail('frame ' + i + ': not a cycle'); continue; }
      sameCycle(fail, 'frame ' + i, said, ref);
      if (ref.flag) {
        const t = F[i].say;
        const want = ref.flag.value ? ref.flag.name + ' = 1, so PC takes the target address.' : ref.flag.name + ' = 0, so nothing is loaded';
        if (!t.includes(want)) fail('frame ' + i + ': the flag test should say "' + want + '": ' + t);
      }
      drawnMatches(fail, 'frame ' + i, F[i], M.st);
    }
    if (!cyc.length || !cyc[cyc.length - 1].end) fail('the frames stop before the instruction ends');
    if (F[0].predict && F[0].predict.answer !== String(cyc.length)) fail('the prediction answer ' + F[0].predict.answer + ', the reference ' + cyc.length + ' cycles');
    const a = M.regs(), want = text + ' took ' + cyc.length + ' cycles. Afterwards PC = ' + hex(a.PC) + ', AC = ' + hex(a.AC) + ', flags Z ' + a.Z + ' C ' + a.C + ' N ' + a.N + '.';
    if (F[F.length - 1].say !== want) fail('the last frame should be "' + want + '": ' + F[F.length - 1].say);
  },

  'cpu-hardwired'({ input, r, fail, S }) {
    const A = assemble(FETCH_PROGS[input.prog]), M = machine(A.mem, A.start), F = r.frames;
    // the control functions from our routines: one product per (instruction, T, flag value, transfers), the modes
    // that share it folded in
    const groups = new Map();
    const MS = { dir: 'I′M′', ind: 'I', imm: 'M' };
    const add = (m, mode, T, flag, c, all) => {
      const key = m + '|' + T + '|' + (flag ? flag.join('') : '') + '|' + c.ops.join(',') + '|' + !!c.end;
      if (!groups.has(key)) groups.set(key, { m, T, flag, ops: c.ops, modes: [], all });
      if (mode) groups.get(key).modes.push(mode);
    };
    for (const m of Object.keys(OPS)) {
      const modes = MEMREF[m] ? MEMREF[m].split(' ') : [null];
      for (const mode of modes) routine(m, mode).forEach((c, k) => { if (c.flag) { add(m, mode, 3 + k, [c.flag, 1], c.t, modes); add(m, mode, 3 + k, [c.flag, 0], c.f, modes); } else add(m, mode, 3 + k, null, c, modes); });
    }
    const cond = (g) => {
      const t = ['T' + g.T, 'D' + hex(OPS[g.m])[1]];
      if (g.m === 'IN') t.push('IR0′'); if (g.m === 'OUT') t.push('IR0');
      if (g.modes.length && g.modes.length !== g.all.length) t.push(g.modes.length === 1 ? MS[g.modes[0]] : '(' + g.modes.map((x) => MS[x]).join(' + ') + ')');
      if (g.flag) t.push(g.flag[0] + (g.flag[1] ? '' : '′'));
      return t.join('·');
    };
    const rows = [{ T: 0, cond: 'T0', ops: FETCH[0].ops }, { T: 1, cond: 'T1', ops: FETCH[1].ops }, { T: 2, cond: 'T2', ops: FETCH[2].ops }].concat([...groups.values()].map((g) => ({ T: g.T, cond: cond(g), ops: g.ops })), [{ T: 3, cond: 'T3·ILL', ops: ['HLT'] }]);
    const m = /: (.*)\. (\d+) products in all\./.exec(F[1].say);
    if (!m || +m[2] !== rows.length) fail('frame 1: the reference has ' + rows.length + ' products: ' + F[1].say);
    if (m) for (const eq of m[1].split('; ')) {
      const [lhs, rhs] = eq.split(' = ');
      const u = Object.keys(RTL).find((k) => RTL[k] === lhs);
      const want = rows.filter((x) => x.ops.includes(u)).map((x) => x.cond).join(' + ');
      if (rhs !== want) fail('frame 1: ' + lhs + ' = ' + want + ', the text has ' + rhs);
    }
    const ins = [];
    let n = 0;
    F.forEach((f, i) => {
      const c = /^Cycle (\d+), (.*?): the product (.+?) is 1, so (.*)\.$/.exec(f.say);
      if (!c) return;
      const ref = M.step();
      n++;
      if (ref.T === 0) ins.push(ref.insAddr);
      if (+c[1] !== n) fail('frame ' + i + ': cycle ' + n);
      if (c[2] !== lineAt(A, ref.insAddr)) fail('frame ' + i + ': the instruction is ' + lineAt(A, ref.insAddr));
      if (c[4] !== ref.rtl.join(', ')) fail('frame ' + i + ': the transfers are ' + ref.rtl.join(', ') + ': ' + f.say);
      const st = { ...M.st };
      const hit = rows.filter((x) => x.T === ref.T && x.ops.join() === ref.ops.join() && x.cond === c[3]);
      // the product must name this cycle's T, the opcode, the mode (or modes) and the flag that holds
      const d = decode(M.st.IR), parts = c[3].split('·');
      const ok = hit.length === 1 && parts[0] === 'T' + ref.T && (ref.T < 3 || (parts[1] === 'D' + hex(d.op)[1] && (!d.mode || !parts[2] || parts[2] === 'I′M′' && d.mode === 'dir' || parts[2] === 'I' && d.mode === 'ind' || parts[2] === 'M' && d.mode === 'imm' || parts[2].startsWith('(') && parts[2].includes(MS[d.mode]) || /^[ZCN]′?$/.test(parts[2])) && (!ref.flag || parts[parts.length - 1] === ref.flag.name + (ref.flag.value ? '' : '′'))));
      if (!ok) fail('frame ' + i + ': the product ' + c[3] + ' is not the one that is 1 (T' + ref.T + ', IR ' + hex(st.IR) + ')');
      if (f.predict) { const nx = rows.find((x) => x.cond === f.predict.answer); if (!nx) fail('frame ' + i + ': the predicted product ' + f.predict.answer + ' does not exist'); }
    });
    // the prediction is answered by the next frame's product
    F.forEach((f, i) => { if (f.predict && !F[i + 1].say.includes('the product ' + f.predict.answer + ' is 1')) fail('frame ' + i + ': the prediction answer ' + f.predict.answer + ' is not the next product'); });
    if (!n) fail('no cycles narrated');
  },

  'cpu-micro'({ input, r, fail }) {
    const A = assemble(FETCH_PROGS[input.prog]), M = machine(A.mem, A.start), F = r.frames;
    // our layout of the control memory: fetch in 0..2, then each routine in instruction order, a flag test taking a
    // word for each outcome (the false one first)
    const start = {}, words = [{ label: 'FETCH', ops: FETCH[0].ops, ad: 1 }, { ops: FETCH[1].ops, ad: 2 }, { label: 'DECODE', ops: FETCH[2].ops, map: true }];
    const keys = [];
    for (const m of ['HLT', 'LDA', 'STA', 'ADD', 'SUB', 'AND', 'OR', 'NOT', 'SHL', 'SHR', 'JMP', 'JZ', 'JC', 'IN', 'OUT', 'CALL', 'RET']) {
      if (MEMREF[m]) for (const md of MEMREF[m].split(' ')) keys.push([m + '.' + md, m, md]); else keys.push([m, m, null]);
    }
    keys.push(['ILLEGAL', 'HLT', null]);
    for (const [key, m, md] of keys) {
      start[key] = words.length;
      routine(m, md).forEach((c, k) => {
        if (c.flag) { const prev = words[words.length - 1]; prev.cd = c.flag; words.push({ label: key + '.' + c.flag + '0', ops: c.f.ops, ad: 0 }); words.push({ label: key + '.' + c.flag + '1', ops: c.t.ops, ad: 0 }); prev.ad = words.length - 1; }
        else { words.push({ label: k === 0 ? key : '', ops: c.ops }); words[words.length - 1].ad = c.end ? 0 : words.length; }
      });
    }
    const bits = (n) => Math.ceil(Math.log2(n));
    const f1 = Object.keys(RTL).filter((u) => /←/.test(u) && !/^AC←DR$/.test(u)).length, adw = bits(words.length);
    const head = 'A control memory of ' + words.length + ' words of ' + (bits(f1 + 1) + 2 + bits(9 + 1) + 2 + 1 + adw) + ' bits:';
    if (!F[0].say.startsWith(head)) fail('frame 0 should start "' + head + '": ' + F[0].say);
    const keyOf = (ir) => { const d = decode(ir); return d.mode === 'bad' ? 'ILLEGAL' : d.mode ? d.m + '.' + d.mode : d.m; };
    let car = 0, n = 0, agree = 0;
    F.forEach((f, i) => {
      const c = /^CAR = (\d+)(?: \(([^)]*)\))?, word ([01 ]+): (.*?)\. (.*?)(?: (Same registers as the hard-wired unit\.|The units disagree!))$/.exec(f.say);
      if (!c) return;
      const ref = M.step();
      n++;
      if (+c[1] !== car) fail('frame ' + i + ': CAR should be ' + car + ', the text says ' + c[1]);
      const w = words[car];
      if ((c[2] || '') !== (w.label || '')) fail('frame ' + i + ': word ' + car + ' is labelled ' + w.label);
      if (c[4] !== (ref.rtl.join(', ') || 'no operation')) fail('frame ' + i + ': the transfers are ' + ref.rtl.join(', ') + ': ' + f.say);
      const ad = parseInt(c[3].split(' ').pop(), 2);
      let next;
      if (w.map) { next = start[keyOf(M.st.IR)]; if (!c[5].includes('IR = ' + hex(M.st.IR) + ': word ' + next + '.')) fail('frame ' + i + ': the map gives word ' + next + ': ' + c[5]); }
      else if (w.cd) { const v = ref.flag ? ref.flag.value : M.st.F[w.cd]; next = v ? w.ad : car + 1; if (!c[5].toLowerCase().startsWith('condition ' + w.cd.toLowerCase() + ' = ' + v)) fail('frame ' + i + ': the condition ' + w.cd + ' = ' + v + ': ' + c[5]); }
      else next = w.ad;
      if (!w.map && ad !== w.ad) fail('frame ' + i + ': the word\'s AD field is ' + ad + ', the reference ' + w.ad);
      if (!w.map && !w.cd && (w.ad === 0 ? !/AD = 0: back to the fetch routine/.test(c[5]) : !c[5].includes('CAR ← ' + w.ad + '.'))) fail('frame ' + i + ': the next address is ' + w.ad + ': ' + c[5]);
      if (w.cd && !c[5].includes('CAR ← ' + (next === w.ad ? w.ad : 'CAR + 1 = ' + next))) fail('frame ' + i + ': the next address is ' + next + ': ' + c[5]);
      if (/^[a-z]/.test(c[5])) fail('frame ' + i + ': a sentence starts with a small letter: ' + c[5]);
      if (c[6].startsWith('Same')) agree++;
      if (f.predict && f.predict.answer !== String(next)) fail('frame ' + i + ': the prediction answer ' + f.predict.answer + ', the reference ' + next);
      car = ref.end ? 0 : next;
    });
    const last = /^(\d+) of (\d+) cycles agree/.exec(F[F.length - 1].say);
    if (!last || +last[1] !== agree || +last[2] !== n || agree !== n) fail('the last frame: ' + agree + ' of ' + n + ' agree: ' + F[F.length - 1].say);
  },

  'cpu-programs'({ input, r, fail, S }) {
    const ex = S.Cpu.programs[input.p], A = assemble(ex.src), F = r.frames;
    // the whole run on the reference, an instruction at a time
    const R = machine(A.mem, A.start, ex.input), runs = [];
    while (R.st.S && runs.length < 5000) runs.push(R.instruction());
    const total = runs.length, cycles = runs.reduce((s, x) => s + x.length, 0);
    if (JSON.stringify(R.st.output) !== JSON.stringify(ex.answer)) fail('the reference outputs ' + R.st.output + ', the program expects ' + ex.answer);
    const head = ex.say + ' ' + A.size + ' bytes, loaded at ' + hex(A.start) + '. It will run ' + total + ' instructions in ' + cycles + ' clock cycles.';
    if (F[0].say !== head) fail('frame 0 should be "' + head + '": ' + F[0].say);
    const M = machine(A.mem, A.start, ex.input);
    let skipped = null, insShown = 0;
    for (let i = 1; i < F.length - 1; i++) {
      const s = F[i].say;
      const sk = /^The loop goes on the same way; skipping (\d+) instructions to the last few\.$/.exec(s);
      if (sk) { skipped = +sk[1]; for (let k = 0; k < skipped; k++) M.instruction(); continue; }
      const row = /^([0-9A-F]{2}) (.+?) \((\d+) cycles\): AC = ([0-9A-F]{2}), PC = ([0-9A-F]{2}), Z (\d) C (\d)\.(?: Memory (M\[[0-9A-F]{2}\]) = ([0-9A-F]{2})\.)?(?: Output (\d+)\.)?$/.exec(s);
      if (row) {
        const addr = M.st.PC, cyc = M.instruction(), st = M.st, last = cyc[cyc.length - 1];
        insShown++;
        if (parseInt(row[1], 16) !== addr) fail('frame ' + i + ': the instruction is at ' + hex(addr) + ': ' + s);
        if (row[2] !== lineAt(A, addr)) fail('frame ' + i + ': the line at ' + hex(addr) + ' is "' + lineAt(A, addr) + '": ' + s);
        if (+row[3] !== cyc.length || parseInt(row[4], 16) !== st.AC || parseInt(row[5], 16) !== st.PC || +row[6] !== st.F.Z || +row[7] !== st.F.C) fail('frame ' + i + ': the reference has ' + cyc.length + ' cycles, AC ' + hex(st.AC) + ', PC ' + hex(st.PC) + ', Z ' + st.F.Z + ' C ' + st.F.C + ': ' + s);
        const mw = Object.entries(last.changes).find(([q]) => q.startsWith('M['));
        const wrote = cyc.flatMap((c) => c.ops).includes('M←AC') || cyc.flatMap((c) => c.ops).includes('M←PC');
        if (row[8] ? !(wrote && row[8] === 'M[' + hex(last.regs.AR) + ']' && parseInt(row[9], 16) === st.mem[last.regs.AR]) : mw) fail('frame ' + i + ': the memory write: ' + s);
        if ((row[10] !== undefined) !== cyc.some((c) => c.ops.includes('OUTR←AC')) || (row[10] !== undefined && +row[10] !== st.output[st.output.length - 1])) fail('frame ' + i + ': the output: ' + s);
        drawnMatches(fail, 'frame ' + i, F[i], st);
        continue;
      }
      const said = cycleSay(s);
      if (!said) { fail('frame ' + i + ': cannot read: ' + s); continue; }
      const T0 = M.regs();
      const ref = M.step();
      if (ref.T === 0) {
        insShown++;
        const ln = /^Line "(.*?)" at ([0-9A-F]{2})\./.exec(s);
        const raw = A.rows.find((q) => q.addr === ref.insAddr && q.bytes.length);
        const want = raw.raw.replace(/;.*/, '').replace(/\s+/g, ' ').trim();
        if (!ln || ln[1] !== want || parseInt(ln[2], 16) !== ref.insAddr) fail('frame ' + i + ': the line is "' + want + '" at ' + hex(ref.insAddr) + ': ' + s);
      }
      sameCycle(fail, 'frame ' + i, said, ref);
      drawnMatches(fail, 'frame ' + i, F[i], M.st);
      void T0;
    }
    if (insShown + (skipped || 0) !== total) fail('shown ' + insShown + ' + skipped ' + skipped + ' instructions, the reference runs ' + total);
    const avg = (cycles / total).toFixed(1);
    const want = 'Halted after ' + total + ' instructions and ' + cycles + ' clock cycles. Output: ' + R.st.output.join(', ') + ', as expected. That is ' + avg + ' cycles per instruction on average';
    if (!F[F.length - 1].say.startsWith(want)) fail('the last frame should start "' + want + '": ' + F[F.length - 1].say);
    F.forEach((f, i) => { if (f.predict && /last output/.test(f.predict.ask) && f.predict.answer !== String(R.st.output[R.st.output.length - 1])) fail('frame ' + i + ': the predicted output ' + f.predict.answer); });
  },
};

// ---- more inputs ----
const ASM_SOURCES = [
  'LDA #3\nSTA x\nHLT\nx: DB 0',
  '        ORG 0x40\nstart:  LDA val\n        JMP start\nval:    DB 0x7F, 0b101, 200',
  'k EQU 5\n        LDA #k\n        ADD tbl+1\n        STA out\n        HLT\ntbl:    DB 1, 2, 3\nout:    DS 2',
  'top:    IN\n        JZ end      ; stop on 0\n        CALL show\n        JMP top\nshow:   OUT\n        RET\nend:    HLT',
  'LDA @p\nNOT\nSHL\nSHR\nJC later\nlater: HLT\np: DB q\nq: DB 9',
  '        LDA x\n        SUB #1\n        STA y\n        HLT\nx:      DB 5',
  '        LDA a\n        ADD b\n        STA c\n        HLT\na:      DB 250\nb:      DB 10\nc:      DS 1',
];
const FORMAT_INS = ['LDA num', 'LDA @ptr', 'LDA #9', 'STA val', 'STA @ptr', 'ADD num', 'ADD #200', 'SUB val', 'SUB @ptr', 'AND #0x0F', 'OR val', 'JMP val', 'JZ @ptr', 'CALL num', 'NOT', 'SHL', 'SHR', 'IN', 'OUT', 'RET', 'HLT', 'LDA 0x11'];
const OPNAMES = ['AR←PC', 'IR←M', 'PC+', 'AR←M', 'DR←M', 'AC←DR', 'ADD', 'SUB', 'NOT', 'SHL', 'SHR', 'M←AC', 'PC←AR', 'DR←AR', 'SP-', 'AR←SP', 'M←PC', 'PC←DR', 'SP+', 'PC←M', 'AND', 'OR'];

export default {
  family: /^p13-/,
  extra: {
    'cpu-datapath': ['AR←PC; DR←M; ADD; AC←DR', 'AR←PC; AR←M; DR←M; SUB', 'SP-; AR←SP; M←PC; DR←AR', 'AR←PC; IR←M, PC+; PC←AR', 'AR←PC; DR←M; NOT; SHL; SHR', 'AR←PC; DR←M; AC←DR; M←AC', 'PC+, AR←PC', 'AR←PC, DR←M', 'PC+, PC←AR'].map((ops) => ({ ops })),
    'cpu-formats': FORMAT_INS.map((ins) => ({ ins })),
    'cpu-assemble': ASM_SOURCES.map((src) => ({ src })),
    'cpu-fetch': ['three', 'jump', 'stack'].flatMap((prog) => [1, 2, 3, 4].map((n) => ({ prog, n }))),
    'cpu-exec': Object.keys(CLS).map((k) => ({ k })),
    'cpu-hardwired': ['three', 'jump', 'stack'].map((prog) => ({ prog })),
    'cpu-micro': ['three', 'jump', 'stack'].map((prog) => ({ prog })),
    'cpu-programs': ['sum', 'multiply', 'max', 'ones', 'io'].flatMap((p) => [0, 1, 3, 6].map((detail) => ({ p, detail }))),
  },
  random: {
    'cpu-datapath': (rnd) => ({ ops: Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => { const a = OPNAMES[Math.floor(rnd() * OPNAMES.length)]; return rnd() < 0.2 ? a + ', ' + OPNAMES[Math.floor(rnd() * OPNAMES.length)] : a; }).join('; ') }),
    'cpu-assemble': (rnd) => {
      const ins = ['LDA', 'STA', 'ADD', 'SUB', 'AND', 'OR', 'JMP', 'JZ', 'JC', 'CALL', 'NOT', 'SHL', 'SHR', 'IN', 'OUT', 'RET', 'HLT'];
      const n = 2 + Math.floor(rnd() * 8), labels = ['a', 'b', 'c', 'top', 'end'];
      const lines = [];
      for (let k = 0; k < n; k++) {
        const m = ins[Math.floor(rnd() * ins.length)], lab = rnd() < 0.3 ? labels[k % labels.length] + k + ': ' : '        ';
        if (!MEMREF[m]) { lines.push(lab + m); continue; }
        const modes = MEMREF[m].split(' '), mode = modes[Math.floor(rnd() * modes.length)];
        const target = rnd() < 0.5 ? 'd' + Math.floor(rnd() * 3) : String(Math.floor(rnd() * 256));
        lines.push(lab + m + ' ' + (mode === 'imm' ? '#' : mode === 'ind' ? '@' : '') + target);
      }
      lines.push('d0:     DB ' + Math.floor(rnd() * 256), 'd1:     DB 1, 2', 'd2:     DS 1');
      return { src: lines.join('\n') };
    },
  },
  check(ctx) {
    const f = checks[ctx.tp.id];
    if (!f) { ctx.fail('no claim check for ' + ctx.tp.id); return; }
    f(ctx);
    ctx.pass();
  },
};
