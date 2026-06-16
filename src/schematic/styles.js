// Layout styles: the idioms a drafter uses for each kind of structure. A style places the parts and draws the
// wires that make the idiom (literal rails, product rows, the X of a latch, a row of bit slices, a bus line);
// whatever it leaves undrawn goes to the maze router, and a circuit no style fits goes to the general column
// layout. A circuit may ask for a style (circuit.style, with circuit.hints); otherwise one is picked by its
// structure. Every style returns the same plan the general layout does, so the same checks hold.
(function (S) {
  'use strict';
  const St = S.Styles = {};
  const Sym = S.Symbols, Nl = S.Netlist;
  const styles = {};
  St.styles = styles;

  // ---- a sheet: parts placed on the grid, wires drawn by hand ---------------------------------------------------
  function sheet(circuit, name) {
    const parts = circuit.parts, P = parts.length;
    const pidx = new Map(parts.map((p, i) => [p, i]));
    const pinDef = (r) => r.part.pins.find((q) => q.name === r.pin);
    const nets = circuit.nets.filter((n) => n.pins.length >= 2).map((n, i) => {
      const drv = n.pins.find((r) => pinDef(r).dir === 'out');
      return { i, net: n, drv, sinks: n.pins.filter((r) => r !== drv) };
    });
    const nix = new Map(nets.map((n) => [n.net, n.i]));
    const geo = parts.map((p) => Sym.geom(p));
    const X = new Int32Array(P), Y = new Int32Array(P), placed = new Uint8Array(P);
    const pre = nets.map(() => []), rails = nets.map(() => []);
    const sh = {
      parts, nets, geo, X, Y, pidx, name, pre, rails,
      put(part, x, y, g) { const i = pidx.get(part); if (g) geo[i] = g; X[i] = x; Y[i] = y; placed[i] = 1; },
      placed: (part) => !!placed[pidx.get(part)],
      g: (part) => geo[pidx.get(part)],
      /** where a pin is: {x, y, side} */
      at(part, pin) { const i = pidx.get(part), q = geo[i].pins[pin]; return { x: X[i] + q.x, y: Y[i] + q.y, side: q.side }; },
      net(part, pin) { const n = part.net[pin]; return n ? nix.get(n) : undefined; },
      /** a polyline of a net (points [x, y]); rail marks it as a rail */
      line(ni, pts, rail) {
        if (ni == null) return;
        for (let k = 1; k < pts.length; k++) {
          const [x1, y1] = pts[k - 1], [x2, y2] = pts[k];
          if (x1 === x2 && y1 === y2) continue;
          if (x1 !== x2 && y1 !== y2) throw new Error(name + ': a diagonal wire');
          if (![x1, y1, x2, y2].every(Number.isInteger)) throw new Error(name + ': a wire off the grid');
          pre[ni].push([x1, y1, x2, y2]);
          if (rail) rails[ni].push([x1, y1, x2, y2]);
        }
      },
      plan(title) {
        for (let i = 0; i < P; i++) if (!placed[i]) throw new Error(name + ': ' + parts[i].id + ' was not placed');
        return { parts, geo, nets, X, Y, phys: parts.map(() => null), fbNet: new Set(), attached: new Map(), pre, rails, title, style: name, noEdges: true };
      },
    };
    return sh;
  }
  St.sheet = sheet;

  // what drives a pin, and what a part's output drives
  const driverOf = (part, pin) => { const n = part.net[pin]; return n ? n.pins.find((r) => r.part.pins.find((q) => q.name === r.pin).dir === 'out') : null; };
  const sinksOf = (part, pin) => { const n = part.net[pin || 'y']; return n ? n.pins.filter((r) => r.part.pins.find((q) => q.name === r.pin).dir === 'in') : []; };
  const inPins = (part) => part.pins.filter((q) => q.dir === 'in').map((q) => q.name);
  const key = (r) => r.part.id + '.' + r.pin;
  St.driverOf = driverOf; St.sinksOf = sinksOf;

  // ---- literal rails: two-level and multi-output logic --------------------------------------------------------
  // Each input runs down a vertical rail from the top, its complement down the next rail from an inverter at
  // the head of it; the first-level gates stand in one column, every input a straight tap off its rail; the
  // second-level gates are stretched so their inputs meet the first-level outputs on their own rows. When
  // first-level gates are shared between outputs, their outputs run on as product rows above a row of
  // second-level gates turned to face down, each input a straight drop from its row (an AND-OR array).
  /** the structure of a two-level circuit, or null. opts.state: flip-flop outputs that feed the logic as rails */
  function twoLevel(c, opts) {
    opts = opts || {};
    const gates = c.parts.filter((p) => Nl.GATES.has(p.type));
    const terminal = (r) => !Nl.GATES.has(r.part.type);
    const rails = new Map(); // key of a driving pin → {kind, part, pin, src}
    // every input is a rail, in order; one the logic does not use stands at the head of a rail that never runs
    for (const p of c.parts) if (p.type === 'IN' && !(opts.skip && opts.skip.has(p))) rails.set(key({ part: p, pin: 'y' }), { kind: 'in', part: p, pin: 'y', unused: !sinksOf(p).length });
    // a constant that feeds gates stands at the head of a rail like an input
    for (const p of c.parts) if (p.type === 'CONST' && sinksOf(p).some((r) => Nl.GATES.has(r.part.type))) rails.set(key({ part: p, pin: 'y' }), { kind: 'in', part: p, pin: 'y', konst: true });
    for (const r of opts.state || []) rails.set(key(r), { kind: 'state', part: r.part, pin: r.pin });
    const isRail = (r) => r && rails.has(key(r));
    for (const g of gates) if (g.type === 'NOT') { const d = driverOf(g, 'i0'); if (isRail(d) && rails.get(key(d)).kind !== 'not') rails.set(key({ part: g, pin: 'y' }), { kind: 'not', part: g, pin: 'y', src: d }); }
    const role = new Map();
    for (const g of gates) if (rails.has(g.id + '.y')) role.set(g, 'not');
    const final = (g) => sinksOf(g).length && sinksOf(g).every(terminal);
    // XOR and XNOR of literals that feed other gates become rails of their own; then the first level (gates of
    // rails), then the second (gates of the first level and of rails, driving only outputs)
    let moved = true;
    while (moved) {
      moved = false;
      for (const g of gates) {
        if (role.has(g) || (g.type !== 'XOR' && g.type !== 'XNOR') || final(g)) continue;
        if (!inPins(g).every((p) => isRail(driverOf(g, p)))) continue;
        role.set(g, 'railgate'); rails.set(g.id + '.y', { kind: 'gate', part: g, pin: 'y' }); moved = true;
      }
    }
    for (const g of gates) if (!role.has(g) && inPins(g).every((p) => isRail(driverOf(g, p)))) role.set(g, 'product');
    for (const g of gates) {
      if (role.has(g)) continue;
      if (!final(g)) return null;
      if (!inPins(g).every((p) => { const d = driverOf(g, p); return d && (isRail(d) || role.get(d.part) === 'product'); })) return null;
      role.set(g, 'sum');
    }
    // a first-level gate of the same kind as the second level, driving an output (C = A + B' beside sums of
    // products), stands with the second level, its literals running to it on rows of their own
    const sumTypes = new Set([...role].filter(([, r]) => r === 'sum').map(([g]) => g.type));
    for (const [g, r] of [...role]) if (r === 'product' && sumTypes.has(g.type) && final(g) && sinksOf(g).every((x) => x.part.type === 'OUT')) role.set(g, 'sum');
    for (const [g, r] of role) {
      if (r === 'product' && !sinksOf(g).every((s) => terminal(s) || role.get(s.part) === 'sum')) return null;
      if (r === 'railgate' && !sinksOf(g).every((s) => role.get(s.part) === 'product' || role.get(s.part) === 'railgate')) return null;
    }
    // other parts: ports, constants that tie an output (or a flip-flop input) off, and (for a state machine)
    // flip-flops
    if (c.parts.some((p) => !Nl.GATES.has(p.type) && !['IN', 'OUT', 'CLOCK', 'CONST'].includes(p.type) && !opts.allow)) return null;
    if (c.parts.some((p) => p.type === 'CONST' && !rails.has(p.id + '.y') && !sinksOf(p).every(terminal))) return null;
    const products = gates.filter((g) => role.get(g) === 'product'), sums = gates.filter((g) => role.get(g) === 'sum');
    // no first level at all: outputs straight from literals or constants (F = A', F = 1)
    if (!products.length && !c.parts.some((p) => p.type === 'OUT' || Nl.isSequential(p))) return null;
    const usedBy = (g) => sinksOf(g).filter((r) => role.get(r.part) === 'sum').map((r) => r.part);
    const shared = products.some((g) => new Set(usedBy(g)).size > 1);
    return { rails, role, products, sums, shared, isRail };
  }
  St.twoLevel = twoLevel;

  /**
   * Lay out the literal rails and the product column. Returns the rows and positions later stages use.
   * o: { x0 (left edge), y0 (top), skip (parts placed by someone else) }
   */
  function railsAndProducts(sh, c, T, o) {
    o = o || {};
    const { rails, role, products, isRail } = T;
    const used = (r) => sinksOf(r.part, r.pin).length > 0;
    // inputs that feed one first-level gate only, and are never inverted, come straight in from the left
    const direct = new Set();
    for (const [k, r] of rails) {
      if (r.kind !== 'in' || o.noDirect) continue;
      const s = sinksOf(r.part, r.pin);
      if (s.length === 1 && role.get(s[0].part) === 'product') direct.add(k);
    }
    // the order of the rows of the product column: by the outputs they serve, in the order of the outputs
    const outs = c.parts.filter((p) => p.type === 'OUT');
    const order = [];
    const seen = new Set();
    const addProduct = (g) => { if (!seen.has(g)) { seen.add(g); order.push({ kind: 'gate', part: g }); } };
    const passRows = new Map(); // rail key (+ sum, when grouped) → item
    for (const cons of (o.consumers || outs.map((p) => driverOf(p, 'a')))) {
      if (!cons) continue;
      const g = cons.part;
      if (isRail(cons)) { const k = key(cons) + '|' + (cons.tag || 'direct'); if (!passRows.has(k)) { const it = { kind: 'pass', src: cons, sum: null, tag: cons.tag || null }; passRows.set(k, it); order.push(it); } continue; }
      if (role.get(g) === 'product') addProduct(g);
      else if (role.get(g) === 'sum') {
        for (const p of inPins(g)) {
          const d = driverOf(g, p);
          if (role.get(d.part) === 'product') addProduct(d.part);
          else {
            const k = key(d) + (T.shared ? '' : '|' + g.id);
            if (!passRows.has(k)) { const it = { kind: 'pass', src: d, sum: g }; passRows.set(k, it); order.push(it); }
          }
        }
      }
    }
    for (const g of products) addProduct(g);
    // the families of rails, left to right: an input, then its complement
    const fam = [];
    const notOf = new Map();
    for (const [, r] of rails) if (r.kind === 'not') notOf.set(key(r.src), r);
    if (o.stateOrder) for (const [k, r] of [...rails]) if (r.kind === 'state') { rails.delete(k); }
    if (o.stateOrder) for (const r of o.stateOrder) rails.set(key(r), { kind: 'state', part: r.part, pin: r.pin });
    for (const [k, r] of rails) if (r.kind === 'in' || r.kind === 'state') if (!direct.has(k) || notOf.has(k)) fam.push({ r, comp: notOf.get(k) || null, trueUsed: sinksOf(r.part, r.pin).some((s) => s.part.type !== 'NOT' || !notOf.has(k)) && sinksOf(r.part, r.pin).filter((s) => s.part !== (notOf.get(k) || {}).part).length > 0 });
    const railX = new Map(), railTop = new Map();
    const directs = [...direct].map((k) => rails.get(k));
    const dW = directs.length ? Math.max(...directs.map((r) => sh.g(r.part).w)) : 0;
    let x = (o.x0 || 0) + (dW ? dW + 4 : 0), lastRight = -Infinity;
    const yN = (o.y0 || 0) + 5; // the row of the inverters
    const anyNot = fam.some((f) => f.comp);
    for (const f of fam) {
      const src = f.r.part;
      let xr = x;
      if (f.r.kind === 'in') {
        const w = sh.g(src).w;
        xr = Math.max(xr, Math.ceil(lastRight + 3 + w / 2));
        const g = Sym.variant(src, { orient: 'down' });
        sh.put(src, xr - g.pins.y.x, (o.y0 || 0) + 3 - g.pins.y.y, g);
        lastRight = xr - g.w / 2 + g.w;
      }
      f.x = xr;
      const k = key(f.r);
      railX.set(k, xr); railTop.set(k, f.r.kind === 'in' ? (o.y0 || 0) + 3 : (o.stateTop ? o.stateTop.get(k) : null));
      if (f.comp) {
        const n = f.comp.part;
        sh.put(n, xr + 3, yN - 1);
        railX.set(key(f.comp), xr + 8); railTop.set(key(f.comp), yN);
        x = xr + 12;
        lastRight = Math.max(lastRight, xr + 8);
      } else x = xr + 4;
    }
    // gates whose output is itself a rail (an XNOR of two inputs, say), below the inverters
    let yG = anyNot ? yN + 4 : (o.y0 || 0) + 6;
    const railGates = [...rails.values()].filter((r) => r.kind === 'gate');
    for (const r of railGates) {
      const g = r.part, gg = sh.g(g);
      sh.put(g, x + 2, yG);
      const out = sh.at(g, 'y');
      railX.set(key(r), out.x + 2); railTop.set(key(r), out.y);
      x = out.x + 6;
      yG += gg.h + 3;
    }
    // the product column
    const xP = x + 1;
    let y = Math.max(yG, anyNot ? yN + 4 : (o.y0 || 0) + 6) + (railGates.length ? 1 : 0);
    const rowOf = new Map(); // product or pass item → row of its output
    const directPorts = [];
    for (const it of order) {
      if (it.kind === 'gate') {
        // a gate fed straight from two or more input ports spreads its inputs, so the ports stand apart
        const nd = inPins(it.part).filter((p) => direct.has(key(driverOf(it.part, p)))).length;
        if (nd >= 2) {
          const gv = Sym.variant(it.part, { inRows: inPins(it.part).map((p, k) => y + 1 + 3 * k) });
          sh.put(it.part, xP, gv.top, gv);
          it.row = sh.at(it.part, 'y').y;
          y = gv.top + gv.h + 2;
          continue;
        }
        sh.put(it.part, xP, y);
        rowOf.set(it, sh.at(it.part, 'y').y);
        it.row = rowOf.get(it);
        y += sh.g(it.part).h + 2;
      } else { it.row = y + 1; y += 3; }
    }
    const xEnd = xP + Math.max(0, ...order.filter((it) => it.kind === 'gate').map((it) => sh.g(it.part).w));
    // taps: every input of a first-level gate (and of a rail gate) off its rail; direct inputs from the left
    const lowest = new Map();
    const reach = (k, yy) => lowest.set(k, Math.max(lowest.get(k) == null ? -Infinity : lowest.get(k), yy));
    const tapping = products.concat(railGates.map((r) => r.part));
    for (const g of tapping) for (const p of inPins(g)) {
      const d = driverOf(g, p), k = key(d), at = sh.at(g, p);
      if (direct.has(k)) {
        const port = d.part;
        sh.put(port, (o.x0 || 0) + dW - sh.g(port).w, at.y - 1);
        sh.line(sh.net(g, p), [[(o.x0 || 0) + dW, at.y], [at.x, at.y]]);
        directPorts.push(port);
        continue;
      }
      if (!railX.has(k)) throw new Error('rails: no rail for ' + k);
      sh.line(sh.net(g, p), [[railX.get(k), at.y], [at.x, at.y]]);
      reach(k, at.y);
    }
    for (const it of order) if (it.kind === 'pass') reach(key(it.src), it.row);
    // inverter feeds, and the rails themselves
    for (const f of fam) {
      const k = key(f.r), ni = sh.net(f.r.part, f.r.pin);
      if (f.comp) {
        const n = f.comp.part, inp = sh.at(n, 'i0'), outp = sh.at(n, 'y'), kc = key(f.comp), nc = sh.net(n, 'y');
        if (f.r.kind === 'in') sh.line(ni, [[f.x, railTop.get(k)], [f.x, inp.y]]);
        sh.line(ni, [[f.x, inp.y], [inp.x, inp.y]]);
        sh.line(nc, [[outp.x, outp.y], [railX.get(kc), outp.y]]);
        if (lowest.has(kc)) sh.line(nc, [[railX.get(kc), outp.y], [railX.get(kc), lowest.get(kc)]], true);
      }
      if (lowest.has(k)) {
        const top = f.comp ? sh.at(f.comp.part, 'i0').y : railTop.get(k);
        if (f.r.kind === 'in' && top > railTop.get(k) && !f.comp) sh.line(ni, [[f.x, railTop.get(k)], [f.x, top]]);
        if (f.r.kind === 'in' && !f.comp) sh.line(ni, [[f.x, railTop.get(k)], [f.x, lowest.get(k)]], true);
        else if (f.r.kind === 'in') sh.line(ni, [[f.x, top], [f.x, lowest.get(k)]], true);
        else sh.line(ni, [[f.x, railTop.get(k) == null ? top : railTop.get(k)], [f.x, lowest.get(k)]], true);
      }
    }
    for (const r of railGates) {
      const k = key(r), out = sh.at(r.part, 'y'), ni = sh.net(r.part, 'y');
      sh.line(ni, [[out.x, out.y], [railX.get(k), out.y]]);
      if (lowest.has(k)) sh.line(ni, [[railX.get(k), out.y], [railX.get(k), lowest.get(k)]], true);
    }
    return { order, rowOf, xP, xEnd, yEnd: y, railX, railTop, fam, direct, lowest, rails };
  }
  St.railsAndProducts = railsAndProducts;

  /** the second level: stretched gates beside the product column (grouped), or an AND-OR array */
  function sums(sh, c, T, R, o) {
    o = o || {};
    const { role } = T;
    const outs = c.parts.filter((p) => p.type === 'OUT');
    const srcRow = (d, g) => {
      if (role.get(d.part) === 'product') return R.order.find((it) => it.kind === 'gate' && it.part === d.part).row;
      const it = R.order.find((q) => q.kind === 'pass' && key(q.src) === key(d) && (T.shared || q.sum === g));
      return it.row;
    };
    const passFrom = (it) => {
      // a literal straight to the second level: off its rail, through its slot in the product column
      const k = key(it.src), xr = R.railX.get(k);
      return [xr, it.row];
    };
    const outCons = o.consumers || outs.map((p) => ({ port: p, d: driverOf(p, 'a') }));
    if (!T.shared) {
      const xS = R.xEnd + 4;
      let xO = xS;
      const placedOut = [];
      for (const { d } of outCons) {
        if (!d || role.get(d.part) !== 'sum' || sh.placed(d.part)) continue;
        const g = d.part, pins = inPins(g);
        const rows = pins.map((p) => srcRow(driverOf(g, p), g));
        const gv = Sym.variant(g, { inRows: rows });
        sh.put(g, xS, gv.top, gv);
        xO = Math.max(xO, xS + gv.w + 4);
        pins.forEach((p, k) => {
          const dd = driverOf(g, p), at = sh.at(g, p);
          if (role.get(dd.part) === 'product') { const o2 = sh.at(dd.part, 'y'); sh.line(sh.net(g, p), [[o2.x, o2.y], [at.x, at.y]]); }
          else { const it = R.order.find((q) => q.kind === 'pass' && key(q.src) === key(dd) && q.sum === g); sh.line(sh.net(g, p), [passFrom(it), [at.x, at.y]]); }
        });
      }
      xO = Math.max(xO, R.xEnd + 4);
      let yC = null;
      if (!o.noPorts) for (const { port, d } of outCons) {
        if (!port || !d) continue;
        if (d.part.type === 'CONST') {
          // a constant output: the constant beside its port, in a row below the logic
          if (yC === null) { yC = R.yEnd; sh.parts.forEach((p, i) => { if (sh.placed(p)) yC = Math.max(yC, sh.Y[i] + sh.geo[i].h); }); yC += 2; }
          if (!sh.placed(d.part)) sh.put(d.part, xO - 4, yC);
          sh.put(port, xO, yC);
          sh.line(sh.net(port, 'a'), [[xO - 2, yC + 1], [xO, yC + 1]]);
          yC += 3;
          continue;
        }
        let from = sh.at(d.part, d.pin);
        // a literal straight to an output: off its rail on its own row
        if (T.isRail(d)) { const it = R.order.find((q) => q.kind === 'pass' && key(q.src) === key(d) && !q.sum); if (it) { const [x, y] = passFrom(it); from = { x, y }; } }
        sh.put(port, xO, from.y - 1);
        sh.line(sh.net(port, 'a'), [[from.x, from.y], [xO, from.y]]);
      }
      return { xRight: xO };
    }
    // an AND-OR array: product rows run right; each second-level gate faces down below them, its inputs dropping
    // straight from the rows they take, its output straight down to its port
    let xa = R.xEnd + 4;
    const yA = R.yEnd + 2;
    const rowEnd = new Map();
    let maxH = 0;
    const ors = [];
    const lanes = new Map();
    for (const { d } of outCons) {
      if (!d || d.part.type === 'CONST') continue;
      if (role.get(d.part) !== 'sum') {
        // a single term: its row runs on to a lane of its own, and drops to its port
        const rk = key(d);
        lanes.set(rk, xa + 1);
        rowEnd.set(rk, Math.max(rowEnd.get(rk) || -Infinity, xa + 1));
        xa += 5;
        continue;
      }
      const g = d.part, gv = Sym.variant(g, { orient: 'down' });
      sh.put(g, xa, yA, gv);
      ors.push(g);
      maxH = Math.max(maxH, gv.h);
      // the leftmost input takes the highest row, so the drops nest
      const pins = inPins(g).slice().sort((a, b) => sh.at(g, a).x - sh.at(g, b).x);
      const srcs = inPins(g).map((p) => ({ d: driverOf(g, p), row: srcRow(driverOf(g, p), g) })).sort((a, b) => a.row - b.row);
      // the pins are matched to the rows in order (the gate is commutative): the netlist follows the drawing
      pins.forEach((p, k) => { if (key(driverOf(g, p)) !== key(srcs[k].d)) relink(g, p, srcs[k].d); });
      pins.forEach((p, k) => {
        const at = sh.at(g, p), s = srcs[k];
        sh.line(sh.net(g, p), [[at.x, at.y], [at.x, s.row]]);
        const rk = key(s.d);
        rowEnd.set(rk, Math.max(rowEnd.get(rk) || -Infinity, at.x));
      });
      xa += gv.w + 3;
    }
    // the rows themselves
    for (const it of R.order) {
      const rk = it.kind === 'gate' ? key({ part: it.part, pin: 'y' }) : key(it.src);
      if (!rowEnd.has(rk)) continue;
      const from = it.kind === 'gate' ? [sh.at(it.part, 'y').x, it.row] : passFrom(it);
      const ni = it.kind === 'gate' ? sh.net(it.part, 'y') : sh.net(it.src.part, it.src.pin);
      sh.line(ni, [from, [rowEnd.get(rk), it.row]], true);
    }
    // outputs, in a row below
    const yO = yA + maxH + 3;
    if (!o.noPorts) for (const { port, d } of outCons) {
      if (!port || !d) continue;
      if (d.part.type === 'CONST') {
        // a constant output: the constant standing on its port
        const gp = Sym.variant(port, { orient: 'down' });
        if (!sh.placed(d.part)) sh.put(d.part, xa, yO - 3, Sym.variant(d.part, { orient: 'down' }));
        sh.put(port, xa + 1 - gp.w / 2, yO, gp);
        sh.line(sh.net(port, 'a'), [[xa + 1, yO - 1], [xa + 1, yO]]);
        xa += Math.max(4, gp.w + 1);
        continue;
      }
      let from = sh.at(d.part, d.pin);
      if (lanes.has(key(d))) {
        const it = R.order.find((q) => (q.kind === 'gate' && q.part === d.part) || (q.kind === 'pass' && key(q.src) === key(d)));
        from = { x: lanes.get(key(d)), y: it.row };
      }
      const gp = Sym.variant(port, { orient: 'down' });
      sh.put(port, from.x - gp.w / 2, yO, gp);
      sh.line(sh.net(port, 'a'), [[from.x, from.y], [from.x, yO]]);
    }
    return { xRight: xa };
  }
  St.sums = sums;
  // swap which net feeds a commutative gate's pin (both pins of one gate; the function is unchanged)
  function relink(g, pin, want) {
    const other = inPins(g).find((p) => { const d = driverOf(g, p); return d && key(d) === key(want); });
    if (!other || other === pin) return;
    const a = g.net[pin], b = g.net[other];
    const ra = a.pins.find((r) => r.part === g && r.pin === pin), rb = b.pins.find((r) => r.part === g && r.pin === other);
    ra.pin = other; rb.pin = pin;
    g.net[pin] = b; g.net[other] = a;
  }

  styles.rails = function (c) {
    const T = twoLevel(c);
    if (!T) return null;
    const sh = sheet(c, 'rails');
    const R = railsAndProducts(sh, c, T, {});
    sums(sh, c, T, R, {});
    return sh.plan(c.title);
  };

  // does a new wire (net ni) run along, or touch, a wire of another net already drawn?
  function clash(sh, ni, a) {
    return sh.pre.some((list, k) => k !== ni && list.some((b) => {
      const ah = a[1] === a[3], bh = b[1] === b[3];
      const [ax1, ax2, ay1, ay2] = [Math.min(a[0], a[2]), Math.max(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[1], a[3])];
      const [bx1, bx2, by1, by2] = [Math.min(b[0], b[2]), Math.max(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[1], b[3])];
      if (ah && bh) return ay1 === by1 && ax1 <= bx2 && bx1 <= ax2;
      if (!ah && !bh) return ax1 === bx1 && ay1 <= by2 && by1 <= ay2;
      const [hx1, hx2, hy] = ah ? [ax1, ax2, ay1] : [bx1, bx2, by1], [vx, vy1, vy2] = ah ? [bx1, by1, by2] : [ax1, ay1, ay2];
      if (vx < hx1 || vx > hx2 || hy < vy1 || hy > vy2) return false;
      return vx === hx1 || vx === hx2 || hy === vy1 || hy === vy2;
    }));
  }
  /** does a wire pass through a placed part (other than at the pins it ends on)? */
  function throughPart(sh, a) {
    const [x1, x2, y1, y2] = [Math.min(a[0], a[2]), Math.max(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[1], a[3])];
    return sh.parts.some((p, i) => {
      if (!sh.placed(p)) return false;
      const bx = sh.X[i], by = sh.Y[i], g = sh.geo[i];
      return y1 === y2 ? y1 > by && y1 < by + g.h && x1 < bx + g.w && x2 > bx : x1 > bx && x1 < bx + g.w && y1 < by + g.h && y2 > by;
    });
  }
  /**
   * A tap off a horizontal rail at row yr into a pin: straight if the pin faces the rail, otherwise up (or down)
   * a lane beside the pin and in. Returns the segments, or null.
   */
  function tap(sh, ni, yr, at) {
    if ((at.side === 'bottom' && yr > at.y) || (at.side === 'top' && yr < at.y)) return [[at.x, yr, at.x, at.y]];
    const dir = at.side === 'right' ? 1 : -1;
    for (let d = 3; d <= 9; d++) {
      const xt = at.x + dir * d, cand = [[xt, yr, xt, at.y], [xt, at.y, at.x, at.y]];
      if (!cand.some((c) => clash(sh, ni, c) || throughPart(sh, c))) return cand;
    }
    return null;
  }
  St.tap = tap;

  // two pins that face each other on one line, with nothing between, are joined by a straight wire (a chain
  // between slices, a gate into the flip-flop below it)
  function straightJoins(sh) {
    for (const n of sh.nets) {
      if (sh.pre[n.i].length) continue;
      const ps = [n.drv].concat(n.sinks).map((r) => sh.at(r.part, r.pin));
      const d = ps[0];
      for (const q of ps.slice(1)) {
        const horiz = d.y === q.y && ((d.side === 'right' && q.side === 'left' && q.x > d.x) || (d.side === 'left' && q.side === 'right' && q.x < d.x));
        const vert = d.x === q.x && ((d.side === 'bottom' && q.side === 'top' && q.y > d.y) || (d.side === 'top' && q.side === 'bottom' && q.y < d.y));
        if (!horiz && !vert) continue;
        const seg = [d.x, d.y, q.x, q.y];
        if (clash(sh, n.i, seg) || throughPart(sh, seg)) continue;
        sh.line(n.i, [[d.x, d.y], [q.x, q.y]]);
      }
    }
  }
  St.straightJoins = straightJoins;

  // ---- bit slices -------------------------------------------------------------------------------------------
  // The slices of a register, an adder or a counter in one row; data in from the top, results out at the
  // bottom, the chain (carry, serial data, ripple clock) between neighbours; clock, load, mode and clear as
  // horizontal rails with straight taps. The circuit says what a slice is (hints.slices: one {role: part} per
  // slice, in drawing order) and where each role sits in it (hints.place: {role: {dx, dy, opts}}).
  styles.slices = function (c) {
    const H = c.hints || {};
    if (!H.slices || !H.place) return null;
    const sh = sheet(c, 'slices');
    const pitch = H.pitch;
    H.slices.forEach((sl, k) => {
      for (const [role, part] of Object.entries(sl)) {
        if (!part) continue;
        const t = H.place[role];
        const g = t.opts ? Sym.variant(part, t.opts) : Sym.geom(part);
        sh.put(part, k * pitch + t.dx, t.dy + (t.align ? 0 : 0), g);
      }
    });
    if (H.extra) H.extra(sh, { variant: Sym.variant });
    let top = Infinity, bottom = -Infinity, left = Infinity;
    c.parts.forEach((p, i) => { if (sh.placed(p) && p.type !== 'IN' && p.type !== 'OUT' && p.type !== 'CLOCK' && p.type !== 'CONST') { top = Math.min(top, sh.Y[i]); bottom = Math.max(bottom, sh.Y[i] + sh.geo[i].h); left = Math.min(left, sh.X[i]); } });
    // control rails, nearest first: below (or above) the slices, each fed from its port at the left
    const below = (H.rails || []).filter((r) => r.at !== 'top'), above = (H.rails || []).filter((r) => r.at === 'top');
    const railRow = new Map();
    below.forEach((r, k) => railRow.set(r.port, bottom + 3 + 3 * k));
    above.forEach((r, k) => railRow.set(r.port, top - 3 - 3 * k));
    const topPin = top - 3 - 3 * above.length - 3;
    const outRow = bottom + 3 + 3 * below.length + 2;
    for (const r of below.concat(above)) {
      const port = r.port, yr = railRow.get(port), g = sh.g(port);
      const x0 = (r.x0 != null ? r.x0 : left - 6);
      sh.put(port, x0 - g.w, yr - g.pins.y.y);
      const ni = sh.net(port, 'y');
      let x1 = x0;
      for (const s0 of sinksOf(port)) {
        const segs = tap(sh, ni, yr, sh.at(s0.part, s0.pin));
        if (!segs) continue;
        for (const q of segs) sh.line(ni, [[q[0], q[1]], [q[2], q[3]]]);
        x1 = Math.max(x1, segs[0][0]);
      }
      sh.line(ni, [[x0, yr], [x1, yr]], true);
    }
    // data from the top: each input above the pin it feeds
    for (const port of H.top || []) {
      const s0 = sinksOf(port)[0], at = sh.at(s0.part, s0.pin), g = Sym.variant(port, { orient: 'down' }), ni = sh.net(port, 'y');
      const x = at.side === 'top' ? at.x : at.x - 3;
      sh.put(port, x - g.w / 2, topPin - 3, g);
      sh.line(ni, at.side === 'top' ? [[x, topPin], [x, at.y]] : [[x, topPin], [x, at.y], [at.x, at.y]]);
    }
    // results to the bottom: each output below what drives it
    for (const port of H.bottom || []) {
      const d = driverOf(port, 'a'), at = sh.at(d.part, d.pin), g = Sym.variant(port, { orient: 'down' }), ni = sh.net(port, 'a');
      const x = at.side === 'bottom' ? at.x : at.x + (at.side === 'left' ? -2 : 2);
      sh.put(port, x - g.w / 2, outRow, g);
      sh.line(ni, at.side === 'bottom' ? [[x, at.y], [x, outRow]] : [[at.x, at.y], [x, at.y], [x, outRow]]);
    }
    if (H.after) H.after(sh, { variant: Sym.variant, tap, driverOf, sinksOf, top, bottom, left, topPin, outRow });
    straightJoins(sh);
    return sh.plan(c.title);
  };

  // ---- state machines -----------------------------------------------------------------------------------------
  // The next-state logic as rails (inputs from the top, state from the flip-flops), one block of logic per
  // flip-flop input in order (so the J and K of a flip-flop come from neighbouring gates), the flip-flops in a
  // column at the right with each input straight from its logic or down a lane of its own, the clock a vertical
  // rail beside them, a reset input a second rail tapping each flip-flop's clear (or preset), a constant input a
  // tie-off right at its pin, and every Q and Q' returning to its rail over the top in a lane of its own (the
  // lowest output to the leftmost rail, so the returns never cross).
  const FF_DATA = { DFF: ['d'], TFF: ['t'], JKFF: ['j', 'k'], SRFF: ['s', 'r'] };
  const ASYNC = ['set', 'rst', 'RST'];
  const isClockPin = (q) => q.clock || q.name === 'clk' || q.name === 'CLK';
  // the inputs of a state element that its logic drives: a flip-flop's, or a sequence counter block's
  const dataPins = (f) => FF_DATA[f.type] || (f.type === 'BLOCK' ? f.pins.filter((q) => q.dir === 'in' && !isClockPin(q) && !ASYNC.includes(q.name)).map((q) => q.name) : null);
  const clockPin = (f) => f.pins.find(isClockPin).name;
  St.dataPins = dataPins;
  /**
   * The state elements of a state machine (flip-flops, or a sequence counter block), a decoder of the flip-flops'
   * outputs, its clock and reset, and the state signals that feed the logic; or null
   */
  function fsmParts(c) {
    let ffs = c.parts.filter((p) => Nl.isSequential(p));
    if (!ffs.length || ffs.some((f) => !dataPins(f) || !f.pins.some(isClockPin))) return null;
    let reset = null, clock = null;
    for (const f of ffs) for (const q of f.pins) {
      if (q.dir !== 'in' || dataPins(f).includes(q.name) || !f.net[q.name]) continue;
      const d = driverOf(f, q.name);
      if (!d) return null;
      if (isClockPin(q)) { if (!['CLOCK', 'IN'].includes(d.part.type) || (clock && clock !== d.part)) return null; clock = d.part; continue; }
      if (ASYNC.includes(q.name)) { if (d.part.type !== 'IN' || (reset && reset !== d.part)) return null; reset = d.part; continue; }
      return null;
    }
    if (!clock) return null;
    if (!sinksOf(clock).every((r) => Nl.isSequential(r.part) && isClockPin(r.part.pins.find((q) => q.name === r.pin)))) return null;
    if (reset && !sinksOf(reset).every((r) => Nl.isSequential(r.part) && ASYNC.includes(r.pin))) return null;
    // a constant ties off one flip-flop input
    if (c.parts.some((p) => p.type === 'CONST' && sinksOf(p).some((r) => Nl.isSequential(r.part)) && sinksOf(p).length > 1)) return null;
    // a decoder of the flip-flops' outputs: its outputs are the state signals, its inputs in order from the top
    const decs = c.parts.filter((p) => p.type === 'DECODER');
    if (decs.length > 1) return null;
    const dec = decs[0] || null;
    if (dec) {
      for (const q of dec.pins) {
        if (q.dir !== 'in' || !dec.net[q.name]) continue;
        const d = driverOf(dec, q.name);
        if (!/^a\d+$/.test(q.name) || !d || !FF_DATA[d.part.type] || d.pin !== 'q' || sinksOf(d.part, 'q').length !== 1) return null;
      }
      const order = (f) => { const r = f.net.q && sinksOf(f, 'q').find((x) => x.part === dec); return r ? +r.pin.slice(1) : -1; };
      if (ffs.some((f) => order(f) < 0)) return null;
      ffs = ffs.slice().sort((a, b) => order(a) - order(b));
    }
    const logic = (r) => Nl.GATES.has(r.part.type) || r.part.type === 'OUT' || (Nl.isSequential(r.part) && dataPins(r.part).includes(r.pin));
    const used = [];
    for (const f of ffs) for (const q of f.pins) if (q.dir === 'out' && f.net[q.name] && sinksOf(f, q.name).some(logic)) used.push({ part: f, pin: q.name });
    if (dec && used.length) return null;
    if (dec) for (const q of dec.pins) if (q.dir === 'out' && dec.net[q.name] && sinksOf(dec, q.name).some(logic)) used.push({ part: dec, pin: q.name });
    const stateOrder = used.slice().reverse();
    const T = twoLevel(c, { state: stateOrder, allow: true, skip: new Set([reset, clock].filter(Boolean)) });
    if (!T || T.shared) return null;
    return { ffs, dec, reset, clock, stateOrder, T };
  }
  styles.fsm = function (c, opts) {
    opts = opts || {};
    const M = fsmParts(c);
    if (!M) return null;
    const { ffs, dec, reset, clock, stateOrder, T } = M;
    const sh = sheet(c, 'fsm');
    const n = stateOrder.length;
    const stateTop = new Map(stateOrder.map((r, k) => [key(r), -3 - 2 * (n - 1 - k)]));
    // one wire per flip-flop input, in drawing order
    const wires = [];
    for (const f of ffs) for (const pin of dataPins(f)) { const d = driverOf(f, pin); if (d) wires.push({ f, pin, d }); }
    const cons = wires.map((w) => w.d).concat(c.parts.filter((p) => p.type === 'OUT').map((p) => driverOf(p, 'a')).filter((d) => d && (Nl.GATES.has(d.part.type) || d.part.type === 'IN')).map((d) => Object.assign({}, d, { tag: 'out' })));
    // a second output of the same state bit leaves from a row of its own, not from the foot of the rail
    const isState = (d) => stateOrder.some((r) => r.part === d.part && r.pin === d.pin);
    const footed = new Set(), dup = new Set();
    for (const p of c.parts.filter((q) => q.type === 'OUT')) { const d = driverOf(p, 'a'); if (d && isState(d)) { if (footed.has(key(d)) || opts.noFeet) { dup.add(p); cons.push(Object.assign({}, d, { tag: 'out' })); } else footed.add(key(d)); } }
    const R = railsAndProducts(sh, c, T, { consumers: cons, stateOrder, stateTop, noDirect: true });
    const S2 = sums(sh, c, T, R, { consumers: cons.map((d) => ({ port: null, d })), noPorts: true });
    const srcOf = (d) => {
      if (d.part.type === 'CONST') return null;
      if (T.isRail(d)) { const it = R.order.find((q) => q.kind === 'pass' && key(q.src) === key(d) && !q.sum && !q.tag); return it ? { x: R.railX.get(key(d)), y: it.row } : null; }
      if (!sh.placed(d.part)) return null;
      return sh.at(d.part, d.pin);
    };
    for (const w of wires) { w.src = srcOf(w.d); if (!w.src && w.d.part.type !== 'CONST') return null; }
    // the flip-flops, top to bottom, each where most of its inputs come straight in
    let lastBottom = -Infinity;
    const fy = new Map();
    for (const f of ffs) {
      const g = sh.g(f), ws = wires.filter((w) => w.f === f && w.src), lo = Math.max(lastBottom + 3, 0);
      let best = null;
      for (const y of ws.map((w) => w.src.y - g.pins[w.pin].y).concat([lo])) {
        if (y < lo) continue;
        const k = ws.filter((w) => w.src.y === y + g.pins[w.pin].y).length;
        if (!best || k > best.k || (k === best.k && y < best.y)) best = { y, k };
      }
      fy.set(f, best.y);
      lastBottom = best.y + g.h;
      for (const w of wires) if (w.f === f) w.t = best.y + g.pins[w.pin].y;
    }
    // the outputs of the logic: straight out at the right when they lie below the flip-flops, else each down a
    // lane of its own (the leftmost lanes, the upper output nearest the flip-flops) to a row below everything
    const late = [];
    for (const p of c.parts.filter((q) => q.type === 'OUT')) {
      const d = driverOf(p, 'a');
      if (!d || d.part.type === 'CONST' || ((isState(d) || Nl.isSequential(d.part)) && !dup.has(p))) continue;
      let from = null;
      if (T.isRail(d)) { const it = R.order.find((q) => q.kind === 'pass' && key(q.src) === key(d) && !q.sum && q.tag === 'out'); if (it) from = { x: R.railX.get(key(d)), y: it.row }; } else if (sh.placed(d.part)) from = sh.at(d.part, d.pin);
      if (!from) return null;
      late.push({ p, from });
    }
    late.sort((a, b) => a.from.y - b.from.y);
    let ffZone = -Infinity, partsBottom = -Infinity;
    for (const f of ffs) ffZone = Math.max(ffZone, fy.get(f) + sh.g(f).h + 1);
    c.parts.forEach((p, i) => { if (sh.placed(p)) partsBottom = Math.max(partsBottom, sh.Y[i] + sh.geo[i].h); });
    const laned = late.length && (late[0].from.y <= ffZone + 1 || late.some((o, k) => k && o.from.y - late[k - 1].from.y < 3)) ? late.length : 0;
    const yLow = Math.max(ffZone, partsBottom) + 2;
    late.forEach((o, k) => { if (laned) { o.lane = laned - 1 - k; o.y = yLow + 2 + 3 * k; } else o.y = o.from.y; });
    // lanes for the inputs that change rows: those going down nest from the right, those going up from the left
    const downs = wires.filter((w) => w.src && w.t > w.src.y), ups = wires.filter((w) => w.src && w.t < w.src.y);
    downs.forEach((w, k) => { w.lane = downs.length - 1 - k; });
    ups.forEach((w, k) => { w.lane = downs.length + k; });
    const nl = downs.length + ups.length, xL0 = S2.xRight + 2, xL = xL0 + 2 * laned;
    const xc = nl || laned ? xL + 2 * nl : S2.xRight + 1, xr = reset ? xc + 2 : null;
    const base = reset ? xr : xc, anyConst = wires.some((w) => w.d.part.type === 'CONST');
    const xCon = base + 2, xF = anyConst ? xCon + 5 : base + 4;
    for (const f of ffs) sh.put(f, xF, fy.get(f));
    for (const w of wires) {
      const at = sh.at(w.f, w.pin), ni = sh.net(w.f, w.pin);
      if (!w.src) { sh.put(w.d.part, xCon, at.y - 1); sh.line(ni, [[xCon + 2, at.y], [at.x, at.y]]); continue; }
      if (w.src.y === at.y) sh.line(ni, [[w.src.x, at.y], [at.x, at.y]]);
      else { const lx = xL + 2 * w.lane; sh.line(ni, [[w.src.x, w.src.y], [lx, w.src.y], [lx, at.y], [at.x, at.y]]); }
    }
    // a decoder right of the flip-flops, each Q into its input straight or down (or up) a lane of its own
    let xR = xF + Math.max(...ffs.map((f) => sh.g(f).w));
    if (dec) {
      const gd = sh.g(dec), qs = ffs.map((f) => ({ f, pin: sinksOf(f, 'q').find((r) => r.part === dec).pin, src: sh.at(f, 'q') }));
      const yD = Math.max(qs[0].src.y - gd.pins[qs[0].pin].y, Math.min(...ffs.map((f) => sh.Y[sh.pidx.get(f)])));
      qs.forEach((q) => { q.t = yD + gd.pins[q.pin].y; });
      const dn = qs.filter((q) => q.t > q.src.y), up = qs.filter((q) => q.t < q.src.y);
      dn.forEach((q, k) => { q.lane = dn.length - 1 - k; });
      up.forEach((q, k) => { q.lane = dn.length + k; });
      const xD = xR + 3 + 2 * (dn.length + up.length);
      sh.put(dec, xD, yD);
      for (const q of qs) {
        const ni = sh.net(q.f, 'q');
        if (q.t === q.src.y) sh.line(ni, [[q.src.x, q.t], [xD, q.t]]);
        else { const lx = xR + 2 + 2 * q.lane; sh.line(ni, [[q.src.x, q.src.y], [lx, q.src.y], [lx, q.t], [xD, q.t]]); }
      }
      xR = xD + gd.w;
    }
    // the returns: right of the state elements, up to a lane, along it to the rail
    stateOrder.forEach((r, k) => {
      const at = sh.at(r.part, r.pin), ni = sh.net(r.part, r.pin), xr2 = xR + 3 + 2 * (n - 1 - k), yl = stateTop.get(key(r));
      const rx = R.railX.get(key(r));
      sh.line(ni, [[at.x, at.y], [xr2, at.y], [xr2, yl], [rx, yl]]);
    });
    // outputs: a state output hangs at the foot of its own rail, in a row along the bottom (so it crosses no
    // return); a constant one stands with its constant at the right; any other at the right of its logic's row
    const xO = xR + 3 + 2 * n + 3;
    for (const o of late) {
      sh.put(o.p, xO, o.y - 1);
      const ni = sh.net(o.p, 'a');
      if (o.lane == null) sh.line(ni, [[o.from.x, o.from.y], [xO, o.from.y]]);
      else { const lx = xL0 + 2 * o.lane; sh.line(ni, [[o.from.x, o.from.y], [lx, o.from.y], [lx, o.y], [xO, o.y]]); }
    }
    let yFoot = -Infinity;
    const feet = [];
    c.parts.forEach((p, i) => { if (sh.placed(p)) yFoot = Math.max(yFoot, sh.Y[i] + sh.geo[i].h); });
    yFoot += 3;
    for (const p of c.parts.filter((q) => q.type === 'OUT')) {
      const d = driverOf(p, 'a');
      if (sh.placed(p)) continue;
      if (d.part.type === 'CONST') {
        sh.put(d.part, xO - 4, yFoot); sh.put(p, xO, yFoot);
        sh.line(sh.net(p, 'a'), [[xO - 2, yFoot + 1], [xO, yFoot + 1]]);
        yFoot += 3;
        continue;
      }
      const at = sh.at(d.part, d.pin);
      const k = stateOrder.findIndex((r) => r.part === d.part && r.pin === d.pin);
      if (k >= 0) {
        const rk = key(stateOrder[k]), rx = R.railX.get(rk), g = Sym.variant(p, { orient: 'down' });
        // feet too close to stand side by side: every state output leaves from a row of its own instead
        if (feet.some(([a, b]) => rx - g.w / 2 < b + 1 && rx + g.w / 2 > a - 1)) return opts.noFeet ? null : styles.fsm(c, { noFeet: true });
        feet.push([rx - g.w / 2, rx + g.w / 2]);
        const low = R.lowest.has(rk) ? R.lowest.get(rk) : stateTop.get(rk);
        sh.put(p, rx - g.w / 2, yFoot, g);
        sh.line(sh.net(p, 'a'), [[rx, low], [rx, yFoot - 3]], true);
        sh.line(sh.net(p, 'a'), [[rx, yFoot - 3], [rx, yFoot]]);
        continue;
      }
      // a flip-flop output that only leaves the circuit: straight out at the right
      sh.put(p, xO, at.y - 1);
      sh.line(sh.net(p, 'a'), [[at.x, at.y], [xO, at.y]]);
    }
    // the clock: a vertical rail beside the flip-flops, fed from below everything; a reset: a second rail, fed
    // from below the clock
    let yBottom = -Infinity;
    c.parts.forEach((p, i) => { if (sh.placed(p)) yBottom = Math.max(yBottom, sh.Y[i] + sh.geo[i].h); });
    const yb = yBottom + 3;
    {
      const ni = sh.net(clock, 'y'), gp = sh.g(clock);
      sh.put(clock, xc - 4 - gp.w, yb - 1);
      const rows = ffs.map((f) => sh.at(f, clockPin(f)).y);
      sh.line(ni, [[xc - 4, yb], [xc, yb]]);
      sh.line(ni, [[xc, yb], [xc, Math.min(...rows)]], true);
      for (const f of ffs) { const at = sh.at(f, clockPin(f)); sh.line(ni, [[xc, at.y], [at.x, at.y]]); }
    }
    if (reset) {
      const ni = sh.net(reset, 'y'), gp = sh.g(reset), yR = yb + 3;
      sh.put(reset, xr - 4 - gp.w, yR - 1);
      let top = yR;
      for (const f of ffs) for (const pin of ASYNC) {
        if (!f.net[pin]) continue;
        const at = sh.at(f, pin);
        if (at.side === 'left') { sh.line(ni, [[xr, at.y], [at.x, at.y]]); top = Math.min(top, at.y); continue; }
        const yt = at.side === 'bottom' ? at.y + 1 : at.y - 1;
        sh.line(ni, [[at.x, at.y], [at.x, yt], [xr, yt]]);
        top = Math.min(top, yt);
      }
      sh.line(ni, [[xr - 4, yR], [xr, yR]]);
      sh.line(ni, [[xr, yR], [xr, top]], true);
    }
    return sh.plan(c.title);
  };

  styles.fsm.test = (c) => !!fsmParts(c);

  // ---- a datapath: a register file on a bus ----------------------------------------------------------------
  // The registers in a column; the bus a real bus line across the top, from the source multiplexer to the bus
  // output, turning down beside the registers so each D taps it straight; the clock a rail beside them; the
  // write decoder as tall as the column, so each output runs straight across to its register's load input; the
  // read multiplexer as tall as the column, so each Q runs straight into it; every control entering from below,
  // right under what it controls. Roles come from hints: {regs, dec, rdmux, alu, busmux}.
  styles.datapath = function (c) {
    const H = c.hints || {};
    if (!H.regs || !H.dec || !H.rdmux || !H.alu || !H.busmux) return null;
    const sh = sheet(c, 'datapath');
    const { regs, dec, rdmux, alu, busmux, z } = H;
    const pitch = 12, xs = -9, xc = -5, yB = -9;
    regs.forEach((r, k) => sh.put(r, 0, pitch * k));
    const rw = sh.g(regs[0]).w;
    const at = (p, pin) => sh.at(p, pin);
    // the write decoder, a box of the usual height, centred on the load inputs; its outputs fan out to them
    // with one jog each, all in the one channel beside it
    const gd = Sym.variant(dec, { sides: { a0: 'bottom', a1: 'bottom', en: 'bottom' }, spread: 6 });
    const ldRows = regs.map((r) => at(r, 'ld').y);
    const outs = regs.map((r) => driverOf(r, 'ld').pin);
    const meanLd = ldRows.reduce((a2, b2) => a2 + b2, 0) / ldRows.length, meanOut = outs.reduce((a2, p) => a2 + gd.pins[p].y, 0) / outs.length;
    const decTop = Math.round(meanLd - meanOut), decX = xs - 8 - gd.w;
    sh.put(dec, decX, decTop, gd);
    const up = [], down = [];
    regs.forEach((r, k) => { const o = at(dec, outs[k]); (ldRows[k] < o.y ? up : ldRows[k] > o.y ? down : []).push(k); });
    const track = new Map();
    up.forEach((k, n) => track.set(k, decX + gd.w + 2 + 2 * n));
    down.slice().reverse().forEach((k, n) => track.set(k, decX + gd.w + 2 + 2 * n));
    regs.forEach((r, k) => {
      const o = at(dec, outs[k]), ld = at(r, 'ld'), ni = sh.net(r, 'ld');
      if (o.y === ld.y) sh.line(ni, [[o.x, o.y], [ld.x, ld.y]]);
      else { const x = track.get(k); sh.line(ni, [[o.x, o.y], [x, o.y], [x, ld.y], [ld.x, ld.y]]); }
    });
    // the source multiplexer, its output on the bus row
    const gm = sh.g(busmux);
    sh.put(busmux, xs - 7 - gm.w + 4, yB - gm.pins.y.y);
    // the read multiplexer, its inputs on the rows of the outputs, and the ALU straight after it, B on its top
    const qRows = inPins(rdmux).filter((p) => p.startsWith('d')).map((p) => at(driverOf(rdmux, p).part, 'q').y);
    const gr = Sym.variant(rdmux, { inRows: qRows });
    sh.put(rdmux, rw + 7, gr.top, gr);
    const ga = Sym.variant(alu, { sides: { b: 'top', op: 'bottom' } }), ry = at(rdmux, 'y');
    sh.put(alu, rw + 7 + gr.w + 7, ry.y - ga.pins.a.y, ga);
    // the result register after the ALU
    let gz = null;
    if (z) { gz = Sym.variant(z, { sides: { clock: 'bottom' } }); const ay = at(alu, 'y'); sh.put(z, ay.x + 6, ay.y - gz.pins.d.y, gz); }
    // controls from below, right under what they control
    let yLow = -Infinity;
    c.parts.forEach((p, i) => { if (sh.placed(p)) yLow = Math.max(yLow, sh.Y[i] + sh.geo[i].h); });
    const yClk = yLow + 3, yPorts = yLow + 6;
    const below = (part, pin, y) => {
      const d = driverOf(part, pin), p = d.part, a = at(part, pin), g = Sym.variant(p, { orient: 'up' });
      sh.put(p, a.x - g.w / 2, y, g);
      sh.line(sh.net(part, pin), [[a.x, y], [a.x, a.y]]);
      return p;
    };
    for (const pin of ['a0', 'a1', 'en']) below(dec, pin, decTop + gd.h + 3);
    below(rdmux, inPins(rdmux).find((p) => p.startsWith('s')), yPorts);
    below(alu, 'op', yPorts);
    below(busmux, inPins(busmux).find((p) => p.startsWith('s')), yB - gm.pins.y.y + gm.h + 3);
    // the bus: across the top, down beside the registers with a tap into each D, and one drop into the ALU's B
    const bm = at(busmux, 'y'), ni = sh.net(busmux, 'y');
    const busOut = sinksOf(busmux, 'y').find((r) => r.part.type === 'OUT');
    const bIn = at(alu, 'b'), xEnd = bIn.x + 5;
    sh.line(ni, [[bm.x, yB], [xEnd, yB]], true);
    sh.line(ni, [[bIn.x, yB], [bIn.x, bIn.y]]);
    const dRows = regs.map((r) => at(r, 'd').y);
    sh.line(ni, [[xs, yB], [xs, Math.max(...dRows)]], true);
    for (const r of regs) { const d = at(r, 'd'); sh.line(ni, [[xs, d.y], [d.x, d.y]]); }
    if (busOut) { const g = sh.g(busOut.part); sh.put(busOut.part, xEnd, yB - g.pins.a.y); }
    // the clock: a rail beside the registers, from its port below, running on along the bottom to Z
    const clk = driverOf(regs[0], 'clk').part, nc = sh.net(regs[0], 'clk');
    const gc = Sym.variant(clk, { orient: 'up' });
    sh.put(clk, xc - gc.w / 2, yPorts, gc);
    const cRows = regs.map((r) => at(r, 'clk').y);
    sh.line(nc, [[xc, yPorts], [xc, Math.min(...cRows)]], true);
    for (const r of regs) { const k = at(r, 'clk'); sh.line(nc, [[xc, k.y], [k.x, k.y]]); }
    if (z) { const k = at(z, 'clk'); sh.line(nc, [[xc, yClk], [k.x, yClk]], true); sh.line(nc, [[k.x, yClk], [k.x, k.y]]); }
    // straight across: each Q into the read multiplexer, its output into A, the ALU into Z
    for (const r of regs) { const q = at(r, 'q'), s0 = sinksOf(r, 'q')[0], i = at(s0.part, s0.pin); sh.line(sh.net(r, 'q'), [[q.x, q.y], [i.x, i.y]]); }
    sh.line(sh.net(alu, 'a'), [[ry.x, ry.y], [at(alu, 'a').x, ry.y]]);
    if (z) {
      const ay = at(alu, 'y'), zd = at(z, 'd');
      sh.line(sh.net(z, 'd'), [[ay.x, ay.y], [zd.x, zd.y]]);
      // Z back to the source multiplexer, over the top of the bus
      const zq = at(z, 'q'), d0 = at(busmux, 'd0'), yTop = yB - gm.pins.y.y - 3, xr = zq.x + 2, xl = d0.x - 3;
      sh.line(sh.net(z, 'q'), [[zq.x, zq.y], [xr, zq.y], [xr, yTop], [xl, yTop], [xl, d0.y], [d0.x, d0.y]]);
    }
    // data in beside the source multiplexer
    const din = driverOf(busmux, 'd1').part, gdin = sh.g(din), d1 = at(busmux, 'd1');
    sh.put(din, d1.x - 6 - gdin.w, d1.y - gdin.pins.y.y);
    sh.line(sh.net(busmux, 'd1'), [[d1.x - 6, d1.y], [d1.x, d1.y]]);
    return sh.plan(c.title);
  };

  // ---- a universal shift register ------------------------------------------------------------------------------
  // One slice per bit (bit 0 at the left): a 4:1 multiplexer and its flip-flop. Every multiplexer takes its
  // inputs from the left in one order: 0 its own Q (a short loop over the slice), 1 the left neighbour's Q (or
  // RI) dropping from the shift-right lane just above the slices, 2 the right neighbour's Q (or LI) rising from
  // the shift-left lane just below them, 3 its load input straight down from the top. The mode lines and the
  // clock are rails below the lanes; the outputs leave at the bottom. Hints: {muxes, ffs} (bit 0 first).
  styles.univ = function (c) {
    const H = c.hints || {};
    if (!H.muxes || !H.ffs) return null;
    const sh = sheet(c, 'univ');
    const { muxes, ffs } = H, n = muxes.length, pitch = 30;
    const ffSides = { clock: 'bottom' };
    muxes.forEach((m, i) => {
      const xm = i * pitch;
      sh.put(m, xm, 0);
      const g = Sym.variant(ffs[i], { sides: ffSides });
      sh.put(ffs[i], xm + 10, sh.at(m, 'y').y - g.pins.d.y, g);
    });
    const at = (p, pin) => sh.at(p, pin);
    const xd = (i, k) => i * pitch - [2, 4, 8, 6][k]; // the lane beside multiplexer i where input k comes down/up
    const xr = (i) => at(ffs[i], 'q').x + 2;
    const yH = -2, yR = -4, yL = (i) => 12 + 2 * (i % 2);
    const qd = (i) => driverOf(muxes[i], 'd0');
    // each multiplexer input, in from its lane
    const enter = (i, k, yFrom, rail) => { const a = at(muxes[i], 'd' + k), ni = sh.net(muxes[i], 'd' + k); sh.line(ni, [[xd(i, k), yFrom], [xd(i, k), a.y], [a.x, a.y]]); };
    const rows = (H.rails || []);
    const yRail = (k) => 18 + 3 * k, yOut = 18 + 3 * rows.length + 2;
    for (let i = 0; i < n; i++) {
      const q = at(ffs[i], 'q'), nq = sh.net(ffs[i], 'q'), x = xr(i);
      sh.line(nq, [[q.x, q.y], [x, q.y]]);
      // the hold loop
      sh.line(nq, [[x, q.y], [x, yH], [xd(i, 0), yH]]);
      enter(i, 0, yH);
      // shift right: up to the lane, along to the next slice, down into its input 1
      if (i + 1 < n) { sh.line(nq, [[x, yH], [x, yR]]); sh.line(nq, [[x, yR], [xd(i + 1, 1), yR]], true); enter(i + 1, 1, yR); }
      // shift left: down to the lane, back to the previous slice, up into its input 2
      if (i > 0) { sh.line(nq, [[x, q.y], [x, yL(i - 1)]]); sh.line(nq, [[x, yL(i - 1)], [xd(i - 1, 2), yL(i - 1)]], true); enter(i - 1, 2, yL(i - 1)); }
    }
    // the serial inputs at the ends of the lanes
    const ri = driverOf(muxes[0], 'd1').part, li = driverOf(muxes[n - 1], 'd2').part;
    const xRI = xd(0, 2) - 6;
    sh.put(ri, xRI - sh.g(ri).w, yR - 1);
    sh.line(sh.net(muxes[0], 'd1'), [[xRI, yR], [xd(0, 1), yR]], true); enter(0, 1, yR);
    const xLI = xr(n - 1) + 6, gl = Sym.variant(li, { orient: 'left' });
    sh.put(li, xLI, yL(n - 1) - 1, gl);
    sh.line(sh.net(muxes[n - 1], 'd2'), [[xLI, yL(n - 1)], [xd(n - 1, 2), yL(n - 1)]], true); enter(n - 1, 2, yL(n - 1));
    // the load inputs from the top
    for (let i = 0; i < n; i++) {
      const p = driverOf(muxes[i], 'd3').part, g = Sym.variant(p, { orient: 'down' }), x = xd(i, 3);
      sh.put(p, x - g.w / 2, yR - 7, g);
      const a = at(muxes[i], 'd3');
      sh.line(sh.net(muxes[i], 'd3'), [[x, yR - 4], [x, a.y], [a.x, a.y]]);
    }
    // the rails below, with straight taps
    rows.forEach((port, k) => {
      const y = yRail(k), ni = sh.net(port, 'y'), g = sh.g(port), x0 = xRI;
      sh.put(port, x0 - g.w, y - g.pins.y.y);
      let x1 = x0;
      for (const s0 of sinksOf(port)) { const a = at(s0.part, s0.pin); sh.line(ni, [[a.x, y], [a.x, a.y]]); x1 = Math.max(x1, a.x); }
      sh.line(ni, [[x0, y], [x1, y]], true);
    });
    // the outputs, straight down from each flip-flop's Q
    for (let i = 0; i < n; i++) {
      const port = sinksOf(ffs[i], 'q').find((r) => r.part.type === 'OUT').part, g = Sym.variant(port, { orient: 'down' });
      const x = xr(i), from = i > 0 ? yL(i - 1) : at(ffs[i], 'q').y;
      sh.put(port, x - g.w / 2, yOut, g);
      sh.line(sh.net(ffs[i], 'q'), [[x, from], [x, yOut]]);
    }
    return sh.plan(c.title);
  };

  // ---- a master-slave flip-flop from gates ------------------------------------------------------------------
  // Four columns, mirror-symmetric about the centre line: the input pair, the master latch (its X), the gating
  // pair, the slave latch (its X). The clock is a rail along the bottom into the input pair, with the inverter
  // on it and its output running on as a second rail into the gating pair; Q returns to the lower input gate on a
  // lane below everything, Q' to the upper one on a lane above everything. Hints: {g1, g2, m, mn, g3, g4, q, qn,
  // inv} (g1 takes J, g2 takes K, m and q are the upper gates of the latches).
  styles.msff = function (c) {
    const H = c.hints || {};
    const need = ['g1', 'g2', 'm', 'mn', 'g3', 'g4', 'q', 'qn', 'inv'];
    if (!need.every((k) => H[k])) return null;
    const sh = sheet(c, 'msff');
    const { g1, g2, m, mn, g3, g4, q, qn, inv } = H;
    const y = (p) => ({ part: p, pin: 'y' });
    const ext = (g, not) => { const d = inPins(g).map((p) => driverOf(g, p)).filter((d) => !not.includes(d.part)); return d; };
    const clk = driverOf(inv, 'i0');
    const jRef = ext(g1, [qn, clk.part])[0], kRef = ext(g2, [q, clk.part])[0];
    const set = (g, refs) => refs.forEach((r, k) => { if (key(driverOf(g, 'i' + k)) !== key(r)) relink(g, 'i' + k, r); });
    set(g1, [y(qn), jRef, clk]); set(g2, [clk, kRef, y(q)]);
    set(m, [y(g1), y(mn)]); set(mn, [y(m), y(g2)]);
    set(g3, [y(m), y(inv)]); set(g4, [y(inv), y(mn)]);
    set(q, [y(g3), y(qn)]); set(qn, [y(q), y(g4)]);
    const xG = 6, w3 = sh.g(g1).w, w2 = sh.g(m).w;
    sh.put(g1, xG, -12); sh.put(g2, xG, 6);
    const xM = xG + w3 + 7;
    sh.put(m, xM, -10); sh.put(mn, xM, 6);
    const xjM = xM + w2 + 2, xGt = xjM + 6;
    sh.put(g3, xGt, -9); sh.put(g4, xGt, 5);
    const xS = xGt + w2 + 7;
    sh.put(q, xS, -8); sh.put(qn, xS, 4);
    const xjS = xS + w2 + 2;
    const at = (p, pin) => sh.at(p, pin), net = (p, pin) => sh.net(p, pin);
    // a latch's X: each output straight on, a branch dropping (or rising) between the gates into the other gate
    const cross = (T, B, xj) => {
      const qt = at(T, 'y'), qb = at(B, 'y'), ti = at(T, 'i1'), bi = at(B, 'i0');
      const xa = bi.x - 3, xb = xa - 2;
      sh.line(net(T, 'y'), [[qt.x, qt.y], [xj, qt.y], [xj, -1], [xa, -1], [xa, bi.y], [bi.x, bi.y]]);
      sh.line(net(B, 'y'), [[qb.x, qb.y], [xj, qb.y], [xj, 1], [xb, 1], [xb, ti.y], [ti.x, ti.y]]);
    };
    cross(m, mn, xjM); cross(q, qn, xjS);
    const straight = (from, to, pin) => { const a = at(from, 'y'), b = at(to, pin); sh.line(net(to, pin), [[a.x, a.y], [b.x, b.y]]); };
    straight(g1, m, 'i0'); straight(g2, mn, 'i1');
    sh.line(net(g3, 'i0'), [[xjM, at(m, 'y').y], [at(g3, 'i0').x, at(g3, 'i0').y]]);
    sh.line(net(g4, 'i1'), [[xjM, at(mn, 'y').y], [at(g4, 'i1').x, at(g4, 'i1').y]]);
    straight(g3, q, 'i0'); straight(g4, qn, 'i1');
    // J and K straight in from the left
    for (const [g, r] of [[g1, jRef], [g2, kRef]]) { const a = at(g, 'i1'), gp = sh.g(r.part); sh.put(r.part, -gp.w, a.y - gp.pins.y.y); sh.line(net(g, 'i1'), [[0, a.y], [a.x, a.y]]); }
    // the clock rail, the inverter on it, the inverted clock rail
    const yR = 15, xL = -sh.g(jRef.part).w - 3;
    const ck = clk.part, gck = sh.g(ck), xc0 = xL - 4;
    sh.put(ck, xc0 - gck.w, yR - gck.pins.y.y);
    sh.put(inv, xM + 1, yR - 1);
    const ni = at(inv, 'i0'), no = at(inv, 'y'), nc = net(g1, 'i2');
    sh.line(nc, [[xc0, yR], [ni.x, yR]], true);
    sh.line(nc, [[xL, yR], [xL, at(g1, 'i2').y], [at(g1, 'i2').x, at(g1, 'i2').y]]);
    sh.line(nc, [[xL, at(g2, 'i0').y], [at(g2, 'i0').x, at(g2, 'i0').y]]);
    const xC2 = xGt - 3, nb = net(g3, 'i1');
    sh.line(nb, [[no.x, yR], [xC2, yR]], true);
    sh.line(nb, [[xC2, yR], [xC2, at(g3, 'i1').y], [at(g3, 'i1').x, at(g3, 'i1').y]]);
    sh.line(nb, [[xC2, at(g4, 'i0').y], [at(g4, 'i0').x, at(g4, 'i0').y]]);
    // outputs, and the returns on their lanes
    const xr1 = xjS + 2, xr2 = xjS + 4, xO = xjS + 8, yLow = yR + 3, yHigh = -15, xLane = xG - 3;
    for (const [g, xr, yl, tg, tp] of [[q, xr1, yLow, g2, 'i2'], [qn, xr2, yHigh, g1, 'i0']]) {
      const o = at(g, 'y'), ni2 = net(g, 'y'), t = at(tg, tp);
      const port = sinksOf(g).find((r) => r.part.type === 'OUT');
      if (port) { const gp = sh.g(port.part); sh.put(port.part, xO, o.y - gp.pins.a.y); }
      sh.line(ni2, [[xjS, o.y], [xO, o.y]]);
      sh.line(ni2, [[xr, o.y], [xr, yl]]);
      sh.line(ni2, [[xr, yl], [xLane, yl]], true);
      sh.line(ni2, [[xLane, yl], [xLane, t.y], [t.x, t.y]]);
    }
    return sh.plan(c.title);
  };

  // ---- trees: a balanced tree of two-input gates (a parity generator) --------------------------------------
  // The inputs along the top, each gate facing down and centred under the two signals it takes, the result
  // leaving at the bottom.
  function treeOf(c) {
    const gates = c.parts.filter((p) => Nl.GATES.has(p.type));
    const outs = c.parts.filter((p) => p.type === 'OUT'), ins = c.parts.filter((p) => p.type === 'IN');
    if (outs.length !== 1 || gates.length < 2 || gates.length + ins.length + 1 !== c.parts.length) return null;
    if (!gates.every((g) => inPins(g).length === 2 && Nl.COMMUTATIVE.has(g.type) && sinksOf(g).length === 1)) return null;
    if (!ins.every((p) => sinksOf(p).length === 1 && Nl.GATES.has(sinksOf(p)[0].part.type))) return null;
    const root = driverOf(outs[0], 'a');
    if (!root || !Nl.GATES.has(root.part.type)) return null;
    return { root: root.part, out: outs[0] };
  }
  styles.tree = function (c) {
    const T = treeOf(c);
    if (!T) return null;
    const sh = sheet(c, 'tree');
    const kids = (g) => inPins(g).map((p) => driverOf(g, p).part);
    const height = (p) => (Nl.GATES.has(p.type) ? 1 + Math.max(...kids(p).map(height)) : 0);
    const leaves = [];
    const walk = (p) => { if (Nl.GATES.has(p.type)) kids(p).forEach(walk); else leaves.push(p); };
    walk(T.root);
    const gh = Sym.variant(T.root, { orient: 'down' }).h;
    const pitch = 8;
    const outX = new Map();
    leaves.forEach((p, k) => { const g = Sym.variant(p, { orient: 'down' }); sh.put(p, pitch * k - g.w / 2, 0, g); outX.set(p, pitch * k); });
    const rowOf = (lvl) => 3 + 4 + (lvl - 1) * (gh + 5);
    const place = (g) => {
      const ks = kids(g);
      ks.forEach((k) => { if (Nl.GATES.has(k.type)) place(k); });
      const gv = Sym.variant(g, { orient: 'down' });
      const [l, r] = ks.slice().sort((a, b) => outX.get(a) - outX.get(b));
      const cx = Math.round((outX.get(l) + outX.get(r)) / 2);
      const pins = inPins(g).slice().sort((a, b) => gv.pins[a].x - gv.pins[b].x);
      const outPin = gv.pins.y;
      sh.put(g, cx - outPin.x, rowOf(height(g)), gv);
      outX.set(g, cx);
      // the left input takes the left signal
      if (driverOf(g, pins[0]).part !== l) relink(g, pins[0], { part: l, pin: 'y' });
      [[l, pins[0]], [r, pins[1]]].forEach(([k, p]) => {
        const from = sh.at(k, 'y'), to = sh.at(g, p), ni = sh.net(g, p);
        if (from.x === to.x) sh.line(ni, [[from.x, from.y], [to.x, to.y]]);
        else sh.line(ni, [[from.x, from.y], [from.x, to.y - 2], [to.x, to.y - 2], [to.x, to.y]]);
      });
    };
    place(T.root);
    const o = sh.at(T.root, 'y'), go = Sym.variant(T.out, { orient: 'down' });
    sh.put(T.out, o.x - go.w / 2, o.y + 3, go);
    sh.line(sh.net(T.out, 'a'), [[o.x, o.y], [o.x, o.y + 3]]);
    return sh.plan(c.title);
  };

  // ---- one block and its ports ----------------------------------------------------------------------------------
  // A single part (a register, a counter) with nothing but ports around it: each input straight into its pin
  // (from the left, or from above or below for a pin on the top or bottom), each output straight out at the right.
  function singleOf(c) {
    const ports = new Set(['IN', 'OUT', 'CLOCK', 'CONST']);
    const core = c.parts.filter((p) => !ports.has(p.type));
    if (core.length !== 1 || Nl.GATES.has(core[0].type)) return null;
    const b = core[0];
    for (const p of c.parts) {
      if (p === b) continue;
      const pin = p.type === 'OUT' ? 'a' : 'y', n = p.net[pin];
      if (!n) continue;
      if (n.pins.length !== 2 || !n.pins.some((r) => r.part === b)) return null;
    }
    return b;
  }
  styles.single = function (c) {
    const b = singleOf(c);
    if (!b) return null;
    const sh = sheet(c, 'single'), g = sh.g(b);
    const ports = c.parts.filter((p) => p !== b);
    const pinOf = (p) => { const n = p.net[p.type === 'OUT' ? 'a' : 'y']; return n ? n.pins.find((r) => r.part === b).pin : null; };
    let room = 0;
    for (const p of ports) { const q = pinOf(p); if (q && g.pins[q].side === 'left') room = Math.max(room, sh.g(p).w); }
    const x0 = room + 4, y0 = 8;
    sh.put(b, x0, y0);
    let free = y0 + g.h + 6;
    for (const p of ports) {
      const q = pinOf(p), ni = sh.net(p, p.type === 'OUT' ? 'a' : 'y');
      if (!q) { sh.put(p, 0, free); free += 3; continue; }
      const at = sh.at(b, q);
      if (at.side === 'left') { sh.put(p, x0 - 3 - sh.g(p).w, at.y - 1); sh.line(ni, [[x0 - 3, at.y], [at.x, at.y]]); }
      else if (at.side === 'right') { sh.put(p, at.x + 3, at.y - 1); sh.line(ni, [[at.x, at.y], [at.x + 3, at.y]]); }
      else if (at.side === 'top') { const gv = Sym.variant(p, { orient: 'down' }); sh.put(p, at.x - gv.pins[Object.keys(gv.pins)[0]].x, at.y - 3 - gv.h, gv); sh.line(ni, [[at.x, at.y - 3], [at.x, at.y]]); }
      else { const gv = Sym.variant(p, { orient: p.type === 'OUT' ? 'down' : 'up' }); if (p.type === 'OUT') return null; sh.put(p, at.x - gv.pins.y.x, at.y + 3, gv); sh.line(ni, [[at.x, at.y], [at.x, at.y + 3]]); }
    }
    return sh.plan(c.title);
  };

  /** the style for a circuit: asked for, or picked by structure */
  St.pick = function (c) {
    if (c.style === 'columns') return null;
    if (c.style && styles[c.style]) return styles[c.style];
    if (treeOf(c)) return styles.tree;
    if (singleOf(c)) return styles.single;
    if (c.parts.some((p) => Nl.isSequential(p)) && styles.fsm.test(c)) return styles.fsm;
    if (twoLevel(c)) return styles.rails;
    return null;
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
