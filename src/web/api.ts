import { type IncomingMessage, type ServerResponse } from 'http';
import { readdirSync, statSync, createReadStream, existsSync } from 'fs';
import { join, extname, basename } from 'path';
import { serveFile } from './serve-file.js';
import ExcelJS from 'exceljs';
import archiver from 'archiver';
import { getFlowPaths } from '../config.js';
import { FlowManager } from '../flow-manager.js';
import { openLoginBrowser, type RunConfig } from '../engine.js';
import { MAX_PHOTO_BYTES, PhotoError } from '../flow-photos.js';

// ─── Helpers ─────────────────────────────────────────────────

export function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function collectBuffer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// ─── Flow CRUD ───────────────────────────────────────────────

export function handleCreateFlow(fm: FlowManager) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const body = await parseBody(req);
    const name = (body.name as string) || '';
    const meta = fm.createFlow(name);
    json(res, meta, 201);
  };
}

export function handleListFlows(fm: FlowManager) {
  return (_req: IncomingMessage, res: ServerResponse) => {
    json(res, fm.listFlows());
  };
}

export function handleGetFlow(fm: FlowManager) {
  return (_req: IncomingMessage, res: ServerResponse, flowId: string) => {
    const meta = fm.getFlowMeta(flowId);
    if (!meta) { json(res, { error: 'Flow not found' }, 404); return; }
    json(res, meta);
  };
}

export function handleDeleteFlow(fm: FlowManager) {
  return async (_req: IncomingMessage, res: ServerResponse, flowId: string) => {
    try {
      await fm.deleteFlow(flowId);
      json(res, { ok: true });
    } catch (err) {
      json(res, { error: (err as Error).message }, 400);
    }
  };
}

export function handleCloneFlow(fm: FlowManager) {
  return async (req: IncomingMessage, res: ServerResponse, flowId: string) => {
    try {
      const body = await parseBody(req);
      const name = body.name as string | undefined;
      const meta = fm.cloneFlow(flowId, name);
      json(res, meta, 201);
    } catch (err) {
      json(res, { error: (err as Error).message }, 400);
    }
  };
}

// ─── Character photos (ảnh cô dâu / chú rể) ─────────────────

/** Đọc body nhưng dừng ngay khi vượt giới hạn, tránh nuốt RAM bởi tệp quá lớn. */
export function collectLimited(req: IncomingMessage, limit: number): Promise<Buffer | 'too-large'> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on('data', (chunk) => {
      if (over) return;
      size += chunk.length;
      if (size > limit) { over = true; chunks.length = 0; return; }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => resolve(over ? 'too-large' : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function handleFlowPhotoUpload(fm: FlowManager) {
  return async (req: IncomingMessage, res: ServerResponse, flowId: string, charId: string) => {
    try {
      const body = await collectLimited(req, MAX_PHOTO_BYTES + 1024);
      if (body === 'too-large') {
        json(res, { error: `Ảnh quá lớn. Tối đa ${MAX_PHOTO_BYTES / 1048576} MB.` }, 413);
        return;
      }
      const saved = await fm.uploadPhoto(flowId, charId, body);
      json(res, { ok: true, ...saved });
    } catch (err) {
      json(res, { error: (err as Error).message }, err instanceof PhotoError ? 400 : 409);
    }
  };
}

export function handleFlowPhotoDelete(fm: FlowManager) {
  return async (_req: IncomingMessage, res: ServerResponse, flowId: string, charId: string) => {
    try {
      json(res, { ok: true, removed: await fm.deletePhoto(flowId, charId) });
    } catch (err) {
      json(res, { error: (err as Error).message }, 409);
    }
  };
}

export function handleFlowPhotoGet(fm: FlowManager) {
  return (_req: IncomingMessage, res: ServerResponse, flowId: string, charId: string) => {
    const p = fm.getPhotoFile(flowId, charId);
    if (!p) { res.writeHead(404); res.end('No photo'); return; }
    const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[p.ext];
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': statSync(p.path).size,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(p.path).pipe(res);
  };
}

// ─── Flow Excel ──────────────────────────────────────────────

export function handleFlowUpload(fm: FlowManager) {
  return async (req: IncomingMessage, res: ServerResponse, flowId: string) => {
    try {
      const buffer = await collectBuffer(req);
      if (buffer.length === 0) {
        json(res, { error: 'Empty file' }, 400);
        return;
      }

      const errors = await validateExcel(buffer);
      if (errors.length > 0) {
        json(res, { error: 'Invalid Excel format', details: errors }, 400);
        return;
      }

      await fm.uploadExcel(flowId, buffer);
      json(res, { ok: true });
    } catch (err) {
      json(res, { error: (err as Error).message }, 500);
    }
  };
}

export function handleFlowScenes(fm: FlowManager) {
  return async (_req: IncomingMessage, res: ServerResponse, flowId: string) => {
    try {
      const scenes = await fm.getScenes(flowId);
      json(res, scenes);
    } catch (err) {
      json(res, { error: (err as Error).message }, 400);
    }
  };
}

export function handleFlowCharacters(fm: FlowManager) {
  return async (_req: IncomingMessage, res: ServerResponse, flowId: string) => {
    try {
      const chars = await fm.getCharacters(flowId);
      json(res, chars);
    } catch (err) {
      json(res, { error: (err as Error).message }, 400);
    }
  };
}

export function handleFlowUpdateScene(fm: FlowManager) {
  return async (req: IncomingMessage, res: ServerResponse, flowId: string, sceneId: string) => {
    try {
      const body = await parseBody(req);
      fm.updateScenePrompt(flowId, sceneId, {
        imagePrompt: body.imagePrompt as string | undefined,
        videoPrompt: body.videoPrompt as string | undefined,
      });
      json(res, { ok: true });
    } catch (err) {
      json(res, { error: (err as Error).message }, 400);
    }
  };
}

// ─── Flow Engine ─────────────────────────────────────────────

export function handleFlowStart(fm: FlowManager) {
  return async (req: IncomingMessage, res: ServerResponse, flowId: string) => {
    try {
      const body = await parseBody(req);
      const config: RunConfig = {
        scenes: body.scenes as string[] | undefined,
        imageOnly: body.imageOnly as boolean | undefined,
        videoOnly: body.videoOnly as boolean | undefined,
        resume: body.resume as boolean | undefined,
        ratio: (body.ratio as '16:9' | '9:16' | '1:1') || '16:9',
        genCount: (body.genCount as number) || 1,
      };
      await fm.startFlow(flowId, config);
      json(res, { ok: true }, 202);
    } catch (err) {
      json(res, { error: (err as Error).message }, 409);
    }
  };
}

export function handleFlowStop(fm: FlowManager) {
  return (_req: IncomingMessage, res: ServerResponse, flowId: string) => {
    try {
      fm.stopFlow(flowId);
      json(res, { ok: true });
    } catch (err) {
      json(res, { error: (err as Error).message }, 400);
    }
  };
}

export function handleFlowStatus(fm: FlowManager) {
  return (_req: IncomingMessage, res: ServerResponse, flowId: string) => {
    try {
      const status = fm.getFlowStatus(flowId);
      json(res, status);
    } catch (err) {
      json(res, { error: (err as Error).message }, 400);
    }
  };
}

// ─── Flow Output ─────────────────────────────────────────────

export function handleFlowOutputList(fm: FlowManager) {
  return (_req: IncomingMessage, res: ServerResponse, flowId: string) => {
    const meta = fm.getFlowMeta(flowId);
    if (!meta) { json(res, { error: 'Flow not found' }, 404); return; }

    const paths = getFlowPaths(flowId);
    try {
      if (!existsSync(paths.outputDir)) { json(res, []); return; }
      const files = readdirSync(paths.outputDir)
        .filter(f => /\.(png|jpg|jpeg|mp4|webm)$/i.test(f))
        .map(f => {
          const stat = statSync(join(paths.outputDir, f));
          return {
            name: f,
            size: stat.size,
            modified: stat.mtime.toISOString(),
            type: /\.(mp4|webm)$/i.test(f) ? 'video' : 'image',
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      json(res, files);
    } catch {
      json(res, []);
    }
  };
}

export function handleFlowOutputFile(fm: FlowManager) {
  return (req: IncomingMessage, res: ServerResponse, flowId: string, filename: string) => {
    const meta = fm.getFlowMeta(flowId);
    if (!meta) { res.writeHead(404); res.end('Flow not found'); return; }
    if (filename !== basename(filename) || filename.startsWith('.')) { res.writeHead(400); res.end('Bad name'); return; }
    const mimeTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
    serveFile(req, res, join(getFlowPaths(flowId).outputDir, filename), mimeTypes[extname(filename).toLowerCase()] || 'application/octet-stream');
  };
}

export function handleFlowOutputZip(fm: FlowManager) {
  return (_req: IncomingMessage, res: ServerResponse, flowId: string) => {
    const meta = fm.getFlowMeta(flowId);
    if (!meta) { res.writeHead(404); res.end('Flow not found'); return; }

    const paths = getFlowPaths(flowId);
    if (!existsSync(paths.outputDir)) { res.writeHead(404); res.end('No output'); return; }

    const files = readdirSync(paths.outputDir).filter(f => /\.(png|jpg|jpeg|mp4|webm)$/i.test(f));
    if (!files.length) { res.writeHead(404); res.end('No files to zip'); return; }

    const safeName = (meta.name || 'flow').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}-output.zip"`,
    });

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);
    for (const file of files) {
      archive.file(join(paths.outputDir, file), { name: file });
    }
    archive.finalize();
  };
}

// ─── Global (not per-flow) ───────────────────────────────────

export function handleLogin(_req: IncomingMessage, res: ServerResponse): void {
  json(res, { ok: true, message: 'Opening browser for login...' }, 202);
  openLoginBrowser().catch(() => {});
}

// ─── Excel Validation (stateless) ────────────────────────────

async function validateExcel(buffer: Buffer): Promise<string[]> {
  const errors: string[] = [];
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    return ['File is not a valid Excel (.xlsx) file'];
  }

  const scenesSheet = workbook.getWorksheet('Scenes') || workbook.worksheets[0];
  if (!scenesSheet) {
    errors.push('Missing "Scenes" sheet (or no sheets at all)');
  } else {
    const header = scenesSheet.getRow(1);
    const requiredSceneCols: Record<number, string> = {
      1: 'Timeline',
      2: 'Cảnh',
      3: 'Tên cảnh',
      4: 'Loại',
    };
    for (const [col, expected] of Object.entries(requiredSceneCols)) {
      const val = String(header.getCell(Number(col)).value || '');
      if (!val.toLowerCase().includes(expected.toLowerCase())) {
        errors.push(`Scenes sheet: Column ${col} should contain "${expected}", got "${val}"`);
      }
    }

    let dataRows = 0;
    scenesSheet.eachRow((_, rowNum) => { if (rowNum > 1) dataRows++; });
    if (dataRows === 0) {
      errors.push('Scenes sheet: No data rows found');
    }
  }

  const charsSheet = workbook.getWorksheet('Characters') || workbook.worksheets[1];
  if (!charsSheet) {
    errors.push('Missing "Characters" sheet');
  } else {
    const header = charsSheet.getRow(1);
    const col2 = String(header.getCell(2).value || '');
    if (!col2) {
      errors.push('Characters sheet: Column 2 (Name) header is empty');
    }

    let charRows = 0;
    charsSheet.eachRow((_, rowNum) => { if (rowNum > 1) charRows++; });
    if (charRows === 0) {
      errors.push('Characters sheet: No character data found');
    }
  }

  return errors;
}
