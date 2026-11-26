import { launchBrowser } from '../src/browser.js';
import { CONFIG } from '../src/config.js';
import { log } from '../src/logger.js';

function dumpScript() {
  const results: string[] = [];

  document.querySelectorAll('textarea, input:not([type="hidden"]), [contenteditable="true"], [contenteditable=""], [role="textbox"]').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const attrs = Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(' ');
    const text = (el as HTMLElement).innerText?.substring(0, 100) || '';
    const placeholder = (el as HTMLInputElement).placeholder || '';
    results.push(`INPUT: <${tag} ${attrs}> text="${text}" placeholder="${placeholder}"`);
  });

  document.querySelectorAll('button, [role="button"], a[href]').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const key = tag === 'a' ? 'LINK' : 'BUTTON';
    const attrs = Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(' ');
    const text = (el as HTMLElement).innerText?.substring(0, 100) || '';
    results.push(`${key}: <${tag} ${attrs}> text="${text}"`);
  });

  return results;
}

async function main() {
  const context = await launchBrowser({ headless: false });
  const page = context.pages()[0] || await context.newPage();

  log.info('Navigating to Flow...');
  await page.goto(CONFIG.FLOW_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Dismiss any notification popups
  try {
    const closeBtn = page.locator('button:has-text("close")').first();
    if (await closeBtn.isVisible({ timeout: 2000 })) {
      await closeBtn.click();
      log.info('Dismissed popup');
      await page.waitForTimeout(1000);
    }
  } catch {}

  log.info('URL: ' + page.url());

  // Click "Dự án mới" (New Project)
  log.info('Clicking "Dự án mới"...');
  const newProjectBtn = page.locator('button:has-text("Dự án mới")').first();
  if (await newProjectBtn.isVisible({ timeout: 3000 })) {
    await newProjectBtn.click();
    log.info('Clicked! Waiting 10s for editor to load...');
    await page.waitForTimeout(10000);
  } else {
    log.warn('"Dự án mới" not found');
  }

  log.info('URL after New Project: ' + page.url());
  log.info('=== EDITOR ELEMENTS ===');
  const elements = await page.evaluate(dumpScript);
  for (const el of elements) console.log(el);

  // Take a screenshot for debugging
  await page.screenshot({ path: 'd:/DEV/1000h/gg-flow/debug-screenshot.png', fullPage: false });
  log.info('Screenshot saved to debug-screenshot.png');

  log.info('\nClose browser when done.');
  await new Promise<void>((resolve) => {
    context.on('close', () => resolve());
  });
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
