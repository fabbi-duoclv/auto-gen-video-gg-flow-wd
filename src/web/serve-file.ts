import { createReadStream, statSync } from 'fs';
import { pipeline } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { basename } from 'path';

/** Gửi tệp qua `pipeline`: lỗi đọc (tệp bị xóa giữa chừng) không làm sập server, và khi trình duyệt hủy request thì luồng đọc + fd được đóng. */
function send(path: string, res: ServerResponse, opts?: { start: number; end: number }): void {
  pipeline(createReadStream(path, opts), res, () => { /* lỗi/hủy đã được dọn bởi pipeline */ });
}

/** Phục vụ tệp có hỗ trợ Range (cần cho <video>/<audio> tua được trong trình duyệt). */
export function serveFile(req: IncomingMessage, res: ServerResponse, path: string, mime: string, downloadName?: string): void {
  let size: number;
  try { const st = statSync(path); if (!st.isFile()) throw new Error('not a file'); size = st.size; } catch { res.writeHead(404); res.end('File not found'); return; }
  const headers: Record<string, string | number> = {
    'Content-Type': mime, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache',
  };
  if (downloadName) headers['Content-Disposition'] = `attachment; filename="${basename(downloadName).replace(/[^A-Za-z0-9._-]/g, '_')}"`;
  const head = req.method === 'HEAD';
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start = m && m[1] !== '' ? parseInt(m[1], 10) : NaN;
    let end = m && m[2] !== '' ? parseInt(m[2], 10) : NaN;
    if (!m || (isNaN(start) && isNaN(end))) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    if (isNaN(start)) { start = Math.max(0, size - end); end = size - 1; } // "bytes=-N": N byte cuối
    else if (isNaN(end) || end >= size) end = size - 1;
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    if (head) { res.end(); return; }
    send(path, res, { start, end });
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': size });
  if (head || size === 0) { res.end(); return; }
  send(path, res);
}
