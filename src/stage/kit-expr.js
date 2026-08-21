// Expressions on the stage: an expression as a row of chips (one per variable, literal, operator and bracket),
// so a subterm can be lit, boxed and rewritten, its chips gliding or growing out of the old ones; the expression's
// tree beside its gate circuit with values on both; small truth tables; and one gate drawn alone, with hollow
// bubbles that can sit at any of its pins and slide from one pin to another (De Morgan's bubble pushing).
// S.Kit.expr.chips(expr, opts) -> {items, w, h, span(path) -> box, tokens}
// S.Kit.expr.tree(expr, opts)  -> {items, box}
// S.Kit.expr.circuit(expr, opts) -> {circuit, res};  S.Kit.expr.schem(key, made, opts) -> stage item
// S.Kit.expr.gate(type, n, opts) -> {circuit, res, pin(name) -> {x, y} from the drawing's top-left, w, h}
// S.Kit.expr.table(opts) -> the truth table of S.Kit.truth with columns given as expressions or functions
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const X = (K.expr = {});
  const Geo = S.geom;
  const B = () => S.Bool;
  const PREC = { or: 1, xor: 2, and: 3, not: 4, var: 5, const: 5 };
  const pstr = (p) => (p.length ? p.join('.') : 'r');
  X.pstr = pstr;
  const P = (e) => (typeof e === 'string' ? B().parse(e) : e);
  X.P = P;

  /** The chips of an expression, in reading order: [{t, path, role, kind}] and the span of every subterm */
  X.tokens = function (expr, opts) {
    opts = opts || {};
    const e = P(expr), out = [], spans = new Map();
    const push = (t, p, role, kind) => out.push({ t, path: pstr(p), role, kind });
    function wrap(x, p, parentOp) {
      const need = x.op !== 'var' && x.op !== 'const' && x.op !== 'not' && (PREC[x.op] < PREC[parentOp] || x.op === parentOp);
      if (need) push('(', p, '(', 'paren');
      str(x, p);
      if (need) push(')', p, ')', 'paren');
      if (need) { const s = spans.get(pstr(p)); s[0] -= 1; s[1] += 1; }
    }
    function str(x, p) {
      const start = out.length;
      switch (x.op) {
        case 'var': push(x.name, p, 'v', 'var'); break;
        case 'const': push(String(x.v), p, 'v', 'const'); break;
        case 'not': {
          const a = x.a;
          if (a.op === 'var' || a.op === 'const') { push((a.op === 'var' ? a.name : String(a.v)) + '′', p, 'v', 'lit'); spans.set(pstr(p.concat(0)), [start, start + 1]); }
          else if (a.op === 'not') { str(a, p.concat(0)); push('′', p, 'bar', 'op'); }
          else { push('(', p, 'nl', 'paren'); str(a, p.concat(0)); push(')′', p, 'nr', 'paren'); }
          break;
        }
        default: {
          const sym = x.op === 'or' ? '+' : x.op === 'xor' ? '⊕' : '·';
          x.args.forEach((a, i) => {
            if (i && (x.op !== 'and' || opts.dots)) push(sym, p, 'o' + i, 'op');
            wrap(a, p.concat(i), x.op);
          });
        }
      }
      spans.set(pstr(p), [start, out.length]);
    }
    str(e, []);
    return { tokens: out, spans };
  };

  /**
   * opts: {prefix, x, y (the top-left, or the centre with center: true), size, dots (write · for AND), box:
   * {path: cls} (subterms with a box behind them), lit: {path: cls} (chips lit), dim (paths dimmed), enter: {path:
   * src key or keys} (chips of a subterm grow out of these), keyOf(token) (custom keys)}
   */
  X.chips = function (expr, opts) {
    opts = opts || {};
    const Pre = opts.prefix || 'ex', size = opts.size || 20, gap = opts.gap === undefined ? 1 : opts.gap;
    const { tokens, spans } = X.tokens(expr, opts);
    const h = Math.round(size * 1.75);
    const ws = tokens.map((t) => Math.ceil(Geo.textWidth(t.t, size, { mono: true }) - (/′$/.test(t.t) ? size * 0.25 : 0)) + (t.kind === 'op' && t.t !== '′' ? 16 : t.kind === 'paren' ? 2 : 5));
    const W = ws.reduce((a, b) => a + b + gap, -gap);
    let x = (opts.x || 0) - (opts.center ? W / 2 : 0);
    const y = (opts.y || 0) - (opts.center ? h / 2 : 0);
    const xs = [];
    ws.forEach((w) => { xs.push(x); x += w + gap; });
    const inside = (path, q) => q === path || path === 'r' || q.startsWith(path + '.');
    const lit = opts.lit || {}, box = opts.box || {}, dim = opts.dim || [];
    const key = opts.keyOf || ((t) => Pre + ':' + t.path + ':' + t.role);
    const items = [];
    const spanBox = (path, pad) => {
      const s = spans.get(path);
      if (!s) return null;
      pad = pad === undefined ? 4 : pad;
      return { x: xs[s[0]] - pad, y: y - pad, w: xs[s[1] - 1] + ws[s[1] - 1] - xs[s[0]] + 2 * pad, h: h + 2 * pad };
    };
    Object.entries(box).forEach(([path, cls], i) => {
      const b = spanBox(path, 5);
      if (b) items.push(Object.assign({ key: Pre + ':box:' + path, kind: 'region', rx: 10, text: '', cls: 'xbox ' + (cls || ''), audit: 'overlap-ok' }, b));
    });
    tokens.forEach((t, i) => {
      let cls = 'xtok k-' + t.kind;
      for (const [path, c] of Object.entries(lit)) if (inside(path, t.path)) cls += ' ' + (c || 'lit');
      if (dim.some((d) => inside(d, t.path))) cls += ' dim';
      const it = { key: key(t, i), kind: 'cell', x: xs[i], y, w: ws[i], h, text: t.t, rx: 6, size, cls };
      if (opts.enter) for (const [path, src] of Object.entries(opts.enter)) if (inside(path, t.path)) { it.enter = 'from'; it.src = src; }
      if (opts.pick) it.pick = true;
      items.push(it);
    });
    return { items, w: W, h, x: xs[0] === undefined ? x : xs[0], y, tokens, spans, span: (path, pad) => spanBox(path, pad), keys: tokens.map((t, i) => key(t, i)) };
  };

  /** the expression tree as K.tree nodes: operators by name, variables and literals as leaves */
  X.treeNodes = function (expr, opts) {
    opts = opts || {};
    const e = P(expr), env = opts.env, show = opts.show ? new Set(opts.show) : null;
    const LBL = { and: 'AND', or: 'OR', xor: 'XOR', not: 'NOT' };
    const f = env ? (x) => B().evaluate(x, env) : null;
    const walk = (x, p) => {
      const id = pstr(p);
      const kids = (x.op === 'not' ? [x.a] : x.args || []).map((k, i) => walk(k, p.concat(i))).filter(Boolean);
      if (show && !show.has(id)) return null;
      const n = { id, label: x.op === 'var' ? x.name : x.op === 'const' ? String(x.v) : LBL[x.op], children: kids, cls: x.op === 'var' || x.op === 'const' ? 'xleaf' : 'xop' };
      if (f && (!opts.valued || opts.valued.has(id))) { const v = f(x); if (opts.inline) n.label += ' = ' + v; else n.sub = '= ' + v; n.cls += ' xv' + v; }
      if (opts.nodeW) n.w = opts.nodeW;
      return n;
    };
    return walk(e, []);
  };
  /** opts: {prefix, x, y (the root), env (values under each node), show (paths drawn), hot: [paths], gapX, gapY} */
  X.tree = function (expr, opts) {
    opts = opts || {};
    const root = X.treeNodes(expr, opts);
    if (!root) return { items: [], box: { x: opts.x || 0, y: opts.y || 0, w: 0, h: 0 } };
    const r = K.tree.draw(root, { prefix: opts.prefix || 'xt', x: opts.x || 0, y: opts.y || 0, gapX: opts.gapX || 18, gapY: opts.gapY || 70, hot: opts.hot || [], grow: opts.grow });
    const Pre = opts.prefix || 'xt';
    for (const it of r.items) {
      if (it.sub) it.cls += ' xsub';
      // hidden nodes keep their place (so the tree does not jump as it is built); their edges fade with them
      if (opts.hide && it.kind === 'state' && opts.hide.has(it.key.slice(Pre.length + 3))) it.opacity = 0;
    }
    return { items: r.items, box: Geo.union(r.items.filter((i) => i.kind === 'state').map((i) => ({ x: i.x - i.w / 2, y: i.y - i.h / 2, w: i.w, h: i.h + (i.sub ? 26 : 0) }))), pos: r.pos };
  };

  /** an expression's circuit, laid out once: {circuit, res}; brackets the writer put in are kept unless flat */
  X.circuit = function (expr, opts) {
    opts = opts || {};
    const e = P(expr);
    // a double complement would be folded away by the builder: draw its two inverters
    if (e.op === 'not' && e.a.op === 'not' && e.a.a.op === 'var') {
      const N = S.Netlist, c = new N.Circuit(opts.title || 'expr');
      const a = c.gate('NOT'), b = c.gate('NOT');
      c.connect(c.input(e.a.a.name).pin('y'), a.pin('i0')); c.connect(a.pin('y'), b.pin('i0')); c.connect(b.pin('y'), c.output(opts.name || 'F').pin('a'));
      return { circuit: c, res: X.layout(c) };
    }
    const c = S.Netlist.fromExpressions(opts.title || 'expr', { [opts.name || 'F']: opts.flat ? B().flatten(e) : e }, opts.style || 'multi', opts.inputs ? { inputs: opts.inputs } : {});
    return { circuit: c, res: X.layout(c, opts) };
  };
  /** a layout that reads left to right: a tree drawn top-down is laid out again in columns (unless opts.down) */
  X.layout = function (c, opts) {
    let res = S.Layout.layout(c);
    if (res.style === 'tree' && !(opts && opts.down)) res = S.Layout.layout(c, { general: true });
    return res;
  };
  /** the stage item of a laid-out circuit, its wires coloured for env when given; opts {x, y, env, hot, style} */
  X.schem = function (key, made, opts) {
    opts = opts || {};
    const it = { key, kind: 'schem', x: opts.x || 0, y: opts.y || 0, res: made.res };
    if (opts.env) it.values = K.schem.values(made.circuit, opts.env);
    // only some wires lit (a bubble changes a value along its wire, so the wire before it would mislead)
    if (opts.env && opts.only) {
      const keep = {};
      for (const p of made.circuit.parts) if ((p.type === 'OUT' && opts.only.includes(p.params.name)) || (p.type === 'IN' && opts.only.includes(p.params.name))) { const net = p.net.a || p.net.y; if (net) keep[net.id] = it.values[net.id]; }
      it.values = keep;
    }
    if (opts.hot) it.hot = opts.hot;
    if (opts.style) it.style = opts.style;
    if (opts.dim) it.dim = true;
    if (opts.enter) it.enter = opts.enter;
    return it;
  };
  /** where the (first) output port's pin is, from the drawing's top-left */
  X.outPin = (made, name) => { const b = made.res.bounds, p = made.res.parts.find((q) => q.type === 'OUT' && (!name || q.part.params.name === name)); const q = p.pins[0]; return { x: q.x - b.x, y: q.y - b.y, right: p.x + p.w - b.x }; };
  X.size = (made) => ({ w: made.res.bounds.w, h: made.res.bounds.h });

  /**
   * one gate on its own: type 'AND', 'OR', 'NAND', ... with n inputs named names (A, B, ...), output F.
   * pin(name) is the pin's place measured from the drawing's top-left; 'F' is the output port's pin.
   */
  X.gate = function (type, n, opts) {
    opts = opts || {};
    const N = S.Netlist, c = new N.Circuit(opts.title || type);
    const names = opts.names || 'ABCDEFGH'.slice(0, n).split('');
    const g = type === 'NOT' || type === 'BUF' ? c.gate(type) : c.gate(type, n);
    names.slice(0, type === 'NOT' || type === 'BUF' ? 1 : n).forEach((v, i) => c.connect(c.input(v).pin('y'), g.pin('i' + i)));
    c.connect(g.pin('y'), c.output(opts.out || 'F').pin('a'));
    const res = S.Layout.layout(c);
    const b = res.bounds;
    const gp = res.parts.find((p) => p.type === type);
    const pin = (nm) => { const q = gp.pins.find((x) => x.name === nm); return q ? { x: q.x - b.x, y: q.y - b.y } : null; };
    return { circuit: c, res, part: gp, pin, w: b.w, h: b.h, names, body: { x: gp.x - b.x, y: gp.y - b.y, w: gp.w, h: gp.h } };
  };

  /** each gate's level (1 next to the inputs) in a combinational circuit: Map part id -> level */
  X.levels = function (c) {
    const lv = new Map(), drv = new Map();
    for (const n of c.nets) for (const r of n.pins) { const d = r.part.pins.find((q) => q.name === r.pin); if (d && d.dir === 'out') drv.set(n, r.part); }
    const L = (p) => {
      if (lv.has(p.id)) return lv.get(p.id);
      if (!S.Netlist.GATES.has(p.type)) return 0;
      lv.set(p.id, 0);
      const ins = p.pins.filter((q) => q.dir === 'in').map((q) => p.net[q.name]).filter(Boolean).map((n) => drv.get(n)).filter(Boolean);
      const v = 1 + Math.max(0, ...ins.map(L));
      lv.set(p.id, v);
      return v;
    };
    for (const p of c.parts) L(p);
    return lv;
  };
  /** a gate's output value for an assignment (from K.schem.values) */
  X.gateOut = (c, part, env) => { const v = K.schem.values(c, env); const n = part.net.y; return n ? v[n.id] : 'x'; };

  /** a hollow inversion bubble at a point */
  X.bubble = (key, x, y, opts) => Object.assign({ key, kind: 'token', x, y, r: 5.5, text: '', cls: 'xbubble', audit: 'overlap-ok' }, opts || {});

  /**
   * a truth table: opts {vars, cols: [{name, f: expression | (env) => 0|1}], x, y, prefix, hot (row), done (rows),
   * dim (rows), rowH, cls(r, c)}; returns S.Kit.truth.draw's result
   */
  X.table = function (opts) {
    const outputs = {};
    for (const c of opts.cols) {
      if (typeof c.f === 'function') outputs[c.name] = c.f;
      else { const f = B().compile(P(c.f), opts.vars); outputs[c.name] = (env) => f(opts.vars.reduce((m, v, i) => m | ((env[v] ? 1 : 0) << (opts.vars.length - 1 - i)), 0)); }
    }
    const t = K.truth.draw({ vars: opts.vars, outputs, x: opts.x, y: opts.y, prefix: opts.prefix || 'xtt', hot: opts.hot, done: opts.done, dim: opts.dim, rowH: opts.rowH || 30, size: opts.size || 15 });
    if (opts.cls) for (const it of t.items) { const m = /:(\d+),(\d+)$/.exec(it.key); if (m && it.kind === 'cell' && !/:ch:/.test(it.key)) { const extra = opts.cls(+m[1], +m[2]); if (extra) it.cls += ' ' + extra; } }
    return t;
  };

  /** the expression with each variable replaced by its value (literals by the literal's value): "1 + 1·0" */
  X.subst = function (expr, env) {
    return X.tokens(expr, { dots: true }).tokens.map((t) => {
      if (t.kind === 'var') return String(env[t.t]);
      if (t.kind === 'lit') { const v = t.t.slice(0, -1); return /^[01]$/.test(v) ? String(1 - +v) : String(1 - env[v]); }
      return t.kind === 'op' && t.t !== '′' ? ' ' + t.t + ' ' : t.t;
    }).join('').replace(/\s+/g, ' ').replace(/ ·/g, '·').replace(/· /g, '·');
  };
  /** check an expression input: an error sentence or null */
  X.check = (label, maxVars) => (v) => {
    const r = B().tryParse(String(v));
    if (!r.ok) return label + ': ' + r.error.msg;
    const n = B().vars(r.expr).length;
    if (maxVars && n > maxVars) return label + ': at most ' + maxVars + ' variables, so the picture stays readable';
    return null;
  };
  /** read "left = right" */
  X.identity = function (text) {
    const parts = String(text).split('=');
    if (parts.length !== 2) throw new Error('write the identity as left = right');
    return { lhs: B().parse(parts[0]), rhs: B().parse(parts[1]) };
  };
  X.checkIdentity = (label, maxVars) => (v) => {
    const parts = String(v).split('=');
    if (parts.length !== 2) return label + ': write it as left = right, with one =';
    for (const [i, s] of parts.entries()) { const r = B().tryParse(s); if (!r.ok) return label + ' (' + (i ? 'right' : 'left') + ' side): ' + r.error.msg; }
    const vs = new Set(parts.flatMap((s) => B().vars(B().parse(s))));
    if (maxVars && vs.size > maxVars) return label + ': at most ' + maxVars + ' variables';
    return null;
  };

  /** a phone's view of a frame: the box around the items whose keys start with one of the prefixes */
  X.focus = (items, prefixes, margin) => S.stageBounds(items.filter((it) => prefixes.some((p) => it.key.startsWith(p))), { margin: margin === undefined ? 16 : margin, minW: 200, minH: 160 });

  /** an environment {A: 0|1} for row m over vars, first variable the high bit */
  X.env = (m, vars) => Object.fromEntries(vars.map((v, i) => [v, (m >> (vars.length - 1 - i)) & 1]));
  /** text for an expression in the chips' notation */
  X.text = (e) => B().toString(P(e)).replace(/'/g, '′');
})(globalThis.Sirkit = globalThis.Sirkit || {});
