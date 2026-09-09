// Transistor networks on the stage (Sirkit.Cmos): each stage of a cell drawn as its pull-up network over its
// pull-down network, every series group a column and every parallel group side by side between two rails, the
// shape read back from the network itself (a series-parallel reduction), so a cell made from any expression, a
// broken one or a transmission gate all draw the same way. A switch that conducts is filled; the ones on the path
// that sets an output are lit; every wire is coloured by its node's value (1, 0, floating Z or a conflict X).
//
//   const L = S.Kit.cmos.layout(net)            stages placed side by side, output stubs on one line
//   const st = S.Kit.cmos.state(net, inputs, prev)   the evaluation plus the lit paths
//   S.Kit.cmos.draw(L, st, { x, y, prefix, hot: [ids], mark: {id: cls} }) -> { items, box }
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const KC = (K.cmos = {});
  const Geo = () => S.geom;
  const CW = 100, AX = 62, TH = 66, RG = 16, BAR = 16, LBL = 30, MID = 46, GAP = 74, STUB = 26;
  const SRC = (n) => n === 'VDD' || n === 'GND';

  /** a node's name as the reader sees it: A_n is A′, ENn is EN′ */
  KC.nodeName = (n) => (/_n$/.test(n) ? n.slice(0, -2) + '′' : /^(EN|C|S)n$/.test(n) ? n.slice(0, -1) + '′' : n);

  // ---- series-parallel shape ----------------------------------------------------------------------------------
  /** reduce the switches ids (between nodes from and to) to a tree: leaf | ser | par, oriented from → to */
  function spTree(net, ids, from, to) {
    const T = new Map(net.transistors.map((t) => [t.id, t]));
    let edges = ids.map((id) => ({ a: T.get(id).a, b: T.get(id).b, k: 'leaf', id }));
    const same = (e, f) => (e.a === f.a && e.b === f.b) || (e.a === f.b && e.b === f.a);
    for (let guard = 0; edges.length > 1 && guard < 200; guard++) {
      let done = false;
      for (let i = 0; i < edges.length && !done; i++) for (let j = i + 1; j < edges.length && !done; j++) {
        if (!same(edges[i], edges[j])) continue;
        const e = { a: edges[i].a, b: edges[i].b, k: 'par', kids: [edges[i], edges[j]] };
        edges = edges.filter((_, k) => k !== i && k !== j).concat([e]);
        done = true;
      }
      if (done) continue;
      const deg = new Map();
      for (const e of edges) for (const v of [e.a, e.b]) deg.set(v, (deg.get(v) || 0) + 1);
      for (const [v, d] of deg) {
        if (d !== 2 || v === from || v === to) continue;
        const two = edges.filter((e) => e.a === v || e.b === v);
        const u = two[0].a === v ? two[0].b : two[0].a, w = two[1].a === v ? two[1].b : two[1].a;
        const e = { a: u, b: w, k: 'ser', kids: two, mid: v };
        edges = edges.filter((x) => !two.includes(x)).concat([e]);
        done = true;
        break;
      }
      if (!done) break;
    }
    if (edges.length !== 1) throw new Error('the network between ' + from + ' and ' + to + ' is not series-parallel');
    // orient from → to, flattening runs of the same kind
    const orient = (e, top) => {
      const bot = e.a === top ? e.b : e.a;
      if (e.k === 'leaf') return { k: 'leaf', id: e.id, top, bot };
      if (e.k === 'par') { const kids = e.kids.map((x) => orient(x, top)).flatMap((x) => (x.k === 'par' ? x.kids : [x])); return { k: 'par', kids, top, bot }; }
      const first = e.kids[0].a === top || e.kids[0].b === top ? e.kids[0] : e.kids[1], second = first === e.kids[0] ? e.kids[1] : e.kids[0];
      const kids = [orient(first, top), orient(second, e.mid)].flatMap((x) => (x.k === 'ser' ? x.kids : [x]));
      return { k: 'ser', kids, top, bot };
    };
    return orient(edges[0], from);
  }
  KC.spTree = spTree;
  const size = (t) => {
    if (t.k === 'leaf') return { w: CW, h: TH };
    const s = t.kids.map(size);
    return t.k === 'ser' ? { w: Math.max(...s.map((q) => q.w)), h: s.reduce((a, q) => a + q.h, 0) } : { w: s.reduce((a, q) => a + q.w, 0), h: Math.max(...s.map((q) => q.h)) + 2 * RG };
  };
  /** place a tree with its box's top-left at (x, y): leaves [{id, ax, cy}] and wire segments [{node, x1, y1, x2, y2}] */
  function place(t, x, y, out) {
    const ax = x + AX;
    if (t.k === 'leaf') {
      const cy = y + TH / 2;
      out.leaves.push({ id: t.id, ax, cy });
      out.segs.push({ node: t.top, x1: ax, y1: y, x2: ax, y2: cy - BAR }, { node: t.bot, x1: ax, y1: cy + BAR, x2: ax, y2: y + TH });
      return;
    }
    if (t.k === 'ser') { let yy = y; for (const k of t.kids) { place(k, x, yy, out); yy += size(k).h; } return; }
    const H = size(t).h;
    let xx = x;
    const ports = [];
    for (const k of t.kids) {
      const s = size(k), px = xx + AX;
      place(k, xx, y + RG, out);
      out.segs.push({ node: t.top, x1: px, y1: y, x2: px, y2: y + RG }, { node: t.bot, x1: px, y1: y + RG + s.h, x2: px, y2: y + H });
      ports.push(px);
      xx += s.w;
    }
    out.segs.push({ node: t.top, x1: ports[0], y1: y, x2: ports[ports.length - 1], y2: y }, { node: t.bot, x1: ports[0], y1: y + H, x2: ports[ports.length - 1], y2: y + H });
  }

  // ---- stages -------------------------------------------------------------------------------------------------
  /** the switches whose channels reach node X without passing a source or another stage's output */
  function reach(net, X, stops) {
    const found = new Set(), seen = new Set([X]), q = [X];
    while (q.length) {
      const v = q.shift();
      for (const t of net.transistors) {
        if (t.a !== v && t.b !== v) continue;
        found.add(t.id);
        const w = t.a === v ? t.b : t.a;
        if (seen.has(w) || SRC(w) || net.inputs.includes(w) || stops.has(w)) continue;
        seen.add(w); q.push(w);
      }
    }
    return found;
  }
  /** the switches of a set reachable from a source node without passing X */
  function side(net, ids, src, X) {
    const out = new Set(), seen = new Set([src]), q = [src];
    while (q.length) {
      const v = q.shift();
      for (const t of net.transistors) {
        if (!ids.has(t.id) || out.has(t.id) || (t.a !== v && t.b !== v)) continue;
        out.add(t.id);
        const w = t.a === v ? t.b : t.a;
        if (w === X || seen.has(w) || SRC(w) || net.inputs.includes(w)) continue;
        seen.add(w); q.push(w);
      }
    }
    return out;
  }
  /**
   * Lay out a whole network: one stage per node that is an output or drives a gate. Returns
   * { stages: [{ out, kind, up, down, pass, x, w, top, ymid, ... }], leaves, segs, labels, w, h, ymid }.
   */
  KC.layout = function (net, opts) {
    opts = opts || {};
    const gates = new Set(net.transistors.map((t) => t.g).filter((g) => !SRC(g) && !net.inputs.includes(g)));
    const outs = [...new Set(net.outputs.concat([...gates]))].filter((n) => net.transistors.some((t) => t.a === n || t.b === n));
    const stops = new Set(outs);
    let stages = outs.map((X) => {
      const ids = reach(net, X, new Set([...stops].filter((s) => s !== X)));
      const up = side(net, ids, 'VDD', X), down = side(net, ids, 'GND', X);
      const rest = [...ids].filter((id) => !up.has(id) && !down.has(id));
      const passBy = new Map();
      for (const id of rest) {
        const t = net.transistors.find((q) => q.id === id);
        const term = [t.a, t.b].find((v) => net.inputs.includes(v)) || [t.a, t.b].find((v) => v !== X);
        if (!passBy.has(term)) passBy.set(term, []);
        passBy.get(term).push(id);
      }
      const st = { out: X, ids, deps: new Set([...ids].map((id) => net.transistors.find((q) => q.id === id).g)) };
      st.up = up.size ? spTree(net, [...up], 'VDD', X) : null;
      st.down = down.size ? spTree(net, [...down], X, 'GND') : null;
      st.pass = [...passBy].map(([term, list]) => ({ term, tree: spTree(net, list, term, X) }));
      return st;
    });
    // inverters of inputs first, then each stage after the ones that drive its gates
    const order = [];
    const left = stages.slice();
    while (left.length) {
      const ready = left.filter((s) => ![...s.deps].some((g) => left.some((o) => o !== s && o.out === g)));
      const pick = (ready.length ? ready : left).sort((a, b) => a.ids.size - b.ids.size || a.out.localeCompare(b.out))[0];
      order.push(pick); left.splice(left.indexOf(pick), 1);
    }
    stages = order;
    // sizes: stubs on one line
    for (const s of stages) {
      const su = s.up ? size(s.up) : { w: 0, h: 0 }, sd = s.down ? size(s.down) : { w: 0, h: 0 };
      const sp = s.pass.map((p) => size(p.tree));
      s.hu = s.pass.length ? Math.max(...sp.map((q) => q.h)) + RG : su.h;
      s.hd = sd.h;
      s.w = s.pass.length ? sp.reduce((a, q) => a + q.w, 0) : Math.max(su.w, sd.w, CW);
      s.above = LBL + s.hu + (s.pass.length ? 0 : MID / 2);
    }
    const yMid = Math.max(...stages.map((s) => s.above));
    const L = { stages, leaves: [], segs: [], labels: [], net, ymid: yMid };
    let x = 0;
    const outName = opts.names || {};
    for (const s of stages) {
      s.x = x;
      const ax = x + AX, top = yMid - s.above;
      const name = outName[s.out] || KC.nodeName(s.out);
      if (s.pass.length) {
        // transmission gates: each from its input terminal down to a common output rail
        let xx = x;
        const ports = [];
        for (const p of s.pass) {
          const sz = size(p.tree), px = xx + AX;
          L.labels.push({ key: 'term:' + p.term, x: px, y: top + LBL - 12, text: KC.nodeName(p.term), cls: 'cm-term' });
          place(p.tree, xx, top + LBL, L);
          L.segs.push({ node: s.out, x1: px, y1: top + LBL + sz.h, x2: px, y2: yMid });
          ports.push(px);
          xx += sz.w;
        }
        L.segs.push({ node: s.out, x1: ports[0], y1: yMid, x2: x + s.w + STUB, y2: yMid });
      } else {
        if (s.up) {
          place(s.up, x, top + LBL, L);
          L.segs.push({ node: 'VDD', x1: ax - 18, y1: top + LBL, x2: ax + 18, y2: top + LBL });
          L.labels.push({ key: 'vdd:' + s.out, x: ax, y: top + LBL - 10, text: 'VDD', cls: 'cm-rail' });
        }
        const y1 = top + LBL + s.hu, y2 = y1 + MID;
        L.segs.push({ node: s.out, x1: ax, y1, x2: ax, y2 }, { node: s.out, x1: ax, y1: yMid, x2: x + s.w + STUB, y2: yMid });
        if (s.down) {
          place(s.down, x, y2, L);
          L.segs.push({ node: 'GND', x1: ax - 18, y1: y2 + s.hd, x2: ax + 18, y2: y2 + s.hd });
          L.labels.push({ key: 'gnd:' + s.out, x: ax, y: y2 + s.hd + 20, text: 'GND', cls: 'cm-rail' });
        }
      }
      L.labels.push({ key: 'out:' + s.out, x: x + s.w + STUB + 7, y: yMid + 5, text: name, cls: 'cm-out', anchor: 'start', node: s.out });
      s.stubEnd = x + s.w + STUB;
      x += s.w + GAP + Math.max(0, Geo().textWidth(name, 15, { bold: true }) - 20);
    }
    L.w = x - GAP;
    L.h = Math.max(...stages.map((s) => yMid - s.above + LBL + s.hu + (s.pass.length ? 0 : MID + s.hd + 28)));
    L.segs = mergeSegs(L.segs);
    L.dots = dotsOf(L.segs);
    return L;
  };

  /** join collinear touching segments of one node */
  function mergeSegs(segs) {
    const out = [], groups = new Map();
    for (const s of segs) {
      if (s.x1 === s.x2 && s.y1 === s.y2) continue;
      const h = s.y1 === s.y2;
      const k = s.node + '|' + (h ? 'h' + s.y1 : 'v' + s.x1);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(h ? [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)] : [Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)]);
    }
    for (const [k, list] of groups) {
      const [node, line] = [k.slice(0, k.lastIndexOf('|')), k.slice(k.lastIndexOf('|') + 1)];
      const h = line[0] === 'h', c = +line.slice(1);
      list.sort((a, b) => a[0] - b[0]);
      let cur = null;
      for (const iv of list) {
        if (cur && iv[0] <= cur[1] + 0.01) cur[1] = Math.max(cur[1], iv[1]);
        else { if (cur) out.push(mk(node, h, c, cur)); cur = iv.slice(); }
      }
      if (cur) out.push(mk(node, h, c, cur));
    }
    return out;
  }
  const mk = (node, h, c, iv) => (h ? { node, x1: iv[0], y1: c, x2: iv[1], y2: c } : { node, x1: c, y1: iv[0], x2: c, y2: iv[1] });
  /** junction dots: where three or more wires of a node meet */
  function dotsOf(segs) {
    const pts = new Map();
    const on = (s, p) => (s.y1 === s.y2 ? p.y === s.y1 && p.x > s.x1 && p.x < s.x2 : p.x === s.x1 && p.y > s.y1 && p.y < s.y2);
    for (const s of segs) for (const p of [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]) {
      const k = s.node + '|' + p.x + ',' + p.y;
      if (pts.has(k)) continue;
      let n = 0;
      for (const t of segs) {
        if (t.node !== s.node) continue;
        if ((t.x1 === p.x && t.y1 === p.y) || (t.x2 === p.x && t.y2 === p.y)) n++;
        else if (on(t, p)) n += 2;
      }
      pts.set(k, { node: s.node, x: p.x, y: p.y, n });
    }
    return [...pts.values()].filter((p) => p.n >= 3 && !SRC(p.node));
  }

  // ---- values ---------------------------------------------------------------------------------------------------
  /**
   * The evaluation of a network for inputs (prev: node values from before), with the lit switches: those on a
   * conducting path from each stage's output to VDD, GND or an input terminal.
   */
  KC.state = function (net, inputs, prev, L) {
    const ev = S.Cmos.evaluate(net, inputs, prev);
    const lit = new Set();
    const outs = L ? L.stages.map((s) => s.out) : net.outputs;
    // the nodes reachable from a node over conducting switches, not passing through the stop nodes
    const reach = (from, stop) => {
      const seen = new Set([from]), q = [from];
      while (q.length) {
        const x = q.shift();
        for (const t of net.transistors) {
          if (ev.conducts[t.id] !== true) continue;
          const y = t.a === x ? t.b : t.b === x ? t.a : null;
          if (y == null || seen.has(y)) continue;
          seen.add(y);
          if (!stop(y)) q.push(y);
        }
      }
      return seen;
    };
    const isSrc = (y) => SRC(y) || net.inputs.includes(y);
    // a switch is lit when it lies on a conducting path from a stage's output to VDD, GND or an input
    const litBy = {};
    for (const o of outs) {
      litBy[o] = new Set();
      const fromOut = reach(o, isSrc);
      for (const tg of [...fromOut].filter(isSrc)) {
        const fromT = reach(tg, (y) => y === o || isSrc(y));
        for (const t of net.transistors) {
          if (ev.conducts[t.id] !== true) continue;
          const inO = (v) => v === o || (fromOut.has(v) && !isSrc(v)), inT = (v) => v === tg || (fromT.has(v) && v !== o && !isSrc(v));
          if ((inO(t.a) && inT(t.b)) || (inO(t.b) && inT(t.a))) { lit.add(t.id); litBy[o].add(t.id); }
        }
      }
    }
    return { ev, lit, litBy, nodes: ev.nodes, conducts: ev.conducts };
  };
  /** the class of a node's value: v1, v0, vz (cut off), vx (conflict or unknown) */
  KC.valCls = (nv) => (!nv ? '' : nv.s === 'conflict' || nv.v === 'X' ? 'vx' : nv.v === 'Z' ? 'vz' : nv.s === 'charged' ? 'vc v' + nv.v : 'v' + nv.v);
  /** a node's value as the narration says it */
  KC.say = (nv) => (!nv ? '?' : nv.s === 'conflict' ? 'X (conflict)' : nv.v === 'Z' ? 'Z (floating)' : nv.s === 'charged' ? nv.v + ' (held by charge)' : String(nv.v));

  // ---- drawing --------------------------------------------------------------------------------------------------
  /** items for a laid-out network in a state. o: {x, y, prefix, hot: [ids], mark: {id: cls}, plain (no values)} */
  KC.draw = function (L, st, o) {
    o = o || {};
    const P = o.prefix || 'cm', X = o.x || 0, Y = o.y || 0, items = [];
    const T = new Map(L.net.transistors.map((t) => [t.id, t]));
    const hot = new Set(o.hot || []);
    const nodeCls = (n) => (o.plain || !st ? '' : KC.valCls(st.nodes[n]));
    L.segs.forEach((s, i) => items.push({ key: P + ':w:' + s.node + ':' + i, kind: 'line', x1: X + s.x1, y1: Y + s.y1, x2: X + s.x2, y2: Y + s.y2, cls: 'cw ' + nodeCls(s.node) }));
    for (const d of L.dots) items.push({ key: P + ':d:' + d.node + ':' + d.x + ',' + d.y, kind: 'state', x: X + d.x, y: Y + d.y, r: 3.2, text: '', cls: 'cdot ' + nodeCls(d.node), audit: 'overlap-ok' });
    for (const lf of L.leaves) {
      const t = T.get(lf.id), ax = X + lf.ax, cy = Y + lf.cy;
      const c = st ? st.conducts[t.id] : null;
      const state = o.plain || !st ? '' : c === true ? 'on' : c === false ? 'off' : 'unk';
      const lit = st && st.lit.has(t.id) && !o.plain;
      const cls = ['tr-bar', t.type === 'p' ? 'pmos' : 'nmos', state, lit ? 'path' : '', hot.has(t.id) ? 'hot' : '', (o.mark && o.mark[t.id]) || ''].filter(Boolean).join(' ');
      items.push({ key: P + ':t:' + t.id, kind: 'cell', x: ax - 3.5, y: cy - BAR, w: 7, h: 2 * BAR, rx: 2, text: '', cls, pick: true, title: t.id + ' (' + (t.type === 'p' ? 'pMOS' : 'nMOS') + ', gate ' + KC.nodeName(t.g) + ')' });
      const gcls = 'cg ' + (o.plain || !st ? '' : KC.valCls(st.nodes[t.g]));
      items.push({ key: P + ':pl:' + t.id, kind: 'line', x1: ax - 10, y1: cy - BAR + 3, x2: ax - 10, y2: cy + BAR - 3, cls: gcls });
      if (t.type === 'p') {
        items.push({ key: P + ':b:' + t.id, kind: 'state', x: ax - 15, y: cy, r: 4.2, text: '', cls: 'cbub ' + gcls, audit: 'overlap-ok' });
        items.push({ key: P + ':gl:' + t.id, kind: 'line', x1: ax - 19.5, y1: cy, x2: ax - 27, y2: cy, cls: gcls });
      } else items.push({ key: P + ':gl:' + t.id, kind: 'line', x1: ax - 10, y1: cy, x2: ax - 27, y2: cy, cls: gcls });
      items.push({ key: P + ':gn:' + t.id, kind: 'text', x: ax - 30, y: cy + 5, text: KC.nodeName(t.g), anchor: 'end', cls: 'cm-gate ' + gcls, size: 14 });
      items.push({ key: P + ':id:' + t.id, kind: 'text', x: ax + 8, y: cy + 4, text: t.id, anchor: 'start', cls: 'cm-id' + (lit ? ' path' : ''), size: 14 });
    }
    for (const lb of L.labels) {
      const cls = lb.cls + (lb.node && st && !o.plain ? ' ' + KC.valCls(st.nodes[lb.node]) : '');
      items.push({ key: P + ':l:' + lb.key, kind: 'text', x: X + lb.x, y: Y + lb.y, text: lb.text, anchor: lb.anchor || 'middle', cls, size: lb.cls === 'cm-out' ? 16 : 14 });
    }
    return { items, box: { x: X, y: Y, w: L.w + 40, h: L.h } };
  };
  /** the value written beside an output: "Y = 1" */
  KC.outText = (L, st, node) => KC.nodeName(node) + ' = ' + KC.say(st.nodes[node]);
})(globalThis.Sirkit = globalThis.Sirkit || {});
