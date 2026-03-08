# ttyd-proxy

Web-based terminal management interface with multi-pane support.

## Quick Start

### Pull from Docker Hub
```bash
docker pull cicydev/ttyd-proxy:server
```

### Development (Hot Reload Enabled)
```bash
docker compose up --build
```

**Access:**
- Frontend: http://localhost:6902
- Server API: http://localhost:6901

### Production
```bash
docker compose -f docker-compose.prod.yml up --build -d
```

**Access:**
- Frontend: http://localhost (Nginx)
- Server: http://localhost:6901

## Development Workflow & Hot Reload

### Hot Reload Architecture

This project supports **instant code updates without restarting Docker containers**.

#### Server (TypeScript + tsx watch)
- **Technology**: `tsx watch` monitors file changes
- **Hot Reload Files**:
  - `server/src/**/*.ts` - TypeScript source files
  - `server/package.json` - Version info (via `getVersion()`)
- **How it works**:
  - Volume mount: `./server/src:/app/src:ro`
  - Volume mount: `./server/package.json:/app/package.json:ro`
  - tsx watch detects changes and restarts the server automatically
- **Example**:
  ```bash
  # Edit server code
  vim server/src/index.ts
  # Server automatically restarts - check logs
  docker compose -f docker-compose.yml logs -f server
  ```

#### Frontend (Vite + HMR)
- **Technology**: Vite Hot Module Replacement (HMR)
- **Hot Reload Files**:
  - `frontend/src/**/*.ts` - TypeScript source
  - `frontend/src/**/*.css` - Styles
  - `frontend/index.html` - HTML template
  - `frontend/vite.config.ts` - Vite config
- **How it works**:
  - Volume mount: `./frontend/src:/app/src:ro`
  - Vite HMR updates browser instantly without full page reload
- **Example**:
  ```bash
  # Edit frontend code
  vim frontend/src/main.ts
  # Browser auto-updates (if open) or refresh to see changes
  ```

### Development Flow Example

```bash
# 1. Start development environment
docker compose -f docker-compose.yml up -d

# 2. Check services are running
docker compose -f docker-compose.yml ps

# 3. View logs (optional)
docker compose -f docker-compose.yml logs -f

# 4. Make code changes (hot reload triggers automatically)
#    - Edit server/src/index.ts → Server restarts
#    - Edit frontend/src/main.ts → Browser updates

# 5. Test changes
curl http://localhost:6901/api/health
# Or open http://localhost:6902 in browser

# 6. Version bump example
vim server/package.json  # Change "version": "1.0.4"
curl http://localhost:6901/api/health  # New version appears

# 7. Stop when done
docker compose -f docker-compose.yml down
```

### When Hot Reload Requires Container Restart

Hot reload works for code changes. You need to restart containers when:
- Adding new npm packages (`package.json` dependencies changed)
- Changing Dockerfile
- Changing docker-compose.yml ports or volumes
- Adding new environment variables

```bash
# Rebuild after dependency changes
docker compose -f docker-compose.yml up -d --build
```

## Architecture

| Feature | Development | Production |
|---------|-------------|------------|
| Server | `tsx watch` live reload | Pre-compiled JS |
| Frontend | Vite dev server + HMR | Nginx static files |
| Mount | Bind mount source code | Immutable images |
| Ports | 6902 (frontend), 6901 (server) | 80 (frontend), 6901 (server) |

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
├── frontend/
│   ├── src/
│   │   └── main.ts         # Vite app entry
│   ├── index.html          # HTML template
│   ├── vite.config.ts      # Vite config with proxy
│   ├── package.json        # Dependencies
│   ├── Dockerfile          # Production build
│   └── Dockerfile.dev      # Development server
├── docker-compose.yml  # Development config
├── docker-compose.prod.yml # Production config
├── .gitignore
└── README.md
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check with version info |
| `/api/bots` | GET | List bots (requires auth) |
| `/api/tmux` | POST | Send tmux command (requires auth) |
| `/api/tmux-list` | GET | List tmux sessions (requires auth) |
| `/api/correctEnglish` | POST | English text correction (requires auth) |
| `/ttyd/:name` | WS | WebSocket proxy to ttyd |

## Environment Variables

### Server
- `PORT` - Server port (default: 6901)
- `NODE_ENV` - Environment (development/production)

### Frontend
- `NODE_ENV` - Environment (development/production)

## Docker Volumes (Development)

| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `./server/src` | `/app/src` | Server source (hot reload) |
| `./server/package.json` | `/app/package.json` | Version info (hot reload) |
| `./frontend/src` | `/app/src` | Frontend source (HMR) |
| `./frontend/index.html` | `/app/index.html` | HTML template (HMR) |
| `./frontend/vite.config.ts` | `/app/vite.config.ts` | Vite config (HMR) |
| `/var/run/docker.sock` | `/var/run/docker.sock` | Docker access for server |
| `~/personal` | `/root/personal` | Config files (read-only) |

## Troubleshooting

### Hot reload not working
```bash
# Check tsx watch is running
docker compose -f docker-compose.yml logs server | grep tsx

# Check file mounts
docker compose -f docker-compose.yml config
```

### Port already in use
```bash
# Find process using port
lsof -i :6901
lsof -i :6902

# Remove orphan containers
docker compose -f docker-compose.yml down --remove-orphans
```

### 502 Bad Gateway
- Check server is running: `docker compose -f docker-compose.yml ps`
- Check server logs: `docker compose -f docker-compose.yml logs server`
- Verify port configuration matches between docker-compose and vite.config.ts
