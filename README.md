# ttyd-proxy

HTTP/WebSocket proxy server for ttyd terminals.

## Quick Start

### Pull from Docker Hub
```bash
docker pull cicybot/ttyd-proxy:server
```

### Development (Hot Reload Enabled)
```bash
docker compose up --build
```

**Access:**
- Server API: http://localhost:6901

### Production
```bash
docker compose up --build -d
```

**Access:**
- Server: http://localhost:6901

## Development Workflow

### Hot Reload

The server uses `tsx watch` for instant code updates without restarting the container.

```bash
# Edit server code
vim server/src/index.ts
# Server automatically restarts - check logs
docker compose logs -f server
```

### Development Flow

```bash
# 1. Start development environment
docker compose up -d

# 2. Check services are running
docker compose ps

# 3. View logs
docker compose logs -f

# 4. Make code changes (hot reload triggers automatically)
vim server/src/index.ts

# 5. Test changes
curl http://localhost:6901/api/health

# 6. Stop when done
docker compose down
```

### When Container Restart Required

- Adding new npm packages
- Changing Dockerfile
- Changing docker-compose.yml

```bash
docker compose up -d --build
```

## Project Structure

```
.
├── server/
│   ├── src/
│   │   └── index.ts        # Main server code
│   ├── package.json        # Dependencies & version
│   ├── tsconfig.json       # TypeScript config
│   ├── Dockerfile          # Production build
│   └── Dockerfile.dev      # Development with tsx watch
├── docker-compose.yml      # Docker config
├── .gitignore
└── README.md
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check with version info |
| `/api/refresh-cache` | POST | Refresh pane cache (requires auth) |
| `/api/key` | POST | Send key to tmux (requires auth) |
| `/ttyd/:name/*` | GET/WS | Proxy to ttyd instance |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 6901 | Server port |
| `NODE_ENV` | development | Environment |
| `CORS_ORIGIN` | * | CORS allowed origins |
| `FASTAPI_URL` | http://127.0.0.1:14444 | FastAPI backend |
| `HOST_IP` | host.docker.internal | ttyd host IP |

## Troubleshooting

### Port already in use
```bash
lsof -i :6901
docker compose down --remove-orphans
```

### 502 Bad Gateway
- Check server is running: `docker compose ps`
- Check server logs: `docker compose logs`
