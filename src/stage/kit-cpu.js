// The processor on the stage (Sirkit.Cpu): the datapath as blocks on a common bus (memory with the word at AR
// lit, the registers with their values, the ALU between DR and AC, the flags), the transfer of one cycle drawn
// as the source driving the bus and the destination loading from it; the timing signals T0..Tn as waveforms; an
// instruction byte split into its fields; a microinstruction's fields; and an assembly listing.
//
//   S.Kit.cpu.datapath({ x, y, regs, mem, ops, bus, changed, focus, prefix }) -> { items, box }
//   S.Kit.cpu.timing({ x, y, w, Ts: [T of each cycle], now, n }) -> { items, box }
//   S.Kit.cpu.bits({ x, y, byte, fields: [{from, to, label, cls}] }) -> { items, box }
//   S.Kit.cpu.listing({ x, y, lines: [{addr, bytes, text}], hot, maxRows }) -> { items, box }
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const CK = (K.cpu = {});
  const Geo = () => S.geom;
  const hex = (v) => (v === undefined || v === null ? '--' : (v & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  CK.hex = hex;
  const RW = 72, RH = 60, RG = 14, MW = 124, MR = 30;

  /**
   * The datapath. regs {PC, AR, IR, AC, DR, SP, Z, C, N, OUTR, INPR}; mem (256 bytes); ops: the micro-operations of
   * the cycle (names of Sirkit.Cpu.MICRO); bus {src, value}; changed: register names written this cycle (their
   * new value is shown); focus: the address shown in the middle of the memory (AR by default); names: {addr: label}
   */
  CK.datapath = function (o) {
    const P = o.prefix || 'dp', X = o.x || 0, Y = o.y || 0, rg = o.regs || {}, items = [];
    const ops = o.ops || [], MI = S.Cpu.MICRO;
    const used = ops.map((n) => MI[n]).filter(Boolean);
    const srcs = new Set(used.filter((u) => u.src).map((u) => (u.src === 'M' ? 'M' : u.src)));
    const dsts = new Set(used.filter((u) => u.dst).map((u) => u.dst));
    for (const n of ops) {
      if (n === 'PC+') dsts.add('PC');
      if (n === 'SP-' || n === 'SP+') dsts.add('SP');
      if (['AC←DR', 'ADD', 'SUB', 'AND', 'OR', 'NOT', 'SHL', 'SHR'].includes(n)) dsts.add('AC');
    }
    const alu = ops.filter((n) => ['AC←DR', 'ADD', 'SUB', 'AND', 'OR', 'NOT', 'SHL', 'SHR'].includes(n));
    const changed = new Set(o.changed || []);
    // memory: rows around the focus address
    const rows = o.memRows || 7, focus = o.focus === undefined ? rg.AR || 0 : o.focus;
    const a0 = Math.max(0, Math.min(256 - rows, focus - Math.floor(rows / 2)));
    const memTop = Y + 34, memH = rows * MR + 12, Ub = memTop + memH, B = Ub + 46;
    items.push({ key: P + ':memf', kind: 'cell', x: X, y: memTop, w: MW, h: memH, rx: 8, text: '', cls: 'dp-memframe' + (srcs.has('M') ? ' src' : '') + (dsts.has('M') ? ' dst' : '') });
    items.push({ key: P + ':memt', kind: 'text', x: X + MW / 2, y: memTop - 10, text: 'memory', anchor: 'middle', cls: 'dp-title', size: 15 });
    for (let k = 0; k < rows; k++) {
      const a = a0 + k, at = a === (rg.AR || 0);
      const nm = o.names && o.names[a] ? ' ' + o.names[a] : '';
      const wrote = changed.has('M[' + hex(a) + ']');
      items.push({ key: P + ':m:' + a, kind: 'cell', x: X + 6, y: memTop + 6 + k * MR, w: MW - 12, h: MR, rx: 0, text: hex(a) + ' ' + hex(o.mem ? o.mem[a] : 0) + nm, size: 15, align: 'left', cls: 'dp-mem' + (at ? ' at' : '') + (wrote ? ' chg' : '') + (at && (srcs.has('M') || dsts.has('M')) ? ' busy' : '') });
    }
    // registers
    const upper = ['AR', 'PC', 'IR', 'SP', 'INPR', 'OUTR'];
    const xr = X + MW + 52;
    const pos = {};
    upper.forEach((r, i) => { pos[r] = { x: xr + i * (RW + RG), y: Ub - RH }; });
    pos.DR = { x: xr + 1 * (RW + RG), y: B + 44 };
    pos.ALU = { x: xr + 2 * (RW + RG), y: B + 44 };
    pos.AC = { x: xr + 3 * (RW + RG), y: B + 44 };
    const regCell = (r) => {
      const v = r === 'ALU' ? null : rg[r];
      const cls = ['dp-reg', r === 'ALU' ? 'alu' : '', srcs.has(r) ? 'src' : '', dsts.has(r) ? 'dst' : '', changed.has(r) ? 'chg' : '', r === 'ALU' && alu.length ? 'busy' : ''].filter(Boolean).join(' ');
      const lines = r === 'ALU' ? ['ALU', alu.length ? (MI[alu[0]].rtl.includes('+') ? '+' : MI[alu[0]].rtl.includes('−') ? '−' : alu[0] === 'AC←DR' ? 'pass' : alu[0].toLowerCase()) : ''] : [r, v === undefined ? '--' : hex(v)];
      return { key: P + ':r:' + r, kind: 'cell', x: pos[r].x, y: pos[r].y, w: RW, h: RH, rx: 8, lines, size: 15, cls };
    };
    for (const r of Object.keys(pos)) items.push(regCell(r));
    // flags beside AC
    ['Z', 'C', 'N'].forEach((f, i) => items.push({ key: P + ':f:' + f, kind: 'cell', x: pos.AC.x + RW + 18 + i * 52, y: pos.AC.y + 12, w: 46, h: 36, rx: 6, text: f + ' ' + (rg[f] === undefined ? 0 : rg[f]), size: 15, cls: 'dp-flag' + (changed.has(f) ? ' chg' : '') + (rg[f] ? ' set' : '') }));
    // the bus
    const xEnd = pos.OUTR.x + RW / 2 + 30;
    const busy = !!o.bus;
    items.push({ key: P + ':bus', kind: 'line', x1: X + MW / 2, y1: B, x2: xEnd, y2: B, cls: 'dp-bus' + (busy ? ' busy' : ''), audit: 'edge-x' });
    items.push({ key: P + ':busl', kind: 'text', x: xEnd + 8, y: B + 5, text: busy ? 'bus = ' + hex(o.bus.value) : 'bus', anchor: 'start', cls: 'dp-busl' + (busy ? ' busy' : ''), size: 15 });
    const stub = (key, cellKey, cx, fromBus, cls) => items.push(fromBus
      ? { key: P + ':st:' + key, kind: 'edge', from: { x: cx, y: B }, to: cellKey, cls: 'dp-stub ' + cls, head: cls.includes('load') }
      : { key: P + ':st:' + key, kind: 'edge', from: cellKey, to: { x: cx, y: B }, cls: 'dp-stub ' + cls, head: cls.includes('drive') });
    const role = (r) => (srcs.has(r === 'M' ? 'M' : r) ? 'drive' : used.some((u) => u.dst === r) ? 'load' : 'idle');
    stub('M', P + ':memf', X + MW / 2, role('M') === 'load', role('M'));
    for (const r of upper.concat(['DR', 'AC'])) { const ro = role(r); stub(r, P + ':r:' + r, pos[r].x + RW / 2, ro === 'load', ro); }
    // the ALU between DR and AC
    const aluOn = alu.length > 0;
    items.push({ key: P + ':a1', kind: 'edge', from: P + ':r:DR', to: P + ':r:ALU', cls: 'dp-alu' + (aluOn && alu[0] !== 'NOT' && alu[0] !== 'SHL' && alu[0] !== 'SHR' ? ' busy' : '') });
    items.push({ key: P + ':a2', kind: 'edge', from: P + ':r:AC', to: P + ':r:ALU', bend: 12, cls: 'dp-alu' + (aluOn && alu[0] !== 'AC←DR' ? ' busy' : '') });
    items.push({ key: P + ':a3', kind: 'edge', from: P + ':r:ALU', to: P + ':r:AC', bend: 12, cls: 'dp-alu' + (aluOn ? ' busy' : '') });
    // the address: AR points at its word
    // the address: AR points at its word (at the frame's edge, on the word's row, so it crosses no other word)
    const arVisible = (rg.AR || 0) >= a0 && (rg.AR || 0) < a0 + rows;
    const ay = arVisible ? memTop + 6 + ((rg.AR || 0) - a0) * MR + MR / 2 : memTop + memH / 2;
    items.push({ key: P + ':addr', kind: 'edge', from: P + ':r:AR', to: { x: X + MW + 2, y: ay }, cls: 'dp-addr' + (srcs.has('M') || dsts.has('M') ? ' busy' : '') });
    const W = xEnd + 8 + Geo().textWidth('bus = FF', 15, { bold: true }) - X;
    return { items, box: { x: X, y: Y, w: W, h: pos.AC.y + RH - Y }, B, pos };
  };

  /** headings and table heads at the picture's text size (15), so nothing in a figure is drawn smaller */
  CK.big = function (items, min) {
    const m = min || 15;
    for (const it of items) {
      if (it.kind === 'text' && / ?title ?/.test(' ' + (it.cls || '') + ' ') && !(it.size >= m)) it.size = m;
      if (it.kind === 'cell' && / head /.test(' ' + (it.cls || '') + ' ') && !(it.size >= m)) it.size = m;
    }
    return items;
  };

  /** the timing signals: T0..T(n−1), each 1 during the cycles it marks; o.now is the index of the cycle shown */
  CK.timing = function (o) {
    const n = o.n || Math.max(4, ...o.Ts.map((t) => t + 1)), P = o.prefix || 'tm';
    const len = Math.max(o.total || 0, o.Ts.length), known = o.Ts.length;
    const sigs = [], clk = [];
    for (let k = 0; k < len; k++) clk.push([k, 1], [k + 0.5, 0]);
    sigs.push({ name: 'CLK', changes: clk });
    for (let t = 0; t < n; t++) {
      const ch = [[0, o.Ts[0] === t ? 1 : 0]];
      for (let k = 1; k < len; k++) { const v = k < known && o.Ts[k] === t ? 1 : 0; if (v !== ch[ch.length - 1][1]) ch.push([k, v]); }
      sigs.push({ name: 'T' + t, changes: ch, cls: o.now !== undefined && o.Ts[o.now] === t ? 'hotwave' : '' });
    }
    const w = K.wave.draw({ x: o.x || 0, y: o.y || 0, w: o.w || Math.max(260, len * 46), signals: sigs, t0: 0, t1: len, cursor: o.now === undefined ? undefined : o.now + 0.5, prefix: P, ticks: 0, rowH: 16, gap: 7, unit: '' });
    // the cycle's timing signal under the rows; names as large as the rest of the picture
    const items = w.items;
    for (const it of items) if (it.key.startsWith(P + ':n:')) it.size = 15;
    const yb = w.box.y + w.box.h - 6;
    // a label under every cycle only when there is room for one; otherwise under the cycle shown
    const room = (w.xOf(1) - w.xOf(0)) >= 34;
    for (let k = 0; k < known; k++) if (room || k === o.now) items.push({ key: P + ':c:' + k, kind: 'text', x: w.xOf(k + 0.5), y: yb + 4, text: 'T' + o.Ts[k], anchor: 'middle', size: 15, cls: 'tm-cyc' + (k === o.now ? ' hot' : '') });
    return { items, box: { x: w.box.x, y: w.box.y, w: w.box.w, h: w.box.h + 12 }, xOf: w.xOf };
  };

  /** a byte as eight bit cells, fields bracketed under them; o: {x, y, byte, fields: [{from, to, label, cls}], prefix, title} */
  CK.bits = function (o) {
    const P = o.prefix || 'bt', X = o.x || 0, Y = o.y || 0, cw = o.cw || 38, items = [];
    if (o.title) items.push({ key: P + ':title', kind: 'text', x: X, y: Y - 26, text: o.title, cls: 'title' });
    for (let i = 0; i < 8; i++) {
      const bit = (o.byte >> (7 - i)) & 1;
      const f = (o.fields || []).find((q) => i >= q.from && i <= q.to);
      items.push({ key: P + ':n:' + i, kind: 'text', x: X + i * cw + cw / 2, y: Y - 6, text: String(7 - i), anchor: 'middle', cls: 'tm-cyc', size: 13 });
      items.push({ key: P + ':b:' + i, kind: 'cell', x: X + i * cw, y: Y, w: cw, h: 40, rx: 0, text: String(bit), size: 17, cls: 'bit-cell ' + (f && f.cls ? f.cls : '') });
    }
    for (const f of o.fields || []) items.push({ key: P + ':f:' + f.from, kind: 'bracket', x1: X + f.from * cw, x2: X + (f.to + 1) * cw, y: Y + 46, side: 'below', text: f.label, cls: f.cls || '' });
    return { items, box: { x: X, y: Y - (o.title ? 40 : 18), w: 8 * cw, h: 40 + 46 + (o.title ? 40 : 18) }, under: { x: X + 4 * cw, y: Y + 46 + 40 } };
  };

  /** an assembly listing: address, bytes and source line; hot is the index of the line lit */
  CK.listing = function (o) {
    const lines = o.lines || [];
    // a comment line is shortened: the column is for code
    const cut = (x, n) => (x.length > n ? x.slice(0, n - 1) + '…' : x);
    const src = (t) => { const code = t.replace(/\s+/g, ' ').replace(/\s*;.*$/, '').trim(); if (code) return cut(code, 17); const c = t.trim(); return c.length > 12 ? c.slice(0, 11) + '…' : c; };
    const rows = lines.map((l) => [l.addr === undefined || l.addr === null ? '' : hex(l.addr), cut((l.bytes || []).map(hex).join(' '), 9), src(l.text)]);
    const t = K.table.draw({ x: o.x || 0, y: o.y || 0, prefix: o.prefix || 'ls', rows, colHead: ['addr', 'bytes', 'source'], mono: true, size: 15, minH: 30, ch: 30, hot: o.hot === undefined || o.hot === null ? [] : [[o.hot, 0], [o.hot, 1], [o.hot, 2]], act: o.act || [], maxRows: o.maxRows, focus: o.hot === undefined || o.hot === null ? undefined : [o.hot, 0], title: o.title, cls: () => 'ls-cell' });
    // the source column reads from the left
    for (const it of t.items) if (/:\d+,2$/.test(it.key) && it.kind === 'cell') it.align = 'left';
    CK.big(t.items);
    return t;
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
