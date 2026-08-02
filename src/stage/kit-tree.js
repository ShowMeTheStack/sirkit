// Trees: expression trees (an expression's operators over its variables, the shape its gate circuit takes),
// decision and recursion trees, with nodes lit or faded as a step goes on. The layout is tidy: each subtree is
// packed as close to its left sibling as their outlines allow, and a parent sits centred over its children.
(function (S) {
  'use strict';
  const Geo = S.geom;
  const K = (S.Kit = S.Kit || {});
  const TR = (K.tree = {});

  /** The drawn size of a node: a circle for short labels, a pill for long ones */
  TR.size = function (n) {
    const label = String(n.label === undefined ? n.id : n.label);
    // a node may ask for a fixed width, so a label that changes from frame to frame does not move the tree
    if (n.w) return { w: n.w, h: 38, rx: 19 };
    const w = Geo.textWidth(label, 16, { bold: true, mono: n.mono });
    if (w <= 26) return { r: 21, w: 42, h: 42, rx: 21 };
    return { w: w + 22, h: 38, rx: 19 };
  };
  const kids = (n) => n.children || [];

  /**
   * Positions for every node: Map id -> {x, y, depth}. opts: {gapX (between neighbours), gapY (between
   * levels), x, y (the root)}.
   */
  TR.layout = function (root, opts) {
    opts = opts || {};
    const gx = opts.gapX === undefined ? 22 : opts.gapX, gy = opts.gapY || 82;
    const rel = new Map();   // id -> x relative to its parent
    // returns contours: left[d], right[d] (extents at each depth, relative to this node's centre)
    const walk = (n) => {
      const sz = TR.size(n);
      const ch = kids(n);
      if (!ch.length) return { left: [-sz.w / 2], right: [sz.w / 2] };
      const cs = ch.map(walk);
      const offs = [0];
      let accR = cs[0].right.slice();
      for (let i = 1; i < cs.length; i++) {
        let shift = -Infinity;
        for (let d = 0; d < Math.min(accR.length, cs[i].left.length); d++) shift = Math.max(shift, accR[d] - cs[i].left[d] + gx);
        offs.push(shift);
        const nr = cs[i].right.map((v) => v + shift);
        for (let d = 0; d < nr.length; d++) accR[d] = d < accR.length ? Math.max(accR[d], nr[d]) : nr[d];
      }
      const mid = (offs[0] + offs[offs.length - 1]) / 2;
      ch.forEach((c, i) => rel.set(c.id, offs[i] - mid));
      const left = [-sz.w / 2], right = [sz.w / 2];
      cs.forEach((c, i) => {
        const o = offs[i] - mid;
        c.left.forEach((v, d) => { left[d + 1] = left[d + 1] === undefined ? v + o : Math.min(left[d + 1], v + o); });
        c.right.forEach((v, d) => { right[d + 1] = right[d + 1] === undefined ? v + o : Math.max(right[d + 1], v + o); });
      });
      return { left, right };
    };
    walk(root);
    const pos = new Map();
    const place = (n, x, d) => { pos.set(n.id, { x, y: (opts.y || 0) + d * gy, depth: d }); for (const c of kids(n)) place(c, x + rel.get(c.id), d + 1); };
    place(root, opts.x || 0, 0);
    return pos;
  };

  /** The leaves of a tree in order */
  TR.frontier = function (root) { const out = []; const go = (n) => { if (!kids(n).length) out.push(n); else kids(n).forEach(go); }; go(root); return out; };

  /**
   * Draw a tree. Nodes are {id, label, children, cls, mono, sub}. opts: {prefix, x, y, gapX, gapY, path: [ids]
   * (lit, with the edges between them), hot: [ids], grow: true (new nodes grow out of their parent),
   * yield: true (write the frontier underneath), yieldLabel, edgeCls(parent, child)}
   * Returns {items, pos, box}.
   */
  TR.draw = function (root, opts) {
    opts = opts || {};
    const P = opts.prefix || 'tr';
    const pos = TR.layout(root, opts);
    const path = new Set(opts.path || []), hot = new Set(opts.hot || []);
    const items = [];
    const boxes = [];
    const walk = (n, parent) => {
      const p = pos.get(n.id), sz = TR.size(n);
      const cls = ['tnode', n.cls || '', path.has(n.id) ? 'accept-path' : '', hot.has(n.id) ? 'hot' : '', kids(n).length ? '' : 'leaf'].filter(Boolean).join(' ');
      const it = { key: P + ':n:' + n.id, kind: 'state', x: p.x, y: p.y, w: sz.w, h: sz.h, rx: sz.rx, text: String(n.label === undefined ? n.id : n.label), cls, pick: true };
      if (n.sub !== undefined) it.sub = n.sub;
      if (parent && opts.grow !== false) { it.enter = 'from'; it.src = P + ':n:' + parent.id; }
      items.push(it);
      boxes.push({ x: p.x - sz.w / 2, y: p.y - sz.h / 2, w: sz.w, h: sz.h + (n.sub !== undefined ? 22 : 0) });
      if (parent) {
        const on = path.has(n.id) && path.has(parent.id);
        items.push({ key: P + ':e:' + parent.id + '>' + n.id, kind: 'edge', from: P + ':n:' + parent.id, to: P + ':n:' + n.id, head: false, gapB: 0, cls: ['tree', on ? 'hot' : '', opts.edgeCls ? opts.edgeCls(parent, n) || '' : '', n.cls && /pruned/.test(n.cls) ? 'dim' : ''].filter(Boolean).join(' ') });
      }
      for (const c of kids(n)) walk(c, n);
    };
    walk(root, null);
    let box = Geo.union(boxes);
    if (opts.yield) {
      const leaves = TR.frontier(root);
      const y = box.y + box.h + 34;
      if (opts.yieldLabel) items.push({ key: P + ':yl', kind: 'text', x: box.x - 14, y: y + 25, text: opts.yieldLabel, anchor: 'end', cls: 'title' });
      // the frontier sits under the tree, each symbol below its leaf when there is room, packed otherwise
      let x = -Infinity;
      const cells = [];
      for (const l of leaves) {
        const t = String(l.label === undefined ? l.id : l.label);
        if (t === 'ε') continue;
        const w = Math.max(34, Geo.textWidth(t, 16, { mono: true }) + 16);
        const px = Math.max(pos.get(l.id).x - w / 2, x + 4);
        cells.push({ key: P + ':y:' + l.id, kind: 'cell', x: px, y, w, h: 38, text: t, cls: 'mono' + (l.cls && /nt/.test(l.cls) ? ' act' : ''), enter: 'from', src: P + ':n:' + l.id });
        x = px + w;
      }
      if (!cells.length) cells.push({ key: P + ':y:eps', kind: 'cell', x: box.x + box.w / 2 - 20, y, w: 40, h: 38, text: 'ε', cls: 'mono empty' });
      items.push(...cells);
      box = Geo.union([box, { x: Math.min(...cells.map((c) => c.x)), y, w: Math.max(...cells.map((c) => c.x + c.w)) - Math.min(...cells.map((c) => c.x)), h: 38 }]);
    }
    return { items, pos, box };
  };

  TR.demos = [
    { name: 'tree: a parse tree growing, with its yield', frames: () => {
      const steps = [
        { id: 'S', label: 'S', cls: 'nt' },
        { id: 'S', label: 'S', children: [{ id: 'a1', label: 'a', cls: 't' }, { id: 'S2', label: 'S', cls: 'nt' }, { id: 'b1', label: 'b', cls: 't' }] },
        { id: 'S', label: 'S', children: [{ id: 'a1', label: 'a', cls: 't' }, { id: 'S2', label: 'S', children: [{ id: 'a2', label: 'a', cls: 't' }, { id: 'S3', label: 'S', cls: 'nt' }, { id: 'b2', label: 'b', cls: 't' }] }, { id: 'b1', label: 'b', cls: 't' }] },
        { id: 'S', label: 'S', children: [{ id: 'a1', label: 'a', cls: 't' }, { id: 'S2', label: 'S', children: [{ id: 'a2', label: 'a', cls: 't' }, { id: 'S3', label: 'S', children: [{ id: 'e', label: 'ε', cls: 't' }] }, { id: 'b2', label: 'b', cls: 't' }] }, { id: 'b1', label: 'b', cls: 't' }] },
      ];
      const say = ['Start from S.', 'S → a S b.', 'S → a S b again.', 'S → ε: the yield is aabb.'];
      return steps.map((t, i) => ({ items: TR.draw(t, { yield: true, yieldLabel: 'yield' }).items, say: say[i] }));
    } },
    { name: 'tree: a computation tree with an accepting path', frames: () => {
      const t = { id: 'r', label: 'q0', children: [
        { id: 'a', label: 'q0', children: [{ id: 'aa', label: 'q0', cls: 'pruned' }, { id: 'ab', label: 'q1', children: [{ id: 'abx', label: 'acc', cls: 'good' }] }] },
        { id: 'b', label: 'q1', children: [{ id: 'ba', label: 'rej', cls: 'reject' }] },
      ] };
      return [{ items: TR.draw(t, { path: ['r', 'a', 'ab', 'abx'] }).items, say: 'One branch accepts; the faded one was cut off at the step limit.' }];
    } },
  ];
})(globalThis.Sirkit = globalThis.Sirkit || {});
