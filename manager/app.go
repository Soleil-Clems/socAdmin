package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// SGBDInfo holds detection info for a database engine.
type SGBDInfo struct {
	Name      string `json:"name"`
	Installed bool   `json:"installed"`
	Version   string `json:"version"`
	Path      string `json:"path"`
}

// ServerStatus holds the current state of the socAdmin server.
type ServerStatus struct {
	Running   bool   `json:"running"`
	Port      int    `json:"port"`
	PID       int    `json:"pid"`
	Uptime    string `json:"uptime"`
	URL       string `json:"url"`
}

// AppConfig holds persisted settings.
type AppConfig struct {
	Port          int    `json:"port"`
	AutoStart     bool   `json:"autoStart"`
	OpenOnStart   bool   `json:"openOnStart"`
}

// App struct — the Wails backend.
type App struct {
	ctx       context.Context
	mu        sync.Mutex
	cmd       *os.Process
	port      int
	autoStart bool
	openOnStart bool
	startedAt time.Time
	configDir string
}

func NewApp() *App {
	home, _ := os.UserHomeDir()
	configDir := filepath.Join(home, ".socadmin")
	os.MkdirAll(configDir, 0755)

	a := &App{
		port:        8080,
		autoStart:   false,
		openOnStart: true,
		configDir:   configDir,
	}
	a.loadConfig()
	return a
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	if a.autoStart {
		go func() {
			time.Sleep(500 * time.Millisecond)
			a.StartServer()
		}()
	}
}

func (a *App) shutdown(ctx context.Context) {
	a.StopServer()
}

// ---------- Server control ----------

func (a *App) StartServer() ServerStatus {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.cmd != nil {
		return a.statusLocked()
	}

	// Find the socadmin binary
	binPath := a.findBinary()
	if binPath == "" {
		wailsRuntime.EventsEmit(a.ctx, "server:error", "socAdmin binary not found. Run 'make build' in the project root first.")
		return ServerStatus{Running: false, Port: a.port}
	}

	cmd := exec.Command(binPath)
	cmd.Env = append(os.Environ(), fmt.Sprintf("SOCADMIN_PORT=%d", a.port))
	cmd.Dir = filepath.Dir(binPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "server:error", "Failed to start: "+err.Error())
		return ServerStatus{Running: false, Port: a.port}
	}

	a.cmd = cmd.Process
	a.startedAt = time.Now()

	// Wait for the server to be ready
	go func() {
		ready := false
		for i := 0; i < 30; i++ {
			conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", a.port), 200*time.Millisecond)
			if err == nil {
				conn.Close()
				ready = true
				break
			}
			time.Sleep(200 * time.Millisecond)
		}
		if ready {
			wailsRuntime.EventsEmit(a.ctx, "server:started", a.port)
			if a.openOnStart {
				a.openBrowserInternal()
			}
		} else {
			wailsRuntime.EventsEmit(a.ctx, "server:error", "Server started but port not reachable after 6s")
		}
	}()

	return a.statusLocked()
}

func (a *App) StopServer() ServerStatus {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.cmd == nil {
		return ServerStatus{Running: false, Port: a.port}
	}

	a.cmd.Kill()
	a.cmd.Wait()
	a.cmd = nil
	a.startedAt = time.Time{}

	wailsRuntime.EventsEmit(a.ctx, "server:stopped", nil)
	return ServerStatus{Running: false, Port: a.port}
}

func (a *App) GetStatus() ServerStatus {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.statusLocked()
}

func (a *App) statusLocked() ServerStatus {
	running := a.cmd != nil
	s := ServerStatus{
		Running: running,
		Port:    a.port,
		URL:     fmt.Sprintf("http://localhost:%d", a.port),
	}
	if running {
		s.PID = a.cmd.Pid
		s.Uptime = formatDuration(time.Since(a.startedAt))
	}
	return s
}

// ---------- SGBD detection ----------

func (a *App) DetectSGBD() []SGBDInfo {
	sgbds := []SGBDInfo{
		{Name: "MySQL"},
		{Name: "PostgreSQL"},
		{Name: "MongoDB"},
	}

	commands := map[string][]struct {
		bin  string
		args []string
	}{
		"MySQL": {
			{bin: "mysql", args: []string{"--version"}},
			{bin: "mysqld", args: []string{"--version"}},
		},
		"PostgreSQL": {
			{bin: "psql", args: []string{"--version"}},
			{bin: "pg_isready", args: []string{"--version"}},
		},
		"MongoDB": {
			{bin: "mongod", args: []string{"--version"}},
			{bin: "mongosh", args: []string{"--version"}},
		},
	}

	for i, sgbd := range sgbds {
		for _, cmd := range commands[sgbd.Name] {
			path, err := exec.LookPath(cmd.bin)
			if err != nil {
				continue
			}
			sgbds[i].Installed = true
			sgbds[i].Path = path

			out, err := exec.Command(path, cmd.args...).CombinedOutput()
			if err == nil {
				version := strings.TrimSpace(string(out))
				// Take first line only
				if idx := strings.IndexByte(version, '\n'); idx > 0 {
					version = version[:idx]
				}
				sgbds[i].Version = version
			}
			break
		}
	}

	return sgbds
}

// ---------- Config ----------

func (a *App) GetConfig() AppConfig {
	return AppConfig{
		Port:        a.port,
		AutoStart:   a.autoStart,
		OpenOnStart: a.openOnStart,
	}
}

func (a *App) SetPort(port int) error {
	if port < 1024 || port > 65535 {
		return fmt.Errorf("port must be between 1024 and 65535")
	}
	a.mu.Lock()
	if a.cmd != nil {
		a.mu.Unlock()
		return fmt.Errorf("cannot change port while server is running")
	}
	a.port = port
	a.mu.Unlock()
	a.saveConfig()
	return nil
}

func (a *App) SetAutoStart(enabled bool) {
	a.autoStart = enabled
	a.saveConfig()
}

func (a *App) SetOpenOnStart(enabled bool) {
	a.openOnStart = enabled
	a.saveConfig()
}

// ---------- Browser ----------

func (a *App) OpenBrowser() {
	a.openBrowserInternal()
}

func (a *App) openBrowserInternal() {
	url := fmt.Sprintf("http://localhost:%d", a.port)
	switch runtime.GOOS {
	case "darwin":
		exec.Command("open", url).Start()
	case "windows":
		exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	default:
		exec.Command("xdg-open", url).Start()
	}
}

// ---------- System info ----------

func (a *App) GetSystemInfo() map[string]string {
	return map[string]string{
		"os":       runtime.GOOS,
		"arch":     runtime.GOARCH,
		"goVer":    runtime.Version(),
		"configDir": a.configDir,
	}
}

// ---------- Internal helpers ----------

func (a *App) findBinary() string {
	// Look in several locations relative to the manager
	execPath, _ := os.Executable()
	execDir := filepath.Dir(execPath)

	candidates := []string{
		filepath.Join(execDir, "..", "bin", "socadmin"),
		filepath.Join(execDir, "..", "socadmin"),
		filepath.Join(execDir, "socadmin"),
	}

	// Also look in the project directory (dev mode)
	cwd, _ := os.Getwd()
	candidates = append(candidates,
		filepath.Join(cwd, "bin", "socadmin"),
		filepath.Join(cwd, "..", "bin", "socadmin"),
	)

	// Check PATH
	if p, err := exec.LookPath("socadmin"); err == nil {
		candidates = append(candidates, p)
	}

	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

func (a *App) configPath() string {
	return filepath.Join(a.configDir, "manager.conf")
}

func (a *App) loadConfig() {
	data, err := os.ReadFile(a.configPath())
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(data), "\n") {
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key, val := strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
		switch key {
		case "port":
			if p, err := strconv.Atoi(val); err == nil && p >= 1024 && p <= 65535 {
				a.port = p
			}
		case "autoStart":
			a.autoStart = val == "true"
		case "openOnStart":
			a.openOnStart = val == "true"
		}
	}
}

func (a *App) saveConfig() {
	content := fmt.Sprintf("port=%d\nautoStart=%t\nopenOnStart=%t\n", a.port, a.autoStart, a.openOnStart)
	os.WriteFile(a.configPath(), []byte(content), 0644)
}

func formatDuration(d time.Duration) string {
	d = d.Round(time.Second)
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	if h > 0 {
		return fmt.Sprintf("%dh %dm %ds", h, m, s)
	}
	if m > 0 {
		return fmt.Sprintf("%dm %ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}
