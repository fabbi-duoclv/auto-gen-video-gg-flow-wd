import { launchBrowser } from '../src/browser.js';
import { CONFIG } from '../src/config.js';
import { log } from '../src/logger.js';
import { FlowPage } from '../src/flow-page.js';

async function main() {
  const context = await launchBrowser({ headless: false });
  const page = context.pages()[0] || await context.newPage();
  const flowPage = new FlowPage(page);

  await flowPage.navigateToFlow();
  await flowPage.waitForAppReady();
  await flowPage.ensureInEditor();

  await flowPage.enterPrompt('A beautiful sunset over the ocean, cinematic');
  await flowPage.clickGenerate();

  log.info('Waiting 30s for image to generate...');
  await page.waitForTimeout(30000);

  // Take screenshot
  await page.screenshot({ path: 'd:/DEV/1000h/gg-flow/debug-after-gen.png' });

  // Dump all elements
  log.info('=== ALL ELEMENTS ===');
  const elements = await page.evaluate(() => {
    const results: string[] = [];
    const all = document.querySelectorAll('*');
    all.forEach((el) => {
      const text = (el as HTMLElement).innerText?.substring(0, 80) || '';
      const tag = el.tagName.toLowerCase();
      if (['button', 'a', 'img', 'video', 'input', 'textarea'].includes(tag) ||
          el.getAttribute('role') === 'button' ||
          el.getAttribute('role') === 'menuitem' ||
          el.getAttribute('contenteditable') === 'true') {
        const attrs = Array.from(el.attributes)
          .filter(a => ['class', 'role', 'aria-label', 'data-state', 'href', 'src', 'type'].includes(a.name))
          .map(a => `${a.name}="${a.value?.substring(0, 80)}"`)
          .join(' ');
        results.push(`${tag}: [${attrs}] text="${text}"`);
      }
    });
    return results;
  });
  for (const el of elements) console.log(el);

  // Now hover over first img and wait
  log.info('\n=== HOVERING OVER IMAGE ===');
  const images = page.locator('img');
  const imgCount = await images.count();
  log.info(`Found ${imgCount} images`);

  // Try hovering each image
  for (let i = 0; i < Math.min(imgCount, 5); i++) {
    const img = images.nth(i);
    const src = await img.getAttribute('src') || '';
    log.info(`Image ${i}: src=${src.substring(0, 80)}`);

    if (src.includes('recaptcha') || src.includes('data:image/svg')) continue;

    await img.hover();
    await page.waitForTimeout(2000);

    // Check what appeared after hover
    const hoverElements = await page.evaluate(() => {
      const results: string[] = [];
      document.querySelectorAll('button, [role="button"], [role="menuitem"]').forEach((el) => {
        const text = (el as HTMLElement).innerText?.substring(0, 80) || '';
        const visible = (el as HTMLElement).offsetParent !== null;
        if (visible && text) {
          results.push(`VISIBLE_BTN: text="${text}"`);
        }
      });
      return results;
    });
    log.info(`After hovering image ${i}:`);
    for (const el of hoverElements) console.log(`  ${el}`);
  }

  log.info('\nClose browser when done.');
  await new Promise<void>((resolve) => {
    context.on('close', () => resolve());
  });
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
