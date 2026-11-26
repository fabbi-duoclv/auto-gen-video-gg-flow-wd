import { launchBrowser } from '../src/browser.js';
import { log } from '../src/logger.js';
import { FlowPage } from '../src/flow-page.js';

async function main() {
  const context = await launchBrowser({ headless: false });
  const page = context.pages()[0] || await context.newPage();
  const flowPage = new FlowPage(page);

  // Go to project that has images (from last test)
  const projectUrl = 'https://labs.google/fx/vi/tools/flow/project/5f36c92e-74f7-4ae4-ab98-2e34d1951349';
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  await flowPage.dismissPopups();

  // Step 1: Check model button BEFORE animate
  const modelBtn = page.locator('button:has-text("crop_")').first();
  if (await modelBtn.isVisible({ timeout: 3000 })) {
    log.info(`BEFORE animate: "${(await modelBtn.innerText()).replace(/\n/g, ' | ')}"`);
  }

  // Step 2: Right-click image → "Tạo ảnh động" (don't generate, just switch mode)
  log.info('Clicking "Tạo ảnh động"...');
  try {
    await flowPage.clickAnimate();
  } catch (e) {
    log.warn('clickAnimate: ' + (e as Error).message);
  }

  // Step 3: Check model button AFTER animate
  const modelBtn2 = page.locator('button:has-text("crop_")').first();
  if (await modelBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
    log.info(`AFTER animate: "${(await modelBtn2.innerText()).replace(/\n/g, ' | ')}"`);
  }

  // Step 4: Open model menu and dump ALL tabs
  log.info('Opening model menu...');
  await modelBtn2.click();
  await page.waitForTimeout(2000);

  const tabs = await page.evaluate(() => {
    const results: string[] = [];
    document.querySelectorAll('button[role="tab"]').forEach((el) => {
      const text = (el as HTMLElement).innerText?.trim() || '';
      const state = el.getAttribute('data-state') || '';
      if (text) results.push(`[${state}] "${text}"`);
    });
    return results;
  });
  log.info('=== MODEL MENU TABS ===');
  for (const t of tabs) console.log(t);

  // Step 5: Try configureModel for video
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  log.info('\nTesting configureModel("video", "16:9", 1)...');
  await flowPage.configureModel('video', '16:9', 1);

  // Step 6: Verify final state
  if (await modelBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
    log.info(`FINAL: "${(await modelBtn2.innerText()).replace(/\n/g, ' | ')}"`);
  }

  await context.close();
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
