// Circuits on the stage: a schematic laid out by the layout engine, as one stage item, with its wires coloured
// by value. S.Kit.schem.layout(circuit) lays out once (and keeps it, so frames share it and nothing jumps);
// S.Kit.schem.values(circuit, env) works out every net of a combinational circuit for an input assignment
// (a zero-delay evaluation, enough for a picture); S.Kit.schem.item(key, res, opts) is the stage item.
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const SC = (K.schem = {});

  const cache = new WeakMap();
  /** the layout of a circuit (a Netlist.Circuit), computed once */
  SC.layout = function (c, opts) {
    if (!cache.has(c)) cache.set(c, S.Layout.layout(c, opts));
    return cache.get(c);
  };
  /** an expression ("F = A'B + C" or {F: .., G: ..}) as a circuit, in a gate style ('multi', 'and-or', ...) */
  SC.fromExpr = function (e, style, opts) {
    let outs = e;
    if (typeof e === 'string') { const m = /^\s*([A-Za-z]\w*)\s*=\s*(.*)$/.exec(e); outs = m ? { [m[1]]: m[2] } : { F: e }; }
    return S.Netlist.fromExpressions((opts && opts.title) || 'circuit', outs, style || 'multi', opts);
  };

  const GATE = {
    AND: (xs) => (xs.includes(0) ? 0 : xs.includes('x') ? 'x' : 1), OR: (xs) => (xs.includes(1) ? 1 : xs.includes('x') ? 'x' : 0),
    XOR: (xs) => (xs.includes('x') ? 'x' : xs.reduce((a, b) => a ^ b, 0)), BUF: (xs) => xs[0],
  };
  const inv = (v) => (v === 'x' ? 'x' : 1 - v);
  const evalGate = (t, xs) => {
    if (t === 'NOT') return inv(xs[0]);
    if (t[0] === 'N' && GATE[t.slice(1)]) return inv(GATE[t.slice(1)](xs));
    if (t === 'XNOR') return inv(GATE.XOR(xs));
    return GATE[t] ? GATE[t](xs) : 'x';
  };
  /**
   * Every net's value for inputs env {A: 0|1, ...}: {net id: '0'|'1'|'x', and by name too}. Gates, constants and
   * ports only; anything else (and any loop) reads x.
   */
  SC.values = function (c, env) {
    const val = new Map();
    const netOf = (p, pin) => p.net[pin];
    for (const p of c.parts) {
      if (p.type === 'IN' || p.type === 'CLOCK') { const n = netOf(p, 'y'); if (n) val.set(n, env[p.params.name] === undefined ? 'x' : +env[p.params.name] ? 1 : 0); }
      if (p.type === 'CONST') { const n = netOf(p, 'y'); if (n) val.set(n, +p.params.value ? 1 : 0); }
    }
    const gates = c.parts.filter((p) => S.Netlist.GATES.has(p.type));
    for (let pass = 0, changed = true; changed && pass <= gates.length; pass++) {
      changed = false;
      for (const g of gates) {
        const out = netOf(g, 'y');
        if (!out) continue;
        const ins = g.pins.filter((q) => q.dir === 'in').map((q) => { const n = netOf(g, q.name); return n && val.has(n) ? val.get(n) : 'x'; });
        const v = evalGate(g.type, ins);
        if (val.get(out) !== v) { val.set(out, v); changed = true; }
      }
    }
    const o = {};
    for (const n of c.nets) { const v = val.has(n) ? String(val.get(n)) : 'x'; o[n.id] = v; if (n.name) o[n.name] = v; }
    // outputs by their port's name
    for (const p of c.parts) if (p.type === 'OUT') { const n = netOf(p, 'a'); if (n) o[p.params.name] = o[n.id]; }
    return o;
  };
  /** the stage item: {key, kind: 'schem', x, y, res, values, hot} */
  SC.item = (key, res, opts) => Object.assign({ key, kind: 'schem', x: 0, y: 0, res }, opts || {});
  /** the item's box, for placing other things beside it */
  SC.box = (res, x, y) => ({ x: x || 0, y: y || 0, w: res.bounds.w, h: res.bounds.h });
})(globalThis.Sirkit = globalThis.Sirkit || {});
