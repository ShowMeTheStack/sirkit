// The frame of the app: the top bar and its routes, themes and projector mode, settings, the shortcuts sheet,
// About and the author, the layout gallery, a missing page, and every page at phone width.
import { assert } from '../lib.mjs';

const PAGES = ['', 'topics', 'learn', 'courses', 'build', 'func', 'fsm', 'verilog', 'lab'];

export default function (t) {
  t.test('the top bar routes to every section and lights the one open', async (p) => {
    for (const [id, nav] of [['topics', 'topics'], ['learn', 'learn'], ['courses', 'courses'], ['build', 'build'], ['func', 'build'], ['fsm', 'build'], ['verilog', 'verilog'], ['lab', 'lab']]) {
      await p.route(id);
      assert.equal(await p.ev("(document.querySelector('#topNav button.on') || {}).dataset?.route || ''"), nav, 'nav for ' + id);
    }
    await p.click('#brand');
    await p.wait("location.hash === '' || location.hash === '#'");
    assert.ok(await p.exists('.hero'));
    await p.click('#topNav button[data-route="verilog"]');
    await p.wait("location.hash === '#verilog'");
  });

  t.test('the home page: the live full adder, the ways in, the parts of the course', async (p) => {
    await p.route('');
    await p.wait("!!document.querySelector('#heroArt svg[data-schematic]')");
    assert.match(await p.text('#heroCap'), /full adder/);
    assert.ok((await p.count('.tool-card')) >= 6);
    assert.equal(await p.count('.home .part'), 14);
    await p.click('#toFunc');
    await p.wait("location.hash === '#func'");
  });

  t.test('a page that is not there says so', async (p) => {
    await p.route('nowhere-at-all');
    assert.match(await p.text('.notice'), /no page called/);
  });

  t.test('light and dark, projector mode, and settings', async (p) => {
    await p.route('build');
    const t0 = await p.theme();
    await p.click('#btnTheme');
    assert.notEqual(await p.theme(), t0);
    await p.key('t');
    assert.equal(await p.theme(), t0);
    await p.click('#btnProjector');
    assert.equal(await p.ev('document.documentElement.dataset.projector'), 'on');
    await p.click('#btnProjector');
    await p.click('#btnAbout');
    await p.click('.menu-pop .menu-item', 'Settings');
    assert.equal(await p.waitModal(), 'Settings');
    assert.ok(await p.exists('#set-style'), 'gate symbols');
    assert.ok(await p.exists('#set-tech'), 'technology');
    await p.setValue('#set-style', 'rect', 'change');
    assert.equal((await p.settings()).style, 'rect');
    assert.equal(await p.ev('document.documentElement.dataset.symbols'), 'rect');
    await p.setValue('#set-style', 'shape', 'change');
    await p.setValue('#set-powerUp', 'X', 'change');
    assert.equal((await p.settings()).powerUp, 'X');
    await p.setValue('#set-powerUp', '0', 'change');
    await p.closeModals();
  });

  t.test('the shortcuts sheet and About, with the author and the sister tools', async (p) => {
    await p.route('');
    await p.key('?');
    assert.equal(await p.waitModal(), 'Keyboard shortcuts');
    assert.match(await p.modalText(), /Undo, redo/);
    await p.closeModals();
    await p.click('#btnAbout');
    await p.click('.menu-pop .menu-item', 'About Sirkit');
    assert.equal(await p.waitModal(), 'About Sirkit');
    assert.match(await p.modalText(), /GNU General Public License/);
    assert.match(await p.modalText(), /Tooring/);
    await p.closeModals();
    await p.click('#btnAbout');
    await p.click('.menu-pop .menu-item', 'About the author');
    assert.equal(await p.waitModal(), 'About the author');
    const text = await p.modalText();
    assert.match(text, /Jyotiprakash Mishra/);
    assert.match(text, /Tooring/);
    assert.ok(await p.ev("!!document.querySelector('.author-photo img').getAttribute('src').startsWith('data:image/png')"), 'the photo');
    await p.closeModals();
  });

  t.test('the layout gallery is still at #demo', async (p) => {
    await p.route('demo=fa,ha', 30000);
    assert.equal(await p.count('.card[data-id]'), 2);
    assert.ok(await p.exists('.card[data-id="fa"] svg[data-schematic]'));
  });

  t.test('a damaged share link is refused with a sentence', async (p) => {
    await p.route('');
    await p.ev("location.hash = 'share=S1.zNOTAVALIDCODE'");
    await p.waitToast(/damaged|incomplete|share code/);
  });

  t.test('every page at phone width: nothing scrolls sideways, the sections are in the menu', async (p) => {
    await p.fresh({ width: 390, height: 844, mobile: true, touch: true });
    for (const id of PAGES) {
      await p.route(id);
      await p.sleep(250);
      assert.ok(await p.noHScroll(), 'page ' + (id || 'home') + ' scrolls sideways');
    }
    assert.ok(!(await p.visible('#topNav button')), 'the sections are folded away');
    await p.click('#btnMenu');
    assert.ok(await p.visible('#topNav button[data-route="lab"]'));
    await p.click('#topNav button[data-route="lab"]');
    await p.wait("location.hash === '#lab'");
    assert.ok(!(await p.visible('#topNav button')), 'and folded again');
  });
}
