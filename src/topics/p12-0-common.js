// Part 12, Verilog: the families and what the topics share. Every picture has the code on the left (the line
// running lit, a cursor beside it, values written at the end of lines) and on the right whatever the code
// stands for: the circuit it builds, the waveforms it makes, the scheduler's queues. On a phone a frame's close
// view is the code with its values, or the picture when the frame is about the picture.
(function (S) {
  'use strict';
  const K = S.Kit;
  const P = (S.P12 = {});
  /** the most lines a listing shows at once, and the fewest a window into a long one shows */
  P.WINDOW = 24;
  P.MINWINDOW = 12;
  /** the listing's type size, and the tallest a picture is drawn (stage units, margins aside): a 1000 × 585
   * desktop stage then draws it at 0.85 or more, so the code stays above 11 pixels */
  P.FS = 14;
  P.MAXH = 600;

  S.family({ id: 'p12-basics', part: 'verilog', order: 10, title: 'Structure and dataflow', blurb: 'Modules and ports, gate primitives with delays, continuous assignment with Verilog\'s width and sign rules, and the four values 0, 1, x and z.' });
  S.family({ id: 'p12-behaviour', part: 'verilog', order: 20, title: 'Behavioural code', blurb: 'Always blocks and sensitivity lists, blocking and non-blocking assignment in the scheduler, if, case, casez and loops, and the latches that incomplete code builds.' });
  S.family({ id: 'p12-reuse', part: 'verilog', order: 30, title: 'Parameters, generate and hierarchy', blurb: 'Designs that size themselves, loops that build hardware, functions and tasks, and modules inside modules.' });
  S.family({ id: 'p12-fsm', part: 'verilog', order: 40, title: 'State machines in Verilog', blurb: 'The usual ways of writing a state machine, and the state register and logic each one becomes.' });
  S.family({ id: 'p12-tests', part: 'verilog', order: 50, title: 'Testbenches', blurb: 'Initial blocks and delays, $display and $monitor, testbenches that check themselves, test vectors from a file, and waveform dumps.' });
  S.family({ id: 'p12-synth', part: 'verilog', order: 60, title: 'Synthesis', blurb: 'What a synthesis tool can draw and what it cannot, and the same circuit reached from Verilog and from a schematic.' });

  // ---- values and words -------------------------------------------------------------------------------------
  /** a value in binary, or in decimal when it is wider than 8 bits and fully known (an integer) */
  const show = (v) => { if (Array.isArray(v) && v.length > 8) { const n = K.code.num(v); if (n !== null) return String(v[v.length - 1] === 1 && v.length === 32 ? n - 2 ** 32 : n); if (v.every((b) => b === v[0])) return String(v[0]).toLowerCase(); } return K.code.show(v); };
  P.show = show;
  /** a value for the narration: 1-bit as is, a bus as its bits and (when known) its decimal value */
  P.say = (v) => { const b = show(v); if (b.length === 1) return b; const n = K.code.num(v); return b + (n === null ? '' : ' (' + n + ')'); };
  /** a signal's name without the testbench's own scope: tb.dut.y -> dut.y, tb.a -> a */
  P.short = (n) => String(n).replace(/^[^.]+\./, '');
  P.ns = (t) => (Math.round(t * 100) / 100) + ' ns';
  P.plural = (n, w, ws) => n + ' ' + (n === 1 ? w : ws || w + 's');
  P.lineText = (src, n) => (K.code.lines(src)[n - 1] || '').trim();
  /** the whole statement that starts on line n, gathered over the lines it runs on (brackets left open carry on), spaces collapsed */
  P.stmtText = (src, n) => {
    const ls = K.code.lines(src);
    let txt = '', depth = 0, k = n - 1;
    do {
      const l = (ls[k] || '').replace(/\/\/.*$/, (c) => (depth ? '' : c));
      txt += (txt ? ' ' : '') + l.trim();
      for (const ch of l.replace(/"[^"]*"/g, '').replace(/\/\/.*$/, '')) depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
      k++;
    } while (depth > 0 && k < ls.length && k < n + 6);
    return txt.replace(/\s+/g, ' ');
  };
  P.findLine = (src, re) => { const ls = K.code.lines(src); const i = ls.findIndex((l) => (typeof re === 'string' ? l.includes(re) : re.test(l))); return i < 0 ? null : i + 1; };

  // ---- the picture ------------------------------------------------------------------------------------------
  /** a stack of blocks, each (x, y) -> {items, box}, from (x, y) down, with a gap: {items, box} */
  P.stack = function (x, y, blocks, gap) {
    const items = [];
    let yy = y, box = null;
    for (const b of blocks.filter(Boolean)) {
      const r = b(x, yy);
      if (!r) continue;
      items.push(...r.items);
      box = box ? S.geom.union([box, r.box]) : r.box;
      yy = r.box.y + r.box.h + (gap === undefined ? 34 : gap);
    }
    return { items, box: box || { x, y, w: 0, h: 0 } };
  };
  /**
   * The scene: o = {code: draw options for the listing (src, hot, notes, marks, title), under: [blocks] (below
   * the code: values, output), right: [blocks] (the circuit, the waves), focus: 'code' | 'right' (the close view
   * on a phone)}. Returns a frame's {items, narrowView}.
   */
  P.scene = function (o) {
    // the listing's type and line height; a long listing shows a window of lines around the ones lit (the same
    // height in every frame), as many as fit beside what goes under it, so that at desktop size the whole
    // picture is drawn at a scale that keeps the code readable
    const fs = o.code.size || P.FS, lh = o.code.lh || Math.round(fs * 1.55);
    // stacked (for a wide picture): the blocks that usually go on the right go under the code and its values
    const stacked = o.layout === 'stack';
    const under = P.stack(0, 0, (o.under || []).concat(stacked ? o.right || [] : []), 22);
    const room = P.MAXH - 46 - (under.items.length ? under.box.h + 26 : 0);
    const W = o.code.window || Math.max(P.MINWINDOW, Math.min(P.WINDOW, Math.floor(room / lh))), n = K.code.lines(o.code.src).length;
    let win = {};
    if (n > W) {
      const hot = [].concat(o.code.hot || []).filter(Boolean).sort((a, b) => a - b);
      const mid = hot.length ? (hot[0] + hot[hot.length - 1]) / 2 : 1;
      const from = Math.max(1, Math.min(n - W + 1, Math.round(mid - W / 2) + 1));
      win = { from, to: from + W - 1, minChars: Math.max(...K.code.lines(o.code.src).map((l) => l.length)) };
    }
    const title = (o.code.title || 'Code') + (n > W ? ' (lines ' + win.from + '–' + win.to + ' of ' + n + ')' : '');
    const code = K.code.draw(Object.assign({ prefix: 'code', size: fs, lh }, o.code, win, { title }));
    const left = P.stack(0, code.box.y + code.box.h + 26, o.under || [], 22);
    const lbox = left.items.length ? S.geom.union([code.box, left.box]) : code.box;
    const rx = lbox.x + lbox.w + 56;
    const right = stacked ? P.stack(0, lbox.y + lbox.h + 34, o.right || [], 34) : P.stack(rx, 0, o.right || [], 34);
    const items = code.items.concat(left.items, right.items);
    const pad = (b) => ({ x: b.x - 12, y: b.y - 12, w: b.w + 24, h: b.h + 24 });
    const narrowView = o.focus === 'right' && right.items.length ? pad(right.box) : pad(lbox);
    return { items, narrowView, code, lbox, rbox: right.box };
  };
  /** blocks side by side, from (x, y) rightwards, with a gap: (x, y) -> {items, box} */
  P.row = (blocks, gap) => (x, y) => {
    const items = [];
    let xx = x, box = null;
    for (const b of blocks.filter(Boolean)) {
      const r = b(xx, y);
      if (!r) continue;
      items.push(...r.items);
      box = box ? S.geom.union([box, r.box]) : r.box;
      xx = r.box.x + r.box.w + (gap === undefined ? 40 : gap);
    }
    return box ? { items, box } : null;
  };
  /** a frame from a scene: say, plus anything else (meta, hl, mark) */
  P.frame = (sc, say, extra) => Object.assign({ items: sc.items, narrowView: sc.narrowView, say }, extra || {});

  /** a heading over a block */
  const heading = (key, x, y, text) => ({ key, kind: 'text', x, y: y + 14, text, cls: 'title', size: 14 });
  P.heading = heading;

  /** the circuit block: a laid-out circuit with values {net: '0'|'1'|...} and parts lit */
  P.circuit = (res, o) => (x, y) => {
    if (!res) return null;
    o = o || {};
    const top = o.title === '' ? y : y + 30;
    const items = o.title === '' ? [] : [heading((o.key || 'circ') + ':h', x, y, o.title || 'The circuit it builds')];
    items.push(K.schem.item(o.key || 'circ', res, Object.assign({ x, y: top, values: o.values, hot: o.hot || [] }, o.textScale ? { textScale: o.textScale } : {})));
    return { items, box: { x, y, w: Math.max(res.bounds.w, S.geom.textWidth(o.title || 'The circuit it builds', 13, { bold: true }) * 1.1), h: top - y + res.bounds.h } };
  };

  /** can this layout be drawn on the stage cleanly: no wires crossing (rails aside) and not too wide */
  P.drawable = (res) => !!res && !res.crossingCount && res.bounds.w <= (P.maxW || 720);
  /** words wrapped to lines of at most n characters */
  P.wrap = (text, n) => { const out = []; let line = ''; for (const w of String(text).split(/\s+/)) { if (line && (line + ' ' + w).length > n) { out.push(line); line = w; } else line = line ? line + ' ' + w : w; } if (line) out.push(line); return out; };
  /**
   * What a module builds: its circuit when it draws cleanly, else the synthesis tool's own account of it, line by
   * line (so any code a student writes gets a picture). hw from Kit.code.hardware; o as P.circuit, plus t.
   */
  P.built = (hw, o) => (x, y) => {
    o = o || {};
    if (!hw || !hw.ok) {
      const why = hw && hw.reasons && hw.reasons.length ? hw.reasons.map((r) => (r.line ? 'line ' + r.line + ': ' : '') + (r.msg || r)).join('; ') : 'it cannot be built';
      return P.lines(['This code cannot be drawn as a circuit:'].concat(P.wrap(why, 52)), { title: o.title || 'The circuit it builds', key: (o.key || 'circ') + ':no', cls: 'vc-out' })(x, y);
    }
    if (hw.circuit.parts.length <= (o.maxParts || 18) && P.drawable(hw.res)) return P.circuit(hw.res, Object.assign({}, o, { values: o.values || (hw.values && o.t !== undefined ? hw.values(o.t) : undefined) }))(x, y);
    const say = (hw.trace || []).filter((s) => s.kind !== 'port').map((s) => s.say);
    return P.lines(['Too big to draw here; it becomes:'].concat(say.flatMap((l) => P.wrap('• ' + l, 52))), { title: o.title || 'The circuit it builds', key: (o.key || 'circ') + ':sum', cls: 'vc-out' })(x, y);
  };
  /** lines of text in a box, under a heading */
  P.lines = (lines, o) => (x, y) => {
    o = o || {};
    const key = o.key || 'ln', w = o.w || Math.max(200, ...lines.map((l) => S.geom.textWidth(l, 14, { mono: true }))) + 24;
    const items = [heading(key + ':h', x, y, o.title || '')];
    const top = y + 28;
    items.push({ key: key + ':box', kind: 'region', x, y: top, w, h: lines.length * 22 + 14, rx: 8, text: '', cls: 'vc-console', audit: 'group' });
    lines.forEach((l, i) => items.push({ key: key + ':l' + i, kind: 'text', x: x + 12, y: top + 22 + i * 22, text: l, cls: (o.cls || 'vc-out') + (o.hot && o.hot.includes(i) ? ' on' : ''), size: 14, mono: true }));
    return { items, box: { x, y, w, h: top - y + lines.length * 22 + 14 } };
  };

  /**
   * The waveform block: o = {waves (a Map from a run), rows: [name | {name, label}], t (now), t1, t0, w, marks,
   * spans, title, ticks}
   */
  P.waves = (o) => (x, y) => {
    const rows = o.rows.map((r) => (typeof r === 'string' ? { name: r } : r));
    const signals = rows.map((r) => ({ name: r.key || r.name, label: r.label || P.short(r.name), changes: r.changes || K.code.changes(o.waves, r.name), width: r.width || K.code.width(o.waves, r.name), cls: r.cls }));
    const top = o.title === '' ? y : y + 34;
    const wv = K.timing.waves({ x, y: top + 6, w: o.w || 420, t0: o.t0 || 0, t1: o.t1, now: o.t === undefined ? o.t1 : o.t, signals, marks: o.marks, spans: o.spans, ticks: o.ticks === undefined ? 4 : o.ticks, prefix: o.prefix || 'wv', cursor: o.cursor });
    const items = o.title === '' ? [] : [heading((o.prefix || 'wv') + ':h', x, y, o.title || 'Waveforms')];
    items.push(...wv.items);
    return { items, box: S.geom.union([{ x, y, w: 10, h: top - y }, wv.box]) };
  };

  /** a row of value badges: [{name, v, cls}] */
  P.badges = (list, o) => (x, y) => {
    o = o || {};
    if (!list.length) return null;
    const items = [], top = o.title === '' ? y : y + 28;
    if (o.title !== '') items.push(heading((o.key || 'bd') + ':h', x, y, o.title || 'Values now'));
    let xx = x, yy = top, maxX = x;
    const wrap = o.wrap || 420;
    for (const b of list) {
      const txt = b.name + ' = ' + b.v;
      const w = Math.max(64, S.geom.textWidth(txt, 15, { mono: true }) + 18);
      if (xx > x && xx + w - x > wrap) { xx = x; yy += 40; }
      items.push({ key: (o.key || 'bd') + ':' + b.name, kind: 'cell', x: xx, y: yy, w, h: 30, text: txt, cls: 'tw-badge vc-badge mono ' + (b.cls || ''), size: 15 });
      xx += w + 10; maxX = Math.max(maxX, xx - 10);
    }
    return { items, box: { x, y, w: maxX - x, h: yy + 30 - y } };
  };

  /** the console: the lines printed so far (the last few), in a box */
  P.console = (lines, o) => (x, y) => {
    o = o || {};
    const n = o.rows || 4, w = o.w || 420, shown = lines.slice(-n);
    const items = [heading((o.key || 'out') + ':h', x, y, o.title || 'Output')];
    const top = y + 28;
    items.push({ key: (o.key || 'out') + ':box', kind: 'region', x, y: top, w, h: n * 22 + 14, rx: 8, text: '', cls: 'vc-console', audit: 'group' });
    shown.forEach((l, i) => items.push({ key: (o.key || 'out') + ':l:' + (lines.length - shown.length + i), kind: 'text', x: x + 10, y: top + 22 + i * 22, text: l.length > Math.floor((w - 20) / 8.54) ? l.slice(0, Math.floor((w - 20) / 8.54) - 1) + '…' : l, cls: 'vc-out' + (o.hot && i === shown.length - 1 ? ' on' : ''), size: 14, mono: true }));
    if (!lines.length) items.push({ key: (o.key || 'out') + ':none', kind: 'text', x: x + 10, y: top + 22, text: '(nothing printed yet)', cls: 'vc-out vc-dim', size: 14, mono: true });
    return { items, box: { x, y, w, h: top - y + n * 22 + 14 } };
  };

  /** a small table block: rows of cells {x, y, head: [..], rows: [[..]], hot: row index} */
  P.table = (o) => (x, y) => {
    const r = K.table.draw({ x, y: o.title ? y + 28 : y, prefix: o.key || 'tbl', rows: o.rows, colHead: o.head, mono: true, size: 14, minH: 26, ch: 26, hot: o.hot === undefined || o.hot === null ? [] : o.head.map((_, j) => [o.hot, j]), cls: o.cls });
    const items = o.title ? [heading((o.key || 'tbl') + ':h', x, y, o.title)].concat(r.items) : r.items;
    return { items, box: o.title ? S.geom.union([{ x, y, w: 10, h: 28 }, r.box]) : r.box };
  };

  /** the generic prediction: a frame with meta.q = {ask, options, answer} asks it, the next frame answers */
  P.predict = [{ at: (f) => !!(f.meta && f.meta.q), pick: 'option', ask: (fr, i) => fr[i].meta.q.ask, options: (fr, i) => fr[i].meta.q.options, answer: (fr, i) => fr[i].meta.q.answer, explain: (fr, i) => fr[i].meta.q.explain || fr[i + 1].say }];
  /** options with the answer among them, no repeats, in a steady order */
  P.opts = (answer, ...others) => {
    const a = String(answer);
    let s = [...new Set([a].concat(others.flat().map(String)))];
    // never a question with one choice: add near misses (one bit flipped) when the others all coincide
    for (let i = 0; s.length < 3 && i < a.length; i++) if (/[01]/.test(a[i])) s = [...new Set(s.concat([a.slice(0, i) + (a[i] === '0' ? '1' : '0') + a.slice(i + 1)]))];
    return s.slice(0, 4).sort();
  };

  // ---- walking a run --------------------------------------------------------------------------------------
  /**
   * Group a run's steps into moments: one per statement run (with what it changed and printed), one per time
   * advance, one per region change. Each moment: {kind: 'stmt'|'time'|'region'|'assign', line, t, region, who,
   * updates: [{net, from, to, line, cause}], prints: [text], say}
   */
  P.moments = function (run) {
    const out = [];
    let cur = null;
    const push = (m) => { cur = m; out.push(m); return m; };
    for (const s of run.steps) {
      if (s.kind === 'stmt') {
        // several statements on one line are one moment
        const last = out[out.length - 1];
        if (cur && cur === last && cur.kind === 'stmt' && cur.line === s.line && cur.t === s.t && cur.scope === s.scope && !P.loopLine(run, s.line)) continue;
        push({ kind: 'stmt', line: s.line, t: s.t, region: s.region, who: s.who, scope: s.scope, updates: [], prints: [] });
        continue;
      }
      if (s.kind === 'time') { push({ kind: 'time', t: s.t, updates: [], prints: [], say: s.say }); cur = null; continue; }
      if (s.kind === 'region') { push({ kind: 'region', region: s.region, t: s.t, list: s.updates || [], updates: [], prints: [], say: s.say }); continue; }
      if (s.kind === 'run') { if (cur && cur.kind === 'stmt') cur = null; continue; }
      if (s.kind === 'update') {
        const u = { net: s.net, from: s.from, to: s.to, line: s.line, cause: s.cause, region: s.region, t: s.t };
        if (/^(assign|.* gate)/.test(s.cause || '') || (!cur && s.line)) { push({ kind: 'assign', line: s.line, t: s.t, region: s.region, updates: [u], prints: [] }); cur = null; continue; }
        if (cur) cur.updates.push(u); else push({ kind: 'assign', line: s.line, t: s.t, region: s.region, updates: [u], prints: [] });
        continue;
      }
      if (s.kind === 'print' && s.region === 'postponed') { push({ kind: 'print', t: s.t, region: s.region, updates: [], prints: [s.text.replace(/\n$/, '')] }); cur = null; continue; }
      if (s.kind === 'print') { if (cur) cur.prints.push(s.text.replace(/\n$/, '')); else push({ kind: 'print', t: s.t, region: s.region, updates: [], prints: [s.text.replace(/\n$/, '')] }); }
    }
    // the same port seen from two scopes (tb.y and tb.dut.y) is one change: keep the shorter name
    for (const m of out) {
      const seen = new Map();
      m.updates = m.updates.filter((u) => { const k = u.t + ':' + show(u.to) + ':' + u.net.split('.').pop(); if (seen.has(k)) return false; seen.set(k, true); return true; });
    }
    return out;
  };
  /** a line that holds a loop (its statements repeat, so they are not merged) */
  P.loopLine = (run, n) => { const l = (run.src || '').split('\n')[n - 1] || ''; return /\b(for|while|repeat|forever)\b/.test(l) || (l.match(/;/g) || []).length < 2; };
  P.cap = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
  /** what a moment did, in words with the values */
  P.tell = function (m, src) {
    // a change that reaches a testbench signal through a port is the port following its module, said apart
    const viaPort = (u) => /^port /.test(u.cause || '') && m.updates.some((w) => w !== u && w.net.split('.').pop() === u.net.split('.').pop()) === false && m.kind === 'stmt';
    const goes = (u) => (u.from === null || u.from === undefined ? 'becomes ' + P.say(u.to) : 'goes from ' + P.say(u.from) + ' to ' + P.say(u.to));
    const ch = m.updates.map((u) => (viaPort(u) ? 'the block has finished, so the port carries ' + u.net.split('.').pop() + ' out: the testbench\'s ' + P.short(u.net) + ' ' + goes(u) : P.short(u.net) + ' ' + goes(u)));
    const pr = m.prints.map((p) => 'prints "' + p + '"');
    const acts = ch.concat(pr);
    if (m.kind === 'stmt') return 'At ' + P.ns(m.t) + ', line ' + m.line + ' runs (' + P.stmtText(src, m.line) + ')' + (acts.length ? ': ' + acts.join('; ') + '.' : '.');
    if (m.kind === 'assign') return 'At ' + P.ns(m.t) + ', ' + (m.line ? 'line ' + m.line + ' (' + P.stmtText(src, m.line) + ') reacts: ' : '') + acts.join('; ') + '.';
    if (m.kind === 'print') return 'At ' + P.ns(m.t) + ' the output ' + acts.join('; ') + '.';
    return m.say ? m.say + '.' : '';
  };
  /** the values as they stand after each moment (not at the end of its time step): states[k] for moment k */
  P.states = (ms) => { const st = {}, out = []; for (const m of ms) { for (const u of m.updates) { st[u.net] = show(u.to); st[u.net.split('.').pop()] = show(u.to); } out.push(Object.assign({}, st)); } return out; };
  /** the values of signals at the end of moment k (from the waves, at that moment's time) */
  P.valuesAt = (run, names, t) => names.map((n) => ({ name: P.short(n), v: show(K.code.at(run.waves, n, t)) }));
  /** the output printed up to and including moment k */
  P.printed = (ms, k) => ms.slice(0, k + 1).flatMap((m) => m.prints);


  // ---- a testbench walk ---------------------------------------------------------------------------------------
  /**
   * The usual walk through a run: at each time the testbench changes an input, a frame that asks what an output
   * will be and one that shows it (the line lit, its new values written beside it, the circuit coloured, the waves
   * drawn up to then). o = {src, run, tb: 'tb', ins: [names in tb], outs: [names], hw (from Kit.code.hardware),
   * t1, ask: an output name (or null), hot: parts lit, max: frames at most, right: extra blocks (t) -> [blocks],
   * w: the waves' width, wave rows (default ins + outs)}
   */
  P.stimFrames = function (o) {
    const run = o.run, ms = P.moments(run), tb = o.tb || 'tb';
    const frames = [];
    const times = [...new Set(ms.filter((m) => m.kind === 'stmt' && m.scope === tb && m.updates.some((u) => o.ins.includes(P.short(u.net)))).map((m) => m.t))];
    const t1 = o.t1 || Math.max(1, run.time);
    const rows = o.rows || o.ins.concat(o.outs).map((n) => tb + '.' + n);
    const val = (n, t) => show(K.code.at(run.waves, tb + '.' + n, t));
    // the design's continuous assignments: {line, rhs}
    const modAssigns = [];
    if (o.dut) {
      const ls = K.code.lines(o.src), start = ls.findIndex((l) => new RegExp('^\\s*module\\s+' + o.dut + '\\b').test(l));
      for (let k = Math.max(0, start); start >= 0 && k < ls.length && !/^\s*endmodule/.test(ls[k]); k++) {
        const a = /^\s*assign\s+[^=]*=(.*)$/.exec(P.stmtText(o.src, k + 1));
        if (a) modAssigns.push({ line: k + 1, rhs: a[1].replace(/\/\/.*$/, '') });
      }
    }
    const picture = (t, hot, notes, before) => {
      const tt = before ? t - 1e-6 : t;
      const right = [];
      if (o.hw) right.push(P.built(o.hw, { values: o.hw.values ? o.hw.values(tt) : undefined, hot: o.hot }));
      right.push(P.waves({ waves: run.waves, rows, t: before ? t : t, t1, w: o.w || 380 }));
      if (o.right) right.push(...o.right(tt));
      return P.scene({ code: { src: o.src, hot, notes }, under: [P.badges(o.ins.concat(o.outs).map((n) => ({ name: n, v: val(n, tt), cls: o.outs.includes(n) && !before ? 'hot' : '' })))], right });
    };
    for (const t of times.slice(0, o.max || 8)) {
      const here = ms.filter((m) => m.t === t && (m.kind === 'stmt' || m.kind === 'assign'));
      const stim = here.filter((m) => m.kind === 'stmt' && m.scope === tb && m.updates.length);
      const lines = [...new Set(stim.map((m) => m.line))];
      const notes = {};
      for (const m of stim) notes[m.line] = m.updates.map((u) => P.short(u.net) + ' = ' + show(u.to)).join(', ');
      const reacts = here.filter((m) => (m.kind === 'assign' && m.line) || (m.kind === 'stmt' && m.scope !== tb && m.updates.length));
      for (const m of reacts) notes[m.line] = (notes[m.line] ? notes[m.line] + ', ' : '') + m.updates.map((u) => P.short(u.net).split('.').pop() + ' = ' + show(u.to)).join(', ');
      const ch = stim.flatMap((m) => m.updates.map((u) => P.short(u.net) + ' = ' + P.say(u.to)));
      const outsNow = o.outs.map((n) => n + ' = ' + P.say(K.code.at(run.waves, tb + '.' + n, t)));
      const outsBefore = o.outs.map((n) => val(n, t - 1e-6));
      if (o.ask) {
        const ans = val(o.ask, t), was = val(o.ask, t - 1e-6);
        const sc = picture(t, lines, {}, true);
        const opts = ans.length === 1 ? ['0', '1'].concat(ans === 'x' || ans === 'z' ? [ans] : []) : P.opts(ans, was, ans.replace(/./g, '0'), ans.replace(/./g, '1'));
        frames.push(P.frame(sc, 'At ' + P.ns(t) + ' the testbench sets ' + ch.join(', ') + '. Until now ' + o.outs.map((n, i) => n + ' = ' + outsBefore[i]).join(', ') + '.', { meta: { q: { ask: 'What will ' + o.ask + ' be once line ' + lines.join(' and ') + ' has run?', options: opts, answer: ans } } }));
      }
      const sc = picture(t, lines.concat(reacts.map((m) => m.line)), notes, false);
      // what woke: the continuous assignments that read a changed input, and the statements the module ran
      const changed = stim.flatMap((m) => m.updates.map((u) => P.short(u.net)));
      const reads = (txt) => changed.some((n) => new RegExp('\\b' + n + '\\b').test(txt));
      const assignLines = modAssigns.filter((a) => reads(a.rhs)).map((a) => a.line);
      const ran = here.filter((m) => m.kind === 'stmt' && m.scope !== tb);
      // a statement assigns an output when its line assigns one; a line that opens with if runs twice when its own assignment runs too
      const assigned = ran.filter((m, i) => o.outs.some((n) => new RegExp('\\b' + n + '\\s*<?=[^=]').test(P.lineText(o.src, m.line))) && (!/^\s*(else\s+)?if\b/.test(P.lineText(o.src, m.line)) || (i > 0 && ran[i - 1].line === m.line)));
      const woke = [...new Set(assignLines.concat(ran.map((m) => m.line)))].sort((a, b) => a - b);
      const outsChanged = o.outs.filter((n, i) => outsBefore[i] !== val(n, t));
      const dut = o.dut || 'the module';
      let why;
      if (!woke.length) why = ' Nothing in ' + dut + ' reads ' + changed.join(' or ') + ', so ' + outsNow.join(', ') + (o.outs.length > 1 ? ' stay as they were.' : ' stays as it was.');
      else if (!assignLines.length && !assigned.length) why = ' The change wakes ' + woke.map((l) => 'line ' + l).join(' and ') + ' in ' + dut + ', but no assignment to ' + o.outs.join(' or ') + ' runs this time, so ' + outsNow.join(', ') + (o.outs.length > 1 ? ' stay as they were.' : ' stays as it was.');
      else why = ' The change wakes ' + woke.map((l) => 'line ' + l).join(' and ') + ' in ' + dut + ', which works out ' + outsNow.join(', ') + (outsChanged.length ? ' at once (no delay is written).' : ' again: the same as before, so ' + (o.outs.length > 1 ? 'no output changes.' : o.outs[0] + ' does not change.'));
      frames.push(P.frame(sc, 'At ' + P.ns(t) + ', ' + ch.join(', ') + '.' + why));
    }
    return frames;
  };


  /**
   * A statement-by-statement walk: one frame per moment (a statement run, an assign reacting, time moving on),
   * with the line lit, what it did written beside it, the values so far (kept as the moments go, so they are
   * right even in the middle of a time step), the output printed and the waves up to now.
   * o = {src, run, watch: [signal names, full], rows (wave rows; default watch), t1, max (frames), console (show
   * the output), ask(m, state, k) -> {ask, options, answer} asked before moment m, say(m, state) -> extra words,
   * right(m, state) -> more blocks on the right, keep(m) -> false to skip a moment, hw (circuit + values),
   * hot(m) -> parts lit, w (waves width)}. Returns {frames, moments, state}.
   */
  P.walkFrames = function (o) {
    const run = o.run, all = P.moments(run);
    const keep = o.keep || ((m) => m.kind !== 'region' && m.kind !== 'print');
    const ms = all.filter(keep);
    const state = {};
    const watch = o.watch || [];
    const t1 = o.t1 || Math.max(1, run.time);
    const frames = [];
    const printed = [];
    let notes = {}, lastT = -1;
    const base = (n) => n.split('.').pop();
    const vOf = (n) => (state[n] !== undefined ? state[n] : state[base(n)] !== undefined ? state[base(n)] : 'x');
    // with no moment (the closing frame) the picture shows the whole run: the waves drawn to the end
    const scene = (m, hot, bar) => {
      const tNow = m ? m.t : t1;
      const under = [P.badges(watch.map((n) => ({ name: P.short(n), v: vOf(n), cls: m && m.updates.some((u) => u.net === n || base(u.net) === base(n)) ? 'hot' : '' })), { wrap: 400 })];
      if (o.console) under.push(P.console(printed, { hot: m && m.prints.length }));
      const right = [];
      if (o.hw) right.push(o.hw.ok === undefined ? P.circuit(o.hw.res, { values: o.hw.values ? o.hw.values(tNow) : undefined, hot: o.hot ? o.hot(m) : [], title: o.hwTitle }) : P.built(o.hw, { values: o.hw.values ? o.hw.values(tNow) : undefined, hot: o.hot ? o.hot(m) : [], title: o.hwTitle }));
      if (o.rows !== false) right.push(P.waves({ waves: run.waves, rows: o.rows || watch, t: tNow, t1, w: o.w || 380 }));
      if (o.right) right.push(...o.right(m, state));
      return P.scene({ code: { src: o.src, hot, notes: Object.assign({}, notes), barCls: bar, title: 'Code' }, under, right });
    };
    let k = 0;
    if (o.hide) for (const m of ms) m.updates = m.updates.filter((u) => !o.hide(u.net));
    for (const m of ms) {
      if (frames.length >= (o.max || 60)) break;
      if (m.t !== lastT) { notes = {}; lastT = m.t; }
      const q = o.ask ? o.ask(m, state, k) : null;
      if (q) frames.push(P.frame(scene(m, m.line ? [m.line] : []), q.before || ('At ' + P.ns(m.t) + ', line ' + m.line + ' is about to run.'), { meta: { q } }));
      for (const u of m.updates) { state[u.net] = show(u.to); state[base(u.net)] = show(u.to); }
      printed.push(...m.prints);
      if (m.line && (m.updates.length || m.prints.length)) notes[m.line] = m.updates.map((u) => base(u.net) + ' = ' + show(u.to)).concat(m.prints.length ? ['prints'] : []).join(', ');
      const extra = o.say ? o.say(m, state) : '';
      frames.push(P.frame(scene(m, m.line ? [m.line] : [], m.region === 'nba' ? 'nba' : ''), (P.tell(m, o.src) + (extra ? ' ' + extra : '')).trim(), { meta: { m } }));
      k++;
    }
    return { frames, moments: ms, state, printed, scene };
  };

  /** the compile errors of a run as a sentence */
  P.errorSay = (r) => 'This code does not compile: ' + r.errors.slice(0, 2).map((e) => 'line ' + e.line + ': ' + e.msg).join('; ') + '.';
  /** a frame that shows the code and its first error (for a student's edit that does not compile) */
  P.errorFrames = (src, r) => {
    const e = r.errors[0] || { line: 1 };
    const sc = P.scene({ code: { src, hot: e.line, marks: { [e.line]: 'bad' } } });
    return [P.frame(sc, P.errorSay(r)), P.frame(sc, 'Fix the line marked and run again. The presets above are known to work.')];
  };
  /** the check for a program input: it must compile */
  P.compiles = (label) => (v) => { const r = S.Verilog.compile(String(v), {}); return r.errors.length ? label + ', line ' + r.errors[0].line + ': ' + r.errors[0].msg : null; };
  /** the definition panel: notes, the lint warnings, a synthesis summary */
  P.def = (sections) => ({ sections: sections.filter(Boolean).map((s, i) => Object.assign({ id: 's' + i }, s)) });
  P.warnSection = (warnings) => (warnings && warnings.length ? { kind: 'math', title: 'Warnings', text: warnings.map((w) => 'line ' + w.line + ': ' + w.msg).join('\n') } : null);
})(globalThis.Sirkit = globalThis.Sirkit || {});
