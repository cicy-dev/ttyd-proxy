const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');

const { execSync } = require('child_process');

const PORT = 14443;
const VNC_TARGET = 'http://127.0.0.1:6080';

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

  // 打字到 VNC 聚焦区域
  if (req.url === '/api/type' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body);
        if (!text) return json(res, { success: false, error: 'no text' });
        // 写入剪贴板，然后 Ctrl+V 粘贴，再按 Enter
        execSync(`echo -n ${JSON.stringify(text)} | DISPLAY=:1 xsel --clipboard --input`, { timeout: 5000 });
        execSync(`DISPLAY=:1 xdotool key ctrl+v`, { timeout: 5000 });
        execSync(`DISPLAY=:1 xdotool key Return`, { timeout: 5000 });
        return json(res, { success: true });
      } catch (e) {
        return json(res, { success: false, error: e.message });
      }
    });
    return;
  }

  // 按键到 VNC（如 Return, Tab 等）
  if (req.url === '/api/key' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { key } = JSON.parse(body);
        if (!key) return json(res, { success: false, error: 'no key' });
        execSync(`DISPLAY=:1 xdotool key -- ${key}`, { timeout: 5000 });
        return json(res, { success: true });
      } catch (e) {
        return json(res, { success: false, error: e.message });
      }
    });
    return;
  }

  // 语音转文字
  if (req.url === '/api/voice' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      // 转发到 bot_api 的 voice_to_text
      const boundary = '----FormBoundary' + Date.now();
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`),
        buf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const opts = {
        hostname: '127.0.0.1', port: 15001, path: '/voice_to_text', method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
      };
      const proxyReq = http.request(opts, (proxyRes) => {
        let data = '';
        proxyRes.on('data', c => data += c);
        proxyRes.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });
      proxyReq.on('error', (e) => json(res, { error: e.message }));
      proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }

  // noVNC 代理: /vnc/* → localhost:6080
  if (req.url.startsWith('/vnc')) {
    req.url = req.url.replace(/^\/vnc/, '') || '/';
    return proxy.web(req, res, { target: VNC_TARGET });
  }

  // 静态文件
  serveStatic(req, res);
});

// WebSocket upgrade → noVNC websockify
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/vnc')) {
    req.url = req.url.replace(/^\/vnc/, '') || '/';
    proxy.ws(req, socket, head, { target: VNC_TARGET });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server on :${PORT}`);
  console.log(`   /vnc → ${VNC_TARGET}`);
});
