// Fixture-only regression checks. No real notebook records are changed.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const base = process.env.ATLAS_URL ?? 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(10000);
const subjectId = '22222222-2222-4222-8222-222222222222';
const pages = [1, 2].map((n) => ({
  id: `11111111-1111-4111-8111-11111111111${n}`, subjectId, title: `Algebra ${n}`, paper: 'grid',
  content: { strokes: [], blocks: n === 1 ? [{ id: 'sheet', type: 'image', fileId: 'fixture', x: 70, y: 80, width: 860, height: 1000 }] : [] },
  createdAt: `2026-09-18T07:00:0${n}.000Z`, updatedAt: `2026-09-18T07:00:0${n}.000Z`,
}));
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const button = (name) => page.getByRole('button', { name, exact: true });
const canvas = page.getByLabel('Zeichenfläche.', { exact: false });
const primaryTools = ['Stift', 'Textmarker', 'Radierer', 'Auswahl'];
const region = page.getByRole('region', { name: 'Heftblatt, mit einem Finger verschieben und mit zwei Fingern zoomen' });

function blankPdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << >> >>'];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(source);
}

try {
  if (process.env.ATLAS_PASSWORD) assert.equal((await page.request.post(`${base}/api/login`, { data: { password: process.env.ATLAS_PASSWORD } })).status(), 200);
  await page.route('**/api/subjects', (route) => route.fulfill({ json: { subjects: [{ id: subjectId, name: 'Mathematik' }] } }));
  await page.route('**/api/notebooks?*', (route) => route.fulfill({ json: { pages, chapters: [] } }));
  await page.route('**/api/notebooks/*', (route) => {
    const item = pages.find((entry) => entry.id === route.request().url().split('/').at(-1));
    if (route.request().method() === 'PATCH') Object.assign(item, route.request().postDataJSON(), { updatedAt: new Date().toISOString() });
    return route.fulfill({ json: { page: item } });
  });
  await page.route('**/api/files/fixture?*', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="860" height="1000"><rect width="860" height="1000" fill="white"/></svg>' }));
  await page.goto(`${base}/hefte`);
  await canvas.waitFor();

  for (const width of [320, 390, 768, 834, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const strip = page.getByRole('group', { name: 'Werkzeug wählen', exact: true });
    const sizes = await strip.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    assert.ok(sizes.scroll <= sizes.client + 1, `${width}px: a primary tool is hidden inside a scrolling strip`);
    let origin;
    for (const name of primaryTools) {
      const target = button(name);
      const box = await target.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `${width}px: ${name} hit target`);
      assert.ok(box.x >= 0 && box.x + box.width <= width, `${width}px: ${name} viewport bounds`);
      await target.click();
      const current = await canvas.boundingBox();
      if (origin !== undefined) assert.ok(Math.abs(current.y - origin) < 1, `${width}px: ${name} moves the page`);
      origin = current.y;
    }
  }
  console.log('PASS: all primary tools reachable, 44px targets and stable page origin at six widths');

  await page.setViewportSize({ width: 1280, height: 900 });
  await button('Textmarker').click();
  await button('Blatt vergrößern').click();
  await page.getByRole('button', { name: /02.*Algebra 2/ }).click();
  await expect(button('Textmarker')).toHaveAttribute('aria-pressed', 'true');
  await expect(button('Blatt auf Breite einpassen')).toHaveText('125 %');
  await page.getByRole('button', { name: /01.*Algebra 1/ }).click();
  await expect(button('Textmarker')).toHaveAttribute('aria-pressed', 'true');
  await button('Blatt auf Breite einpassen').click();
  console.log('PASS: tool and zoom survive page navigation');

  await button('Stift').click();
  const drawingSheet = await canvas.boundingBox();
  const sx = (x) => drawingSheet.x + x / 1000 * drawingSheet.width;
  const sy = (y) => drawingSheet.y + y / 1400 * drawingSheet.height;
  await page.mouse.move(sx(150), sy(150));
  await page.mouse.down();
  await page.mouse.move(sx(450), sy(150), { steps: 12 });
  await page.mouse.up();
  for (const name of ['Stift', 'Auswahl']) {
    await button(name).click();
    const sample = await page.screenshot({ clip: { x: Math.floor(sx(300)) - 2, y: Math.floor(sy(150)) - 2, width: 5, height: 5 } });
    const { data, info } = await sharp(sample).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let visibleInk = 0;
    for (let pixel = 0; pixel < data.length; pixel += info.channels) if (data[pixel] < 100 && data[pixel + 1] < 100 && data[pixel + 2] < 130) visibleInk++;
    assert.ok(visibleInk >= 3, `${name}: imported image hides the handwriting`);
  }
  console.log('PASS: handwriting remains visibly above imported images in writing and selection modes');

  await button('Einfügen').click();
  await page.getByRole('menuitem', { name: 'Text platzieren', exact: true }).click();
  await expect(page.getByRole('menu')).toBeHidden();
  const sheet = await canvas.boundingBox();
  // This coordinate lies inside an existing imported image: it must not intercept placement.
  await page.mouse.click(sheet.x + sheet.width * .3, sheet.y + sheet.height * .3);
  const text = page.getByRole('textbox', { name: 'Text auf dem Heftblatt' });
  await expect(text).toBeFocused();
  await text.fill('Ein nachvollziehbarer Hefteintrag.');
  await text.click();
  await expect(text).toBeEditable();
  await text.press('Escape');
  await expect(text).not.toBeFocused();
  await expect(text).not.toBeEditable();
  await button('Stift').click();
  await button('Auswahl').click();
  await expect(text).not.toBeFocused();
  await expect(page.getByRole('group', { name: 'Auswahlaktionen', exact: true })).toBeHidden();
  console.log('PASS: text places over imports, focus is explicit, Escape ends editing, tool changes clear selection');

  await button('Blatt verkleinern').click();
  await button('Blatt verkleinern').click();
  const smallSheet = await canvas.boundingBox();
  const boundary = [[.02, .02], [.98, .02], [.98, .98], [.02, .98], [.02, .02]];
  await page.mouse.move(smallSheet.x + boundary[0][0] * smallSheet.width, smallSheet.y + boundary[0][1] * smallSheet.height);
  await page.mouse.down();
  for (const [x, y] of boundary.slice(1)) await page.mouse.move(smallSheet.x + x * smallSheet.width, smallSheet.y + y * smallSheet.height, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('status').filter({ hasText: '3 ausgewählt' })).toBeVisible();
  await button('Auswahl duplizieren').click();
  await expect(text).toHaveCount(2);
  await button('Rückgängig').click();
  await expect(text).toHaveCount(1);
  await button('Stift').click();
  await button('Blatt auf Breite einpassen').click();
  console.log('PASS: one selection includes handwriting, image and text, duplicates together and undoes');

  await page.setViewportSize({ width: 390, height: 844 });
  await button('Seiteneinstellungen').click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  // Wait for the actual opening animation rather than measuring a scaled intermediate frame.
  await menu.evaluate(async (element) => { await Promise.allSettled(element.getAnimations().map((animation) => animation.finished)); });
  const menuBox = await menu.boundingBox();
  assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= 390, 'page menu horizontal bounds');
  assert.ok(menuBox.y >= 0 && menuBox.y + menuBox.height <= 780, 'page menu overlaps app navigation');
  await expect(menu).not.toContainText('Auf Breite einpassen');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(button('Seiteneinstellungen')).toBeFocused();
  await button('Einfügen').click();
  await page.getByRole('menuitem', { name: 'Text platzieren', exact: true }).click();
  await expect(menu).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status').filter({ hasText: 'Tippe auf das Blatt' })).toBeHidden();
  console.log('PASS: bounded page menu, one zoom location, menu focus return and placement cancellation');

  await button('Einfügen').click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Bild oder PDF', exact: true }).click();
  await (await chooserPromise).setFiles({ name: 'Arbeitsblatt.pdf', mimeType: 'application/pdf', buffer: blankPdf() });
  const dialog = page.getByRole('dialog', { name: 'PDF-Seite einfügen' });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('PDF-Seite auswählen', { exact: true })).toBeFocused();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    // Native modal dialogs may cycle through browser chrome (activeElement=body),
    // but must never put focus on another control behind the modal.
    assert.ok(await dialog.evaluate((element) => document.activeElement === document.body || element.contains(document.activeElement)), 'PDF dialog focuses a background control');
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(button('Einfügen')).toBeFocused();
  console.log('PASS: PDF dialog opens with focus, keeps Tab inside and closes with Escape');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload();
  await canvas.waitFor();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const typography = await page.getByLabel('Seitentitel', { exact: true }).evaluate((element) => ({ font: getComputedStyle(element).fontFamily, size: parseFloat(getComputedStyle(element).fontSize) }));
  assert.match(typography.font, /Geist/);
  assert.ok(typography.size >= 16);
  await expect(region).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS: dark/reduced-motion render, Geist title and no browser errors');
} catch (error) {
  await page.screenshot({ path: '/tmp/atlas-notebook-ux-error.png' });
  throw error;
} finally {
  await browser.close();
}
