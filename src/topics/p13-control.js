// Part 13, control: the instruction cycle micro-operation by micro-operation under the timing signals T0..Tn,
// every class of instruction executed, the hard-wired control unit's equations with the term that fires in each
// cycle lit, and the microprogrammed control unit (control memory, mapping, sequencer) running the same program
// in step with the hard-wired one.
(function (S) {
  'use strict';
  const P13 = S.P13, Cpu = () => S.Cpu, CK = () => S.Kit.cpu, K = () => S.Kit;
  const hex = (v) => P13.hex(v);
  const line = (key, x, y, text, cls, size) => ({ key, kind: 'text', x, y, text, cls: 'fl-line mono ' + (cls || ''), size: size || 14 });

  /** the RTL of an instruction's cycles as lines, the one at T lit */
  function rtlLines(run, insIdx, uptoCycle, x, y) {
    const ins = run.instrs[insIdx], items = [{ key: 'rt:h', kind: 'text', x, y: y - 14, text: (ins.text || '…') + ' at ' + hex(ins.addr), cls: 'title' }];
    ins.cycles.forEach((ci, k) => {
      const c = run.cycles[ci];
      if (ci > uptoCycle) return;
      items.push(line('rt' + k, x, y + 14 + k * 24, 'T' + c.T + '  ' + (c.rtl.join(', ') || '(nothing)'), ci === uptoCycle ? 'hot' : 'dim', 15));
    });
    return items;
  }
  const fetchProgs = {
    three: { label: 'LDA, ADD, STA', src: `        LDA num
        ADD #5
        STA num
        HLT
num:    DB 37` },
    jump: { label: 'A jump taken', src: `        LDA #0
        JZ there
        HLT
there:  NOT
        HLT` },
    stack: { label: 'CALL and RET', src: `        CALL sub
        HLT
sub:    LDA #1
        RET` },
  };

  // ---------------------------------------------------------------------------------------------------------
  // Fetch, decode, execute
  // ---------------------------------------------------------------------------------------------------------
  S.topic({
    id: 'cpu-fetch', family: 'p13-control', order: 10, title: 'Fetch, decode, execute',
    blurb: 'A sequence counter steps through the timing signals T0, T1, T2 …: fetch the instruction (T0, T1), decode it and get the next address ready (T2), then execute it from T3, one register transfer per clock, until the counter is cleared for the next instruction.',
    inputs: [{ id: 'prog', kind: 'choice', label: 'Program', def: 'three', options: Object.entries(fetchProgs).map(([value, p]) => ({ value, label: p.label })) }, { id: 'n', kind: 'number', label: 'Instructions to show', def: 2, min: 1, max: 4 }],
    presets: [{ label: 'LDA then ADD', values: { prog: 'three', n: 2 } }, { label: 'A jump taken', values: { prog: 'jump', n: 2 } }, { label: 'CALL and RET', values: { prog: 'stack', n: 3 } }],
    counters: [{ id: 'cycles', label: 'clock cycles' }],
    run(inp) {
      const run = P13.run(fetchProgs[inp.prog].src, { from: inp.n });
      const F = new S.Frames(['cycles']);
      const Ts = run.cycles.map((c) => c.T);
      const nT = Math.max(...Ts) + 1;
      const dp0 = P13.dpAt({ PC: 0, AR: 0, IR: 0, AC: 0, DR: 0, SP: 0, Z: 0, C: 0, N: 0 }, run.prog.mem, run.prog);
      const tmX = dp0.box.x + dp0.box.w + 50, tmY = 40;
      const scene = (i) => {
        const d = P13.dp(run, i);
        const tm = CK().timing({ x: tmX, y: tmY, Ts: Ts.slice(0, i + 1), total: Ts.length, now: i, n: nT, w: 280 });
        return d.items.concat(tm.items, rtlLines(run, run.cycles[i].ins, i, tmX, tm.box.y + tm.box.h + 44));
      };
      F.add({ items: dp0.items, say: 'The program is in memory and PC = 00. The sequence counter SC is cleared, so the timing signal T0 is on.' });
      run.cycles.forEach((c, i) => {
        F.count('cycles');
        const phase = c.T === 0 ? 'Fetch: the address of the next instruction goes to AR. ' : c.T === 1 ? 'Fetch: memory at AR is read into IR, and PC counts on to the next byte. ' : c.T === 2 ? 'Decode: IR\'s opcode now drives the decoder (D' + hex(c.after.IR >> 4)[1] + '), and AR gets PC ready for an operand. ' : 'Execute (T' + c.T + '): ';
        const nx = run.cycles[i + 1];
        F.add({ items: scene(i), say: phase + P13.say(c) + (c.end ? ' SC is cleared: the next cycle is T0 of the next instruction.' : ''), meta: c.T === 0 && nx ? { ask: true, keys: ['dp:r:IR'] } : null });
      });
      F.add({ items: scene(run.cycles.length - 1), say: run.instrs.length + ' instruction' + (run.instrs.length > 1 ? 's' : '') + ' in ' + run.cycles.length + ' cycles: ' + run.instrs.map((s) => s.text + ' ' + s.cycles.length).join(', ') + '. Every one starts with the same three fetch cycles; only what follows T2 depends on the opcode.', mark: 'end' });
      return { frames: P13.narrow(F.list, dp0.box), def: { sections: [{ id: 'd', kind: 'math', title: 'The instruction cycle', text: ['T0: AR ← PC', 'T1: IR ← M[AR], PC ← PC + 1', 'T2: decode IR; AR ← PC', 'T3 …: execute', 'last: SC ← 0'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'item', ask: 'T1 comes next. Click the register that will load from the bus.', answer: (fr, i) => fr[i].meta.keys, explain: (fr, i) => fr[i + 1].say, once: true }],
    quiz: [
      { q: 'What happens in T0 of every instruction?', options: ['IR ← M[AR]', 'AR ← PC', 'AC ← DR', 'PC ← AR'], answer: 1, why: 'The address of the instruction goes to the memory address register.' },
      { q: 'Why does PC count up in T1?', options: ['to point at the next byte, ready for an operand or the next instruction', 'to jump', 'to save it', 'it does not'], answer: 0, why: 'The instruction byte has been read; PC moves past it.' },
      { q: 'What starts the next instruction\'s fetch?', options: ['a jump', 'clearing the sequence counter (SC ← 0), so T0 comes round again', 'an interrupt', 'the ALU'], answer: 1, why: 'The last cycle of every routine clears SC.' },
      { q: 'How many cycles does fetch and decode take in this machine?', options: ['1', '2', '3', '4'], answer: 2, why: 'T0, T1 and T2.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Each class of instruction
  // ---------------------------------------------------------------------------------------------------------
  const cls = {
    'LDA.dir': { label: 'LDA direct', setup: '', ins: 'LDA val' },
    'LDA.ind': { label: 'LDA indirect', setup: '', ins: 'LDA @ptr' },
    'LDA.imm': { label: 'LDA immediate', setup: '', ins: 'LDA #9' },
    STA: { label: 'STA', setup: 'LDA #77', ins: 'STA val' },
    ADD: { label: 'ADD with a carry', setup: 'LDA #200', ins: 'ADD #100' },
    SUB: { label: 'SUB with a borrow', setup: 'LDA #5', ins: 'SUB #9' },
    NOT: { label: 'NOT', setup: 'LDA #0x0F', ins: 'NOT' },
    SHL: { label: 'SHL', setup: 'LDA #0x81', ins: 'SHL' },
    JMP: { label: 'JMP', setup: '', ins: 'JMP far' },
    JZt: { label: 'JZ taken (Z = 1)', setup: 'LDA #0', ins: 'JZ far' },
    JZn: { label: 'JZ not taken (Z = 0)', setup: 'LDA #1', ins: 'JZ far' },
    CALL: { label: 'CALL', setup: '', ins: 'CALL far' },
    IN: { label: 'IN', setup: '', ins: 'IN' },
    OUT: { label: 'OUT', setup: 'LDA #42', ins: 'OUT' },
  };
  const clsSrc = (k) => `${cls[k].setup ? '        ' + cls[k].setup + '\n' : ''}        ${cls[k].ins}
        HLT
        ORG 0x20
val:    DB 13
ptr:    DB val
        ORG 0x30
far:    HLT`;
  S.topic({
    id: 'cpu-exec', family: 'p13-control', order: 20, title: 'Each kind of instruction, executed',
    blurb: 'After the common fetch, every instruction runs its own short routine of register transfers: memory reads for the operand, an ALU operation, a store, a jump decided by a flag, a call that saves the return address on the stack.',
    inputs: [{ id: 'k', kind: 'choice', label: 'Instruction', def: 'LDA.ind', options: Object.entries(cls).map(([value, c]) => ({ value, label: c.label })) }],
    presets: ['LDA.dir', 'LDA.ind', 'LDA.imm', 'STA', 'ADD', 'JZt', 'JZn', 'CALL', 'OUT'].map((k) => ({ label: cls[k].label, values: { k } })),
    counters: [{ id: 'cycles', label: 'cycles' }],
    run(inp) {
      const c0 = cls[inp.k], run = P13.run(clsSrc(inp.k), { from: c0.setup ? 2 : 1, input: [99] });
      const insIdx = run.instrs.length - 1, ins = run.instrs[insIdx];
      const first = ins.cycles[0];
      const before = first > 0 ? run.cycles[first - 1].after : { PC: 0, AR: 0, IR: 0, AC: 0, DR: 0, SP: 0, Z: 0, C: 0, N: 0 };
      const memBefore = first > 0 ? run.cycles[first - 1].mem : run.prog.mem;
      const F = new S.Frames(['cycles']);
      const dp0 = P13.dpAt(before, memBefore, run.prog);
      const rx = dp0.box.x + dp0.box.w + 50, ry = 70;
      F.add({ items: dp0.items.concat(rtlLines(run, insIdx, first - 1, rx, ry)), say: (c0.setup ? 'Set up by ' + c0.setup + ' (AC = ' + hex(before.AC) + ', Z = ' + before.Z + ', C = ' + before.C + '). ' : '') + 'Now ' + ins.text + ' at ' + hex(ins.addr) + '. On the right, its transfers appear one clock cycle at a time.', meta: { ask: true, n: String(ins.cycles.length) } });
      ins.cycles.forEach((ci) => {
        F.count('cycles');
        const c = run.cycles[ci];
        F.add({ items: P13.dp(run, ci).items.concat(rtlLines(run, insIdx, ci, rx, ry)), say: P13.say(c) + (c.T >= 3 && /JZ|JC/.test(ins.text) && c.end ? ' The flag decides: ' + ins.text[1] + (c.ops.includes('PC←AR') ? ' = 1, so PC takes the target address.' : ' = 0, so nothing is loaded and PC already points past the instruction.') : '') + (c.ops.includes('SP-') ? ' The stack grows down: SP steps down before the return address is stored.' : '') });
      });
      const a = run.cycles[ins.cycles[ins.cycles.length - 1]].after;
      F.add({ items: P13.dp(run, ins.cycles[ins.cycles.length - 1], { ops: [] }).items.concat(rtlLines(run, insIdx, ins.cycles[ins.cycles.length - 1], rx, ry)), say: ins.text + ' took ' + ins.cycles.length + ' cycles. Afterwards PC = ' + hex(a.PC) + ', AC = ' + hex(a.AC) + ', flags Z ' + a.Z + ' C ' + a.C + ' N ' + a.N + '.', mark: 'end' });
      return { frames: P13.narrow(F.list, dp0.box), def: { sections: [{ id: 'd', kind: 'table', title: 'Routine of ' + ins.text, colHead: ['T', 'transfers'], rows: (Cpu().timing().find((t) => t.key === Cpu().keyOf(run.cycles[ins.cycles[0] + 1].after.IR)) || { steps: [] }).steps.map((s) => ['T' + s.T, s.rtl]) }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['3', '4', '5', '6', '7', '8'], ask: 'Fetch takes 3 cycles. How many cycles will this instruction take in all?', answer: (fr, i) => fr[i].meta.n, explain: (fr) => fr[fr.length - 1].say }],
    quiz: [
      { q: 'LDA in indirect mode reads memory how many times after the fetch?', options: ['once', 'twice', 'three times', 'never'], answer: 2, why: 'The operand, the pointer it names, then the data.' },
      { q: 'A JZ whose flag is 0…', options: ['loads PC with the target', 'does nothing more: PC already points past it', 'halts', 'clears Z'], answer: 1, why: 'Its last cycle transfers nothing and clears SC.' },
      { q: 'CALL saves the return address…', options: ['in AC', 'on the stack in memory, at SP after it steps down', 'in IR', 'nowhere'], answer: 1, why: 'RET reads it back and steps SP up.' },
      { q: 'Which instructions update the carry flag C?', options: ['all of them', 'ADD, SUB, SHL and SHR', 'only LDA', 'JMP and JZ'], answer: 1, why: 'The arithmetic and the shifts.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // The hard-wired control unit
  // ---------------------------------------------------------------------------------------------------------
  const shown = ['AR←PC', 'IR←M', 'PC+', 'AR←M', 'DR←M', 'AC←DR', 'ADD', 'M←AC', 'PC←AR'];
  S.topic({
    id: 'cpu-hardwired', family: 'p13-control', order: 30, title: 'The hard-wired control unit',
    blurb: 'Decode the opcode into D0..D15 and the sequence counter into T0..Tn. Every control line is then a sum of products of those signals, the mode bits and the flags. Run a program and watch which product turns each line on.',
    inputs: [{ id: 'prog', kind: 'choice', label: 'Program', def: 'three', options: Object.entries(fetchProgs).map(([value, p]) => ({ value, label: p.label })) }],
    presets: Object.entries(fetchProgs).map(([value, p]) => ({ label: p.label, values: { prog: value } })),
    run(inp) {
      const C = Cpu(), rows = C.hardwired();
      const run = P13.run(fetchProgs[inp.prog].src, { from: 3 });
      // the decoders' buses drawn as bus lines, which other wires may cross
      // the control unit as blocks: two decoders and the control logic, with their signals as labelled arrows
      const blk = (id, x, y, w, h, lines) => ({ key: 'cu:' + id, kind: 'cell', x, y, w, h, rx: 8, lines, size: 15, cls: 'dp-reg' });
      // arrows run straight across into the side of the logic block, their labels above them
      const arrow = (a2, b2, label, lx, ly, to) => Object.assign({ key: 'cu:a:' + a2 + b2, kind: 'edge', from: 'cu:' + a2, to: to || 'cu:' + b2, cls: 'dp-alu busy' }, label ? { label, lx, ly, size: 15 } : {});
      const sch = (hot) => {
        const H = new Set(hot || []), items = [
          blk('ir', 0, 0, 80, 46, ['IR']), blk('opdec', 140, 0, 160, 46, ['4:16 decoder']), blk('logic', 400, -10, 170, 176, ['control', 'logic']),
          blk('sc', 0, 100, 80, 46, ['SC']), blk('tdec', 140, 100, 160, 46, ['4:16 decoder']), blk('flags', 405, 212, 160, 42, ['flags Z C N']),
          blk('out', 640, 56, 150, 46, ['control lines']),
        ];
        for (const it of items) if (H.has(it.key.slice(3))) it.cls += ' src';
        return items.concat([arrow('ir', 'opdec', 'opcode', 110, 8), arrow('opdec', 'logic', 'D0–D15', 350, 8, { x: 400, y: 23 }), arrow('sc', 'tdec', 'count', 110, 108), arrow('tdec', 'logic', 'T0–T15', 350, 108, { x: 400, y: 123 }), arrow('flags', 'logic', null, 0, 0, { x: 485, y: 166 }), arrow('logic', 'out')]);
      };
      const ey = 290;
      const eqOf = (u) => rows.filter((r) => r.ops.includes(u)).map((r) => r.cond);
      const eqText = (u, hotCond) => {
        const terms = eqOf(u);
        const lead = C.MICRO[u].rtl + ' = ';
        if (hotCond) return lead + hotCond + (terms.length > 1 ? ' + … (' + terms.length + ' terms)' : '');
        return lead + terms.slice(0, 2).join(' + ') + (terms.length > 2 ? ' + … (' + terms.length + ' terms)' : '');
      };
      const eqs = (active) => shown.map((u, k) => line('eq' + k, 0, ey + k * 26, eqText(u, active && active.ops.includes(u) ? active.cond : null), active && active.ops.includes(u) ? 'hot' : 'dim', 15));
      const F = new S.Frames();
      F.add({ items: sch(['opdec', 'tdec']).concat(eqs(null)), say: 'The control unit: a 4:16 decoder turns IR\'s opcode into D0..D15, the sequence counter SC and a second decoder give T0..T15, and the control logic combines them with the mode bits (I for indirect, M for immediate) and the flags into every control line.' });
      F.add({ items: sch(['logic']).concat(eqs(null)), say: 'Each micro-operation is switched on by an OR of products, one product for every place it is used: ' + shown.slice(0, 3).map((u) => C.MICRO[u].rtl + ' = ' + eqOf(u).join(' + ')).join('; ') + '. ' + rows.length + ' products in all.' });
      run.cycles.forEach((c, i) => {
        const act = rows.find((r) => c.info && r.cond === c.info.cond) || { ops: c.ops, cond: c.info ? c.info.cond : '' };
        F.add({ items: sch(['logic']).concat(eqs(act)), say: 'Cycle ' + (i + 1) + ', ' + (run.instrs[c.ins].text || '') + ': the product ' + act.cond + ' is 1, so ' + (c.rtl.join(', ') || 'nothing') + '.', meta: i === 3 && run.cycles[i + 1] ? { ask: true, cond: run.cycles[i + 1].info.cond, opts: [...new Set([run.cycles[i + 1].info.cond].concat(rows.filter((r) => r.T === run.cycles[i + 1].T).slice(0, 3).map((r) => r.cond)))] } : null });
      });
      F.add({ items: sch().concat(eqs(null)), say: 'Fast, since every line is two levels of logic from the decoders, but every new instruction means redesigning those equations. The microprogrammed unit keeps the same information in a memory instead.', mark: 'end' });
      return { frames: P13.big(F.list), def: { sections: [{ id: 'd', kind: 'table', title: 'Control functions (first rows)', colHead: ['when', 'do'], rows: rows.slice(0, 14).map((r) => [r.cond, r.rtl]) }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => fr[i].meta.opts, ask: 'Which product will be 1 in the next cycle?', answer: (fr, i) => fr[i].meta.cond, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'In a hard-wired control unit, T3·D1·M means…', options: ['the third instruction', 'timing step 3, opcode 1 (LDA), immediate mode', 'three bits of memory', 'a microinstruction'], answer: 1, why: 'A product of a timing signal, a decoded opcode and a mode bit.' },
      { q: 'AR ← PC is needed in T0 and T2 of every instruction, so its control function is…', options: ['T0 · T2', 'T0 + T2', 'D0', 'T1'], answer: 1, why: 'An OR of the two places it is used.' },
      { q: 'What resets the sequence counter?', options: ['a product that marks the last cycle of each routine', 'the clock', 'the ALU', 'nothing'], answer: 0, why: 'SC ← 0 is one more control function.' },
      { q: 'The main drawback of hard-wired control is…', options: ['it is slow', 'changing the instruction set means redesigning the logic', 'it needs a memory', 'it cannot branch'], answer: 1, why: 'The behaviour is frozen in gates.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------
  // Microprogrammed control
  // ---------------------------------------------------------------------------------------------------------
  S.topic({
    id: 'cpu-micro', family: 'p13-control', order: 40, title: 'Microprogrammed control',
    blurb: 'Keep the control functions in a memory: each word holds the micro-operations of one cycle in fields, a condition, and the address of the next word. A mapping table jumps from the opcode to its routine. Run it beside the hard-wired unit: the two agree cycle for cycle.',
    inputs: [{ id: 'prog', kind: 'choice', label: 'Program', def: 'jump', options: Object.entries(fetchProgs).map(([value, p]) => ({ value, label: p.label })) }],
    presets: Object.entries(fetchProgs).map(([value, p]) => ({ label: p.label, values: { prog: value } })),
    counters: [{ id: 'agree', label: 'cycles that agree' }],
    run(inp) {
      const C = Cpu(), mp = C.microprogram();
      const src = fetchProgs[inp.prog].src;
      const runM = P13.run(src, { control: 'micro', from: 3 }), runH = P13.run(src, { from: 3 });
      const cm = (car, next) => {
        const rowsIdx = mp.words.map((w) => w.addr);
        return K().table.draw({ x: 0, y: 0, prefix: 'cm', colHead: ['addr', 'label', 'F1 F2 F3 CD BR AD', 'does'], rows: rowsIdx.map((a) => { const w = mp.words[a]; return [String(a), w.label || '', w.binary, w.text.length > 44 ? w.text.slice(0, 42) + '…' : w.text]; }), mono: true, size: 14, minH: 28, ch: 28, maxRows: 11, focus: [car, 0], hot: [[car, 0], [car, 1], [car, 2], [car, 3]], act: next !== null && next !== undefined && next !== car ? [[next, 0]] : [], title: 'control memory (' + mp.words.length + ' words × ' + mp.width + ' bits)' });
      };
      const regBox = (rM, rH, x, y) => {
        const items = [{ key: 'rb:t', kind: 'text', x, y: y - 14, text: 'registers: microprogrammed | hard-wired', cls: 'title' }];
        ['PC', 'AR', 'IR', 'AC', 'DR', 'SP'].forEach((r, k) => {
          const same = rM[r] === rH[r];
          items.push({ key: 'rb:' + r, kind: 'cell', x, y: y + k * 34, w: 220, h: 32, rx: 0, text: r + '  ' + hex(rM[r]) + ' | ' + hex(rH[r]), size: 15, cls: 'dp-mem' + (same ? '' : ' bad') });
        });
        return items;
      };
      const F = new S.Frames(['agree']);
      const t0 = cm(0, null);
      const rx = t0.box.x + t0.box.w + 40;
      F.add({ items: t0.items.concat(regBox({ PC: 0, AR: 0, IR: 0, AC: 0, DR: 0, SP: 0 }, { PC: 0, AR: 0, IR: 0, AC: 0, DR: 0, SP: 0 }, rx, 30)), say: mp.say + ' The control address register CAR starts at 0, the first word of the fetch routine.' });
      let agree = 0;
      runM.cycles.forEach((c, i) => {
        const h = runH.cycles[i];
        const same = h && ['PC', 'AR', 'IR', 'AC', 'DR', 'SP'].every((r) => c.after[r] === h.after[r]);
        if (same) agree++;
        F.set('agree', agree);
        const w = mp.words[c.info.CAR];
        const nxt = c.info.next === null || c.info.next === undefined ? mp.map[(c.after.IR >> 4 << 2) | (c.after.IR & 3)] : c.info.next;
        const how = w.br === 'MAP' ? 'BR = MAP: the next address comes from the mapping table, indexed by the opcode and mode of IR = ' + hex(c.after.IR) + ': word ' + nxt + '.' : w.cd === 'U' ? (w.ad === 0 ? 'AD = 0: back to the fetch routine.' : 'Unconditional: CAR ← ' + w.ad + '.') : 'Condition ' + w.cd + ' = ' + c.before[w.cd] + ': ' + (c.before[w.cd] ? 'CAR ← ' + w.ad : 'CAR ← CAR + 1 = ' + (w.addr + 1)) + '.';
        F.add({ items: cm(c.info.CAR, nxt).items.concat(regBox(c.after, h ? h.after : c.after, rx, 30)), say: 'CAR = ' + c.info.CAR + (w.label ? ' (' + w.label + ')' : '') + ', word ' + w.binary + ': ' + (c.rtl.join(', ') || 'no operation') + '. ' + how + (same ? ' Same registers as the hard-wired unit.' : ' The units disagree!'), meta: i === 1 ? { ask: true, next: String(runM.cycles[i + 1].info.CAR), opts: [...new Set([String(runM.cycles[i + 1].info.CAR), '0', '3', String(c.info.CAR + 1)])] } : null });
      });
      F.add({ items: cm(0, null).items.concat(regBox(runM.cycles[runM.cycles.length - 1].after, runH.cycles[runH.cycles.length - 1].after, rx, 30)), say: agree + ' of ' + runM.cycles.length + ' cycles agree with the hard-wired unit, register for register. Changing an instruction now means changing words in the control memory, not rewiring logic; the price is a memory read in every cycle.', mark: 'end' });
      return { frames: P13.big(F.list), def: { sections: [{ id: 'd', kind: 'math', title: 'A microinstruction', text: ['F1: a bus transfer (' + mp.format.F1 + ' bits)', 'F2: PC or SP counting (' + mp.format.F2 + ')', 'F3: the ALU, or halt (' + mp.format.F3 + ')', 'CD: condition U, Z, C, N', 'BR: JMP (to AD if CD) or MAP', 'AD: next address (' + mp.format.AD + ' bits)'].join('\n') }] } };
    },
    predict: [{ at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => fr[i].meta.opts, ask: 'Which control-memory address will CAR hold next?', answer: (fr, i) => fr[i].meta.next, explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'What does the control address register (CAR) hold?', options: ['the address of the next instruction in main memory', 'the address of the current word of the control memory', 'the opcode', 'the stack pointer'], answer: 1, why: 'It is the microprogram\'s program counter.' },
      { q: 'How does the microprogram get from the fetch routine to the right instruction routine?', options: ['by counting', 'through the mapping table, indexed by the opcode (and mode)', 'by a hard-wired jump', 'it does not'], answer: 1, why: 'BR = MAP.' },
      { q: 'A word with CD = Z and AD = 40 means…', options: ['always go to 40', 'go to 40 if Z = 1, else to the next word', 'set Z', 'halt if Z = 1'], answer: 1, why: 'A conditional branch in the microprogram.' },
      { q: 'Compared with hard-wired control, microprogrammed control is…', options: ['faster', 'easier to change, at the cost of a control-memory read per cycle', 'impossible to change', 'the same thing'], answer: 1, why: 'The behaviour lives in a memory.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
