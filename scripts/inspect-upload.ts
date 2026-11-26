/**
 * Khảo sát popup "+" của Flow để chỉnh selector upload (src/ref-photos.ts).
 * In ra: nút/mục có chữ liên quan tải lên, số input[type=file], HTML popup; lưu ảnh chụp + HTML vào output/debug/.
 * Tùy chọn --file <ảnh>: thử luôn upload tệp đó và báo chế độ nào chạy được.
 *
 * Chạy:  npx tsx scripts/inspect-upload.ts [--file ./wedding-video/photos/co-dau.jpg]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchBrowser } from '../src/browser.js';
import { CONFIG } from '../src/config.js';
import { log } from '../src/logger.js';
import { FlowPage } from '../src/flow-page.js';

async function main() {
  const fileArg = process.argv.indexOf('--file');
  const file = fileArg > -1 ? resolve(process.argv[fileArg + 1]) : undefined;

  const context = await launchBrowser({ headless: false });
  const page = context.pages()[0] || (await context.newPage());
  const fp = new FlowPage(page);

  await fp.navigateToFlow();
  await fp.waitForAppReady();
  if (!(await fp.isLoggedIn())) await fp.waitForManualLogin();
  await fp.createNewProject();

  const addBtn = page.locator('button:has-text("add_2")').first();
  if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    log.error('Không thấy nút "+" (add_2). Chụp màn hình và gửi lại để chỉnh selector.');
  } else {
    await addBtn.click();
    await page.waitForTimeout(2000);
  }

  mkdirSync(CONFIG.DEBUG_DIR, { recursive: true });
  const base = join(CONFIG.DEBUG_DIR, `inspect-upload-${Date.now()}`);
  await page.screenshot({ path: `${base}.png` });

  const dialog = page.locator('[role="dialog"][data-state="open"]').first();
  const html = await dialog.evaluate((el) => el.outerHTML).catch(() => '');
  if (html) writeFileSync(`${base}-dialog.html`, html);
  log.info(`Popup mở: ${!!html}. HTML ${html.length} ký tự. Đã lưu ${base}.png${html ? ' và -dialog.html' : ''}`);

  const cands = await page.evaluate(() => {
    const re = /tải.{0,12}lên|upload/i;
    return Array.from(document.querySelectorAll('button, [role="button"], [role="menuitem"], label, div[tabindex="0"], span'))
      .filter((el) => re.test((el as HTMLElement).innerText || ''))
      .slice(0, 15)
      .map((el) => `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}: "${((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').slice(0, 60)}"`);
  });
  log.info(`Ứng viên nút tải lên (${cands.length}):\n  ${cands.join('\n  ') || '(không có)'}`);
  log.info(`Số input[type=file] trong trang: ${await page.locator('input[type="file"]').count()}`);
  const items = await dialog.locator('div[tabindex="0"]:has(img)').count().catch(() => 0);
  log.info(`Số mục ảnh trong popup (div[tabindex=0]:has(img)): ${items}`);

  if (file) {
    log.info(`Thử upload ${file} ...`);
    const trigger = page.locator('button, [role="button"], [role="menuitem"], label').filter({ hasText: /tải.{0,12}lên|upload/i }).first();
    let mode = 'không chạy được';
    if (await trigger.isVisible({ timeout: 2000 }).catch(() => false)) {
      try {
        const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), trigger.click()]);
        await chooser.setFiles(file);
        mode = 'bấm nút + hộp chọn tệp';
      } catch { /* thử input */ }
    }
    if (mode === 'không chạy được' && (await page.locator('input[type="file"]').count()) > 0) {
      await page.locator('input[type="file"]').first().setInputFiles(file);
      mode = 'input[type=file]';
    }
    log.info(`Kết quả: ${mode}. Chờ 10s rồi chụp lại...`);
    await page.waitForTimeout(10_000);
    await page.screenshot({ path: `${base}-after-upload.png` });
    log.info(`Đã lưu ${base}-after-upload.png`);
  }

  log.info('Xong. Đóng cửa sổ trình duyệt để kết thúc.');
  await new Promise<void>((r) => context.on('close', () => r()));
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
