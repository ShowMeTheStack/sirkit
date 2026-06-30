// The event-driven simulator. Every wire carries four-state values (see sim-values.js); every part has
// delays from the technology preset or its own parameters, inertial by default (a pulse shorter than a
// part's delay never gets through it) or transport. Events at the same time run in delta cycles; a zero-delay
// loop that never settles is cut off and reported, not left to hang. Storage parts are checked for setup,
// hold and minimum pulse width; a violation makes the output metastable (X for a while, then a seeded random
// 0 or 1). The run can be stepped one event at a time and rewound: snapshots are kept every few thousand
// events, and going back restores one and replays the log of inputs from there.
//
//   const sim = Sirkit.Sim.create(circuit, { tech: 'CMOS' })
//   sim.set('A', 1); sim.run(50); sim.get('F'); sim.clockEdge(); sim.waves; sim.events; sim.violations
//
// Options: tech (a preset name or object), transport (all delays transport), floatHigh (floating inputs
// read 1, as TTL inputs do), meta ('resolve' | 'stay' | 'off'), seed, powerUp ('X' | 0 | 'random': the
// starting state of storage), record (net names to record waves for; default all), log (keep the event
// log; default true), snapEvery (events between snapshots), maxDelta (delta cycles allowed in one time step),
// clock (the name of the main clock).
(function (S) {
  'use strict';
  /** 'a' or 'an' before a word as it is read aloud (an AND, an xor, an 8-bit, a NAND, a reg) */
  const an = (w) => (/^(?:[aeiou]|x(?:n?or)\b|nmos|rnmos|rtran|rcmos|rpmos|8|11(?!\d)|18(?!\d))/i.test(String(w)) ? 'an ' : 'a ');
  const Sim = S.Sim = S.Sim || {};
  const DRIVE = 0, TIMER = 1;
  const GATE = { NOT: 0, BUF: 1, AND: 2, OR: 3, NAND: 4, NOR: 5, XOR: 6, XNOR: 7 };
  const round = (t) => (Number.isInteger(t) ? t : Math.round(t * 1e6) / 1e6);
  const fmt = (t) => String(round(t));
  const mask = (w) => (w >= 32 ? 0xFFFFFFFF : ((1 << w) >>> 0) - 1);

  // ---- compile: flatten blocks and chips into leaf parts and nets ---------------------------------------------
  /**
   * Flattens a circuit for simulation and timing analysis: subcircuits are opened up (their ports joined to
   * the nets outside), chips built from library parts are expanded, and every pin gets a net (an unconnected
   * input gets a net of its own that nothing drives). Returns { nets, parts, names, chips }.
   */
  function compile(circuit, opts) {
    opts = opts || {};
    const P = S.Parts, T = S.Tech, Nl = S.Netlist, tech = T.get(opts.tech);
    const parent = [], info = [];
    const node = (width, name, pri) => { parent.push(parent.length); info.push({ width, name, pri }); return parent.length - 1; };
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const union = (x, y) => {
      x = find(x); y = find(y);
      if (x === y) return;
      if (info[x].width !== info[y].width) throw new Error('width mismatch joining ' + (info[x].name || '?') + ' (' + info[x].width + ' bits) and ' + (info[y].name || '?') + ' (' + info[y].width + ' bits)');
      parent[y] = x;
      if (info[y].pri > info[x].pri) { info[x].name = info[y].name; info[x].pri = info[y].pri; }
    };
    const leaves = [], chipList = [], alias = new Map();
    const nameNode = (nd, name, pri) => { const r = find(nd); if (name && pri > info[r].pri) { info[r].name = name; info[r].pri = pri; } };

    function leaf(id, type, params, pinNodes, extra) {
      const spec = P.registry[type];
      if (!spec) throw new Error('no behaviour for part type ' + type + ' (' + id + ')');
      const p = P.withDefaults(type, params);
      const pins = Nl.pinsOf(type, params || {});
      const lf = Object.assign({ id, type, spec, p, pins: pins.map((q) => Object.assign({}, q, { node: pinNodes(q) })) }, extra || {});
      leaves.push(lf);
      return lf;
    }
    function flatten(c, prefix, bind, depth) {
      if (depth > 32) throw new Error('subcircuits nested too deep');
      const top = !prefix;
      const nn = new Map();
      for (const n of c.nets) nn.set(n, node(n.width, n.name ? prefix + n.name : prefix + n.id, n.name ? (top ? 6 : 3) : 0));
      if (top) for (const n of c.nets) alias.set(n.id, nn.get(n));
      for (const part of c.parts) {
        const pid = prefix + part.id;
        const pinNode = (q) => {
          const n = part.net[q.name];
          if (n) return nn.get(n);
          const nd = node(q.width, pid + '.' + q.name, q.dir === 'out' ? 1 : 0);
          return nd;
        };
        const nodes = new Map();
        const pn = (q) => { if (!nodes.has(q.name)) nodes.set(q.name, pinNode(q)); return nodes.get(q.name); };
        for (const q of part.pins) {
          const nd = pn(q);
          if (q.dir === 'out') nameNode(nd, pid + '.' + q.name, 1);
          if (top) alias.set(part.id + '.' + q.name, nd);
        }
        const nm = part.params && part.params.name;
        if (bind && (part.type === 'IN' || part.type === 'CLOCK') && bind.has(nm)) { union(bind.get(nm), pn(part.pins[0])); continue; }
        if (bind && part.type === 'OUT' && bind.has(nm)) { union(bind.get(nm), pn(part.pins[0])); continue; }
        if ((part.type === 'IN' || part.type === 'CLOCK' || part.type === 'OUT' || part.type === 'SWITCH' || part.type === 'BUTTON') && nm) {
          nameNode(pn(part.pins[0]), prefix + nm, top ? 5 : 2);
          if (top) alias.set(nm, pn(part.pins[0]));
        }
        if (part.type === 'BLOCK' && part.params.circuit) {
          const b = new Map();
          for (const q of part.pins) b.set(q.name, pn(q));
          flatten(part.params.circuit, pid + '/', b, depth + 1);
          continue;
        }
        const spec = P.registry[part.type];
        if (spec && spec.expand) {
          const outer = new Map(part.pins.map((q) => [q.name, pn(q)]));
          const chipRec = { id: pid, type: part.type, spec, vcc: outer.get(spec.power.vcc), gnd: outer.get(spec.power.gnd), reported: false };
          chipList.push(chipRec);
          for (const sec of spec.expand(part.params || {})) {
            leaf(pid + '.' + sec.id, sec.type, sec.params, (q) => {
              const o = sec.map[q.name];
              return o ? outer.get(o) : node(q.width, pid + '.' + sec.id + '.' + q.name, 0);
            }, { chip: chipRec, alias: sec.map, label: (spec.number || part.type) + ' ' + pid + ' (' + sec.id + ')' });
          }
          continue;
        }
        const lf = leaf(pid, part.type, part.params, pn);
        if (spec && spec.power) {
          const chipRec = { id: pid, type: part.type, spec, vcc: pn(part.pins.find((q) => q.name === spec.power.vcc)), gnd: pn(part.pins.find((q) => q.name === spec.power.gnd)), reported: false };
          chipList.push(chipRec);
          lf.chip = chipRec;
        }
      }
    }
    flatten(circuit, '', null, 0);

    // nets from the node classes
    const netOf = new Map(), nets = [];
    const netIdx = (nd) => {
      const r = find(nd);
      if (!netOf.has(r)) { netOf.set(r, nets.length); nets.push({ name: info[r].name, width: info[r].width, drivers: [], readers: [] }); }
      return netOf.get(r);
    };
    const parts = leaves.map((lf, i) => {
      const sp = lf.spec, p = lf.p;
      const pt = { idx: i, id: lf.id, type: lf.type, spec: sp, p, kind: sp.kind, label: lf.label || (sp.number || lf.type) + ' ' + lf.id, ins: [], outs: [], pins: lf.pins, alias: lf.alias || null };
      for (const q of lf.pins) {
        const n = netIdx(q.node);
        if (q.dir === 'out') { pt.outs.push({ name: q.name, net: n, width: q.width }); nets[n].drivers.push({ part: i, pin: q.name }); }
        if (q.dir === 'in' || q.rd) { pt.ins.push({ name: q.name, net: n, width: q.width, clock: !!q.clock, power: !!q.power }); nets[n].readers.push({ part: i, pin: q.name }); }
      }
      if (lf.chip) { pt.chip = lf.chip; pt.vcc = netIdx(lf.chip.vcc); pt.gnd = netIdx(lf.chip.gnd); }
      // delays and timing
      if (sp.seq) {
        const tk = T.seq(tech, sp.seq.timing || 'ff');
        const tcq = p.tcq !== null && p.tcq !== undefined ? [+p.tcq, +p.tcq] : tk.tcq;
        Object.assign(pt, { lh: tcq[0], hl: tcq[1], tsu: p.tsu !== null && p.tsu !== undefined ? +p.tsu : tk.tsu, th: p.th !== null && p.th !== undefined ? +p.th : tk.th, tw: tk.tw, tres: tk.tres });
        if (sp.tech) { const d = T.delay(tech, sp.tech(p), p); pt.ta = p.taa !== null && p.taa !== undefined ? +p.taa : d[0]; }
      } else if (sp.gate || sp.tech) {
        const d = T.delay(tech, sp.gate || sp.tech(p), Object.assign({}, p, sp.techP || {}));
        pt.lh = p.tpLH !== null && p.tpLH !== undefined ? +p.tpLH : d[0];
        pt.hl = p.tpHL !== null && p.tpHL !== undefined ? +p.tpHL : d[1];
      } else { pt.lh = 0; pt.hl = 0; }
      if (lf.type === 'CLOCK') pt.period = p.period !== null && p.period !== undefined ? +p.period : tech.clockPeriod;
      return pt;
    });
    // chips' power pins are watched by every part inside
    for (const pt of parts) if (pt.chip && !pt.ins.some((x) => x.power)) for (const n of [pt.vcc, pt.gnd]) nets[n].readers.push({ part: pt.idx, pin: null });
    for (const c of chipList) { c.vccNet = netIdx(c.vcc); c.gndNet = netIdx(c.gnd); }
    // weak pull-ups some chips have on their own pins
    for (const pt of parts) if (pt.spec.pull) for (const nm of pt.spec.pull) { const o = pt.outs.find((x) => x.name === nm); if (o) nets[o.net].pulls = (nets[o.net].pulls || 0) + 1; }
    // unique names
    const seen = new Map();
    for (const n of nets) { const k = seen.get(n.name) || 0; seen.set(n.name, k + 1); if (k) n.name = n.name + '#' + (k + 1); }
    const names = new Map();
    nets.forEach((n, i) => names.set(n.name, i));
    for (const [k, nd] of alias) if (!names.has(k)) names.set(k, netIdx(nd));
    for (const pt of parts) for (const q of pt.ins.concat(pt.outs)) { const k = pt.id + '.' + q.name; if (!names.has(k)) names.set(k, q.net); }
    return { nets, parts, names, chips: chipList, tech };
  }
  Sim.compile = compile;

  // ---- the simulator -------------------------------------------------------------------------------------------
  function create(circuit, opts) {
    opts = Object.assign({ meta: 'resolve', seed: 1, powerUp: 'X', log: true, snapEvery: 2000, maxDelta: 1000, maxLog: 2000000 }, opts || {});
    const V = S.Values, P = S.Parts;
    const C = compile(circuit, opts), tech = C.tech;
    const nets = C.nets, parts = C.parts, NN = nets.length, NP = parts.length;
    const floatHigh = !!opts.floatHigh, transportAll = !!opts.transport;

    // nets
    const nW = new Int32Array(NN), nMask = new Uint32Array(NN), nName = nets.map((n) => n.name);
    const NA = new Uint32Array(NN), NB = new Uint32Array(NN), nCont = new Uint8Array(NN);
    const nDrv = [], nRd = [], nOne = new Int32Array(NN);
    // drivers: one per output pin (plus the weak pull-ups some chips have)
    const dPart = [], dNet = [], dPin = [], dWeak = [], dSrc = [], dPend = [];
    let DA, DB;
    nets.forEach((n, i) => { nW[i] = n.width; nMask[i] = mask(n.width); nDrv.push([]); nRd.push([...new Set(n.readers.map((r) => r.part))]); });
    const addDriver = (pi, ni, pin, weak, src) => { const d = dPart.length; dPart.push(pi); dNet.push(ni); dPin.push(pin); dWeak.push(weak ? 1 : 0); dSrc.push(src ? 1 : 0); dPend.push([]); nDrv[ni].push(d); return d; };
    for (const pt of parts) {
      pt.outD = {};
      pt.nOut = pt.outs.length;
      for (const o of pt.outs) pt.outD[o.name] = addDriver(pt.idx, o.net, o.name, pt.spec.weak, pt.kind === 'source' && !pt.spec.weak && pt.type !== 'CLOCK');
    }
    const pullD = [];
    nets.forEach((n, i) => { for (let k = 0; k < (n.pulls || 0); k++) pullD.push(addDriver(-1, i, 'pull-up', true, false)); });
    const ND = dPart.length;
    DA = new Uint32Array(ND); DB = new Uint32Array(ND);
    for (let i = 0; i < NN; i++) nOne[i] = nDrv[i].length === 1 && !dWeak[nDrv[i][0]] ? 1 : 0;

    // input slots (the last value each part saw on each input, for edges and timing checks)
    let NS = 0;
    for (const pt of parts) { pt.slot0 = NS; pt.nIn = pt.ins.length; NS += pt.nIn; }
    const SA = new Uint32Array(NS), SB = new Uint32Array(NS), ST = new Float64Array(NS), SPT = new Float64Array(NS), SOA = new Uint32Array(NS), SOB = new Uint32Array(NS), SFX = new Uint8Array(NS), SPFX = new Uint8Array(NS);

    // per-part setup
    const isGate = (pt) => pt.spec.gate !== undefined;
    for (const pt of parts) {
      pt.inIdx = {};
      pt.ins.forEach((q, k) => { pt.inIdx[q.name] = k; });
      pt.chg = new Uint8Array(pt.nIn);
      if (isGate(pt)) {
        pt.g = GATE[pt.spec.gate];
        pt.inNets = Int32Array.from(pt.ins.filter((q) => q.name !== 'oe').map((q) => q.net));
        pt.tri = pt.p.out === 'tri'; pt.oc = pt.p.out === 'oc'; pt.oeNet = pt.tri ? pt.ins[pt.inIdx.oe].net : -1;
        pt.d0 = pt.outD.y;
      }
      const sq = pt.spec.seq;
      pt.isSeq = !!sq;
      pt.ck = -1; pt.tk = -1; pt.tdata = []; pt.tasync = [];
      if (sq) {
        const useClk = sq.clock && (!sq.when || sq.when(pt.p));
        if (useClk && pt.inIdx[sq.clock] !== undefined) pt.ck = pt.inIdx[sq.clock];
        const chk = sq.check || (useClk ? sq.clock : null);
        if (chk && pt.inIdx[chk] !== undefined) pt.tk = pt.inIdx[chk];
        pt.edge = sq.edge ? sq.edge(pt.p) : 'rise';
        pt.tdata = (sq.data ? sq.data(pt.p) : []).map((n) => pt.inIdx[n]).filter((k) => k !== undefined);
        pt.tasync = (sq.async ? sq.async(pt.p) : []).filter((x) => pt.inIdx[x.pin] !== undefined).map((x) => ({ k: pt.inIdx[x.pin], low: !!x.low }));
        pt.meta = sq.meta !== false && opts.meta !== 'off';
        // the controls' resting levels: while one still holds the X every wire starts with (nothing has driven
        // it yet), it reads as resting, so the power-up state is not lost before the inputs arrive
        pt.trest = (sq.rest ? sq.rest(pt.p) : sq.async ? sq.async(pt.p) : []).filter((x) => pt.inIdx[x.pin] !== undefined).map((x) => ({ k: pt.inIdx[x.pin], v: x.low ? 1 : 0 }));
      }
      pt.unp = 0; pt.floatRep = 0; pt.lastEdge = -Infinity; pt.pre = null;
      pt.tcqMax = Math.max(pt.lh, pt.hl); pt.ta = pt.ta || 0; pt.period = pt.period || 0;
    }
    const names = C.names;
    const mainClock = (() => {
      const cl = parts.filter((pt) => pt.type === 'CLOCK');
      if (opts.clock) return cl.find((pt) => pt.p.name === opts.clock || pt.id === opts.clock) || null;
      return cl.find((pt) => !pt.id.includes('/')) || cl[0] || null;
    })();

    // ---- state ----------------------------------------------------------------------------------------------
    let now = 0, delta = 0, seq = 0, ops = 0, count = 0, active = 0, epoch = 1, maxEpoch = 1, loopBase = 0, rngS = opts.seed >>> 0;
    let heap = [];
    let evalList = [], evalSpare = [];
    const mark = new Int32Array(NP), trigBy = new Array(NP).fill(null);
    const nEv = new Array(NN).fill(null); // each net's latest change, to trace where a change came from
    const events = [], violations = [], swallowed = [], listeners = [], vListeners = [];
    const waves = new Map(), wNet = [], wArr = [], wStamp = [];
    const setLog = [];
    let snaps = [];
    let cur = null, curWhy = 'eval', curBy = null, forceDelay = -1, ovr = null, zSeen = null;
    const rnd = () => { rngS = (rngS + 0x6D2B79F5) >>> 0; let t = Math.imul(rngS ^ (rngS >>> 15), 1 | rngS); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

    // ---- the event queue ------------------------------------------------------------------------------------
    class Q {
      constructor(t, dl, k, d, a, b) { this.t = t; this.dl = dl; this.seq = seq++; this.k = k; this.d = d; this.a = a; this.b = b; this.dead = false; this.act = true; this.src = -1; this.by = null; this.why = null; this.made = now; this.part = -1; this.tag = null; this.bits = 0; }
    }
    const less = (x, y) => x.t < y.t || (x.t === y.t && (x.dl < y.dl || (x.dl === y.dl && x.seq < y.seq)));
    function hpush(e) { heap.push(e); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (!less(e, heap[j])) break; heap[i] = heap[j]; i = j; } heap[i] = e; }
    function hpop() {
      const top = heap[0], last = heap.pop(), n = heap.length;
      if (n) {
        let i = 0;
        for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && less(heap[c + 1], heap[c])) c++; if (!less(heap[c], last)) break; heap[i] = heap[c]; i = c; }
        heap[i] = last;
      }
      return top;
    }
    const kill = (e) => { if (!e.dead) { e.dead = true; if (e.act) active--; } };
    const peek = () => { while (heap.length && heap[0].dead) hpop(); return heap.length ? heap[0] : null; };

    // ---- the event log --------------------------------------------------------------------------------------
    const word = (fa, fb, a, b, w, past) => {
      if (w > 1) return (past ? 'changed to ' : 'changes to ') + V.str(V.toPub(a, b, w)) + (b ? '' : ' (' + a + ')');
      if (b & 1) return a & 1 ? (past ? 'go X' : 'goes X') : (past ? 'float (Z)' : 'floats (Z)');
      if (a & 1) return past ? 'rise' : 'rises';
      return past ? 'fall' : 'falls';
    };
    class Ev {
      constructor(t, ni, fa, fb, a, b, q) { this.n = count; this.t = t; this.ni = ni; this.fa = fa; this.fb = fb; this.a = a; this.b = b; this.q = q; }
      get net() { return nName[this.ni]; }
      get from() { return V.toPub(this.fa, this.fb, nW[this.ni]); }
      get to() { return V.toPub(this.a, this.b, nW[this.ni]); }
      get part() { const d = this.q ? this.q.d : -1; return d >= 0 && dPart[d] >= 0 ? parts[dPart[d]].id : null; }
      /** the event that made the part producing this one evaluate, if any: follow it to trace a chain of causes */
      get by() { return this.q ? this.q.by : null; }
      get cause() { return causeOf(this); }
      toJSON() { return { t: this.t, net: this.net, from: this.from, to: this.to, cause: this.cause }; }
    }
    function causeOf(ev) {
      const q = ev.q, w = nW[ev.ni], verb = word(ev.fa, ev.fb, ev.a, ev.b, w, false), val = V.str(V.toPub(ev.a, ev.b, w));
      if (!q) return ev.net + ' ' + verb + ' at ' + fmt(ev.t) + ' ns.';
      if (q.why === 'loop') return ev.net + ' is in a loop that never settles, so it is set to X at ' + fmt(ev.t) + ' ns.';
      const d = q.d, pt = dPart[d] >= 0 ? parts[dPart[d]] : null;
      if (!pt) return 'A pull-up holds ' + ev.net + ' at 1.';
      const nm = pt.p.name || pt.id;
      if (q.why === 'set') return 'Input ' + nm + ' set to ' + val + ' at ' + fmt(ev.t) + ' ns.';
      if (q.why === 'at') return 'The stimulus drives ' + nm + ' to ' + val + ' at ' + fmt(ev.t) + ' ns.';
      if (q.why === 'clock') return 'Clock ' + nm + ' ' + verb + ' at ' + fmt(ev.t) + ' ns (period ' + fmt(pt.period) + ' ns).';
      if (q.why === 'start') return pt.label + ' drives ' + val + ' from the start.';
      if (q.why === 'state') return pt.label + ' set to ' + val + ' by hand at ' + fmt(ev.t) + ' ns.';
      if (q.why === 'deposit') return ev.net + ' set to ' + val + ' by hand at ' + fmt(ev.t) + ' ns.';
      if (q.why === 'press') return 'Button ' + nm + (ev.a & 1 ? ' makes contact' : ' breaks contact') + ' at ' + fmt(ev.t) + ' ns.';
      const pinName = pt.nOut === 1 ? 'its output' : (pt.pins.find((x) => x.name === dPin[d]) || {}).label || dPin[d];
      if (q.why === 'meta') return pt.label + ' comes out of metastability: ' + pinName + ' ' + verb + ' at ' + fmt(ev.t) + ' ns.';
      if (q.why === 'power') return pt.label + ' has no power, so ' + pinName + ' floats.';
      const later = round(ev.t - q.made);
      if (q.by) return pt.label + ' saw ' + q.by.net + ' ' + word(q.by.fa, q.by.fb, q.by.a, q.by.b, nW[q.by.ni], true) + ' at ' + fmt(q.by.t) + ' ns; ' + pinName + ' ' + verb + ' at ' + fmt(ev.t) + ' ns' + (later > 0 ? ' (' + later + ' ns later).' : '.');
      return pt.label + ': ' + pinName + ' ' + verb + ' at ' + fmt(ev.t) + ' ns.';
    }
    /** the first event of a chain of causes: a clock edge, an input set, a stimulus */
    function rootOf(ev) { for (let i = 0; ev && ev.q && ev.q.by && i < 100000; i++) ev = ev.q.by; return ev; }
    /** did the same edge of a clock both make this change on net dn and reach the clock pin on net cn now? */
    function sameEdge(dn, cn) {
      const a = rootOf(nEv[dn]), b = rootOf(nEv[cn]);
      return !!(a && b && a.q && a.q.why === 'clock' && (a === b || (a.ni === b.ni && a.t === b.t)));
    }
    function violation(kind, pt, say, extra) {
      const v = Object.assign({ t: round(now), part: pt ? pt.id : null, kind, say }, extra || {});
      violations.push(v);
      for (const f of vListeners) f(v);
      return v;
    }

    // ---- driving and resolving ------------------------------------------------------------------------------
    function delayFor(pt, d, a, b) {
      if (forceDelay >= 0) return forceDelay;
      const lh = pt.lh, hl = pt.hl;
      if (lh === hl) return lh;
      const pend = dPend[d];
      let pa = DA[d], pb = DB[d];
      if (pend.length) { const l = pend[pend.length - 1]; pa = l.a; pb = l.b; }
      const rise = (a & ~b) & ~(pa & ~pb), fall = (~a & ~b) & ~(~pa & ~pb);
      if (rise && fall) return Math.max(lh, hl);
      if (rise) return lh;
      if (fall) return hl;
      return Math.min(lh, hl);
    }
    /** schedule a driver to take the value (a, b) after the delay */
    function schedule(d, a, b, delay, transport) {
      a >>>= 0; b >>>= 0;
      const pend = dPend[d];
      const t = round(now + delay);
      if (dSrc[d]) {
        // inputs: changes queue up in time order, none cancelled
        const e = new Q(t, delay === 0 ? delta + 1 : 0, DRIVE, d, a, b);
        e.why = curWhy; e.src = dPart[d]; e.act = curWhy !== 'at';
        let i = pend.length;
        while (i > 0 && less(e, pend[i - 1])) i--;
        pend.splice(i, 0, e); hpush(e); if (e.act) active++;
        return;
      }
      if (!transport && !transportAll) {
        let pa = DA[d], pb = DB[d];
        if (pend.length) { const l = pend[pend.length - 1]; pa = l.a; pb = l.b; }
        if (a === pa && b === pb) return;
        if (pend.length) {
          const first = pend[0];
          for (const e of pend) kill(e);
          pend.length = 0;
          if (a === DA[d] && b === DB[d]) {
            // the output was about to change and now need not: a pulse narrower than the delay is swallowed
            if (first.made === now) return;
            const pt = parts[dPart[d]];
            const width = round(now - first.made);
            swallowed.push({ t: round(now), part: pt.id, pin: dPin[d], width, say: pt.label + ' swallowed ' + an(width) + width + ' ns pulse on its inputs: shorter than its ' + round(first.t - first.made) + ' ns delay, so ' + dPin[d] + ' never changed.' });
            return;
          }
        }
      } else {
        while (pend.length && pend[pend.length - 1].t >= t) kill(pend.pop());
        const l = pend.length ? pend[pend.length - 1] : null;
        if (l ? l.a === a && l.b === b : DA[d] === a && DB[d] === b) return;
      }
      const e = new Q(t, delay === 0 ? delta + 1 : 0, DRIVE, d, a, b);
      e.src = dPart[d]; e.by = curBy; e.why = curWhy;
      pend.push(e); hpush(e); active++;
    }
    let rA = 0, rB = 0;
    function resolve(n) {
      let s0 = 0, s1 = 0, sx = 0, w0 = 0, w1 = 0, wx = 0;
      const ds = nDrv[n];
      for (let i = 0; i < ds.length; i++) {
        const d = ds[i], a = DA[d], b = DB[d];
        if (dWeak[d]) { w0 |= ~a & ~b; w1 |= a & ~b; wx |= a & b; } else { s0 |= ~a & ~b; s1 |= a & ~b; sx |= a & b; }
      }
      const m = nMask[n], cont = s0 & s1 & m, xs = (cont | sx) & m, strong = (s0 | s1 | sx) & m;
      const wX = ((w0 & w1) | wx) & ~strong & m, weak1 = w1 & ~strong & ~wX & m;
      const none = ~(strong | w0 | w1 | wx) & m;
      rA = ((s1 & ~xs) | xs | weak1 | wX) & m; rB = (xs | wX | none) & m;
      rA >>>= 0; rB >>>= 0;
      if (cont && !nCont[n]) {
        const who = ds.filter((d) => !dWeak[d] && (DA[d] & ~DB[d] & cont || ~DA[d] & ~DB[d] & cont)).map((d) => (dPart[d] >= 0 ? parts[dPart[d]].id + '.' + dPin[d] : 'pull'));
        violation('contention', dPart[ds[0]] >= 0 ? parts[dPart[ds[0]]] : null, 'Contention on ' + nName[n] + ' at ' + fmt(now) + ' ns: ' + who.join(' and ') + ' drive it to different values, so it reads X.', { net: nName[n], drivers: who });
      }
      nCont[n] = cont ? 1 : 0;
    }
    function apply(e) {
      const d = e.d, pend = dPend[d];
      if (pend[0] === e) pend.shift(); else { const i = pend.indexOf(e); if (i >= 0) pend.splice(i, 1); }
      if (DA[d] === e.a && DB[d] === e.b) return null;
      DA[d] = e.a; DB[d] = e.b;
      const n = dNet[d];
      let a, b;
      if (nOne[n]) { a = e.a; b = e.b; } else { resolve(n); a = rA; b = rB; }
      if (a === NA[n] && b === NB[n]) return null;
      return change(n, a, b, e);
    }
    function change(n, a, b, q) {
      count++;
      const ev = new Ev(now, n, NA[n], NB[n], a, b, q);
      NA[n] = a; NB[n] = b;
      nEv[n] = ev;
      const rd = nRd[n];
      for (let i = 0; i < rd.length; i++) { const r = rd[i]; if (mark[r] !== epoch) { mark[r] = epoch; evalList.push(r); trigBy[r] = ev; } }
      const wi = wNet[n];
      if (wi >= 0) { wArr[wi].push([ev.t, V.toPub(a, b, nW[n])]); wStamp[wi].push(count); }
      if (opts.log && events.length < opts.maxLog) events.push(ev);
      for (let i = 0; i < listeners.length; i++) listeners[i](ev);
      return ev;
    }

    // ---- the io object behaviours see -----------------------------------------------------------------------
    function rd(name) {
      const k = cur.inIdx[name];
      if (k === undefined) { rA = 0; rB = 0xFFFFFFFF; return; }
      if (ovr && ovr[k]) { rA = ovr[k][0]; rB = ovr[k][1]; return; }
      const n = cur.ins[k].net;
      rA = NA[n]; rB = NB[n];
    }
    const io = {
      X: -1, Z: -2, A: 0, B: 0, p: null, st: null, t: 0, tcq: 0, ta: 0, period: 0,
      has: (name) => cur.inIdx[name] !== undefined || cur.outD[name] !== undefined,
      w: (name) => { const k = cur.inIdx[name]; return k !== undefined ? cur.ins[k].width : (cur.outs.find((o) => o.name === name) || {}).width || 0; },
      ab(name) { rd(name); io.A = rA; io.B = rB; },
      pass(name) {
        rd(name);
        let a = rA, b = rB;
        if (b) { const z = b & ~a; if (z) { zSeen = name; if (floatHigh) { a |= z; b &= ~z; } } a |= b; }
        io.A = a >>> 0; io.B = b >>> 0;
      },
      v(name) {
        rd(name);
        let a = rA, b = rB;
        if (b) {
          if (b === 0xFFFFFFFF && cur.inIdx[name] === undefined) return -1;
          const z = b & ~a;
          if (z) { zSeen = name; if (floatHigh) { a |= z; b &= ~z; } }
          if (b) return -1;
        }
        return a >>> 0;
      },
      b(name) { return io.v(name); },
      act(name, low) { const b = io.v(name); return b < 0 ? -1 : low ? 1 - b : b; },
      /** true while an input has never yet changed: still at its power-up value (storage parts only) */
      fresh(name) { const k = cur.inIdx[name]; return k === undefined || ST[cur.slot0 + k] === -Infinity; },
      out(name, v, d) {
        const dr = cur.outD[name];
        if (dr === undefined) return;
        const m = nMask[dNet[dr]];
        let a, b;
        if (v === -1) { a = m; b = m; } else if (v === -2) { a = 0; b = m; } else { a = (v >>> 0) & m; b = 0; }
        schedule(dr, a, b, d === undefined || d === null ? delayFor(cur, dr, a >>> 0, b >>> 0) : forceDelay >= 0 ? forceDelay : d, false);
      },
      outAB(name, a, b, d, transport) {
        const dr = cur.outD[name];
        if (dr === undefined) return;
        const m = nMask[dNet[dr]];
        a = (a & m) >>> 0; b = (b & m) >>> 0;
        schedule(dr, a, b, d === undefined || d === null ? delayFor(cur, dr, a, b) : forceDelay >= 0 && !transport ? forceDelay : d, !!transport);
      },
      timer(d, tag) { const e = new Q(round(now + d), d === 0 ? delta + 1 : 0, TIMER, -1, 0, 0); e.part = cur.idx; e.tag = tag; e.act = false; hpush(e); },
    };
    const bind = (pt) => { cur = pt; io.p = pt.p; io.st = pt.st; io.t = now; io.tcq = pt.tcqMax; io.ta = pt.ta; io.period = pt.period; };

    // ---- evaluation -----------------------------------------------------------------------------------------
    const code = (a, b) => (b & 1 ? 2 : a & 1);
    function floatNote(pt, pinName) {
      if (pt.floatRep) return;
      pt.floatRep = 1;
      if (!pinName) { const q = pt.ins.find((x) => NB[x.net] & ~NA[x.net]); pinName = q ? q.name : '?'; }
      const k = pt.inIdx[pinName], n = k !== undefined ? pt.ins[k].net : -1;
      const open = n >= 0 && nDrv[n].length === 0;
      let shown = pinName;
      if (pt.alias && pt.alias[pinName]) { const o = pt.alias[pinName], q = pt.chip.spec.pins({}).find((x) => x.name === o); shown = o + (q ? ' (pin ' + q.num + ')' : ''); }
      violation('float', pt, pt.label + ': input ' + shown + (open ? ' is not connected' : ' is on a wire nothing drives (' + nName[n] + ')') + ', so it floats; it reads ' + (floatHigh ? '1, as a TTL input does.' : 'Z, which the logic treats as X.'), { pin: pinName });
    }
    function powered(pt) { return NA[pt.vcc] === 1 && NB[pt.vcc] === 0 && NA[pt.gnd] === 0 && NB[pt.gnd] === 0; }
    function powerNote(pt) {
      const c = pt.chip;
      if (c.reported) return;
      c.reported = true;
      const sp = c.spec, pv = (nm) => (sp.pins({}).find((x) => x.name === nm) || {}).num;
      violation('power', pt, (sp.number || c.type) + ' ' + c.id + ' has no power: VCC (pin ' + pv(sp.power.vcc) + ') reads ' + V.str(V.toPub(NA[c.vccNet], NB[c.vccNet], 1)) + ' and GND (pin ' + pv(sp.power.gnd) + ') reads ' + V.str(V.toPub(NA[c.gndNet], NB[c.gndNet], 1)) + '. Its outputs float.', { chip: c.id });
    }
    function evalPart(pt) {
      curBy = trigBy[pt.idx]; curWhy = 'eval';
      if (pt.chip) {
        if (!powered(pt)) {
          if (!pt.unp) {
            pt.unp = 1; bind(pt); curWhy = 'power'; forceDelay = 0;
            for (const o of pt.outs) io.out(o.name, -2);
            forceDelay = -1; curWhy = 'eval';
            if (pt.isSeq) pt.st = initState(pt);
          }
          if (now > 0) powerNote(pt);
          return;
        }
        if (pt.unp) { pt.unp = 0; pt.chip.reported = false; }
      }
      if (pt.g !== undefined) return gateEval(pt);
      bind(pt); zSeen = null;
      if (pt.isSeq) seqEval(pt);
      else if (pt.spec.eval) pt.spec.eval(io);
      if (zSeen) floatNote(pt, zSeen); else pt.floatRep = 0;
    }
    function gateEval(pt) {
      const ns = pt.inNets, g = pt.g;
      let zero = 0, one = 0, unk = 0, par = 0, zs = 0;
      for (let i = 0; i < ns.length; i++) {
        const n = ns[i];
        if (NB[n] & 1) {
          if (!(NA[n] & 1)) { zs = 1; if (floatHigh) { one = 1; par ^= 1; continue; } }
          unk = 1;
        } else if (NA[n] & 1) { one = 1; par ^= 1; } else zero = 1;
      }
      let r;
      if (g < 2) r = unk ? 2 : one;
      else if (g === 2 || g === 4) r = zero ? 0 : unk ? 2 : 1;
      else if (g === 3 || g === 5) r = one ? 1 : unk ? 2 : 0;
      else r = unk ? 2 : par;
      if ((g === 0 || g === 4 || g === 5 || g === 7) && r < 2) r = 1 - r;
      let a = r === 2 ? 1 : r, b = r === 2 ? 1 : 0;
      if (pt.oc && r === 1) { a = 0; b = 1; }
      if (pt.tri) {
        const n = pt.oeNet;
        let oa = NA[n] & 1, ob = NB[n] & 1;
        if (ob && !oa) { zs = 1; if (floatHigh) { oa = 1; ob = 0; } }
        if (ob) { a = 1; b = 1; } else if ((oa ^ (pt.p.oeLow ? 1 : 0)) === 0) { a = 0; b = 1; }
      }
      if (zs) floatNote(pt); else pt.floatRep = 0;
      cur = pt;
      schedule(pt.d0, a, b, delayFor(pt, pt.d0, a, b), false);
    }
    const clone = (o) => {
      if (o === null || typeof o !== 'object') return o;
      if (o.constructor === Object) {
        // the usual storage state: a few numbers
        let flat = true;
        for (const k in o) if (typeof o[k] === 'object' && o[k] !== null) { flat = false; break; }
        if (flat) return Object.assign({}, o);
      }
      if (ArrayBuffer.isView(o)) return o.slice();
      if (Array.isArray(o)) return o.map(clone);
      const r = {};
      for (const k in o) r[k] = clone(o[k]);
      return r;
    };
    function initState(pt) {
      const st = pt.spec.init ? pt.spec.init(pt.p) : {};
      if (st && typeof st.x === 'number' && st.x) {
        if (opts.powerUp === 0 || opts.powerUp === '0') { st.q = 0; st.x = 0; } else if (opts.powerUp === 'random') { st.q = Math.floor(rnd() * 4294967296) & st.x; st.x = 0; }
      }
      return st;
    }
    const sname = (pt, k) => { const q = pt.ins[k]; const pd = pt.pins.find((x) => x.name === q.name); return (pd && pd.label) || q.name; };
    function seqEval(pt) {
      const sp = pt.spec, s0 = pt.slot0, chg = pt.chg;
      for (let k = 0; k < pt.nIn; k++) {
        const n = pt.ins[k].net, s = s0 + k, a = NA[n], b = NB[n];
        if (a !== SA[s] || b !== SB[s]) {
          SOA[s] = SA[s]; SOB[s] = SB[s]; SA[s] = a; SB[s] = b;
          SPT[s] = ST[s]; ST[s] = now; SPFX[s] = SFX[s]; SFX[s] = SOB[s] ? 1 : 0;
          chg[k] = 1;
        } else chg[k] = 0;
      }
      const eps = 1e-9;
      let setupBad = null, holdBad = false, activeEdge = false;
      // timing checks against the clock (or a latch's closing edge)
      if (pt.tk >= 0 && chg[pt.tk]) {
        const s = s0 + pt.tk, from = code(SOA[s], SOB[s]), to = code(SA[s], SB[s]);
        if (from < 2 && SPT[s] > -Infinity && !SPFX[s] && pt.tw > 0 && now - SPT[s] < pt.tw - eps) {
          violation('pulse', pt, pt.label + ': the ' + (from ? 'high' : 'low') + ' pulse on ' + sname(pt, pt.tk) + ' from ' + fmt(SPT[s]) + ' to ' + fmt(now) + ' ns lasts ' + round(now - SPT[s]) + ' ns; it must last at least ' + pt.tw + ' ns.', { pin: pt.ins[pt.tk].name, width: round(now - SPT[s]), need: pt.tw });
        }
        const act = pt.edge === 'rise' ? from === 0 && to === 1 : from === 1 && to === 0;
        if (act) {
          for (const k of pt.tdata) {
            const sd = s0 + k;
            if (ST[sd] > -Infinity && !SFX[sd] && now - ST[sd] < pt.tsu - eps) {
              // the input may take the old value or the new one either way (for metastability)
              (setupBad = setupBad || []).push(k);
              // a change on the edge itself, launched by this same clock edge, raced the clock: a hold problem
              // (one launched by an earlier edge and arriving late is a setup problem, as below)
              if (now - ST[sd] < eps && sameEdge(pt.ins[k].net, pt.ins[pt.tk].net)) {
                const src = rootOf(nEv[pt.ins[k].net]);
                violation('hold', pt, 'Hold violation at ' + fmt(now) + ' ns: ' + sname(pt, k) + ' of ' + pt.label + ' changed at ' + fmt(now) + ' ns, on the ' + (pt.edge === 'rise' ? 'rising' : 'falling') + ' edge of ' + sname(pt, pt.tk) + ' itself, carrying a change launched by the same clock edge (' + src.net + ' at ' + fmt(src.t) + ' ns); it must stay steady ' + pt.th + ' ns after the edge.' + (pt.meta && opts.meta !== 'off' ? ' The output may go metastable.' : ''), { pin: pt.ins[k].name, edge: round(now), changed: round(now), need: pt.th, sameEdge: true });
                continue;
              }
              violation('setup', pt, 'Setup violation at ' + fmt(now) + ' ns: ' + sname(pt, k) + ' of ' + pt.label + ' changed at ' + fmt(ST[sd]) + ' ns, only ' + round(now - ST[sd]) + ' ns before the ' + (pt.edge === 'rise' ? 'rising' : 'falling') + ' edge of ' + sname(pt, pt.tk) + '; it must be steady ' + pt.tsu + ' ns before.' + (pt.meta && opts.meta !== 'off' ? ' The output may go metastable.' : ''), { pin: pt.ins[k].name, changed: round(ST[sd]), need: pt.tsu });
            }
          }
          pt.lastEdge = now;
          activeEdge = true;
        }
      }
      if (!activeEdge && pt.lastEdge > -Infinity) {
        for (const k of pt.tdata) {
          const sd = s0 + k;
          if (chg[k] && !SFX[sd] && now - pt.lastEdge < pt.th - eps) {
            holdBad = true;
            violation('hold', pt, 'Hold violation at ' + fmt(now) + ' ns: ' + sname(pt, k) + ' of ' + pt.label + ' changed ' + round(now - pt.lastEdge) + ' ns after the clock edge at ' + fmt(pt.lastEdge) + ' ns; it must stay steady ' + pt.th + ' ns after.' + (pt.meta && opts.meta !== 'off' ? ' The output may go metastable.' : ''), { pin: pt.ins[k].name, edge: round(pt.lastEdge), need: pt.th });
          }
        }
      }
      for (const a of pt.tasync) {
        const s = s0 + a.k;
        if (chg[a.k] && pt.tw > 0) {
          const was = code(SOA[s], SOB[s]), on = a.low ? 0 : 1;
          if (was === on && SPT[s] > -Infinity && !SPFX[s] && now - SPT[s] < pt.tw - eps) violation('pulse', pt, pt.label + ': the ' + sname(pt, a.k) + ' pulse lasts ' + round(now - SPT[s]) + ' ns; it must last at least ' + pt.tw + ' ns.', { pin: pt.ins[a.k].name, width: round(now - SPT[s]), need: pt.tw });
        }
      }
      // behaviour
      const st = pt.st, m = 0xFFFFFFFF;
      let forced = false, unc = 0, rest = null;
      for (const r of pt.trest) { const s = s0 + r.k; if (ST[s] === -Infinity && (SA[s] & SB[s] & 1)) (rest = rest || {})[r.k] = [r.v, 0]; }
      ovr = rest;
      if (sp.async) forced = sp.async(io, st);
      ovr = null;
      if (!forced && pt.ck >= 0 && chg[pt.ck]) {
        const s = s0 + pt.ck, from = code(SOA[s], SOB[s]), to = code(SA[s], SB[s]);
        const act = pt.edge === 'rise' ? from === 0 && to === 1 : from === 1 && to === 0;
        if (act && sp.edge) {
          if (pt.meta) pt.pre = clone(st);
          sp.edge(io, st);
          if (setupBad && pt.meta) {
            const alt = clone(pt.pre);
            ovr = {};
            for (const k of setupBad) ovr[k] = [SOA[s0 + k], SOB[s0 + k]];
            sp.edge(io, alt);
            ovr = null;
            unc = ((st.q ^ alt.q) | (alt.x & ~st.x)) & m;
          }
        } else if (!act && sp.edge && !(from === 2 && SPT[s] === -Infinity) && from !== to && (pt.edge === 'rise' ? from !== 1 && to !== 0 : from !== 0 && to !== 1)) {
          // the clock went to or from X: it may or may not have been an edge, so bits that would change are unknown
          const alt = clone(st);
          sp.edge(io, alt);
          st.x = (st.x | ((alt.q ^ st.q) | alt.x)) >>> 0;
        }
      }
      if (!forced && sp.level) {
        if (setupBad && pt.meta && !sp.edge) {
          // a latch closing too soon after D changed: it may hold the old value or the new one
          const alt = clone(st);
          ovr = rest; sp.level(io, st);
          ovr = Object.assign({}, rest);
          for (const k of setupBad) ovr[k] = [SOA[s0 + k], SOB[s0 + k]];
          ovr[pt.tk] = [SOA[s0 + pt.tk], SOB[s0 + pt.tk]];
          sp.level(io, alt);
          ovr = null;
          unc = ((st.q ^ alt.q) | (alt.x & ~st.x)) & m;
        } else { ovr = rest; sp.level(io, st); ovr = null; }
      }
      if (holdBad && pt.meta && !forced) {
        let alt;
        if (sp.edge && pt.pre) { alt = clone(pt.pre); sp.edge(io, alt); } else if (!sp.edge && sp.level) {
          // a latch that has just closed: it may still have taken the new D
          alt = clone(st);
          ovr = {}; ovr[pt.tk] = pt.edge === 'fall' ? [1, 0] : [0, 0];
          sp.level(io, alt);
          ovr = null;
        }
        if (alt) unc |= ((st.q ^ alt.q) | (alt.x & ~st.x)) & m;
      }
      if (unc && opts.meta !== 'off') {
        st.x = (st.x | unc) >>> 0;
        if (opts.meta === 'resolve') {
          const e = new Q(round(now + Math.max(pt.lh, pt.hl) + pt.tres), 0, TIMER, -1, 0, 0);
          e.part = pt.idx; e.tag = 'meta'; e.bits = unc >>> 0; e.act = true;
          hpush(e); active++;
        }
      }
      if (sp.out) sp.out(io, st);
    }
    function runTimer(e) {
      const pt = parts[e.part];
      if (pt.chip && pt.unp) return;
      bind(pt); curBy = null;
      if (e.tag === 'meta') {
        const st = pt.st, bits = (e.bits & st.x) >>> 0;
        if (!bits) return;
        const r = Math.floor(rnd() * 4294967296);
        st.q = ((st.q & ~bits) | (r & bits)) >>> 0;
        st.x = (st.x & ~bits) >>> 0;
        curWhy = 'meta'; forceDelay = 0;
        pt.spec.out(io, st);
        forceDelay = -1; curWhy = 'eval';
        return;
      }
      curWhy = pt.type === 'CLOCK' ? 'clock' : 'timer';
      pt.spec.timer(io, pt.st, e.tag);
      curWhy = 'eval';
    }

    // ---- stepping -------------------------------------------------------------------------------------------
    function evalPhase() {
      ops++;
      const list = evalList;
      evalList = evalSpare; evalList.length = 0; evalSpare = list;
      epoch = ++maxEpoch;
      for (let i = 0; i < list.length; i++) evalPart(parts[list[i]]);
      list.length = 0;
    }
    function breakLoop() {
      // nets still changing after maxDelta delta cycles at one time: a zero-delay loop. Set them to X.
      const recent = new Set();
      for (let i = events.length - 1; i >= 0 && events[i].t === now && recent.size < 64; i--) recent.add(events[i].ni);
      for (const e of heap) if (!e.dead && e.k === DRIVE && e.t === now) { recent.add(dNet[e.d]); kill(e); }
      for (let d = 0; d < ND; d++) dPend[d] = dPend[d].filter((e) => !e.dead);
      violation('loop', null, 'A loop with no delay kept changing at ' + fmt(now) + ' ns after ' + opts.maxDelta + ' delta cycles (' + [...recent].slice(0, 8).map((n) => nName[n]).join(', ') + '); those nets are set to X.', { nets: [...recent].map((n) => nName[n]) });
      loopBase = delta;
      for (const n of recent) for (const d of nDrv[n]) { const m = nMask[n]; DA[d] = m; DB[d] = m; }
      for (const n of recent) { const m = nMask[n]; if (NA[n] !== m || NB[n] !== m) { const q = new Q(now, delta, DRIVE, nDrv[n][0] === undefined ? -1 : nDrv[n][0], m, m); q.why = 'loop'; change(n, m, m, q); } }
    }
    /** one primitive step: an evaluation phase or one queued event. Returns the change event, null, or undefined when idle */
    function op() {
      while (redoJ < setLog.length && setLog[redoJ].ops <= ops) applyLogged(setLog[redoJ++]);
      const top = peek();
      if (evalList.length && (!top || top.t !== now || top.dl !== delta)) { evalPhase(); return null; }
      if (!top) return undefined;
      if (top.t > now) {
        if (count - lastSnapCount >= opts.snapEvery) { if (snaps[snaps.length - 1].ops < ops) snapshot(true); else lastSnapCount = count; }
        now = top.t; delta = 0; loopBase = 0;
      }
      const e = hpop();
      ops++;
      if (e.dl > delta) delta = e.dl;
      if (e.act) active--;
      if (delta - loopBase > opts.maxDelta) { breakLoop(); return null; }
      if (e.k === TIMER) { runTimer(e); return null; }
      return apply(e);
    }

    // ---- snapshots and rewind -------------------------------------------------------------------------------
    let lastSnapCount = 0;
    function snapshot(auto) {
      const s = {
        now, delta, seq, ops, count, active, rngS, loopBase,
        NA: NA.slice(), NB: NB.slice(), DA: DA.slice(), DB: DB.slice(), nCont: nCont.slice(),
        SA: SA.slice(), SB: SB.slice(), ST: ST.slice(), SPT: SPT.slice(), SOA: SOA.slice(), SOB: SOB.slice(), SFX: SFX.slice(), SPFX: SPFX.slice(),
        heap: heap.filter((e) => !e.dead).map((e) => Object.assign(Object.create(Q.prototype), e)),
        parts: parts.map((pt) => [clone(pt.st), pt.lastEdge, pt.pre ? clone(pt.pre) : null, pt.unp, pt.floatRep]),
        chips: C.chips.map((c) => c.reported),
        ev: events.length, vi: violations.length, sw: swallowed.length, log: setLog.length, evalList: evalList.slice(), trig: evalList.map((r) => trigBy[r]),
      };
      if (auto) {
        snaps.push(s); lastSnapCount = count;
        if (snaps.length > 400) snaps = snaps.filter((x, i) => i === 0 || i % 2 === 1 || i === snaps.length - 1);
      }
      return s;
    }
    function restore(s) {
      now = s.now; delta = s.delta; seq = s.seq; ops = s.ops; count = s.count; active = s.active; rngS = s.rngS; loopBase = s.loopBase;
      NA.set(s.NA); NB.set(s.NB); DA.set(s.DA); DB.set(s.DB); nCont.set(s.nCont); nEv.fill(null);
      SA.set(s.SA); SB.set(s.SB); ST.set(s.ST); SPT.set(s.SPT); SOA.set(s.SOA); SOB.set(s.SOB); SFX.set(s.SFX); SPFX.set(s.SPFX);
      heap = s.heap.map((e) => Object.assign(Object.create(Q.prototype), e)).sort((x, y) => (less(x, y) ? -1 : 1));
      for (const p of dPend) p.length = 0;
      for (const e of heap) if (e.k === DRIVE && e.d >= 0) dPend[e.d].push(e);
      parts.forEach((pt, i) => { const r = s.parts[i]; pt.st = clone(r[0]); pt.lastEdge = r[1]; pt.pre = clone(r[2]); pt.unp = r[3]; pt.floatRep = r[4]; });
      C.chips.forEach((c, i) => { c.reported = s.chips[i]; });
      evalList.length = 0; epoch = ++maxEpoch;
      s.evalList.forEach((r, i) => { evalList.push(r); mark[r] = epoch; trigBy[r] = s.trig[i]; });
      events.length = Math.min(events.length, s.ev); violations.length = s.vi; swallowed.length = s.sw;
      for (let i = 0; i < wArr.length; i++) { const a = wArr[i], st = wStamp[i]; while (st.length && st[st.length - 1] > s.count) { st.pop(); a.pop(); } }
      lastSnapCount = count;
    }
    // After going back, the inputs logged later are replayed at the same moments (redoJ is the next one), so
    // the run can be scrubbed back and forth; a new input given meanwhile ends that future (diverge).
    let redoJ = 0;
    const redoDue = () => redoJ < setLog.length && setLog[redoJ].ops <= ops;
    function diverge() {
      if (redoJ >= setLog.length) return;
      const keep = new Set(setLog.slice(0, redoJ));
      setLog.length = redoJ;
      snaps = snaps.filter((x) => x.ops <= ops);
      for (let i = stimulus.length - 1; i >= 0; i--) if (!keep.has(stimulus[i])) stimulus.splice(i, 1);
    }
    const log = (l) => { diverge(); setLog.push(l); redoJ = setLog.length; return l; };
    function applyLogged(l) {
      if (l.t > now) { now = l.t; delta = 0; loopBase = 0; }
      if (l.kind === 'set') { loopBase = delta; doSet(l.name, l.value); }
      else if (l.kind === 'at') doAt(l.at, l.name, l.value);
      else if (l.kind === 'state') doState(partOf(l.id), l.value);
      else if (l.kind === 'deposit') { const n = netIndex(l.name), [a, b] = V.fromPub(l.value, nW[n]); doDeposit(n, a, b); }
    }

    // ---- inputs ---------------------------------------------------------------------------------------------
    const sourceOf = (name) => {
      const pt = parts.find((x) => x.kind === 'source' && x.type !== 'CLOCK' && !x.id.includes('/') && (x.p.name === name || x.id === name)) || parts.find((x) => x.kind === 'source' && (x.p.name === name || x.id === name));
      if (!pt) throw new Error('no input named ' + name);
      return pt;
    };
    function doSet(name, value) {
      const pt = sourceOf(name);
      bind(pt); curBy = null;
      if (pt.spec.press) { curWhy = 'press'; const v = V.fromPub(value, 1); pt.spec.press(io, pt.st, v[1] ? 0 : v[0] & 1, rnd); curWhy = 'eval'; return; }
      const o = pt.outs[0], [a, b] = V.fromPub(value, o.width);
      curWhy = 'set';
      schedule(pt.outD[o.name], a, b, 0, false);
      curWhy = 'eval';
    }
    function doDeposit(n, a, b) {
      curBy = null; curWhy = 'deposit';
      for (const d of nDrv[n]) { if (dPart[d] >= 0) cur = parts[dPart[d]]; schedule(d, a, b, 0, true); }
      curWhy = 'eval';
    }
    const partOf = (id) => {
      const pt = parts.find((x) => x.id === id);
      if (!pt || !pt.st || typeof pt.st.q !== 'number' || typeof pt.st.x !== 'number' || pt.st.ma || !pt.spec.out) throw new Error(id + ' is not a storage part whose state can be set');
      return pt;
    };
    function doState(pt, value) {
      const st = pt.st, w = pt.p.w || 1, [a, b] = V.fromPub(value, w);
      st.q = (a & ~b & mask(w)) >>> 0; st.x = (b & mask(w)) >>> 0;
      if ('both' in st) st.both = 0;
      if ('wq' in st) st.wq = -1;
      bind(pt); curBy = null; curWhy = 'state'; forceDelay = 0;
      pt.spec.out(io, st);
      forceDelay = -1; curWhy = 'eval';
    }
    function doAt(t, name, value) {
      const pt = sourceOf(name);
      if (t < now) throw new Error('cannot schedule ' + name + ' at ' + t + ' ns: the time is already ' + now + ' ns');
      bind(pt); curBy = null; curWhy = 'at';
      const o = pt.outs[0], [a, b] = V.fromPub(value, o.width);
      schedule(pt.outD[o.name], a, b, round(t - now), false);
      curWhy = 'eval';
    }

    // ---- start ----------------------------------------------------------------------------------------------
    for (let i = 0; i < NN; i++) { const m = nMask[i]; NA[i] = nDrv[i].length ? m : 0; NB[i] = m; }
    for (let d = 0; d < ND; d++) { const m = nMask[dNet[d]]; DA[d] = m; DB[d] = m; }
    for (const d of pullD) { DA[d] = nMask[dNet[d]]; DB[d] = 0; }
    for (let i = 0; i < NN; i++) if (nDrv[i].some((d) => dPart[d] < 0)) { resolve(i); NA[i] = rA; NB[i] = rB; }
    for (const pt of parts) { pt.st = pt.isSeq || pt.spec.init ? initState(pt) : {}; for (let k = 0; k < pt.nIn; k++) { const s = pt.slot0 + k, n = pt.ins[k].net; SA[s] = NA[n]; SB[s] = NB[n]; ST[s] = -Infinity; SPT[s] = -Infinity; SFX[s] = 1; SPFX[s] = 1; } }
    // waves
    const recordSet = opts.record ? new Set(opts.record.map((n) => (names.has(n) ? names.get(n) : -1))) : null;
    for (let i = 0; i < NN; i++) {
      if (recordSet && !recordSet.has(i)) { wNet.push(-1); continue; }
      wNet.push(wArr.length);
      const arr = [[0, V.toPub(NA[i], NB[i], nW[i])]];
      wArr.push(arr); wStamp.push([0]);
      waves.set(nName[i], arr);
    }
    function start() {
      for (const pt of parts) {
        if (pt.spec.start) { bind(pt); curWhy = 'start'; curBy = null; pt.spec.start(io, pt.st); curWhy = 'eval'; } else if (pt.kind !== 'sink') { mark[pt.idx] = epoch; evalList.push(pt.idx); }
      }
    }
    start();
    snaps.push(snapshot(false));
    const stimulus = [];

    // ---- the public object ----------------------------------------------------------------------------------
    const netIndex = (name) => {
      if (typeof name === 'number') return name;
      if (names.has(name)) return names.get(name);
      throw new Error('no net or port named ' + name);
    };
    function stepTo(t) {
      for (;;) {
        if (redoDue()) { if (setLog[redoJ].t > t) break; applyLogged(setLog[redoJ++]); continue; }
        const top = peek();
        if (!evalList.length && (!top || top.t > t)) break;
        if (op() === undefined) break;
      }
      if (t > now) { now = round(t); delta = 0; loopBase = 0; }
      return sim;
    }
    function checkPower() { for (const pt of parts) if (pt.chip && pt.unp) powerNote(pt); }
    const sim = {
      circuit, tech, compiled: C, waves, events, violations, swallowed,
      get time() { return now; },
      get delta() { return delta; },
      get count() { return count; },
      get pending() { return heap.filter((e) => !e.dead).length; },
      /** set an input (by its name) now: a bit, a number, an array of bits or a bit string */
      set(name, value) { log({ ops, t: now, kind: 'set', name, value }); loopBase = delta; doSet(name, value); return sim; },
      /** schedule an input change at an absolute time */
      at(t, name, value) { stimulus.push(log({ ops, t: now, kind: 'at', at: t, name, value })); doAt(t, name, value); return sim; },
      /** a pattern on an input: values (an array, or a string of 0/1/X/Z characters) one every period ns */
      pattern(name, values, o) {
        o = o || {};
        const list = typeof values === 'string' ? values.split('') : values, per = o.period || (mainClock ? mainClock.period : 10), t0 = o.start === undefined ? now : o.start;
        for (let r = 0; r < (o.repeat || 1); r++) list.forEach((v, i) => sim.at(round(t0 + (r * list.length + i) * per), name, v));
        return sim;
      },
      /** apply a list of {t, name, value} */
      stimulus(list) { for (const s of list) sim.at(s.t, s.name, s.value); return sim; },
      clearStimulus() { stimulus.length = 0; for (const e of heap) if (!e.dead && e.why === 'at') kill(e); for (let d = 0; d < ND; d++) dPend[d] = dPend[d].filter((e) => !e.dead); return sim; },
      /** put a value on a net now, as if its drivers had produced it; loops (latches) then hold it */
      deposit(name, value) {
        const n = netIndex(name), [a, b] = V.fromPub(value, nW[n]);
        log({ ops, t: now, kind: 'deposit', name, value });
        doDeposit(n, a, b);
        return sim;
      },
      /**
       * give a storage part (by id) a state now: a number, 'X' or bits; its outputs follow at once. Set at time 0,
       * before anything else, it becomes the starting state that reset() goes back to.
       */
      setState(id, value) {
        const pt = partOf(id);
        log({ ops, t: now, kind: 'state', id, value });
        doState(pt, value);
        stepTo(now);
        if (now === 0 && setLog.every((l) => l.kind === 'state')) { setLog.length = 0; redoJ = 0; snaps = [snapshot(false)]; }
        return sim;
      },
      get(name) { const n = netIndex(name); return V.toPub(NA[n], NB[n], nW[n]); },
      num(name) { const n = netIndex(name); return NB[n] ? null : NA[n]; },
      str(name, radix) { return V.str(sim.get(name), radix); },
      width(name) { return nW[netIndex(name)]; },
      has(name) { return names.has(name); },
      nets() { return nets.map((n, i) => ({ name: n.name, width: n.width, drivers: nDrv[i].length, readers: nRd[i].length })); },
      part(id) { const pt = parts.find((x) => x.id === id); return pt ? { id: pt.id, type: pt.type, label: pt.label, params: pt.p, state: pt.st, powered: pt.chip ? !pt.unp : true } : null; },
      /** what a display part shows: a 7-segment display's lit segments, a hex display's digit, an LED's state */
      display(id) {
        const pt = parts.find((x) => x.id === id);
        if (!pt) return null;
        const val = (k) => { const n = pt.ins[pt.inIdx[k]].net; return V.toPub(NA[n], NB[n], nW[n]); };
        if (pt.type === 'SEG7') { const on = pt.p.common === 'anode' ? 0 : 1; const segs = 'abcdefg'.split('').filter((s) => val(s) === on).join(''); const code = 'abcdefg'.split('').reduce((m, s, i) => m | (val(s) === on ? 1 << i : 0), 0); const digit = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F, 0x77, 0x7C, 0x39, 0x5E, 0x79, 0x71].indexOf(code); const alt = { 0x7C: 6, 0x67: 9, 0x7D: 6, 0x6F: 9 }; return { segments: segs, code, digit: digit >= 0 ? digit.toString(16).toUpperCase() : alt[code] !== undefined ? String(alt[code]) : null }; }
        if (pt.type === 'HEX') { const v = V.toNum(val('d')); return { digit: v === null ? 'X' : v.toString(16).toUpperCase() }; }
        if (pt.type === 'LED') { const v = val('a'); return { lit: v === (pt.p.activeLow ? 0 : 1), value: v }; }
        if (pt.type === 'PROBE') return { value: val('a') };
        return null;
      },
      /** one event: runs until one wire changes, and returns that change (null when nothing is left) */
      stepEvent() { for (;;) { const r = op(); if (r) return r; if (r === undefined) return null; } },
      stepTo,
      run(ns) { return stepTo(now + ns); },
      /** run until nothing but clocks and scheduled stimulus is left (at most limit ns) */
      settle(limit) {
        const end = now + (limit === undefined ? 10000 : limit);
        for (;;) {
          const top = peek();
          if (!evalList.length && (active <= 0 || !top || top.t > end)) break;
          if (op() === undefined) break;
        }
        return sim;
      },
      /** run to the next rising edge of the main clock and let the circuit settle before the next clock change */
      clockEdge() {
        if (!mainClock) {
          const clk = ['CLK', 'clk', 'Clk', 'CLOCK'].find((n) => parts.some((x) => x.kind === 'source' && x.p.name === n));
          if (!clk) throw new Error('the circuit has no clock');
          sim.set(clk, 0); sim.settle(); sim.set(clk, 1); sim.settle();
          return now;
        }
        const n = mainClock.outs[0].net;
        let guard = 0, edge = now;
        for (;;) {
          const r = op();
          if (r === undefined) break;
          if (r && r.ni === n && (r.a & 1) && !(r.b & 1) && !(r.fa & 1)) { edge = now; break; }
          if (++guard > 50000000) throw new Error('no clock edge');
        }
        for (;;) {
          const top = peek();
          if (!evalList.length && (!top || (top.k === TIMER && top.part === mainClock.idx))) {
            // wait at the next clock change, so inputs set now meet setup and hold for the next edge
            if (top && top.t > now) { now = top.t; delta = 0; loopBase = 0; }
            break;
          }
          if (op() === undefined) break;
        }
        return edge;
      },
      /** back to time 0 with the starting state; scheduled stimulus (at, pattern) is kept */
      reset() {
        restore(snaps[0]);
        snaps = [snaps[0]];
        setLog.length = 0; redoJ = 0;
        events.length = 0; violations.length = 0; swallowed.length = 0;
        const st = stimulus.splice(0);
        for (const l of st) sim.at(l.at, l.name, l.value);
        stepTo(0); checkPower();
        return sim;
      },
      /** a copy of the whole state, for restore() */
      snapshot() { return snapshot(false); },
      restore(s) { restore(s); redoJ = Math.min(s.log, setLog.length); return sim; },
      /** go back to the state at time t (after everything at t), replaying from the nearest snapshot */
      rewind(t) {
        let k = snaps.length - 1;
        while (k > 0 && snaps[k].now > t) k--;
        const s = snaps[k];
        restore(s); redoJ = s.log;
        return stepTo(t);
      },
      /** undo the last n wire changes */
      back(n) {
        const target = Math.max(0, count - (n || 1));
        let k = snaps.length - 1;
        while (k > 0 && snaps[k].count > target) k--;
        const s = snaps[k];
        restore(s); redoJ = s.log;
        while (count < target) if (op() === undefined) break;
        return sim;
      },
      on(kind, fn) {
        if (typeof kind === 'function') { fn = kind; kind = 'change'; }
        const list = kind === 'violation' ? vListeners : listeners;
        list.push(fn);
        return () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
      },
      /** the delays and timing the simulator uses for a part */
      timing(id) { const pt = parts.find((x) => x.id === id); return pt ? { tpLH: pt.lh, tpHL: pt.hl, tsu: pt.tsu, th: pt.th, tw: pt.tw, tres: pt.tres } : null; },
    };
    stepTo(0);
    checkPower();
    return sim;
  }
  Sim.create = create;
})(globalThis.Sirkit = globalThis.Sirkit || {});
