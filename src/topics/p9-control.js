// Part 9, datapath and controller: splitting a chart into a datapath (registers and what feeds them) and a
// controller (the states, with a control signal for every transfer and the status signals coming back), building
// the controller three ways (state register and decoder, one flip-flop per state, a sequence counter), and the
// same design written as Verilog beside its chart.
(function (S) {
  'use strict';
  const K = S.Kit, P9 = S.P9, Geo = S.geom;
  const A = () => S.Asm;

  S.family({ id: 'p9-control', part: 'rtl', order: 20, title: 'Datapath and controller', blurb: 'Every design splits into registers that do the work and a controller that says when. Build the controller three ways, and write the whole design in Verilog.' });

  const CH = { multiplier: 'Shift-and-add multiplier', gcd: 'GCD engine', vending: 'Vending with a SUM register', divider: 'Restoring divider', traffic: 'Traffic lights' };
  const chartInput = (keys, def) => ({ id: 'c', kind: 'choice', label: 'Design', def, options: keys.map((k) => ({ value: k, label: CH[k] })) });
  const pr = (t) => String(t).replace(/'/g, '′');

  // ---------------------------------------------------------------------------------------------------
  // Datapath and controller
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'datapath-controller', family: 'p9-control', order: 10, title: 'Splitting a design: datapath and controller',
    blurb: 'Read the chart twice. Every transfer becomes a control signal from the controller to a register of the datapath, true in the states (and paths) where the chart does it. Every decision becomes a status signal from the datapath back to the controller.',
    inputs: [chartInput(['multiplier', 'gcd', 'vending', 'divider'], 'multiplier')],
    presets: ['multiplier', 'gcd', 'vending', 'divider'].map((k) => ({ label: CH[k], values: { c: k } })),
    counters: [{ id: 'ctl', label: 'control signals' }, { id: 'stat', label: 'status signals' }],
    camera: 'follow',
    run(inp) {
      const ch = P9.chart(inp.c), k = A().controller(ch, 'decoder');
      const Fr = new S.Frames(['ctl', 'stat']);
      const lay = K.asm.layout(ch);
      const draw = (o) => K.asm.draw(ch, Object.assign({ prefix: 'asm' }, o || {})).items;
      const under = (lines, cls) => P9.lines(lines.map((t) => ({ text: t, cls })), lay.box.x + lay.box.w + 40, lay.box.y + 50, { prefix: 'nt', size: 15, lh: 24 }).items;
      Fr.add({ items: draw(), say: 'The ' + ch.name + ' chart. The datapath holds ' + Object.entries(ch.registers).map(([r, w]) => r + ' (' + w + ' bit' + (w > 1 ? 's' : '') + ')').join(', ') + '; the controller has to step through ' + k.states.join(', ') + '.' });
      const decs = ch.boxes.filter((b) => b.kind === 'decision').map((b) => b.id);
      const stat = k.signals.map((s) => s + (ch.status[s] ? ' = (' + ch.status[s] + ')   from the datapath' : '   an input'));
      Fr.set('stat', k.signals.filter((s) => ch.status[s]).length);
      Fr.add({ items: draw({ hotBoxes: decs }).concat(under(stat)), say: 'Every decision tests a signal the controller must receive: ' + k.signals.map((s) => (ch.status[s] ? s + ' (status: ' + ch.status[s] + ')' : s + ' (an input)')).join(', ') + '. Comparisons and bit tests are made in the datapath; the controller only sees one bit each.' });
      const others = (c) => k.controls.filter((x) => x !== c).map((x) => x.eq.split(' = ')[1].split('   ')[0]);
      for (const c of k.controls) {
        const boxes = ch.boxes.filter((b) => (b.actions || []).some((a) => a.replace(/\s+/g, ' ') === c.text || (c.output && a === c.name))).map((b) => b.id);
        const rhs = c.eq.split(' = ')[1].split('   ')[0];
        if (!c.output) Fr.count('ctl');
        Fr.add({ items: draw({ hotBoxes: boxes }).concat(under([pr(c.eq)], 'hot')), say: (c.output ? 'The output ' + c.name : 'Control signal ' + c.name + ' (' + c.text + ')') + ' is 1 ' + c.terms.map((t) => 'in ' + t.state + (t.cond.length ? ' when ' + t.cond.map((q) => q.name + ' = ' + q.value).join(' and ') : '')).join(', or ') + ': ' + pr(c.eq.split('   ')[0]) + '.', meta: c.output ? null : { ask: true, name: c.name, text: c.text, ans: pr(rhs), opts: [...new Set([pr(rhs)].concat(others(c).map(pr)))].slice(0, 4) } });
      }
      // the block diagram
      const ctls = k.controls.filter((c) => !c.output), outs = k.controls.filter((c) => c.output);
      const rows = Math.max(ctls.length + k.signals.filter((s) => ch.status[s]).length, 4);
      const H = rows * 38 + 70, GX = 430, items = [];
      items.push({ key: 'ctrl', kind: 'cell', x: 0, y: 0, w: 210, h: H, rx: 10, lines: ['controller', '', ...k.states.map((s, i) => s + ' = ' + k.codes[s])], cls: 'dp-box', size: 14 });
      const regLines = Object.keys(ch.registers).map((r) => r + ' ← ' + [...new Set(ctls.filter((c) => new RegExp('(^|[{ ,])' + r + '([} ,]|$)').test(c.text.split('←')[0])).map((c) => c.name))].join(', '));
      items.push({ key: 'dpath', kind: 'cell', x: 210 + GX, y: 0, w: Math.max(240, ...regLines.map((l) => Geo.textWidth(l, 14, { mono: true }) + 30)), h: H, rx: 10, lines: ['datapath', ''].concat(regLines), cls: 'dp-box', size: 14 });
      ctls.forEach((c, i) => {
        const y = 50 + i * 38;
        items.push({ key: 'ca:' + c.name, kind: 'edge', from: { x: 210, y }, to: { x: 210 + GX, y }, cls: 'ctl' });
        items.push({ key: 'cl:' + c.name, kind: 'text', x: 210 + GX / 2, y: y - 9, text: c.name + ': ' + c.text, anchor: 'middle', cls: 'ctl', size: 13 });
      });
      k.signals.filter((s) => ch.status[s]).forEach((s, i) => {
        const y = 50 + (ctls.length + i) * 38;
        items.push({ key: 'sa:' + s, kind: 'edge', from: { x: 210 + GX, y }, to: { x: 210, y }, cls: 'stat' });
        items.push({ key: 'sl:' + s, kind: 'text', x: 210 + GX / 2, y: y - 9, text: s + ' = (' + ch.status[s] + ')', anchor: 'middle', cls: 'stat', size: 13 });
      });
      const ins = k.signals.filter((s) => !ch.status[s]);
      ins.forEach((s, i) => {
        const y = H - 40 - i * 34;
        items.push({ key: 'ia:' + s, kind: 'edge', from: { x: -110, y }, to: { x: 0, y }, cls: 'stat' });
        items.push({ key: 'il:' + s, kind: 'text', x: -60, y: y - 9, text: s, anchor: 'middle', cls: 'stat', size: 13 });
      });
      outs.forEach((c, i) => {
        const y = 40 + i * 34;
        items.push({ key: 'oa:' + c.name, kind: 'edge', from: { x: 0, y }, to: { x: -110, y }, cls: 'ctl' });
        items.push({ key: 'ol:' + c.name, kind: 'text', x: -60, y: y - 9, text: c.name, anchor: 'middle', cls: 'ctl', size: 13 });
      });
      Fr.add({ items, say: 'The whole design: ' + ctls.length + ' control signals go right, into the registers\' load and select inputs; ' + k.signals.filter((s) => ch.status[s]).length + ' status signals come back; ' + (ins.length ? ins.join(', ') + ' come' + (ins.length === 1 ? 's' : '') + ' in from outside; ' : '') + (outs.length ? outs.map((c) => c.name).join(', ') + ' go' + (outs.length === 1 ? 'es' : '') + ' out. ' : '') + 'In the datapath each register gets a multiplexer choosing among its transfers, and holds its value when none is active.' });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'The split', text: ['datapath: registers, adders,', '  comparators, multiplexers', 'controller: the states', 'transfer X ← ... in state S', '  → control signal = T_S (· cond)', 'decision on a register', '  → status signal back'].join('\n') }] };
      return { frames: P9.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: (fr, i) => fr[i].meta.opts, ask: (fr, i) => 'Before reading on: when must ' + fr[i].meta.name + ' (' + fr[i].meta.text + ') be 1?', answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i].say, once: true },
    ],
    quiz: [
      { q: 'A status signal is…', options: ['a signal from the controller to a register', 'a one-bit fact about the datapath (such as P = 0) sent to the controller', 'the clock', 'a state code'], answer: 1, why: 'Decisions in the chart need it.' },
      { q: 'A transfer in a conditional box under decision Q0 in state ADD gets the control signal…', options: ['T_ADD', 'T_ADD · Q0', 'Q0', 'T_ADD + Q0'], answer: 1, why: 'It happens only in ADD and only on the Q0 = 1 path.' },
      { q: 'When no control signal of a register is active, the register…', options: ['clears', 'holds its value', 'loads the bus', 'toggles'], answer: 1, why: 'Its load is off (or its multiplexer feeds it back).' },
      { q: 'Comparisons such as X < Y are made…', options: ['in the controller', 'in the datapath, which sends one bit to the controller', 'by the clock', 'nowhere'], answer: 1, why: 'The controller only reads status bits.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Three ways to build the controller
  // ---------------------------------------------------------------------------------------------------
  const METHOD = { decoder: 'state register and decoder', onehot: 'one flip-flop per state', counter: 'sequence counter' };
  /**
   * The structure of a controller as blocks: the next-state logic, the state register (or the sequence counter),
   * the decoder (not for one-hot), the control logic, the status signals along the top and the state lines fed
   * back along the bottom. k: A.controller's result.
   */
  function controllerBlocks(ch, k, method) {
    const items = [], LH = 21, FS = 14;
    const mono = (t) => Geo.textWidth(t, FS, { mono: true });
    const box = (key, x, y, w, h, title, lines, cls) => { items.push({ key, kind: 'cell', x, y, w, h, rx: 8, lines: [title, ''].concat(lines), cls: 'mono dp-blk ' + (cls || ''), size: FS }); };
    const arrow = (key, x1, y1, x2, y2, cls) => items.push({ key, kind: 'edge', from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, cls: 'dp-arrow ' + (cls || '') });
    const label = (key, x, y, text, anchor, cls) => items.push({ key, kind: 'text', x, y, text, anchor: anchor || 'middle', cls: 'mono dp-sig ' + (cls || ''), size: 14 });
    // a long equation goes on over more lines, broken after a +, so the block stays narrow
    const wrapEq = (t) => { const out = []; let line = ''; for (const part of t.split(/(?<= \+) /)) { if (line && (line + ' ' + part).length > 28) { out.push(line); line = '   ' + part; } else line = line ? line + ' ' + part : part; } out.push(line); return out; };
    const nsLines = k.equations.flatMap((e) => wrapEq(pr(e.text)));
    const ctLines = k.controls.map((c) => pr(c.eq.split('   ')[0]));
    const nFF = k.flipflops, tn = k.states.map(k.tname);
    // the state register (or counter) and what feeds it
    const regIns = method === 'counter' ? k.equations.map((e) => e.name) : method === 'onehot' ? k.states.map((s) => 'D_' + s) : k.equations.map((e) => e.name);
    const cellH = 34, gap = 12;
    const stackH = method === 'counter' ? Math.max(regIns.length * 26 + 30, k.states.length * 24 + 30) : nFF * cellH + (nFF - 1) * gap;
    const wN = Math.max(150, ...nsLines.map(mono)) + 24, hN = Math.max(nsLines.length * LH + 50, stackH + 30);
    const y0 = 60, xN = 30, cy = y0 + hN / 2;
    box('ns', xN, y0, wN, hN, 'next-state logic', nsLines);
    const x1 = xN + wN + 80;
    const outsY = [];
    if (method === 'counter') {
      const top = cy - stackH / 2;
      box('sc', x1, top, 120, stackH, 'sequence', ['counter']);
      regIns.forEach((n, i) => { const y = top + 22 + (i + 0.5) * ((stackH - 30) / regIns.length); arrow('in:' + n, xN + wN, y, x1, y); label('inl:' + n, xN + wN + 40, y - 6, n); });
    } else {
      const top = cy - stackH / 2;
      for (let i = 0; i < nFF; i++) {
        const y = top + i * (cellH + gap), nm = method === 'onehot' ? 'Y_' + k.states[i] : 'Q' + (nFF - 1 - i);
        items.push({ key: 'ff:' + i, kind: 'cell', x: x1, y, w: 96, h: cellH, rx: 4, text: nm, cls: 'mono asm-reg', size: FS });
        arrow('d:' + i, xN + wN, y + cellH / 2, x1, y + cellH / 2);
        label('dl:' + i, xN + wN + 40, y + cellH / 2 - 6, regIns[i]);
        outsY.push(y + cellH / 2);
      }
    }
    let xT = x1 + (method === 'counter' ? 120 : 96), tY;
    const nS = k.states.length;
    if (method !== 'onehot') {
      const xd = xT + 70, hd = Math.max(nS * 26 + 30, stackH), topd = cy - hd / 2;
      box('dec', xd, topd, 96, hd, 'decoder', [nFF + ' to ' + (1 << nFF)]);
      if (method === 'counter') { arrow('cnt', xT, cy, xd, cy); label('cntl', xT + 35, cy - 6, 'count'); } else outsY.forEach((y, i) => arrow('q:' + i, xT, y, xd, y));
      xT = xd + 96;
      tY = k.states.map((_, i) => topd + 30 + (i + 0.5) * ((hd - 40) / nS));
    } else tY = outsY;
    // the state lines into the control logic
    const wC = Math.max(170, ...ctLines.map(mono)) + 24, xC = xT + 120;
    const hC = Math.max(ctLines.length * LH + 50, (Math.max(...tY) - Math.min(...tY)) + 60), topC = cy - hC / 2;
    box('cl', xC, topC, wC, hC, 'control logic', ctLines);
    tY.forEach((y, i) => { arrow('t:' + i, xT, y, xC, y); label('tl:' + i, xT + 60, y - 6, tn[i]); });
    // control signals out
    k.controls.forEach((c, i) => { const y = topC + 44 + i * LH; if (y > topC + hC - 8) return; arrow('o:' + c.name, xC + wC, y - 4, xC + wC + 44, y - 4); label('ol:' + c.name, xC + wC + 50, y, c.name, 'start'); });
    // status along the top, state lines back along the bottom
    const yTop = Math.min(y0, topC) - 40, xs = [xN + wN / 2, xC + wC / 2];
    items.push({ key: 'sbus', kind: 'line', x1: xN - 20, y1: yTop, x2: xs[1], y2: yTop, cls: 'dp-wire', layer: 'lines' });
    xs.forEach((x, i) => arrow('sb:' + i, x, yTop, x, i ? topC : y0));
    label('sbl', xN - 20, yTop - 8, k.signals.join(', ') || 'inputs', 'start');
    const yBot = Math.max(y0 + hN, topC + hC) + 34, xb = xT - 30;
    items.push({ key: 'fb1', kind: 'line', x1: xb, y1: Math.max(...tY), x2: xb, y2: yBot, cls: 'dp-wire', layer: 'lines' });
    items.push({ key: 'fb2', kind: 'line', x1: xb, y1: yBot, x2: xN + wN / 2, y2: yBot, cls: 'dp-wire', layer: 'lines' });
    arrow('fb3', xN + wN / 2, yBot, xN + wN / 2, y0 + hN);
    label('fbl', (xb + xN + wN / 2) / 2, yBot + 18, 'state lines ' + tn.join(', '));
    return items;
  }
  S.topic({
    id: 'control-three-ways', family: 'p9-control', order: 20, title: 'Three ways to build the controller',
    blurb: 'The same chart as three circuits. A binary state register with a decoder gives a line Tk per state; one flip-flop per state gives those lines directly; a sequence counter counts through the states in order and is loaded or cleared to jump. The control signals are the same AND-OR of state lines and conditions in all three.',
    inputs: [chartInput(['multiplier', 'gcd', 'vending'], 'multiplier'), { id: 'm', kind: 'choice', label: 'Controller', def: 'decoder', options: Object.keys(METHOD).map((k) => ({ value: k, label: METHOD[k] })) }],
    presets: [
      { label: 'Multiplier: decoder', values: { c: 'multiplier', m: 'decoder' } },
      { label: 'Multiplier: one-hot', values: { c: 'multiplier', m: 'onehot' } },
      { label: 'Multiplier: sequence counter', values: { c: 'multiplier', m: 'counter' } },
      { label: 'GCD: one-hot', values: { c: 'gcd', m: 'onehot' } },
      { label: 'Vending: sequence counter', values: { c: 'vending', m: 'counter' } },
    ],
    counters: [{ id: 'ff', label: 'flip-flops' }],
    camera: 'follow',
    run(inp) {
      const ch = P9.chart(inp.c), k = A().controller(ch, inp.m);
      const Fr = new S.Frames(['ff']);
      const lay = K.asm.layout(ch);
      const chart = K.asm.draw(ch, { prefix: 'asm', codes: inp.m === 'counter' ? Object.fromEntries(k.states.map((s, i) => [s, String(i)])) : k.codes }).items;
      Fr.add({ items: chart, say: k.trace[0].say, meta: { ask: true, n: k.flipflops } });
      Fr.set('ff', k.flipflops);
      const eqs = k.equations.map((e) => ({ text: pr(e.text) }));
      const ctl = k.controls.map((c) => ({ text: pr(c.eq), cls: 'faint' }));
      const lines = P9.lines(eqs.concat([{ text: '' }], ctl), lay.box.x + lay.box.w + 40, lay.box.y + 50, { prefix: 'eq', size: 14, lh: 21, title: inp.m === 'counter' ? 'counter control' : 'next-state equations, then the control signals' });
      Fr.add({ items: chart.concat(lines.items), say: (inp.m === 'onehot' ? 'Each D_s collects the paths into s: ' : inp.m === 'counter' ? 'INC counts to the next state in order, CLR returns to ' + k.states[0] + ', LD loads the number on L for any other jump: ' : 'Each D bit collects the paths into states whose code has a 1 there: ') + k.equations.map((e) => pr(e.text)).join('; ') + '. The control signals are the same in every method.' });
      Fr.add({ items: controllerBlocks(ch, k, inp.m), say: 'The controller block by block: ' + k.flipflops + ' ' + (inp.m === 'counter' ? 'counter bit' + (k.flipflops > 1 ? 's' : '') + ' in the sequence-counter block' : 'D flip-flop' + (k.flipflops > 1 ? 's' : '')) + (inp.m === 'decoder' ? ' and a ' + k.flipflops + '-to-' + (1 << k.flipflops) + ' decoder' : '') + ', the next-state logic in front of ' + (inp.m === 'counter' ? 'the counter' : 'them') + ', and the control logic after ' + (inp.m === 'onehot' ? 'them: each flip-flop is a state line itself.' : 'the decoder, which turns the code into one line per state.') + ' The state lines also go back into the next-state logic. RESET (not drawn) starts it in ' + k.states[0] + '.' });
      // the three side by side
      const all = Object.keys(METHOD).map((m) => { const c = A().controller(ch, m); const lits = c.equations.reduce((a, e) => a + e.terms.reduce((b, t) => b + 1 + t.cond.length, 0), 0); return [METHOD[m], String(c.flipflops), m === 'decoder' ? 'yes' : m === 'counter' ? 'yes (counter outputs)' : 'no', String(lits)]; });
      const t = K.table.draw({ x: 0, y: 30, prefix: 'cmp', rows: all, colHead: ['method', 'flip-flops', 'decoder', 'literals in the next-state logic'], size: 15, act: [Object.keys(METHOD).indexOf(inp.m)].map((r) => [r, 0]), title: 'the same chart, three controllers' });
      Fr.add({ items: t.items, say: 'Compared: ' + all.map((r) => r[0] + ', ' + r[1] + ' flip-flop' + (r[1] === '1' ? '' : 's') + ', ' + r[3] + ' literal' + (r[3] === '1' ? '' : 's')).join('; ') + '. One-hot spends flip-flops and saves decoding; the sequence counter suits charts that mostly step to the next state in order.' });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Three controllers', text: ['decoder: ⌈log2 n⌉ flip-flops,', '  a decoder makes T_s', 'one-hot: n flip-flops, T_s = Y_s', 'sequence counter: count, clear', '  or load, decoded to T_s'].join('\n') }] };
      return { frames: P9.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['1', '2', '3', '4', '5'], ask: 'How many flip-flops will this controller need?', answer: (fr, i) => String(fr[i].meta.n), explain: (fr, i) => fr[i + 1].say, once: true },
    ],
    quiz: [
      { q: 'A chart with 6 states needs how many flip-flops with a state register and decoder?', options: ['2', '3', '6', '1'], answer: 1, why: '⌈log2 6⌉ = 3.' },
      { q: 'One-hot control for 6 states needs…', options: ['3 flip-flops and a decoder', '6 flip-flops and no decoder', '1 flip-flop', '64 flip-flops'], answer: 1, why: 'Each flip-flop is the state line itself.' },
      { q: 'A sequence counter is a good choice when…', options: ['the states mostly follow one another in order', 'every state jumps somewhere else', 'there is one state', 'there are no decisions'], answer: 0, why: 'Counting up is free; only the other jumps need loading.' },
      { q: 'Do the control signals change with the method?', options: ['yes, completely', 'no: they are T_s and conditions, whatever makes T_s', 'only for one-hot', 'only for the counter'], answer: 1, why: 'Only how the state lines T_s are produced differs.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The chart in Verilog
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'asm-verilog', family: 'p9-control', order: 30, title: 'From chart to Verilog',
    blurb: 'An ASM chart reads straight into Verilog: a state register, one case arm per ASM block, if-else for the decisions, non-blocking assignments (<=) for the transfers so they all land on the same edge, and a separate block that sets the state-box outputs.',
    inputs: [chartInput(['multiplier', 'gcd', 'divider', 'vending', 'traffic'], 'gcd')],
    presets: ['gcd', 'multiplier', 'divider', 'vending', 'traffic'].map((k) => ({ label: CH[k], values: { c: k } })),
    counters: [{ id: 'arms', label: 'case arms' }],
    run(inp) {
      const ch = P9.chart(inp.c), code = A().verilog(ch).split('\n');
      const lay = K.asm.layout(ch);
      const Fr = new S.Frames(['arms']);
      const states = [ch.start].concat(A().states(ch).filter((s) => s !== ch.start));
      const cx = lay.box.x + lay.box.w + 40, WRAP = 44;
      // the code stands beside the chart, level with the block it is about (s), or at the top
      const show = (from, to, lit, title, s) => {
        const ls = [];
        for (let i = from; i < to; i++) {
          // a long line wraps after a comma or a space, its rest indented under it without a number
          const cls = lit && lit(i) ? 'hot' : '', ind = code[i].match(/^\s*/)[0] + (/^\s*\/\//.test(code[i]) ? '// ' : '    ');
          let rest = code[i], first = true;
          while (rest.length > WRAP) {
            const cut = Math.max(rest.lastIndexOf(', ', WRAP - 1) + 1, rest.lastIndexOf(' ', WRAP));
            if (cut <= ind.length) break;
            ls.push({ text: (first ? String(i + 1).padStart(3, ' ') : '   ') + '  ' + rest.slice(0, cut).trimEnd(), cls });
            rest = ind + rest.slice(cut).trimStart(); first = false;
          }
          ls.push({ text: (first ? String(i + 1).padStart(3, ' ') : '   ') + '  ' + rest, cls });
        }
        const y = s ? Math.max(lay.box.y + 20, Math.min(K.asm.blockBox(ch, s).y + 20, lay.box.y + lay.box.h - ls.length * 20 - 20)) : lay.box.y + 20;
        return P9.lines(ls, cx, y, { prefix: 'vc', size: 14, lh: 20, title }).items;
      };
      const idx = (re, from) => { for (let i = from || 0; i < code.length; i++) if (re.test(code[i])) return i; return -1; };
      const head = idx(/^\s*localparam/), clockIdx = idx(/always @\(posedge clk/);
      Fr.add({ items: K.asm.draw(ch, { prefix: 'asm' }).items.concat(show(0, Math.min(head + 1, 22), (i) => /^\s*(input|output)/.test(code[i]), 'the module')), say: 'The ports: clk and reset, the chart\'s inputs (' + (ch.inputs.join(', ') || 'none') + ') and data inputs, its outputs, and the registers (' + Object.keys(ch.registers).join(', ') + ') as outputs too so they can be watched. Each state gets a name: ' + states.map((s) => 'S_' + s).join(', ') + '.' });
      Fr.add({ items: K.asm.draw(ch, { prefix: 'asm', state: ch.start }).items.concat(show(head, Math.min(code.length, clockIdx + 3), (i) => i >= clockIdx || /^\s*wire/.test(code[i]), 'state register and status')), say: 'A state register, the status signals as wires (' + Object.entries(ch.status).map(([k2, c]) => k2 + ' = ' + c).join(', ') + '), and one always block on the rising clock edge: reset puts the machine in S_' + ch.start + ', otherwise a case on the state.', meta: { ask: true } });
      for (const s of states) {
        const a = idx(new RegExp('^\\s*S_' + s.replace(/[^A-Za-z0-9_]/g, '_') + ': begin'), clockIdx);
        if (a < 0) continue;
        const ind = code[a].match(/^\s*/)[0];
        let b = a + 1; while (b < code.length && code[b] !== ind + 'end') b++;
        Fr.count('arms');
        const from = Math.max(clockIdx, Math.min(a, b - 20)), to = Math.min(code.length, Math.max(b + 1, from + 1));
        const ps = A().paths(ch, s);
        Fr.add({ items: K.asm.draw(ch, { prefix: 'asm', state: s, hotBoxes: [...new Set(ps.flatMap((p) => p.boxes))] }).items.concat(show(from, Math.min(to, from + 22), (i) => i >= a && i <= b, 'the block of ' + s, s)), focus: K.asm.blockBox(ch, s), say: 'The block of ' + s + ' is the case arm S_' + s + ': ' + (ps.length > 1 ? 'each decision an if-else, ' : '') + 'each transfer a non-blocking assignment, and each path ends by setting the next state (' + [...new Set(ps.map((p) => p.target))].join(', ') + ').' });
      }
      const o = idx(/always @\*/);
      if (o >= 0) Fr.add({ items: K.asm.draw(ch, { prefix: 'asm', hotBoxes: ch.boxes.filter((b) => (b.actions || []).some((x) => ch.outputs.includes(x))).map((b) => b.id) }).items.concat(show(o, Math.min(code.length, o + 22), () => true, 'the outputs')), say: 'The outputs (' + ch.outputs.join(', ') + ') are set in a combinational block: 0 by default, 1 where the chart names them. A simulation of this module runs exactly like the chart, clock for clock.' });
      const def = { sections: [{ id: 'd', kind: 'math', title: 'Chart → Verilog', text: ['state box      → case arm', 'decision       → if (...) else', 'transfer       → reg <= expr;', 'next state     → state <= S_x;', 'state outputs  → always @* block'].join('\n') }] };
      return { frames: P9.views(Fr.list), def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', options: ['<= (non-blocking)', '= (blocking)'], ask: 'Which assignment should the register transfers use, so that they all read the values from before the edge?', answer: '<= (non-blocking)', explain: 'Non-blocking assignments are all evaluated first and written together at the end of the time step: exactly the rule of an ASM block.' },
    ],
    quiz: [
      { q: 'Why are transfers written with <= in the clocked always block?', options: ['It is shorter', 'All right-hand sides are read before any register is written, as at a clock edge', 'It makes them combinational', 'It is required by case'], answer: 1, why: 'With = a later statement could see an earlier statement\'s new value.' },
      { q: 'An ASM decision box becomes…', options: ['a case arm', 'an if-else', 'a wire', 'a module'], answer: 1, why: 'It chooses between two paths.' },
      { q: 'Where does the state-box output READY go in the Verilog here?', options: ['in the clocked block with <=', 'in a combinational always @* block', 'in the port list only', 'nowhere'], answer: 1, why: 'It depends on the present state only, not on an edge.' },
      { q: 'One case arm of the state register corresponds to…', options: ['one register', 'one ASM block', 'one decision', 'one clock period of the whole run'], answer: 1, why: 'Each arm describes what happens in one state.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
