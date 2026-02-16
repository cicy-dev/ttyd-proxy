const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const PORT = 14443;

// Load or generate token from ~/personal/global.json
function loadOrGenerateToken() {
  const configPath = path.join(os.homedir(), 'personal', 'global.json');
  const configDir = path.dirname(configPath);

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.api_token) {
        console.log(`✓ Loaded token from ${configPath}`);
        return config.api_token;
      }
    }

    const crypto = require('crypto');
    const newToken = crypto.randomBytes(32).toString('hex');
    const config = { api_token: newToken };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`✓ Generated new token and saved to ${configPath}`);
    return newToken;
  } catch (e) {
    console.error('Error loading/generating token:', e.message);
    return '123456';
  }
}

const TOKEN = loadOrGenerateToken();

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

async function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = new URL(req.url, 'http://localhost').pathname;

  // Health check - no auth required
  if (urlPath === '/api/health') {
    return json(res, { status: 'ok' });
  }

  // Static files - no auth required
  if (!urlPath.startsWith('/api/') && !urlPath.startsWith('/ttyd/')) {
    return serveStatic(req, res);
  }

  // All other API endpoints require authentication
  if (!checkToken(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  if (urlPath === '/api/bots' && req.method === 'GET') {
    return json(res, loadBots());
  }

  if (urlPath === '/api/tmux' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const { text, target } = JSON.parse(body);
      if (!text || !text.trim() || !target) return json(res, { success: false, error: 'need text and target' });
      execSync('tmux send-keys -t ' + JSON.stringify(target) + ' ' + JSON.stringify(text) + ' Enter', { timeout: 5000 });
      return json(res, { success: true });
    } catch (e) { return json(res, { success: false, error: e.message }); }
  }

  // 英文纠错 - 使用 Hugging Face 免费 API
  if (urlPath === '/api/correctEnglish' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const { text } = JSON.parse(body);
      console.log('[correctEnglish] Received text:', text);
      
      if (!text) return json(res, { success: false, error: 'no text' });
      
      const hfUrl = 'https://api-inference.huggingface.co/models/facebook/bart-large-cnn';
      const prompt = `Correct this English text: ${text}`;
      
      const hfBody = JSON.stringify({
        inputs: prompt,
        parameters: { max_length: 200, min_length: 10 }
      });

      console.log('[correctEnglish] Calling Hugging Face API...');
      const https = require('https');
      const url = new URL(hfUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      };

      const hfReq = https.request(options, (hfRes) => {
        let data = '';
        hfRes.on('data', chunk => data += chunk);
        hfRes.on('end', () => {
          try {
            console.log('[correctEnglish] HF response:', data.substring(0, 200));
            
            if (hfRes.statusCode !== 200) {
              console.error('[correctEnglish] HF API error:', hfRes.statusCode, data);
              let corrected = text
                .replace(/\br\s+you\b/gi, 'are you')
                .replace(/\bhow old a you\b/gi, 'how old are you')
                .replace(/\bi want test\b/gi, 'I want to test')
                .replace(/\bthis is work\b/gi, 'this works')
                .replace(/\biam\b/gi, 'I am')
                .replace(/\bu\b/gi, 'you')
                .replace(/\br\b/gi, 'are')
                .replace(/^([a-z])/, (m) => m.toUpperCase())
                .replace(/([^.!?])$/, '$1.');
              return json(res, { success: true, correctedText: corrected.trim() });
            }
            
            const result = JSON.parse(data);
            let correctedText = result[0]?.summary_text || result[0]?.generated_text || text;
            correctedText = correctedText
              .replace(/^Correct this English text:\s*/i, '')
              .replace(/^["']|["']$/g, '')
              .trim();
            
            json(res, { success: true, correctedText: correctedText });
          } catch (e) {
            console.error('[correctEnglish] Parse error:', e.message);
            let corrected = text
              .replace(/\br\s+you\b/gi, 'are you')
              .replace(/\bhow old a you\b/gi, 'how old are you')
              .replace(/\bu\b/gi, 'you')
              .replace(/\br\b/gi, 'are')
              .replace(/^([a-z])/, (m) => m.toUpperCase());
            json(res, { success: true, correctedText: corrected.trim() });
          }
        });
      });

      hfReq.on('error', (e) => {
        console.error('[correctEnglish] Request error:', e.message);
        let corrected = text
          .replace(/\br\s+you\b/gi, 'are you')
          .replace(/\bhow old a you\b/gi, 'how old are you')
          .replace(/\bu\b/gi, 'you')
          .replace(/\br\b/gi, 'are')
          .replace(/^([a-z])/, (m) => m.toUpperCase());
        json(res, { success: true, correctedText: corrected.trim() });
      });

      hfReq.write(hfBody);
      hfReq.end();
      return;
      
    } catch (e) {
      console.error('[correctEnglish] Error:', e.message);
      return json(res, { success: false, error: e.message });
    }
  }

  const m = req.url.match(/^\/ttyd\/([^\/]+)(\/.*)?$/);
  if (m) {
    const nameOrPort = m[1];
    let port;
    let bot;
    if (/^\d+$/.test(nameOrPort)) { 
      port = nameOrPort;
      bot = loadBots().find(b => String(b.ttyd_port) === String(port));
    } else {
      bot = getBotByName(nameOrPort);
      if (!bot || !bot.ttyd_port) { res.writeHead(404); return res.end('bot not found'); }
      port = bot.ttyd_port;
    }
    req.url = m[2] || '/';
    delete req.headers['authorization'];
    
    // Add ttyd Basic Auth
    if (bot && bot.ttyd_token) {
      const auth = 'Basic ' + Buffer.from('bot:' + bot.ttyd_token).toString('base64');
      req.headers['authorization'] = auth;
    }
    
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
    let bot;
    if (/^\d+$/.test(nameOrPort)) {
      port = nameOrPort;
      bot = loadBots().find(b => String(b.ttyd_port) === String(port));
    } else {
      bot = getBotByName(nameOrPort);
      port = bot && bot.ttyd_port;
    }
    if (!port) return socket.destroy();
    req.url = m[2] || '/';
    delete req.headers['authorization'];
    
    // Add ttyd Basic Auth for WebSocket
    if (bot && bot.ttyd_token) {
      const auth = 'Basic ' + Buffer.from('bot:' + bot.ttyd_token).toString('base64');
      req.headers['authorization'] = auth;
    }
    
    proxy.ws(req, socket, head, { target: 'http://127.0.0.1:' + port });
  } else { socket.destroy(); }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ttyd-proxy on :' + PORT);
  loadBots();
});
