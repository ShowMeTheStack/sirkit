// Example programs for the processor (all our own), each with the result it must give, and the datapath drawn
// at block level as a circuit for the schematic engine: the registers on a common bus selected by a
// multiplexer, the ALU between AC and DR, the memory, the sequence counter and the control unit.
(function (S) {
  'use strict';
  const C = S.Cpu = S.Cpu || {};

  C.programs = {
    sum: {
      title: 'Sum of an array',
      say: 'Adds the bytes of an array through a pointer (indirect loads) and sends the total to the output.',
      src: `; the sum of N bytes at ARR, sent to the output
start:  LDA #0
        STA sum
        LDA #arr
        STA ptr
        LDA n
        STA cnt
loop:   LDA cnt        ; Z = 1 when no bytes are left
        JZ done
        SUB #1
        STA cnt
        LDA sum
        ADD @ptr       ; the byte the pointer points at
        STA sum
        LDA ptr
        ADD #1
        STA ptr
        JMP loop
done:   LDA sum
        OUT
        HLT
n:      DB 5
arr:    DB 12, 7, 30, 1, 9
sum:    DB 0
ptr:    DB 0
cnt:    DB 0`,
      expect: (r) => r.output[0] === 59,
      answer: [59],
    },
    multiply: {
      title: 'Multiply by shift and add',
      say: 'Multiplies X by Y (keeping the low 8 bits): each bit of Y, shifted out into C, decides whether X is added; X doubles each round.',
      src: `; PROD = X × Y by shift and add
start:  LDA #0
        STA prod
        LDA #8
        STA cnt
loop:   LDA y
        SHR            ; the low bit of Y goes to C
        STA y          ; STA leaves the flags alone
        JC addx
        JMP next
addx:   LDA prod
        ADD x
        STA prod
next:   LDA x
        SHL
        STA x
        LDA cnt
        SUB #1
        STA cnt
        JZ done
        JMP loop
done:   LDA prod
        OUT
        HLT
x:      DB 13
y:      DB 11
prod:   DB 0
cnt:    DB 0`,
      expect: (r) => r.output[0] === 143,
      answer: [143],
    },
    max: {
      title: 'Find the maximum',
      say: 'Walks an array and keeps the largest byte: SUB sets C when there is no borrow, that is when the byte is at least the maximum so far.',
      src: `; the largest of N bytes at ARR
start:  LDA #arr
        STA ptr
        LDA n
        STA cnt
        LDA #0
        STA max
loop:   LDA cnt
        JZ done
        SUB #1
        STA cnt
        LDA @ptr
        SUB max        ; C = 1 when the byte >= max
        JC bigger
        JMP step
bigger: LDA @ptr
        STA max
step:   LDA ptr
        ADD #1
        STA ptr
        JMP loop
done:   LDA max
        OUT
        HLT
n:      DB 6
arr:    DB 23, 88, 5, 91, 40, 17
max:    DB 0
ptr:    DB 0
cnt:    DB 0`,
      expect: (r) => r.output[0] === 91,
      answer: [91],
    },
    ones: {
      title: 'Count the ones',
      say: 'Counts the 1 bits of a byte: eight shifts, each bit landing in C; a subroutine adds one to the count.',
      src: `; the number of 1 bits in V, through a subroutine
start:  LDA #8
        STA cnt
loop:   LDA v
        SHR
        STA v
        JC one
        JMP next
one:    CALL bump
next:   LDA cnt
        SUB #1
        STA cnt
        JZ done
        JMP loop
done:   LDA ones
        OUT
        HLT
bump:   LDA ones       ; ones = ones + 1
        ADD #1
        STA ones
        RET
v:      DB 0b10110110
ones:   DB 0
cnt:    DB 0`,
      expect: (r) => r.output[0] === 5,
      answer: [5],
    },
    io: {
      title: 'A loop with input and output',
      say: 'Reads bytes until a 0 and sends out the running total after each one.',
      src: `; running totals of the input, until a 0
start:  LDA #0
        STA total
loop:   IN             ; Z = 1 when the byte is 0
        JZ done
        ADD total
        STA total
        OUT
        JMP loop
done:   HLT
total:  DB 0`,
      input: [3, 10, 4, 20, 0],
      expect: (r) => JSON.stringify(r.output) === JSON.stringify([3, 13, 17, 37]),
      answer: [3, 13, 17, 37],
    },
  };
  /** assemble and run an example; returns { program, run, cpu } */
  C.runExample = function (key, opts) {
    const p = C.programs[key], prog = C.assemble(p.src);
    if (prog.errors.length) throw new Error(key + ': ' + prog.errors[0].msg + ' (line ' + prog.errors[0].line + ')');
    const cpu = C.machine(prog, Object.assign({ input: p.input }, opts));
    const run = cpu.run((opts && opts.max) || 20000);
    return { program: prog, run, cpu, ok: p.expect(run) };
  };

  /**
   * The datapath at block level, as a circuit: the registers in a column load from the bus (AC from the
   * ALU); the bus multiplexer picks the source (0 INPR, 1 PC, 2 DR, 3 AC, 4 IR, 5 SP, 6 AR, 7 memory); the
   * memory reads and writes at AR; every load and count enable is a control line from the control unit,
   * drawn as a port of its own. Drawn in the 'cpu' style below when the schematic engine is loaded.
   */
  C.datapathCircuit = function () {
    const c = new S.Netlist.Circuit('processor datapath');
    const reg = (name) => c.add('REG', { w: 8, ld: true, name }, name.toLowerCase());
    const ctr = (name) => c.add('COUNTER', { w: 8, en: true, ld: true, name }, name.toLowerCase());
    const regs = [ctr('PC'), reg('DR'), reg('AC'), reg('IR'), ctr('SP'), reg('AR')];
    const [pc, dr, ac, ir, sp, ar] = regs;
    const mem = c.add('BLOCK', { name: 'M', title: 'Memory 256×8', inputs: [{ name: 'ADDR', width: 8, label: 'ADDR' }, { name: 'DIN', width: 8, label: 'DIN' }, { name: 'WR', label: 'WR' }], outputs: [{ name: 'DOUT', width: 8, label: 'DOUT' }] }, 'mem');
    const mux = c.add('MUX', { n: 8, w: 8, selBus: true }, 'busmux');
    const alu = c.add('ALU', { w: 8, opw: 3 }, 'alu');
    const inpr = c.input('INPR', 8);
    c.connect(inpr.pin('y'), mux.pin('d0'));
    regs.forEach((r, i) => c.connect(r.pin('q'), mux.pin('d' + (i + 1))));
    c.connect(mem.pin('DOUT'), mux.pin('d7'));
    const net = (p) => c.netOf(p.pin(p.type === 'MUX' ? 'y' : 'q'));
    const sink = (p, ...to) => { const n = net(p); for (const t of to) { n.pins.push(t); t.part.net[t.pin] = n; } };
    sink(ac, alu.pin('a')); sink(dr, alu.pin('b')); sink(ar, mem.pin('ADDR'));
    const irOut = c.output('IR', 8);
    sink(ir, irOut.pin('a'));
    c.connect(mux.pin('y'), ...[pc, dr, ir, sp, ar].map((r) => r.pin('d')), mem.pin('DIN'));
    c.name(mux.pin('y'), 'BUS', true);
    c.connect(alu.pin('y'), ac.pin('d'));
    const clk = c.clock('CLK');
    c.connect(clk.pin('y'), ...regs.map((r) => r.pin('clk')));
    const ctl = [];
    const line = (name, to) => { const p = c.input(name); c.connect(p.pin('y'), to); ctl.push({ port: p, to }); };
    line('INC_PC', pc.pin('en')); line('LD_PC', pc.pin('ld'));
    line('LD_DR', dr.pin('ld')); line('LD_AC', ac.pin('ld')); line('LD_IR', ir.pin('ld'));
    line('CNT_SP', sp.pin('en')); line('LD_SP', sp.pin('ld')); line('LD_AR', ar.pin('ld'));
    line('WR', mem.pin('WR'));
    const sel = c.input('SEL', 3); c.connect(sel.pin('y'), mux.pin('s'));
    const op = c.input('OP', 3); c.connect(op.pin('y'), alu.pin('op'));
    // the output register, loaded from the bus
    const outr = c.add('REG', { w: 8, ld: true, name: 'OUTR' }, 'outr');
    sink(mux, outr.pin('d'));
    c.connect(clk.pin('y'), outr.pin('clk'));
    line('LD_OUT', outr.pin('ld'));
    const outp = c.output('OUT', 8); c.connect(outr.pin('q'), outp.pin('a'));
    c.style = 'cpu';
    c.hints = { regs, mem, mux, alu, inpr, clk, ctl, sel, op, irOut, ac, outr, outp };
    registerStyle();
    return c;
  };

  // The drawing: the registers in a column, each Q running straight into the bus multiplexer on its own row;
  // the bus a real bus line from the multiplexer over the top and down beside the registers, a tap into each
  // D; the clock a rail beside them; every control line a port at the left, straight to its pin; the memory
  // under the registers with its address dropping from AR; the ALU beyond the multiplexer. Branches the
  // style does not draw (AC and DR into the ALU, the ALU back to AC, IR to the control unit) go to the router.
  function registerStyle() {
    const St = S.Styles, Sym = S.Symbols;
    if (!St || St.styles.cpu) return;
    St.styles.cpu = function (c) {
      const H = c.hints || {};
      if (!H.regs || !H.mux) return null;
      const sh = St.sheet(c, 'cpu'), at = (p, pin) => sh.at(p, pin);
      const { regs, mem, mux, alu, inpr, clk, ctl, irOut, ac, outr, outp } = H;
      let y = 0;
      for (const r of regs) { sh.put(r, 0, y); y += sh.g(r).h + 3; }
      const gm = Sym.variant(mem, { sides: { ADDR: 'top' } });
      sh.put(mem, 0, y + 3, gm);
      const rw = Math.max(gm.w, ...regs.map((r) => sh.g(r).w));
      // the output register under the memory, its port just beside it
      sh.put(outr, 0, y + 3 + gm.h + 4);
      { const q = at(outr, 'q'), g = sh.g(outp); sh.put(outp, q.x + 3, q.y - g.pins.a.y); sh.line(sh.net(outr, 'q'), [[q.x, q.y], [q.x + 3, q.y]]); }
      // the multiplexer, its inputs on the rows of what feeds them
      const rows = [at(regs[0], 'q').y - 6].concat(regs.map((r) => at(r, 'q').y), [at(mem, 'DOUT').y]);
      const gx = Sym.variant(mux, { inRows: rows }), xm = rw + 14;
      sh.put(mux, xm, gx.top, gx);
      regs.forEach((r, i) => { const q = at(r, 'q'), d = at(mux, 'd' + (i + 1)); sh.line(sh.net(r, 'q'), [[q.x, q.y], [d.x, d.y]]); });
      { const q = at(mem, 'DOUT'), d = at(mux, 'd7'); sh.line(sh.net(mem, 'DOUT'), [[q.x, q.y], [d.x, d.y]]); }
      // the input port on the top row
      const gi = sh.g(inpr), d0 = at(mux, 'd0');
      sh.put(inpr, d0.x - 4 - gi.w, d0.y - gi.pins.y.y);
      sh.line(sh.net(mux, 'd0'), [[d0.x - 4, d0.y], [d0.x, d0.y]]);
      // the bus: up from the multiplexer, over the top, down beside the registers
      const my = at(mux, 'y'), yB = d0.y - 5, xs = -9, xc = -5, xr = my.x + 3, ni = sh.net(mux, 'y');
      const taps = regs.filter((r) => r !== ac).map((r) => at(r, 'd')).concat([at(mem, 'DIN'), at(outr, 'd')]);
      sh.line(ni, [[my.x, my.y], [xr, my.y]]);
      sh.line(ni, [[xr, my.y], [xr, yB], [xs, yB], [xs, Math.max(...taps.map((t) => t.y))]], true);
      for (const t of taps) sh.line(ni, [[xs, t.y], [t.x, t.y]]);
      // the address: from AR's output down into the top of the memory
      { const q = at(regs[regs.length - 1], 'q'), a = at(mem, 'ADDR'), yg = a.y - 2; sh.line(sh.net(mem, 'ADDR'), [[q.x + 3, q.y], [q.x + 3, yg], [a.x, yg], [a.x, a.y]]); }
      // the control lines, from ports at the left
      const xp = xs - 4;
      for (const k of ctl) { const p = at(k.to.part, k.to.pin), g = sh.g(k.port); sh.put(k.port, xp - g.w, p.y - g.pins.y.y); sh.line(sh.net(k.to.part, k.to.pin), [[xp, p.y], [p.x, p.y]]); }
      // the clock: a rail beside the registers, from its port below
      let yLow = -Infinity;
      c.parts.forEach((p, i) => { if (sh.placed(p)) yLow = Math.max(yLow, sh.Y[i] + sh.geo[i].h); });
      const below = (part, pin, yy) => { const d = at(part, pin), port = St.driverOf(part, pin).part, g = Sym.variant(port, { orient: 'up' }); sh.put(port, d.x - g.w / 2, yy, g); sh.line(sh.net(part, pin), [[d.x, yy], [d.x, d.y]]); };
      const gc = Sym.variant(clk, { orient: 'up' }), yP = yLow + 4;
      sh.put(clk, xc - gc.w / 2, yP, gc);
      const cRows = regs.map((r) => at(r, 'clk').y);
      sh.line(sh.net(regs[0], 'clk'), [[xc, yP], [xc, Math.min(...cRows)]], true);
      for (const r of regs.concat([outr])) { const k = at(r, 'clk'); sh.line(sh.net(r, 'clk'), [[xc, k.y], [k.x, k.y]]); }
      below(mux, 's', yP);
      // the ALU beyond the bus riser, A on the row of AC; its operation from below
      const ga = sh.g(alu), aq = at(ac, 'q');
      sh.put(alu, xr + 8, aq.y - ga.pins.a.y);
      below(alu, 'op', yP);
      // IR to the control unit: a drop in the channel before the multiplexer to a port at the foot
      const gO = Sym.variant(irOut, { orient: 'down' }), irq = at(regs[3], 'q'), xd = xm - 3;
      sh.put(irOut, xd - gO.w / 2, yP, gO);
      sh.line(sh.net(regs[3], 'q'), [[xd, irq.y], [xd, yP]]);
      return sh.plan(c.title);
    };
  }

  /**
   * The hard-wired control unit at block level: IR's opcode to a 4:16 decoder (D0..D15), the sequence counter
   * to a timing decoder (T0..T8), the flags, and the control logic that turns them into the control lines.
   */
  C.controlCircuit = function () {
    const c = new S.Netlist.Circuit('hard-wired control unit');
    const ir = c.input('IR', 8), fl = c.input('F', 3), clk = c.clock('CLK'), clr = c.input('CLR_SC');
    const opdec = c.add('BLOCK', { name: 'OPDEC', title: '4:16 decoder', inputs: [{ name: 'OP', width: 8, label: 'IR7-4' }], outputs: [{ name: 'D', width: 16, label: 'D0-D15' }] }, 'opdec');
    const sc = c.add('COUNTER', { w: 4, clr: true, name: 'SC' }, 'sc');
    const tdec = c.add('BLOCK', { name: 'TDEC', title: '4:16 decoder', inputs: [{ name: 'Q', width: 4, label: 'SC' }], outputs: [{ name: 'T', width: 16, label: 'T0-T15' }] }, 'tdec');
    const logic = c.add('BLOCK', { name: 'LOGIC', title: 'control logic', inputs: [{ name: 'D', width: 16, label: 'D' }, { name: 'T', width: 16, label: 'T' }, { name: 'IR', width: 8, label: 'IR1-0' }, { name: 'F', width: 3, label: 'Z C N' }], outputs: [{ name: 'CTL', width: 16, label: 'control lines' }, { name: 'CLR', label: 'CLR SC' }] }, 'logic');
    c.connect(ir.pin('y'), opdec.pin('OP'), logic.pin('IR'));
    c.connect(opdec.pin('D'), logic.pin('D'));
    c.connect(clk.pin('y'), sc.pin('clk'));
    c.connect(clr.pin('y'), sc.pin('clr'));
    c.connect(sc.pin('q'), tdec.pin('Q'));
    c.connect(tdec.pin('T'), logic.pin('T'));
    c.connect(fl.pin('y'), logic.pin('F'));
    c.connect(logic.pin('CTL'), c.output('CTL', 16).pin('a'));
    c.connect(logic.pin('CLR'), c.output('CLR', 1).pin('a'));
    return c;
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
