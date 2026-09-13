// Part 13, the machine: registers that talk over one common bus, one source at a time; the instruction formats and
// the three addressing modes followed through memory; and the assembler's two passes, the symbol table first and
// the bytes second.
(function (S) {
  'use strict';
  const P13 = S.P13, Cpu = () => S.Cpu, CK = () => S.Kit.cpu, K = () => S.Kit;
  const hex = (v) => P13.hex(v);
  const base = `; a small program for the datapath to work on
start:  LDA num
        ADD #5
        STA num
        HLT
num:    DB 37`;

  // ---------------------------------------------------------------------------------------------------------
  // Registers and the bus
  // ---------------------------------------------------------------------------------------------------------
  S.topic({
    id: 'cpu-datapath', family: 'p13-machine', order: 10, title: 'Registers and the common bus',
    blurb: 'Every register can drive the bus or load from it, but only one may drive it at a time: the bus multiplexer picks the source with a select code, and the destinations load at the clock edge. Type transfers and watch them happen.',
    inputs: [{ id: 'ops', kind: 'text', label: 'Transfers, one cycle per ; (e.g. AR←PC; IR←M, PC+)', def: 'AR←PC; IR←M, PC+; AR←PC; AR←M, PC+; DR←M; AC←DR', check: (v) => { try { const c = P13.readOps(v); if (!c.length) return 'Transfers: give at least one'; if (c.length > 10) return 'Transfers: at most 10 cycles'; return null; } catch (e) { return 'Transfers: ' + e.message; } } }],
    presets: [
      { label: 'Fetch an instruction', values: { ops: 'AR←PC; IR←M, PC+; AR←PC' } },
      { label: 'Fetch and run LDA num', values: { ops: 'AR←PC; IR←M, PC+; AR←PC; AR←M, PC+; DR←M; AC←DR' } },
      { label: 'Two sources at once', values: { ops: 'AR←PC; DR←AR, AR←M' } },
      { label: 'Add memory to AC', values: { ops: 'AR←PC; DR←M; ADD' } },
    ],
    counters: [{ id: 'cycles', label: 'clock cycles' }],
    run(inp) {
      const C = Cpu(), prog = C.assemble(base), st = C.state(prog);
      const cycles = P13.readOps(inp.ops);
      const names = P13.names(prog);
      const F = new S.Frames(['cycles']);
      const regs = () => ({ PC: st.PC, AR: st.AR, IR: st.IR, AC: st.AC, DR: st.DR, SP: st.SP, Z: st.F.Z, C: st.F.C, N: st.F.N, OUTR: st.OUTR });
      const pic = (o) => CK().datapath(Object.assign({ regs: regs(), mem: st.mem, names }, o)).items;
      F.add({ items: pic({}), say: 'The datapath: memory on the left (the word at AR\'s address is lit), the registers PC, AR, IR, SP, the input and output registers above the bus, DR, the ALU and AC below it, the flags beside AC. The program "' + base.split('\n').slice(1).map((l) => l.replace(/\s+/g, ' ').trim()).join('; ') + '" is in memory from address 00.' });
      cycles.forEach((ops, k) => {
        const srcs = [...new Set(ops.map((o) => C.MICRO[o]).filter((u) => u.src).map((u) => u.src))];
        let r = null, err = null;
        try { r = C.apply(st, ops); } catch (e) { err = e.message; }
        F.count('cycles');
        const rtl = ops.map((o) => C.MICRO[o].rtl).join(', ');
        if (err) {
          F.add({ items: pic({ ops }), say: 'Cycle ' + (k + 1) + ': ' + rtl + '. Not allowed: ' + err + '. The bus is one set of wires; two registers driving it at once would fight, so each cycle has at most one source.' });
          return;
        }
        const next = cycles[k + 1];
        const nsrc = next ? next.map((o) => C.MICRO[o]).filter((u) => u.src).map((u) => (u.src === 'M' ? 'memf' : 'r:' + u.src)) : [];
        F.add({ items: pic({ ops, bus: r.bus ? { src: r.bus.src, value: r.bus.value } : null, changed: r.changes.map((c) => c.reg) }), say: 'Cycle ' + (k + 1) + ': ' + rtl + '. ' + (r.bus ? 'The select code ' + r.bus.sel + ' puts ' + r.bus.src + ' = ' + hex(r.bus.value) + ' on the bus; ' : srcs.length ? '' : 'Nothing uses the bus; ') + (r.changes.length ? 'at the clock edge ' + r.changes.map((c) => c.reg + ' ← ' + (c.reg.length === 1 ? c.to : hex(c.to))).join(', ') + '.' : 'nothing changes.') + (ops.includes('PC+') ? ' PC counts up by itself, without the bus, in the same cycle.' : ''), meta: nsrc.length === 1 && next ? { ask: true, keys: ['dp:' + nsrc[0]], next: next.map((o) => C.MICRO[o].rtl).join(', ') } : null });
      });
      F.add({ items: pic({}), say: 'After ' + cycles.length + ' cycle' + (cycles.length > 1 ? 's' : '') + ': PC = ' + hex(st.PC) + ', AR = ' + hex(st.AR) + ', IR = ' + hex(st.IR) + ', DR = ' + hex(st.DR) + ', AC = ' + hex(st.AC) + '. Every transfer went over the one bus, or used a register\'s own counter or the ALU.', mark: 'end' });
      return { frames: P13.big(F.list), def: { sections: [{ id: 'd', kind: 'table', title: 'Bus select codes', colHead: ['code', 'source'], rows: Object.entries(C.BUS_SEL).map(([k2, v]) => [String(v), k2]) }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'item', ask: (fr, i) => 'Next cycle: ' + fr[i].meta.next + '. Click the unit that will drive the bus.', answer: (fr, i) => fr[i].meta.keys, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'How many registers may drive the common bus in one cycle?', options: ['none', 'one', 'two', 'all of them'], answer: 1, why: 'The bus multiplexer selects exactly one source.' },
      { q: 'In "IR ← M[AR], PC ← PC + 1", why can both happen in one cycle?', options: ['they use the bus twice', 'only the first uses the bus; PC counts by itself', 'it is not allowed', 'the ALU does both'], answer: 1, why: 'PC is a counter with its own increment.' },
      { q: 'What selects which register drives the bus?', options: ['the ALU', 'the select code of the bus multiplexer, set by the control unit', 'the memory', 'the program counter'], answer: 1, why: 'A 3-bit code picks one of eight sources.' },
      { q: 'When does a destination register take the value on the bus?', options: ['immediately', 'at the clock edge that ends the cycle', 'two cycles later', 'when the bus is idle'], answer: 1, why: 'All loads happen together at the edge.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Instruction formats and addressing modes
  // ---------------------------------------------------------------------------------------------------------
  const tmpl = (ins) => `        ${ins}
        HLT
        ORG 0x10
num:    DB 42
ptr:    DB num
val:    DB 7`;
  const fmtCheck = (v) => { const p = Cpu().assemble(tmpl(String(v))); return p.errors.length ? 'Instruction: ' + p.errors[0].msg : null; };
  S.topic({
    id: 'cpu-formats', family: 'p13-machine', order: 20, title: 'Instruction formats and addressing modes',
    blurb: 'An instruction is one byte (opcode and mode) or two (plus an operand). The mode says what the operand means: the address of the data (direct), the address of the address (indirect), or the data itself (immediate). Follow each through memory.',
    inputs: [{ id: 'ins', kind: 'text', label: 'Instruction', def: 'LDA num', check: fmtCheck }],
    presets: [
      { label: 'Direct: LDA num', values: { ins: 'LDA num' } },
      { label: 'Indirect: LDA @ptr', values: { ins: 'LDA @ptr' } },
      { label: 'Immediate: LDA #9', values: { ins: 'LDA #9' } },
      { label: 'ADD val (direct)', values: { ins: 'ADD val' } },
      { label: 'One byte: NOT', values: { ins: 'NOT' } },
    ],
    run(inp) {
      const C = Cpu(), prog = C.assemble(tmpl(String(inp.ins))), b0 = prog.mem[0], d = C.decode(b0);
      const two = d.ins && d.ins.kind === 'mem', b1 = prog.mem[1];
      const names = P13.names(prog);
      const F = new S.Frames();
      const fields = two ? [{ from: 0, to: 3, label: 'opcode ' + hex(b0 >> 4)[1] + ': ' + d.ins.m, cls: 'x' }, { from: 4, to: 5, label: '00', cls: '' }, { from: 6, to: 7, label: 'mode ' + d.mode, cls: 'y' }] : [{ from: 0, to: 3, label: 'opcode ' + hex(b0 >> 4)[1] + ': ' + (d.ins ? d.ins.m : '?'), cls: 'x' }, { from: 4, to: 7, label: 'sub ' + (b0 & 15), cls: '' }];
      const bits = (hot) => CK().bits({ x: 0, y: 40, byte: b0, fields, title: 'byte 1 at 00: ' + hex(b0), prefix: 'b0' }).items.concat(two ? CK().bits({ x: 360, y: 40, byte: b1, fields: [{ from: 0, to: 7, label: 'operand ' + hex(b1) + ' (' + b1 + ')', cls: 'z' }], title: 'byte 2 at 01: ' + hex(b1), prefix: 'b1' }).items : []).concat(hot || []);
      const from = { x: 360 + 4 * 38, y: 40 + 46 + 42 };
      // memory: the data area, with arrows for the address chain
      const memRows = [0x10, 0x11, 0x12];
      const mem = (arrows, hotA) => {
        const items = [{ key: 'mt', kind: 'text', x: 0, y: 196, text: 'memory', cls: 'title' }];
        memRows.forEach((a, k) => items.push({ key: 'm' + a, kind: 'cell', x: 0, y: 210 + k * 40, w: 150, h: 40, rx: 0, text: hex(a) + ': ' + hex(prog.mem[a]) + (names[a] ? '  ' + names[a] : ''), size: 14, align: 'left', cls: 'dp-mem' + ((hotA || []).includes(a) ? ' at' : '') }));
        items.push({ key: 'ac', kind: 'cell', x: 450, y: 250, w: 110, h: 46, rx: 8, lines: ['AC', '?'], size: 15, cls: 'dp-reg' });
        return items.concat(arrows || []);
      };
      const listing = prog.listing[0];
      F.add({ items: bits().concat(mem()), say: '"' + listing.text.replace(/\s+/g, ' ').trim() + '" assembles to ' + listing.bytes.map(hex).join(' ') + ' at address 00. ' + (two ? 'Two bytes: the first holds the opcode and the mode, the second the operand.' : 'One byte: an inherent instruction needs no operand.'), meta: two ? { ask: true, mode: d.mode } : null });
      F.add({ items: bits().concat(mem()), say: 'The high four bits, ' + (b0 >> 4).toString(2).padStart(4, '0') + ' = ' + hex(b0 >> 4)[1] + ', are the opcode: ' + (d.ins ? d.ins.m + ', ' + d.ins.desc : 'not an instruction') + '. ' + (two ? 'The two low bits, ' + (b0 & 3).toString(2).padStart(2, '0') + ', are the mode: ' + { dir: 'direct', ind: 'indirect', imm: 'immediate' }[d.mode] + '.' : 'The low bits pick between instructions that share an opcode (' + (b0 & 15) + ').') });
      let value = null;
      if (two) {
        const ea = d.mode === 'dir' ? b1 : d.mode === 'ind' ? prog.mem[b1] : null;
        value = d.mode === 'imm' ? b1 : prog.mem[ea];
        const arrows = [];
        if (d.mode === 'dir') arrows.push({ key: 'a1', kind: 'edge', from, to: 'm' + ea, cls: 'hot' });
        if (d.mode === 'ind') arrows.push({ key: 'a1', kind: 'edge', from, to: 'm' + b1, cls: 'hot' }, { key: 'a2', kind: 'edge', from: 'm' + b1, to: 'm' + ea, cls: 'hot', bend: 40 });
        if (d.mode === 'imm') arrows.push({ key: 'a1', kind: 'edge', from, to: 'ac', cls: 'hot' });
        const say = d.mode === 'dir' ? 'Direct: the operand ' + hex(b1) + ' is the address of the data. M[' + hex(b1) + '] = ' + hex(value) + '.' : d.mode === 'ind' ? 'Indirect: the operand ' + hex(b1) + ' is the address of the address. M[' + hex(b1) + '] = ' + hex(ea) + ', and M[' + hex(ea) + '] = ' + hex(value) + ': one more memory read, but the pointer can be changed by the program.' : 'Immediate: the operand ' + hex(b1) + ' is the data itself; no memory read for it at all.';
        F.add({ items: bits().concat(mem(arrows, d.mode === 'imm' ? [] : [ea].concat(d.mode === 'ind' ? [b1] : []))), say });
      }
      const run = P13.run(prog, { from: 1 });
      const after = run.cycles[run.cycles.length - 1].after;
      const items = bits().concat(mem([], []));
      const ac = items.find((it) => it.key === 'ac'); ac.lines = ['AC', hex(after.AC)]; ac.cls += ' chg';
      F.add({ items, say: 'Run it: ' + run.cycles.length + ' clock cycles (3 to fetch, ' + (run.cycles.length - 3) + ' to execute). ' + (d.ins && d.ins.m === 'STA' ? 'M[' + hex(after.AR) + '] = ' + hex(run.cycles[run.cycles.length - 1].mem[after.AR]) + ': memory now holds AC.' : d.ins && /^(JMP|JZ|JC|CALL|RET)$/.test(d.ins.m) ? 'PC = ' + hex(after.PC) + '.' : 'AC = ' + hex(after.AC) + ' (' + after.AC + ').') + (two ? ' Immediate is the fastest mode and indirect the slowest: each level of address costs a memory cycle.' : ''), mark: 'end' });
      return { frames: P13.big(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'Formats', text: ['memory reference, 2 bytes:', '  [opcode 4 | 0 0 | mode 2] [operand]', '  mode 00 direct, 01 indirect, 10 immediate', 'inherent, 1 byte:', '  [opcode 4 | sub 4]'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['dir', 'ind', 'imm'], ask: 'Which addressing mode will the low two bits of the first byte select?', answer: (fr, i) => fr[i].meta.mode, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'In immediate mode, the operand is…', options: ['the address of the data', 'the data itself', 'the address of the address', 'a register number'], answer: 1, why: 'LDA #9 loads 9.' },
      { q: 'Indirect mode costs one more memory read than direct because…', options: ['the operand is longer', 'the operand points to a word that holds the real address', 'it uses the stack', 'it does not'], answer: 1, why: 'Address of the address, then the data.' },
      { q: 'In this machine the opcode is held in…', options: ['the low four bits of the first byte', 'the high four bits of the first byte', 'the second byte', 'the mode bits'], answer: 1, why: 'Bits 7 to 4.' },
      { q: 'Why is indirect addressing useful for walking an array?', options: ['it is faster', 'the program can change the pointer in memory to step through the array', 'it saves memory', 'it uses no AC'], answer: 1, why: 'The sum program adds 1 to its pointer each time round the loop.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // The assembler, two passes
  // ---------------------------------------------------------------------------------------------------------
  const asmCheck = (v) => { const lines = String(v).split('\n').filter((l) => l.trim()); if (!lines.length) return 'Program: write at least one line'; if (lines.length > 26) return 'Program: at most 26 lines, so every step can be shown'; return null; };
  S.topic({
    id: 'cpu-assemble', family: 'p13-machine', order: 30, title: 'From assembly to machine code',
    blurb: 'The assembler reads the program twice. The first pass only counts bytes, so it knows the address of every label; the second pass writes the bytes, now that every name has a value.',
    inputs: [{ id: 'src', kind: 'program', label: 'Program', def: `; count down from 3, sending each number out
start:  LDA #3
loop:   OUT
        SUB #1
        JZ done
        JMP loop
done:   HLT`, check: asmCheck }],
    presets: [
      { label: 'Count down', values: { src: `; count down from 3, sending each number out
start:  LDA #3
loop:   OUT
        SUB #1
        JZ done
        JMP loop
done:   HLT` } },
      { label: 'Sum of an array', values: { src: S.Cpu.programs.sum.src } },
      { label: 'A forward reference and data', values: { src: `        LDA first
        ADD second
        STA total
        HLT
first:  DB 20
second: DB 22
total:  DS 1` } },
      { label: 'A mistake: an unknown name', values: { src: `        LDA count
        SUB #1
        STA cuont
        HLT
count:  DB 5` } },
    ],
    counters: [{ id: 'bytes', label: 'bytes' }],
    run(inp) {
      const C = Cpu(), prog = C.assemble(String(inp.src));
      const L = prog.listing;
      const lines = L.map((l) => ({ addr: null, bytes: [], text: l.text }));
      const syms = [];
      const symTable = (hot) => K().table.draw({ x: 0, y: 0, prefix: 'sy', colHead: ['name', 'value'], rows: syms.length ? syms.map((s) => [s[0], hex(s[1])]) : [['', '']], mono: true, size: 15, minH: 30, ch: 30, hot: hot === undefined ? [] : [[hot, 0], [hot, 1]], title: 'symbol table' });
      const pic = (hot, symHot) => {
        const ls = CK().listing({ x: 0, y: 0, lines, hot, title: 'listing', maxRows: 13 });
        const st = symTable(symHot);
        const dx = ls.box.w + 40;
        for (const it of st.items) { if (it.x !== undefined) it.x += dx; }
        return ls.items.concat(st.items);
      };
      const quote = (t) => t.replace(/;.*/, '').replace(/\s+/g, ' ').trim();
      // the names each line uses, and the line that defines each name: a name used above its definition is a
      // forward reference, the reason for the first pass
      const defAt = {}, used = [];
      L.forEach((l, i) => {
        const code = l.text.replace(/;.*/, '');
        const lab = /^\s*([A-Za-z_]\w*)\s*(:|\s+EQU\b)/i.exec(code);
        if (lab) defAt[lab[1]] = i;
        const ops = code.replace(/^\s*[A-Za-z_]\w*\s*:/, '').replace(/^\s*[A-Za-z_]\w*\s+EQU\s+/i, ' ').trim().replace(/^[A-Za-z]+/, '');
        for (const n of ops.match(/[A-Za-z_]\w*/g) || []) if (!/^0[xb]/i.test(n) && !used.some((u) => u[0] === n && u[1] <= i)) used.push([n, i]);
      });
      const forward = [...new Set(used.filter(([n, i]) => n in defAt && defAt[n] > i).map((u) => u[0]))];
      const unknown = [...new Set(used.filter(([n]) => !(n in prog.symbols)).map((u) => u[0]))];
      const F = new S.Frames(['bytes']);
      F.add({ items: pic(null), say: 'The source, ' + L.length + ' lines. Pass 1 walks it with a location counter that starts at 00 (or where ORG says).' });
      const isCode = (l) => l.bytes.length || /\b(DB|DS)\b/i.test(l.text);
      L.forEach((l, i) => {
        lines[i].addr = isCode(l) || /:/.test(l.text.replace(/;.*/, '')) ? l.addr : null;
        const lab = /^\s*([A-Za-z_]\w*)\s*:/.exec(l.text.replace(/;.*/, ''));
        const equ = /^\s*([A-Za-z_]\w*)\s+EQU\s+/i.exec(l.text);
        let symHot;
        if (lab && !syms.some((s) => s[0] === lab[1])) { syms.push([lab[1], prog.symbols[lab[1]]]); symHot = syms.length - 1; }
        if (equ && !syms.some((s) => s[0] === equ[1])) { syms.push([equ[1], prog.symbols[equ[1]]]); symHot = syms.length - 1; }
        const size = l.bytes.length;
        if (!size && !lab && !equ) return;
        const nextCode = L.slice(i + 1).find((q) => q.bytes.length);
        F.add({ items: pic(i, symHot), say: 'Pass 1, "' + quote(l.text) + '": ' + (lab ? 'the label ' + lab[1] + ' = ' + hex(l.addr) + ' goes in the symbol table. ' : equ ? equ[1] + ' is defined as ' + hex(prog.symbols[equ[1]]) + '. ' : '') + (size ? 'It will take ' + size + ' byte' + (size > 1 ? 's' : '') + ', so the counter moves from ' + hex(l.addr) + ' to ' + hex(l.addr + size) + '.' : ''), meta: nextCode && i === 1 ? { ask: true, addr: hex(nextCode.addr), opts: [hex(nextCode.addr), hex(nextCode.addr + 1), hex(Math.max(0, nextCode.addr - 1)), hex(nextCode.addr + 2)] } : null });
      });
      F.add({ items: pic(null), say: 'Pass 1 is done: every label has an address' + (forward.length ? ', including the ones used before they are defined (' + forward.join(', ') + ')' : '') + '.' + (unknown.length ? ' But ' + unknown.join(', ') + (unknown.length > 1 ? ' are' : ' is') + ' used and never defined, so ' + (unknown.length > 1 ? 'they have' : 'it has') + ' no address.' : '') + ' Pass 2 can now write every byte.' });
      let bytes = 0;
      L.forEach((l, i) => {
        if (!l.bytes.length) return;
        lines[i].bytes = l.bytes;
        bytes += l.bytes.length;
        F.set('bytes', bytes);
        const d = C.decode(l.bytes[0]);
        const isIns = d.ins && !/\b(DB|DS)\b/i.test(l.text);
        const opnd = l.text.replace(/;.*/, '').trim().split(/\s+/).pop();
        const say = isIns ? hex(l.addr) + ': ' + d.ins.m + ' is opcode ' + hex(d.op)[1] + (d.ins.kind === 'mem' ? ', mode ' + d.mode + ' (' + (l.bytes[0] & 3) + '), so the first byte is ' + hex(l.bytes[0]) + '; the operand ' + opnd + (unknown.includes(opnd.replace(/^[#@]/, '').split(/[+-]/)[0].trim()) ? ' is not in the symbol table, so its byte is left as ' + hex(l.bytes[1]) + '.' : ' is ' + hex(l.bytes[1]) + '.') : ' (' + hex(l.bytes[0]) + ').') : hex(l.addr) + ': data, ' + l.bytes.map(hex).join(' ') + '.';
        const nxt = L.slice(i + 1).find((q) => q.bytes.length && C.decode(q.bytes[0]).ins && !/\b(DB|DS)\b/i.test(q.text));
        F.add({ items: pic(i), say: 'Pass 2: ' + say, meta: nxt && bytes <= 4 ? { ask2: true, b: hex(nxt.bytes[0]), opts: [...new Set([hex(nxt.bytes[0]), hex(nxt.bytes[0] ^ 0x01), hex(nxt.bytes[0] ^ 0x02), hex((nxt.bytes[0] + 0x10) & 0xff)])], text: quote(nxt.text) } : null });
      });
      const errs = prog.errors;
      F.add({ items: pic(null), say: errs.length ? 'The assembler reports: ' + errs.map((e) => 'line ' + e.line + ', ' + e.msg).join('; ') + '. A name used but never defined has no address, so pass 2 cannot finish that byte.' : prog.size + ' bytes of machine code, ready to load at ' + hex(prog.start) + '. ' + (forward.length ? 'Two passes were needed because the name ' + forward[0] + ' is used before the line that defines it, and pass 1 had to find its address first.' : 'No name here is used before its definition, but a jump forward would need the first pass to find its label.'), mark: 'end' });
      return { frames: P13.big(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'Two passes', text: ['pass 1: count bytes, record labels', '  location counter from 00 (ORG)', 'pass 2: write the bytes', '  opcode<<4 | mode, then the operand', '', 'DB: bytes, DS n: n zero bytes'].join('\n') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => fr[i].meta.opts, ask: 'What address will the next instruction get?', answer: (fr, i) => fr[i].meta.addr, explain: (fr, i) => fr[i + 1].say },
      { at: (f) => f.meta && f.meta.ask2, pick: 'option', options: (fr, i) => fr[i].meta.opts, ask: (fr, i) => 'What is the first byte of "' + fr[i].meta.text + '"?', answer: (fr, i) => fr[i].meta.b, explain: (fr, i) => fr[i + 1].say, once: true },
    ],
    quiz: [
      { q: 'Why does the assembler need two passes?', options: ['to check spelling', 'an instruction can use a label defined further down, whose address is only known after counting', 'for speed', 'to optimise the code'], answer: 1, why: 'Pass 1 finds every label\'s address; pass 2 uses them.' },
      { q: 'What does pass 1 produce?', options: ['the machine code', 'the symbol table', 'the listing only', 'nothing'], answer: 1, why: 'Names and their addresses.' },
      { q: 'LDA has opcode 1 and immediate mode is 10. The first byte of LDA #3 is…', options: ['13', '12', '21', '03'], answer: 1, why: '0001 00 10 = 12 in hexadecimal.' },
      { q: 'How many bytes does "JMP loop" take?', options: ['1', '2', '3', '4'], answer: 1, why: 'A memory-reference instruction: opcode byte and address byte.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
