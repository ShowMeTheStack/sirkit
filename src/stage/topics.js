// Parts, families and topics. A part is one of the fourteen parts of the course; a family is a group of
// topics on one idea (K-maps, flip-flops, counters); a topic is one picture with its own inputs and presets,
// a scene for every step with narration, predictions to make on the way and a quiz at the end.
(function (S) {
  'use strict';

  /** The fourteen parts, in teaching order (the home page lists the same) */
  S.parts = [
    { id: 'numbers', n: 1, title: 'Numbers and codes', blurb: 'Bases, complements, signed numbers, BCD, Gray and error-detecting codes.' },
    { id: 'algebra', n: 2, title: 'Boolean algebra and gates', blurb: 'Axioms and theorems, duality, canonical forms, gate symbols in both styles.' },
    { id: 'minimise', n: 3, title: 'Minimisation', blurb: 'K-maps up to six variables, Quine–McCluskey, costs, NAND/NOR, XOR and hazards.' },
    { id: 'combinational', n: 4, title: 'Combinational logic', blurb: 'Analysis and design, adders and lookahead, comparators, decoders, multiplexers, buses.' },
    { id: 'storage', n: 5, title: 'Storage', blurb: 'Latches and flip-flops, timing, setup and hold, metastability.' },
    { id: 'machines', n: 6, title: 'State machines', blurb: 'Mealy and Moore, reduction, assignment, design with D, JK and T.' },
    { id: 'registers', n: 7, title: 'Registers and counters', blurb: 'Shift registers, ripple and synchronous counters, ring and Johnson counters.' },
    { id: 'memory', n: 8, title: 'Memory and programmable logic', blurb: 'RAM and ROM, Hamming codes, PLA, PAL and a tiny FPGA.' },
    { id: 'rtl', n: 9, title: 'Register-transfer design', blurb: 'ASM charts, datapath and controller, three ways to build control.' },
    { id: 'async', n: 10, title: 'Asynchronous circuits', blurb: 'Flow tables, races, race-free assignment, hazards.' },
    { id: 'ics', n: 11, title: 'Digital integrated circuits', blurb: 'Noise margins, fan-out, TTL and CMOS, switch-level gates.' },
    { id: 'verilog', n: 12, title: 'Verilog', blurb: 'Structural, dataflow and behavioural models, testbenches, synthesis.' },
    { id: 'cpu', n: 13, title: 'A small processor', blurb: 'An instruction set, a datapath, a controller and programs that run on the gates.' },
    { id: 'lab', n: 14, title: 'Lab bench', blurb: 'A breadboard with 74-series chips, a clock, LEDs and a logic analyser.' },
  ];
  S.partOf = (id) => S.parts.find((p) => p.id === id) || null;
  S.families = [];
  S.topics = [];

  const partRank = (id) => { const i = S.parts.findIndex((p) => p.id === id); return i < 0 ? 99 : i; };
  /** family: {id, part, title, blurb, order} */
  S.family = function (f) {
    if (S.families.some((x) => x.id === f.id)) return S.families.find((x) => x.id === f.id);
    S.families.push(f);
    S.families.sort((a, b) => partRank(a.part) - partRank(b.part) || (a.order || 0) - (b.order || 0));
    return f;
  };
  /**
   * topic: {id, family, title, blurb, order,
   *   inputs: [{id, kind: 'string'|'expr'|'choice'|'number'|'list'|'text'|'program', label, def,
   *             options: [{value, label}] (choice), min, max (number; length for string and list),
   *             alphabet (string: allowed symbols), check(v, input) -> error sentence or null}],
   *   presets: [{label, values}],
   *   run(input) -> [frame] or {frames, def, counters},
   *   counters: [{id, label}], predict: [...], quiz: [{q, options, answer, why}], camera: 'fit-all'|'follow'}
   * A frame is {items: [stage items], say: 'narration', hl: [ids lit in the definition panel],
   *   counters: {id: n}, predict: {ask, options, answer, explain, pick: 'option'|'item'}, mark, slow, view}.
   */
  S.topic = function (t) {
    if (S.topics.some((x) => x.id === t.id)) throw new Error('two topics with id ' + t.id);
    S.topics.push(t);
    const order = (x) => (x.order === undefined ? 500 : x.order);
    const n = S.topics.map((x, k) => [x, k]);
    const fr = (x) => { const f = S.families.find((y) => y.id === x.family); return f ? partRank(f.part) * 1000 + (f.order || 0) : 99999; };
    n.sort((a, b) => fr(a[0]) - fr(b[0]) || order(a[0]) - order(b[0]) || a[1] - b[1]);
    S.topics.length = 0;
    for (const [x] of n) S.topics.push(x);
    return t;
  };
  S.byId = (id) => S.topics.find((t) => t.id === id) || null;
  S.familyOf = (t) => S.families.find((f) => f.id === t.family) || null;
  S.topicPart = (t) => { const f = S.familyOf(t); return f ? S.partOf(f.part) : null; };

  /** The value of each input: the one given, or its default */
  S.inputOf = function (t, given) {
    const o = {};
    for (const i of t.inputs || []) o[i.id] = given && given[i.id] !== undefined ? given[i.id] : (typeof i.def === 'function' ? i.def() : i.def);
    return o;
  };
  /** Read a field's text into a value of the input's kind */
  S.parseInput = function (inp, text) {
    switch (inp.kind) {
      case 'number': return text === '' ? NaN : Number(text);
      case 'list': return String(text).split(/[\s,]+/).filter(Boolean).map((x) => (x === 'ε' || x === 'eps' ? '' : x));
      case 'string': return String(text).replace(/\s+/g, '') === 'ε' ? '' : String(text).replace(/\s+/g, inp.spaces ? ' ' : '');
      default: return String(text);
    }
  };
  S.showInput = function (inp, v) {
    if (inp.kind === 'list') return (v || []).map((x) => (x === '' ? 'ε' : x)).join(', ');
    return v === undefined || v === null ? '' : String(v);
  };
  /** Check an input against the topic's limits: an error message, or null */
  S.checkInput = function (t, input) {
    for (const i of t.inputs || []) {
      const v = input[i.id];
      const L = i.label || i.id;
      if (i.kind === 'number') {
        if (!Number.isFinite(v) || (i.integer !== false && !Number.isInteger(v))) return L + ': a whole number';
        if (i.min !== undefined && v < i.min) return L + ': at least ' + i.min;
        if (i.max !== undefined && v > i.max) return L + ': at most ' + i.max;
      }
      if (i.kind === 'string') {
        if (typeof v !== 'string') return L + ': a string';
        if (i.alphabet) { const bad = [...v].find((c) => !i.alphabet.includes(c)); if (bad !== undefined) return L + ': "' + bad + '" is not in the alphabet {' + [...i.alphabet].join(', ') + '}'; }
        if (i.max !== undefined && [...v].length > i.max) return L + ': at most ' + i.max + ' symbols, so the picture stays readable';
        if (i.min !== undefined && [...v].length < i.min) return L + ': at least ' + i.min + ' symbols';
      }
      if (i.kind === 'list') {
        if (!Array.isArray(v)) return L + ': a list';
        if (i.max !== undefined && v.length > i.max) return L + ': at most ' + i.max + ' items';
        if (i.min !== undefined && v.length < i.min) return L + ': at least ' + i.min + ' item' + (i.min === 1 ? '' : 's');
      }
      if (i.kind === 'choice' && i.options && !i.options.some((o) => o.value === v)) return L + ': choose one of the options';
      if (i.kind === 'expr') { try { S.Netlist.parse(String(v)); } catch (e) { return L + ': ' + e.message; } }
      if (i.check) { let e; try { e = i.check(v, input); } catch (x) { e = x.message; } if (e) return e; }
    }
    if (t.check) return t.check(input);
    return null;
  };

  /** A helper for building a topic's frames: keeps the running counters and stamps them on each frame */
  class Frames {
    constructor(counters) { this.list = []; this.counts = {}; for (const c of counters || []) this.counts[typeof c === 'string' ? c : c.id] = 0; }
    count(id, n) { this.counts[id] = (this.counts[id] || 0) + (n === undefined ? 1 : n); return this; }
    set(id, n) { this.counts[id] = n; return this; }
    add(frame) { frame.counters = Object.assign({}, this.counts, frame.counters || {}); this.list.push(frame); return frame; }
    get length() { return this.list.length; }
    last() { return this.list[this.list.length - 1]; }
  }
  S.Frames = Frames;

  /** Run a topic with an input: frames (each drawable on the stage), the definition panel and the counters */
  S.run = function (t, input) {
    let out;
    try { out = t.run(input); } catch (e) { return { ok: false, error: e.message || String(e), frames: [{ items: [], say: 'This could not be run: ' + (e.message || e) }], stack: e.stack }; }
    if (Array.isArray(out)) out = { frames: out };
    out = out || { frames: [] };
    const frames = (out.frames || []).filter(Boolean);
    for (const f of frames) { if (!f.items) f.items = []; if (f.items.some((x) => !x)) f.items = f.items.filter(Boolean); }
    // one camera for the whole run, so nothing jumps: the box around every frame (a frame may set its own)
    if (t.camera !== 'follow') {
      let box = null;
      for (const f of frames) { const b = S.stageBounds(f.items, t.cameraOpts); if (b) box = box ? S.geom.union([box, b]) : b; }
      if (box) for (const f of frames) if (!f.view) f.view = box;
    }
    // predictions declared on the topic: find the frames they ask at
    // a prediction that cannot be worked out is reported (a topic checker fails on it), not dropped quietly
    const predictErrors = [];
    for (const p of t.predict || []) {
      for (let i = 0; i < frames.length - 1; i++) {
        if (frames[i].predict) continue;
        let hit = false;
        try { hit = p.at(frames[i], i, frames, input); } catch (e) { hit = false; predictErrors.push('prediction ' + (t.predict.indexOf(p) + 1) + ': at() fails at frame ' + i + ': ' + (e.message || e)); }
        if (!hit) continue;
        let q = null;
        try {
          q = { ask: typeof p.ask === 'function' ? p.ask(frames, i, input) : p.ask, answer: typeof p.answer === 'function' ? p.answer(frames, i, input) : p.answer, options: p.options ? (typeof p.options === 'function' ? p.options(frames, i, input) : p.options) : null, explain: p.explain ? (typeof p.explain === 'function' ? p.explain(frames, i, input) : p.explain) : null, pick: p.pick || (p.options ? 'option' : 'item') };
        } catch (e) { q = null; predictErrors.push('prediction ' + (t.predict.indexOf(p) + 1) + ' at frame ' + i + ': ' + (e.message || e)); }
        if (!q || q.answer === null || q.answer === undefined) continue;
        frames[i].predict = q;
        if (p.once) break;
      }
    }
    return { ok: true, frames, def: out.def || (t.def ? t.def(input) : null), counters: out.counters || t.counters || [], result: out.result, predictErrors };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
