// Screenshots of the layout gallery, one PNG per circuit card:
// node tools/gallery-shots.mjs <dir> [--theme light|dark] [--style shape|rect] [--scale 1.5] [--suffix x] [id...]
// Uses /dev.html, so nothing needs building first.
import { launch } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const val = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const dir = args[0];
if (!dir) { console.log('usage: node tools/gallery-shots.mjs <dir> [--theme dark] [--style rect] [--scale 1.5] [--suffix s] [id...]'); process.exit(1); }
const opts = ['--theme', '--style', '--scale', '--suffix'];
const ids = args.slice(1).filter((a, i) => !a.startsWith('--') && !opts.includes(args[i]));
mkdirSync(dir, { recursive: true });
const b = await launch({ width: 1440, height: 900, scale: +val('--scale', 1.5) });
try {
  await b.goto('dev.html');
  await b.waitFor('window.__sirkitReady === true', 20000);
  await b.eval(`Sirkit.app.setTheme(${JSON.stringify(val('--theme', 'light'))}); Sirkit.app.settings.style = ${JSON.stringify(val('--style', 'shape'))}; Sirkit.app.applyTheme(); location.hash = 'demo${ids.length ? '=' + ids.join(',') : ''}'; 1`);
  await b.waitFor('window.__sirkitReady === true', 180000);
  const cards = await b.eval(`[...document.querySelectorAll('.card')].map((c) => { const r = c.getBoundingClientRect(); return { id: c.dataset.id, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })`);
  const suf = val('--suffix', '');
  for (const c of cards) {
    const f = join(dir, c.id + (suf ? '-' + suf : '') + '.png');
    await b.screenshot(f, { x: c.x - 4, y: c.y - 4, width: c.w + 8, height: c.h + 8 });
  }
  const errs = b.logs.filter((l) => l.type === 'exception' || l.type === 'error');
  if (errs.length) console.log('page errors: ' + errs.map((e) => e.text).join('\n'));
  console.log(cards.length + ' cards saved in ' + dir);
} finally { await b.close(); }
