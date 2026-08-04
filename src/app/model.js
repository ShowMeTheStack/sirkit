// The editor's document: placed parts and the wires (nets) that join their pins, notes, and reusable blocks.
//   { v: 1, title, parts: [{ id, type, params, x, y, rot, flip, open, g }], wires: [{ id, name, show, pins: [[part, pin]...] }],
//     notes: [{ id, x, y, text }], blocks: { name: { doc, inputs, outputs } }, routes, labels }
// Positions are in grid units (Symbols.U pixels). rot turns a part a quarter at a time clockwise, flip mirrors it.
// g is the symbol a tidy-up gave the part (the layout engine's own shape and pins); routes and labels are the
// wires the layout engine drew, kept until something changes. The document turns into a Netlist.Circuit (blocks
// flattened) for the simulator, and a circuit turns into a tidy document through the layout engine.
(function (S) {
  'use strict';
  const D = S.Doc = {};
  const U = () => S.Symbols.U;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  D.clone = clone;

  D.blank = (title) => ({ v: 1, title: title || 'untitled', parts: [], wires: [], notes: [], blocks: {} });

  /** a fresh id for a part of a type: and1, and2, ... */
  D.newId = function (doc, type, used) {
    const base = String(type).toLowerCase().replace(/[^a-z0-9]/g, '') || 'p';
    const have = used || new Set(doc.parts.map((p) => p.id));
    let i = 1;
    while (have.has(base + i)) i++;
    return base + i;
  };
  D.newWireId = function (doc) { const have = new Set(doc.wires.map((w) => w.id)); let i = 1; while (have.has('w' + i)) i++; return 'w' + i; };

  // ---- parts as the symbols see them ------------------------------------------------------------------------
  const cache = new Map();
  const SHORT = { TRI: 'EN▷', DEMUX: 'DMUX', ENCODER: 'ENC', PRIENC: 'PRI', HA: 'HA', ADD: 'Σ', SPLIT: '', MERGE: '', PULLUP: 'R↑', PULLDOWN: 'R↓', VCC: 'VCC', GND: 'GND' };
  /** a netlist-like part for Symbols: {id, type, params, pins, net, open} (cached by type and parameters) */
  D.partObj = function (dp, doc) {
    const params = Object.assign({}, dp.params);
    if (dp.type === 'BLOCK' && doc && doc.blocks && doc.blocks[params.block]) { const b = doc.blocks[params.block]; params.inputs = b.inputs; params.outputs = b.outputs; if (params.title == null) params.title = params.block; }
    const def = S.Eng.def(dp.type);
    if (['LED', 'HEX', 'SEG7', 'PROBE'].includes(dp.type)) params.title = '';
    else if (params.title == null && def && !S.Netlist.GATES.has(dp.type) && !['IN', 'OUT', 'CLOCK', 'CONST', 'MUX', 'FA', 'DECODER', 'REG', 'COUNTER', 'ALU', 'BLOCK', 'SWITCH', 'BUTTON'].includes(dp.type)) params.title = def.short || def.number || (def.symbol && def.symbol.text) || SHORT[dp.type] || (String(def.label || dp.type).length <= 8 ? def.label : dp.type);
    if ((dp.type === 'SWITCH' || dp.type === 'BUTTON') && !params.name) params.name = dp.type === 'BUTTON' ? 'PB' : 'SW';
    const key = dp.type + '|' + JSON.stringify(params);
    let o = cache.get(key);
    if (!o) {
      let pins;
      try { pins = S.Eng.pinsOf(dp.type, params); } catch (e) { pins = []; }
      // a switch and a button are drawn as the input flag they act as
      // (drawn as a clock's flag, the clock's wave swapped for a lever or a button)
      o = { type: dp.type === 'SWITCH' || dp.type === 'BUTTON' ? 'CLOCK' : dp.type, realType: dp.type, params, pins, net: {}, open: new Set() };
      try { S.Symbols.geom(o); } catch (e) { /* drawn as a plain box */ }
      if (cache.size > 2000) cache.clear();
      cache.set(key, o);
    }
    return Object.assign(Object.create(o), { id: dp.id, net: {}, open: new Set(dp.open || []) });
  };

  const ROT_SIDE = { left: 'top', top: 'right', right: 'bottom', bottom: 'left' };
  const FLIP_SIDE = { left: 'right', right: 'left', top: 'top', bottom: 'bottom' };
  /** a placed part's shape in grid units: {w, h, pins: {name: {x, y, side}}, draw, base} after its turn and mirror */
  D.geom = function (dp, doc) {
    const part = D.partObj(dp, doc);
    let base;
    if (dp.g && !dp.rot && !dp.flip) base = { w: dp.g.w, h: dp.g.h, pins: dp.g.pins, draw: dp.g.draw };
    else {
      const g = S.Symbols.geom(part);
      base = { w: g.w, h: g.h, pins: g.pins, draw: g };
    }
    let w = base.w, h = base.h, pins = {};
    for (const [k, q] of Object.entries(base.pins)) pins[k] = { x: q.x, y: q.y, side: q.side };
    if (dp.flip) for (const q of Object.values(pins)) { q.x = w - q.x; q.side = FLIP_SIDE[q.side]; }
    for (let r = 0; r < ((dp.rot || 0) & 3); r++) {
      for (const q of Object.values(pins)) { const x = q.x; q.x = h - q.y; q.y = x; q.side = ROT_SIDE[q.side]; }
      [w, h] = [h, w];
    }
    return { w, h, pins, base, part };
  };
  /** where a pin is, in grid units */
  D.pinAt = function (doc, dp, pinName) {
    const g = D.geom(dp, doc), q = g.pins[pinName];
    return q ? { x: dp.x + q.x, y: dp.y + q.y, side: q.side } : null;
  };
  D.part = (doc, id) => doc.parts.find((p) => p.id === id);
  /** the wire a pin is on */
  D.wireAt = (doc, partId, pin) => doc.wires.find((w) => w.pins.some(([a, b]) => a === partId && b === pin));
  /** the direction and width of a part's pin */
  D.pinDef = function (doc, dp, pinName) { const q = D.partObj(dp, doc).pins.find((x) => x.name === pinName); return q || null; };

  // ---- the netlist ------------------------------------------------------------------------------------------
  /** add a part to a Netlist.Circuit even when the netlist does not know its type (its pins come from the registry) */
  function addPart(c, type, params, id) {
    try { return c.add(type, params, id); } catch (e) {
      if (/duplicate/.test(e.message)) throw e;
      const part = { id, type, params, pins: S.Eng.pinsOf(type, params), net: {}, open: new Set() };
      part.pin = (name) => ({ part, pin: name });
      c.parts.push(part); c.byId.set(id, part);
      return part;
    }
  }
  D.addPart = addPart;

  /**
   * The document as a Netlist.Circuit for the simulator: blocks flattened (their parts get ids like blk1/and2),
   * every net named (its label, else the port it comes from or goes to, else its wire id), names unique.
   * Returns the circuit with c.wireOf: net name → the top-level wire id, and c.netOfWire: wire id → net name.
   */
  D.toCircuit = function (doc) {
    const c = new S.Netlist.Circuit(doc.title || 'circuit');
    const parent = new Map();
    const find = (k) => { while (parent.has(k) && parent.get(k) !== k) k = parent.get(k); return k; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
    const attach = []; // [partInCircuit, pin, key]
    const names = new Map(); // key → preferred name
    function emit(d, prefix, ports, depth) {
      if (depth > 12) throw new Error('blocks nested too deeply (does a block contain itself?)');
      const wireKey = new Map();
      for (const w of d.wires) { const k = prefix + '#' + w.id; parent.set(k, k); for (const [pid, pn] of w.pins) wireKey.set(pid + '.' + pn, k); if (w.name && !prefix) names.set(k, w.name); }
      const keyOf = (pid, pn) => wireKey.get(pid + '.' + pn) || null;
      for (const dp of d.parts) {
        if (prefix && (dp.type === 'IN' || dp.type === 'OUT') && ports && ports.has(dp.params.name)) {
          // a block's own port: its wire joins the wire outside
          const inner = keyOf(dp.id, dp.type === 'IN' ? 'y' : 'a'), outer = ports.get(dp.params.name);
          if (inner && outer) union(inner, outer);
          continue;
        }
        if (dp.type === 'BLOCK') {
          const b = d.blocks && d.blocks[dp.params.block] || doc.blocks[dp.params.block];
          if (!b) continue;
          const pm = new Map();
          for (const n of b.inputs.concat(b.outputs)) { const nm = typeof n === 'string' ? n : n.name; const k = keyOf(dp.id, nm); if (k) pm.set(nm, k); }
          const inner = Object.assign({}, b.doc, { blocks: Object.assign({}, doc.blocks, b.doc.blocks || {}) });
          emit(inner, prefix + dp.id + '/', pm, depth + 1);
          continue;
        }
        const params = clone(dp.params || {});
        delete params.label;
        const part = addPart(c, dp.type, params, prefix + dp.id);
        for (const q of part.pins) { const k = keyOf(dp.id, q.name); if (k) attach.push([part, q.name, k]); }
        for (const o of dp.open || []) part.open.add(o);
        if (!prefix) for (const q of part.pins) {
          const k = keyOf(dp.id, q.name);
          if (!k) continue;
          if ((S.Eng.isInput(dp.type) || dp.type === 'CLOCK') && !names.has(k)) names.set(k, dp.params.name);
          if (dp.type === 'OUT' && !names.has(find(k)) && !names.has(k)) names.set(k, dp.params.name);
        }
      }
    }
    emit(doc, '', null, 0);
    const nets = new Map();
    const used = new Set();
    c.wireOf = new Map(); c.netOfWire = new Map();
    for (const [part, pn, k] of attach) {
      const r = find(k);
      let net = nets.get(r);
      if (!net) {
        net = { id: 'n' + (nets.size + 1), name: null, width: 1, pins: [], show: false };
        nets.set(r, net); c.nets.push(net);
      }
      const q = part.pins.find((x) => x.name === pn);
      net.pins.push({ part, pin: pn });
      net.width = Math.max(net.width, q.width || 1);
      part.net[pn] = net;
    }
    // names: a label first, then a port's name, then the wire's id
    const nameOf = new Map();
    for (const [k, nm] of names) { const r = find(k); if (!nameOf.has(r) || (doc.wires.some((w) => '#' + w.id === k && w.name))) nameOf.set(r, nm); }
    for (const [r, net] of nets) {
      // a wire with no name is called after what drives it: and1.y (inside a block: blk1/and1.y)
      const drv = net.pins.find((q) => (q.part.pins.find((x) => x.name === q.pin) || {}).dir === 'out');
      let nm = nameOf.get(r) || (drv ? drv.part.id + '.' + drv.pin : r.replace(/^.*#/, ''));
      let k = nm, i = 2;
      while (used.has(k)) k = nm + '_' + i++;
      used.add(k); net.name = k;
      if (!r.includes('/')) { const wid = r.slice(r.indexOf('#') + 1); c.wireOf.set(k, wid); c.netOfWire.set(wid, k); }
    }
    // a top-level wire inside a block that joined an outer one keeps the outer name
    for (const w of doc.wires) if (!c.netOfWire.has(w.id)) { const r = find('#' + w.id); const net = nets.get(r); if (net) c.netOfWire.set(w.id, net.name); }
    return c;
  };

  /** the inputs and outputs of a block document: its IN and OUT parts, in order down the page */
  D.blockPorts = function (bdoc) {
    const ins = bdoc.parts.filter((p) => p.type === 'IN' || p.type === 'CLOCK').sort((a, b) => a.y - b.y);
    const outs = bdoc.parts.filter((p) => p.type === 'OUT').sort((a, b) => a.y - b.y);
    const one = (p) => ((p.params.w || 1) > 1 ? { name: p.params.name, width: p.params.w } : p.params.name);
    return { inputs: ins.map(one), outputs: outs.map(one) };
  };

  // ---- from a circuit, laid out ------------------------------------------------------------------------------
  /** a document from a Netlist.Circuit, placed and routed by the layout engine */
  D.fromCircuit = function (c, opts) {
    opts = opts || {};
    const res = S.Layout.layout(c, opts.layout);
    const u = U();
    const doc = D.blank(opts.title || c.title);
    doc.blocks = opts.blocks ? clone(opts.blocks) : {};
    for (const p of res.parts) {
      const pins = {};
      for (const q of p.pins) pins[q.name] = { x: (q.x - p.x) / u, y: (q.y - p.y) / u, side: q.side };
      doc.parts.push({ id: p.id, type: p.type, params: clone(p.part.params || {}), x: p.x / u, y: p.y / u, rot: 0, flip: false, open: [...(p.part.open || [])], g: { w: p.w / u, h: p.h / u, pins, draw: clone(p.geom || S.Symbols.geom(p.part)) } });
    }
    for (const n of c.nets) {
      if (n.pins.length < 2) continue;
      const w = { id: n.id, pins: n.pins.map((r) => [r.part.id, r.pin]) };
      if (n.name && n.show) { w.name = n.name; w.show = true; }
      else if (n.name && !['IN', 'CLOCK'].includes(n.pins[0].part.type)) w.name = n.name;
      doc.wires.push(w);
    }
    D.keepRoutes(doc, res);
    return doc;
  };
  /** keep a layout's wires and labels on the document (until the next change) */
  D.keepRoutes = function (doc, res) {
    doc.routes = {};
    for (const n of res.nets) doc.routes[n.id] = { paths: (n.paths || n.polylines.map((pts) => ({ rail: false, pts }))).map((q) => ({ rail: !!q.rail, pts: q.pts.map((p) => [p[0], p[1]]) })), junctions: n.junctions.map((j) => [j[0], j[1]]) };
    doc.labels = res.labels.map((l) => ({ kind: l.kind, net: l.net, text: l.text, x: l.x, y: l.y, anchor: l.anchor, size: l.size, slash: l.slash || null }));
    doc.routeSig = D.sig(doc);
  };
  /** what the kept routes depend on: the parts' places and shapes and the wires' pins */
  D.sig = (doc) => JSON.stringify([doc.parts.map((p) => [p.id, p.x, p.y, p.rot || 0, !!p.flip, p.type, p.params]), doc.wires.map((w) => [w.id, w.pins, w.name || '', !!w.show])]);
  D.routesValid = (doc) => !!(doc.routes && doc.routeSig === D.sig(doc));

  /** tidy up: the same parts and wires, placed and routed again by the layout engine (ids kept) */
  D.tidy = function (doc) {
    const c = new S.Netlist.Circuit(doc.title);
    for (const dp of doc.parts) {
      const params = clone(dp.params || {});
      if (dp.type === 'BLOCK') { const b = doc.blocks[params.block]; if (b) { params.inputs = b.inputs; params.outputs = b.outputs; if (params.title == null) params.title = params.block; } }
      const part = addPart(c, dp.type, params, dp.id);
      for (const o of dp.open || []) part.open.add(o);
    }
    for (const w of doc.wires) {
      const pins = w.pins.map(([pid, pn]) => ({ part: c.byId.get(pid), pin: pn })).filter((r) => r.part && r.part.pins.some((q) => q.name === r.pin));
      if (pins.length < 2) continue;
      const net = { id: w.id, name: w.name || null, width: Math.max(...pins.map((r) => r.part.pins.find((q) => q.name === r.pin).width || 1)), pins: [], show: !!w.show };
      // the driver first
      pins.sort((a, b) => (a.part.pins.find((q) => q.name === a.pin).dir === 'out' ? 0 : 1) - (b.part.pins.find((q) => q.name === b.pin).dir === 'out' ? 0 : 1));
      for (const r of pins) { net.pins.push(r); r.part.net[r.pin] = net; }
      c.nets.push(net);
    }
    const out = D.fromCircuit(c, { title: doc.title, blocks: doc.blocks });
    // the parameters as the document had them (the block's ports are filled in only for drawing)
    for (const p of out.parts) { const o = doc.parts.find((x) => x.id === p.id); if (o) p.params = clone(o.params); }
    out.wires = out.wires.map((w) => { const o = doc.wires.find((x) => x.id === w.id); return o ? Object.assign({}, w, { name: o.name, show: o.show }) : w; });
    out.notes = clone(doc.notes || []);
    out.routeSig = D.sig(out);
    return out;
  };

  // ---- problems ------------------------------------------------------------------------------------------------
  /**
   * What is wrong with a document, each as {kind, msg, parts: [ids], wire}: inputs left unconnected, wires with no
   * driver or with two, pins of different widths on one wire, two ports with one name.
   */
  D.problems = function (doc) {
    const out = [];
    const tri = (dp) => ['TRI'].includes(dp.type) || /^74.*(125|126|244|245)$/.test(dp.type);
    for (const w of doc.wires) {
      const ends = w.pins.map(([pid, pn]) => { const dp = D.part(doc, pid); return dp && { dp, pn, q: D.pinDef(doc, dp, pn) }; }).filter((x) => x && x.q);
      const drv = ends.filter((e) => e.q.dir === 'out');
      const name = w.name ? '"' + w.name + '"' : 'a wire';
      if (!drv.length) out.push({ kind: 'no-driver', msg: name + ' joins ' + ends.map((e) => e.dp.id + '.' + e.pn).join(', ') + ' but nothing drives it: it floats (Z).', parts: ends.map((e) => e.dp.id), wire: w.id });
      else if (drv.length > 1 && !drv.every((e) => tri(e.dp))) out.push({ kind: 'two-drivers', msg: name + ' is driven by ' + drv.map((e) => e.dp.id + '.' + e.pn).join(' and ') + ': two outputs fight, and the wire reads X when they disagree.', parts: drv.map((e) => e.dp.id), wire: w.id });
      const widths = [...new Set(ends.map((e) => e.q.width || 1))];
      if (widths.length > 1) out.push({ kind: 'width', msg: name + ' joins pins of different widths (' + ends.map((e) => e.dp.id + '.' + e.pn + ' is ' + (e.q.width || 1) + ' bit' + ((e.q.width || 1) > 1 ? 's' : '')).join(', ') + ').', parts: ends.map((e) => e.dp.id), wire: w.id });
    }
    for (const dp of doc.parts) {
      const part = D.partObj(dp, doc);
      for (const q of part.pins) {
        if (q.dir !== 'in' || (dp.open || []).includes(q.name)) continue;
        if (!D.wireAt(doc, dp.id, q.name)) out.push({ kind: 'unconnected', msg: dp.id + '.' + q.name + (q.label ? ' (' + q.label + ')' : '') + ' is not connected: an open input floats, and reads X (or 1 on TTL).', parts: [dp.id], pin: q.name });
      }
    }
    const seen = new Map();
    for (const dp of doc.parts) if (S.Eng.isPort(dp.type)) {
      const k = dp.params.name;
      if (seen.has(k)) out.push({ kind: 'name', msg: 'Two ports are called "' + k + '" (' + seen.get(k) + ' and ' + dp.id + ').', parts: [seen.get(k), dp.id] });
      else seen.set(k, dp.id);
    }
    return out;
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
