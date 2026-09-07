// Part 10 (asynchronous circuits), shared helpers: the models the topics run (all our own), reading excitation
// equations typed by the reader, building the gate circuit of a model (each loop through a buffer that stands for
// its delay), and drawing a model's transition or flow table with the stable entries circled.
(function (S) {
  'use strict';
  const P10 = (S.P10 = S.P10 || {});
  const A = () => S.Async, FL = () => S.Kit.flow, U = () => S.Fsm.util;

  S.family({ id: 'p10-analysis', part: 'async', order: 10, title: 'Analysis', blurb: 'Cut the feedback loops, write the transition and flow tables, find the stable states, and watch races and cycles play out in every order.' });
  S.family({ id: 'p10-design', part: 'async', order: 20, title: 'Design', blurb: 'From a word description to a circuit: the primitive flow table, the merger diagram, a race-free assignment and hazard-free equations.' });
  S.family({ id: 'p10-hazards', part: 'async', order: 30, title: 'Hazards', blurb: 'Static, dynamic and essential hazards, each caught as a glitch on the simulator\'s waveform, and the designs that avoid them.' });

  /** the models, as equations a reader could type */
  P10.models = {
    two: { label: 'Two loops (races and a cycle)', eqs: "Y1 = x1x2' + x1y2'; Y2 = x2y1' + x2y2; z = y1y2" },
    celem: { label: 'A C-element (follows when the inputs agree)', eqs: 'Y = x1x2 + x1y + x2y; z = y' },
    srnor: { label: 'An SR latch, one loop', eqs: "Y = S + R'y; Q = y" },
    osc: { label: 'An oscillation', eqs: "Y1 = x1y1' + x2y1; z = y1" },
    fill: { label: 'Three loops filling one by one (a cycle)', eqs: 'Y1 = xy2y3 + y1; Y2 = xy3 + y2; Y3 = x + y3; z = y1' },
  };
  P10.modelOptions = Object.entries(P10.models).map(([value, m]) => ({ value, label: m.label }));

  /**
   * Read equations: one per line (or separated by ;). Excitations are named Y, Y1, Y2 ... (the secondary
   * variables are then y, y1, y2 ...); any other name is an output. Inputs are the remaining variables.
   */
  P10.parse = function (text) {
    const Nl = S.Netlist;
    const lines = String(text).split(/[\n;]+/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error('write at least one excitation, such as Y = x1x2 + x1y');
    const Y = {}, outputs = {}, vars = [];
    const used = new Set();
    for (const l of lines) {
      const m = /^([A-Za-z][\w]*)\s*=\s*(.+)$/.exec(l);
      if (!m) throw new Error('"' + l + '" is not of the form NAME = expression');
      let e;
      try { e = Nl.parse(m[2]); } catch (x) { throw new Error(m[1] + ': ' + x.message); }
      for (const v of Nl.vars(e)) used.add(v);
      if (/^Y\d*$/.test(m[1])) { const v = 'y' + m[1].slice(1); if (vars.includes(v)) throw new Error(m[1] + ' is given twice'); vars.push(v); Y[v] = m[2]; } else outputs[m[1]] = m[2];
    }
    if (!vars.length) throw new Error('give at least one excitation named Y, Y1, Y2 ...');
    if (vars.length > 3) throw new Error('at most three secondary variables, so the tables stay readable');
    vars.sort();
    const inputs = [...used].filter((v) => !vars.includes(v)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (!inputs.length) throw new Error('the excitations need at least one input');
    if (inputs.length > 2) throw new Error('at most two inputs (' + inputs.join(', ') + ' are ' + inputs.length + ')');
    return { inputs, vars, Y, outputs, name: 'model' };
  };
  P10.check = (label) => (v) => { try { P10.parse(v); return null; } catch (e) { return label + ': ' + e.message; } };
  P10.model = (text) => A().fromEquations(P10.parse(text));

  /** the cubes of a sum of products, in the order the terms were written ('-' for a missing variable) */
  P10.cubes = function (ast, vars) {
    const terms = ast.op === 'or' ? ast.args : [ast];
    return terms.map((t) => {
      const lits = t.op === 'and' ? t.args : [t];
      const c = vars.map(() => '-');
      for (const l of lits) {
        const v = l.op === 'not' ? l.a : l;
        if (v.op !== 'var') throw new Error('write each excitation as a sum of products');
        const i = vars.indexOf(v.name);
        c[i] = l.op === 'not' ? '0' : '1';
      }
      return c.join('');
    });
  };
  /**
   * The gate circuit of a model: AND-OR logic for each excitation into a buffer (the loop's delay), whose
   * output is the secondary variable. Terms are kept as written, so a redundant term stays. Returns the
   * circuit; o.delays {part id: ns} sets delays (tpLH = tpHL).
   */
  P10.circuit = function (spec, o) {
    o = o || {};
    const Nl = S.Netlist, c = new Nl.Circuit(o.title || 'asynchronous circuit');
    const order = spec.vars.concat(spec.inputs);
    const srcs = {};
    for (const x of spec.inputs) srcs[x] = { pos: c.input(x).pin('y'), neg: null };
    // each loop through a delay block (for drawing and simulation) or a plain buffer (for analysing the gates)
    const loops = spec.vars.map((v) => {
      const b = o.buffers ? c.gate('BUF', 1, 'loop_' + v) : P10.delay(c, v, o.loopDelay);
      const out = o.buffers ? b.pin('y') : b.pin(v);
      srcs[v] = { pos: out, neg: null }; c.name(out, v, false);
      return o.buffers ? b.pin('i0') : b.pin(A().exName(v));
    });
    const fns = spec.vars.map((v, i) => ({ cubes: P10.cubes(Nl.parse(spec.Y[v]), order), vars: order, to: loops[i] }));
    for (const [k, t] of Object.entries(spec.outputs || {})) {
      const e = Nl.parse(t);
      if (e.op === 'var' && spec.vars.includes(e.name)) { c.connect(srcs[e.name].pos, c.output(k).pin('a')); continue; }
      fns.push({ cubes: P10.cubes(e, order), vars: order, to: c.output(k).pin('a') });
    }
    U().sopGates(c, srcs, fns);
    // a port for each variable, unless an output is the variable itself already
    for (const v of spec.vars) if (!(v in (spec.outputs || {})) && !Object.values(spec.outputs || {}).some((t) => t.replace(/\s+/g, '') === v)) c.connect(srcs[v].pos, c.output(v).pin('a'));
    U().closeOpen(c);
    for (const p of c.parts) if (o.delays && o.delays[p.id] !== undefined) Object.assign(p.params, { tpLH: o.delays[p.id], tpHL: o.delays[p.id] });
    if (!o.buffers) { c.style = 'async'; P10.registerStyle(); }
    return c;
  };
  /** mark the wires of the named nets as rails, the way a drafter draws literal lines */
  P10.rails = function (res, names) {
    for (const n of res.nets) {
      if (!names.includes(n.name)) continue;
      n.paths = (n.paths || n.polylines.map((pts) => ({ rail: false, pts }))).map((q) => ({ rail: true, pts: q.pts }));
    }
    return res;
  };
  /**
   * A loop's delay as a block holding one buffer (input Y, output y), so the drawing can treat the loops as it
   * treats flip-flops in a state machine: the logic as rails and products, each loop returning over the top.
   */
  P10.delay = function (c, v, d, id) {
    const Nl = S.Netlist, inner = new Nl.Circuit('delay');
    const ex = A().exName(v);
    const b = inner.gate('BUF', 1, 'buf');
    if (d) Object.assign(b.params, { tpLH: d, tpHL: d });
    inner.connect(inner.input(ex).pin('y'), b.pin('i0'));
    inner.connect(b.pin('y'), inner.output(v).pin('a'));
    // the pins go unlabelled: the wires into and out of a delay are named on the drawing already
    const prm = S.Parts.blockParams(inner, 'delay');
    prm.inputs = prm.inputs.map((q) => Object.assign({}, q, { label: '' }));
    prm.outputs = prm.outputs.map((q) => Object.assign({}, q, { label: '' }));
    return c.add('BLOCK', Object.assign(prm, { loop: true }), id || 'loop_' + v);
  };
  /** a circuit from the design flow, its loop buffers turned into delay blocks (same nets, same names) */
  P10.blocks = function (c, o) {
    o = o || {};
    for (const buf of c.parts.filter((p) => p.type === 'BUF' && /^loop_/.test(p.id))) {
      const v = buf.id.slice(5), inNet = buf.net.i0, outNet = buf.net.y;
      c.parts.splice(c.parts.indexOf(buf), 1); c.byId.delete(buf.id);
      const blk = P10.delay(c, v, o.loopDelay);
      const ex = A().exName(v);
      for (const [net, pin, mine] of [[inNet, ex, 'i0'], [outNet, v, 'y']]) {
        const r = net.pins.find((q) => q.part === buf && q.pin === mine);
        r.part = blk; r.pin = pin; blk.net[pin] = net;
      }
    }
    // one port per net: an output that is a variable itself replaces the variable's own port
    for (const p of c.parts.filter((q) => q.type === 'OUT' && /^out_y\d*$/.test(q.id))) {
      const net = p.net.a;
      if (!net || !net.pins.some((r) => r.part !== p && r.part.type === 'OUT')) continue;
      net.pins = net.pins.filter((r) => r.part !== p);
      c.parts.splice(c.parts.indexOf(p), 1); c.byId.delete(p.id);
    }
    c.style = 'async';
    P10.registerStyle();
    return c;
  };
  /** the 'async' drawing style: the state machine style with delay blocks in place of flip-flops */
  P10.registerStyle = function () {
    const St = S.Styles, Sym = S.Symbols, Nl = S.Netlist;
    if (!St || St.styles.async) return;
    const key = (r) => r.part.id + '.' + r.pin;
    const inOf = (b) => b.pins.find((q) => q.dir === 'in').name, outOf = (b) => b.pins.find((q) => q.dir === 'out').name;
    St.styles.async = function (c) {
      const loops = c.parts.filter((p) => p.type === 'BLOCK' && p.params.loop);
      if (!loops.length) return null;
      const used = loops.filter((b) => St.sinksOf(b, outOf(b)).some((r) => Nl.GATES.has(r.part.type) || r.part.type === 'BLOCK')).map((b) => ({ part: b, pin: outOf(b) }));
      const stateOrder = used.slice().reverse();
      const T = St.twoLevel(c, { state: stateOrder, allow: true });
      if (!T) return null;
      const sh = St.sheet(c, 'async');
      const n = stateOrder.length;
      const stateTop = new Map(stateOrder.map((r, k) => [key(r), -3 - 2 * (n - 1 - k)]));
      const cons = loops.map((b) => St.driverOf(b, inOf(b))).concat(c.parts.filter((p) => p.type === 'OUT').map((p) => St.driverOf(p, 'a')).filter((d) => d && Nl.GATES.has(d.part.type)));
      const R = St.railsAndProducts(sh, c, T, { consumers: cons, stateOrder, stateTop, noDirect: true });
      const S2 = St.sums(sh, c, T, R, { consumers: cons.map((d) => ({ port: null, d })), noPorts: true });
      const xF = S2.xRight + 6;
      let lastBottom = -Infinity;
      const rowOf = (d) => (T.isRail(d) ? R.order.find((q) => q.kind === 'pass' && key(q.src) === key(d) && !q.sum).row : sh.at(d.part, d.pin).y);
      for (const b of loops) {
        const g = sh.g(b), d = St.driverOf(b, inOf(b)), row = rowOf(d);
        let y = row - g.pins[inOf(b)].y;
        if (y < lastBottom + 3) y = lastBottom + 3;
        sh.put(b, xF, y);
        lastBottom = y + g.h;
        const at = sh.at(b, inOf(b)), ni = sh.net(b, inOf(b));
        const from = T.isRail(d) ? [R.railX.get(key(d)), row] : [sh.at(d.part, d.pin).x, row];
        if (at.y === row) sh.line(ni, [from, [at.x, at.y]]);
        else sh.line(ni, [from, [xF - 3, row], [xF - 3, at.y], [at.x, at.y]]);
      }
      const xR = xF + Math.max(...loops.map((b) => sh.g(b).w));
      stateOrder.forEach((r, k) => {
        const at = sh.at(r.part, r.pin), ni = sh.net(r.part, r.pin), xr = xR + 3 + 2 * (n - 1 - k), yl = stateTop.get(key(r));
        sh.line(ni, [[at.x, at.y], [xr, at.y], [xr, yl], [R.railX.get(key(r)), yl]]);
      });
      const xO = xR + 3 + 2 * n + 3;
      let yFoot = -Infinity;
      c.parts.forEach((p, i) => { if (sh.placed(p)) yFoot = Math.max(yFoot, sh.Y[i] + sh.geo[i].h); });
      yFoot += 3;
      for (const p of c.parts.filter((q) => q.type === 'OUT')) {
        const d = St.driverOf(p, 'a'), at = sh.at(d.part, d.pin);
        const k = stateOrder.findIndex((r) => r.part === d.part && r.pin === d.pin);
        if (d.part.type === 'BLOCK' && k >= 0) {
          const rk = key(stateOrder[k]), rx = R.railX.get(rk), g = Sym.variant(p, { orient: 'down' });
          const low = R.lowest.has(rk) ? R.lowest.get(rk) : stateTop.get(rk);
          sh.put(p, rx - g.w / 2, yFoot, g);
          sh.line(sh.net(p, 'a'), [[rx, low], [rx, yFoot - 3]], true);
          sh.line(sh.net(p, 'a'), [[rx, yFoot - 3], [rx, yFoot]]);
          continue;
        }
        sh.put(p, xO, at.y - 1);
        if (d.part.type === 'BLOCK') sh.line(sh.net(p, 'a'), [[at.x, at.y], [xO, at.y]]);
      }
      return sh.plan(c.title);
    };
  };

  /** codes of the rows and columns, in Gray order */
  P10.rowsOf = (m) => FL().gray(m.vars.length);
  P10.colsOf = (m) => FL().gray(m.inputs.length);
  const exName = (v) => A().exName(v);
  P10.exNames = (m) => m.vars.map(exName).join('');

  /**
   * A model's transition table (or flow table with names: {code: letter}). o: {x, y, prefix, upto (cells filled
   * so far, row by row), hot: [[code, x]], act: [[code, x]], names, outputs (a column of outputs per stable
   * state), race: [[code, x]] (cells shaded), title}
   */
  P10.table = function (m, an, o) {
    o = o || {};
    const rows = o.names ? P10.rowsOf(m).slice().sort((a, b) => o.names[a].localeCompare(o.names[b])) : P10.rowsOf(m), cols = P10.colsOf(m);
    const upto = o.upto === undefined ? Infinity : o.upto;
    const keyOf = (r, c) => r + '|' + c;
    const hot = new Set((o.hot || []).map((p) => keyOf(p[0], p[1]))), act = new Set((o.act || []).map((p) => keyOf(p[0], p[1]))), race = new Set((o.race || []).map((p) => keyOf(p[0], p[1])));
    const nm = (code) => (o.names ? o.names[code] : code);
    const t = FL().table({
      x: o.x || 0, y: o.y || 0, prefix: o.prefix || 'tt', rows, cols, title: o.title,
      rowHead: rows.map((r) => (o.names ? o.names[r] + ' (' + r + ')' : r)), colHead: cols,
      corner: (o.names ? 'row' : m.vars.join('')) + ' \\ ' + m.inputs.join(''),
      cell: (r, c, i, j) => {
        if (i * cols.length + j >= upto) return { text: '' };
        const Y = an.table[r][c], st = Y === r;
        const k = keyOf(r, c);
        const cls = [hot.has(k) ? 'hot' : '', act.has(k) ? 'act' : '', race.has(k) ? 'race' : '', st ? '' : 'unstable'].filter(Boolean).join(' ');
        const out = o.outputs && Object.keys(m.outputs).length ? ', ' + m.Z(c, r) : '';
        return { text: nm(Y) + out, stable: st && o.circle !== false, cls };
      },
    });
    // which cells are hot or act, keyed as the table draws them
    const cellKey = (r, c) => t.key(rows.indexOf(r), cols.indexOf(c));
    // a hot or act cell that is circled shows it on its circle
    for (const it of t.items) {
      const mm = /:o:(\d+),(\d+)$/.exec(it.key);
      if (!mm) continue;
      const k = keyOf(rows[+mm[1]], cols[+mm[2]]);
      if (hot.has(k)) it.cls += ' hot';
      if (act.has(k)) it.cls += ' act';
    }
    return Object.assign(t, { rows, cols, cellKey });
  };
  /** the excitation of total state (x, y) worked out in words: "Y1 = ... = 1, Y2 = ... = 0" */
  P10.work = function (m, x, y) {
    const env = {};
    m.inputs.forEach((n, i) => { env[n] = +x[i]; });
    m.vars.forEach((n, i) => { env[n] = +y[i]; });
    return m.vars.map((v) => exName(v) + ' = ' + U().text(m.excitation[v]) + ' = ' + S.Netlist.evaluate(m.excitation[v], env)).join('; ');
  };
  P10.lines = function (keyBase, x, y, lines, cls, gap) {
    return lines.map((l, i) => FL().line(keyBase + i, x, y + i * (gap || 24), typeof l === 'string' ? l : l.text, typeof l === 'string' ? cls : l.cls || cls));
  };
  P10.width = (lines, size) => Math.max(0, ...lines.map((l) => S.geom.textWidth(typeof l === 'string' ? l : l.text, size || 15, { mono: true })));
  /** one camera per scene: frames that share f.scene share the box around all of them (others get the topic's) */
  P10.scenes = function (frames) {
    P10.big(frames);
    const by = new Map();
    for (const f of frames) if (f.scene) { const b = S.stageBounds(f.items); if (!b) continue; by.set(f.scene, by.has(f.scene) ? S.geom.union([by.get(f.scene), b]) : b); }
    // a scene of a few lines of text is not blown up past about twice its size
    for (const [k, b] of by) { const w = Math.max(b.w, 700), h = Math.max(b.h, 380); by.set(k, { x: b.x - (w - b.w) / 2, y: b.y - (h - b.h) / 2, w, h }); }
    for (const f of frames) if (f.scene && by.has(f.scene)) f.view = by.get(f.scene);
    return frames;
  };
  /**
   * A run shown in two scenes, each filling the stage: the circuit (values at time t, gates lit) and the
   * waveforms (drawn up to t). o: {R, signals, t0, t1, w, spans(t), marks(t)}. Each returns a partial frame.
   */
  P10.split = function (o) {
    const TM = S.Kit.timing;
    const w = o.w || 640;
    return {
      circ: (t, hot) => ({ scene: 'circ', items: [TM.schem('circ', o.R, t, { x: 0, y: 0, hot: hot || [] })] }),
      wave: (t) => {
        // about one time label per 110 px, so labels never run together
        const wv = TM.waves({ x: 0, y: 0, w, t0: o.t0 || 0, t1: o.t1, now: t, signals: o.signals, spans: o.spans ? o.spans(t) : [], marks: o.marks ? o.marks(t) : [], ticks: Math.max(2, Math.floor(w / 110)), prefix: 'tw', rowH: 26, gap: 14 });
        for (const it of wv.items) if (it.kind === 'text') it.size = Math.max(it.size || 14, 15);
        return { scene: 'wave', items: wv.items };
      },
    };
  };
  /** headings and table heads at full size in every frame */
  P10.big = (frames) => { for (const f of frames) S.Kit.cpu.big(f.items); return frames; };
  /** a closer camera for a narrow screen: just this box, padded */
  P10.narrow = (f, box, pad) => { const p = pad === undefined ? 20 : pad; if (f && box) f.narrowView = { x: box.x - p, y: box.y - p, w: box.w + 2 * p, h: box.h + 2 * p }; return f; };
  P10.plural = (k, w) => k + ' ' + w + (k === 1 ? '' : 's');
})(globalThis.Sirkit = globalThis.Sirkit || {});
