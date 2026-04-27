# socAdmin

A modern, self-hosted database administration tool. Like phpMyAdmin, but with support for **MySQL**, **PostgreSQL**, and **MongoDB** — all in one interface.

![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)

## Features

- **Multi-SGBD** — MySQL/MariaDB, PostgreSQL, MongoDB from a single UI
- **Full CRUD** — databases, tables, collections, records
- **Query editor** — SQL (MySQL, PostgreSQL) and MongoDB (JSON/BSON)
- **Import / Export** — SQL, CSV, JSON
- **Schema visualization** — table structure, indexes, triggers, routines, views
- **Multi-user auth** — bcrypt passwords, JWT sessions, refresh tokens, rate limiting
- **DB credentials encrypted** — AES-256 at rest, never logged
- **Security** — CSRF protection, secure headers, IP whitelist (optional), audit logs
- **Two deployment modes** — Docker for production, native desktop app for local dev

## Quick Start

### Docker (production)

```bash
# Clone and start with all 3 databases
git clone https://github.com/soleilouisol/socAdmin.git
cd socAdmin
cp .env.example .env  # edit JWT_SECRET and passwords
docker compose up -d
```

Open [http://localhost:8080](http://localhost:8080).

### Use a pre-built image

If you already have databases running, add socAdmin to your existing `docker-compose.yml`:

```yaml
services:
  socadmin:
    image: socadmin:latest
    ports:
      - "8080:8080"
    volumes:
      - socadmin-data:/data
    environment:
      - JWT_SECRET=your-random-string-at-least-32-characters
      - ADMIN_EMAIL=admin@example.com
      - ADMIN_PASSWORD=YourPassword123!@
      - MYSQL_HOST=your-mysql-host
      - POSTGRES_HOST=your-postgres-host
      - MONGO_HOST=your-mongo-host

volumes:
  socadmin-data:
```

### Local development (desktop app)

socAdmin Manager is a native desktop app that manages everything — no terminal, no Docker needed.

```bash
# Prerequisites: Go 1.26+, Node.js 22+, Wails CLI
make install   # install dependencies
make all       # build + launch Manager
```

Or in dev mode with hot-reload:

```bash
make manager-dev
```

## socAdmin Manager

A native desktop app (like MAMP) to run socAdmin locally without any command line.

- Start / Stop the socAdmin server in one click
- Configure the listening port
- Detect installed database engines on your machine
- Install / uninstall MySQL, PostgreSQL, MongoDB
- Start / stop individual database services
- System tray icon

| OS | Format | Package manager |
|---|---|---|
| macOS | `.dmg` | Homebrew |
| Windows | `.exe` (NSIS) | winget, Chocolatey |
| Linux | `.AppImage` | apt, dnf |

Build installers:

```bash
make package-macos VERSION=1.0.0
make package-windows VERSION=1.0.0
make package-linux VERSION=1.0.0
```

## Project Structure

```
socAdmin/
├── core/                   # Shared business logic
│   ├── api/                # REST routes, CSRF, rate limiter, security headers
│   ├── auth/               # JWT, bcrypt, sessions, roles (admin/readonly)
│   ├── backup/             # Database backup & restore
│   ├── connector/          # MySQL, PostgreSQL, MongoDB drivers
│   ├── controller/         # HTTP handlers
│   ├── logger/             # Audit logging
│   ├── security/           # AES-256 crypto, IP whitelist
│   └── service/            # Auth, database, export services
├── frontend/               # React SPA (embedded in Go binary)
│   └── src/
│       ├── pages/          # Login, register, dashboard (25+ views)
│       └── components/     # UI components
├── manager/                # socAdmin Manager (Wails desktop app)
│   ├── app.go              # Server control, service management
│   ├── platform_darwin.go  # macOS: Homebrew, launchctl
│   ├── platform_linux.go   # Linux: apt/dnf, systemctl
│   ├── platform_windows.go # Windows: winget/choco, net/sc
│   └── frontend/           # Manager React UI
├── build/                  # Installer scripts per OS
├── Dockerfile              # Multi-stage (~30MB final image)
├── docker-compose.yml      # Dev: socAdmin + MySQL + PostgreSQL + MongoDB
└── docker-compose.prod.yml # Prod: socAdmin only (bring your own DBs)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Go |
| Frontend | React + TypeScript |
| Desktop app | Go + [Wails](https://wails.io) |
| MySQL/MariaDB | go-sql-driver/mysql |
| PostgreSQL | lib/pq |
| MongoDB | mongo-driver |
| Auth | bcrypt + JWT + refresh tokens |
| Encryption | AES-256-GCM |
| Docker | Alpine, multi-stage, non-root |

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `8080` | HTTP listening port |
| `DATA_DIR` | No | `.` | Persistent data directory |
| `JWT_SECRET` | **Yes** (prod) | auto-generated | JWT signing key (min 32 chars) |
| `ADMIN_EMAIL` | No | — | Initial admin account email |
| `ADMIN_PASSWORD` | No | — | Initial admin password (8+ chars, upper+lower+digit+special) |
| `MYSQL_HOST` | No | — | MySQL connection host |
| `MYSQL_PORT` | No | `3306` | MySQL port |
| `MYSQL_USER` | No | — | MySQL username |
| `MYSQL_PASSWORD` | No | — | MySQL password |
| `POSTGRES_HOST` | No | — | PostgreSQL connection host |
| `POSTGRES_PORT` | No | `5432` | PostgreSQL port |
| `POSTGRES_USER` | No | — | PostgreSQL username |
| `POSTGRES_PASSWORD` | No | — | PostgreSQL password |
| `MONGO_HOST` | No | — | MongoDB connection host |
| `MONGO_PORT` | No | `27017` | MongoDB port |
| `TLS_CERT` | No | — | Path to TLS certificate |
| `TLS_KEY` | No | — | Path to TLS private key |

## Makefile Commands

```bash
make build         # Build socAdmin (backend + embedded frontend)
make manager       # Build the desktop Manager app
make manager-dev   # Run Manager in dev mode (hot-reload)
make all           # Build everything + launch Manager
make start         # Launch the Manager
make stop          # Stop everything
make reload        # Stop + clean + rebuild + relaunch
make install       # Install all dependencies
make check         # Run go vet + TypeScript checks
make status        # Show running processes
make clean         # Remove build artifacts
make push m="msg"  # Git add, commit, push
```

## Security

- Passwords hashed with **bcrypt**
- Login rate limiting (5 attempts before temporary block)
- DB credentials encrypted with **AES-256-GCM** at rest
- CSRF protection on all state-changing endpoints
- Secure HTTP headers (HSTS, X-Frame-Options, CSP)
- JWT with short expiration + refresh token rotation
- Optional IP whitelist
- Full audit logging (connections, queries)
- Docker: non-root user, health checks
- Manager binds to `127.0.0.1` only (never exposed on network)

## CLI

```bash
# Reset a user password
./bin/socadmin --reset-password user@example.com
```

## Contributing

```bash
# Setup
make install

# Development
make manager-dev    # Manager with hot-reload
# or
make build && ./bin/socadmin  # Backend only

# Checks
make check
go test ./...
```
