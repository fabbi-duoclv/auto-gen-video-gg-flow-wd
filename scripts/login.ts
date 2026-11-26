import { launchBrowser } from '../src/browser.js';
import { CONFIG } from '../src/config.js';
import { log } from '../src/logger.js';

async function main() {
  log.info('=== GOOGLE FLOW LOGIN ===');
  log.info('Browser will open. Please:');
  log.info('  1. Click "Create with Flow" on the page');
  log.info('  2. Log in to your Google account');
  log.info('  3. Wait until you see the Flow editor (prompt input)');
  log.info('  4. Close the browser window to save session\n');

  const context = await launchBrowser({ headless: false });
  const page = context.pages()[0] || await context.newPage();

  // Navigate to Flow landing page
  await page.goto(CONFIG.FLOW_URL, { waitUntil: 'domcontentloaded' });

  // Wait for user to log in and reach the editor
  // Check periodically if we're on the editor page
  const checkInterval = setInterval(async () => {
    try {
      const url = page.url();
      if (url.includes('labs.google/fx') && !url.includes('accounts.google.com')) {
        // Check if we see editor elements (not the landing page)
        const hasEditor = await page.locator('textarea, [contenteditable="true"], [role="textbox"]').first().isVisible({ timeout: 1000 }).catch(() => false);
        if (hasEditor) {
          log.success('Flow editor detected! Session is active.');
          log.info('You can now close the browser to save the session.');
        }
      }
    } catch { /* page navigating */ }
  }, 5000);

  // Wait for user to close the browser
  await new Promise<void>((resolve) => {
    context.on('close', () => {
      clearInterval(checkInterval);
      resolve();
    });
  });

  log.success('Session saved! You can now run: npm start');
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
