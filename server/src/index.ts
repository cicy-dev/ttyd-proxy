import http from 'http';
import https from 'https';
import httpProxy from 'http-proxy';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { URL } from 'url';
import { fileURLToPath } from 'url';
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

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function loadOrGenerateToken(): string {
  const configPath = path.join(os.homedir(), 'personal', 'global.json');
  const configDir = path.dirname(configPath);

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    if (fs.existsSync(configPath)) {
      const config: GlobalConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.api_token) {
        console.log(`✓ Loaded token from ${configPath}`);
        return config.api_token;
      }
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    const config: GlobalConfig = { api_token: newToken };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`✓ Generated new token and saved to ${configPath}`);
    return newToken;
  } catch (e) {
    const error = e as Error;
    console.error('Error loading/generating token:', error.message);
    return '123456';
  }
}

const TOKEN = loadOrGenerateToken();

// --- Port cache: loaded at startup, avoids per-request fast-api lookup ---
interface PaneConfig { port: number; token: string; }
const paneCache: Record<string, PaneConfig> = {};

async function loadPaneCache(): Promise<void> {
  try {
    const res = await fetch(`${config.fastApiBaseUrl}${API_PATHS.TTYD_LIST}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json' }
    });
    if (!res.ok) { console.warn('loadPaneCache: fast-api returned', res.status); return; }
    const data = await res.json() as { configs?: Array<{ pane_id: string; ttyd_port: number }> };
    const token = TOKEN; // all panes share the same token
    for (const c of data.configs || []) {
      paneCache[c.pane_id] = { port: c.ttyd_port, token };
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
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json() as { port: number; token: string };
    paneCache[name] = { port: data.port, token: TOKEN };
    return paneCache[name];
  } catch { return null; }
}

function checkToken(req: http.IncomingMessage): boolean {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.searchParams.get('token') === TOKEN) return true;
  const auth = req.headers['authorization'];
  if (auth === 'Bearer ' + TOKEN) return true;
  return false;
}

const proxy = httpProxy.createProxyServer({});

proxy.on('error', (err: Error) => {
  console.error('Proxy error:', err.message);
});


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
    if (!checkToken(req)) { res.writeHead(401); return res.end('unauthorized'); }
    await loadPaneCache();
    return json(res, { success: true, panes: Object.keys(paneCache) });
  }

  if (urlPath === '/api/key' && req.method === 'POST') {
    if (!checkToken(req)) { res.writeHead(401); return res.end('unauthorized'); }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { key, target } = JSON.parse(body);
        const paneTarget = target || Object.keys(paneCache)[0];
        if (!paneTarget) { res.writeHead(400); return res.end('no target'); }
        
        const fastRes = await fetch(`${config.fastApiBaseUrl}${API_PATHS.TMUX_SEND}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
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

  if (urlPath.startsWith('/ttyd/')) {
    const m = req.url?.match(/^\/ttyd\/([^/]+)(\/.*)?$/);
    if (m) {

      const url = new URL(req.url || '/', 'http://localhost');
      const queryToken = url.searchParams.get('token');
      const name = m[1]
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

      // All other sub-paths require query token
      if (queryToken !== TOKEN) {
        res.writeHead(401);
        return res.end('unauthorized');
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
            body = body.replace('</head>', '</head>');
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

  if (!checkToken(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }
});

server.on('upgrade', (req: http.IncomingMessage, socket: import('stream').Duplex, head: Buffer) => {
  const m = req.url?.match(/^\/ttyd\/([^/]+)(\/.*)?$/);
  if (m) {
    const name = m[1];

    // Check token
    const wsUrl = new URL(req.url || '/', 'http://localhost');
    const wsQueryToken = wsUrl.searchParams.get('token');
    if (wsQueryToken !== TOKEN) {
      socket.destroy();
      return;
    }

    getPaneConfig(name).then(cfg => {
      if (!cfg) { socket.destroy(); return; }
      req.url = m[2] || '/';
      delete req.headers['authorization'];
      req.headers['authorization'] = 'Basic ' + Buffer.from('user:' + cfg.token).toString('base64');
      proxy.ws(req, socket, head, { target: 'ws://' + HOST_IP + ':' + cfg.port });
    }).catch(() => socket.destroy());
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ttyd-proxy on :' + PORT);
  loadPaneCache();
});
