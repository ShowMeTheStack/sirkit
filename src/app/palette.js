// The palette: every part in its category, each with its symbol, searchable. Drag one onto the canvas, or
// click it to drop it in the middle of the view. Parts come from the parts registry, so the palette grows as
// the parts library does; the user's own blocks are listed under My blocks.
(function (S) {
  'use strict';
  const { h, icon } = S.UI;
  const D = S.Doc;
  // what the palette offers first, in each category: [type, params, label]
  // the first type of a|b|c that the parts library knows is used (the stand-ins only when it has none of them)
  const CATALOGUE = [
    ['Gates', [['AND'], ['OR'], ['NOT', {}, 'NOT'], ['NAND'], ['NOR'], ['XOR'], ['XNOR'], ['BUF', {}, 'Buffer'], ['AND', { n: 3 }, 'AND, 3 inputs'], ['OR', { n: 3 }, 'OR, 3 inputs'], ['TRI', {}, 'Tristate buffer']]],
    ['Inputs/Outputs', [['SWITCH|IN', { kind: 'switch' }, 'Switch'], ['BUTTON|IN', { kind: 'button' }, 'Push button'], ['IN', { w: 4 }, 'Bus input'], ['CLOCK', {}, 'Clock'], ['CONST', { value: 0 }, 'Constant 0'], ['CONST', { value: 1 }, 'Constant 1'], ['OUT', {}, 'Output'], ['OUT', { w: 4 }, 'Bus output'], ['VCC'], ['GND'], ['PULLUP'], ['PULLDOWN']]],
    ['Plexers', [['MUX', { n: 2 }, '2:1 multiplexer'], ['MUX', { n: 4 }, '4:1 multiplexer'], ['DEMUX', {}, 'Demultiplexer'], ['DECODER', { k: 2 }, '2:4 decoder'], ['DECODER', { k: 3 }, '3:8 decoder'], ['ENCODER', {}, 'Encoder'], ['PRIENC', {}, 'Priority encoder'], ['SPLIT', {}, 'Bus splitter'], ['MERGE', {}, 'Bus merger']]],
    ['Arithmetic', [['HA', {}, 'Half adder'], ['FA', {}, 'Full adder'], ['ADDER|ADD', { w: 4 }, '4-bit adder'], ['ADDSUB', { w: 4 }, 'Adder–subtractor'], ['CMP', { w: 4 }, 'Comparator'], ['MUL', {}, 'Multiplier'], ['ALU', { w: 4 }, 'ALU']]],
    ['Flip-flops', [['DFF', {}, 'D flip-flop'], ['JKFF', {}, 'JK flip-flop'], ['TFF', {}, 'T flip-flop'], ['SRFF', {}, 'SR flip-flop'], ['LATCH', {}, 'D latch'], ['SRLATCH', {}, 'SR latch']]],
    ['Registers & counters', [['REG', { w: 4 }, 'Register'], ['SHIFT', { w: 4 }, 'Shift register'], ['USHIFT', { w: 4 }, 'Universal shift register'], ['COUNTER', { w: 4, clr: true }, 'Counter']]],
    ['Memory', [['ROM', {}, 'ROM'], ['RAM', {}, 'RAM']]],
    ['Display', [['LED', {}, 'LED'], ['SEG7', {}, '7-segment'], ['HEX', {}, 'Hex digit'], ['PROBE', {}, 'Probe']]],
  ];
  const pick = (spec) => { const ts = spec.split('|'); const real = (S.Parts && S.Parts.registry) || {}; return ts.find((t) => real[t]) || ts.find((t) => known(t)) || null; };
  const known = (t) => { if (S.Eng.def(t)) return true; try { S.Netlist.pinsOf(t, {}); return true; } catch (e) { return false; } };

  class Palette {
    constructor(host, opts) {
      this.opts = opts || {};
      this.host = host;
      this.search = h('input.pal-search', { type: 'search', placeholder: 'Find a part', 'aria-label': 'Find a part', id: 'palSearch' });
      this.search.addEventListener('input', S.UI.debounce(() => this.render(), 60));
      this.search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.search.value = ''; this.render(); } if (e.key === 'Enter') { const b = this.list.querySelector('.pal-item'); if (b) b.click(); } });
      this.list = h('div.pal-list');
      this.open = new Set(S.UI.storage.get('palOpen', ['Gates', 'Inputs/Outputs', 'Flip-flops', 'My blocks']));
      host.append(this.search, this.list);
      this.render();
    }
    /** every item, by category: [{cat, items: [{type, params, label}]}] */
    groups() {
      const reg = S.Eng.registry();
      const seen = new Set();
      const out = CATALOGUE.map(([cat, items]) => ({ cat, items: items.map(([spec, params, label]) => [pick(spec), spec, params, label]).filter(([t]) => t).map(([type, spec, params, label]) => {
        seen.add(type); for (const t of spec.split('|')) seen.add(t);
        params = Object.assign({}, params || {});
        if (type !== 'IN') delete params.kind;
        return { type, params, label: label || (reg[type] && reg[type].label) || type };
      }) }));
      // the rest of the registry, under its own category; the 74-series chips together
      const chips = [], more = new Map();
      for (const [type, d] of Object.entries(reg)) {
        if (seen.has(type) || d.hidden || type === 'BLOCK') continue;
        if (/^74/.test(type) || d.kind === 'chip' || d.category === '74-series') chips.push({ type, params: {}, label: (d.label || type) });
        else { const g0 = d.category || d.group; const cat = g0 && out.some((g) => g.cat === g0) ? g0 : 'More'; if (!more.has(cat)) more.set(cat, []); more.get(cat).push({ type, params: {}, label: d.label || type }); }
      }
      for (const [cat, items] of more) { const g = out.find((x) => x.cat === cat); if (g) g.items.push(...items); else out.push({ cat, items }); }
      chips.sort((a, b) => a.type.localeCompare(b.type, 'en', { numeric: true }));
      out.push({ cat: '74-series', items: chips, empty: 'The 74-series chips arrive with the parts library. The lab bench has them on its breadboard.' });
      const ed = this.opts.editor && this.opts.editor();
      const blocks = ed ? Object.keys(ed.root.blocks || {}) : [];
      out.push({ cat: 'My blocks', items: blocks.map((b) => ({ type: 'BLOCK', params: { block: b }, label: b })), empty: 'Select some parts and press Make block (B): the block appears here, ready to use again.' });
      return out.filter((g) => g.items.length || g.empty);
    }
    render() {
      const q = this.search.value.trim().toLowerCase();
      this.list.innerHTML = '';
      let any = false;
      for (const g of this.groups()) {
        const items = g.items.filter((it) => !q || (it.label + ' ' + it.type + ' ' + g.cat).toLowerCase().includes(q));
        if (q && !items.length) continue;
        any = true;
        const isOpen = this.open.has(g.cat) || !!q;
        const sec = h('section.pal-cat' + (isOpen ? '.open' : ''), { dataset: { cat: g.cat } });
        const head = h('button.pal-head', { type: 'button', 'aria-expanded': String(isOpen) }, h('span', g.cat), h('span.n', String(g.items.length)));
        head.addEventListener('click', () => { if (this.open.has(g.cat)) this.open.delete(g.cat); else this.open.add(g.cat); S.UI.storage.set('palOpen', [...this.open]); sec.classList.toggle('open'); head.setAttribute('aria-expanded', String(sec.classList.contains('open'))); });
        const grid = h('div.pal-grid');
        if (!items.length && g.empty) grid.appendChild(h('p.pal-empty', g.empty));
        for (const it of items) grid.appendChild(this.item(it));
        sec.append(head, grid);
        this.list.appendChild(sec);
      }
      if (!any) this.list.appendChild(S.UI.empty('search', 'No part matches "' + q + '"', 'Try a shorter word: mux, flip, adder, led.'));
    }
    item(it) {
      const b = h('button.pal-item', { type: 'button', title: it.label + ': drag it onto the canvas, or click to add it', dataset: { type: it.type, params: JSON.stringify(it.params) } }, h('span.pal-sym', { html: this.thumb(it) }), h('span.pal-name', it.label));
      let drag = null;
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
        try { b.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
      });
      b.addEventListener('pointermove', (e) => {
        if (!drag) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        if (!drag.moved) { drag.moved = true; drag.ghost = h('div.pal-ghost', { html: this.thumb(it) }); document.body.appendChild(drag.ghost); document.body.classList.add('dragging-part'); }
        drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
      });
      const end = (e, cancel) => {
        if (!drag) return;
        const d = drag; drag = null;
        document.body.classList.remove('dragging-part');
        if (d.ghost) d.ghost.remove();
        if (cancel) return;
        const ed = this.opts.editor && this.opts.editor();
        if (!ed) return;
        if (d.moved) { const p = ed.dropAt(it.type, it.params, e.clientX, e.clientY); if (p && this.opts.onPlace) this.opts.onPlace(p); }
      };
      b.addEventListener('pointerup', (e) => end(e));
      b.addEventListener('pointercancel', (e) => end(e, true));
      b.addEventListener('click', () => {
        if (b._suppress) return;
        const ed = this.opts.editor && this.opts.editor();
        if (!ed) return;
        const p = ed.addPart(it.type, it.params);
        if (this.opts.onPlace) this.opts.onPlace(p, true);
      });
      // a drag must not also count as a click
      b.addEventListener('pointerup', () => { if (b._dragged) { b._suppress = true; setTimeout(() => { b._suppress = false; }, 0); } });
      b.addEventListener('pointermove', () => { if (drag && drag.moved) b._dragged = true; });
      b.addEventListener('pointerdown', () => { b._dragged = false; });
      return b;
    }
    /** the symbol of a palette item, as a small SVG */
    thumb(it) {
      try {
        const ed = this.opts.editor && this.opts.editor();
        const dp = { id: 'x', type: it.type, params: Object.assign(S.Eng.defaults(it.type), it.params), x: 0, y: 0 };
        if (['IN', 'OUT', 'CLOCK', 'SWITCH', 'BUTTON'].includes(it.type)) dp.params.name = it.type === 'OUT' ? 'F' : it.type === 'CLOCK' ? 'CLK' : it.type === 'BUTTON' ? 'PB' : 'A';
        const g = D.geom(dp, ed ? ed.root : null), u = S.Symbols.U;
        const W = g.w * u, H = g.h * u, m = 6;
        let s = '';
        for (const q of Object.values(g.pins)) {
          const x = q.x * u, y = q.y * u, d = { left: [-m, 0], right: [m, 0], top: [0, -m], bottom: [0, m] }[q.side];
          s += `<path class="sk-lead" d="M${x} ${y}L${x + d[0]} ${y + d[1]}"/>`;
        }
        return `<svg class="sk" viewBox="${-m - 1} ${-m - 1} ${W + 2 * m + 2} ${H + 2 * m + 2}" aria-hidden="true">${s}${S.EdDraw.symbol(dp, g, S.app ? S.app.settings.style : 'shape')}</svg>`;
      } catch (e) { return ''; }
    }
  }
  S.Palette = Palette;
})(globalThis.Sirkit = globalThis.Sirkit || {});
