# socAdmin — Makefile

BACK_PORT  = 8080
FRONT_PORT = 5173

# --- Start : lance tout en background ---
start:
	@if lsof -ti :$(BACK_PORT) >/dev/null 2>&1; then echo "Backend already running on :$(BACK_PORT)"; exit 1; fi
	@if lsof -ti :$(FRONT_PORT) >/dev/null 2>&1; then echo "Frontend already running on :$(FRONT_PORT)"; exit 1; fi
	@echo "Starting socAdmin..."
	@go run main.go & disown
	@cd frontend && npm run dev -- --port $(FRONT_PORT) & disown
	@sleep 1
	@echo "Backend  → http://localhost:$(BACK_PORT)"
	@echo "Frontend → http://localhost:$(FRONT_PORT)"

# --- Stop : kill par port (tue toutes les instances) ---
stop:
	@echo "Stopping socAdmin..."
	@lsof -ti :$(BACK_PORT) | xargs kill -9 2>/dev/null && echo "Backend stopped  (:$(BACK_PORT))" || echo "Backend not running"
	@lsof -ti :$(FRONT_PORT) | xargs kill -9 2>/dev/null && echo "Frontend stopped (:$(FRONT_PORT))" || echo "Frontend not running"

# --- Reload : restart tout ---
reload: stop
	@sleep 1
	@$(MAKE) start

# --- Build ---
build:
	cd frontend && npm run build
	go build -o bin/socadmin main.go
	@echo "Build done → bin/socadmin"

# --- Install les dépendances ---
install:
	go mod download
	cd frontend && npm install

# --- Check / Lint ---
check:
	go vet ./...
	cd frontend && npx tsc --noEmit

# --- Clean ---
clean:
	rm -rf bin/
	rm -rf frontend/dist/

# --- Status ---
status:
	@if lsof -ti :$(BACK_PORT) >/dev/null 2>&1; then echo "Backend:  running (:$(BACK_PORT), PID $$(lsof -ti :$(BACK_PORT) | head -1))"; else echo "Backend:  stopped"; fi
	@if lsof -ti :$(FRONT_PORT) >/dev/null 2>&1; then echo "Frontend: running (:$(FRONT_PORT), PID $$(lsof -ti :$(FRONT_PORT) | head -1))"; else echo "Frontend: stopped"; fi

# --- Push : git add, commit et push en une commande ---
# Usage : make push m="feat: mon message de commit"
push:
	@if [ -z "$(m)" ]; then echo "Usage: make push m=\"your commit message\""; exit 1; fi
	git add -A
	git commit -m "$(m)"
	git push

.PHONY: start stop reload build install check clean status push
