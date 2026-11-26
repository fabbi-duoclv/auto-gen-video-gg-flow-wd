import { type Page, type Locator } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG } from './config.js';
import { log } from './logger.js';
import { attachReferencesByPhoto, type RefPhoto } from './ref-photos.js';

/**
 * Page Object Model for Google Flow (labs.google/fx/vi/tools/flow)
 *
 * Selectors discovered from live UI inspection (2026-03-21):
 * - Prompt input: div[role="textbox"][data-slate-editor="true"]
 * - Generate button: last button with text "Tạo"
 * - New project: button "Dự án mới"
 * - Generated image: button.sc-d64366c4-1 > img.sc-d64366c4-3
 * - Generated video: button.sc-d64366c4-1 > video (visible)
 * - Context menu: right-click → [data-radix-collection-item]
 * - "Tải xuống": context menu item with text containing "Tải xuống"
 * - "Tạo ảnh động": context menu item with text "Tạo ảnh động"
 */

// Selector for generated media cards (images/videos in project grid)
const MEDIA_CARD = 'button.sc-d64366c4-1';
const MEDIA_IMG = `${MEDIA_CARD} img`;
const MEDIA_VIDEO = `${MEDIA_CARD} video`;
// Thẻ báo lỗi tạo ảnh/video của Flow. Tiếng Việt: "Không thành công". Tiếng Anh: tiêu đề "Failed" kèm
// "This prompt might violate our policies…" và "You will be refunded for this generation…".
// "Failed" chỉ khớp khi là cả nội dung phần tử (tránh trúng chữ khác); các cụm còn lại khớp một phần.
const FAILURE_RE = /Không thành công|Thất bại|You will be refunded|violate our policies|^\s*Failed\s*$/i;
// Ô nhập prompt: giao diện cũ dùng Slate, giao diện mới dùng ProseMirror.
const PROMPT_INPUT = 'div[role="textbox"][data-slate-editor="true"], div.ProseMirror[role="textbox"]';
// Nút tạo dự án: giao diện tiếng Việt ghi "Dự án mới", tiếng Anh ghi "New project".
const NEW_PROJECT_BTN = 'button:has-text("Dự án mới"), button:has-text("New project")';

export class FlowPage {
  /** Ảnh thật đã upload (có khi dùng cột "Ảnh tham chiếu" trong sheet Characters). Có ⇒ gắn theo nội dung ảnh. */
  public refPhotos?: RefPhoto[];

  constructor(public readonly page: Page) {}

  // ─── Navigation ───────────────────────────────────────────

  async navigateToFlow(): Promise<void> {
    await this.page.goto(CONFIG.FLOW_URL, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(3000);
    await this.dismissPopups();
  }

  async waitForAppReady(): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await this.page.waitForTimeout(2000);
  }

  async dismissPopups(): Promise<void> {
    try {
      const closeBtn = this.page.locator('button:has-text("close")').first();
      if (await closeBtn.isVisible({ timeout: 2000 })) {
        await closeBtn.click();
        await this.page.waitForTimeout(500);
      }
    } catch { /* no popup */ }
  }

  // ─── Project Management ───────────────────────────────────

  async createNewProject(): Promise<void> {
    log.info('Creating new project...');

    // If already in a project, go back to dashboard first
    if (this.page.url().includes('/project/')) {
      await this.page.goto(CONFIG.FLOW_URL, { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(3000);
      await this.dismissPopups();
    }

    const btn = this.page.locator(NEW_PROJECT_BTN).first();
    try {
      await btn.waitFor({ state: 'visible', timeout: 10_000 });
    } catch (e) {
      await this.dumpDiagnostics('new-project-missing');
      throw e;
    }
    // Force click — popup overlay may intercept normal clicks
    await btn.click({ force: true });
    await this.page.waitForURL('**/project/**', { timeout: 15_000 });
    await this.page.waitForTimeout(3000);
    await this.ensureClassicMode();
    log.success('New project created');
  }

  /**
   * Nút "+" của thanh nhập (mở popup ảnh tham chiếu). Icon cũ là `add_2`, giao diện mới là `add`;
   * trên trang có nhiều nút `add` (thanh trên, Library) nên lấy nút cuối trong DOM — nút của thanh nhập.
   */
  addRefButton(): Locator {
    return this.page.locator('button').filter({ hasText: /^\s*add(_2)?\s*$/ }).last();
  }

  /**
   * Flow đã thêm chế độ "trợ lý AI" (khung chat bên phải, nút gạt `spark`): ở chế độ đó không có ô prompt,
   * nút chọn model, nút "+" kiểu cũ. Thu gọn khung chat rồi tắt trợ lý (nút đổi thành `spark_off`) để có lại
   * thanh nhập cổ điển. Chạy nhiều lần vẫn an toàn.
   */
  async ensureClassicMode(): Promise<void> {
    const isClassic = () => this.page.locator('button:has-text("spark_off")').first().isVisible().catch(() => false);
    try {
      if (await isClassic()) return;
      const collapse = this.page.locator('button:has-text("right_panel_close")').first();
      if (await collapse.isVisible({ timeout: 3000 }).catch(() => false)) {
        await collapse.click();
        await this.page.waitForTimeout(1000);
      }
      const toggle = this.page.locator('button').filter({ hasText: /^\s*spark\s*$/ }).first();
      if (await toggle.isVisible({ timeout: 5000 }).catch(() => false)) {
        await toggle.click();
        await this.page.waitForTimeout(1500);
      }
      if (await isClassic()) log.info('Đã chuyển Flow về chế độ nhập cổ điển (tắt trợ lý AI)');
      else log.warn('Không bật được chế độ nhập cổ điển — giao diện Flow có thể đã đổi');
    } catch (e) {
      log.warn(`ensureClassicMode lỗi: ${(e as Error).message.split('\n')[0]}`);
    }
  }

  /** Khi một bước tìm nút thất bại: chụp trang + ghi URL/tiêu đề/các nút đang hiện để biết trang đang ở đâu. Không bao giờ ném lỗi. */
  async dumpDiagnostics(tag: string): Promise<void> {
    try {
      const url = this.page.url();
      const title = await this.page.title().catch(() => '?');
      const buttons = await this.page.locator('button').evaluateAll(
        (els) => els.map((el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean).slice(0, 25),
      ).catch(() => [] as string[]);
      const dir = join(process.cwd(), 'debug');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${tag}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
      await this.page.screenshot({ path: file, fullPage: false }).catch(() => {});
      log.warn(`[chẩn đoán] url=${url} | title="${title}" | nút: ${JSON.stringify(buttons)} | ảnh: ${file}`);
    } catch { /* chẩn đoán không được làm hỏng luồng chính */ }
  }

  async ensureInEditor(): Promise<void> {
    if (this.page.url().includes('/project/')) return;
    const btn = this.page.locator(NEW_PROJECT_BTN);
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.createNewProject();
    }
  }

  async navigateToProject(projectUrl: string): Promise<void> {
    await this.page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(5000);
    await this.dismissPopups();
    await this.ensureClassicMode();
  }

  getCurrentProjectUrl(): string {
    return this.page.url();
  }

  // ─── Attach Reference Images ─────────────────────────────

  /**
   * Attach reference images from project to the current prompt.
   *
   * Popup "+" shows images in "Đã dùng gần đây" order (newest first).
   * Refs were generated FIRST → they are at the END of the popup list.
   *
   * @param refIndices - 0-based indices of ref images (in generation order: 0=first ref, 1=second ref...)
   * @param totalRefs - total number of ref images generated at the start
   */
  async attachReferences(refIndices: number[], totalRefs: number): Promise<void> {
    if (refIndices.length === 0) return;

    // Chế độ video khung hình (giao diện mới): ảnh cảnh đã tự gắn làm khung đầu và thanh nhập không còn nút "+"
    // (chỉ còn nút "+" ở thanh trên cùng, mở menu Upload/New collection). Ảnh cảnh được tạo từ ảnh tham chiếu
    // nên đã có đủ nhân vật ⇒ bỏ qua, không bấm nhầm nút "+" ở thanh trên.
    // Nhận biết chế độ video qua nút model của thanh nhập (chữ dạng "Video · 720p · 8s"), không dựa vào vị trí
    // nút "+" (khung chi tiết bên phải cũng có nút "+" nên phép kiểm tra theo vị trí bị đánh lừa).
    const modelBtnText = await this.page.locator('button:has-text("crop_")').first().innerText({ timeout: 3000 }).catch(() => '');
    const inVideoMode = /^\s*Video\b/i.test(modelBtnText);
    if (inVideoMode) {
      log.warn('Thanh nhập không có nút "+" (chế độ video khung hình): bỏ qua gắn ảnh tham chiếu, dùng ảnh cảnh làm khung đầu');
      return;
    }

    // Ảnh thật đã upload: nhận diện theo nội dung, không theo vị trí (REF_MATCH_MODE=position để quay về cách cũ)
    if (this.refPhotos?.length && process.env.REF_MATCH_MODE !== 'position') {
      await attachReferencesByPhoto(this, refIndices);
      return;
    }

    for (const idx of refIndices) {
      const addBtn = this.addRefButton();
      if (!(await addBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
        log.warn('Attach ref: "+" button not found, skipping ref attachment');
        return;
      }
      await addBtn.click();
      await this.page.waitForTimeout(2000);

      const dialog = this.page.locator('[role="dialog"][data-state="open"]');
      await dialog.waitFor({ state: 'visible', timeout: 5000 });

      // Images in popup: newest first, refs are oldest → at the end
      const containers = dialog.locator('div[tabindex="0"]');
      const count = await containers.count();

      // Ref index 0 (first ref gen) → last in popup = count - totalRefs + 0
      // Ref index 1 (second ref gen) → second to last = count - totalRefs + 1
      const popupIdx = count - totalRefs + idx;

      if (popupIdx < 0 || popupIdx >= count) {
        log.warn(`Ref popup index ${popupIdx} out of range (${count} items, ${totalRefs} refs), skipping`);
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(500);
        continue;
      }

      await containers.nth(popupIdx).click();
      await this.page.waitForTimeout(1500);

      log.info(`Attached ref #${idx + 1} (popup position ${popupIdx + 1}/${count})`);
    }
  }

  // ─── Prompt Input ─────────────────────────────────────────

  /**
   * Clear all attached ref images from prompt area (click X on each thumbnail).
   */
  async clearAttachedRefs(): Promise<void> {
    // Ref thumbnails have an X button to remove them
    // They appear near the prompt input as small circular images with close button
    let removed = 0;
    while (true) {
      // Look for close/remove buttons on attached refs near prompt
      const closeBtn = this.page.locator('button:near(:text("Bạn muốn tạo gì")), button:near(:text("What do you want to create"))').filter({ hasText: 'close' }).first();
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.click({ force: true });
        await this.page.waitForTimeout(500);
        removed++;
      } else {
        break;
      }
    }
    if (removed > 0) {
      log.info(`Cleared ${removed} attached ref(s)`);
    }
  }

  async enterPrompt(prompt: string): Promise<void> {
    // First clear any attached refs from previous generation
    await this.clearAttachedRefs();

    const input = this.page.locator(PROMPT_INPUT).first();
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    await input.click();
    await this.page.waitForTimeout(300);

    // Clear existing text thoroughly — repeat to ensure empty
    for (let i = 0; i < 3; i++) {
      await this.page.keyboard.press('Control+A');
      await this.page.waitForTimeout(100);
      await this.page.keyboard.press('Backspace');
      await this.page.waitForTimeout(100);
    }

    // Verify empty
    const remaining = await input.innerText();
    if (remaining.trim() && !remaining.includes('Bạn muốn')) {
      log.warn(`Prompt not fully cleared: "${remaining.substring(0, 30)}...", retrying`);
      await input.fill('');
      await this.page.waitForTimeout(200);
    }

    await this.page.keyboard.type(prompt, { delay: 10 });
    log.info(`Prompt entered (${prompt.substring(0, 50)}...)`);
  }

  // ─── Model Settings (aspect ratio + generation count) ────

  async configureModel(
    mode: 'image' | 'video' = 'image',
    ratio: '16:9' | '9:16' | '1:1' = '16:9',
    count: number = 1,
    videoModel: 'fast' | 'quality' = 'fast',
  ): Promise<void> {
    try {
      const modelBtn = this.page.locator('button:has-text("crop_")').first();
      if (!(await modelBtn.isVisible({ timeout: 3000 }))) {
        log.warn('Model selector not found, using defaults');
        await this.dumpDiagnostics('model-selector-missing');
        return;
      }

      // Open model settings menu
      await modelBtn.click();
      await this.page.waitForTimeout(1000);

      // Set mode: "Hình ảnh" or "Video"
      // Giao diện cũ: button[role=tab] + data-state=active. Giao diện mới: [role=radio] + aria-checked=true,
      // chữ là tiếng Anh ("Image"/"Video"). Nhận cả hai.
      const TAB = '[role="tab"], [role="radio"]';
      const isOn = async (l: Locator) =>
        (await l.getAttribute('data-state').catch(() => null)) === 'active' ||
        (await l.getAttribute('aria-checked').catch(() => null)) === 'true' ||
        (await l.getAttribute('aria-selected').catch(() => null)) === 'true';
      const modeRe = mode === 'image' ? /Hình ảnh|Image/ : /Video/;
      const modeTab = this.page.locator(TAB).filter({ hasText: modeRe }).first();
      if (await modeTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        if (!(await isOn(modeTab))) {
          await modeTab.click();
          await this.page.waitForTimeout(500);
          log.info(`Mode set to ${mode}`);
        }
      }

      // Set aspect ratio
      const ratioKey = ratio.replace(':', '_');
      const ratioTab = this.page.locator(TAB).filter({ hasText: new RegExp(`crop_${ratioKey}|${ratio}\\s*$`) }).first();
      if (await ratioTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        if (!(await isOn(ratioTab))) {
          await ratioTab.click();
          await this.page.waitForTimeout(500);
          log.info(`Aspect ratio set to ${ratio}`);
        }
      }

      // Set generation count
      const countTab = this.page.locator(TAB).filter({ hasText: new RegExp(`^\\s*x${count}\\s*$`) }).first();
      if (await countTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        if (!(await isOn(countTab))) {
          await countTab.click();
          await this.page.waitForTimeout(500);
          log.info(`Generation count set to x${count}`);
        }
      }

      // Select video model (Veo 3.1 - Fast / Quality) when in video mode
      if (mode === 'video') {
        await this.selectVideoModel(videoModel);
      }

      // Close menu
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(500);

      // Verify
      const finalText = await modelBtn.innerText();
      log.info(`Model configured: ${finalText.replace(/\n/g, ' | ')}`);
    } catch {
      log.warn('Could not configure model settings');
    }
  }

  /**
   * Select Veo video model from the dropdown inside the model settings menu.
   * Dropdown button text: "Veo 3.1 - Fast arrow_drop_down"
   * Options (priority order):
   *   1. "Veo 3.1 - Fast [Lower Priority]" — free/cheaper, preferred
   *   2. "Veo 3.1 - Fast"                  — fallback
   *   3. "Veo 3.1 - Quality"               — highest quality
   */
  private async selectVideoModel(model: 'fast' | 'quality'): Promise<void> {
    // Build priority list: try Lower Priority first when choosing fast
    const candidates = model === 'fast'
      ? ['Veo 3.1 - Fast [Lower Priority]', 'Veo 3.1 - Fast']
      : ['Veo 3.1 - Quality'];

    // Find the Veo dropdown button (contains "Veo" and "arrow_drop_down")
    const dropdownBtn = this.page.locator('button:has-text("Veo")').first();
    if (!(await dropdownBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      log.warn('Veo model dropdown not found, skipping');
      return;
    }

    // Check if the TOP priority candidate is already selected
    const currentText = await dropdownBtn.innerText();
    if (currentText.includes(candidates[0])) {
      log.info(`Video model already set to ${candidates[0]}`);
      return;
    }

    // Always open dropdown to try the best candidate
    await dropdownBtn.click();
    await this.page.waitForTimeout(1000);

    // Try each candidate in priority order
    for (const label of candidates) {
      const option = this.page.getByText(label, { exact: true }).first();
      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        await option.click();
        await this.page.waitForTimeout(500);
        log.info(`Video model set to ${label}`);
        return;
      }
    }

    log.warn(`No matching Veo model found, keeping current: ${currentText.replace(/\n/g, ' ')}`);
    await this.page.keyboard.press('Escape');
  }

  // ─── Generate ─────────────────────────────────────────────

  async clickGenerate(): Promise<void> {
    const btn = this.page.locator('button:has-text("arrow_forward")').first();
    if (await btn.isVisible({ timeout: 3000 })) {
      await btn.click();
    } else {
      const allBtns = this.page.locator('button:has-text("Tạo")');
      const count = await allBtns.count();
      if (count > 0) await allBtns.nth(count - 1).click();
      else throw new Error('Generate button not found');
    }
    log.info('Clicked Generate');
  }

  // ─── Wait for Image Generation ────────────────────────────

  /**
   * Count content images (exclude avatar, placeholder, icons)
   */
  /**
   * Khóa nhận dạng ổn định của một ảnh/video trong lưới (địa chỉ ảnh bỏ phần tham số kích thước sau dấu "=").
   * Ô media mới tạo KHÔNG đảm bảo nằm đầu DOM (lưới cuộn, nhiều media, chế độ danh sách), nên ghi nhớ đúng
   * ô vừa sinh ra để chuột phải/tải xuống/tạo ảnh động đúng ô đó.
   */
  private newestMediaKey: string | null = null;

  private async contentImageKeys(): Promise<string[]> {
    return this.page.evaluate(() => {
      const keys: string[] = [];
      document.querySelectorAll('img').forEach((img) => {
        const src = img.src || '';
        if (img.offsetWidth > 100 && img.offsetHeight > 100 &&
            !src.includes('googleusercontent.com/a/') && !src.includes('placeholder') &&
            !src.includes('recaptcha') && !src.includes('.svg')) {
          keys.push(src.split('=')[0]);
        }
      });
      return keys;
    });
  }

  /** So với danh sách trước khi tạo: ô nào mới xuất hiện thì ghi nhớ làm "ô mới nhất". */
  private async rememberNewMedia(before: string[]): Promise<void> {
    const now = await this.contentImageKeys();
    const fresh = now.filter((k) => !before.includes(k));
    this.newestMediaKey = fresh[0] ?? null;
    if (!this.newestMediaKey) log.warn('Không xác định được ô media mới, sẽ dùng ô đầu lưới');
  }

  private async countContentImages(): Promise<number> {
    return this.page.evaluate(() => {
      let count = 0;
      document.querySelectorAll('img').forEach((img) => {
        const src = img.src || '';
        const w = img.offsetWidth;
        const h = img.offsetHeight;
        // Skip avatar, placeholder, icons, recaptcha (small or known URLs)
        if (w > 100 && h > 100 &&
            !src.includes('googleusercontent.com/a/') &&
            !src.includes('placeholder') &&
            !src.includes('recaptcha') &&
            !src.includes('.svg')) {
          count++;
        }
      });
      return count;
    });
  }

  /** Số thẻ báo lỗi đang hiện trên trang (cả tiếng Việt lẫn tiếng Anh). */
  private async countFailures(): Promise<number> {
    return this.page.getByText(FAILURE_RE).count().catch(() => 0);
  }

  /** Đọc nội dung lỗi Flow hiển thị (vd. "This prompt might violate our policies…") để báo cáo lý do thật. */
  private async readFailureReason(): Promise<string> {
    const text = await this.page
      .evaluate((src) => {
        const re = new RegExp(src.s, src.f);
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const found: string[] = [];
        let n: Node | null;
        while ((n = w.nextNode())) {
          if (re.test(n.textContent || '')) {
            // Leo lên khối chứa dòng lỗi (tiêu đề + lý do + dòng hoàn credit), dừng trước khi quá lớn
            // (tránh nuốt cả lưới media). Mỗi dòng lỗi cho ra một khối; lấy khối đầy đủ nhất.
            let el = (n as Text).parentElement;
            for (let i = 0; i < 4 && el?.parentElement && (el.parentElement.innerText || '').length <= 400; i++) el = el.parentElement;
            found.push(((el?.innerText || n.textContent) ?? '').replace(/\s+/g, ' ').trim());
          }
        }
        found.sort((a, b) => b.length - a.length);
        return found[0] || '';
      }, { s: FAILURE_RE.source, f: FAILURE_RE.flags.replace('g', '') })
      .catch(() => '');
    return text.slice(0, 300) || 'không đọc được nội dung lỗi';
  }

  async waitForImageGeneration(): Promise<void> {
    log.info('Waiting for image generation...');

    // Wait initial period then count — so old failures are fully loaded
    await this.page.waitForTimeout(10_000);

    const existingFailCount = await this.countFailures();
    const existingImgCount = await this.countContentImages();
    const beforeKeys = await this.contentImageKeys();
    log.info(`Existing after initial wait: ${existingFailCount} fails, ${existingImgCount} images`);

    const startTime = Date.now();

    let lastLogTime = Date.now();
    while (Date.now() - startTime < CONFIG.IMAGE_GENERATION_TIMEOUT_MS) {
      const failCount = await this.countFailures();
      if (failCount > existingFailCount) {
        throw new Error(`Flow báo tạo ảnh thất bại: ${await this.readFailureReason()}`);
      }

      const imgCount = await this.countContentImages();
      if (imgCount > existingImgCount) {
        await this.page.waitForTimeout(2000);
        await this.rememberNewMedia(beforeKeys);
        log.success(`Image generation complete (${existingImgCount} → ${imgCount})`);
        return;
      }

      if (Date.now() - lastLogTime > 30_000) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        log.info(`Still waiting for image... (${elapsed}s elapsed)`);
        lastLogTime = Date.now();
      }

      await this.page.waitForTimeout(3000);
    }

    throw new Error('Image generation timed out');
  }

  // ─── Context Menu (right-click) ───────────────────────────

  /**
   * Right-click on the NEWEST media (first in grid = most recently generated).
   * Google Flow shows newest items first (top-left).
   */
  private async rightClickMedia(type: 'image' | 'video'): Promise<void> {
    if (type === 'image') {
      // Ưu tiên đúng ô vừa tạo (đã ghi nhớ), sau đó mới tới "ảnh lớn đầu tiên".
      const wantKey = this.newestMediaKey;
      const target = await this.page.evaluateHandle((key) => {
        const imgs = Array.from(document.querySelectorAll('img'));
        if (key) {
          const hit = imgs.find((img) => (img.src || '').split('=')[0] === key && img.offsetWidth > 100 && img.offsetHeight > 100);
          if (hit) { hit.scrollIntoView({ block: 'center' }); return hit; }
        }
        for (const img of imgs) {
          const src = img.src || '';
          if (img.offsetWidth > 100 && img.offsetHeight > 100 &&
              !src.includes('googleusercontent.com/a/') &&
              !src.includes('placeholder') &&
              !src.includes('.svg')) {
            return img;
          }
        }
        return null;
      }, wantKey);

      if (!target) throw new Error('No visible image found');
      await (target as any).click({ button: 'right', force: true });
      await this.page.waitForTimeout(1500);
    } else {
      // Video: first visible video/img in grid (newest)
      const selectors = [MEDIA_VIDEO, MEDIA_IMG];
      for (const selector of selectors) {
        const el = this.page.locator(selector).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          await el.click({ button: 'right', force: true });
          await this.page.waitForTimeout(1500);
          return;
        }
      }
      // Giao diện mới: ô video chỉ là ảnh bìa (không có thẻ <video>, không có class cũ). Ô mới nhất nằm đầu lưới
      // nên dùng lại cách chọn "ảnh lớn đầu tiên" của nhánh ảnh.
      await this.rightClickMedia('image');
    }
  }

  private async clickContextMenuItem(text: string): Promise<void> {
    // Context menu items are [data-radix-collection-item] with icon prefix
    // e.g. "download\nTải xuống" — use getByText for partial match
    // Flow có thể hiện tiếng Việt hoặc tiếng Anh tùy tài khoản: nhận cả hai.
    const ALIASES: Record<string, string[]> = {
      'Tải xuống': ['Tải xuống', 'Download'],
      'Tạo ảnh động': ['Tạo ảnh động', 'Animate'],
    };
    const names = ALIASES[text] ?? [text];
    const re = new RegExp(names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
    // Ưu tiên mục trong menu/overlay (tránh trúng chữ "Download" ở chỗ khác trên trang).
    const menuItem = this.page
      .locator('[role="menuitem"], .mat-mdc-menu-item, [data-radix-collection-item], .cdk-overlay-container button')
      .filter({ hasText: re })
      .first();
    const item = (await menuItem.isVisible({ timeout: 3000 }).catch(() => false))
      ? menuItem
      : this.page.getByText(re).first();
    await item.waitFor({ state: 'visible', timeout: 5000 });
    await item.click();
    await this.page.waitForTimeout(1500);
  }

  // ─── Video Generation ─────────────────────────────────────

  async clickAnimate(): Promise<void> {
    await this.rightClickMedia('image');
    await this.clickContextMenuItem('Tạo ảnh động');
    log.info('Clicked "Tạo ảnh động"');
    await this.page.waitForTimeout(2000);
  }

  /**
   * Enter video prompt WITHOUT clearing attached refs/first frame.
   * After "Tạo ảnh động", the first frame is auto-attached — must NOT clear it.
   * Only clear text, keep all attached images.
   */
  async enterVideoPrompt(prompt: string): Promise<void> {
    await this.page.waitForTimeout(1000);

    const input = this.page.locator(PROMPT_INPUT).first();
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    await input.click();
    await this.page.waitForTimeout(300);

    // Only clear TEXT, do NOT call clearAttachedRefs()
    for (let i = 0; i < 3; i++) {
      await this.page.keyboard.press('Control+A');
      await this.page.waitForTimeout(100);
      await this.page.keyboard.press('Backspace');
      await this.page.waitForTimeout(100);
    }

    await this.page.keyboard.type(prompt, { delay: 10 });
    log.info('Video prompt entered (kept first frame attached)');
  }

  async clickGenerateVideo(): Promise<void> {
    await this.clickGenerate();
    log.info('Clicked Generate Video');
  }

  /**
   * Count visible video elements (large, not hidden)
   */
  private async countVisibleVideos(): Promise<number> {
    return this.page.evaluate(() => {
      let count = 0;
      document.querySelectorAll('video').forEach((vid) => {
        if (vid.offsetWidth > 100 && vid.offsetHeight > 100) {
          count++;
        }
      });
      return count;
    });
  }

  async waitForVideoGeneration(): Promise<void> {
    log.info('Waiting for video generation...');

    // Wait initial period for generation to start
    await this.page.waitForTimeout(15_000);

    // Count AFTER initial wait — so old failures are fully loaded
    const existingFailCount = await this.countFailures();
    const existingVideoCount = await this.countVisibleVideos();
    const existingImgCount = await this.countContentImages();
    const beforeKeys = await this.contentImageKeys();
    log.info(`Existing after initial wait: ${existingFailCount} fails, ${existingVideoCount} videos, ${existingImgCount} images`);

    const startTime = Date.now();

    let lastLogTime = Date.now();
    while (Date.now() - startTime < CONFIG.VIDEO_GENERATION_TIMEOUT_MS) {
      const failCount = await this.countFailures();
      if (failCount > existingFailCount) {
        throw new Error(`Flow báo tạo video thất bại: ${await this.readFailureReason()}`);
      }

      // Check for new visible videos
      const vidCount = await this.countVisibleVideos();
      if (vidCount > existingVideoCount) {
        await this.page.waitForTimeout(3000);
        await this.rememberNewMedia(beforeKeys);
        log.success(`Video generation complete (${existingVideoCount} → ${vidCount})`);
        return;
      }

      // Also check for new images (video might render as thumbnail)
      const imgCount = await this.countContentImages();
      if (imgCount > existingImgCount) {
        await this.page.waitForTimeout(3000);
        await this.rememberNewMedia(beforeKeys);
        log.success(`Video generation complete (detected as new image)`);
        return;
      }

      // Log progress every 30s so user knows it's still running
      if (Date.now() - lastLogTime > 30_000) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const remaining = Math.round((CONFIG.VIDEO_GENERATION_TIMEOUT_MS - (Date.now() - startTime)) / 1000);
        log.info(`Still waiting for video... (${elapsed}s elapsed, ${remaining}s remaining)`);
        lastLogTime = Date.now();
      }

      await this.page.waitForTimeout(5000);
    }

    throw new Error('Video generation timed out');
  }

  // ─── Download ─────────────────────────────────────────────

  /**
   * After clicking "Tải xuống", pick the best resolution and download.
   * Image resolutions: 1K, 2K, 4K
   * Video resolutions: 720p, 1080p, 4K
   */
  private async pickResolutionAndDownload(savePath: string, timeout: number = 30_000): Promise<string> {
    await this.page.waitForTimeout(3000);

    // Resolution options vary:
    // Image: "1K Kích thước gốc", "2K Đã tăng độ phân giải", "4K Nâng cấp"
    // Video: "720p Kích thước gốc", "1080p Đã tăng độ phân giải", "4K Nâng cấp"
    // Click the first available NON-"Nâng cấp" resolution (free download)
    const resOptions = ['Kích thước gốc', 'Original size', '2K', '1080p', '1K', '720p', 'Đã tăng độ phân giải', 'Upscaled'];

    for (const res of resOptions) {
      const btn = this.page.getByText(res, { exact: false }).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Check it's not the "Nâng cấp" (upgrade/paid) option
        const btnText = await btn.innerText().catch(() => '');
        if (btnText.includes('Nâng cấp') || /upgrade/i.test(btnText)) continue;

        log.info(`Clicking resolution: "${btnText.replace(/\n/g, ' ')}"`);

        const downloadPromise = this.page.waitForEvent('download', { timeout });
        await btn.click({ force: true }); // force click to avoid overlay issues

        try {
          const download = await downloadPromise;
          await download.saveAs(savePath);
          const resLabel = btnText.split('\n')[0] || res;
          log.success(`Saved (${resLabel}): ${savePath}`);
          return savePath;
        } catch {
          log.warn(`Download event missed for "${res}", trying next option...`);
        }
      }
    }

    // Fallback: wait for any download
    const download = await this.page.waitForEvent('download', { timeout: 15_000 });
    await download.saveAs(savePath);
    log.success(`Saved: ${savePath}`);
    return savePath;
  }

  /**
   * Dismiss any notification popups that may interfere with context menus
   * e.g. "Quá trình nâng cấp chất lượng đã hoàn tất..."
   */
  private async dismissNotifications(): Promise<void> {
    try {
      // Look for "Đóng" button on notification popups
      const closeBtn = this.page.getByText('Đóng', { exact: true }).first();
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.click({ force: true });
        await this.page.waitForTimeout(500);
        log.info('Dismissed notification popup');
      }
    } catch { /* no notification */ }
    // Also dismiss any other popups
    await this.dismissPopups();
  }

  async downloadImage(savePath: string): Promise<string> {
    log.info('Downloading image...');
    await this.dismissNotifications();
    await this.rightClickMedia('image');
    await this.clickContextMenuItem('Tải xuống');
    return this.pickResolutionAndDownload(savePath);
  }

  async downloadVideo(savePath: string): Promise<string> {
    log.info('Downloading video...');
    await this.dismissNotifications();
    await this.rightClickMedia('video');
    await this.clickContextMenuItem('Tải xuống');
    return this.pickResolutionAndDownload(savePath, 60_000);
  }

  // ─── Session Check ────────────────────────────────────────

  async isLoggedIn(): Promise<boolean> {
    try {
      if (this.page.url().includes('accounts.google.com')) return false;
      // Check multiple indicators: PRO badge, avatar image, or "Dự án mới" button
      const indicators = [
        this.page.locator('button:has-text("PRO")'),
        this.page.locator(NEW_PROJECT_BTN),
        this.page.locator('img[src*="googleusercontent.com/a/"]'),
      ];
      for (const loc of indicators) {
        if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async waitForManualLogin(): Promise<void> {
    log.warn('Session expired! Please log in manually.');
    while (!(await this.isLoggedIn())) {
      await this.page.waitForTimeout(5000);
    }
    log.success('Login detected, continuing...');
    await this.page.waitForTimeout(2000);
  }
}
