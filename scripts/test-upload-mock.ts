/**
 * Kiểm tra OFFLINE logic upload ảnh tham chiếu (src/ref-photos.ts) trên một trang GIẢ LẬP popup của Flow.
 * Không đụng tới Google Flow. Chỉ chứng minh: upload → nhận diện theo nội dung → gắn đúng người, kể cả khi
 * danh sách bị đảo/chen thêm ảnh, popup tự đóng sau upload, chỉ có input[type=file], ảnh có EXIF xoay,
 * chạy lại không upload trùng, và dừng (không đoán) khi không nhận diện được.
 *
 * Chạy:  npx tsx scripts/test-upload-mock.ts
 * (Môi trường không tải được trình duyệt của Playwright: đặt CHROMIUM_PATH=/đường/dẫn/chrome)
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import sharp from 'sharp';
import { FlowPage } from '../src/flow-page.js';
import { prepareRefs } from '../src/ref-generator.js';
import { dhash } from '../src/image-hash.js';
import { CONFIG } from '../src/config.js';
import type { CharacterData } from '../src/excel-reader.js';

type Mode = 'button' | 'input' | 'autoclose';

/** Ảnh "chân dung" giả: các mảng màu ngẫu nhiên theo seed, đủ khác nhau để dHash phân biệt. */
async function synth(seed: number, w: number, h: number): Promise<Buffer> {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const gw = 6, gh = 8;
  const small = Buffer.alloc(gw * gh * 3);
  for (let i = 0; i < small.length; i++) small[i] = Math.floor(rnd() * 256);
  return sharp(small, { raw: { width: gw, height: gh, channels: 3 } })
    .resize(w, h, { kernel: 'cubic' })
    .jpeg({ quality: 88 })
    .toBuffer();
}

const dataUrl = (b: Buffer) => `data:image/jpeg;base64,${b.toString('base64')}`;

function mockHtml(mode: Mode): string {
  return `<!doctype html><html><body>
<div>Bạn muốn tạo gì</div>
<button id="add">add_2</button>
<div id="dlg" role="dialog" data-state="closed" style="display:none;width:520px;border:1px solid #888;padding:8px">
  ${mode !== 'input' ? '<button id="up">Tải ảnh lên</button>' : ''}
  <input type="file" id="f" accept="image/*" style="display:none">
  <div id="list" style="display:flex;flex-wrap:wrap;gap:6px"></div>
</div>
<script>
window.__attached = [];
const dlg = document.getElementById('dlg'), list = document.getElementById('list');
const open = () => { dlg.setAttribute('data-state','open'); dlg.style.display='block'; };
const close = () => { dlg.setAttribute('data-state','closed'); dlg.style.display='none'; };
document.getElementById('add').onclick = open;
window.__addItem = (name, url) => {
  const d = document.createElement('div'); d.tabIndex = 0; d.dataset.name = name;
  d.style.cssText = 'width:96px;height:96px;cursor:pointer';
  const i = document.createElement('img'); i.src = url; i.style.cssText = 'width:96px;height:96px;object-fit:cover';
  d.appendChild(i); d.onclick = () => { window.__attached.push(name); close(); };
  list.prepend(d); /* mới nhất ở đầu, như popup "Đã dùng gần đây" */
};
const f = document.getElementById('f');
${mode !== 'input' ? "document.getElementById('up').onclick = () => f.click();" : ''}
f.onchange = () => {
  const file = f.files[0]; const r = new FileReader();
  r.onload = () => setTimeout(() => { window.__addItem(file.name, r.result); ${mode === 'autoclose' ? 'close();' : ''} }, 1200);
  r.readAsDataURL(file);
};
</script></body></html>`;
}

async function attached(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __attached: string[] }).__attached);
}

async function runMode(browser: import('playwright').Browser, mode: Mode, photos: { bride: string; groom: string }) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.setContent(mockHtml(mode));
  const fp = new FlowPage(page);

  // Popup đã có sẵn 8 ảnh "đã gen" (mồi) trước khi upload
  for (let i = 0; i < 8; i++) {
    await page.evaluate(([n, u]) => (window as unknown as { __addItem: (a: string, b: string) => void }).__addItem(n, u), [
      `decoy-${i}.jpg`,
      dataUrl(await synth(100 + i, 640, 640)),
    ] as [string, string]);
  }

  const chars: CharacterData[] = [
    { id: '1', name: 'Cô dâu', role: '', anchorText: '', negativeConstraints: '', promptHeadshot: '', promptPortrait: '', promptFullBody: '', photoPath: photos.bride },
    { id: '2', name: 'Chú rể', role: '', anchorText: '', negativeConstraints: '', promptHeadshot: '', promptPortrait: '', promptFullBody: '', photoPath: photos.groom },
  ];

  const ref = await prepareRefs(fp, chars, undefined);
  assert.equal(ref.totalRefs, 2, `[${mode}] totalRefs`);
  assert.deepEqual([...ref.refMap.entries()], [['Cô dâu', 0], ['Chú rể', 1]], `[${mode}] refMap`);
  const itemsAfterUpload = await page.locator('#list > div').count();
  assert.equal(itemsAfterUpload, 10, `[${mode}] số mục sau upload (8 mồi + 2 ảnh)`);

  // Chạy lại: ảnh đã có ⇒ không upload trùng
  await prepareRefs(fp, chars, undefined);
  assert.equal(await page.locator('#list > div').count(), 10, `[${mode}] chạy lại không được upload trùng`);

  // Sau đó có thêm 6 ảnh mới "gen" chen lên đầu danh sách
  for (let i = 0; i < 6; i++) {
    await page.evaluate(([n, u]) => (window as unknown as { __addItem: (a: string, b: string) => void }).__addItem(n, u), [
      `gen-${i}.jpg`,
      dataUrl(await synth(200 + i, 1280, 720)),
    ] as [string, string]);
  }

  // Gắn theo thứ tự ĐẢO (chú rể trước) và lặp lại để chạy đường nhanh
  await fp.attachReferences([1, 0], ref.totalRefs);
  await fp.attachReferences([0, 1], ref.totalRefs);
  await fp.attachReferences([0], ref.totalRefs);
  const got = await attached(page);
  assert.deepEqual(got, ['groom.jpg', 'bride.jpg', 'bride.jpg', 'groom.jpg', 'bride.jpg'], `[${mode}] gắn sai người: ${got.join(',')}`);

  // Ảnh chưa từng upload ⇒ phải DỪNG, không gắn bừa
  fp.refPhotos = [...(fp.refPhotos ?? []), { name: 'Lạ', path: '', hash: await dhash(await synth(999, 800, 1000)) }];
  await assert.rejects(() => fp.attachReferences([2], 3), /Không nhận diện chắc chắn/, `[${mode}] phải dừng khi không nhận diện được`);
  assert.equal((await attached(page)).length, 5, `[${mode}] không được gắn thêm gì khi nhận diện thất bại`);

  await page.close();
  console.log(`PASS  chế độ "${mode}"`);
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'ref-photos-'));
  const bride = join(dir, 'bride.jpg');
  const groom = join(dir, 'groom.jpg');
  writeFileSync(bride, await synth(1, 800, 1000));
  // Ảnh chú rể lưu ngang + thẻ EXIF xoay 90° (như ảnh chụp từ điện thoại)
  writeFileSync(groom, await sharp(await synth(2, 1000, 800)).withMetadata({ orientation: 6 }).jpeg().toBuffer());

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    for (const mode of ['button', 'input', 'autoclose'] as Mode[]) await runMode(browser, mode, { bride, groom });
  } finally {
    await browser.close();
  }

  const debugFiles = existsSync(CONFIG.DEBUG_DIR) ? readdirSync(CONFIG.DEBUG_DIR) : [];
  console.log(`Tệp debug tạo ra khi nhận diện thất bại (mong đợi > 0): ${debugFiles.length}`);
  assert.ok(debugFiles.length > 0, 'phải lưu debug khi thất bại');
  console.log('TẤT CẢ ĐỀU QUA');
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
