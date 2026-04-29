# socAdmin — Docker

## Quick Start

```bash
docker run -d \
  -p 8080:8080 \
  -v socadmin-data:/data \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD='MyStr0ng!Pass' \
  soleilclems/socadmin
```

Open [http://localhost:8080](http://localhost:8080) and log in with the credentials above.

## Docker Compose

### With MySQL

```yaml
services:
  socadmin:
    image: soleilclems/socadmin
    ports:
      - "8080:8080"
    volumes:
      - socadmin-data:/data
    environment:
      - ADMIN_EMAIL=admin@example.com
      - ADMIN_PASSWORD=MyStr0ng!Pass
      - MYSQL_HOST=mysql
      - MYSQL_USER=root
      - MYSQL_PASSWORD=secret
    depends_on:
      mysql:
        condition: service_healthy

  mysql:
    image: mysql:8
    environment:
      - MYSQL_ROOT_PASSWORD=secret
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  socadmin-data:
  mysql-data:
```

### With PostgreSQL

```yaml
services:
  socadmin:
    image: soleilclems/socadmin
    ports:
      - "8080:8080"
    volumes:
      - socadmin-data:/data
    environment:
      - ADMIN_EMAIL=admin@example.com
      - ADMIN_PASSWORD=MyStr0ng!Pass
      - POSTGRES_HOST=postgres
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=secret
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_PASSWORD=secret
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  socadmin-data:
  pg-data:
```

### With MongoDB

```yaml
services:
  socadmin:
    image: soleilclems/socadmin
    ports:
      - "8080:8080"
    volumes:
      - socadmin-data:/data
    environment:
      - ADMIN_EMAIL=admin@example.com
      - ADMIN_PASSWORD=MyStr0ng!Pass
      - MONGO_HOST=mongo
    depends_on:
      mongo:
        condition: service_healthy

  mongo:
    image: mongo:7
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  socadmin-data:
  mongo-data:
```

### All Three Databases

```yaml
services:
  socadmin:
    image: soleilclems/socadmin
    ports:
      - "8080:8080"
    volumes:
      - socadmin-data:/data
    environment:
      - ADMIN_EMAIL=admin@example.com
      - ADMIN_PASSWORD=MyStr0ng!Pass
      - JWT_SECRET=change-me-to-a-random-string-at-least-32-chars
      - MYSQL_HOST=mysql
      - MYSQL_USER=root
      - MYSQL_PASSWORD=secret
      - POSTGRES_HOST=postgres
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=secret
      - MONGO_HOST=mongo
    depends_on:
      mysql:
        condition: service_healthy
      postgres:
        condition: service_healthy
      mongo:
        condition: service_healthy
    restart: unless-stopped

  mysql:
    image: mysql:8
    environment:
      - MYSQL_ROOT_PASSWORD=secret
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 3s
      retries: 10

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_PASSWORD=secret
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10

  mongo:
    image: mongo:7
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  socadmin-data:
  mysql-data:
  pg-data:
  mongo-data:
```

## Environment Variables

### Application

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `8080` | HTTP server port |
| `DATA_DIR` | No | `/data` | Directory for persistent data (SQLite DB, encryption keys) |
| `ADMIN_EMAIL` | No | — | Auto-create an admin account on first start |
| `ADMIN_PASSWORD` | No | — | Password for the auto-created admin (min 10 chars, uppercase, lowercase, digit, special char) |
| `JWT_SECRET` | No | auto-generated | Secret for signing JWT tokens (min 32 chars). Recommended in production |

### Database Connections

Pre-configure database connections so users don't need to enter credentials manually. All three types can be used simultaneously.

**MySQL / MariaDB**

| Variable | Default | Description |
|----------|---------|-------------|
| `MYSQL_HOST` | — | MySQL server hostname (enables MySQL pre-config) |
| `MYSQL_PORT` | `3306` | MySQL server port |
| `MYSQL_USER` | `root` | MySQL username |
| `MYSQL_PASSWORD` | — | MySQL password |

**PostgreSQL**

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | — | PostgreSQL server hostname (enables PostgreSQL pre-config) |
| `POSTGRES_PORT` | `5432` | PostgreSQL server port |
| `POSTGRES_USER` | `postgres` | PostgreSQL username |
| `POSTGRES_PASSWORD` | — | PostgreSQL password |

**MongoDB**

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_HOST` | — | MongoDB server hostname (enables MongoDB pre-config) |
| `MONGO_PORT` | `27017` | MongoDB server port |
| `MONGO_USER` | — | MongoDB username (optional) |
| `MONGO_PASSWORD` | — | MongoDB password (optional) |

### TLS / HTTPS

| Variable | Default | Description |
|----------|---------|-------------|
| `TLS_CERT` | — | Path to TLS certificate file |
| `TLS_KEY` | — | Path to TLS private key file |
| `HTTP_REDIRECT_PORT` | `80` | Port for HTTP → HTTPS redirect |

## Volumes

| Path | Description |
|------|-------------|
| `/data` | Persistent storage: SQLite database (`socadmin.db`), encryption keys, JWT secret |

Always mount a volume on `/data` to persist your user accounts and settings across container restarts.

## Production Recommendations

### Behind a Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl;
    server_name db.example.com;

    ssl_certificate     /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Behind Traefik

```yaml
services:
  socadmin:
    image: soleilclems/socadmin
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.socadmin.rule=Host(`db.example.com`)"
      - "traefik.http.routers.socadmin.tls.certresolver=letsencrypt"
      - "traefik.http.services.socadmin.loadbalancer.server.port=8080"
    volumes:
      - socadmin-data:/data
    environment:
      - ADMIN_EMAIL=admin@example.com
      - ADMIN_PASSWORD=MyStr0ng!Pass
      - JWT_SECRET=your-random-secret-at-least-32-characters-long
```

### Security Checklist

- Set `JWT_SECRET` explicitly (don't rely on auto-generated)
- Use strong `ADMIN_PASSWORD` (10+ chars, mixed case, digits, special)
- Always run behind a reverse proxy with HTTPS in production
- Never expose port 8080 directly to the internet
- Mount `/data` on a persistent volume

## Image Details

- Base image: `alpine:3.21`
- Size: ~30 MB
- Runs as non-root user `socadmin`
- Built-in healthcheck on `/`
- Multi-arch: `linux/amd64`

## Reset Admin Password

```bash
docker exec -it <container> socadmin --reset-password admin@example.com
```
