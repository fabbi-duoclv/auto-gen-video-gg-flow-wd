import type { IncomingMessage, ServerResponse } from 'http';
import { collectLimited, json } from './api.js';
import { serveFile } from './serve-file.js';
import { EditError, EditService, MAX_LUT_BYTES, MAX_MUSIC_BYTES } from '../edit/service.js';

const MUSIC_MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac' };

type H = (req: IncomingMessage, res: ServerResponse, flowId: string, extra?: string) => Promise<void> | void;

async function body(req: IncomingMessage, res: ServerResponse, limit: number): Promise<Buffer | null> {
  const b = await collectLimited(req, limit);
  if (b === 'too-large') { json(res, { error: `Tệp quá lớn (tối đa ${Math.round(limit / 1048576)} MB)` }, 413); return null; }
  return b;
}

function wrap(fn: H): H {
  return async (req, res, id, extra) => {
    try { await fn(req, res, id, extra); }
    catch (e) {
      if (e instanceof EditError) json(res, { error: e.message }, e.status);
      else { console.error(e); json(res, { error: (e as Error).message || 'Lỗi không xác định' }, 500); }
    }
  };
}

export function editHandlers(svc: EditService) {
  const qs = (req: IncomingMessage) => new URL(req.url || '/', 'http://x').searchParams;
  return {
    get: wrap(async (_req, res, id) => json(res, await svc.getState(id))),
    put: wrap(async (req, res, id) => {
      const b = await body(req, res, 2 * 1024 * 1024); if (!b) return;
      let raw: unknown;
      try { raw = JSON.parse(b.toString('utf8')); } catch { throw new EditError('JSON không hợp lệ'); }
      json(res, { ok: true, ...(await svc.save(id, raw)) });
    }),
    music: wrap(async (req, res, id) => {
      const b = await body(req, res, MAX_MUSIC_BYTES); if (!b) return;
      json(res, { ok: true, music: await svc.uploadMusic(id, b, qs(req).get('name') || 'nhac.mp3') });
    }),
    musicGet: wrap(async (req, res, id) => {
      const m = svc.musicPath(id);
      if (!m) { res.writeHead(404); res.end('No music'); return; }
      serveFile(req, res, m.path, MUSIC_MIME[m.ext] || 'application/octet-stream');
    }),
    lut: wrap(async (req, res, id) => {
      const b = await body(req, res, MAX_LUT_BYTES); if (!b) return;
      json(res, { ok: true, name: svc.uploadLut(id, b, qs(req).get('name') || 'lut') });
    }),
    lyrics: wrap(async (req, res, id) => {
      const b = await body(req, res, 1024 * 1024); if (!b) return;
      json(res, { ok: true, lines: svc.parseLyricsText(b.toString('utf8')) });
    }),
    render: wrap(async (req, res, id) => {
      const b = await body(req, res, 4096); if (!b) return;
      let preview = false;
      try { preview = JSON.parse(b.toString('utf8') || '{}').preview === true; } catch { /* mặc định bản đầy đủ */ }
      json(res, { ok: true, render: await svc.startRender(id, preview) }, 202);
    }),
    cancel: wrap(async (_req, res, id) => json(res, { ok: true, cancelled: svc.cancelRender(id) })),
    renderStatus: wrap(async (_req, res, id) => json(res, svc.getRender(id))),
    final: wrap(async (req, res, id, file) => {
      const p = file ? svc.finalPath(id, decodeURIComponent(file)) : null;
      if (!p) { res.writeHead(404); res.end('File not found'); return; }
      const download = qs(req).get('download') === '1';
      serveFile(req, res, p, 'video/mp4', download ? decodeURIComponent(file!) : undefined);
    }),
  };
}
