const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 14443;
const TOKEN = '123456';

function checkToken(req) {
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('token') === TOKEN) return true;
  const auth = req.headers['authorization'];
  if (auth === 'Bearer ' + TOKEN) return true;
  return false;
}

const proxy = httpProxy.createProxyServer({});
proxy.on('error', (err, _req, res) => {
  console.error('Proxy error:', err.message);
  if (res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'proxy error' }));
  }
});
proxy.on('proxyRes', (proxyRes) => {
  delete proxyRes.headers['www-authenticate'];
});

let botCache = [];
let botCacheTime = 0;

function loadBots() {
  if (botCache.length && Date.now() - botCacheTime < 30000) return botCache;
  try {
    const out = execSync('docker exec tts-bot python3 /tmp/load_bots.py', { timeout: 8000 }).toString().trim();
    botCache = JSON.parse(out);
    botCacheTime = Date.now();
    console.log('[bots] loaded', botCache.length);
  } catch (e) { console.error('[bots] error:', e.message); }
  return botCache;
}

function getBotByName(name) {
  return loadBots().find(b => b.bot_name === name);
}

function getTtydAuth(port) {
  const bot = loadBots().find(b => String(b.ttyd_port) === String(port));
  if (bot && bot.ttyd_token) return 'Basic ' + Buffer.from('bot:' + bot.ttyd_token).toString('base64');
  return null;
}

function json(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const distPath = path.join(__dirname, '..', 'dist');

function serveStatic(req, res) {
  const cleanUrl = req.url.split('?')[0];
  let filePath = path.join(distPath, cleanUrl === '/' ? 'index.html' : cleanUrl);
  if (!fs.existsSync(filePath)) filePath = path.join(distPath, 'index.html');
  const ext = path.extname(filePath);
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not Found'); }
}

function readBody(req) {
  return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
}

const server = http.createServer(async (req, res) => {
  const urlPath = new URL(req.url, 'http://localhost').pathname;

  if (urlPath === '/api/health') return json(res, { status: 'ok' });

  // 静态文件不需要认证
  if (!urlPath.startsWith('/api/') && !urlPath.startsWith('/ttyd/')) {
    return serveStatic(req, res);
  }

  // 其他全部需要 token
  if (!checkToken(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  if (urlPath === '/api/bots') {
    return json(res, loadBots().map(b => ({
      bot_name: b.bot_name, win_id: b.tmux_session + ':' + b.tmux_window + '.0',
      group: b.group_name, ttyd_port: b.ttyd_port,
    })));
  }

  if (urlPath === '/api/tmux' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const { text, target } = JSON.parse(body);
      if (!text || !target) return json(res, { success: false, error: 'need text and target' });
      execSync('tmux send-keys -t ' + JSON.stringify(target) + ' ' + JSON.stringify(text) + ' Enter', { timeout: 5000 });
      return json(res, { success: true });
    } catch (e) { return json(res, { success: false, error: e.message }); }
  }

  const m = req.url.match(/^\/ttyd\/([^/]+)(\/.*)?$/);
  if (m) {
    const nameOrPort = m[1];
    let port;
    if (/^\d+$/.test(nameOrPort)) { port = nameOrPort; }
    else {
      const bot = getBotByName(nameOrPort);
      if (!bot || !bot.ttyd_port) { res.writeHead(404); return res.end('bot not found'); }
      port = bot.ttyd_port;
    }
    req.url = m[2] || '/';
    delete req.headers['authorization'];
    return proxy.web(req, res, { target: 'http://127.0.0.1:' + port });
  }

  serveStatic(req, res);
});

server.on('upgrade', (req, socket, head) => {
  if (!checkToken(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  const m = req.url.match(/^\/ttyd\/([^/]+)(\/.*)?$/);
  if (m) {
    const nameOrPort = m[1];
    let port;
    if (/^\d+$/.test(nameOrPort)) { port = nameOrPort; }
    else { const bot = getBotByName(nameOrPort); port = bot && bot.ttyd_port; }
    if (!port) return socket.destroy();
    req.url = m[2] || '/';
    delete req.headers['authorization'];
    proxy.ws(req, socket, head, { target: 'http://127.0.0.1:' + port });
  } else { socket.destroy(); }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ttyd-proxy on :' + PORT);
  loadBots();
});
