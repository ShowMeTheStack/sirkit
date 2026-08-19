// Part 1, a first look at storage: registers as rows of bit cells, a parallel transfer R2 ← R1 on one clock edge,
// and serial transfers and shifts that move one bit per clock.
(function (S) {
  'use strict';
  const K = S.Kit, N = K.num;

  S.family({ id: 'p1-storage', part: 'numbers', order: 40, title: 'Binary storage and registers', blurb: 'A register holds a word of bits until a clock edge loads a new one. Transfers between registers are the first step towards a processor.' });

  const OPS = {
    copy: { label: 'R2 ← R1 (parallel)', say: 'all bits at once, on one clock edge' },
    serial: { label: 'R1 → R2 (serial, one bit per clock)', say: 'one bit per clock, through a single wire' },
    shl: { label: 'R1 ← shl R1', say: 'every bit moves one place left; a 0 comes in on the right' },
    shr: { label: 'R1 ← shr R1', say: 'every bit moves one place right; a 0 comes in on the left' },
    rol: { label: 'R1 ← rotate left R1', say: 'every bit moves one place left; the bit that falls off comes back on the right' },
  };
  S.topic({
    id: 'register-transfer', family: 'p1-storage', order: 10, title: 'Registers and register transfer',
    blurb: 'A register is a row of flip-flops sharing a clock. On each edge it takes in a new word: from another register all at once, or one bit at a time through a shift.',
    inputs: [
      { id: 'r1', kind: 'string', label: 'R1 holds', def: '10110010', alphabet: '01', min: 4, max: 8 },
      { id: 'op', kind: 'choice', label: 'Transfer', def: 'serial', options: Object.entries(OPS).map(([value, o]) => ({ value, label: o.label })) },
      { id: 'clocks', kind: 'number', label: 'Clock edges', def: 8, min: 1, max: 8 },
    ],
    presets: [
      { label: 'Serial: eight clocks to move a byte', values: { r1: '10110010', op: 'serial', clocks: 8 } },
      { label: 'Parallel: one clock', values: { r1: '10110010', op: 'copy', clocks: 1 } },
      { label: 'Shift left twice (× 4)', values: { r1: '00010110', op: 'shl', clocks: 2 } },
      { label: 'Shift right three times', values: { r1: '11001000', op: 'shr', clocks: 3 } },
      { label: 'Rotate a nibble round', values: { r1: '1000', op: 'rol', clocks: 4 } },
    ],
    run(inp) {
      const n = inp.r1.length, op = inp.op, CW = op === 'serial' ? 40 : 46, Y2 = op === 'serial' ? 0 : 170, X2 = op === 'serial' ? n * CW + 84 : 0;
      // each bit is a token with a stable identity, so it can be followed as it moves
      let R1 = [...inp.r1].map((b, i) => ({ id: 'b' + i, b })), R2 = Array.from({ length: n }, (_, i) => ({ id: 'z' + i, b: '0' }));
      let fresh = 0;
      const F = new S.Frames();
      const both = op === 'copy' || op === 'serial';
      const draw = (o) => {
        const it = [];
        const reg = (name, x, y, cells, lit) => {
          it.push({ key: 'box:' + name, kind: 'region', x: x - 10, y: y - 10, w: n * CW + 14, h: 62, cls: 'r' + (name === 'R1' ? 0 : 1) + (lit ? ' hot' : '') });
          it.push(N.label('name:' + name, x + (n * CW) / 2 - 3, y - 22, name, 'strong', { anchor: 'middle', size: 17 }));
          cells.forEach((c, i) => it.push(N.cell('bit:' + c.id, x + i * CW, y, CW - 6, 42, c.b, 'mono' + (c.b === '1' ? ' n-one' : '') + (o.moved && o.moved.has(c.id) ? ' hot' : ''), { size: 20, enter: c.src ? 'from' : c.id[0] === 'n' ? 'drop' : 'fade', src: c.src ? 'bit:' + c.src : undefined })));
          for (let i = 0; i < n; i++) it.push(N.label('idx:' + name + ':' + i, x + i * CW + (CW - 6) / 2, y + 66, String(n - 1 - i), 'n-bits', { anchor: 'middle', size: 11 }));
        };
        reg('R1', 0, 0, R1, o.lit === 'R1');
        if (both) reg('R2', X2, Y2, R2, o.lit === 'R2');
        if (op === 'copy') for (let i = 0; i < n; i++) it.push({ key: 'bus:' + i, kind: 'line', x1: i * CW + (CW - 6) / 2, y1: 84, x2: i * CW + (CW - 6) / 2, y2: Y2 - 42, cls: 'n-bus' + (o.lit ? ' hot' : '') });
        if (op === 'serial') it.push({ key: 'wire', kind: 'edge', from: { x: n * CW + 6, y: 21 }, to: { x: X2 - 14, y: 21 }, cls: o.lit ? 'hot' : '', label: 'wire', lx: n * CW + 42, ly: -8, size: 13 });
        const cx = both ? X2 + n * CW - 92 : n * CW - 92, cy = both ? Y2 + 94 : 94;
        it.push(N.cell('clk', cx, cy, 92, 34, 'clock ' + o.t, 'mono ' + (o.lit ? 'hot' : 'n-key'), { size: 15 }));
        return it;
      };
      F.add({ items: draw({ t: 0 }), say: 'R1 holds ' + inp.r1 + (both ? ' and R2 holds ' + '0'.repeat(n) : '') + '. Each cell is one flip-flop; nothing changes until a clock edge. Transfer: ' + OPS[op].label + ', ' + OPS[op].say + '.', meta: { ask: true } });
      for (let t = 1; t <= inp.clocks; t++) {
        const moved = new Set();
        let say;
        if (op === 'copy') {
          R2 = R1.map((c) => ({ id: 'c' + t + c.id, b: c.b, src: c.id }));
          R2.forEach((c) => moved.add(c.id));
          say = 'Clock edge ' + t + ': every cell of R2 loads the bit on its wire from R1 at the same instant: R2 = ' + R2.map((c) => c.b).join('') + '. R1 keeps its value — a transfer copies.';
        } else if (op === 'serial') {
          const out = R1[n - 1];
          R1 = [{ id: 'n' + fresh++, b: '0' }].concat(R1.slice(0, n - 1));
          R2 = [out].concat(R2.slice(0, n - 1));
          moved.add(out.id);
          say = 'Clock edge ' + t + ': both registers shift right; the bit ' + out.b + ' leaving R1 enters R2 on the left. R1 = ' + R1.map((c) => c.b).join('') + ', R2 = ' + R2.map((c) => c.b).join('') + '.' + (t === n ? ' After ' + n + ' clocks the whole word has crossed over.' : '');
        } else if (op === 'shl') {
          const lost = R1[0];
          R1 = R1.slice(1).concat([{ id: 'n' + fresh++, b: '0' }]);
          R1.forEach((c) => moved.add(c.id));
          say = 'Clock edge ' + t + ': shift left; ' + lost.b + ' falls off the left end. R1 = ' + R1.map((c) => c.b).join('') + ' = ' + parseInt(R1.map((c) => c.b).join(''), 2) + (lost.b === '0' ? ', twice what it was.' : ' (a 1 was lost, so this is no longer double).');
        } else if (op === 'shr') {
          const lost = R1[n - 1];
          R1 = [{ id: 'n' + fresh++, b: '0' }].concat(R1.slice(0, n - 1));
          R1.forEach((c) => moved.add(c.id));
          say = 'Clock edge ' + t + ': shift right; ' + lost.b + ' falls off the right end. R1 = ' + R1.map((c) => c.b).join('') + ' = ' + parseInt(R1.map((c) => c.b).join(''), 2) + ' (halved, rounding down).';
        } else {
          const top = R1[0];
          R1 = R1.slice(1).concat([top]);
          moved.add(top.id);
          say = 'Clock edge ' + t + ': rotate left; the leftmost bit ' + top.b + ' wraps round to the right end. R1 = ' + R1.map((c) => c.b).join('') + '.' + (t % n === 0 ? ' After ' + n + ' rotations the word is back where it started.' : '');
        }
        F.add({ items: draw({ t, lit: op === 'copy' || op === 'serial' ? 'R2' : 'R1', moved }), say });
      }
      F.add({ items: draw({ t: inp.clocks }), say: op === 'copy' ? 'One clock moved ' + n + ' bits over ' + n + ' wires.' : op === 'serial' ? inp.clocks + ' clock' + (inp.clocks === 1 ? '' : 's') + ' over one wire moved ' + inp.clocks + ' bit' + (inp.clocks === 1 ? '' : 's') + ': serial transfer trades time for wires.' : 'R1 = ' + R1.map((c) => c.b).join('') + ' after ' + inp.clocks + ' clock' + (inp.clocks === 1 ? '' : 's') + '.', mark: 'result' });
      return { frames: F.list, def: N.def(['Register transfer', ['R2 ← R1: on the clock edge, R2 loads R1', 'parallel: n wires, 1 clock', 'serial: 1 wire, n clocks', 'shift left = × 2, shift right = ÷ 2 (unsigned)']]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, once: true, pick: 'option', ask: (fr, i, inp) => 'How many clock edges does it take to move all ' + inp.r1.length + ' bits from R1 to R2 serially?', options: (fr, i, inp) => ['1', String(inp.r1.length / 2), String(inp.r1.length), String(inp.r1.length * 2)], answer: (fr, i, inp) => String(inp.r1.length), explain: () => 'One bit crosses the single wire on each clock edge.' },
    ],
    quiz: [
      { q: 'What does R2 ← R1 do to R1?', options: ['Clears it', 'Nothing: R1 keeps its value', 'Shifts it', 'Swaps it with R2'], answer: 1, why: 'A transfer copies; the source is unchanged.' },
      { q: 'Shifting 00010110 left once gives', options: ['00101100', '00001011', '10001011', '00010111'], answer: 0, why: 'Every bit one place left, a 0 in on the right: 22 × 2 = 44.' },
      { q: 'A serial transfer of 16 bits needs', options: ['1 clock and 16 wires', '16 clocks and 1 wire', '16 clocks and 16 wires', '4 clocks'], answer: 1, why: 'One bit per clock over one wire.' },
      { q: 'When does a register take in new bits?', options: ['Whenever its inputs change', 'On a clock edge', 'Only at power-up', 'When it is read'], answer: 1, why: 'The flip-flops sample their inputs on the clock edge and hold in between.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
