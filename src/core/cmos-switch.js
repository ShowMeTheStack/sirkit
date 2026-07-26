// A switch-level simulator: nMOS and pMOS transistors as switches between nodes, with VDD and GND. An nMOS
// switch conducts when its gate is 1, a pMOS switch when its gate is 0. Each node's value is a resolution by
// strength: driven 1 or 0 (joined through conducting switches to VDD, GND or a driven input), conflict (joined
// to both), charged (cut off from every source but holding its last value), or floating (never driven).
// A gate whose value is unknown makes its switch unknown: the node is X when the answer depends on it.
//
// net = Cmos.network('name', { inputs: ['A'], outputs: ['Y'] }); net.n(gate, a, b); net.p(gate, a, b).
(function (S) {
  'use strict';
  const C = S.Cmos = S.Cmos || {};
  const SUPPLY = { VDD: 1, GND: 0 };
  C.SUPPLY = SUPPLY;

  C.network = function (name, o) {
    o = o || {};
    const net = {
      name: name || 'cell', inputs: (o.inputs || []).slice(), outputs: (o.outputs || ['Y']).slice(), transistors: [], nodes: new Set(['VDD', 'GND']),
      add(type, g, a, b, id) {
        const t = { id: id || 'M' + (net.transistors.length + 1), type, g, a, b };
        net.transistors.push(t);
        for (const x of [g, a, b]) net.nodes.add(x);
        return t;
      },
      n(g, a, b, id) { return net.add('n', g, a, b, id); },
      p(g, a, b, id) { return net.add('p', g, a, b, id); },
      fresh(prefix) { let k = 1; while (net.nodes.has((prefix || 'n') + k)) k++; const nm = (prefix || 'n') + k; net.nodes.add(nm); return nm; },
    };
    for (const i of net.inputs) net.nodes.add(i);
    for (const y of net.outputs) net.nodes.add(y);
    return net;
  };

  const isSource = (net, node) => node in SUPPLY || net.inputs.includes(node);
  const show = (v) => (v && v.v != null ? String(v.v) : '?');

  /**
   * Evaluate a network for input values { A: 0|1|'X' }. prev: node values from before (for charge kept on
   * cut-off nodes). Returns { nodes: { name: { v: 0|1|'X'|'Z', s: 'supply'|'driven'|'conflict'|'charged'|
   * 'floating'|'unknown' } }, conducts: { id: true|false|'X' }, on: [ids], paths: { node: { vdd, gnd } },
   * conflict: [nodes], floating: [nodes], trace }.
   */
  C.evaluate = function (net, inputs, prev) {
    prev = prev || {};
    const val = {};
    for (const n of net.nodes) {
      if (n in SUPPLY) val[n] = { v: SUPPLY[n], s: 'supply' };
      else if (net.inputs.includes(n)) { const v = inputs[n]; val[n] = { v: v === 'X' || v == null ? 'X' : v ? 1 : 0, s: 'driven' }; } else val[n] = prev[n] ? Object.assign({}, prev[n]) : { v: 'Z', s: 'floating' };
    }
    const state = (t) => { const g = val[t.g].v; if (g === 'X' || g === 'Z') return 'X'; return t.type === 'n' ? g === 1 : g === 0; };
    let conducts = {};
    for (let iter = 0; iter < 4 * net.transistors.length + 8; iter++) {
      conducts = {};
      for (const t of net.transistors) conducts[t.id] = state(t);
      const resolve = (withUnknown) => {
        // components of non-source nodes joined by conducting switches; each lists the sources it touches
        const parent = new Map();
        const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
        for (const n of net.nodes) if (!isSource(net, n)) parent.set(n, n);
        const touch = new Map();
        const on = (t) => conducts[t.id] === true || (withUnknown && conducts[t.id] === 'X');
        for (const t of net.transistors) {
          if (!on(t)) continue;
          const sa = isSource(net, t.a), sb = isSource(net, t.b);
          if (!sa && !sb) { const x = find(t.a), y = find(t.b); if (x !== y) parent.set(x, y); }
        }
        for (const t of net.transistors) {
          if (!on(t)) continue;
          const sa = isSource(net, t.a), sb = isSource(net, t.b);
          if (sa && !sb) { const r = find(t.b); if (!touch.has(r)) touch.set(r, new Set()); touch.get(r).add(t.a); }
          if (sb && !sa) { const r = find(t.a); if (!touch.has(r)) touch.set(r, new Set()); touch.get(r).add(t.b); }
        }
        const out = {};
        const groups = new Map();
        for (const n of parent.keys()) { const r = find(n); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(n); }
        for (const [r, members] of groups) {
          const srcs = [...(touch.get(r) || [])];
          const vs = new Set(srcs.map((s) => val[s].v));
          let res;
          if (!srcs.length) {
            const charges = new Set(members.map((n) => (prev[n] ? prev[n].v : 'Z')).filter((v) => v !== 'Z'));
            res = charges.size === 1 ? { v: [...charges][0], s: 'charged' } : charges.size > 1 ? { v: 'X', s: 'charged' } : { v: 'Z', s: 'floating' };
          } else if (vs.has('X')) res = { v: 'X', s: 'unknown' };
          else if (vs.size > 1) res = { v: 'X', s: 'conflict' };
          else res = { v: [...vs][0], s: 'driven' };
          for (const n of members) out[n] = res;
        }
        return out;
      };
      const a = resolve(false), b = net.transistors.some((t) => conducts[t.id] === 'X') ? resolve(true) : a;
      let changed = false;
      for (const n of Object.keys(a)) {
        const r = a[n].v === b[n].v && a[n].s === b[n].s ? a[n] : a[n].s === 'conflict' || b[n].s === 'conflict' ? { v: 'X', s: 'conflict' } : { v: a[n].v === b[n].v ? a[n].v : 'X', s: 'unknown' };
        if (val[n].v !== r.v || val[n].s !== r.s) { val[n] = r; changed = true; }
      }
      if (!changed) break;
    }
    // paths from each output to VDD and GND through conducting switches (not through other sources)
    const paths = {};
    const pathTo = (from, target) => {
      const prevE = new Map([[from, null]]), q = [from];
      while (q.length) {
        const x = q.shift();
        for (const t of net.transistors) {
          if (conducts[t.id] !== true) continue;
          const y = t.a === x ? t.b : t.b === x ? t.a : null;
          if (y == null || prevE.has(y)) continue;
          prevE.set(y, { x, t: t.id });
          if (y === target) { const ids = []; for (let e = prevE.get(y); e; e = prevE.get(e.x)) ids.unshift(e.t); return ids; }
          if (!isSource(net, y)) q.push(y);
        }
      }
      return null;
    };
    for (const y of net.outputs) paths[y] = { vdd: pathTo(y, 'VDD'), gnd: pathTo(y, 'GND') };
    const on = net.transistors.filter((t) => conducts[t.id] === true).map((t) => t.id);
    const conflict = Object.keys(val).filter((n) => val[n].s === 'conflict');
    const floating = net.outputs.filter((y) => val[y].s === 'floating' || val[y].s === 'charged');
    // the trace
    const trace = [];
    const inText = net.inputs.map((i) => i + ' = ' + show(val[i])).join(', ');
    trace.push({ kind: 'inputs', say: 'Inputs ' + (inText || 'none') + '.' });
    for (const t of net.transistors) {
      const c = conducts[t.id];
      trace.push({ kind: 'switch', id: t.id, on: c, say: t.id + ' (' + (t.type === 'n' ? 'nMOS' : 'pMOS') + ', gate ' + t.g + ' = ' + show(val[t.g]) + ') ' + (c === true ? 'conducts' : c === false ? 'is off' : 'may or may not conduct') + '.' });
    }
    for (const y of net.outputs) {
      const p = paths[y], v = val[y];
      let say;
      if (v.s === 'conflict') say = y + ' is joined to both VDD (through ' + (p.vdd || []).join(', ') + ') and GND (through ' + (p.gnd || []).join(', ') + '): a conflict, and a short from VDD to GND.';
      else if (p.vdd && v.v === 1) say = y + ' connects to VDD through ' + p.vdd.join(', ') + ' and the pull-down is off: ' + y + ' = 1.';
      else if (p.gnd && v.v === 0) say = y + ' connects to GND through ' + p.gnd.join(', ') + ' and the pull-up is off: ' + y + ' = 0.';
      else if (v.s === 'driven') say = y + ' is driven to ' + v.v + ' through a conducting switch from an input.';
      else if (v.s === 'charged') say = y + ' is cut off from VDD and GND; it keeps its charge, ' + v.v + '.';
      else if (v.s === 'floating') say = y + ' is cut off from VDD and GND and has never been driven: it floats (Z).';
      else say = y + ' is unknown (X): it depends on a switch whose gate is unknown.';
      trace.push({ kind: 'output', node: y, value: v.v, strength: v.s, path: p, say });
    }
    return { nodes: val, conducts, on, paths, conflict, floating, trace };
  };

  /** every input combination: rows { inputs, out: { Y: value }, strength, conflict, floating } */
  C.table = function (net, opts) {
    opts = opts || {};
    const n = net.inputs.length, rows = [];
    let prev = {};
    for (let m = 0; m < 1 << n; m++) {
      const inp = {}; net.inputs.forEach((x, i) => { inp[x] = (m >> (n - 1 - i)) & 1; });
      const r = C.evaluate(net, inp, opts.keep ? prev : {});
      prev = r.nodes;
      const out = {}, strength = {};
      for (const y of net.outputs) { out[y] = r.nodes[y].v; strength[y] = r.nodes[y].s; }
      rows.push({ inputs: inp, out, strength, on: r.on, conflict: r.conflict.length > 0, floating: r.floating.length > 0, paths: r.paths });
    }
    return rows;
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
