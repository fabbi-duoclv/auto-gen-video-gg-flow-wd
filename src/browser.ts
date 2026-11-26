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
    // Selector của FlowPage dựa vào chữ tiếng Việt ("Dự án mới", "Tạo", "Không thành công"...):
    // ép giao diện Flow về tiếng Việt, không phụ thuộc ngôn ngữ mặc định của máy/tài khoản.
    locale: 'vi-VN',
    extraHTTPHeaders: { 'Accept-Language': 'vi-VN,vi;q=0.9' },
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
  const fresh = !sharedContext;
  const ctx = await getSharedBrowser(options);
  // Chrome tự mở một tab about:blank khi khởi động mà không ai dùng: đóng sau khi đã có tab Flow thật.
  const initial = fresh ? ctx.pages() : [];
  const page = await ctx.newPage();
  for (const p of initial) {
    if (p !== page && p.url() === 'about:blank') await p.close().catch(() => {});
  }
  return page;
}

/** Close the shared browser if open */
export async function closeSharedBrowser(): Promise<void> {
  if (sharedContext) {
    await sharedContext.close();
    sharedContext = null;
  }
}
