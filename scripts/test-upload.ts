/**
 * Thử upload + nhận diện ảnh tham chiếu TRÊN FLOW THẬT (tốn 0 credit: không bấm tạo ảnh/video).
 * Đọc sheet Characters (cột "Ảnh tham chiếu") của file Excel, upload, in bảng khoảng cách dHash của mọi mục
 * trong popup, rồi thử gắn từng ảnh vào ô nhập.
 *
 * Chạy:  npx tsx scripts/test-upload.ts [đường/dẫn/file.xlsx]
 * Nếu "không nhận diện chắc chắn": xem bảng, chỉnh REF_HASH_MAX_DIST / REF_HASH_MIN_MARGIN / REF_HASH_STRONG_DIST trong .env.
 */
import { resolve } from 'node:path';
import { launchBrowser } from '../src/browser.js';
import { CONFIG } from '../src/config.js';
import { log } from '../src/logger.js';
import { FlowPage } from '../src/flow-page.js';
import { readCharacters } from '../src/excel-reader.js';
import { prepareRefs } from '../src/ref-generator.js';
import { printMatchTable } from '../src/ref-photos.js';

async function main() {
  const excel = process.argv[2] ? resolve(process.argv[2]) : CONFIG.EXCEL_PATH;
  const characters = await readCharacters(excel);
  if (!characters.some((c) => c.photoPath)) throw new Error('Sheet Characters chưa có cột 9 "Ảnh tham chiếu" (đường dẫn ảnh)');

  const context = await launchBrowser({ headless: false });
  const page = context.pages()[0] || (await context.newPage());
  const fp = new FlowPage(page);

  await fp.navigateToFlow();
  await fp.waitForAppReady();
  if (!(await fp.isLoggedIn())) await fp.waitForManualLogin();
  await fp.createNewProject();

  const ref = await prepareRefs(fp, characters, excel);
  log.success(`Đã upload ${ref.totalRefs} ảnh: ${[...ref.refMap.keys()].join(', ')}`);
  await printMatchTable(fp);

  for (let i = 0; i < ref.totalRefs; i++) {
    await fp.attachReferences([i], ref.totalRefs);
    log.success(`Gắn thử ảnh #${i + 1} thành công (xem ô nhập trong trình duyệt)`);
    await fp.clearAttachedRefs();
  }

  log.success('XONG: upload + nhận diện + gắn đều chạy. Đóng cửa sổ trình duyệt để kết thúc.');
  await new Promise<void>((r) => context.on('close', () => r()));
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
