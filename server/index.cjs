const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');

const { execSync } = require('child_process');

const PORT = parseInt(process.env.PORT || '14443');

// 动态 ttyd 映射：从 ps 解析 ttyd 进程获取 port + token
let ttydCache = {};
let ttydCacheTime = 0;
const CACHE_TTL = 30000; // 30秒缓存

function refreshTtydMap() {
  const now = Date.now();
  if (now - ttydCacheTime < CACHE_TTL && Object.keys(ttydCache).length > 0) return ttydCache;
  try {
    // 读取每个 ttyd 进程的完整命令行
    const pids = execSync("pgrep -f '^ttyd -p'", { encoding: 'utf8', timeout: 5000 }).trim().split('\n').filter(Boolean);
    const map = {};
    for (const pid of pids) {
      try {
        const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
        // 解析参数: ttyd -p <port> -c bot:<token> ... -t <session>:<bot_name>.0
        let port = null, token = null, botName = null;
        for (let i = 0; i < cmdline.length; i++) {
          if (cmdline[i] === '-p' && cmdline[i + 1]) port = cmdline[i + 1];
          if (cmdline[i] === '-c' && cmdline[i + 1]) {
            const m = cmdline[i + 1].match(/^bot:(.+)$/);
            if (m) token = m[1];
          }
          if (cmdline[i] === '-t' && cmdline[i + 1]) {
            // 格式: session:bot_name.0
            const m = cmdline[i + 1].match(/:(.+)\.0$/);
            if (m) botName = m[1];
          }
        }
        if (port && token && botName) {
          map[botName] = { target: `http://127.0.0.1:${port}`, token, tmuxTarget: cmdline[cmdline.indexOf('-t') + 1] };
        }
      } catch {}
    }
    if (Object.keys(map).length > 0) {
      ttydCache = map;
      ttydCacheTime = now;
      console.log(`[ttyd-map] 刷新: ${Object.keys(map).join(', ')}`);
    }
  } catch {
    // pgrep 没找到进程，保留旧缓存
  }
  return ttydCache;
}

function getTtydAuth(botName) {
  const map = refreshTtydMap();
  const bot = map[botName];
  if (!bot) return null;
  return 'Basic ' + Buffer.from('bot:' + bot.token).toString('base64');
}

function getTtydTarget(botName) {
  const map = refreshTtydMap();
  return map[botName] || null;
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

  // tmux send-keys（支持 target 或 bot_name）
  if (req.url === '/api/tmux' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { text, target, bot_name } = JSON.parse(body);
        if (!text) return json(res, { success: false, error: 'need text' });
        // 优先用 bot_name 查找 tmux target
        let tmuxTarget = target;
        if (!tmuxTarget && bot_name) {
          const bot = getTtydTarget(bot_name);
          if (bot) tmuxTarget = bot.tmuxTarget;
        }
        if (!tmuxTarget) return json(res, { success: false, error: 'need target or bot_name' });
        const escaped = text.replace(/'/g, "'\\''");
        execSync(`tmux send-keys -t '${tmuxTarget}' '${escaped}' Enter`, { timeout: 10000 });
        return json(res, { success: true });
      } catch (e) {
        return json(res, { success: false, error: e.message });
      }
    });
    return;
  }

  // bot 列表 API — 从 ttyd 进程动态获取
  if (req.url === '/api/bots') {
    const map = refreshTtydMap();
    const bots = Object.keys(map).map(bot_name => ({ bot_name }));
    return json(res, bots);
  }

  // ttyd 代理: /ttyd/<bot_name>/* → 动态查找 ttyd 进程
  if (req.url.startsWith('/ttyd/')) {
    const parts = req.url.match(/^\/ttyd\/([^/]+)(\/.*)?$/);
    const bot = parts && getTtydTarget(parts[1]);
    if (bot) {
      const auth = getTtydAuth(parts[1]);
      if (auth) req.headers['authorization'] = auth;
      req.url = parts[2] || '/';
      return proxy.web(req, res, { target: bot.target });
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
    const bot = parts && getTtydTarget(parts[1]);
    if (bot) {
      const auth = getTtydAuth(parts[1]);
      if (auth) req.headers['authorization'] = auth;
      req.url = parts[2] || '/';
      return proxy.ws(req, socket, head, { target: bot.target });
    }
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ttyd-proxy on :${PORT}`);
});
