import http from 'http';
import https from 'https';
import httpProxy from 'http-proxy';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { URL } from 'url';
import { Transform } from 'stream';
import { fileURLToPath } from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import { dirname, join } from 'path';
import { config, API_PATHS } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HOST_IP = config.hostIp;
const CORS_ORIGIN = config.corsOrigin;

console.log('[INFO] HOST_IP:', HOST_IP);

function addCorsHeaders(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(join(__dirname, '../package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const PORT = config.port;

interface GlobalConfig {
  api_token: string;
}


// --- Port cache: loaded at startup, avoids per-request fast-api lookup ---
interface PaneConfig { port: number; token: string; }
const paneCache: Record<string, PaneConfig> = {};
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || '';

async function loadPaneCache(): Promise<void> {
  try {
    const res = await fetch(`${config.fastApiBaseUrl}${API_PATHS.TTYD_LIST}`, {
      headers: { "Authorization": `Bearer ${INTERNAL_TOKEN}`, "Accept": "application/json" }
    });
    if (!res.ok) { console.warn('loadPaneCache: fast-api returned', res.status); return; }
    const data = await res.json() as { configs?: Array<{ pane_id: string; ttyd_port: number }> };
    // Token removed // all panes share the same token
    for (const c of data.configs || []) {
      paneCache[c.pane_id] = { port: c.ttyd_port, token: INTERNAL_TOKEN };
    }
    console.log(`✓ Pane cache loaded: ${Object.keys(paneCache).length} panes`);
  } catch (e) {
    console.warn('loadPaneCache error:', (e as Error).message);
  }
}

async function getPaneConfig(name: string): Promise<PaneConfig | null> {
  if (paneCache[name]) return paneCache[name];
  // Cache miss: fetch from fast-api and update cache
  try {
    const res = await fetch(`${config.fastApiBaseUrl}${API_PATHS.TTYD_BY_NAME(name)}`, {
      headers: { "Authorization": `Bearer ${INTERNAL_TOKEN}`, "Accept": "application/json" }
    });
    if (!res.ok) return null;
    const data = await res.json() as { port: number; token: string };
    paneCache[name] = { port: data.port, token: data.token };
    return paneCache[name];
  } catch { return null; }
}

// Phase 2: New authentication and pane_id normalization

// Normalize pane_id: w-20074 -> w-20074:main.0
function normalizePaneId(paneId: string): string {
  if (!paneId) return paneId;
  if (!paneId.includes(':')) {
    return `${paneId}:main.0`;
  }
  return paneId;
}

// Token verification cache
interface TokenVerifyResult {
  valid: boolean;
  perms?: string[];
  group_id?: number | null;
  pane_id?: string | null;
  expires_at?: string | null;
}

const tokenCache = new Map<string, { result: TokenVerifyResult; cachedAt: number }>();
const CACHE_TTL = 30000; // 30 seconds

async function verifyToken(token: string): Promise<TokenVerifyResult> {
  // Check cache
  const now = Date.now();
  const cached = tokenCache.get(token);
  if (cached && (now - cached.cachedAt) < CACHE_TTL) {
    return cached.result;
  }

  // Call FastAPI verify-token
  try {
    const res = await fetch(`${config.fastApiBaseUrl}/api/auth/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    if (!res.ok) {
      const result = { valid: false };
      tokenCache.set(token, { result, cachedAt: now });
      return result;
    }

    const result: TokenVerifyResult = await res.json();
    tokenCache.set(token, { result, cachedAt: now });
    return result;
  } catch (e) {
    console.error('[AUTH] verify-token error:', (e as Error).message);
    return { valid: false };
  }
}

// Extract token from request
function extractToken(req: http.IncomingMessage): string | null {
  const url = new URL(req.url || '/', 'http://localhost');
  const queryToken = url.searchParams.get('token');
  if (queryToken) return queryToken;

  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    return auth.substring(7);
  }

  return null;
}

// Check if token has required permission
function hasPermission(result: TokenVerifyResult, perm: string): boolean {
  return result.valid && result.perms?.includes(perm) === true;
}


const proxy = httpProxy.createProxyServer({});

proxy.on('error', (err: Error) => {
  console.error('Proxy error:', err.message);
});

proxy.on('proxyRes', (proxyRes: http.IncomingMessage, req: http.IncomingMessage, res: http.ServerResponse) => {
  delete proxyRes.headers['www-authenticate'];
});

function json<T>(res: http.ServerResponse, data: T): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const urlPath = new URL(req.url || '/', 'http://localhost').pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    addCorsHeaders(res);
    res.writeHead(204);
    return res.end();
  }

  addCorsHeaders(res);

  if (urlPath === '/api/health' && req.method === 'GET') {
    return json(res, {
      success: true,
      version: getVersion(),
      timestamp: new Date().toISOString()
    });
  }

  if (urlPath === '/api/refresh-cache' && req.method === 'POST') {
    const token = extractToken(req);
    const authResult = await verifyToken(token || '');
    if (!authResult.valid) { res.writeHead(401); return res.end('unauthorized'); }
    await loadPaneCache();
    return json(res, { success: true, panes: Object.keys(paneCache) });
  }

  if (urlPath === '/api/key' && req.method === 'POST') {
    const token = extractToken(req);
    const authResult = await verifyToken(token || '');
    if (!authResult.valid) { res.writeHead(401); return res.end('unauthorized'); }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { key, target } = JSON.parse(body);
        const paneTarget = target || Object.keys(paneCache)[0];
        if (!paneTarget) { res.writeHead(400); return res.end('no target'); }
        
        const fastRes = await fetch(`${config.fastApiBaseUrl}${API_PATHS.TMUX_SEND}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${INTERNAL_TOKEN}` },
          body: JSON.stringify({ win_id: paneTarget, keys: key })
        });
        const data = await fastRes.json();
        return json(res, data);
      } catch (e) {
        console.error('/api/key error:', (e as Error).message);
        res.writeHead(500);
        return res.end('error');
      }
    });
    return;
  }

  if (urlPath === '/api/capture-bottom' && req.method === 'POST') {
    const token = extractToken(req);
    const authResult = await verifyToken(token || '');
    if (!authResult.valid) { res.writeHead(401); return res.end('unauthorized'); }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { win_id } = JSON.parse(body);
        if (!win_id) { res.writeHead(400); return res.end('win_id required'); }
        
        const fastRes = await fetch(`${config.fastApiBaseUrl}${API_PATHS.TMUX_CAPTURE}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${INTERNAL_TOKEN}` },
          body: JSON.stringify({ win_id, target: 'bottom' })
        });
        const data = await fastRes.json();
        return json(res, data);
      } catch (e) {
        console.error('/api/capture-bottom error:', (e as Error).message);
        res.writeHead(500);
        return res.end('error');
      }
    });
    return;
  }

  if (urlPath.startsWith('/ttyd/')) {
    const m = req.url?.match(/^\/ttyd\/([^/]+)(\/.*)?$/);
    if (m) {

      const url = new URL(req.url || '/', 'http://localhost');
      const queryToken = url.searchParams.get('token');
      const mode = url.searchParams.get('mode');
      let name = decodeURIComponent(m[1].split('?')[0]);
      name = normalizePaneId(name)
      let subPath = m[2] || '/';
      subPath = subPath.split('?')[0];

      // ttyd internal token refresh: no query token required, proxy directly
      if (subPath === '/token') {
        const cfg = await getPaneConfig(name);
        if (!cfg) { res.writeHead(404); return res.end('pane not found'); }
        req.url = '/token';
        delete req.headers['authorization'];
        req.headers['authorization'] = 'Basic ' + Buffer.from('user:' + cfg.token).toString('base64');
        return proxy.web(req, res, { target: 'http://' + HOST_IP + ':' + cfg.port });
      }

      // All other sub-paths require token verification
      const authResult = await verifyToken(queryToken || '');
      if (!authResult.valid) {
        res.writeHead(401);
        return res.end('unauthorized');
      }

      // Check pane_id permission
      if (authResult.pane_id && authResult.pane_id !== name) {
        res.writeHead(403);
        return res.end('forbidden: token not allowed for this pane');
      }

      // Check group_id permission (Step 6) — api_full bypasses
      const isAdmin = authResult.perms?.includes('api_full') === true;
      if (!isAdmin && authResult.group_id !== null && authResult.group_id !== undefined) {
        try {
          const groupRes = await fetch(`${config.fastApiBaseUrl}/api/groups/${authResult.group_id}`, {
            headers: { 'Authorization': `Bearer ${INTERNAL_TOKEN}` }
          });
          if (!groupRes.ok) {
            res.writeHead(403);
            return res.end('forbidden: group not found');
          }
          const groupData = await groupRes.json() as { panes?: { pane_id: string }[] };
          const paneIds = (groupData.panes || []).map(p => normalizePaneId(p.pane_id));
          if (!paneIds.includes(name)) {
            res.writeHead(403);
            return res.end('forbidden: pane not in your group');
          }
        } catch (e) {
          console.error('[AUTH] group_id check error:', (e as Error).message);
          res.writeHead(500);
          return res.end('internal error');
        }
      }


      const cfg = await getPaneConfig(name);
      if (!cfg) {
        res.writeHead(404);
        return res.end('pane not found');
      }

      req.url = subPath;
      delete req.headers['authorization'];
      req.headers['authorization'] = 'Basic ' + Buffer.from('user:' + cfg.token).toString('base64');

      if (subPath === '/') {
        const options = {
          hostname: HOST_IP,
          port: cfg.port,
          path: '/',
          method: 'GET',
          headers: {
            'Authorization': 'Basic ' + Buffer.from('user:' + cfg.token).toString('base64')
          }
        };
        const proxyReq = http.request(options, (proxyRes) => {
          let body = '';
          proxyRes.on('data', (chunk) => body += chunk);
          proxyRes.on('end', () => {
            // Inject readonly mode for ttyd_read permission (Step 6)
            const isReadOnly = hasPermission(authResult, 'ttyd_read') && !hasPermission(authResult, 'ttyd_write');
            const readonlyScript = isReadOnly ? `<script>window.TTYD_READONLY = true;</script>` : '';
            const css = `<style>
      body { background: #1f2937; }
      *::-webkit-scrollbar { width: 6px; height: 6px; }
      *::-webkit-scrollbar-track { background: #1f2937; }
      *::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 3px; }
      *::-webkit-scrollbar-thumb:hover { background: #6b7280; }
      .xterm .xterm-viewport::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
      .xterm .xterm-viewport { scrollbar-width: none !important; -ms-overflow-style: none !important; }
    </style>`
            const head = `${css}<script type="module">import { injectIntoGlobalHook } from "https://ttyd-dev.cicy.de5.net/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;</script>

    <script type="module" src="https://ttyd-dev.cicy.de5.net/@vite/client"></script>
${readonlyScript}`
            const body1 =`<div id="root"></div><script type="module" src="https://ttyd-dev.cicy.de5.net/src/main.tsx"></script>`
           
            if(!mode){
              body = body.replace('</head>', head+'</head>');
              body = body.replace('</body>', body1+'</body>');
            }else{              
              body = body.replace('</head>', css+'</head>');
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(body);
          });
        });
        proxyReq.on('error', (e) => {
          console.error('[INJECT] request error:', e.message);
          res.writeHead(502);
          res.end('Bad gateway');
        });
        proxyReq.end();
        return;
      }

      return proxy.web(req, res, { target: 'http://' + HOST_IP + ':' + cfg.port });
    }
  }

  const token = extractToken(req);
  const authResult = await verifyToken(token || '');
  if (!authResult.valid) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }
});

server.on('upgrade', (req: http.IncomingMessage, socket: import('stream').Duplex, head: Buffer) => {
  const m = req.url?.match(/^\/ttyd\/([^/]+)(\/.*)?$/);
  if (m) {
    let name = decodeURIComponent(m[1].split('?')[0]);
      name = normalizePaneId(name);

    // Check token (async)
    const wsToken = extractToken(req);
    verifyToken(wsToken || '').then(authResult => {
      if (!authResult.valid) {
        socket.destroy();
        return;
      }

      const isReadOnly = hasPermission(authResult, 'ttyd_read') && !hasPermission(authResult, 'ttyd_write');

      return getPaneConfig(name).then(cfg => {
        if (!cfg) { socket.destroy(); return; }

        if (isReadOnly) {
          // 只读模式：用 ws 中转，过滤输入消息
          const subPath = (m[2] || '/').split('?')[0];
          const backendUrl = `ws://${HOST_IP}:${cfg.port}${subPath}`;
          const wss = new WebSocketServer({ noServer: true, handleProtocols: () => 'tty' });
          wss.handleUpgrade(req, socket as any, head, (clientWs) => {
            const backendWs = new WebSocket(backendUrl, ['tty'], {
              headers: { 'Authorization': 'Basic ' + Buffer.from('user:' + cfg.token).toString('base64') }
            });
            backendWs.on('open', () => {
              // 后端→客户端：全部转发
              backendWs.on('message', (data, isBinary) => {
                if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
              });
              // 客户端→后端：过滤 0x30 (输入)
              clientWs.on('message', (data, isBinary) => {
                const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
                if (buf.length > 0 && buf[0] === 0x30) return;
                if (backendWs.readyState === WebSocket.OPEN) backendWs.send(data, { binary: isBinary });
              });
            });
            backendWs.on('error', (err) => { console.error('[readonly] backend error:', err.message); clientWs.close(); });
            clientWs.on('close', () => backendWs.close());
            backendWs.on('close', () => clientWs.close());
            clientWs.on('error', () => backendWs.close());
          });
        } else {
          // 可写模式：直接代理
          req.url = m[2] || '/';
          delete req.headers['authorization'];
          req.headers['authorization'] = 'Basic ' + Buffer.from('user:' + cfg.token).toString('base64');
          proxy.ws(req, socket, head, { target: 'ws://' + HOST_IP + ':' + cfg.port });
        }
      });
    }).catch(() => socket.destroy());
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ttyd-proxy on :' + PORT);
  loadPaneCache();
});
