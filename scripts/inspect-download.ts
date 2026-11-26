import { launchBrowser } from '../src/browser.js';
import { log } from '../src/logger.js';
import { FlowPage } from '../src/flow-page.js';

/**
 * Inspect the "+" popup in more detail — how to select an image and attach it.
 * Reuse the project from last inspect (has 1 image).
 */
async function main() {
  const context = await launchBrowser({ headless: false });
  const page = context.pages()[0] || await context.newPage();
  const flowPage = new FlowPage(page);

  await flowPage.navigateToFlow();
  await flowPage.waitForAppReady();
  await flowPage.createNewProject();

  // Gen 1 image
  await flowPage.configureModel('image', '16:9', 1);
  await flowPage.enterPrompt('A portrait headshot of a young woman, studio lighting');
  await flowPage.clickGenerate();
  await flowPage.waitForImageGeneration();
  log.info('Image generated!');

  // Open "+" popup
  const addBtn = page.locator('button:has-text("add_2")').first();
  await addBtn.click();
  await page.waitForTimeout(3000);

  // Dump popup elements (flat, no recursion to avoid __name issue)
  log.info('=== POPUP ELEMENTS ===');
  const tree = await page.evaluate(() => {
    const results: string[] = [];
    const dialog = document.querySelector('[role="dialog"][data-state="open"]');
    if (!dialog) return ['No dialog found'];

    dialog.querySelectorAll('*').forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || '';
      const cls = el.className?.toString?.()?.substring(0, 50) || '';
      const text = (el as HTMLElement).innerText?.split('\n')[0]?.substring(0, 60) || '';
      const dataState = el.getAttribute('data-state') || '';
      const tabindex = el.getAttribute('tabindex') || '';
      const src = (el as HTMLImageElement).src?.substring(0, 80) || '';

      if (['button', 'input', 'img', 'a'].includes(tag) || role || tabindex) {
        let info = `<${tag}`;
        if (role) info += ` role="${role}"`;
        if (dataState) info += ` state="${dataState}"`;
        if (tabindex) info += ` tabindex="${tabindex}"`;
        if (cls) info += ` class="${cls}"`;
        info += `>`;
        if (text && !el.children.length) info += ` "${text}"`;
        if (tag === 'img') info += ` src="${src}"`;
        results.push(info);
      }
    });
    return results;
  });
  for (const line of tree) console.log(line);

  // Now try clicking the PARENT div of the image (not the img itself)
  log.info('\n=== TRYING TO CLICK IMAGE CONTAINER ===');
  const imgContainer = page.locator('[role="dialog"] .sc-903adef0-11, [role="dialog"] [class*="903adef0"]').first();
  if (await imgContainer.isVisible({ timeout: 2000 }).catch(() => false)) {
    log.info('Found image container, clicking...');
    await imgContainer.click();
    await page.waitForTimeout(2000);

    // Check if popup changed or image got attached
    const afterState = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][data-state="open"]');
      const promptArea = document.querySelector('[data-slate-editor="true"]');
      const promptParent = promptArea?.closest('div');
      const imgs = promptParent?.querySelectorAll('img') || [];

      return {
        dialogStillOpen: !!dialog,
        promptImages: imgs.length,
        dialogContent: dialog?.textContent?.substring(0, 200) || 'closed',
      };
    });
    log.info('After click:');
    log.info(`  Dialog still open: ${afterState.dialogStillOpen}`);
    log.info(`  Prompt area images: ${afterState.promptImages}`);
    log.info(`  Dialog content: ${afterState.dialogContent.substring(0, 100)}`);
  }

  // Try another approach: click the large preview image
  log.info('\n=== TRYING LARGE PREVIEW IMAGE ===');
  const largeImg = page.locator('[role="dialog"] .sc-903adef0-4 img, [role="dialog"] img[class*="903adef0"]').first();
  if (await largeImg.isVisible({ timeout: 2000 }).catch(() => false)) {
    log.info('Found large preview, clicking...');
    await largeImg.click();
    await page.waitForTimeout(2000);
  }

  // Check prompt area for attached images (look wider)
  log.info('\n=== CHECK PROMPT AREA FOR ATTACHMENTS ===');
  const attachments = await page.evaluate(() => {
    const results: string[] = [];
    // Look for images anywhere near the prompt input area
    const promptSection = document.querySelector('[data-slate-editor="true"]')?.closest('form, section, div[class*="prompt"], div[class*="input"]');
    if (promptSection) {
      promptSection.querySelectorAll('img').forEach((img) => {
        results.push(`ATTACHED: ${img.offsetWidth}x${img.offsetHeight} src=${img.src.substring(0, 80)}`);
      });
    }
    // Also check for any chips/tags that represent attached items
    document.querySelectorAll('[class*="chip"], [class*="tag"], [class*="badge"], [class*="attached"]').forEach((el) => {
      const text = (el as HTMLElement).innerText?.substring(0, 60) || '';
      if (text) results.push(`CHIP: "${text}"`);
    });
    return results;
  });
  for (const a of attachments) console.log(a);

  await page.screenshot({ path: 'd:/DEV/1000h/gg-flow/debug-dl-2-resolution.png' });
  log.info('Screenshot saved');

  log.info('\nClose browser when done.');
  await new Promise<void>((resolve) => {
    context.on('close', () => resolve());
  });
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
