import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

import { FlowManager } from '../flow-manager.js';
import { EditService } from '../edit/service.js';
import { editHandlers } from './edit-api.js';
import {
  handleCreateFlow,
  handleListFlows,
  handleGetFlow,
  handleDeleteFlow,
  handleCloneFlow,
  handleFlowUpload,
  handleFlowScenes,
  handleFlowCharacters,
  handleFlowPhotoUpload,
  handleFlowPhotoDelete,
  handleFlowPhotoGet,
  handleFlowUpdateScene,
  handleFlowStart,
  handleFlowStop,
  handleFlowStatus,
  handleFlowOutputList,
  handleFlowOutputZip,
  handleFlowOutputFile,
  handleLogin,
} from './api.js';

const PORT = 3001;
const PUBLIC_DIR = resolve(__dirname, '../../public');

// Initialize FlowManager (loads existing flows from disk)
const fm = new FlowManager();
const edit = editHandlers(new EditService(fm));

// Router
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const method = req.method || 'GET';
  const path = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    // Parse path segments: /api/flows/{id}/{action}/{sub}
    const segments = path.split('/').filter(Boolean);
    // segments[0] = 'api', segments[1] = 'flows', segments[2] = flowId, etc.

    // ─── Flow API routes (/api/flows/...) ────────────────

    if (segments[0] === 'api' && segments[1] === 'flows') {
      const flowId = segments[2];
      const action = segments[3];
      const sub = segments[4];
      const sub2 = segments[5];

      // POST /api/flows — create flow
      if (!flowId && method === 'POST') {
        return await handleCreateFlow(fm)(req, res);
      }

      // GET /api/flows — list flows
      if (!flowId && method === 'GET') {
        return handleListFlows(fm)(req, res);
      }

      if (flowId) {
        // GET /api/flows/:id — get flow
        if (!action && method === 'GET') {
          return handleGetFlow(fm)(req, res, flowId);
        }

        // DELETE /api/flows/:id — delete flow
        if (!action && method === 'DELETE') {
          return await handleDeleteFlow(fm)(req, res, flowId);
        }

        // POST /api/flows/:id/clone — clone flow
        if (action === 'clone' && method === 'POST') {
          return await handleCloneFlow(fm)(req, res, flowId);
        }

        // POST /api/flows/:id/upload — upload Excel
        if (action === 'upload' && method === 'POST') {
          return await handleFlowUpload(fm)(req, res, flowId);
        }

        // GET /api/flows/:id/scenes — get scenes
        if (action === 'scenes' && !sub && method === 'GET') {
          return await handleFlowScenes(fm)(req, res, flowId);
        }

        // POST /api/flows/:id/scenes/:sceneId — update scene prompt
        if (action === 'scenes' && sub && method === 'POST') {
          return await handleFlowUpdateScene(fm)(req, res, flowId, sub);
        }

        // GET /api/flows/:id/characters
        if (action === 'characters' && method === 'GET') {
          return await handleFlowCharacters(fm)(req, res, flowId);
        }

        // /api/flows/:id/photos/:charId — ảnh cô dâu / chú rể (POST raw body, DELETE, GET)
        if (action === 'photos' && sub) {
          const charId = decodeURIComponent(sub);
          if (method === 'POST') return await handleFlowPhotoUpload(fm)(req, res, flowId, charId);
          if (method === 'DELETE') return await handleFlowPhotoDelete(fm)(req, res, flowId, charId);
          if (method === 'GET') return handleFlowPhotoGet(fm)(req, res, flowId, charId);
        }

        // /api/flows/:id/edit/... — bước Dựng video
        if (action === 'edit') {
          if (!sub) {
            if (method === 'GET') return await edit.get(req, res, flowId);
            if (method === 'PUT') return await edit.put(req, res, flowId);
          } else if (sub === 'music') {
            if (method === 'POST') return await edit.music(req, res, flowId);
            if (method === 'GET') return await edit.musicGet(req, res, flowId);
          } else if (sub === 'lut' && method === 'POST') return await edit.lut(req, res, flowId);
          else if (sub === 'lyrics' && method === 'POST') return await edit.lyrics(req, res, flowId);
          else if (sub === 'render') {
            if (!sub2 && method === 'POST') return await edit.render(req, res, flowId);
            if (!sub2 && method === 'GET') return await edit.renderStatus(req, res, flowId);
            if (sub2 === 'cancel' && method === 'POST') return await edit.cancel(req, res, flowId);
          } else if (sub === 'final' && sub2 && method === 'GET') return await edit.final(req, res, flowId, sub2);
        }

        // POST /api/flows/:id/start
        if (action === 'start' && method === 'POST') {
          return await handleFlowStart(fm)(req, res, flowId);
        }

        // POST /api/flows/:id/stop
        if (action === 'stop' && method === 'POST') {
          return handleFlowStop(fm)(req, res, flowId);
        }

        // GET /api/flows/:id/status
        if (action === 'status' && method === 'GET') {
          return handleFlowStatus(fm)(req, res, flowId);
        }

        // GET /api/flows/:id/output
        if (action === 'output' && !sub && method === 'GET') {
          return handleFlowOutputList(fm)(req, res, flowId);
        }

        // GET /api/flows/:id/output/zip — download all as ZIP
        if (action === 'output' && sub === 'zip' && method === 'GET') {
          return handleFlowOutputZip(fm)(req, res, flowId);
        }

        // GET /api/flows/:id/output/:filename
        if (action === 'output' && sub && method === 'GET') {
          const filename = decodeURIComponent(sub);
          return handleFlowOutputFile(fm)(req, res, flowId, filename);
        }

        // GET /api/flows/:id/events — SSE per flow
        if (action === 'events' && method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });

          fm.addSSEClient(flowId, res);

          // Heartbeat
          const heartbeat = setInterval(() => {
            res.write(': keepalive\n\n');
          }, 15_000);

          req.on('close', () => {
            clearInterval(heartbeat);
          });
          return;
        }
      }
    }

    // ─── Global API routes ───────────────────────────────

    if (path === '/api/login' && method === 'POST') {
      return handleLogin(req, res);
    }

    // ─── Static files ────────────────────────────────────

    // Serve index.html for both / and /flow/{uuid} (SPA routing)
    let filePath = path;
    if (path === '/' || path.startsWith('/flow/')) {
      filePath = '/index.html';
    }

    const fullPath = join(PUBLIC_DIR, filePath);
    if (existsSync(fullPath)) {
      const ext = filePath.split('.').pop() || '';
      const mimeTypes: Record<string, string> = {
        html: 'text/html; charset=utf-8',
        css: 'text/css',
        js: 'application/javascript',
        cjs: 'application/javascript',
        mjs: 'application/javascript',
        png: 'image/png',
        svg: 'image/svg+xml',
        ico: 'image/x-icon',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(readFileSync(fullPath));
      return;
    }

    // 404
    res.writeHead(404);
    res.end('Not Found');
  } catch (err) {
    console.error('Request error:', err);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
}

const server = createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`\n  GG Flow Web UI: http://localhost:${PORT}\n`);
});
