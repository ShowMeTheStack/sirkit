// Code on the stage: a Verilog listing with its keywords coloured, line numbers, the line being run lit with a
// cursor that glides from line to line, notes written beside lines (the value a statement just gave), and marks
// on lines (a warning, a line waiting in a queue). Also the runs the pictures are drawn from:
//
//   S.Kit.code.draw({ x, y, src, hot, cursor, notes: {line: text}, marks: {line: cls}, dim: [lines], title, size,
//     noteSize, lh, minChars, noteChars, prefix, from, to }) -> { items, box, lineY(n) (the middle of line n) }
//   S.Kit.code.run(src, { until, files, top }) -> a simulation in which every statement says when it runs:
//     { ok, errors, warnings, output, waves, steps, res, compiled }. steps are the scheduler's trace with
//     { kind: 'stmt', line, t, region, who } added before what each statement does, and a line on each update.
//   S.Kit.code.hardware(src, { top, tb }) -> the module synthesised and simulated as gates with the same
//     testbench: { ok, reasons, circuit, res (its layout), sim, values(t), names, emitted }
//   S.Kit.code.at(waves, name, t), changes(waves, name), show(v) -> a value as Verilog prints it in binary
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const C = (K.code = {});
  const Geo = () => S.geom;
  const V = () => S.Verilog;

  // ---- the listing ------------------------------------------------------------------------------------------
  const KW = () => V().KEYWORDS || new Set();
  /** a line of Verilog as runs of one colour: [{col, text, c}], c one of kw, sys, num, str, cmt, dir, id */
  C.tokens = function (line) {
    const out = [];
    const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*"?)|(\$[A-Za-z_]\w*)|(`[A-Za-z_]\w*)|(\d*\s*'[sS]?[bBoOdDhH]\s*[0-9a-fA-FxXzZ?_]+|\d[\d_]*(?:\.\d+)?)|([A-Za-z_][\w$]*)|(\s+)|([^\sA-Za-z0-9_$"`/]+|\/)/g;
    let m;
    while ((m = re.exec(line))) {
      if (m[0] === '') { re.lastIndex++; continue; }
      const c = m[1] ? 'cmt' : m[2] ? 'str' : m[3] ? 'sys' : m[4] ? 'dir' : m[5] ? 'num' : m[6] ? (KW().has(m[6]) ? 'kw' : 'id') : m[7] ? 'ws' : 'id';
      const last = out[out.length - 1];
      if (c === 'ws') { if (last) last.text += m[0]; continue; }
      if (last && last.c === c) { last.text += m[0]; continue; }
      if (last) last.text = last.text.replace(/\s+$/, '');
      out.push({ col: m.index, text: m[0], c });
    }
    if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '');
    return out;
  };
  const expand = (l) => l.replace(/\t/g, '  ');
  C.lines = (src) => String(src).replace(/\s+$/, '').split('\n').map(expand);

  C.draw = function (o) {
    const P = o.prefix || 'vc', X = o.x || 0, Y = o.y || 0, fs = o.size || 13, lh = o.lh || 21, cw = fs * 0.61;
    const all = C.lines(o.src);
    const from = Math.max(1, o.from || 1), to = Math.min(all.length, o.to || all.length);
    const hot = new Set([].concat(o.hot === undefined || o.hot === null ? [] : o.hot));
    const dim = new Set(o.dim || []);
    const notes = o.notes || {}, marks = o.marks || {};
    const lnW = String(to).length * cw, gut = 18, codeX = X + gut + lnW + 12;
    const chars = Math.max(o.minChars || 0, ...all.slice(from - 1, to).map((l) => l.length));
    const noteChars = Math.max(o.noteChars || 0, ...Object.values(notes).map((t) => String(t).length));
    const noteX = codeX + chars * cw + 18, nfs = o.noteSize || fs;
    const w = noteX - X + (noteChars ? noteChars * (nfs * 0.61) + 14 : -4);
    const top = Y + (o.title ? 30 : 0) + 8;
    const h = (to - from + 1) * lh + 16;
    const items = [];
    if (o.title) items.push({ key: P + ':title', kind: 'text', x: X, y: Y + 14, text: o.title, cls: 'title', size: Math.max(13, fs) });
    items.push({ key: P + ':frame', kind: 'region', x: X, y: top - 8, w, h, rx: 10, text: '', cls: 'vc-frame', audit: 'group' });
    const lineY = (n) => top + (n - from) * lh + lh / 2;
    for (let n = from; n <= to; n++) {
      const cy = lineY(n), base = cy + fs * 0.35;
      if (marks[n]) items.push({ key: P + ':mk:' + n, kind: 'cell', x: X + 4, y: cy - lh / 2, w: w - 8, h: lh, rx: 4, text: '', cls: 'vc-mark ' + marks[n], audit: 'overlap-ok' });
      const faded = dim.has(n) ? ' vc-dim' : '';
      items.push({ key: P + ':ln:' + n, kind: 'text', x: X + gut + lnW, y: base, text: String(n), anchor: 'end', cls: 'vc-ln' + (hot.has(n) ? ' on' : ''), size: fs, mono: true });
      for (const tk of C.tokens(all[n - 1])) items.push({ key: P + ':tk:' + n + ':' + tk.col, kind: 'text', x: codeX + tk.col * cw, y: base, text: tk.text, cls: 'vc-tok vc-' + tk.c + faded, size: fs, mono: true });
      if (notes[n] !== undefined && notes[n] !== '') items.push({ key: P + ':nt:' + n, kind: 'text', x: noteX, y: base, text: String(notes[n]), cls: 'vc-note', size: nfs, mono: true });
    }
    // the lit lines: one bar per run of lines, keyed by its place in the list so a single bar glides
    const hs = [...hot].filter((n) => n >= from && n <= to).sort((a, b) => a - b);
    hs.forEach((n, i) => items.push({ key: P + ':bar' + (i ? i : ''), kind: 'cell', x: X + 4, y: lineY(n) - lh / 2, w: w - 8, h: lh, rx: 4, text: '', cls: 'vc-bar' + (o.barCls ? ' ' + o.barCls : ''), audit: 'overlap-ok' }));
    const cur = o.cursor !== undefined ? o.cursor : hs[0];
    if (cur !== undefined && cur !== null && cur >= from && cur <= to) items.push({ key: P + ':cur', kind: 'token', x: X + 10, y: lineY(cur), r: 5, text: '', cls: 'vc-cur', audit: 'overlap-ok' });
    return { items, box: { x: X, y: Y, w, h: top - 8 + h - Y }, lineY, right: X + w, bottom: top - 8 + h };
  };

  // ---- a run that says which statement is running -------------------------------------------------------------
  // The simulator's trace has a step { kind: 'stmt', line, scope } before each statement runs; the run keeps
  // them, notes the line each later update comes from, and the process each statement runs in.
  const lineIn = (s) => { const m = /at line (\d+)/.exec(s || ''); return m ? +m[1] : null; };

  C.run = function (src, o) {
    o = o || {};
    const Vx = V();
    const compiled = Vx.compile(src, { files: o.files, top: o.top });
    if (compiled.errors.length) return { ok: false, src, errors: compiled.errors, warnings: compiled.warnings, compiled, steps: [], output: [], waves: new Map() };
    const res = Vx.simulate(Vx.elaborate(compiled), { trace: true, until: o.until, traceLimit: o.traceLimit || 40000 });
    const steps = [];
    let line = null, who = null;
    for (const s of res.trace || []) {
      const st = Object.assign({}, s);
      if (s.kind === 'stmt') { line = s.line; st.who = s.who || who; }
      if (s.kind === 'run') { who = s.who; st.line = lineIn(s.who); }
      if (s.kind === 'update') {
        const c = /\(([^)]*)\)$/.exec(s.say);
        const cause = c ? c[1] : '';
        st.line = /^(assign|.* gate)/.test(cause) ? lineIn(cause) : s.region === 'nba' ? null : line;
        st.cause = cause;
      }
      steps.push(st);
    }
    return { ok: !res.errors.length, src, marked: true, errors: res.errors, warnings: compiled.warnings, output: res.output, waves: res.waves, steps, res, compiled, time: res.time };
  };

  // ---- values -----------------------------------------------------------------------------------------------
  /** a Sim-style value as Verilog prints it in binary: 0, 1, x, z, or a bit string (most significant first) */
  C.show = (v) => (Array.isArray(v) ? v.slice().reverse().map((b) => String(b).toLowerCase()).join('') : v === undefined || v === null ? 'x' : String(v).toLowerCase());
  /** a value as a number, or null when a bit is x or z */
  C.num = (v) => { if (Array.isArray(v)) return v.every((b) => b === 0 || b === 1) ? v.reduce((a, b, i) => a + b * 2 ** i, 0) : null; return v === 0 || v === 1 ? v : typeof v === 'number' ? v : null; };
  const find = (waves, name) => waves.get(name) || [...waves].find(([k]) => k.endsWith('.' + name) && !k.slice(0, -name.length - 1).includes('.'))?.[1] || null;
  /** the value of a signal at time t (after everything at t), or at the end of a step list when t is a step index */
  C.at = (waves, name, t) => { const w = find(waves, name); if (!w) return 'x'; let v = 'x'; for (const [tt, x] of w) { if (tt <= t + 1e-9) v = x; else break; } return v; };
  /** a signal's changes for the waveform rows: [[t, v]] with buses as numbers or bit strings */
  C.changes = (waves, name) => {
    const w = find(waves, name) || [], out = [];
    for (const [t, v0] of w) {
      const v = S.Kit.timing.busVal(v0);
      if (out.length && out[out.length - 1][0] === t) out[out.length - 1][1] = v; else out.push([t, v]);
      if (out.length > 1 && out[out.length - 1][1] === out[out.length - 2][1]) out.pop();
    }
    return out;
  };
  C.width = (waves, name) => { const w = find(waves, name); const v = w && w.length ? w[w.length - 1][1] : 0; return Array.isArray(v) ? v.length : 1; };

  // ---- the same design as gates ---------------------------------------------------------------------------------
  /** the text of each module in a source: {name: text} */
  C.modules = function (src) {
    const out = {};
    const re = /(^|\n)[ \t]*module\s+(\w+)[\s\S]*?\bendmodule\b/g;
    let m;
    while ((m = re.exec(src))) out[m[2]] = m[0].replace(/^\n/, '');
    return out;
  };
  const memoHw = new Map();
  /**
   * Synthesise module o.top of src and run the gates with the testbench o.tb (a module name in src): the
   * circuit's own wires get their values from that run, so the drawing shows what the hardware does.
   */
  C.hardware = function (src, o) {
    const key = src + '\u0000' + o.top + '\u0000' + (o.tb || '') + '\u0000' + (o.until || '');
    if (memoHw.has(key)) return memoHw.get(key);
    const Vx = V();
    let circuit = null;
    try { circuit = Vx.synthesise(src, { top: o.top }); } catch (e) { circuit = { ok: false, reasons: [{ msg: e.message }] }; }
    if (!circuit || circuit.ok === false) { const r = { ok: false, reasons: (circuit && circuit.reasons) || [] }; memoHw.set(key, r); return r; }
    const out = { ok: true, circuit, trace: circuit.trace || [], notes: circuit.notes || [] };
    // laid out only when drawn (a big circuit takes a while)
    let res;
    Object.defineProperty(out, 'res', { enumerable: true, get() { if (res === undefined) res = circuit.parts.length ? S.Kit.schem.layout(circuit) : null; return res; } });
    if (o.tb) {
      const emitted = Vx.fromCircuit(circuit, { name: o.top });
      // the wire each net became: the declarations come in the order of the nets that do not start at an input
      const decl = [...emitted.matchAll(/^\s*wire\s+(?:\[\d+:0\]\s+)?(\w+);/gm)].map((m) => m[1]);
      const fromIn = new Map();
      for (const p of circuit.parts) if (['IN', 'CLOCK', 'SWITCH', 'BUTTON'].includes(p.type) && p.net.y) fromIn.set(p.net.y, p.params.name || p.id);
      const names = new Map();
      let k = 0;
      for (const n of circuit.nets) names.set(n.id, fromIn.has(n) ? fromIn.get(n) : decl[k++]);
      const mods = C.modules(src);
      const others = Object.keys(mods).filter((m) => m !== o.top).map((m) => mods[m]).join('\n');
      const sim = Vx.run(others + '\n' + emitted.replace(/^\/\/.*\n/, ''), { top: o.tb, until: o.until });
      const inst = o.inst || 'dut';
      out.emitted = emitted; out.sim = sim; out.names = names;
      out.values = (t) => {
        const v = {};
        for (const n of circuit.nets) {
          const x = C.at(sim.waves, o.tb + '.' + inst + '.' + names.get(n.id), t);
          v[n.id] = n.width > 1 ? 'bus' : String(x).toLowerCase();
        }
        return v;
      };
      out.at = (name, t) => C.at(sim.waves, o.tb + '.' + inst + '.' + name, t);
    }
    if (memoHw.size > 40) memoHw.delete(memoHw.keys().next().value);
    memoHw.set(key, out);
    return out;
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
