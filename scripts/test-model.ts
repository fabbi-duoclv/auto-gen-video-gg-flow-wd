import { launchBrowser } from '../src/browser.js';
import { log } from '../src/logger.js';
import { FlowPage } from '../src/flow-page.js';

async function main() {
  const context = await launchBrowser({ headless: false });
  const page = context.pages()[0] || await context.newPage();
  const flowPage = new FlowPage(page);

  await flowPage.navigateToFlow();
  await flowPage.waitForAppReady();
  await flowPage.createNewProject();

  // Set image mode
  await flowPage.configureModel('image', '16:9', 1);

  // Verify
  const modelBtn = page.locator('button:has-text("crop_")').first();
  const text = (await modelBtn.innerText()).replace(/\n/g, ' | ');
  log.info(`Final: "${text}"`);

  if (text.includes('Hình ảnh') || text.includes('image') || text.includes('Banana')) {
    log.success('Image mode OK');
  } else {
    log.error('NOT in image mode! Got: ' + text);
  }

  await context.close();
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
