import { existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute, extname, join, basename } from 'node:path';
import type { Locator, Page } from 'playwright';
import type { FlowPage } from './flow-page.js';
import type { CharacterData } from './excel-reader.js';
import { dhash, hamming } from './image-hash.js';
import { CONFIG } from './config.js';
import { log } from './logger.js';

/**
 * Upload ảnh THẬT của cô dâu/chú rể lên project Flow và gắn đúng người vào từng shot.
 *
 * Khác bản gốc (ref-generator.ts gắn ảnh theo VỊ TRÍ trong popup): ở đây mỗi ảnh được nhận diện theo
 * NỘI DUNG (dấu vân dHash của ảnh gốc so với thumbnail trong popup). Không chắc chắn ⇒ dừng, không đoán,
 * để khỏi gen video với nhầm mặt.
 *
 * LƯU Ý: các selector dưới đây chưa được thử trên giao diện Flow thật (xem HANDOFF.md). Khi lỗi, hàm lưu
 * ảnh chụp màn hình + HTML popup vào output/debug/ để chỉnh selector.
 */

export interface RefPhoto {
  /** Tên nhân vật, khớp cột "Nhân vật" của sheet Scenes. */
  name: string;
  /** Đường dẫn tuyệt đối tới ảnh gốc. */
  path: string;
  /** dHash 64 bit (hex) của ảnh gốc. */
  hash: string;
  /** Vị trí (đếm từ cuối popup) ở lần khớp gần nhất, dùng để thử nhanh. */
  lastFromEnd?: number;
}

export interface PhotoSpec {
  name: string;
  path: string;
}

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const WARN_BYTES = 10 * 1024 * 1024;
const UPLOAD_TRIGGER_TEXT = /tải.{0,12}lên|upload/i;
/** Một mục ảnh trong popup "+": cùng selector với attachReferences() của bản gốc, thêm điều kiện có <img>. */
const ITEM = 'div[tabindex="0"]:has(img)';
const DIALOG = '[role="dialog"][data-state="open"]';

/** Đọc lúc gọi (không đọc lúc import) để .env nạp sau vẫn có hiệu lực. */
export function tuning() {
  return {
    /** Khoảng cách Hamming tối đa để coi là cùng ảnh (trên 64 bit). */
    maxDist: Number(process.env.REF_HASH_MAX_DIST ?? 20),
    /** Ứng viên tốt nhất phải hơn ứng viên thứ hai ít nhất chừng này. */
    minMargin: Number(process.env.REF_HASH_MIN_MARGIN ?? 6),
    /** Khớp "rất chắc": nhận ngay, không cần so tiếp. */
    strongDist: Number(process.env.REF_HASH_STRONG_DIST ?? 8),
  };
}

// ─── Kiểm tra ảnh đầu vào ────────────────────────────────────

/** Tìm và kiểm tra ảnh của từng nhân vật. Lỗi gom lại một lần, không làm gì trên Flow. */
export function resolvePhotos(characters: CharacterData[], excelPath?: string): PhotoSpec[] {
  const problems: string[] = [];
  const out: PhotoSpec[] = [];

  for (const c of characters) {
    if (!c.photoPath) continue;
    const tried = isAbsolute(c.photoPath)
      ? [c.photoPath]
      : [resolve(c.photoPath), ...(excelPath ? [resolve(dirname(excelPath), c.photoPath)] : [])];
    const found = tried.find((p) => existsSync(p) && statSync(p).isFile());
    if (!found) {
      problems.push(`${c.name}: không thấy ảnh "${c.photoPath}" (đã thử: ${tried.join(' | ')})`);
      continue;
    }
    const ext = extname(found).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      problems.push(`${c.name}: định dạng "${ext}" chưa hỗ trợ (dùng .jpg, .jpeg, .png hoặc .webp)`);
      continue;
    }
    if (statSync(found).size > WARN_BYTES) {
      log.warn(`${c.name}: ảnh ${basename(found)} > 10MB, Flow có thể từ chối. Nên giảm kích thước.`);
    }
    out.push({ name: c.name, path: found });
  }

  if (problems.length) throw new Error('Ảnh tham chiếu có vấn đề:\n - ' + problems.join('\n - '));
  return out;
}

// ─── Popup "+" ───────────────────────────────────────────────

async function openDialog(fp: FlowPage): Promise<Locator> {
  const page = fp.page;
  const dialog = page.locator(DIALOG).first();
  if (await dialog.isVisible().catch(() => false)) return dialog;

  const addBtn = page.locator('button:has-text("add_2")').first();
  if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    throw new Error('Không thấy nút "+" (add_2) để mở popup ảnh tham chiếu');
  }
  await addBtn.click();
  await dialog.waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForTimeout(1500);
  return dialog;
}

async function closeDialog(fp: FlowPage): Promise<void> {
  const dialog = fp.page.locator(DIALOG).first();
  if (await dialog.isVisible().catch(() => false)) {
    await fp.page.keyboard.press('Escape');
    await fp.page.waitForTimeout(500);
  }
}

// ─── Nhận diện ảnh trong popup theo nội dung ─────────────────

const thumbCache = new WeakMap<Page, Map<string, string>>();
function cacheFor(fp: FlowPage): Map<string, string> {
  let m = thumbCache.get(fp.page);
  if (!m) {
    m = new Map();
    thumbCache.set(fp.page, m);
  }
  return m;
}

/** dHash của thumbnail ở mục thứ i; null nếu ảnh chưa tải xong. */
async function itemHash(fp: FlowPage, items: Locator, i: number): Promise<string | null> {
  const img = items.nth(i).locator('img').first();
  const src = (await img.getAttribute('src').catch(() => null)) ?? '';
  const cacheable = !!src && !src.includes('.svg') && !src.includes('placeholder');
  const cache = cacheFor(fp);
  if (cacheable && cache.has(src)) return cache.get(src)!;

  const size = await img
    .evaluate((el) => ({ ok: (el as HTMLImageElement).complete, w: (el as HTMLImageElement).naturalWidth }))
    .catch(() => ({ ok: false, w: 0 }));
  if (!size.ok || size.w < 32) return null; // chưa tải xong, hoặc là icon

  const buf = await img.screenshot({ type: 'png', timeout: 8000 }).catch(() => null);
  if (!buf) return null;
  const h = await dhash(buf);
  if (cacheable) cache.set(src, h);
  return h;
}

interface MatchInfo {
  found: { index: number; dist: number; count: number } | null;
  best: number;
  second: number;
  count: number;
}

/** Tìm mục khớp với ảnh gốc. Quét từ cuối (ảnh tham chiếu là cũ nhất); nhận ngay nếu khớp rất chắc. */
async function findMatch(fp: FlowPage, items: Locator, photo: RefPhoto): Promise<MatchInfo> {
  const t = tuning();
  const count = await items.count();

  if (photo.lastFromEnd !== undefined) {
    const i = count - 1 - photo.lastFromEnd;
    if (i >= 0 && i < count) {
      const h = await itemHash(fp, items, i);
      if (h) {
        const d = hamming(h, photo.hash);
        if (d <= t.strongDist) return { found: { index: i, dist: d, count }, best: d, second: 65, count };
      }
    }
  }

  let best = { i: -1, d: 65 };
  let second = 65;
  for (let i = count - 1; i >= 0; i--) {
    const h = await itemHash(fp, items, i);
    if (!h) continue;
    const d = hamming(h, photo.hash);
    if (d <= t.strongDist) return { found: { index: i, dist: d, count }, best: d, second: 65, count };
    if (d < best.d) {
      second = best.d;
      best = { i, d };
    } else if (d < second) {
      second = d;
    }
  }

  const ok = best.i >= 0 && best.d <= t.maxDist && second - best.d >= t.minMargin;
  return { found: ok ? { index: best.i, dist: best.d, count } : null, best: best.d, second, count };
}

// ─── Upload ──────────────────────────────────────────────────

/** Đưa tệp lên: ưu tiên bấm nút "Tải lên" rồi dùng hộp chọn tệp; không được thì dùng input[type=file]. */
async function chooseFile(fp: FlowPage, dialog: Locator, filePath: string): Promise<'chooser' | 'input'> {
  const page = fp.page;
  for (const scope of [dialog, page.locator('body')]) {
    const trigger = scope
      .locator('button, [role="button"], [role="menuitem"], label, div[tabindex="0"]:not(:has(img))')
      .filter({ hasText: UPLOAD_TRIGGER_TEXT })
      .first();
    if (await trigger.isVisible({ timeout: 2000 }).catch(() => false)) {
      try {
        const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), trigger.click()]);
        await chooser.setFiles(filePath);
        return 'chooser';
      } catch (err) {
        log.warn(`Nút tải lên không mở được hộp chọn tệp: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const input = page.locator('input[type="file"]').first();
  if ((await input.count()) > 0) {
    await input.setInputFiles(filePath);
    return 'input';
  }
  throw new Error('Không tìm thấy nút tải ảnh lên (chữ "Tải lên"/"Upload") cũng như input[type=file]');
}

/** Sau khi gửi tệp: chờ ảnh xuất hiện trong popup (tức là đã upload xong VÀ nhận diện được). */
async function waitUploaded(fp: FlowPage, photo: RefPhoto): Promise<MatchInfo> {
  const deadline = Date.now() + CONFIG.UPLOAD_TIMEOUT_MS;
  let last: MatchInfo | undefined;
  while (Date.now() < deadline) {
    await fp.page.waitForTimeout(3000);
    const dialog = await openDialog(fp); // phòng khi popup tự đóng sau upload
    last = await findMatch(fp, dialog.locator(ITEM), photo);
    if (last.found) return last;
  }
  throw new Error(
    `Đã gửi ảnh "${photo.name}" nhưng không thấy trong popup sau ${Math.round(CONFIG.UPLOAD_TIMEOUT_MS / 1000)}s ` +
      `(khoảng cách tốt nhất ${last?.best}, thứ hai ${last?.second}, ${last?.count} mục)`,
  );
}

async function uploadOne(fp: FlowPage, photo: RefPhoto): Promise<void> {
  log.info(`Upload ảnh tham chiếu "${photo.name}": ${basename(photo.path)}`);
  const dialog = await openDialog(fp);

  // Đã có sẵn trong project (chạy lại, resume)?
  const pre = await findMatch(fp, dialog.locator(ITEM), photo);
  if (pre.found) {
    log.info(`Ảnh "${photo.name}" đã có trong project (khoảng cách ${pre.found.dist}), bỏ qua upload`);
    await closeDialog(fp);
    return;
  }

  try {
    const mode = await chooseFile(fp, dialog, photo.path);
    log.info(`Đã gửi tệp (${mode}), chờ ảnh xuất hiện...`);
    const m = await waitUploaded(fp, photo);
    log.success(`Ảnh "${photo.name}" đã upload (nhận diện ở mục ${m.found!.index + 1}/${m.count}, khoảng cách ${m.found!.dist})`);
  } catch (err) {
    await dumpDebug(fp, `upload-${photo.name.replace(/\W+/g, '_')}`);
    await closeDialog(fp);
    throw err;
  }

  await closeDialog(fp);
  await fp.clearAttachedRefs(); // nếu Flow tự gắn ảnh vừa upload vào ô nhập thì gỡ ra
}

/**
 * Upload ảnh của các nhân vật lên project hiện tại. Trả về map tên nhân vật → chỉ số ảnh
 * (cùng kiểu với generateRefImages() để engine dùng chung). Ảnh được lưu vào fp.refPhotos.
 */
export async function uploadRefPhotos(fp: FlowPage, specs: PhotoSpec[]): Promise<Map<string, number>> {
  const photos: RefPhoto[] = [];
  for (const s of specs) photos.push({ name: s.name, path: s.path, hash: await dhash(s.path) });

  // Hai ảnh quá giống nhau thì khó phân biệt khi gắn.
  const t = tuning();
  for (let i = 0; i < photos.length; i++) {
    for (let j = i + 1; j < photos.length; j++) {
      const d = hamming(photos[i].hash, photos[j].hash);
      if (d <= t.maxDist) {
        log.warn(`Ảnh "${photos[i].name}" và "${photos[j].name}" có dấu vân gần nhau (${d}/64): dễ nhận nhầm. Nên dùng ảnh khác bố cục.`);
      }
    }
  }

  const refMap = new Map<string, number>();
  for (let i = 0; i < photos.length; i++) {
    await uploadOne(fp, photos[i]);
    refMap.set(photos[i].name, i);
  }
  fp.refPhotos = photos;
  return refMap;
}

// ─── Gắn ảnh vào ô nhập cho từng shot ────────────────────────

/** Gắn các ảnh tham chiếu (theo chỉ số trong refMap) vào ô nhập, nhận diện theo nội dung. */
export async function attachReferencesByPhoto(fp: FlowPage, refIndices: number[]): Promise<void> {
  const photos = fp.refPhotos ?? [];
  for (const idx of refIndices) {
    const photo = photos[idx];
    if (!photo) {
      log.warn(`Không có ảnh tham chiếu #${idx}, bỏ qua`);
      continue;
    }
    const dialog = await openDialog(fp);
    const items = dialog.locator(ITEM);
    const r = await findMatch(fp, items, photo);
    if (!r.found) {
      await dumpDebug(fp, `attach-${photo.name.replace(/\W+/g, '_')}`);
      await closeDialog(fp);
      throw new Error(
        `Không nhận diện chắc chắn ảnh tham chiếu "${photo.name}" trong popup ` +
          `(khoảng cách tốt nhất ${r.best}, thứ hai ${r.second}, ${r.count} mục). ` +
          'Dừng để tránh gắn nhầm mặt. Chỉnh REF_HASH_MAX_DIST / REF_HASH_MIN_MARGIN hoặc xem output/debug.',
      );
    }
    await items.nth(r.found.index).click();
    photo.lastFromEnd = r.found.count - 1 - r.found.index;
    await fp.page.waitForTimeout(1500);
    log.info(`Gắn ảnh "${photo.name}" (mục ${r.found.index + 1}/${r.found.count}, khoảng cách ${r.found.dist})`);
  }
}

/** In bảng khoảng cách dHash giữa từng mục trong popup và từng ảnh gốc: để hiệu chỉnh ngưỡng trên giao diện thật. */
export async function printMatchTable(fp: FlowPage): Promise<void> {
  const photos = fp.refPhotos ?? [];
  const t = tuning();
  const dialog = await openDialog(fp);
  const items = dialog.locator(ITEM);
  const n = await items.count();
  log.info(`Popup có ${n} mục ảnh. Khoảng cách dHash tới từng ảnh gốc (0 = giống hệt; <= ${t.strongDist} = khớp chắc; > ${t.maxDist} = khác):`);
  for (let i = 0; i < n; i++) {
    const h = await itemHash(fp, items, i);
    const cols = photos.map((p) => `${p.name}=${h ? hamming(h, p.hash) : '?'}`).join('   ');
    log.info(`  mục ${String(i + 1).padStart(2)}: ${h ? cols : '(ảnh chưa tải xong)'}`);
  }
  await closeDialog(fp);
}

// ─── Debug ───────────────────────────────────────────────────

/** Lưu ảnh chụp màn hình và HTML popup để chỉnh selector khi lỗi. */
export async function dumpDebug(fp: FlowPage, label: string): Promise<void> {
  try {
    mkdirSync(CONFIG.DEBUG_DIR, { recursive: true });
    const base = join(CONFIG.DEBUG_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}`);
    await fp.page.screenshot({ path: `${base}.png` }).catch(() => {});
    const html = await fp.page
      .locator(DIALOG)
      .first()
      .evaluate((el) => el.outerHTML)
      .catch(() => null);
    if (html) writeFileSync(`${base}-dialog.html`, html.slice(0, 300_000));
    log.warn(`Đã lưu debug: ${base}.png${html ? ' + -dialog.html' : ''}`);
  } catch {
    /* debug không được làm hỏng luồng chính */
  }
}
