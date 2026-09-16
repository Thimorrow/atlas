// Browser fixtures: no production notebook data is read or changed.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const base = process.env.ATLAS_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
page.setDefaultTimeout(12000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const p = (x, y) => ({ x, y, pressure: .7 });
let saved = { id: '11111111-1111-4111-8111-111111111111', subjectId: '22222222-2222-4222-8222-222222222222', title: 'Werkzeugprobe', paper: 'grid', content: { strokes: [
  { id: 'ink', kind: 'ink', color: '#1e293b', width: 3, points: [p(300, 100), p(300, 400)] },
  { id: 'marker', kind: 'marker', color: '#facc15', width: 24, points: [p(340, 100), p(340, 400)] },
], blocks: [] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
const canvas = page.getByLabel('Zeichenfläche.', { exact: false });
const button = name => page.getByRole('button', { name, exact: true });
async function draft() {
  return page.evaluate(id => {
    for (const key of Object.keys(localStorage)) {
      try { const value = JSON.parse(localStorage[key]); if (value.page?.id === id) return value.page; } catch {}
    }
  }, saved.id);
}
async function gesture(points, hold = false) {
  await expect(page.getByRole("menu")).toBeHidden();
  const rect = await canvas.boundingBox();
  const screen = ([x, y]) => [rect.x + x / 1000 * rect.width, rect.y + y / 1400 * rect.height];
  await page.mouse.move(...screen(points[0]));
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(...screen(point));
  if (hold) await expect(page.getByRole('status').filter({ hasText: /erkannt/ })).toBeVisible();
  await page.mouse.up();
}
try {
  if (process.env.ATLAS_PASSWORD) assert.equal((await page.request.post(`${base}/api/login`, { data: { password: process.env.ATLAS_PASSWORD } })).status(), 200);
  await page.route('**/api/subjects', route => route.fulfill({ json: { subjects: [{ id: saved.subjectId, name: 'Mathematik' }] } }));
  await page.route('**/api/notebooks?*', route => route.fulfill({ json: { pages: [saved], chapters: [] } }));
  await page.route('**/api/notebooks/*', async route => {
    if (route.request().method() === 'PATCH') saved = { ...saved, ...route.request().postDataJSON(), updatedAt: new Date().toISOString() };
    await route.fulfill({ json: { page: saved } });
  });
  await page.goto(`${base}/hefte`);
  await canvas.waitFor();
  await button('Radierer').click();
  await gesture([[50, 50], [100, 50]]);
  await expect(button('Rückgängig')).toBeDisabled();
  await button('Radierer einstellen').click();
  await page.getByRole('menuitem', { name: 'Nur Textmarker radieren' }).click();
  await gesture([[100, 250], [500, 250]]);
  assert.deepEqual((await draft()).content.strokes.map(s => s.id), ['ink']);
  await button('Rückgängig').click();
  await button('Radierer einstellen').click();
  await page.getByRole('menuitem', { name: 'Nur Textmarker radieren' }).click();
  await gesture([[100, 250], [500, 250]]);
  assert.equal((await draft()).content.strokes.length, 0);
  await button('Rückgängig').click();
  assert.equal((await draft()).content.strokes.length, 2);
  console.log('PASS: fast eraser sweep, marker-only, no-op history, undo');

  await button('Lasso').click();
  await gesture([[260, 70], [320, 70], [320, 440], [260, 440], [260, 70]]);
  await expect(page.getByRole('status').filter({ hasText: '1 Strich' })).toBeVisible();
  await gesture([[300, 250], [400, 300]]);
  assert.ok(Math.abs((await draft()).content.strokes[0].points[0].x - 400) < .01);
  await button('Rückgängig').click();
  assert.equal((await draft()).content.strokes[0].points[0].x, 300);
  await button('Auswahl duplizieren').click();
  assert.equal((await draft()).content.strokes.length, 3);
  await button('Auswahl löschen').click();
  assert.equal((await draft()).content.strokes.length, 2);
  await button('Rückgängig').click();
  assert.equal((await draft()).content.strokes.length, 3);
  console.log('PASS: lasso select, move, duplicate, delete, undo');

  await button('Stift').click();
  await gesture([[100, 550], [180, 552], [250, 549], [400, 550]], true);
  assert.equal((await draft()).content.strokes.at(-1).kind, 'shape');
  assert.equal((await draft()).content.strokes.at(-1).points.length, 2);
  await gesture([[550, 500], [800, 500], [800, 700], [550, 700], [550, 500]], true);
  assert.equal((await draft()).content.strokes.at(-1).points.length, 5);
  await button('Formerkennung einstellen').click();
  await page.getByRole('menuitem', { name: 'Formen durch Halten' }).click();
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + .1 * rect.width, rect.y + 600 / 1400 * rect.height);
  await page.mouse.down();
  await page.mouse.move(rect.x + .4 * rect.width, rect.y + 600 / 1400 * rect.height);
  await page.waitForTimeout(850);
  await page.mouse.up();
  assert.equal((await draft()).content.strokes.at(-1).kind, 'ink');
  console.log('PASS: draw and hold, rectangle recognition, disable recognition');

  await button('Text & Elemente').click();
  const sheet = await canvas.boundingBox();
  await page.mouse.click(sheet.x + sheet.width * .1, sheet.y + sheet.height * .58);
  const text = page.getByRole('textbox', { name: 'Text auf dem Heftblatt' });
  await expect(text).toBeFocused();
  const prose = Array.from({ length: 8 }, (_, i) => `Zeile ${i + 1}: Mein Hefteintrag`).join('\n');
  await text.fill(prose);
  assert.ok((await draft()).content.blocks[0].height > 160);
  await text.press('End');
  await text.pressSequentially(' weiter');
  await button('Rückgängig').click();
  await expect(text).toHaveValue('');
  await button('Wiederholen').click();
  await expect(text).toHaveValue(prose + ' weiter');
  const beforeMove = (await draft()).content.blocks[0];
  const handle = await button('Element verschieben').boundingBox();
  await page.mouse.move(handle.x + 20, handle.y + 20);
  await page.mouse.down();
  await page.mouse.move(handle.x + 55, handle.y - 10, { steps: 3 });
  await page.mouse.up();
  assert.ok((await draft()).content.blocks[0].x > beforeMove.x);
  const beforeResize = (await draft()).content.blocks[0];
  const resize = await button('Elementgröße ändern').boundingBox();
  await page.mouse.move(resize.x + 20, resize.y + 20);
  await page.mouse.down();
  await page.mouse.move(resize.x + 55, resize.y + 35, { steps: 3 });
  await page.mouse.up();
  assert.ok((await draft()).content.blocks[0].width > beforeResize.width);
  await button('Ausgewähltes Element löschen').click();
  assert.equal((await draft()).content.blocks.length, 0);
  await button('Rückgängig').click();
  await expect(text).toHaveValue(prose + ' weiter');
  await expect.poll(() => saved.content.blocks[0]?.text).toBe(prose + ' weiter');
  await page.reload();
  await canvas.waitFor();
  await button('Text & Elemente').click();
  await expect(text).toHaveValue(prose + ' weiter');
  await text.click();
  await expect(text).toBeFocused();
  await page.screenshot({ path: '/tmp/atlas-hefte-editing.png' });
  await button('Einfügen').click();
  await page.getByRole('menuitem', { name: 'Textfeld', exact: true }).click();
  await expect(text).toHaveCount(2);
  await expect(text.last()).toBeFocused();
  await button('Ausgewähltes Element löschen').click();
  await expect(text).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['Lasso', 'Radierer', 'Text & Elemente']) {
    await button(name).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: text placement, focus, growth, grouped undo, move/resize/delete, reload, mobile layout');
} catch (error) {
  console.log((await page.locator('body').innerText()).slice(-2500));
  await page.screenshot({ path: '/tmp/atlas-hefte-editing-error.png' });
  throw error;
} finally { await browser.close(); }
