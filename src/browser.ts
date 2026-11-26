import { chromium, type BrowserContext, type Page } from 'playwright';
import { CONFIG } from './config.js';
import { log } from './logger.js';

export interface BrowserOptions {
  headless?: boolean;
}

/** Launch a NEW persistent context (for CLI mode or login) */
export async function launchBrowser(options: BrowserOptions = {}): Promise<BrowserContext> {
  const headless = options.headless ?? false;

  log.info(`Launching browser (${headless ? 'headless' : 'headed'})...`);

  const context = await chromium.launchPersistentContext(CONFIG.BROWSER_DATA_DIR, {
    headless,
    viewport: { width: 1920, height: 1080 },
    acceptDownloads: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  log.success('Browser launched');
  return context;
}

// ─── Shared BrowserContext (for multi-flow web mode) ─────────

let sharedContext: BrowserContext | null = null;

/** Get or create the shared BrowserContext (single Google login session) */
export async function getSharedBrowser(options: BrowserOptions = {}): Promise<BrowserContext> {
  if (sharedContext) return sharedContext;

  sharedContext = await launchBrowser(options);
  sharedContext.on('close', () => { sharedContext = null; });
  return sharedContext;
}

/** Create a new Page (tab) in the shared BrowserContext */
export async function createFlowPage(options: BrowserOptions = {}): Promise<Page> {
  const ctx = await getSharedBrowser(options);
  return ctx.newPage();
}

/** Close the shared browser if open */
export async function closeSharedBrowser(): Promise<void> {
  if (sharedContext) {
    await sharedContext.close();
    sharedContext = null;
  }
}
