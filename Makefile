# socAdmin — Makefile

export PATH := $(shell go env GOPATH)/bin:$(PATH)

BACK_PORT  = 8080
FRONT_PORT = 5173

# --- All : build tout + lance le Manager ---
all: build manager
	@echo ""
	@echo "✓ socAdmin built    → bin/socadmin"
	@echo "✓ Manager built     → manager/build/bin/"
	@echo ""
	@echo "Launching socAdmin Manager..."
	@open "manager/build/bin/socAdmin Manager.app" 2>/dev/null || manager/build/bin/socadmin-manager 2>/dev/null || echo "Run: open \"manager/build/bin/socAdmin Manager.app\""

# --- Start : lance le Manager (qui gère tout) ---
start:
	@echo "Launching socAdmin Manager..."
	@open "manager/build/bin/socAdmin Manager.app" 2>/dev/null || manager/build/bin/socadmin-manager 2>/dev/null || echo "Manager not built. Run: make all"

# --- Stop : kill backend + ferme le Manager ---
stop:
	@echo "Stopping socAdmin..."
	@lsof -ti :$(BACK_PORT) | xargs kill -9 2>/dev/null && echo "Backend stopped  (:$(BACK_PORT))" || echo "Backend not running"
	@pkill -f "socadmin-manager" 2>/dev/null && echo "Manager stopped" || echo "Manager not running"

# --- Reload : stop tout + clean + rebuild + relance le Manager ---
reload: stop
	@sleep 1
	@rm -rf manager/frontend/dist manager/build/bin
	@$(MAKE) build
	@$(MAKE) manager
	@$(MAKE) start

# --- Build : compile socAdmin (backend + frontend embed) ---
build:
	@echo "Building frontend..."
	cd frontend && npm run build
	@echo "Building backend..."
	go build -o bin/socadmin .
	@echo "Build done → bin/socadmin"

# --- Install les dépendances ---
install:
	go mod download
	cd frontend && npm install
	cd manager/frontend && npm install

# --- Check / Lint ---
check:
	go vet ./...
	cd frontend && npx tsc -b
	cd manager && go vet ./...

# --- Manager : build l'app desktop Wails ---
manager:
	@echo "Building socAdmin Manager..."
	cd manager && wails build
	@echo "Manager built → manager/build/bin/"

manager-dev:
	@echo "Starting socAdmin Manager (dev mode)..."
	cd manager && wails dev

# --- Package : build les installateurs par plateforme ---
# Usage : make package-macos VERSION=1.0.0
VERSION ?= 1.0.0

package-macos:
	chmod +x build/macos/package.sh
	./build/macos/package.sh $(VERSION)

package-windows:
	chmod +x build/windows/package.sh
	./build/windows/package.sh $(VERSION)

package-linux:
	chmod +x build/linux/package.sh
	./build/linux/package.sh $(VERSION)

package-all: package-macos package-windows package-linux

# --- Clean ---
clean:
	rm -rf bin/
	rm -rf frontend/dist/
	rm -rf manager/build/bin/
	rm -rf build/*/dist/

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

.PHONY: all start stop reload build install check clean status push manager manager-dev package-macos package-windows package-linux package-all
