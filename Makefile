# socAdmin — Makefile

PID_BACK = /tmp/socadmin-back.pid
PID_FRONT = /tmp/socadmin-front.pid

# --- Start : lance tout en background ---
start:
	@echo "Starting socAdmin..."
	@go run main.go & echo $$! > $(PID_BACK)
	@cd frontend && npm run dev & echo $$! > $(PID_FRONT)
	@echo "Backend  PID: $$(cat $(PID_BACK))"
	@echo "Frontend PID: $$(cat $(PID_FRONT))"
	@echo "Ready → http://localhost:5173"

# --- Stop : arrête tout ---
stop:
	@echo "Stopping socAdmin..."
	@if [ -f $(PID_BACK) ]; then kill $$(cat $(PID_BACK)) 2>/dev/null; rm -f $(PID_BACK); echo "Backend stopped"; fi
	@if [ -f $(PID_FRONT) ]; then kill $$(cat $(PID_FRONT)) 2>/dev/null; rm -f $(PID_FRONT); echo "Frontend stopped"; fi

# --- Reload : restart tout ---
reload: stop start

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
	@if [ -f $(PID_BACK) ] && kill -0 $$(cat $(PID_BACK)) 2>/dev/null; then echo "Backend:  running (PID $$(cat $(PID_BACK)))"; else echo "Backend:  stopped"; fi
	@if [ -f $(PID_FRONT) ] && kill -0 $$(cat $(PID_FRONT)) 2>/dev/null; then echo "Frontend: running (PID $$(cat $(PID_FRONT)))"; else echo "Frontend: stopped"; fi

.PHONY: start stop reload build install check clean status
