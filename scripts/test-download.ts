import { launchBrowser } from '../src/browser.js';
import { log } from '../src/logger.js';
import { FlowPage } from '../src/flow-page.js';

async function main() {
  const context = await launchBrowser({ headless: false });
  const page = context.pages()[0] || await context.newPage();

  // Go to project with videos
  const projectUrl = 'https://labs.google/fx/vi/tools/flow/project/74c16338-861d-420b-a9cb-f5850f148837';
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  const flowPage = new FlowPage(page);
  await flowPage.dismissPopups();

  // Test download video with 720p specifically
  log.info('Testing video download (720p)...');
  try {
    // Right-click last visible media
    const imgs = page.locator('button.sc-d64366c4-1 img');
    const count = await imgs.count();
    for (let i = count - 1; i >= 0; i--) {
      const el = imgs.nth(i);
      if (await el.isVisible().catch(() => false)) {
        await el.click({ button: 'right' });
        break;
      }
    }
    await page.waitForTimeout(1500);

    // Click "Tải xuống"
    const dlItem = page.getByText('Tải xuống', { exact: false }).first();
    await dlItem.waitFor({ state: 'visible', timeout: 5000 });
    await dlItem.click();
    await page.waitForTimeout(2000);

    // Check what resolutions are available
    const resTexts = ['720p', '1080p', '2K', '1K', '4K'];
    for (const r of resTexts) {
      const btn = page.getByText(r, { exact: false }).first();
      const visible = await btn.isVisible({ timeout: 500 }).catch(() => false);
      log.info(`  ${r}: ${visible ? 'VISIBLE' : 'not found'}`);
    }

    // Click 720p
    const res720 = page.getByText('720p', { exact: false }).first();
    if (await res720.isVisible({ timeout: 2000 })) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        res720.click(),
      ]);
      await download.saveAs('d:/DEV/1000h/gg-flow/output/test_video_720p.mp4');
      log.success('Video 720p downloaded!');
    } else {
      log.error('720p option not found');
    }
  } catch (err) {
    log.error('Failed: ' + (err as Error).message);
  }

  await context.close();
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
