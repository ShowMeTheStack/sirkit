// Algorithmic state machine (ASM) charts: state boxes, decision boxes, conditional output boxes, and the ASM
// block each state box heads. A chart drives a datapath of registers through register transfers written in
// RTL ("A ← A + B", "{C, A, Q} ← {C, A, Q} >> 1", "Q[0] ← 1", "P ← 0"). The chart is checked against the
// rules, run cycle by cycle, turned into a controller three ways (state register and decoder, one flip-flop
// per state, a sequence counter), drawn as a controller circuit, and written out as Verilog text.
//
// chart: { name, inputs: ['START'], dataInputs: { MIN: 4 }, registers: { A: 4 }, outputs: ['READY'],
//   status: { Z: 'P == 0' }, start: 'IDLE', boxes: [...] }, each box one of
//   { id, kind: 'state', name, actions: ['READY', 'A ← 0'], next }   (next: the id of the box below)
//   { id, kind: 'decision', cond: 'START', t, f }
//   { id, kind: 'cond', actions: [...], next }
// Asm.chart(spec) also builds the boxes from a tree per state: spec.states = { IDLE: { actions, next } } with
// next a state name, { if: 'START', then: tree, else: tree }, or { do: [actions], then: tree }.
(function (S) {
  'use strict';
  const A = S.Asm = {};

  // ---- RTL expressions --------------------------------------------------------------------------------
  // Values are { v, w }: an unsigned value and its width in bits. + widens by one bit, - wraps at the wider
  // width, shifts and logic keep the width, comparisons give one bit.
  function tokens(src) {
    const out = [];
    const re = /\s*(?:(0b[01]+|0x[0-9a-fA-F]+|\d+)|([A-Za-z_][A-Za-z0-9_]*)|(<-|←|<<|>>|<=|>=|==|!=|&&|\|\||[-+*&|^~!<>()[\]{},;:=]))/y;
    let m, i = 0;
    while (i < src.length) {
      re.lastIndex = i;
      if (!(m = re.exec(src))) { if (/^\s*$/.test(src.slice(i))) break; throw new Error('cannot read "' + src.slice(i).trim() + '"'); }
      i = re.lastIndex;
      if (m[1]) out.push({ t: 'num', v: m[1].startsWith('0b') ? parseInt(m[1].slice(2), 2) : Number(m[1]) });
      else if (m[2]) out.push({ t: 'id', v: m[2] });
      else out.push({ t: m[3] === '<-' ? '←' : m[3] });
    }
    return out;
  }
  function parseExpr(toks, pos) {
    let k = pos || 0;
    const peek = () => toks[k] && toks[k].t, take = () => toks[k++];
    const expect = (t) => { if (peek() !== t) throw new Error('expected ' + t); take(); };
    const LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '<=', '>', '>='], ['<<', '>>'], ['+', '-'], ['*']];
    const bin = (lv) => {
      if (lv === LEVELS.length) return unary();
      let a = bin(lv + 1);
      while (LEVELS[lv].includes(peek())) { const op = take().t; a = { op, a, b: bin(lv + 1) }; }
      return a;
    };
    const unary = () => {
      if (['~', '!', '-'].includes(peek())) { const op = take().t; return { op: 'u' + op, a: unary() }; }
      return primary();
    };
    const primary = () => {
      const t = take();
      if (!t) throw new Error('unexpected end');
      let e;
      if (t.t === 'num') e = { op: 'num', v: t.v };
      else if (t.t === 'id') e = { op: 'id', name: t.v };
      else if (t.t === '(') { e = bin(0); expect(')'); } else if (t.t === '{') { const parts = [bin(0)]; while (peek() === ',') { take(); parts.push(bin(0)); } expect('}'); e = { op: 'cat', parts }; } else throw new Error('unexpected ' + t.t);
      while (peek() === '[') { take(); const i = take(); if (!i || i.t !== 'num') throw new Error('a bit number is needed in [ ]'); expect(']'); e = { op: 'bit', a: e, i: i.v }; }
      return e;
    };
    const e = bin(0);
    return { e, k };
  }
  const widthOfNum = (v) => Math.max(1, Math.ceil(Math.log2(v + 1)));
  const mask = (w) => (w >= 31 ? 0x7fffffff : (1 << w) - 1);
  function evalE(e, env) {
    switch (e.op) {
      case 'num': return { v: e.v, w: widthOfNum(e.v) };
      case 'id': { const x = env(e.name); if (!x) throw new Error('unknown name ' + e.name); return x; }
      case 'bit': { const x = evalE(e.a, env); return { v: (x.v >> e.i) & 1, w: 1 }; }
      case 'cat': { let v = 0, w = 0; for (const p of e.parts) { const x = evalE(p, env); v = v * (1 << x.w) + x.v; w += x.w; } return { v, w }; }
      case 'u~': { const x = evalE(e.a, env); return { v: ~x.v & mask(x.w), w: x.w }; }
      case 'u!': { const x = evalE(e.a, env); return { v: x.v ? 0 : 1, w: 1 }; }
      case 'u-': { const x = evalE(e.a, env); return { v: (-x.v) & mask(x.w), w: x.w }; }
    }
    const a = evalE(e.a, env), b = evalE(e.b, env), w = Math.max(a.w, b.w);
    switch (e.op) {
      case '+': return { v: a.v + b.v, w: w + 1 };
      case '-': return { v: (a.v - b.v) & mask(w), w };
      case '*': return { v: a.v * b.v, w: a.w + b.w };
      case '&': return { v: a.v & b.v, w };
      case '|': return { v: a.v | b.v, w };
      case '^': return { v: a.v ^ b.v, w };
      case '<<': return { v: (a.v << b.v) & mask(a.w + b.v), w: a.w + b.v };
      case '>>': return { v: a.v >> b.v, w: a.w };
      case '==': return { v: +(a.v === b.v), w: 1 };
      case '!=': return { v: +(a.v !== b.v), w: 1 };
      case '<': return { v: +(a.v < b.v), w: 1 };
      case '<=': return { v: +(a.v <= b.v), w: 1 };
      case '>': return { v: +(a.v > b.v), w: 1 };
      case '>=': return { v: +(a.v >= b.v), w: 1 };
      case '&&': return { v: +(!!a.v && !!b.v), w: 1 };
      case '||': return { v: +(!!a.v || !!b.v), w: 1 };
    }
    throw new Error('bad operator ' + e.op);
  }
  const namesIn = (e, out) => { out = out || new Set(); if (e.op === 'id') out.add(e.name); for (const k of ['a', 'b']) if (e[k]) namesIn(e[k], out); if (e.parts) e.parts.forEach((p) => namesIn(p, out)); return out; };
  const exprText = (e) => {
    switch (e.op) {
      case 'num': return String(e.v);
      case 'id': return e.name;
      case 'bit': return exprText(e.a) + '[' + e.i + ']';
      case 'cat': return '{' + e.parts.map(exprText).join(', ') + '}';
      case 'u~': case 'u!': case 'u-': return e.op[1] + exprText(e.a);
    }
    return '(' + exprText(e.a) + ' ' + e.op + ' ' + exprText(e.b) + ')';
  };
  /** an action: a register transfer { dest, expr, text } or an asserted output { signal, text } */
  function parseAction(text) {
    const toks = tokens(text);
    const arrow = toks.findIndex((t) => t.t === '←');
    if (arrow < 0) {
      if (toks.length === 1 && toks[0].t === 'id') return { signal: toks[0].v, text: toks[0].v };
      throw new Error('"' + text + '" is neither a transfer (with ←) nor an output name');
    }
    const d = parseExpr(toks.slice(0, arrow)), r = parseExpr(toks.slice(arrow + 1));
    if (d.k !== arrow) throw new Error('cannot read the destination of "' + text + '"');
    if (r.k !== toks.length - arrow - 1) throw new Error('cannot read "' + text + '"');
    const dests = d.e.op === 'cat' ? d.e.parts : [d.e];
    for (const x of dests) if (!(x.op === 'id' || (x.op === 'bit' && x.a.op === 'id'))) throw new Error('"' + text + '" must write to registers');
    return { dest: dests, expr: r.e, text: text.replace(/<-/g, '←').replace(/\s+/g, ' ').trim() };
  }
  const parseCond = (text) => { const toks = tokens(text), r = parseExpr(toks); if (r.k !== toks.length) throw new Error('cannot read the condition "' + text + '"'); return r.e; };
  A.parseAction = parseAction; A.parseCond = parseCond; A.evalExpr = evalE; A.exprText = exprText;

  // ---- charts --------------------------------------------------------------------------------------------
  /** a chart from a spec with either boxes or a tree per state */
  A.chart = function (spec) {
    const ch = { name: spec.name || 'asm', inputs: (spec.inputs || []).slice(), dataInputs: Object.assign({}, spec.dataInputs), registers: Object.assign({}, spec.registers), outputs: (spec.outputs || []).slice(), status: Object.assign({}, spec.status), start: spec.start, boxes: [] };
    if (spec.boxes) ch.boxes = spec.boxes.map((b) => Object.assign({}, b));
    else {
      const names = Object.keys(spec.states);
      ch.start = ch.start || names[0];
      for (const s of names) {
        let nd = 0, nc = 0;
        const st = spec.states[s];
        const box = { id: s, kind: 'state', name: s, actions: (st.actions || []).slice(), next: null };
        ch.boxes.push(box);
        const walk = (t) => {
          if (typeof t === 'string') return t;
          if (t.if != null) { const id = s + '.d' + (++nd), b = { id, kind: 'decision', cond: t.if, t: null, f: null }; ch.boxes.push(b); b.t = walk(t.then); b.f = walk(t.else); return id; }
          if (t.do) { const id = s + '.c' + (++nc), b = { id, kind: 'cond', actions: t.do.slice(), next: null }; ch.boxes.push(b); b.next = walk(t.then); return id; }
          throw new Error('cannot read the block of ' + s);
        };
        box.next = walk(st.next);
      }
    }
    ch.start = ch.start || (ch.boxes.find((b) => b.kind === 'state') || {}).name;
    return ch;
  };
  const byId = (ch) => new Map(ch.boxes.map((b) => [b.id, b]));
  A.states = (ch) => ch.boxes.filter((b) => b.kind === 'state').map((b) => b.name || b.id);
  const stateBox = (ch, name) => ch.boxes.find((b) => b.kind === 'state' && (b.name || b.id) === name);

  /**
   * Every path through the block of a state: [{ conds: [{ cond, value, box }], boxes: [ids], actions: [text],
   * target }]. Throws on a loop inside the block.
   */
  A.paths = function (ch, state) {
    const ids = byId(ch), st = stateBox(ch, state), out = [];
    const go = (id, conds, boxes, actions, seen) => {
      const b = ids.get(id);
      if (!b) { out.push({ conds, boxes, actions, target: null, missing: id }); return; }
      if (b.kind === 'state') { out.push({ conds, boxes, actions, target: b.name || b.id }); return; }
      if (seen.has(id)) { out.push({ conds, boxes, actions, target: null, loop: id }); return; }
      const s2 = new Set(seen); s2.add(id);
      if (b.kind === 'decision') {
        go(b.t, conds.concat([{ cond: b.cond, value: 1, box: id }]), boxes.concat([id]), actions, s2);
        go(b.f, conds.concat([{ cond: b.cond, value: 0, box: id }]), boxes.concat([id]), actions, s2);
      } else go(b.next, conds, boxes.concat([id]), actions.concat(b.actions.map((a) => ({ text: a, box: id }))), s2);
    };
    go(st.next, [], [st.id], st.actions.map((a) => ({ text: a, box: st.id })), new Set());
    return out;
  };

  /** the rules of a chart: { ok, errors: [say], warnings: [say] } */
  A.validate = function (ch) {
    const errors = [], warnings = [], ids = byId(ch);
    const known = new Set([...Object.keys(ch.registers), ...ch.inputs, ...Object.keys(ch.dataInputs), ...Object.keys(ch.status)]);
    const states = A.states(ch);
    if (!states.includes(ch.start)) errors.push('The start state ' + ch.start + ' has no state box.');
    const seenIds = new Set();
    for (const b of ch.boxes) {
      if (seenIds.has(b.id)) errors.push('Two boxes share the id ' + b.id + '.');
      seenIds.add(b.id);
      const refs = b.kind === 'decision' ? [['true', b.t], ['false', b.f]] : [['next', b.next]];
      for (const [k, r] of refs) if (r == null) errors.push((b.kind === 'decision' ? 'Decision ' + b.id + ' has no ' + k + ' branch.' : 'Box ' + b.id + ' leads nowhere: every path must reach a next state.')); else if (!ids.has(r)) errors.push('Box ' + b.id + ' leads to ' + r + ', which is not a box.');
      if (b.kind === 'decision') { try { const e = parseCond(b.cond); for (const n of namesIn(e)) if (!known.has(n)) errors.push('Decision ' + b.id + ' tests ' + n + ', which is not an input, a status signal or a register.'); } catch (e) { errors.push('Decision ' + b.id + ': ' + e.message + '.'); } }
      for (const a of b.actions || []) {
        try {
          const p = parseAction(a);
          if (p.signal) { if (!ch.outputs.includes(p.signal)) errors.push('Box ' + b.id + ' asserts ' + p.signal + ', which is not an output.'); continue; }
          for (const d of p.dest) { const n = d.op === 'id' ? d.name : d.a.name; if (!(n in ch.registers)) errors.push('"' + a + '" writes to ' + n + ', which is not a register.'); }
          for (const n of namesIn(p.expr)) if (!known.has(n)) errors.push('"' + a + '" reads ' + n + ', which is not defined.');
        } catch (e) { errors.push('Box ' + b.id + ': ' + e.message + '.'); }
      }
    }
    for (const [n, c] of Object.entries(ch.status)) { try { for (const x of namesIn(parseCond(c))) if (!known.has(x) || x in ch.status) errors.push('Status ' + n + ' reads ' + x + ', which is not a register or data input.'); } catch (e) { errors.push('Status ' + n + ': ' + e.message + '.'); } }
    if (errors.length) return { ok: false, errors, warnings };
    // blocks: every path from a state box reaches exactly one next state, no loops, no shared boxes
    const owner = new Map();
    for (const s of states) {
      const ps = A.paths(ch, s);
      for (const p of ps) {
        if (p.loop) errors.push('In the block of ' + s + ' a path loops back to ' + p.loop + ' without reaching a state box.');
        for (const id of p.boxes.slice(1)) { if (owner.has(id) && owner.get(id) !== s) errors.push('Box ' + id + ' belongs to the blocks of both ' + owner.get(id) + ' and ' + s + '; each decision or conditional box belongs to one block.'); owner.set(id, s); }
        // a register written twice on one path
        const writes = new Map();
        for (const a of p.actions) {
          const q = parseAction(a.text);
          if (q.signal) continue;
          for (const d of q.dest) {
            const n = d.op === 'id' ? d.name : d.a.name + '[' + d.i + ']', whole = d.op === 'id' ? d.name : d.a.name;
            const clash = [...writes.keys()].find((k) => k === n || k === whole || k.split('[')[0] === whole && d.op === 'id');
            if (clash) errors.push('In the block of ' + s + ', ' + whole + ' is written twice on one path (' + writes.get(clash) + ' and ' + a.text + ').');
            writes.set(n, a.text);
          }
        }
        // a conditional box with no decision above it
        const firstCond = p.boxes.findIndex((id) => ids.get(id).kind === 'cond');
        if (firstCond > 0 && !p.boxes.slice(0, firstCond).some((id) => ids.get(id).kind === 'decision')) warnings.push('Conditional box ' + p.boxes[firstCond] + ' hangs straight under ' + s + ' with no decision; its actions belong in the state box.');
      }
    }
    // reachability
    const reach = new Set([ch.start]), q = [ch.start];
    while (q.length) { const s = q.shift(); for (const p of A.paths(ch, s)) if (p.target && !reach.has(p.target)) { reach.add(p.target); q.push(p.target); } }
    for (const s of states) if (!reach.has(s)) warnings.push('State ' + s + ' cannot be reached from ' + ch.start + '.');
    for (const b of ch.boxes) if (b.kind !== 'state' && !owner.has(b.id)) warnings.push('Box ' + b.id + ' is in no block.');
    return { ok: !errors.length, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
  };

  // ---- running ------------------------------------------------------------------------------------------
  /**
   * Run a chart cycle by cycle. opts: { regs: { A: 3 }, inputs: an object, an array (one object per cycle) or
   * a function (cycle, regs, state) → object, maxCycles (default 200), until: (state, regs, cycle) → bool }.
   * Every transfer of a cycle reads the values from before the clock edge. Returns { cycles, state, regs,
   * outputsLog, trace }.
   */
  A.run = function (ch, opts) {
    opts = opts || {};
    const regs = {};
    for (const [r, w] of Object.entries(ch.registers)) regs[r] = (opts.regs && opts.regs[r] || 0) & mask(w);
    const ids = byId(ch), trace = [], outputsLog = [];
    const parsed = new Map();
    const P = (t) => { if (!parsed.has(t)) parsed.set(t, parseAction(t)); return parsed.get(t); };
    const C = (t) => { if (!parsed.has('?' + t)) parsed.set('?' + t, parseCond(t)); return parsed.get('?' + t); };
    let state = opts.from || ch.start, cycle = 0;
    const max = opts.maxCycles || 200;
    const inputsAt = (k) => (typeof opts.inputs === 'function' ? opts.inputs(k, Object.assign({}, regs), state) : Array.isArray(opts.inputs) ? opts.inputs[k] || opts.inputs[opts.inputs.length - 1] || {} : opts.inputs || {});
    for (; cycle < max; cycle++) {
      if (opts.until && opts.until(state, regs, cycle)) break;
      const inp = inputsAt(cycle);
      const env = (name) => {
        if (name in ch.registers) return { v: regs[name], w: ch.registers[name] };
        if (name in ch.dataInputs) return { v: (inp[name] || 0) & mask(ch.dataInputs[name]), w: ch.dataInputs[name] };
        if (ch.inputs.includes(name)) return { v: inp[name] ? 1 : 0, w: 1 };
        if (name in ch.status) return { v: evalE(C(ch.status[name]), env).v ? 1 : 0, w: 1 };
        return null;
      };
      // walk the block
      const st = stateBox(ch, state), path = [st.id], acts = st.actions.map((a) => ({ text: a, box: st.id })), tests = [];
      let id = st.next, guard = 0;
      while (ids.get(id).kind !== 'state') {
        if (guard++ > ch.boxes.length) throw new Error('a loop in the block of ' + state);
        const b = ids.get(id); path.push(id);
        if (b.kind === 'decision') { const v = evalE(C(b.cond), env).v ? 1 : 0; tests.push({ box: id, cond: b.cond, value: v }); id = v ? b.t : b.f; } else { acts.push(...b.actions.map((a) => ({ text: a, box: id }))); id = b.next; }
      }
      const next = ids.get(id).name || id;
      const outs = acts.filter((a) => P(a.text).signal).map((a) => a.text);
      // compute every transfer first, then write
      const writes = [];
      for (const a of acts) {
        const p = P(a.text);
        if (p.signal) continue;
        let val = evalE(p.expr, env).v;
        // split the value over the destinations, rightmost first
        for (const d of p.dest.slice().reverse()) {
          if (d.op === 'id') { const w = ch.registers[d.name]; writes.push({ reg: d.name, value: val & mask(w), text: a.text, box: a.box }); val = Math.floor(val / (1 << w)); } else { writes.push({ reg: d.a.name, bit: d.i, value: val & 1, text: a.text, box: a.box }); val = Math.floor(val / 2); }
        }
      }
      const before = Object.assign({}, regs);
      for (const w of writes) { if (w.bit != null) regs[w.reg] = (regs[w.reg] & ~(1 << w.bit)) | (w.value << w.bit); else regs[w.reg] = w.value; }
      const changes = Object.keys(regs).filter((r) => regs[r] !== before[r]).map((r) => ({ reg: r, from: before[r], to: regs[r] }));
      outputsLog.push(outs);
      const said = [];
      if (tests.length) said.push(tests.map((t) => t.cond + ' = ' + t.value).join(', '));
      if (outs.length) said.push(outs.join(', ') + ' asserted');
      if (writes.length) said.push([...new Set(writes.map((w) => w.text))].join('; '));
      trace.push({ kind: 'cycle', cycle, state, path, tests, outputs: outs, transfers: [...new Set(writes.map((w) => w.text))], changes, regs: Object.assign({}, regs), inputs: inp, next, say: 'Cycle ' + (cycle + 1) + ' in ' + state + (said.length ? ': ' + said.join('; ') : '') + (changes.length ? ' (' + changes.map((c) => c.reg + ' ' + c.from + ' → ' + c.to).join(', ') + ')' : '') + '; next ' + next + '.' });
      state = next;
    }
    return { cycles: cycle, state, regs, outputsLog, trace };
  };

  // ---- controllers --------------------------------------------------------------------------------------
  /**
   * The control signals and transitions of a chart: decisions on plain inputs and status names are kept;
   * any other condition becomes a status signal of its own. Returns { states, signals, transitions, controls }.
   */
  A.control = function (ch) {
    const states = [ch.start].concat(A.states(ch).filter((s) => s !== ch.start));
    const signals = [], extra = {};
    const sig = (cond) => {
      const t = cond.trim();
      if (/^[A-Za-z_]\w*$/.test(t) && (ch.inputs.includes(t) || t in ch.status)) { if (!signals.includes(t)) signals.push(t); return { name: t, neg: false }; }
      const nm = /^!\s*([A-Za-z_]\w*)$/.exec(t);
      if (nm && (ch.inputs.includes(nm[1]) || nm[1] in ch.status)) { if (!signals.includes(nm[1])) signals.push(nm[1]); return { name: nm[1], neg: true }; }
      let k = Object.keys(extra).find((n) => extra[n] === t);
      if (!k) { k = 'K' + (Object.keys(extra).length + 1); extra[k] = t; }
      if (!signals.includes(k)) signals.push(k);
      return { name: k, neg: false };
    };
    const transitions = [], controls = new Map();
    for (const s of states) for (const p of A.paths(ch, s)) {
      const lits = p.conds.map((c) => { const g = sig(c.cond); return { name: g.name, value: g.neg ? 1 - c.value : c.value }; });
      // drop repeated tests, and paths that test one signal both ways
      const seen = new Map(); let dead = false;
      for (const l of lits) { if (seen.has(l.name) && seen.get(l.name) !== l.value) dead = true; seen.set(l.name, l.value); }
      if (dead) continue;
      const cond = [...seen].map(([name, value]) => ({ name, value }));
      transitions.push({ from: s, to: p.target, cond });
      for (const a of p.actions) {
        const pa = parseAction(a.text), name = pa.signal || pa.text;
        if (!controls.has(name)) controls.set(name, { name, text: pa.text, output: !!pa.signal, terms: [] });
        controls.get(name).terms.push({ state: s, cond });
      }
    }
    // control signal names for the transfers: u1, u2, ...
    let k = 0;
    for (const c of controls.values()) if (!c.output) c.signal = 'u' + (++k); else c.signal = c.name;
    return { states, signals, extraStatus: extra, transitions, controls: [...controls.values()] };
  };
  /** merge terms of one state that differ only in one complemented test (T·X + T·X' = T), and repeats */
  function simplify(terms) {
    let ts = terms.map((t) => ({ state: t.state, cond: t.cond.slice().sort((a, b) => a.name.localeCompare(b.name)) }));
    const key = (t) => t.state + ':' + t.cond.map((c) => c.name + c.value).join(',');
    for (let merged = true; merged;) {
      merged = false;
      const seen = new Set(); ts = ts.filter((t) => { const k = key(t); if (seen.has(k)) return false; seen.add(k); return true; });
      outer: for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
        const a = ts[i], b = ts[j];
        if (a.state !== b.state || a.cond.length !== b.cond.length) continue;
        const diff = a.cond.filter((c, k) => b.cond[k].name !== c.name || b.cond[k].value !== c.value);
        if (diff.length === 1 && a.cond.every((c, k) => b.cond[k].name === c.name)) { ts[i] = { state: a.state, cond: a.cond.filter((c) => c !== diff[0]) }; ts.splice(j, 1); merged = true; break outer; }
      }
      // absorption: a term with no tests absorbs every other term of its state
      const bare = new Set(ts.filter((t) => !t.cond.length).map((t) => t.state));
      const before = ts.length; ts = ts.filter((t) => !t.cond.length || !bare.has(t.state)); if (ts.length !== before) merged = true;
    }
    return ts;
  }
  A.simplifyTerms = simplify;
  const termText = (st, cond) => [st].concat(cond.map((c) => c.name + (c.value ? '' : "'"))).join('·');
  const sumText = (terms) => (terms.length ? terms.join(' + ') : '0');

  /**
   * The controller of a chart by method 'decoder' (a binary state register and a decoder: Tk is 1 in state
   * k), 'onehot' (one flip-flop per state, Yk) or 'counter' (a sequence counter that counts up, clears or
   * loads, decoded to Tk). Returns { method, codes, flipflops, equations: [{ name, text, terms }], controls,
   * trace }.
   */
  A.controller = function (ch, method) {
    method = method || 'decoder';
    const c = A.control(ch), trace = [], N = c.states.length;
    const n = Math.max(1, Math.ceil(Math.log2(N)));
    const codes = {}; c.states.forEach((s, i) => { codes[s] = method === 'onehot' ? c.states.map((_, j) => (j === i ? '1' : '0')).join('') : i.toString(2).padStart(n, '0'); });
    const tname = (s) => (method === 'onehot' ? 'Y' : 'T') + '_' + s;
    const equations = [];
    if (method === 'decoder' || method === 'onehot') {
      trace.push({ kind: 'plan', say: method === 'onehot' ? 'One flip-flop per state: Y_s is 1 only in state s, and D of Y_s collects every transition into s.' : 'A ' + n + '-bit state register (' + c.states.map((s) => s + ' = ' + codes[s]).join(', ') + ') and a decoder whose output T_s is 1 in state s.' });
      if (method === 'onehot') for (const s of c.states) {
        const terms = simplify(c.transitions.filter((t) => t.to === s).map((t) => ({ state: t.from, cond: t.cond })));
        equations.push({ name: 'D_' + s, terms, text: 'D_' + s + ' = ' + sumText(terms.map((t) => termText(tname(t.state), t.cond))) });
      } else for (let b = 0; b < n; b++) {
        const terms = simplify(c.transitions.filter((t) => codes[t.to][b] === '1').map((t) => ({ state: t.from, cond: t.cond })));
        const name = 'D' + (n - 1 - b);
        equations.push({ name, bit: b, terms, text: name + ' = ' + sumText(terms.map((t) => termText(tname(t.state), t.cond))) });
      }
    } else if (method === 'counter') {
      trace.push({ kind: 'plan', say: 'A sequence counter holds the state number (' + c.states.map((s, i) => s + ' = ' + i).join(', ') + '); it counts up for the next state in order, clears for ' + c.states[0] + ', and loads any other state.' });
      const inc = [], clr = [], ld = [], dbits = Array.from({ length: n }, () => []);
      for (const t of c.transitions) {
        const i = c.states.indexOf(t.from), j = c.states.indexOf(t.to), term = { state: t.from, cond: t.cond };
        if (j === i) continue;
        if (j === i + 1) inc.push(term); else if (j === 0) clr.push(term); else { ld.push(term); for (let b = 0; b < n; b++) if (codes[t.to][b] === '1') dbits[b].push(term); }
      }
      [inc, clr, ld].forEach((a) => a.splice(0, a.length, ...simplify(a)));
      dbits.forEach((a) => a.splice(0, a.length, ...simplify(a)));
      equations.push({ name: 'INC', terms: inc, text: 'INC = ' + sumText(inc.map((t) => termText(tname(t.state), t.cond))) });
      equations.push({ name: 'CLR', terms: clr, text: 'CLR = ' + sumText(clr.map((t) => termText(tname(t.state), t.cond))) });
      equations.push({ name: 'LD', terms: ld, text: 'LD = ' + sumText(ld.map((t) => termText(tname(t.state), t.cond))) });
      dbits.forEach((ts, b) => equations.push({ name: 'L' + (n - 1 - b), bit: b, terms: ts, text: 'L' + (n - 1 - b) + ' = ' + sumText(ts.map((t) => termText(tname(t.state), t.cond))) }));
    } else throw new Error('unknown controller method ' + method);
    for (const k of c.controls) k.terms = simplify(k.terms);
    const controls = c.controls.map((k) => ({ name: k.signal, text: k.text, output: k.output, terms: k.terms, eq: k.signal + ' = ' + sumText(k.terms.map((t) => termText(tname(t.state), t.cond))) + (k.output ? '' : '   (' + k.text + ')') }));
    for (const e of equations) trace.push({ kind: 'equation', name: e.name, say: e.text + '.' });
    for (const k of controls) trace.push({ kind: 'control', name: k.name, say: k.eq + '.' });
    if (Object.keys(c.extraStatus).length) trace.push({ kind: 'status', say: 'The datapath supplies ' + Object.entries(c.extraStatus).map(([k, v]) => k + ' = ' + v).join(', ') + '.' });
    return { method, states: c.states, codes, signals: c.signals, flipflops: method === 'onehot' ? N : n, equations, controls, transitions: c.transitions, extraStatus: c.extraStatus, tname, trace };
  };

  /**
   * The controller as a circuit: inputs (the decision signals and RESET), the state flip-flops (with a decoder
   * for 'decoder'; a sequence-counter block for 'counter'), AND-OR logic, and an output per control signal.
   */
  A.circuit = function (ch, method) {
    const F = S.Fsm, U = F.util;
    const k = A.controller(ch, method || 'decoder');
    const c = new S.Netlist.Circuit((ch.name || 'asm') + ' controller');
    const srcs = {};
    for (const s of k.signals) srcs[s] = { pos: c.input(s).pin('y'), neg: null };
    const reset = c.input('RESET').pin('y');
    const clk = c.clock('CLK').pin('y');
    const tn = k.states.map(k.tname);
    const fns = [];
    const cubeOf = (term, vars) => vars.map((v) => (v === k.tname(term.state) ? '1' : (term.cond.find((x) => x.name === v) || { value: '-' }).value === '-' ? '-' : String(term.cond.find((x) => x.name === v).value))).join('');
    const vars = tn.concat(k.signals);
    if (method === 'counter') {
      const n = k.flipflops;
      const sc = c.add('BLOCK', { name: 'SC', seq: true, inputs: ['INC', 'CLR', 'LD'].concat(Array.from({ length: n }, (_, i) => 'L' + (n - 1 - i))).concat([{ name: 'CLK', clock: true }, 'RST']), outputs: tn.map((t, i) => ({ name: 'T' + i, label: t })) }, 'sc');
      c.connect(clk, sc.pin('CLK')); c.connect(reset, sc.pin('RST'));
      tn.forEach((t, i) => { srcs[t] = { pos: sc.pin('T' + i), neg: null }; });
      for (const e of k.equations) fns.push({ cubes: e.terms.map((t) => cubeOf(t, vars)), vars, to: sc.pin(e.name) });
    } else if (method === 'onehot') {
      const ffs = k.states.map((s, i) => c.add('DFF', { set: i === 0, reset: i > 0, name: tn[i] }, 'y_' + s.toLowerCase()));
      c.connect(clk, ...ffs.map((f) => f.pin('clk')));
      c.connect(reset, ...ffs.map((f, i) => f.pin(i === 0 ? 'set' : 'rst')));
      ffs.forEach((f, i) => { srcs[tn[i]] = { pos: f.pin('q'), neg: f.pin('qn') }; });
      k.equations.forEach((e, i) => fns.push({ cubes: e.terms.map((t) => cubeOf(t, vars)), vars, to: ffs[i].pin('d') }));
    } else {
      const n = k.flipflops;
      const ffs = Array.from({ length: n }, (_, b) => c.add('DFF', { reset: true, name: 'Q' + (n - 1 - b) }, 'q' + (n - 1 - b)));
      c.connect(clk, ...ffs.map((f) => f.pin('clk')));
      c.connect(reset, ...ffs.map((f) => f.pin('rst')));
      const dec = c.add('DECODER', { k: n }, 'dec');
      ffs.forEach((f, b) => c.connect(f.pin('q'), dec.pin('a' + (n - 1 - b))));
      tn.forEach((t, i) => { srcs[t] = { pos: dec.pin('y' + i), neg: null }; });
      for (const e of k.equations) fns.push({ cubes: e.terms.map((t) => cubeOf(t, vars)), vars, to: ffs[e.bit].pin('d') });
    }
    for (const ctl of k.controls) fns.push({ cubes: ctl.terms.map((t) => cubeOf(t, vars)), vars, to: c.output(ctl.name).pin('a') });
    // dedupe identical cubes within a function
    for (const f of fns) f.cubes = [...new Set(f.cubes)];
    // each function its own row of gates, so the controller draws as a state machine
    U.sopGates(c, srcs, fns, { share: false });
    U.closeOpen(c);
    return { circuit: c, controller: k };
  };

  // ---- Verilog text -----------------------------------------------------------------------------------
  /** a behavioural Verilog model of the whole chart: controller and datapath in one module */
  A.verilog = function (ch) {
    const states = [ch.start].concat(A.states(ch).filter((s) => s !== ch.start));
    const n = Math.max(1, Math.ceil(Math.log2(states.length)));
    const id = (s) => s.replace(/[^A-Za-z0-9_]/g, '_');
    // state names as localparams S_<name>, so they never clash with ports
    const sid = (s) => 'S_' + id(s);
    const ids = byId(ch);
    const vec = (w) => (w > 1 ? '[' + (w - 1) + ':0] ' : '');
    const lines = [];
    const ports = ['input clk', 'input reset'].concat(ch.inputs.map((i) => 'input ' + i), Object.entries(ch.dataInputs).map(([k, w]) => 'input ' + vec(w) + k), ch.outputs.map((o) => 'output reg ' + o), Object.entries(ch.registers).map(([r, w]) => 'output reg ' + vec(w) + r));
    lines.push('// ' + (ch.name || 'asm') + ': controller and datapath from the ASM chart');
    lines.push('module ' + id(ch.name || 'asm') + ' (');
    lines.push(ports.map((p) => '  ' + p).join(',\n'));
    lines.push(');');
    lines.push('  localparam ' + states.map((s, i) => sid(s) + ' = ' + n + "'d" + i).join(', ') + ';');
    lines.push('  reg ' + vec(n) + 'state;');
    for (const [k, v] of Object.entries(ch.status)) lines.push('  wire ' + k + ' = ' + vlogExpr(parseCond(v)) + ';');
    const cond = (c) => vlogExpr(parseCond(c));
    // the block of a state as nested ifs; emit(kind) writes transfers ('seq') or outputs ('comb')
    const block = (s, ind, kind) => {
      const out = [];
      const acts = (list, pad) => {
        for (const a of list) {
          const p = parseAction(a);
          if (kind === 'seq' && !p.signal) out.push(pad + vlogDest(p.dest) + ' <= ' + vlogExpr(p.expr) + ';');
          if (kind === 'comb' && p.signal) out.push(pad + p.signal + ' = 1;');
        }
      };
      const go = (bid, pad) => {
        const b = ids.get(bid);
        if (b.kind === 'state') { if (kind === 'seq') out.push(pad + 'state <= ' + sid(b.name || b.id) + ';'); return; }
        if (b.kind === 'cond') { acts(b.actions, pad); go(b.next, pad); return; }
        const at = out.length;
        out.push(pad + 'if (' + cond(b.cond) + ') begin');
        const t0 = out.length; go(b.t, pad + '  '); const tn = out.length - t0;
        const mid = out.length; out.push(pad + 'end else begin');
        const f0 = out.length; go(b.f, pad + '  '); const fn = out.length - f0;
        out.push(pad + 'end');
        if (kind === 'comb' && !tn && !fn) out.splice(at);
        else if (kind === 'comb' && !fn) out.splice(mid, 2, pad + 'end');
      };
      const st = stateBox(ch, s);
      acts(st.actions, ind);
      go(st.next, ind);
      return out;
    };
    lines.push('  always @(posedge clk or posedge reset)');
    lines.push('    if (reset) state <= ' + sid(ch.start) + ';');
    lines.push('    else case (state)');
    for (const s of states) { lines.push('      ' + sid(s) + ': begin'); lines.push(...block(s, '        ', 'seq')); lines.push('      end'); }
    lines.push('    endcase');
    lines.push('  always @* begin');
    for (const o of ch.outputs) lines.push('    ' + o + ' = 0;');
    lines.push('    case (state)');
    for (const s of states) { const b = block(s, '        ', 'comb'); if (b.some((l) => /= 1;/.test(l))) { lines.push('      ' + sid(s) + ': begin'); lines.push(...b.filter((l) => !/state <=/.test(l))); lines.push('      end'); } }
    lines.push('      default: ;');
    lines.push('    endcase');
    lines.push('  end');
    lines.push('endmodule');
    return lines.join('\n') + '\n';
  };
  function vlogExpr(e) {
    switch (e.op) {
      case 'num': return String(e.v);
      case 'id': return e.name;
      case 'bit': return vlogExpr(e.a) + '[' + e.i + ']';
      case 'cat': return '{' + e.parts.map(vlogExpr).join(', ') + '}';
      case 'u~': case 'u!': case 'u-': return e.op[1] + vlogExpr(e.a);
    }
    return '(' + vlogExpr(e.a) + ' ' + e.op + ' ' + vlogExpr(e.b) + ')';
  }
  const vlogDest = (ds) => (ds.length === 1 ? vlogExpr(ds[0]) : '{' + ds.map(vlogExpr).join(', ') + '}');

  // ---- examples (all our own) ----------------------------------------------------------------------------
  A.examples = {
    /** shift-and-add multiplier, 4 × 4 bits: the product ends in {A, Q} */
    multiplier: () => A.chart({
      name: 'multiplier', inputs: ['START'], dataInputs: { MIN: 4, QIN: 4 }, registers: { A: 4, M: 4, Q: 4, C: 1, P: 3 }, outputs: ['READY'],
      status: { Q0: 'Q[0]', Z: 'P == 0' },
      states: {
        IDLE: { actions: ['READY'], next: { if: 'START', then: { do: ['A ← 0', 'C ← 0', 'P ← 4', 'M ← MIN', 'Q ← QIN'], then: 'ADD' }, else: 'IDLE' } },
        ADD: { actions: ['P ← P - 1'], next: { if: 'Q0', then: { do: ['{C, A} ← A + M'], then: 'SHIFT' }, else: 'SHIFT' } },
        SHIFT: { actions: ['{C, A, Q} ← {C, A, Q} >> 1'], next: { if: 'Z', then: 'IDLE', else: 'ADD' } },
      },
    }),
    /** restoring divider, 4 bits: quotient in Q, remainder in A; E is set on division by zero */
    divider: () => {
      const after = { if: 'Z', then: 'IDLE', else: 'SHIFT' };
      return A.chart({
        name: 'divider', inputs: ['START'], dataInputs: { DIN: 4, VIN: 4 }, registers: { A: 5, Q: 4, M: 4, P: 3, E: 1 }, outputs: ['READY'],
        status: { DZ: 'VIN == 0', NEG: 'A[4]', Z: 'P == 0' },
        states: {
          IDLE: { actions: ['READY'], next: { if: 'START', then: { if: 'DZ', then: { do: ['E ← 1'], then: 'IDLE' }, else: { do: ['A ← 0', 'Q ← DIN', 'M ← VIN', 'P ← 4', 'E ← 0'], then: 'SHIFT' } }, else: 'IDLE' } },
          SHIFT: { actions: ['{A, Q} ← {A, Q} << 1', 'P ← P - 1'], next: 'SUB' },
          SUB: { actions: ['A ← A - M'], next: 'TEST' },
          TEST: { actions: [], next: { if: 'NEG', then: { do: ['A ← A + M'], then: after }, else: { do: ['Q[0] ← 1'], then: after } } },
        },
      });
    },
    /** greatest common divisor by repeated subtraction: the result is left in X */
    gcd: () => A.chart({
      name: 'gcd', inputs: ['START'], dataInputs: { XIN: 8, YIN: 8 }, registers: { X: 8, Y: 8 }, outputs: ['READY'],
      status: { EQ: 'X == Y', LT: 'X < Y' },
      states: {
        IDLE: { actions: ['READY'], next: { if: 'START', then: { do: ['X ← XIN', 'Y ← YIN'], then: 'CMP' }, else: 'IDLE' } },
        CMP: { actions: [], next: { if: 'EQ', then: 'IDLE', else: { if: 'LT', then: { do: ['Y ← Y - X'], then: 'CMP' }, else: { do: ['X ← X - Y'], then: 'CMP' } } } },
      },
    }),
    /** a crossing of a main road and a side road: a side-road car sensor SC and a pedestrian button PB */
    traffic: () => A.chart({
      name: 'traffic', inputs: ['SC', 'PB'], registers: { T: 3 }, outputs: ['MAIN_G', 'MAIN_Y', 'MAIN_R', 'SIDE_G', 'SIDE_Y', 'SIDE_R'],
      status: { LONG: 'T == 5', SHORT: 'T == 1', DONE: 'T == 3' },
      states: {
        MG: { actions: ['MAIN_G', 'SIDE_R'], next: { if: 'LONG', then: { if: 'SC', then: { do: ['T ← 0'], then: 'MY' }, else: { if: 'PB', then: { do: ['T ← 0'], then: 'MY' }, else: 'MG' } }, else: { do: ['T ← T + 1'], then: 'MG' } } },
        MY: { actions: ['MAIN_Y', 'SIDE_R'], next: { if: 'SHORT', then: { do: ['T ← 0'], then: 'SG' }, else: { do: ['T ← T + 1'], then: 'MY' } } },
        SG: { actions: ['MAIN_R', 'SIDE_G'], next: { if: 'DONE', then: { do: ['T ← 0'], then: 'SY' }, else: { do: ['T ← T + 1'], then: 'SG' } } },
        SY: { actions: ['MAIN_R', 'SIDE_Y'], next: { if: 'SHORT', then: { do: ['T ← 0'], then: 'MG' }, else: { do: ['T ← T + 1'], then: 'SY' } } },
      },
    }),
    /** a coin-accepting controller: price 20, coins of 5 (C5) and 10 (C10), change paid in 5s (CHG) */
    vending: () => A.chart({
      name: 'vending', inputs: ['C5', 'C10'], registers: { SUM: 5 }, outputs: ['VEND', 'CHG'],
      status: { ENOUGH: 'SUM >= 20', ZERO: 'SUM == 0' },
      states: {
        WAIT: { actions: [], next: { if: 'C10', then: { do: ['SUM ← SUM + 10'], then: 'CHECK' }, else: { if: 'C5', then: { do: ['SUM ← SUM + 5'], then: 'CHECK' }, else: 'WAIT' } } },
        CHECK: { actions: [], next: { if: 'ENOUGH', then: 'VEND', else: 'WAIT' } },
        VEND: { actions: ['VEND', 'SUM ← SUM - 20'], next: 'CHANGE' },
        CHANGE: { actions: [], next: { if: 'ZERO', then: 'WAIT', else: { do: ['CHG', 'SUM ← SUM - 5'], then: 'CHANGE' } } },
      },
    }),
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
