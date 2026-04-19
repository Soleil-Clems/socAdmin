# ============================================================
# socAdmin — multi-stage Docker build
# Final image: ~30 MB (alpine + single Go binary with embedded SPA)
# ============================================================

# --- Stage 1: build frontend ---
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

# --- Stage 2: build Go binary ---
FROM golang:1.26-alpine AS backend
RUN apk add --no-cache gcc musl-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Replace frontend/dist with the freshly built one
COPY --from=frontend /app/frontend/dist ./frontend/dist
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o /socadmin .

# --- Stage 3: runtime ---
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S socadmin && adduser -S socadmin -G socadmin

WORKDIR /app
COPY --from=backend /socadmin /usr/local/bin/socadmin

# Persistent data: socadmin.db, TLS certs, etc.
RUN mkdir -p /data && chown -R socadmin:socadmin /data
VOLUME /data
ENV DATA_DIR=/data
ENV PORT=8080

USER socadmin
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:${PORT}/ || exit 1

ENTRYPOINT ["socadmin"]
