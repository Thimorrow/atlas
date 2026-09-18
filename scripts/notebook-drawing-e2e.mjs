// Local browser fixtures verify drawing and save/reload without changing real notebooks.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base = process.env.ATLAS_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 1000 } });
page.setDefaultTimeout(12000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let saved = { id: '11111111-1111-4111-8111-111111111111', subjectId: '22222222-2222-4222-8222-222222222222', title: 'Zeichenprobe', paper: 'grid', content: { strokes: [], blocks: [] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
try {
  if (process.env.ATLAS_PASSWORD) assert.equal((await page.request.post(`${base}/api/login`, { data: { password: process.env.ATLAS_PASSWORD } })).status(), 200);
  await page.route('**/api/subjects', r => r.fulfill({ json: { subjects: [{ id: saved.subjectId, name: 'Mathematik' }] } }));
  await page.route('**/api/notebooks?*', r => r.fulfill({ json: { pages: [saved], chapters: [] } }));
  await page.route('**/api/notebooks/*', async r => {
    if (r.request().method() === 'PATCH') saved = { ...saved, ...r.request().postDataJSON(), updatedAt: new Date().toISOString() };
    await r.fulfill({ json: { page: saved } });
  });
  await page.goto(`${base}/hefte`);
  const canvas = page.getByLabel('Zeichenfläche.', { exact: false });
  await canvas.waitFor();
  async function draw(tool, offset) {
    if (tool) await page.getByRole('button', { name: tool, exact: true }).click();
    const box = await canvas.boundingBox();
    const x = box.x + box.width * .2, y = box.y + offset;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 100, y + 50, { steps: 12 });
    // Include a distinct pointerup coordinate to catch truncated stroke endings.
    await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: x + 110, clientY: y + 55, pressure: 0 });
    await page.mouse.up();
  }
  await draw('Stift', 60);
  await draw('Textmarker', 130);
  await page.getByRole('button', { name: 'Einfügen', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Linie', exact: true }).click();
  await draw(null, 210);
  await page.waitForFunction(() => Object.keys(localStorage).some(k => { try { return JSON.parse(localStorage[k]).page?.content?.strokes?.length === 3; } catch { return false; } }));
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await page.waitForTimeout(1100);
  assert.deepEqual(saved.content.strokes.map(s => s.kind), ['ink', 'marker', 'shape']);
  assert.equal(saved.content.strokes[2].points.length, 2);
  await page.reload();
  await canvas.waitFor();
  await page.getByRole('button', { name: 'Einfügen', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rechteck', exact: true }).click();
  await draw(null, 300);
  await page.waitForTimeout(1100);
  assert.equal(saved.content.strokes.at(-1).points.length, 5);
  await page.screenshot({ path: '/tmp/atlas-hefte-drawing.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Textmarker', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log('PASS: pen, marker, shapes, undo/redo, fixture save/reload, mobile width');
} catch (error) { console.log((await page.locator('body').innerText()).slice(0,4000)); console.log(errors); await page.screenshot({path:'/tmp/atlas-hefte-error.png'}); throw error; } finally { await browser.close(); }
