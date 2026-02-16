const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');

const { execSync } = require('child_process');

const PORT = parseInt(process.env.PORT || '14443');

// === 认证配置 ===
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'pb200898';
const BASIC_USER = process.env.BASIC_USER || 'admin';
const BASIC_PASS = process.env.BASIC_PASS || 'pb200898';
const BASIC_EXPECTED = 'Basic ' + Buffer.from(`${BASIC_USER}:${BASIC_PASS}`).toString('base64');
// cookie 签名用的 key（简单 HMAC）
const crypto = require('crypto');
const COOKIE_SECRET = crypto.createHash('sha256').update(AUTH_TOKEN + 'ttyd-proxy').digest('hex').slice(0, 32);
const COOKIE_NAME = 'ttyd_auth';

function makeAuthCookie() {
  const payload = Date.now().toString();
  const sig = crypto.createHmac('sha256', COOKIE_SECRET).update(payload).digest('hex').slice(0, 16);
  return `${payload}.${sig}`;
}

function verifyAuthCookie(val) {
  if (!val) return false;
  const [payload, sig] = val.split('.');
  if (!payload || !sig) return false;
  // cookie 有效期 7 天
  if (Date.now() - parseInt(payload) > 7 * 86400000) return false;
  const expected = crypto.createHmac('sha256', COOKIE_SECRET).update(payload).digest('hex').slice(0, 16);
  return sig === expected;
}

function parseCookies(req) {
  const obj = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) obj[k] = v.join('=');
  });
  return obj;
}

// 认证检查：token 参数 / Basic Auth / cookie 通过即可
function checkAuth(req, res) {
  // 1. cookie
  const cookies = parseCookies(req);
  if (verifyAuthCookie(cookies[COOKIE_NAME])) return true;
  // 2. URL token 参数（TG Mini WebView 用）— 通过后种 cookie
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('token') === AUTH_TOKEN) {
    if (res && res.writeHead) {
      // 种 cookie 后 redirect 去掉 token 参数（避免泄露）
      url.searchParams.delete('token');
      const clean = url.pathname + (url.search || '');
      res.writeHead(302, {
        'Set-Cookie': `${COOKIE_NAME}=${makeAuthCookie()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`,
        'Location': clean,
      });
      res.end();
      return 'redirected';
    }
    return true;
  }
  // 3. HTTP Basic Auth（浏览器用）— 通过后也种 cookie
  const auth = req.headers['authorization'];
  if (auth === BASIC_EXPECTED) {
    // 种 cookie 让 iframe/WS 后续请求也能通过
    if (res && res.writeHead) {
      res._authCookie = `${COOKIE_NAME}=${makeAuthCookie()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`;
    }
    return true;
  }
  return false;
}

// WS 认证（只检查 cookie 和 Basic Auth，不能 redirect）
function checkAuthWs(req) {
  const cookies = parseCookies(req);
  if (verifyAuthCookie(cookies[COOKIE_NAME])) return true;
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('token') === AUTH_TOKEN) return true;
  const auth = req.headers['authorization'];
  if (auth === BASIC_EXPECTED) return true;
  return false;
}

function sendUnauthorized(res) {
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="ttyd-proxy"',
    'Content-Type': 'text/plain',
  });
  res.end('Unauthorized');
}

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
  // health 不需要认证
  if (req.url === '/api/health') return json(res, { status: 'ok' });

  // 所有其他请求需要认证
  const authResult = checkAuth(req, res);
  if (authResult === 'redirected') return; // token → cookie redirect 已处理
  if (!authResult) return sendUnauthorized(res);

  // Basic Auth 通过时种 cookie（让 iframe 后续请求也能通过）
  const origWriteHead = res.writeHead.bind(res);
  if (res._authCookie) {
    res.writeHead = (status, headers) => {
      headers = headers || {};
      headers['Set-Cookie'] = res._authCookie;
      return origWriteHead(status, headers);
    };
  }

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
  // WebSocket 也需要认证
  if (!checkAuthWs(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

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
