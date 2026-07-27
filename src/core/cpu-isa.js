// A small 8-bit accumulator processor for teaching, our own design: 256 bytes of memory, an accumulator AC,
// flags Z (zero), C (carry) and N (negative), and a stack that grows down from the top of memory.
//
// Instruction formats (the opcode is the high four bits of the first byte):
//   memory reference, two bytes:  [ opcode | 0 0 | mode ] [ address or operand ]
//       mode 00 direct (LDA x), 01 indirect (LDA @p: the address is in p), 10 immediate (LDA #5)
//   inherent, one byte:           [ opcode | 0 0 0 | sub ]   (IN is D0, OUT is D1)
//
//   0 HLT          stop                          8 SHL        {C, AC} ← AC << 1
//   1 LDA m        AC ← m                        9 SHR        {AC, C} ← AC >> 1
//   2 STA m        m ← AC                        A JMP m      PC ← address
//   3 ADD m        AC ← AC + m (C is the carry)  B JZ m       jump if Z = 1
//   4 SUB m        AC ← AC − m (C = 1: no borrow) C JC m      jump if C = 1
//   5 AND m        AC ← AC ∧ m                   D IN / OUT   AC ← input / output ← AC (through DR / the bus)
//   6 OR m         AC ← AC ∨ m                   E CALL m     push PC, jump
//   7 NOT          AC ← AC′                      F RET        pop PC
// LDA, ADD, SUB, AND, OR, NOT, SHL, SHR and IN set Z and N; ADD, SUB, SHL and SHR also set C.
(function (S) {
  'use strict';
  const C = S.Cpu = S.Cpu || {};
  const hex = (v, n) => v.toString(16).toUpperCase().padStart(n || 2, '0');
  C.hex = hex;

  C.ISA = [
    { m: 'HLT', op: 0x0, kind: 'inherent', desc: 'stop the processor' },
    { m: 'LDA', op: 0x1, kind: 'mem', modes: ['dir', 'ind', 'imm'], desc: 'load AC from memory' },
    { m: 'STA', op: 0x2, kind: 'mem', modes: ['dir', 'ind'], desc: 'store AC in memory' },
    { m: 'ADD', op: 0x3, kind: 'mem', modes: ['dir', 'ind', 'imm'], desc: 'add to AC, carry into C' },
    { m: 'SUB', op: 0x4, kind: 'mem', modes: ['dir', 'ind', 'imm'], desc: 'subtract from AC; C = 1 when there is no borrow' },
    { m: 'AND', op: 0x5, kind: 'mem', modes: ['dir', 'ind', 'imm'], desc: 'AND into AC' },
    { m: 'OR', op: 0x6, kind: 'mem', modes: ['dir', 'ind', 'imm'], desc: 'OR into AC' },
    { m: 'NOT', op: 0x7, kind: 'inherent', desc: 'complement AC' },
    { m: 'SHL', op: 0x8, kind: 'inherent', desc: 'shift AC left; the bit shifted out goes to C' },
    { m: 'SHR', op: 0x9, kind: 'inherent', desc: 'shift AC right; the bit shifted out goes to C' },
    { m: 'JMP', op: 0xA, kind: 'mem', modes: ['dir', 'ind'], desc: 'jump' },
    { m: 'JZ', op: 0xB, kind: 'mem', modes: ['dir', 'ind'], desc: 'jump when Z = 1' },
    { m: 'JC', op: 0xC, kind: 'mem', modes: ['dir', 'ind'], desc: 'jump when C = 1' },
    { m: 'IN', op: 0xD, sub: 0, kind: 'inherent', desc: 'AC ← the next input byte' },
    { m: 'OUT', op: 0xD, sub: 1, kind: 'inherent', desc: 'send AC to the output' },
    { m: 'CALL', op: 0xE, kind: 'mem', modes: ['dir', 'ind'], desc: 'push the return address and jump' },
    { m: 'RET', op: 0xF, kind: 'inherent', desc: 'pop the return address into PC' },
  ];
  C.MODES = { dir: 0, ind: 1, imm: 2 };
  const MODE_NAME = ['dir', 'ind', 'imm', '?'];
  C.byMnemonic = (m) => C.ISA.find((i) => i.m === m.toUpperCase());
  /** the instruction a first byte decodes to: { ins, mode } */
  C.decode = (b) => {
    const op = b >> 4, low = b & 3;
    const ins = C.ISA.find((i) => i.op === op && (i.sub == null || i.sub === (b & 1)));
    return { ins, op, mode: ins && ins.kind === 'mem' ? MODE_NAME[low] : null, bits: low };
  };

  // ---- assembler --------------------------------------------------------------------------------------
  /**
   * Assemble source text. Lines: [label:] MNEMONIC [operand] [; comment]. Operands: name, number, name+n,
   * @name (indirect), #value (immediate). Directives: ORG n, DB a, b, ... (bytes), DS n (n zero bytes),
   * name EQU value. Numbers are decimal, 0x.. or 0b... Returns { mem (256 bytes), symbols, listing, errors,
   * start, size }.
   */
  C.assemble = function (src) {
    const lines = src.split('\n');
    const errors = [], symbols = {}, listing = [];
    const parsed = lines.map((raw, i) => {
      const text = raw.replace(/;.*/, '').trim();
      const r = { line: i + 1, raw, label: null, op: null, args: [] };
      if (!text) return r;
      let rest = text, m;
      if ((m = /^([A-Za-z_][\w]*)\s*:\s*(.*)$/.exec(rest))) { r.label = m[1]; rest = m[2]; }
      if ((m = /^([A-Za-z_][\w]*)\s+EQU\s+(.+)$/i.exec(rest))) { r.equ = m[1]; r.args = [m[2].trim()]; return r; }
      if (!rest) return r;
      m = /^([A-Za-z]+)\s*(.*)$/.exec(rest);
      if (!m) { errors.push({ line: r.line, msg: 'cannot read "' + rest + '"' }); return r; }
      r.op = m[1].toUpperCase();
      r.args = m[2] ? m[2].split(',').map((a) => a.trim()) : [];
      return r;
    });
    const num = (t) => (/^0x[0-9a-f]+$/i.test(t) ? parseInt(t, 16) : /^0b[01]+$/i.test(t) ? parseInt(t.slice(2), 2) : /^-?\d+$/.test(t) ? parseInt(t, 10) : null);
    const value = (t, r, pass) => {
      const m = /^([A-Za-z_][\w]*|[-\w]+)\s*(?:([+-])\s*(\w+))?$/.exec(t.trim());
      if (!m) { if (pass === 2) errors.push({ line: r.line, msg: 'cannot read the operand "' + t + '"' }); return 0; }
      let v = num(m[1]);
      if (v == null) { if (m[1] in symbols) v = symbols[m[1]]; else { if (pass === 2) errors.push({ line: r.line, msg: 'unknown name ' + m[1] }); v = 0; } }
      if (m[2]) { const k = num(m[3]) != null ? num(m[3]) : symbols[m[3]]; if (k == null) { if (pass === 2) errors.push({ line: r.line, msg: 'unknown name ' + m[3] }); } else v = m[2] === '+' ? v + k : v - k; }
      return v;
    };
    const size = (r) => {
      if (!r.op) return 0;
      if (r.op === 'DB') return r.args.length;
      if (r.op === 'DS') return Math.max(0, value(r.args[0] || '0', r, 1));
      if (r.op === 'ORG') return 0;
      const ins = C.byMnemonic(r.op);
      if (!ins) return 0;
      return ins.kind === 'mem' ? 2 : 1;
    };
    // pass 1: addresses of labels
    let pc = 0;
    for (const r of parsed) {
      if (r.equ) { symbols[r.equ] = value(r.args[0], r, 1); continue; }
      if (r.op === 'ORG') { pc = value(r.args[0] || '0', r, 1) & 0xff; r.addr = pc; if (r.label) symbols[r.label] = pc; continue; }
      if (r.label) { if (r.label in symbols) errors.push({ line: r.line, msg: 'the label ' + r.label + ' is defined twice' }); symbols[r.label] = pc; }
      r.addr = pc;
      pc += size(r);
    }
    // pass 2: bytes
    const mem = new Array(256).fill(0), used = new Array(256).fill(false);
    let start = null;
    const put = (r, a, b) => { if (a > 255) { errors.push({ line: r.line, msg: 'the program runs past address 255' }); return; } if (used[a]) errors.push({ line: r.line, msg: 'address ' + hex(a) + ' is used twice' }); used[a] = true; mem[a] = b & 0xff; };
    for (const r of parsed) {
      if (!r.op || r.equ || r.op === 'ORG') { if (r.raw.trim()) listing.push({ line: r.line, addr: r.addr, bytes: [], text: r.raw }); continue; }
      const bytes = [];
      if (r.op === 'DB') for (const a of r.args) { const v = value(a, r, 2); if (v < -128 || v > 255) errors.push({ line: r.line, msg: v + ' does not fit in a byte' }); bytes.push(v & 0xff); }
      else if (r.op === 'DS') for (let i = 0; i < size(r); i++) bytes.push(0);
      else {
        const ins = C.byMnemonic(r.op);
        if (!ins) { errors.push({ line: r.line, msg: 'unknown instruction ' + r.op }); continue; }
        if (start == null) start = r.addr;
        if (ins.kind === 'inherent') {
          if (r.args.length) errors.push({ line: r.line, msg: ins.m + ' takes no operand' });
          bytes.push((ins.op << 4) | (ins.sub || 0));
        } else {
          if (r.args.length !== 1) { errors.push({ line: r.line, msg: ins.m + ' needs one operand' }); continue; }
          let a = r.args[0], mode = 'dir';
          if (a.startsWith('@')) { mode = 'ind'; a = a.slice(1); } else if (a.startsWith('#')) { mode = 'imm'; a = a.slice(1); }
          if (!ins.modes.includes(mode)) errors.push({ line: r.line, msg: ins.m + ' cannot take ' + (mode === 'imm' ? 'an immediate' : 'an indirect') + ' operand' });
          const v = value(a, r, 2);
          if (v < -128 || v > 255) errors.push({ line: r.line, msg: v + ' does not fit in a byte' });
          bytes.push((ins.op << 4) | C.MODES[mode], v & 0xff);
        }
      }
      bytes.forEach((b, i) => put(r, r.addr + i, b));
      listing.push({ line: r.line, addr: r.addr, bytes, text: r.raw });
    }
    errors.sort((a, b) => a.line - b.line);
    return { mem, symbols, listing, errors, start: start == null ? 0 : start, size: used.filter(Boolean).length };
  };

  /** disassemble from an address: [{ addr, bytes, text }], with names from symbols where they match */
  C.disassemble = function (mem, from, count, symbols) {
    const names = {};
    for (const [k, v] of Object.entries(symbols || {})) if (!(v in names)) names[v] = k;
    const out = [];
    let a = from || 0;
    for (let k = 0; k < (count || 16) && a < 256; k++) {
      const b = mem[a], d = C.decode(b);
      if (!d.ins) { out.push({ addr: a, bytes: [b], text: 'DB ' + b }); a++; continue; }
      if (d.ins.kind === 'inherent') { out.push({ addr: a, bytes: [b], text: d.ins.m, label: names[a] }); a++; continue; }
      const v = mem[(a + 1) & 0xff];
      const operand = d.mode === 'imm' ? '#' + v : (d.mode === 'ind' ? '@' : '') + (names[v] || v);
      out.push({ addr: a, bytes: [b, v], text: d.ins.m + ' ' + operand, label: names[a] });
      a += 2;
    }
    return out;
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
