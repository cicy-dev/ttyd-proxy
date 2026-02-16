const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');

const { execSync } = require('child_process');

const PORT = parseInt(process.env.PORT || '14443');

// ttyd bot → port + token 映射
const TTYD_MAP = {
  'cicy_master_xk_bot': { target: 'http://127.0.0.1:16000', token: 'C5MOi6qz8X4_PnP_qh0AmQ' },
  'cicy_test_final_bot': { target: 'http://127.0.0.1:16001', token: 'suniOm4YnGNU7w6UeORL6w' },
  'cicy_test_auto_bot': { target: 'http://127.0.0.1:16002', token: '4WoKhWGPd-F4_1bNWEvH8w' },
};

function getTtydAuth(botName) {
  const bot = TTYD_MAP[botName];
  if (!bot) return null;
  return 'Basic ' + Buffer.from('bot:' + bot.token).toString('base64');
}

const proxy = httpProxy.createProxyServer({});
proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err.message);
  if (res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'proxy error' }));
  }
});

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const distPath = path.join(__dirname, '..', 'dist');

function serveStatic(req, res) {
  let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(filePath)) filePath = path.join(distPath, 'index.html');
  const ext = path.extname(filePath);
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

function json(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  // API
  if (req.url === '/api/health') return json(res, { status: 'ok' });

  // tmux send-keys
  if (req.url === '/api/tmux' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { text, target } = JSON.parse(body);
        if (!text || !target) return json(res, { success: false, error: 'need text and target' });
        // 转义单引号，用 tmux send-keys 发送
        const escaped = text.replace(/'/g, "'\\''");
        execSync(`tmux send-keys -t '${target}' '${escaped}' Enter`, { timeout: 10000 });
        return json(res, { success: true });
      } catch (e) {
        return json(res, { success: false, error: e.message });
      }
    });
    return;
  }

  // bot 列表 API
  if (req.url === '/api/bots') {
    try {
      // 从 bots.conf 读取 bot 列表
      const confPath = path.join(process.env.HOME || '/root', 'projects/tts-bot/bots.conf');
      const lines = fs.readFileSync(confPath, 'utf8').trim().split('\n').filter(l => l && !l.startsWith('#'));
      const bots = lines.map(line => {
        const [bot_name, group] = line.split(',');
        return { bot_name, group, win_id: `${group}:${bot_name}.0` };
      });
      return json(res, bots);
    } catch (e) {
      return json(res, []);
    }
  }

  // ttyd 代理: /ttyd/<bot_name>/* → localhost:16000/16001/16002
  if (req.url.startsWith('/ttyd/')) {
    const parts = req.url.match(/^\/ttyd\/([^/]+)(\/.*)?$/);
    if (parts && TTYD_MAP[parts[1]]) {
      const auth = getTtydAuth(parts[1]);
      if (auth) req.headers['authorization'] = auth;
      req.url = parts[2] || '/';
      return proxy.web(req, res, { target: TTYD_MAP[parts[1]].target });
    }
  }

  // 静态文件
  serveStatic(req, res);
});

// WebSocket upgrade
server.on('upgrade', (req, socket, head) => {
  // ttyd WebSocket
  if (req.url.startsWith('/ttyd/')) {
    const parts = req.url.match(/^\/ttyd\/([^/]+)(\/.*)?$/);
    if (parts && TTYD_MAP[parts[1]]) {
      const auth = getTtydAuth(parts[1]);
      if (auth) req.headers['authorization'] = auth;
      req.url = parts[2] || '/';
      return proxy.ws(req, socket, head, { target: TTYD_MAP[parts[1]].target });
    }
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ttyd-proxy on :${PORT}`);
});
