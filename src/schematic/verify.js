// The invariants of a finished schematic, checked on the layout's own geometry (the property tests use this;
// the browser audit checks the drawn SVG the same way). Returns { problems: [...], crossings }.
(function (S) {
  'use strict';
  const V = S.Verify = {};
  const key = (x, y) => x + ',' + y;

  V.check = function (res) {
    const problems = [];
    const bad = (kind, msg) => problems.push({ kind, msg });
    const inBox = (x, y, b, e) => x > b.x + e && x < b.x + b.w - e && y > b.y + e && y < b.y + b.h - e;
    // parts
    for (let i = 0; i < res.parts.length; i++) for (let j = i + 1; j < res.parts.length; j++) {
      const a = res.parts[i], b = res.parts[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) bad('part-overlap', a.id + ' overlaps ' + b.id);
    }
    const segs = [];
    for (const n of res.nets) for (const s of n.segments) {
      if (s[0] !== s[2] && s[1] !== s[3]) bad('diagonal', 'a wire of ' + n.id + ' is not horizontal or vertical');
      segs.push({ n: n.id, x1: Math.min(s[0], s[2]), y1: Math.min(s[1], s[3]), x2: Math.max(s[0], s[2]), y2: Math.max(s[1], s[3]), h: s[1] === s[3] });
    }
    // wires through parts
    for (const s of segs) for (const p of res.parts) {
      const b = { x: p.x + 0.5, y: p.y + 0.5, w: p.w - 1, h: p.h - 1 };
      if (s.h ? s.y1 > b.y && s.y1 < b.y + b.h && s.x1 < b.x + b.w && s.x2 > b.x : s.x1 > b.x && s.x1 < b.x + b.w && s.y1 < b.y + b.h && s.y2 > b.y) bad('wire-through-part', 'a wire of ' + s.n + ' runs through ' + p.id);
    }
    // different nets: overlaps, touches, crossings
    let crossings = 0;
    const onSeg = (s, x, y) => (s.h ? y === s.y1 && x >= s.x1 && x <= s.x2 : x === s.x1 && y >= s.y1 && y <= s.y2);
    const interior = (s, x, y) => (s.h ? y === s.y1 && x > s.x1 && x < s.x2 : x === s.x1 && y > s.y1 && y < s.y2);
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i], b = segs[j];
      if (a.n === b.n) continue;
      if (a.h === b.h) {
        const same = a.h ? a.y1 === b.y1 : a.x1 === b.x1;
        if (!same) continue;
        const lo = Math.max(a.h ? a.x1 : a.y1, b.h ? b.x1 : b.y1), hi = Math.min(a.h ? a.x2 : a.y2, b.h ? b.x2 : b.y2);
        if (hi > lo) bad('wire-overlap', a.n + ' and ' + b.n + ' run on top of each other');
        else if (hi === lo) bad('wire-touch', a.n + ' and ' + b.n + ' touch end to end');
        continue;
      }
      const hs = a.h ? a : b, vs = a.h ? b : a;
      const x = vs.x1, y = hs.y1;
      if (!onSeg(hs, x, y) || !onSeg(vs, x, y)) continue;
      if (interior(hs, x, y) && interior(vs, x, y)) crossings++;
      else bad('wire-touch', a.n + ' and ' + b.n + ' touch at ' + x + ',' + y);
    }
    const reported = (res.crossingCount || 0) + (res.railCrossings || 0);
    if (res.crossingCount != null && crossings !== reported) bad('crossing-count', 'the layout reports ' + reported + ' crossings, the wires have ' + crossings);
    // each net: a tree through all its pins, with a dot at every T and nowhere else
    for (const n of res.nets) {
      const ss = segs.filter((s) => s.n === n.id);
      const pts = new Map();
      const addPt = (x, y) => { const k = key(x, y); if (!pts.has(k)) pts.set(k, [x, y]); };
      for (const s of ss) { addPt(s.x1, s.y1); addPt(s.x2, s.y2); }
      for (const p of n.pins) addPt(p[0], p[1]);
      const degree = new Map();
      for (const [k, [x, y]] of pts) {
        let d = 0;
        for (const s of ss) { if ((s.x1 === x && s.y1 === y) || (s.x2 === x && s.y2 === y)) d++; else if (interior(s, x, y)) d += 2; }
        degree.set(k, d);
      }
      const dots = new Set(n.junctions.map((j) => key(j[0], j[1])));
      for (const [k, d] of degree) {
        if (d >= 4) bad('four-way', n.id + ' meets itself four ways at ' + k);
        else if (d === 3 && !dots.has(k)) bad('missing-dot', n.id + ' has a T-junction without a dot at ' + k);
      }
      for (const k of dots) if (degree.get(k) !== 3) bad('stray-dot', n.id + ' has a dot where its wires do not branch, at ' + k);
      const pinKeys = new Set(n.pins.map((p) => key(p[0], p[1])));
      for (const [k, d] of degree) if (d === 1 && !pinKeys.has(k)) bad('loose-end', n.id + ' has a wire ending away from any pin, at ' + k);
      // split at every point, then union-find
      const parent = new Map([...pts.keys()].map((k) => [k, k]));
      const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
      let edges = 0;
      for (const s of ss) {
        const on = [...pts.values()].filter(([x, y]) => onSeg(s, x, y)).sort((a, b) => (s.h ? a[0] - b[0] : a[1] - b[1]));
        for (let t = 1; t < on.length; t++) { edges++; const a = find(key(...on[t - 1])), b = find(key(...on[t])); if (a !== b) parent.set(a, b); }
      }
      const roots = new Set([...pts.keys()].map(find));
      if (roots.size !== 1) bad('disconnected', n.id + ' falls into ' + roots.size + ' pieces');
      if (edges !== pts.size - 1 && roots.size === 1) bad('loop', n.id + ' has a loop');
      for (const p of n.pins) if (!ss.some((s) => (s.x1 === p[0] && s.y1 === p[1]) || (s.x2 === p[0] && s.y2 === p[1]))) bad('pin-unreached', n.id + ' does not reach its pin at ' + key(p[0], p[1]));
    }
    // pins: connected, or left open on purpose
    for (const p of res.parts) for (const q of p.pins) if (q.open && !(p.part && p.part.open && p.part.open.has(q.name))) bad('pin-open', p.id + '.' + q.name + ' is not connected');
    // labels
    const B = res.bounds;
    res.labels.forEach((l, i) => {
      const b = l.box;
      if (b.x < B.x || b.y < B.y || b.x + b.w > B.x + B.w || b.y + b.h > B.y + B.h) bad('label-cut', '"' + l.text + '" is cut by the edge');
      for (const p of res.parts) if (b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y) bad('label-on-part', '"' + l.text + '" lies on ' + p.id);
      for (const s of segs) if (b.x < s.x2 + 1 && b.x + b.w > s.x1 - 1 && b.y < s.y2 + 1 && b.y + b.h > s.y1 - 1) bad('label-on-wire', '"' + l.text + '" lies on a wire of ' + s.n);
      for (let j = i + 1; j < res.labels.length; j++) { const o = res.labels[j].box; if (b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y) bad('label-overlap', '"' + l.text + '" overlaps "' + res.labels[j].text + '"'); }
    });
    for (const f of res.failed || []) bad('unrouted', f + ' could not be routed');
    return { problems, crossings };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
