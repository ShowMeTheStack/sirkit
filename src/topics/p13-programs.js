// Part 13, programs: a whole program running on the machine, the current line of the listing lit; the first
// instructions shown cycle by cycle down to the bus transfers, the rest an instruction at a time, the output and
// the data in memory changing as it goes.
(function (S) {
  'use strict';
  const P13 = S.P13, Cpu = () => S.Cpu, CK = () => S.Kit.cpu;
  const hex = (v) => P13.hex(v);

  S.topic({
    id: 'cpu-programs', family: 'p13-programs', order: 10, title: 'Programs running, line by line',
    blurb: 'Assemble a program, load it, and run it: the listing shows which line is executing, the datapath shows the registers, the memory word at AR and the bus. The first instructions go a clock cycle at a time; after that, an instruction at a time.',
    inputs: [
      { id: 'p', kind: 'choice', label: 'Program', def: 'sum', options: P13.programOptions() },
      { id: 'detail', kind: 'number', label: 'Instructions shown cycle by cycle', def: 2, min: 0, max: 6 },
    ],
    presets: [
      { label: 'Sum of an array', values: { p: 'sum', detail: 2 } },
      { label: 'Multiply by shift and add', values: { p: 'multiply', detail: 1 } },
      { label: 'Find the maximum', values: { p: 'max', detail: 1 } },
      { label: 'Count the ones (a subroutine)', values: { p: 'ones', detail: 0 } },
      { label: 'Input and output', values: { p: 'io', detail: 0 } },
    ],
    counters: [{ id: 'ins', label: 'instructions' }, { id: 'cyc', label: 'clock cycles' }],
    run(inp) {
      const ex = Cpu().programs[inp.p];
      const run = P13.run(ex.src, { input: ex.input });
      const L = run.prog.listing;
      const lines = L.map((l) => ({ addr: l.bytes.length ? l.addr : null, bytes: l.bytes, text: l.text }));
      // the datapath on top, a window of the listing under it, the current line in the middle
      const dx = 0;
      const dTop = CK().datapath({ regs: {}, mem: run.prog.mem, x: 0, y: 20 }).box;
      const ls = (hot) => CK().listing({ x: dTop.x + dTop.w + 50, y: 50, lines, hot, maxRows: 11, title: ex.title });
      const outLine = (o) => ({ key: 'out', kind: 'text', x: dx, y: -2, text: 'output: ' + (o.length ? o.join(', ') : '(nothing yet)'), cls: 'fl-line mono' + (o.length ? ' good' : ''), size: 15 });
      const dpAt = (i, o) => { const d = P13.dp(run, i, o); for (const it of d.items) { if (it.x !== undefined) it.x += dx; if (it.x1 !== undefined) { it.x1 += dx; it.x2 += dx; } if (it.from && typeof it.from === 'object') it.from = { x: it.from.x + dx, y: it.from.y }; if (it.to && typeof it.to === 'object') it.to = { x: it.to.x + dx, y: it.to.y }; } return d.items; };
      const F = new S.Frames(['ins', 'cyc']);
      // a line as written in the source (names, not the numbers they stand for), without its label or comment
      const srcText = (i) => L[i].text.replace(/\s*;.*$/, '').replace(/^\s*[A-Za-z_]\w*\s*:/, '').replace(/\s+/g, ' ').trim();
      const d0 = CK().datapath({ regs: { PC: run.prog.start, AR: 0, IR: 0, AC: 0, DR: 0, SP: 0, Z: 0, C: 0, N: 0 }, mem: run.prog.mem, names: P13.names(run.prog), x: dx, y: 20 });
      F.add({ items: ls(null).items.concat(d0.items, [outLine([])]), say: ex.say + ' ' + run.prog.size + ' bytes, loaded at ' + hex(run.prog.start) + '. It will run ' + run.instrs.length + ' instructions in ' + run.cycles.length + ' clock cycles.' });
      const total = run.instrs.length;
      const detailN = Math.min(inp.detail, total);
      // the detailed instructions, then every one while there is room; a long run skips to its last few
      const rest = total - detailN, keepHead = rest <= 56 ? rest : 40, keepTail = rest <= 56 ? 0 : 8;
      let shownIns = 0, cyc = 0;
      run.instrs.forEach((ins, k) => {
        const lineIdx = ins.line;
        if (k < detailN) {
          ins.cycles.forEach((ci) => {
            cyc++;
            F.set('cyc', cyc);
            const c = run.cycles[ci];
            F.add({ items: ls(lineIdx).items.concat(dpAt(ci, { y: 20 }), [outLine(c.output)]), say: (c.T === 0 ? 'Line "' + L[lineIdx].text.replace(/\s*;.*$/, '').replace(/\s+/g, ' ').trim() + '" at ' + hex(ins.addr) + '. ' : '') + P13.say(c), meta: k === 0 && c.T === 2 ? { askIns: true } : null });
          });
          F.set('ins', ++shownIns);
          return;
        }
        cyc += ins.cycles.length;
        shownIns++;
        const j = k - detailN;
        const last = run.cycles[ins.cycles[ins.cycles.length - 1]];
        if (j >= keepHead && j < rest - keepTail) {
          if (j === keepHead) F.add({ items: ls(lineIdx).items.concat(dpAt(ins.cycles[ins.cycles.length - 1], { y: 20, ops: [] }), [outLine(last.output)]), say: 'The loop goes on the same way; skipping ' + (rest - keepTail - keepHead) + ' instructions to the last few.' });
          return;
        }
        F.set('ins', shownIns); F.set('cyc', cyc);
        const flags = 'Z ' + last.after.Z + ' C ' + last.after.C;
        const wrote = last.changes.filter((q) => q.reg.startsWith('M['));
        F.add({ items: ls(lineIdx).items.concat(dpAt(ins.cycles[ins.cycles.length - 1], { y: 20, ops: [] }), [outLine(last.output)]), say: hex(ins.addr) + ' ' + srcText(lineIdx) + ' (' + ins.cycles.length + ' cycles): AC = ' + hex(last.after.AC) + ', PC = ' + hex(last.after.PC) + ', ' + flags + '.' + (wrote.length ? ' Memory ' + wrote.map((q) => q.reg + ' = ' + hex(q.to)).join(', ') + '.' : '') + (ins.text.startsWith('OUT') ? ' Output ' + last.output[last.output.length - 1] + '.' : ''), meta: j === 2 ? { askOut: true, out: String(ex.answer[ex.answer.length - 1]) } : null });
      });
      const ok = ex.expect({ output: run.output });
      F.add({ items: ls(run.instrs[total - 1].line).items.concat(dpAt(run.cycles.length - 1, { y: 20, ops: [] }), [outLine(run.output)]), say: 'Halted after ' + total + ' instructions and ' + run.cycles.length + ' clock cycles. Output: ' + run.output.join(', ') + (ok ? ', as expected.' : ', which is not what was expected!') + ' That is ' + (run.cycles.length / total).toFixed(1) + ' cycles per instruction on average: the machine runs one instruction for every ' + (run.cycles.length / total).toFixed(1) + ' ticks of its clock.', mark: 'end' });
      return { frames: P13.narrow(F.list, { x: d0.box.x, y: -24, w: d0.box.w, h: d0.box.y + d0.box.h + 24 }), def: { sections: [{ id: 'd', kind: 'math', title: ex.title, text: ex.src.split('\n').filter((l) => l.trim() && !/^\s*;/.test(l)).slice(0, 26).map((l) => l.replace(/\s*;.*$/, '').replace(/\s+/g, ' ').trim()).join('\n') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.askIns, pick: 'option', options: ['the opcode in IR', 'the value in AC', 'the flags', 'the bus'], ask: 'T2: the control unit now decodes. What does it decode?', answer: 'the opcode in IR', explain: (fr, i) => fr[i + 1].say, once: true },
      { at: (f) => f.meta && f.meta.askOut, pick: 'option', options: (fr, i) => [...new Set([fr[i].meta.out, String(+fr[i].meta.out + 1), String(Math.max(0, +fr[i].meta.out - 7)), '0'])], ask: 'Read the program. What will its last output be?', answer: (fr, i) => fr[i].meta.out, explain: (fr) => fr[fr.length - 1].say, once: true },
    ],
    quiz: [
      { q: 'The sum program reads the array through a pointer. Which addressing mode does that use?', options: ['immediate', 'direct', 'indirect', 'none'], answer: 2, why: 'ADD @ptr: the pointer in memory holds the address of the byte.' },
      { q: 'In the multiply program, why does STA y not disturb the carry tested by JC?', options: ['STA sets C', 'STA does not change the flags', 'JC ignores C', 'y is in AC'], answer: 1, why: 'Only arithmetic, logic and shifts set flags.' },
      { q: 'How does the maximum program decide that a byte is at least the maximum so far?', options: ['SUB sets C = 1 when there is no borrow', 'it compares with AND', 'it uses JZ only', 'it shifts'], answer: 0, why: 'AC − max with no borrow means AC ≥ max.' },
      { q: 'A program of 40 instructions averaging 5 cycles each, on a 1 MHz clock, takes…', options: ['40 µs', '200 µs', '5 µs', '1 ms'], answer: 1, why: '200 cycles at 1 µs each.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
