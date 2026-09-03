// Part 8, memory: how a RAM is organised (an address decoder choosing one word of an array), its read and write
// cycles on the simulator with their timing diagram, coincident (two-dimensional) decoding, building wider and
// deeper memories from smaller chips, ROM as a stored truth table, and the kinds of ROM.
(function (S) {
  'use strict';
  const K = S.Kit, L = K.live, M = K.mem, N = S.Netlist;
  const title = (key, x, y, text, cls, size) => ({ key, kind: 'text', x, y, text, cls: cls || 'strong', size: size || 15 });
  const note = (key, x, y, text, anchor) => ({ key, kind: 'text', x, y, text, anchor: anchor || 'start', cls: 'p4-note', size: 13 });
  const hex = (v) => v.toString(16).toUpperCase();
  const bits = (v, n) => L.bits(v, n);
  /** the article for a number said aloud: an 8, an 11, a 16 */
  const an = (n) => (/^(8|11|18|8\d|8\d\d)$/.test(String(n)) ? 'an ' : 'a ');
  /** a RAM circuit for the simulator: inputs A, DIN, WE (and CS, OE), output DOUT */
  function ramCircuit(aw, dw, data, o) {
    o = o || {};
    const c = new N.Circuit('ram');
    const r = c.add('RAM', { aw, dw, data: data.map(hex).join(' '), cs: !!o.cs, oe: !!o.oe }, 'ram');
    c.connect(c.input('A', aw), r.pin('a')); c.connect(c.input('DIN', dw), r.pin('din')); c.connect(c.input('WE'), r.pin('we'));
    if (o.cs) c.connect(c.input('CS'), r.pin('cs'));
    if (o.oe) c.connect(c.input('OE'), r.pin('oe'));
    c.connect(r.pin('dout'), c.output('DOUT', dw));
    return c;
  }
  const contents = (sim, n) => { const st = sim.part('ram').state; return [...Array(n).keys()].map((i) => (st.mb[i] ? null : st.ma[i])); };
  const START = [0x9, 0x4, 0xE, 0x1, 0x7, 0xC, 0x2, 0xB, 0x5, 0xF, 0x0, 0x8, 0x3, 0xA, 0x6, 0xD];

  S.family({ id: 'p8-memory', part: 'memory', order: 10, title: 'RAM and ROM', blurb: 'Words in an array chosen by a decoder, read and write cycles in time, two-dimensional decoding, bigger memories from small chips, and ROM as a stored truth table.' });

  // ---------------------------------------------------------------------------------------------------
  // RAM organisation
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'ram-organisation', family: 'p8-memory', order: 10, title: 'RAM organisation: words, addresses, a decoder',
    blurb: 'A RAM of 2ᵏ words of n bits is an array: one row per word, one column per bit. The k address bits go to a decoder that raises one word line; that row is read onto the data outputs, or takes the data inputs when written.',
    inputs: [
      { id: 'size', kind: 'choice', label: 'Size', def: '8x4', options: [{ value: '8x4', label: '8 × 4 (3 address bits)' }, { value: '16x4', label: '16 × 4 (4 address bits)' }, { value: '8x8', label: '8 × 8' }] },
      { id: 'addr', kind: 'number', label: 'Address', def: 5, min: 0, max: 15, check: (v, inp) => (v >= +inp.size.split('x')[0] ? 'Address: less than ' + inp.size.split('x')[0] : null) },
      { id: 'op', kind: 'choice', label: 'Operation', def: 'write', options: [{ value: 'read', label: 'read' }, { value: 'write', label: 'write, then read back' }] },
      { id: 'data', kind: 'text', label: 'Data to write (binary)', def: '0110', check: (v, inp) => (new RegExp('^[01]{' + inp.size.split('x')[1] + '}$').test(v) ? null : 'Data: ' + inp.size.split('x')[1] + ' bits') },
    ],
    presets: [
      { label: 'Write 0110 at 5, read it back', values: { size: '8x4', addr: 5, op: 'write', data: '0110' } },
      { label: 'Read word 2', values: { size: '8x4', addr: 2, op: 'read', data: '0000' } },
      { label: '16 × 4: write at 13', values: { size: '16x4', addr: 13, op: 'write', data: '1111' } },
      { label: '8 × 8: read word 6', values: { size: '8x8', addr: 6, op: 'read', data: '00000000' } },
    ],
    counters: [{ id: 'bits', label: 'bits stored' }, { id: 'ns', label: 'ns' }],
    run(inp) {
      const [nw, dw] = inp.size.split('x').map(Number), aw = Math.log2(nw), a = inp.addr, d = parseInt(inp.data, 2);
      const init = [...Array(nw).keys()].map((i) => (dw === 8 ? (START[i] << 4) | START[(i + 5) % 16] : START[i]));
      const c = ramCircuit(aw, dw, init), sim = L.sim(c);
      // start from another address, so that choosing this one is a change the access time is counted from
      L.apply(sim, { A: a ? 0 : 1, DIN: 0, WE: 0 });
      const F = new S.Frames(['bits', 'ns']);
      F.set('bits', nw * dw);
      const CH = nw > 8 ? 22 : 26, CW = dw > 4 ? 26 : 32, decW = 92, arrX = decW + 60, arrY = 90;
      const scene = (o) => {
        const items = [];
        const arr = M.array({ prefix: 'm', x: arrX, y: arrY, words: nw, width: dw, data: o.data, label: null, cw: CW, ch: CH, sel: o.sel, cls: o.cls });
        items.push(...arr.items);
        const g = arr.grid;
        const dec = M.chip({ key: 'dec', x: 0, y: arrY - 10, w: decW, h: g.h + 20, title: aw + '-to-' + nw, sub: 'decoder', pins: { left: [...Array(aw).keys()].reverse().map((i) => ({ id: 'A' + i, label: '' })) }, cls: o.sel !== undefined ? 'hot' : '', stub: 18 });
        items.push(...dec.items);
        [...Array(aw).keys()].reverse().forEach((i) => { const p = dec.pin('A' + i); items.push({ key: 'al' + i, kind: 'text', x: p.x - 4, y: p.y + 4, text: 'A' + i + (o.addr !== undefined ? ' = ' + ((o.addr >> i) & 1) : ''), anchor: 'end', cls: 'p4-mono', size: 13 }); });
        for (let r = 0; r < nw; r++) {
          const rb = arr.row(r), y = rb.y + CH / 2;
          items.push({ key: 'wl' + r, kind: 'line', x1: decW, y1: y, x2: arrX, y2: y, cls: 'p4-wire' + (r === o.sel ? ' v1' : ''), audit: 'edge-x' });
          items.push({ key: 'wn' + r, kind: 'text', x: decW - 6, y: y + 4, text: String(r), anchor: 'end', cls: 'p4-note' + (r === o.sel ? ' hot' : ''), size: 12.5 });
        }
        // data in above the columns, data out below
        for (let k = 0; k < dw; k++) {
          const cb = arr.cell(0, k), x = cb.x + CW / 2;
          const din = o.din === undefined ? '' : String((o.din >> (dw - 1 - k)) & 1), dout = o.dout === undefined || o.dout === null ? '' : String((o.dout >> (dw - 1 - k)) & 1);
          items.push({ key: 'di' + k, kind: 'cell', x: cb.x, y: arrY - 72, w: CW, h: 26, text: din, cls: 'p4-bit' + (o.writing ? ' hot' : ''), size: 14 });
          items.push({ key: 'dil' + k, kind: 'line', x1: x, y1: arrY - 46, x2: x, y2: arrY, cls: 'p4-wire' + (o.writing && din === '1' ? ' v1' : ''), audit: 'edge-x' });
          items.push({ key: 'do' + k, kind: 'cell', x: cb.x, y: g.y + g.h + 40, w: CW, h: 26, text: dout, cls: 'p4-bit' + (o.reading && dout !== '' ? ' good' : ''), size: 14 });
          items.push({ key: 'dol' + k, kind: 'line', x1: x, y1: g.y + g.h, x2: x, y2: g.y + g.h + 40, cls: 'p4-wire' + (o.reading && dout === '1' ? ' v1' : ''), audit: 'edge-x' });
        }
        items.push(note('dinl', arrX + g.w + 12, arrY - 54, 'data in'), note('doutl', arrX + g.w + 12, g.y + g.h + 58, 'data out'));
        items.push(title('h', 0, -6, nw + ' words × ' + dw + ' bits = ' + nw * dw + ' bits' + (o.what ? ':  ' + o.what : '')));
        return items;
      };
      F.add({ items: scene({ data: init }), say: an(nw).replace(/^a/, 'A') + nw + ' × ' + dw + ' RAM: ' + nw + ' words of ' + dw + ' bits, ' + nw * dw + ' bits in all. Each row is a word; ' + aw + ' address bits are enough to name ' + nw + ' rows (2^' + aw + ' = ' + nw + ').', scene: 'r' });
      F.add({ items: scene({ data: init, sel: a, addr: a, what: 'address ' + bits(a, aw) }), say: 'The address ' + bits(a, aw) + ' = ' + a + ' goes to the decoder, which raises word line ' + a + ' alone. Only that row is connected to the data lines; every other row is cut off.', scene: 'r', meta: { sel: a } });
      const t0 = sim.time;
      if (inp.op === 'write') {
        sim.set('A', a); sim.set('DIN', d); sim.run(5); sim.set('WE', 1); sim.run(20); sim.set('WE', 0); sim.settle();
        const after = contents(sim, nw);
        F.set('ns', sim.time - t0);
        F.add({ items: scene({ data: init, sel: a, addr: a, din: d, writing: true, what: 'write' }), say: 'Write: the data ' + inp.data + ' is put on the data inputs and the write enable WE is pulsed. The bit lines carry it into the selected row.', scene: 'r' });
        F.add({ items: scene({ data: after, sel: a, addr: a, din: d, writing: true, cls: (r) => (r === a ? 'hot' : ''), what: 'written' }), say: 'Word ' + a + ' was ' + bits(init[a], dw) + ' and now holds ' + bits(after[a], dw) + '. No other word changed: the decoder kept them off the bit lines.', scene: 'r', meta: { written: after[a] } });
        sim.set('A', a); sim.settle();
        const out = sim.num('DOUT');
        F.add({ items: scene({ data: after, sel: a, addr: a, dout: out, reading: true, what: 'read back' }), say: 'Read it back: with WE = 0 the selected row drives the data outputs, ' + bits(out, dw) + '. A read does not change the word.', scene: 'r', meta: { out } });
      } else {
        sim.set('A', a); sim.settle();
        const out = sim.num('DOUT');
        F.set('ns', sim.time - t0);
        F.add({ items: scene({ data: init, sel: a, addr: a, dout: out, reading: true, what: 'read' }), say: 'Read: with WE = 0 the cells of row ' + a + ' drive the bit lines and the data outputs show ' + bits(out, dw) + ' (' + hex(out) + ' in hex). It takes the access time, ' + (sim.time - t0) + ' ns here, from the address arriving to the data being valid.', scene: 'r', meta: { out } });
      }
      L.views(F.list);
      const def = { sections: [{ id: 'eq', kind: 'math', title: 'Organisation', text: ['2^k words × n bits', 'k address bits → a k-to-2^k decoder', 'one word line per word', 'n bit lines, shared by every word', 'here: k = ' + aw + ', n = ' + dw + ', ' + nw * dw + ' bits'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => f.meta && f.meta.sel !== undefined, pick: 'option', ask: 'How many word lines are active now?', options: ['none', 'one', 'one per address bit', 'all of them'], answer: 'one', explain: (fr, i) => fr[i].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.out !== undefined, pick: 'option', ask: 'What will the data outputs show?', options: (fr, i, inp) => { const v = fr[i + 1].meta.out, n = +inp.size.split('x')[1]; return [...new Set([v, v ^ 1, v ^ (1 << (n - 1)), (~v) & ((1 << n) - 1)])].map((x) => bits(x, n)); }, answer: (fr, i, inp) => bits(fr[i + 1].meta.out, +inp.size.split('x')[1]), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A memory of 1024 words of 8 bits needs how many address lines?', options: ['8', '10', '1024', '13'], answer: 1, why: '2^10 = 1024.' },
      { q: 'How many bits does a 64 × 16 memory hold?', options: ['80', '1024', '64', '16'], answer: 1, why: '64 × 16 = 1024.' },
      { q: 'The address decoder of a RAM raises…', options: ['one word line', 'one bit line', 'every word line', 'the write enable'], answer: 0, why: 'Exactly the word at that address is connected.' },
      { q: 'Reading a RAM word…', options: ['erases it', 'leaves it unchanged', 'inverts it', 'writes zeros'], answer: 1, why: 'Only a write (WE active) changes a word.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Read and write cycles
  // ---------------------------------------------------------------------------------------------------
  const CYCLES = {
    both: { label: 'A write cycle, then a read cycle', steps: [[10, 'A', 2], [10, 'DIN', 0xA], [20, 'CS', 1], [30, 'WE', 1], [60, 'WE', 0], [70, 'CS', 0], [90, 'A', 2], [100, 'CS', 1], [100, 'OE', 1], [160, 'CS', 0], [160, 'OE', 0]], end: 180 },
    reads: { label: 'Two read cycles', steps: [[10, 'A', 1], [10, 'CS', 1], [10, 'OE', 1], [80, 'A', 6], [150, 'CS', 0], [150, 'OE', 0]], end: 170 },
    slip: { label: 'The address moves while WE is on', steps: [[10, 'A', 3], [10, 'DIN', 0xF], [20, 'CS', 1], [30, 'WE', 1], [45, 'A', 4], [60, 'WE', 0], [70, 'CS', 0], [90, 'A', 3], [90, 'CS', 1], [90, 'OE', 1], [130, 'A', 4], [175, 'CS', 0], [175, 'OE', 0]], end: 190 },
  };
  S.topic({
    id: 'ram-cycles', family: 'p8-memory', order: 20, title: 'Read and write cycles',
    blurb: 'The order of the signals matters. Write: address first, then chip select, then a write-enable pulse while the data is held steady. Read: address and chip select, then output enable; the data appears one access time later. The simulator runs a RAM chip so the timing diagram is real.',
    inputs: [{ id: 'cycle', kind: 'choice', label: 'Cycles', def: 'both', options: Object.entries(CYCLES).map(([k, v]) => ({ value: k, label: v.label })) }, { id: 'tech', kind: 'choice', label: 'Technology', def: 'CMOS', options: [{ value: 'CMOS', label: 'CMOS (30 ns access)' }, { value: 'TTL', label: 'TTL (45 ns access)' }] }],
    presets: Object.keys(CYCLES).map((k) => ({ label: CYCLES[k].label, values: { cycle: k, tech: 'CMOS' } })).concat([{ label: 'Write then read, TTL', values: { cycle: 'both', tech: 'TTL' } }]),
    counters: [{ id: 'ns', label: 'ns' }],
    run(inp) {
      const cy = CYCLES[inp.cycle], nw = 8, dw = 4;
      const init = START.slice(0, nw);
      const c = ramCircuit(3, dw, init, { cs: true, oe: true }), sim = L.sim(c, { tech: inp.tech });
      L.apply(sim, { A: 0, DIN: 0, WE: 0, CS: 0, OE: 0 });
      const t0 = sim.time;
      for (const [t, nm, v] of cy.steps) sim.at(t0 + t, nm, v);
      const taa = S.Tech.get(inp.tech).mem.taa;
      // key moments: each stimulus, and an access time after each read starts
      // key moments: each stimulus; one access time after a read starts (when nothing changes before it is done),
      // the data valid; one access time after a driving chip is deselected, its outputs released
      const at = [...new Set(cy.steps.map((s) => s[0]))].sort((x, y) => x - y);
      const lv = { A: 0, CS: 0, OE: 0, WE: 0 }, moments = new Map();
      let driveFrom = null;
      at.forEach((t, i) => {
        const was = Object.assign({}, lv);
        for (const [tt, nm, v] of cy.steps) if (tt === t && nm in lv) lv[nm] = v;
        const reads = lv.CS === 1 && lv.OE === 1 && lv.WE === 0, readBefore = was.CS === 1 && was.OE === 1 && was.WE === 0;
        const done = t + taa + 1, quiet = !(at[i + 1] <= t + taa);
        if (reads && (!readBefore || lv.A !== was.A) && quiet) moments.set(done, 'valid');
        if (reads && !readBefore) driveFrom = t + taa;
        if (!reads && readBefore) { if (driveFrom !== null && driveFrom <= t) moments.set(done, 'release'); driveFrom = null; }
      });
      const end = Math.max(cy.end, ...[...moments.keys()].map((t) => t + 9));
      const times = [...new Set([0].concat(at, [...moments.keys()]))].filter((t) => t <= end).sort((x, y) => x - y);
      const snaps = [];
      for (const t of times) { sim.stepTo(t0 + t); snaps.push({ t, mem: contents(sim, nw), A: sim.num('A'), DOUT: sim.get('DOUT'), CS: sim.get('CS'), WE: sim.get('WE'), OE: sim.get('OE'), DIN: sim.num('DIN') }); }
      sim.stepTo(t0 + end);
      const sigs = [['A', 3], ['DIN', 4], ['CS', 1], ['WE', 1], ['OE', 1], ['DOUT', 4]].map(([nm, w]) => ({ name: nm, width: w, changes: L.wave(sim, nm, t0).map(([t, v]) => [t - t0, v]) }));
      const F = new S.Frames(['ns']);
      const doutText = (v) => (Array.isArray(v) ? (v.every((b) => b === 'Z') ? 'Z (released)' : v.some((b) => b === 'X') ? 'X' : bits(v.reduce((s, b, i) => s | (b << i), 0), 4)) : String(v));
      const sayOf = (s, prev) => {
        const ch = cy.steps.filter((x) => x[0] === s.t).map((x) => x[1] + ' = ' + (x[1] === 'A' ? x[2] : x[1] === 'DIN' ? bits(x[2], 4) : x[2]));
        let why = '';
        if (s.t === 0) return 'Idle: the chip is not selected (CS = 0), so its data outputs are released (Z) and nothing can be written.';
        if (ch.some((x) => /^A = /.test(x)) && s.WE === 1) why = ' The address moved while WE is still active: the write now goes into word ' + s.A + ' as well. This is why the address must be steady for the whole write pulse.';
        else if (ch.some((x) => /^WE = 1/.test(x))) why = ' Write pulse: while WE = 1 the data on DIN flows into the selected word ' + s.A + '.';
        else if (ch.some((x) => /^WE = 0/.test(x))) why = ' WE returns to 0 and the word keeps what it held at that moment: word ' + s.A + ' = ' + bits(s.mem[s.A], 4) + '.';
        else if (ch.some((x) => /^OE = 1/.test(x))) why = ' The outputs are enabled, but the data needs the access time (' + taa + ' ns) to arrive.';
        else if (!ch.length && moments.get(s.t) === 'release') why = ' one access time after the deselect the outputs let go: DOUT = ' + doutText(s.DOUT) + '.';
        else if (!ch.length) why = ' one access time later the data is valid: DOUT = ' + doutText(s.DOUT) + ', the word at address ' + s.A + '.';
        else if (ch.some((x) => /^CS = 0/.test(x))) why = ' The chip is deselected' + ([...moments].some(([t, k]) => k === 'release' && t === s.t + taa + 1) ? ': its outputs are released one access time later.' : ', and its outputs stay released.');
        else if (ch.some((x) => /^CS = 1/.test(x))) why = ' The chip is selected.';
        else if (ch.some((x) => /^A = /.test(x))) {
          const reading = s.CS === 1 && s.OE === 1 && s.WE === 0, driven = Array.isArray(s.DOUT) && s.DOUT.every((b) => b === 0 || b === 1);
          why = !reading ? (ch.some((x) => /^DIN/.test(x)) ? ' The address and the data are set up first, before the chip is selected.' : ' The address is set up first, before the chip is selected.') : driven ? ' A new address: the outputs keep the old word until the access time has passed.' : ' A new address: the access time counts from here.';
        }
        return 'At ' + s.t + ' ns' + (ch.length ? ': ' + ch.join(', ') + '.' : ':') + why;
      };
      snaps.forEach((s, k) => {
        F.set('ns', s.t);
        const items = L.waves({ prefix: 'w', x: 0, y: 0, w: 480, t0: 0, t1: end, now: s.t, signals: sigs, rowH: 22, gap: 12 }).items;
        const arr = M.array({ prefix: 'm', x: 600, y: 0, words: nw, width: dw, data: s.mem, sel: s.CS === 1 ? s.A : undefined, title: 'contents', cls: (r) => (k > 0 && snaps[k - 1].mem[r] !== s.mem[r] ? 'hot' : '') });
        items.push(...arr.items);
        F.add({ items, say: sayOf(s, snaps[k - 1]), meta: { t: s.t, dout: doutText(s.DOUT), mem: s.mem } });
      });
      const def = { sections: [{ id: 'eq', kind: 'math', title: 'The rules', text: ['write: address steady before WE rises', '       and until after WE falls;', '       data steady while WE is on', 'read: data valid one access time', '      (' + taa + ' ns here) after address,', '      CS and OE are all in place', 'CS = 0 or OE = 0: outputs released (Z)'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && /^(Z|X|[01]{4})/.test(fr[i + 1].meta.dout) && fr[i + 1].meta.dout !== f.meta.dout, pick: 'option', ask: 'What will the data outputs show at the next moment?', options: (fr, i) => [...new Set(['Z (released)', 'X', fr[i + 1].meta.dout, fr[i].meta.dout])], answer: (fr, i) => fr[i + 1].meta.dout, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'During a write, the address must be…', options: ['changing', 'steady for the whole write pulse', 'all zeros', 'applied after WE falls'], answer: 1, why: 'Otherwise the data may land in more than one word.' },
      { q: 'After the address is applied, read data appears…', options: ['at once', 'one access time later', 'only after WE pulses', 'never'], answer: 1, why: 'The decoder and the cells take time: the access time.' },
      { q: 'With CS = 0, the data outputs are…', options: ['0', '1', 'released (high impedance)', 'the last word read'], answer: 2, why: 'A deselected chip lets go of the bus.' },
      { q: 'Why does a RAM have an output enable (OE)?', options: ['To start a write', 'So that several chips can share a data bus', 'To store more bits', 'To refresh it'], answer: 1, why: 'Only the chip whose outputs are enabled drives the bus.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Coincident decoding
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'coincident-decoding', family: 'p8-memory', order: 30, title: 'Coincident (two-dimensional) decoding',
    blurb: 'A memory of 2ᵏ cells need not have a decoder with 2ᵏ outputs. Arrange the cells in a square; half the address bits choose a row, the other half a column, and the one cell where the two chosen lines cross is the one used.',
    inputs: [
      { id: 'n', kind: 'choice', label: 'Cells', def: '64', options: [{ value: '16', label: '16 (4 × 4)' }, { value: '64', label: '64 (8 × 8)' }] },
      { id: 'addr', kind: 'number', label: 'Address', def: 45, min: 0, max: 63, check: (v, inp) => (v >= +inp.n ? 'Address: less than ' + inp.n : null) },
    ],
    presets: [{ label: '64 cells, address 45', values: { n: '64', addr: 45 } }, { label: '16 cells, address 9', values: { n: '16', addr: 9 } }, { label: '64 cells, address 7', values: { n: '64', addr: 7 } }],
    counters: [{ id: 'gates', label: 'decoder gates' }],
    run(inp) {
      const n = +inp.n, k = Math.log2(n), h = k / 2, side = 1 << h, a = inp.addr, r = a >> h, col = a & (side - 1);
      const C = side > 4 ? 26 : 34, gap = 4, gx = 110, gy = 130;
      const F = new S.Frames(['gates']);
      const scene = (o) => {
        const items = [];
        // the address, split
        const ab = L.bitRow({ prefix: 'ad', x: gx, y: 0, bits: bits(a, k), w: 28, h: 28, cls: (i) => (o.split ? (i < h ? 'act' : 'par') : '') });
        items.push(...ab.items, note('adl', gx - 10, 19, 'address', 'end'));
        if (o.split) { items.push({ key: 'brr', kind: 'bracket', x1: gx, x2: gx + h * 32 - 4, y: 32, side: 'below', text: 'row ' + r }); items.push({ key: 'brc', kind: 'bracket', x1: gx + h * 32, x2: gx + k * 32 - 4, y: 32, side: 'below', text: 'column ' + col }); }
        const rowDec = M.chip({ key: 'rd', x: 0, y: gy, w: 70, h: side * (C + gap) - gap, title: h + ':' + side, sub: 'rows', stub: 0, cls: o.row ? 'hot' : '' });
        const colDec = M.chip({ key: 'cd', x: gx, y: gy - 64, w: side * (C + gap) - gap, h: 40, title: h + ':' + side + ' columns', stub: 0, cls: o.col ? 'hot' : '' });
        items.push(...rowDec.items, ...colDec.items);
        for (let i = 0; i < side; i++) {
          const y = gy + i * (C + gap) + C / 2, x = gx + i * (C + gap) + C / 2;
          items.push({ key: 'rl' + i, kind: 'line', x1: 70, y1: y, x2: gx, y2: y, cls: 'p4-wire' + (o.row && i === r ? ' v1' : ''), audit: 'edge-x' });
          items.push({ key: 'cl' + i, kind: 'line', x1: x, y1: gy - 24, x2: x, y2: gy, cls: 'p4-wire' + (o.col && i === col ? ' v1' : ''), audit: 'edge-x' });
          for (let j = 0; j < side; j++) {
            const on = (o.row && i === r) && (o.col && j === col);
            items.push({ key: 'c' + i + ',' + j, kind: 'cell', x: gx + j * (C + gap), y: gy + i * (C + gap), w: C, h: C, text: side > 4 ? '' : String(i * side + j), cls: 'p4-bit' + (on ? ' hot' : (o.row && i === r) || (o.col && j === col) ? ' act' : ''), size: 11 });
          }
        }
        return items;
      };
      const oneD = n, twoD = 2 * side;
      F.set('gates', oneD);
      F.add({ items: scene({}), say: n + ' cells need ' + k + ' address bits. A one-dimensional decoder would need ' + oneD + ' AND gates of ' + k + ' inputs each, one per cell. Arranged as ' + an(side) + side + ' × ' + side + ' square, two ' + h + '-to-' + side + ' decoders do the job.', scene: 'g' });
      F.set('gates', twoD);
      F.add({ items: scene({ split: true }), say: 'Split the address ' + bits(a, k) + ': the high ' + h + ' bits ' + bits(r, h) + ' name the row (' + r + '), the low ' + h + ' bits ' + bits(col, h) + ' name the column (' + col + ').', scene: 'g', meta: { split: true } });
      F.add({ items: scene({ split: true, row: true }), say: 'The row decoder raises row line ' + r + ': all ' + side + ' cells in that row are half-selected.', scene: 'g' });
      F.add({ items: scene({ split: true, row: true, col: true }), say: 'The column decoder raises column line ' + col + '. Only the cell where row ' + r + ' and column ' + col + ' cross, cell ' + a + ', has both lines active: that is the cell read or written.', scene: 'g', meta: { cell: a } });
      const sizes = [16, 64, 256, 1024, 4096, 65536];
      const tb = K.table.draw({ prefix: 'cmp', x: 0, y: 0, ch: 30, size: 14, colHead: ['cells', '1-D gates', '2-D gates'], rows: sizes.map((s) => [String(s), String(s), String(2 * Math.sqrt(s))]), cls: (rr) => (sizes[rr] === n ? 'act' : '') });
      F.add({ items: tb.items.concat(title('h', 0, -14, 'Decoder gates needed')), say: 'The saving grows fast: for 4096 cells, 4096 gates of 12 inputs against 2 × 64 gates of 6 inputs. Large memories are always built this way, often with the column part done by a multiplexer that picks one bit out of the selected row.', scene: 't' });
      L.views(F.list);
      return { frames: F.list, def: { sections: [{ id: 'eq', kind: 'math', title: 'Coincident selection', text: ['2^k cells as 2^(k/2) × 2^(k/2)', 'row = high k/2 address bits', 'column = low k/2 address bits', 'selected cell = row line AND column line', 'gates: 2 × 2^(k/2) instead of 2^k'].join('\n') }] } };
    },
    predict: [
      { at: (f) => f.meta && f.meta.split, pick: 'option', ask: 'How many cells will be fully selected (both lines active)?', options: ['one', 'one row', 'one column', 'none'], answer: 'one', explain: (fr) => fr.find((f) => f.meta && f.meta.cell !== undefined).say },
    ],
    quiz: [
      { q: 'A 1024-cell memory with coincident decoding uses two decoders of…', options: ['10-to-1024', '5-to-32', '2-to-4', '8-to-256'], answer: 1, why: '1024 = 32 × 32: 5 address bits each.' },
      { q: 'How many decoder output gates does that take?', options: ['1024', '64', '32', '10'], answer: 1, why: '32 + 32.' },
      { q: 'A cell is selected when…', options: ['its row line is active', 'its column line is active', 'both its row and column lines are active', 'neither'], answer: 2, why: 'That is what "coincident" means.' },
      { q: 'Address 45 in an 8 × 8 array (row from the high bits) is in…', options: ['row 5, column 5', 'row 5, column 6', 'row 6, column 5', 'row 4, column 5'], answer: 0, why: '45 = 101 101.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Memory expansion
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'memory-expansion', family: 'p8-memory', order: 40, title: 'Bigger memories from smaller chips',
    blurb: 'Wider words: put chips side by side, give them the same address and chip select, and let each supply some of the data bits. More words: give the chips the same low address bits and decode the high bits into chip selects, so exactly one chip answers on the shared data bus.',
    inputs: [
      { id: 'mode', kind: 'choice', label: 'Expand', def: 'depth', options: [{ value: 'width', label: 'in width: two 8 × 4 make 8 × 8' }, { value: 'depth', label: 'in depth: two 8 × 4 make 16 × 4' }] },
      { id: 'addr', kind: 'number', label: 'Address', def: 11, min: 0, max: 15, check: (v, inp) => (inp.mode === 'width' && v > 7 ? 'Address: 0 to 7 for 8 words' : null) },
    ],
    presets: [{ label: 'Depth: address 11 (upper chip)', values: { mode: 'depth', addr: 11 } }, { label: 'Depth: address 3 (lower chip)', values: { mode: 'depth', addr: 3 } }, { label: 'Width: address 5', values: { mode: 'width', addr: 5 } }],
    counters: [{ id: 'chips', label: 'chips' }],
    run(inp) {
      const depth = inp.mode === 'depth', a = inp.addr, low = a & 7, hi = (a >> 3) & 1;
      const dataA = START.slice(0, 8), dataB = START.slice(8, 16);
      // the circuit on the simulator: two RAM chips
      const c = new N.Circuit('exp');
      const r0 = c.add('RAM', { aw: 3, dw: 4, data: dataA.map(hex).join(' '), cs: true, oe: true }, 'ram0'), r1 = c.add('RAM', { aw: 3, dw: 4, data: dataB.map(hex).join(' '), cs: true, oe: true }, 'ram1');
      c.connect(c.input('A', 3), r0.pin('a'), r1.pin('a'));
      c.connect(c.input('DIN', 4), r0.pin('din'), r1.pin('din'));
      c.connect(c.input('WE'), r0.pin('we'), r1.pin('we'));
      c.connect(c.input('OE'), r0.pin('oe'), r1.pin('oe'));
      if (depth) { const a3 = c.input('A3').pin('y'); c.connect(L.G(c, 'NOT', a3), r0.pin('cs')); c.connect(a3, r1.pin('cs')); c.connect(r0.pin('dout'), r1.pin('dout'), c.output('D', 4)); }
      else { c.connect(c.input('CS').pin('y'), r0.pin('cs'), r1.pin('cs')); c.connect(r0.pin('dout'), c.output('DH', 4)); c.connect(r1.pin('dout'), c.output('DL', 4)); }
      const sim = L.sim(c);
      L.apply(sim, Object.assign({ A: 0, DIN: 0, WE: 0, OE: 1 }, depth ? { A3: 0 } : { CS: 1 }));
      L.apply(sim, Object.assign({ A: low }, depth ? { A3: hi } : {}));
      const outV = depth ? sim.num('D') : (sim.num('DH') << 4) | sim.num('DL');
      const F = new S.Frames(['chips']);
      F.set('chips', 2);
      const CW = 150, CH = 120, x0 = 150, x1 = x0 + CW + 90, cy = 120;
      const scene = (o) => {
        const items = [];
        const sel0 = depth ? o.sel && hi === 0 : o.sel, sel1 = depth ? o.sel && hi === 1 : o.sel;
        const ch0 = M.chip({ key: 'c0', x: x0, y: cy, w: CW, h: CH, title: '8 × 4 RAM', sub: depth ? 'words 0–7' : 'bits 7–4', pins: { top: [{ id: 'A', label: 'A' }, { id: 'CS', label: 'CS' }], bottom: [{ id: 'D', label: 'D' }] }, cls: sel0 ? 'hot' : depth && o.sel ? 'dim' : '' });
        const ch1 = M.chip({ key: 'c1', x: x1, y: cy, w: CW, h: CH, title: '8 × 4 RAM', sub: depth ? 'words 8–15' : 'bits 3–0', pins: { top: [{ id: 'A', label: 'A' }, { id: 'CS', label: 'CS' }], bottom: [{ id: 'D', label: 'D' }] }, cls: sel1 ? 'hot' : depth && o.sel ? 'dim' : '' });
        items.push(...ch0.items, ...ch1.items);
        // address bus along the top, a drop to each chip
        const ya = cy - 70, yc = cy - 40, yc2 = cy - 52;
        items.push(note('al', 0, ya + 4, depth ? 'A2..A0 = ' + bits(low, 3) : 'A2..A0 = ' + bits(low, 3)));
        items.push(...M.wire('ab', [{ x: 120, y: ya }, { x: ch1.pin('A').x, y: ya }], 'bus' + (o.sel ? ' hot' : '')));
        items.push(...M.wire('ad0', [{ x: ch0.pin('A').x, y: ya }, ch0.pin('A')], 'bus' + (o.sel ? ' hot' : '')), ...M.wire('ad1', [{ x: ch1.pin('A').x, y: ya }, ch1.pin('A')], 'bus' + (o.sel ? ' hot' : '')));
        if (depth) {
          items.push(note('a3l', 0, yc + 4, 'A3 = ' + hi));
          const inv = { key: 'inv', kind: 'cell', x: 76, y: yc2 - 11, w: 34, h: 22, text: 'NOT', cls: 'p8-gate', size: 10 };
          items.push(inv);
          items.push(...M.wire('a3', [{ x: 56, y: yc }, { x: ch1.pin('CS').x, y: yc }, ch1.pin('CS')], (o.sel && hi ? 'v1' : '')));
          items.push(...M.wire('a3i', [{ x: 64, y: yc }, { x: 64, y: yc2 }, { x: 76, y: yc2 }], ''));
          items.push(...M.wire('a3n', [{ x: 110, y: yc2 }, { x: ch0.pin('CS').x, y: yc2 }, ch0.pin('CS')], (o.sel && !hi ? 'v1' : '')));
          items.push({ key: 'a3dot', kind: 'token', x: 64, y: yc, r: 2.5, text: '', cls: 'p4-dot', audit: 'overlap-ok' });
          // the shared data bus below
          const yb = cy + CH + 50;
          items.push(...M.wire('d0', [ch0.pin('D'), { x: ch0.pin('D').x, y: yb }], 'bus' + (o.read && !hi ? ' hot' : '')), ...M.wire('d1', [ch1.pin('D'), { x: ch1.pin('D').x, y: yb }], 'bus' + (o.read && hi ? ' hot' : '')));
          items.push(...M.wire('db', [{ x: ch0.pin('D').x, y: yb }, { x: ch1.pin('D').x, y: yb }], 'bus' + (o.read ? ' hot' : '')));
          const mx = (ch0.pin('D').x + ch1.pin('D').x) / 2;
          items.push(...M.wire('dout', [{ x: mx, y: yb }, { x: mx, y: yb + 40 }], 'bus' + (o.read ? ' hot' : '')));
          items.push({ key: 'dbdot', kind: 'token', x: mx, y: yb, r: 2.5, text: '', cls: 'p4-dot', audit: 'overlap-ok' });
          items.push(...L.bitRow({ prefix: 'out', x: mx - 70, y: yb + 40, bits: o.read ? bits(outV, 4) : '    '.split(''), w: 32, h: 28, cls: () => (o.read ? 'good' : '') }).items);
          items.push(note('dl', mx + 80, yb + 60, 'D3..D0, shared'));
        } else {
          items.push(note('csl', 0, yc + 4, 'CS'));
          items.push(...M.wire('cs', [{ x: 44, y: yc }, { x: ch1.pin('CS').x, y: yc }, ch1.pin('CS')], o.sel ? 'v1' : ''));
          items.push(...M.wire('cs0', [{ x: ch0.pin('CS').x, y: yc }, ch0.pin('CS')], o.sel ? 'v1' : ''));
          const yb = cy + CH + 40;
          items.push(...M.wire('d0', [ch0.pin('D'), { x: ch0.pin('D').x, y: yb }], 'bus' + (o.read ? ' hot' : '')), ...M.wire('d1', [ch1.pin('D'), { x: ch1.pin('D').x, y: yb }], 'bus' + (o.read ? ' hot' : '')));
          items.push(...L.bitRow({ prefix: 'oh', x: ch0.pin('D').x - 70, y: yb, bits: o.read ? bits(outV >> 4, 4) : '    '.split(''), w: 32, h: 28, cls: () => (o.read ? 'good' : '') }).items);
          items.push(...L.bitRow({ prefix: 'ol', x: ch1.pin('D').x - 70, y: yb, bits: o.read ? bits(outV & 15, 4) : '    '.split(''), w: 32, h: 28, cls: () => (o.read ? 'good' : '') }).items);
          items.push(note('dlh', ch0.pin('D').x - 70, yb + 46, 'D7..D4'), note('dll', ch1.pin('D').x - 70, yb + 46, 'D3..D0'));
        }
        if (o.ttl) items.push(title('h', 0, -10, o.ttl));
        return items;
      };
      if (depth) {
        F.add({ items: scene({ ttl: '16 words × 4 bits from two 8 × 4 chips' }), say: 'Twice the words: both chips get A2..A0 and share the four data lines. The new top address bit A3 is decoded (here a single inverter is the 1-to-2 decoder): A3 = 0 selects the lower chip, A3 = 1 the upper one.', scene: 'x' });
        F.add({ items: scene({ sel: true, ttl: 'address ' + a + ' = ' + bits(a, 4) }), say: 'Address ' + bits(a, 4) + ': A3 = ' + hi + ', so only the ' + (hi ? 'upper' : 'lower') + ' chip is selected (CS = 1). The other has CS = 0 and releases the data bus (its outputs are Z).', scene: 'x', meta: { chip: hi } });
        F.add({ items: scene({ sel: true, read: true, ttl: 'address ' + a + ' = ' + bits(a, 4) }), say: 'The selected chip reads its word ' + low + ' onto the shared bus: D = ' + bits(outV, 4) + '. That is word ' + a + ' of the 16-word memory. On the simulator the two outputs are wired together; with one released there is no contention.', scene: 'x', meta: { out: outV } });
      } else {
        F.add({ items: scene({ ttl: '8 words × 8 bits from two 8 × 4 chips' }), say: 'Twice the width: both chips get the same address and the same chip select, so they always work together. One supplies data bits 7 to 4, the other bits 3 to 0.', scene: 'x' });
        F.add({ items: scene({ sel: true, ttl: 'address ' + a }), say: 'Address ' + bits(low, 3) + ' goes to both chips at once; both are selected.', scene: 'x', meta: { chip: 2 } });
        F.add({ items: scene({ sel: true, read: true, ttl: 'address ' + a }), say: 'Each chip reads its half of word ' + low + ': ' + bits(outV >> 4, 4) + ' and ' + bits(outV & 15, 4) + ', together the 8-bit word ' + bits(outV, 8) + ' (' + hex(outV) + ' in hex).', scene: 'x', meta: { out: outV } });
      }
      L.views(F.list);
      return { frames: F.list, def: { sections: [{ id: 'eq', kind: 'math', title: 'Two ways to grow', text: ['width: same address and CS to every chip;', '       each chip gives some data bits', 'depth: same low address bits to every chip;', '       high bits decoded into chip selects;', '       data outputs share one bus (tristate)'].join('\n') }] } };
    },
    predict: [
      { at: (f, i, fr) => i === 0, pick: 'option', ask: 'For this address, which chip will answer?', options: ['the lower chip', 'the upper chip', 'both chips'], answer: (fr, i, inp) => (inp.mode === 'width' ? 'both chips' : (inp.addr >> 3) & 1 ? 'the upper chip' : 'the lower chip'), explain: (fr) => fr[1].say },
    ],
    quiz: [
      { q: 'How many 256 × 4 chips make a 1024 × 8 memory?', options: ['2', '4', '8', '16'], answer: 2, why: 'Two side by side for 8 bits, four deep for 1024 words: 2 × 4.' },
      { q: 'Chips placed side by side for width share…', options: ['the data lines', 'the address and chip select', 'nothing', 'only power'], answer: 1, why: 'They work together on every access.' },
      { q: 'For depth expansion with four chips, the high address bits go to…', options: ['a 2-to-4 decoder driving the chip selects', 'every chip\'s address pins', 'the data bus', 'the write enable'], answer: 0, why: 'Exactly one chip is selected for each address.' },
      { q: 'Why must the chips\' outputs be tristate in depth expansion?', options: ['To go faster', 'So the unselected chips release the shared data bus', 'To store more', 'They need not be'], answer: 1, why: 'Otherwise every chip would drive the same lines.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // ROM as a truth table
  // ---------------------------------------------------------------------------------------------------
  const ROMS = {
    square: { label: 'Squares of 0 to 7', w: 6, word: (m) => m * m, say: 'n² for n = 0..7, six bits wide' },
    gray: { label: 'Binary to Gray code', w: 3, word: (m) => m ^ (m >> 1), say: 'the Gray code of each address' },
    seg: { label: 'Count of ones', w: 2, word: (m) => ((m >> 2) & 1) + ((m >> 1) & 1) + (m & 1), say: 'how many of the three address bits are 1' },
  };
  S.topic({
    id: 'rom-truth-table', family: 'p8-memory', order: 50, title: 'ROM: a truth table in silicon',
    blurb: 'A ROM with k address bits and n data bits stores any n functions of k variables: its contents are their truth table. Inside, a fixed decoder makes every minterm (the AND plane) and a programmed OR plane joins each minterm to the outputs that are 1 there.',
    inputs: [
      { id: 'table', kind: 'choice', label: 'Contents', def: 'square', options: Object.entries(ROMS).map(([k, v]) => ({ value: k, label: v.label })) },
      { id: 'reads', kind: 'text', label: 'Addresses to read', def: '3, 6', check: (v) => { const xs = String(v).split(/[\s,]+/).filter(Boolean); return !xs.length || xs.length > 4 || xs.some((x) => !/^[0-7]$/.test(x)) ? 'Addresses: one to four, from 0 to 7' : null; } },
    ],
    presets: [{ label: 'Squares: read 3 and 6', values: { table: 'square', reads: '3, 6' } }, { label: 'Gray code: read 5, 2', values: { table: 'gray', reads: '5, 2' } }, { label: 'Count of ones: read 7, 0, 4', values: { table: 'seg', reads: '7, 0, 4' } }],
    counters: [{ id: 'dots', label: 'connections programmed' }],
    run(inp) {
      const R = ROMS[inp.table], w = R.w, words = [...Array(8).keys()].map(R.word);
      const outs = [...Array(w).keys()].reverse().map((i) => 'D' + i);
      const ins = ['A2', 'A1', 'A0'];
      const rows = [...Array(8).keys()].map((m) => ({ label: 'm' + m }));
      const F = new S.Frames(['dots']);
      const tbl = K.table.draw({ prefix: 'tt', x: 0, y: 0, mono: true, minW: 30, ch: 26, size: 14, colHead: ins.concat(outs), rows: words.map((v, m) => bits(m, 3).split('').concat(bits(v, w).split(''))), cls: (r, c) => (c >= 3 ? 'out' : '') });
      F.add({ items: tbl.items.concat(title('h', 0, -14, R.label + ': the truth table')), say: 'The contents: ' + R.say + '. Eight rows of ' + w + ' bits, 8 × ' + w + ' = ' + 8 * w + ' bits. Stored in a ROM, the address is the input and the word is the output.', scene: 't' });
      const orf = (upto) => (ri, k) => ri <= upto && ((words[ri] >> (w - 1 - k)) & 1) === 1;
      const draw = (upto, env, hotRow) => K.pla.draw({ prefix: 'rom', x: 0, y: 0, inputs: ins, rows, outputs: outs, decoder: true, or: orf(upto), env, hotRow, blown: true });
      let dots = 0;
      [1, 3, 5, 7].forEach((upto) => {
        for (let m = upto - 1; m <= upto; m++) dots += [...bits(words[m], w)].filter((b) => b === '1').length;
        F.set('dots', dots);
        F.add({ items: draw(upto, null, upto).items, say: 'Programming rows ' + (upto - 1) + ' and ' + upto + ': a connection (a dot) wherever the stored bit is 1: ' + [upto - 1, upto].map((m) => 'word ' + m + ' = ' + bits(words[m], w)).join(', ') + '. Faint spots are places left unconnected.', scene: 'rom' });
      });
      const sim = (() => { const c = new N.Circuit('rom'); const r = c.add('ROM', { aw: 3, dw: w, data: words.map(hex).join(' ') }, 'rom'); c.connect(c.input('A', 3), r.pin('a')); c.connect(r.pin('d'), c.output('D', w)); return { c, s: L.sim(c) }; })();
      String(inp.reads).split(/[\s,]+/).filter(Boolean).map(Number).forEach((m) => {
        L.apply(sim.s, { A: m });
        const v = sim.s.num('D');
        const env = { A2: (m >> 2) & 1, A1: (m >> 1) & 1, A0: m & 1 };
        F.add({ items: draw(7, env, m).items, say: 'Read address ' + bits(m, 3) + ': the decoder raises word line m' + m + ' only, and each output OR gate sees a 1 wherever that line has a dot. The ROM on the simulator returns ' + bits(v, w) + ' = ' + v + '.', scene: 'rom', meta: { addr: m, v } });
      });
      L.views(F.list);
      return { frames: F.list, def: { sections: [{ id: 'eq', kind: 'math', title: 'A ROM as logic', text: ['2^k × n ROM = n functions of k variables', 'AND plane: a fixed k-to-2^k decoder', '  (every minterm)', 'OR plane: programmed, one dot per 1', 'D(i) = OR of the minterms where bit i is 1'].join('\n') }] } };
    },
    predict: [{ at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.addr !== undefined, pick: 'option', ask: 'What word will the ROM return for the next address?', options: (fr, i, inp) => { const R = ROMS[inp.table], v = fr[i + 1].meta.v; return [...new Set([v, R.word((fr[i + 1].meta.addr + 1) % 8), R.word((fr[i + 1].meta.addr + 7) % 8), v ^ 1])].map((x) => bits(x, R.w)); }, answer: (fr, i, inp) => bits(fr[i + 1].meta.v, ROMS[inp.table].w), explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'A 32 × 8 ROM can implement…', options: ['8 functions of 5 variables', '5 functions of 8 variables', '32 functions of 8 variables', '256 functions'], answer: 0, why: '5 address bits are the variables; 8 output bits are the functions.' },
      { q: 'In a ROM, the AND plane is…', options: ['programmable', 'a fixed decoder making every minterm', 'absent', 'an OR plane'], answer: 1, why: 'Every address has its own word line.' },
      { q: 'A dot in the OR plane at (m5, D2) means…', options: ['bit 2 of word 5 is 1', 'word 2 is 5', 'address 5 is unused', 'D2 is always 1'], answer: 0, why: 'Each connection stores one 1.' },
      { q: 'Why might a ROM be wasteful for a function with few 1s?', options: ['It still decodes every minterm', 'It cannot store 0s', 'It is slow', 'It needs a clock'], answer: 0, why: 'A PLA would build only the product terms needed.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // ROM types
  // ---------------------------------------------------------------------------------------------------
  const TYPES = [
    { name: 'Mask ROM', how: 'a transistor made or left out', prog: 'at the factory, by the last mask', erase: 'never', times: 'once', use: 'large runs of a fixed program' },
    { name: 'PROM', how: 'a fuse left whole or blown', prog: 'by the user, once, with high current', erase: 'never', times: 'once', use: 'small runs, one-off tables' },
    { name: 'EPROM', how: 'charge trapped on a floating gate', prog: 'by the user, in a programmer', erase: 'all at once, by ultraviolet light through a window', times: 'many (hundreds)', use: 'development, before a design is final' },
    { name: 'EEPROM', how: 'charge on a floating gate', prog: 'electrically, in the circuit', erase: 'electrically, one byte at a time', times: 'many (about 10⁵ to 10⁶)', use: 'settings that change now and then' },
    { name: 'Flash', how: 'charge on a floating gate', prog: 'electrically, in the circuit', erase: 'electrically, a whole block at a time', times: 'many (about 10⁴ to 10⁵)', use: 'firmware, memory cards, solid-state drives' },
  ];
  S.topic({
    id: 'rom-types', family: 'p8-memory', order: 60, title: 'Kinds of ROM',
    blurb: 'All ROMs keep their contents with the power off; they differ in how a bit is stored and who can change it, how, and how often. A word is written into each kind to show what programming and erasing mean for it.',
    inputs: [{ id: 'word', kind: 'text', label: 'Word to store', def: '1011', check: (v) => (/^[01]{4}$/.test(v) ? null : 'Word: four bits') }],
    presets: [{ label: 'Store 1011', values: { word: '1011' } }, { label: 'Store 0110', values: { word: '0110' } }],
    counters: [{ id: 'kinds', label: 'kinds' }],
    run(inp) {
      const word = inp.word;
      const F = new S.Frames(['kinds']);
      const cellsFor = (t, k, stage) => {
        // four storage spots: how each kind represents the word (stage: 'blank', 'programmed', 'erased')
        const items = [];
        const blank = { 'Mask ROM': null, PROM: '1', EPROM: '1', EEPROM: '1', Flash: '1' }[t.name];
        [...word].forEach((b, i) => {
          const v = stage === 'programmed' ? b : stage === 'erased' ? '1' : blank;
          const x = 300 + i * 112, y = 40;
          let text = v === null ? '?' : v, sub = '', cls = 'p4-bit';
          if (t.name === 'PROM') { sub = v === '0' ? 'fuse blown' : 'fuse whole'; cls += v === '0' ? ' bad' : ' good'; }
          else if (t.name === 'Mask ROM') { sub = v === null ? 'not made yet' : v === '1' ? 'transistor' : 'no transistor'; cls += v === '1' ? ' good' : v === '0' ? ' read' : ''; }
          else { sub = v === '0' ? 'charged' : 'no charge'; cls += v === '0' ? ' hot' : ''; }
          items.push({ key: 'sp' + i, kind: 'cell', x: x + 18, y, w: 62, h: 44, text, cls, size: 18 });
          items.push({ key: 'sb' + i, kind: 'text', x: x + 49, y: y + 62, text: sub, anchor: 'middle', cls: 'p4-note', size: 12 });
        });
        items.push({ key: 'sl', kind: 'text', x: 300, y: 22, text: stage === 'programmed' ? 'programmed with ' + word : stage === 'erased' ? 'after erasing' : 'as it comes', cls: 'title' });
        return items;
      };
      const tbl = (hot) => K.table.draw({ prefix: 'rt', x: 0, y: 150, size: 13, ch: 30, colHead: ['kind', 'a bit is', 'erased'], rows: TYPES.map((t) => [t.name, t.how, t.erase === 'never' ? 'never' : t.erase.split(',')[0]]), cls: (r) => (r === hot ? 'act' : '') });
      TYPES.forEach((t, k) => {
        F.set('kinds', k + 1);
        const base = tbl(k).items.concat([title('kn', 0, 30, t.name, 'strong', 18), { key: 'kh', kind: 'text', x: 0, y: 56, text: 'programmed ' + t.prog.split(',')[0], cls: 'p4-note', size: 13 }]);
        F.add({ items: base.concat(cellsFor(t, k, 'blank')), say: t.name + ': a bit is ' + t.how + '. It is programmed ' + t.prog + '.', scene: 'k', meta: { kind: t.name } });
        F.add({ items: base.concat(cellsFor(t, k, 'programmed')), say: 'Programmed with ' + word + '. ' + (t.erase === 'never' ? 'It can never be changed: a new word means a new chip.' : 'It can be erased ' + t.erase + ', and rewritten ' + t.times + ' times.') + ' Typical use: ' + t.use + '.', scene: 'k', meta: { kind: t.name, erasable: t.erase !== 'never' } });
        if (t.erase !== 'never') F.add({ items: base.concat(cellsFor(t, k, 'erased')), say: 'Erased: every bit returns to 1 (no charge), ready to be programmed again. ' + (t.name === 'EEPROM' ? 'An EEPROM can erase just one byte; flash erases a whole block, which is why it is cheaper per bit.' : t.name === 'Flash' ? 'Erasing by blocks makes flash dense and cheap.' : 'Ultraviolet light erases the whole chip at once, out of the circuit.'), scene: 'k' });
      });
      L.views(F.list);
      return { frames: F.list, def: { sections: [{ id: 'tt', kind: 'table', title: 'ROM types', colHead: ['kind', 'erased', 'rewrites'], rows: TYPES.map((t) => [t.name, t.erase, t.times]) }] } };
    },
    predict: [{ at: (f, i, fr) => f.meta && f.meta.kind && !('erasable' in f.meta), pick: 'option', ask: 'Once programmed, can this kind be erased?', options: ['Yes', 'No'], answer: (fr, i) => (fr[i + 1].meta.erasable ? 'Yes' : 'No'), explain: (fr, i) => fr[i + 1].say }],
    quiz: [
      { q: 'Which ROM is programmed by blowing fuses?', options: ['Mask ROM', 'PROM', 'EPROM', 'Flash'], answer: 1, why: 'A blown fuse is permanent: programmable once.' },
      { q: 'An EPROM is erased by…', options: ['a high voltage on one byte', 'ultraviolet light', 'blowing fuses', 'it cannot be'], answer: 1, why: 'Through a quartz window on the package.' },
      { q: 'Flash memory erases…', options: ['one bit at a time', 'one byte at a time', 'a block at a time', 'never'], answer: 2, why: 'Block erase is what makes it dense and cheap.' },
      { q: 'Which keeps its contents with the power off?', options: ['only mask ROM', 'every kind of ROM', 'only flash', 'none'], answer: 1, why: 'That is what read-only (non-volatile) memory is for.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
