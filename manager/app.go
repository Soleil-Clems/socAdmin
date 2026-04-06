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

// ─── Types ───────────────────────────────────────────────────────

type ServiceStatus struct {
	Name      string `json:"name"`
	Running   bool   `json:"running"`
	Installed bool   `json:"installed"`
	Version   string `json:"version"`
	Port      int    `json:"port"`
	PID       int    `json:"pid"`
	Path      string `json:"path"`
}

type ServerStatus struct {
	Running bool   `json:"running"`
	Port    int    `json:"port"`
	PID     int    `json:"pid"`
	Uptime  string `json:"uptime"`
	URL     string `json:"url"`
}

type AppConfig struct {
	Port        int  `json:"port"`
	AutoStart   bool `json:"autoStart"`
	OpenOnStart bool `json:"openOnStart"`
	MysqlPort   int  `json:"mysqlPort"`
	PgPort      int  `json:"pgPort"`
	MongoPort   int  `json:"mongoPort"`
}

// ─── App ─────────────────────────────────────────────────────────

type App struct {
	ctx         context.Context
	mu          sync.Mutex
	serverProc  *os.Process
	port        int
	autoStart   bool
	openOnStart bool
	startedAt   time.Time
	configDir   string
	projectDir  string // path to the socAdmin project root

	// SGBD port config
	mysqlPort int
	pgPort    int
	mongoPort int
}

func NewApp() *App {
	home, _ := os.UserHomeDir()
	configDir := filepath.Join(home, ".socadmin")
	os.MkdirAll(configDir, 0755)

	// Detect project directory (where bin/socadmin lives)
	projectDir := detectProjectDir()

	a := &App{
		port:        8080,
		autoStart:   false,
		openOnStart: true,
		configDir:   configDir,
		projectDir:  projectDir,
		mysqlPort:   8889, // MAMP default
		pgPort:      5432,
		mongoPort:   27017,
	}
	a.loadConfig()
	return a
}

func detectProjectDir() string {
	// From executable path (inside .app bundle or direct)
	execPath, _ := os.Executable()
	execDir := filepath.Dir(execPath)

	// .app bundle: Contents/MacOS/binary → go up to find project
	candidates := []string{
		filepath.Join(execDir, "..", "..", "..", "..", ".."), // inside .app
		filepath.Join(execDir, ".."),                         // direct run from manager/
	}

	// From CWD
	cwd, _ := os.Getwd()
	candidates = append(candidates, cwd, filepath.Join(cwd, ".."))

	for _, c := range candidates {
		abs, _ := filepath.Abs(c)
		if _, err := os.Stat(filepath.Join(abs, "bin", "socadmin")); err == nil {
			return abs
		}
		if _, err := os.Stat(filepath.Join(abs, "main.go")); err == nil {
			return abs
		}
	}
	return ""
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

// ─── socAdmin Server control ─────────────────────────────────────

func (a *App) StartServer() ServerStatus {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.serverProc != nil {
		return a.serverStatusLocked()
	}

	binPath := a.findBinary()
	if binPath == "" {
		a.emitError("socAdmin binary not found. Run 'make build' first.")
		return ServerStatus{Running: false, Port: a.port}
	}

	cmd := exec.Command(binPath)
	cmd.Env = append(os.Environ(), fmt.Sprintf("SOCADMIN_PORT=%d", a.port))
	cmd.Dir = filepath.Dir(binPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		a.emitError("Failed to start socAdmin: " + err.Error())
		return ServerStatus{Running: false, Port: a.port}
	}

	a.serverProc = cmd.Process
	a.startedAt = time.Now()

	go a.waitForPort(a.port, "server:started", func() {
		if a.openOnStart {
			a.openBrowserInternal()
		}
	})

	return a.serverStatusLocked()
}

func (a *App) StopServer() ServerStatus {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.serverProc == nil {
		return ServerStatus{Running: false, Port: a.port}
	}

	a.serverProc.Kill()
	a.serverProc.Wait()
	a.serverProc = nil
	a.startedAt = time.Time{}

	wailsRuntime.EventsEmit(a.ctx, "server:stopped", nil)
	return ServerStatus{Running: false, Port: a.port}
}

func (a *App) GetServerStatus() ServerStatus {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.serverStatusLocked()
}

func (a *App) serverStatusLocked() ServerStatus {
	running := a.serverProc != nil
	s := ServerStatus{
		Running: running,
		Port:    a.port,
		URL:     fmt.Sprintf("http://localhost:%d", a.port),
	}
	if running {
		s.PID = a.serverProc.Pid
		s.Uptime = formatDuration(time.Since(a.startedAt))
	}
	return s
}

// ─── SGBD Service control ────────────────────────────────────────

// Extra paths where SGBD binaries might live (MAMP, Homebrew, etc.)
var extraSearchPaths = []string{
	// MAMP MySQL
	"/Applications/MAMP/Library/bin/mysql80/bin",
	"/Applications/MAMP/Library/bin/mysql57/bin",
	"/Applications/MAMP/Library/bin",
	// Homebrew (Apple Silicon + Intel)
	"/opt/homebrew/bin",
	"/opt/homebrew/opt/mysql/bin",
	"/opt/homebrew/opt/postgresql/bin",
	"/opt/homebrew/opt/mongodb-community/bin",
	"/usr/local/bin",
	"/usr/local/opt/mysql/bin",
	"/usr/local/opt/postgresql/bin",
	"/usr/local/opt/mongodb-community/bin",
}

func (a *App) GetAllServices() []ServiceStatus {
	return []ServiceStatus{
		a.detectService("MySQL", a.mysqlPort, []string{"mysqld", "mysql.server", "mysql"}, []string{"--version"}),
		a.detectService("PostgreSQL", a.pgPort, []string{"postgres", "pg_isready", "psql"}, []string{"--version"}),
		a.detectService("MongoDB", a.mongoPort, []string{"mongod", "mongosh"}, []string{"--version"}),
	}
}

func (a *App) detectService(name string, port int, binaries []string, versionArgs []string) ServiceStatus {
	s := ServiceStatus{Name: name, Port: port}

	// Check if installed — first try PATH, then extra locations
	for _, bin := range binaries {
		// Try system PATH
		if path, err := exec.LookPath(bin); err == nil {
			s.Installed = true
			s.Path = path
			s.Version = getVersion(path, versionArgs)
			break
		}
		// Try extra paths
		for _, dir := range extraSearchPaths {
			fullPath := filepath.Join(dir, bin)
			if _, err := os.Stat(fullPath); err == nil {
				s.Installed = true
				s.Path = fullPath
				s.Version = getVersion(fullPath, versionArgs)
				break
			}
		}
		if s.Installed {
			break
		}
	}

	// Check if running on port
	s.Running = isPortOpen(port)
	if s.Running {
		s.PID = a.findPIDOnPort(port)
	}

	return s
}

func getVersion(path string, args []string) string {
	out, err := exec.Command(path, args...).CombinedOutput()
	if err != nil {
		return ""
	}
	ver := strings.TrimSpace(string(out))
	if idx := strings.IndexByte(ver, '\n'); idx > 0 {
		ver = ver[:idx]
	}
	return ver
}

func (a *App) StartService(name string) error {
	switch name {
	case "MySQL":
		return a.startMySQL()
	case "PostgreSQL":
		return a.startPostgreSQL()
	case "MongoDB":
		return a.startMongoDB()
	default:
		return fmt.Errorf("unknown service: %s", name)
	}
}

func (a *App) StopService(name string) error {
	switch name {
	case "MySQL":
		return a.stopMySQL()
	case "PostgreSQL":
		return a.stopPostgreSQL()
	case "MongoDB":
		return a.stopMongoDB()
	default:
		return fmt.Errorf("unknown service: %s", name)
	}
}

func (a *App) SetServicePort(name string, port int) error {
	if port < 1024 || port > 65535 {
		return fmt.Errorf("port must be between 1024 and 65535")
	}
	switch name {
	case "MySQL":
		a.mysqlPort = port
	case "PostgreSQL":
		a.pgPort = port
	case "MongoDB":
		a.mongoPort = port
	default:
		return fmt.Errorf("unknown service: %s", name)
	}
	a.saveConfig()
	return nil
}

// ──��� MySQL ───────────────────────────────────────────────────────

// findBin searches PATH then extra paths for a binary.
func findBin(name string) string {
	if p, err := exec.LookPath(name); err == nil {
		return p
	}
	for _, dir := range extraSearchPaths {
		full := filepath.Join(dir, name)
		if _, err := os.Stat(full); err == nil {
			return full
		}
	}
	return ""
}

func (a *App) startMySQL() error {
	// MAMP
	mampCtl := "/Applications/MAMP/bin/start.sh"
	if _, err := os.Stat(mampCtl); err == nil {
		cmd := exec.Command(mampCtl)
		if _, err := cmd.CombinedOutput(); err == nil {
			a.emitEvent("service:started", "MySQL")
			return nil
		}
	}

	// brew services
	if runtime.GOOS == "darwin" {
		if _, err := exec.LookPath("brew"); err == nil {
			cmd := exec.Command("brew", "services", "start", "mysql")
			if _, err := cmd.CombinedOutput(); err == nil {
				a.emitEvent("service:started", "MySQL")
				return nil
			}
		}
	}

	// mysql.server
	if path := findBin("mysql.server"); path != "" {
		cmd := exec.Command(path, "start")
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("mysql.server start failed: %s", string(out))
		}
		a.emitEvent("service:started", "MySQL")
		return nil
	}

	// mysqld directly
	if path := findBin("mysqld"); path != "" {
		cmd := exec.Command(path, fmt.Sprintf("--port=%d", a.mysqlPort))
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("mysqld start failed: %v", err)
		}
		a.emitEvent("service:started", "MySQL")
		return nil
	}

	return fmt.Errorf("MySQL not found. Install it via Homebrew or MAMP")
}

func (a *App) stopMySQL() error {
	// MAMP
	mampCtl := "/Applications/MAMP/bin/stop.sh"
	if _, err := os.Stat(mampCtl); err == nil {
		cmd := exec.Command(mampCtl)
		if _, err := cmd.CombinedOutput(); err == nil {
			a.emitEvent("service:stopped", "MySQL")
			return nil
		}
	}

	// brew services
	if runtime.GOOS == "darwin" {
		if _, err := exec.LookPath("brew"); err == nil {
			cmd := exec.Command("brew", "services", "stop", "mysql")
			if _, err := cmd.CombinedOutput(); err == nil {
				a.emitEvent("service:stopped", "MySQL")
				return nil
			}
		}
	}

	if path := findBin("mysql.server"); path != "" {
		cmd := exec.Command(path, "stop")
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("mysql.server stop failed: %s", string(out))
		}
		a.emitEvent("service:stopped", "MySQL")
		return nil
	}

	if path := findBin("mysqladmin"); path != "" {
		cmd := exec.Command(path, "-u", "root", "shutdown")
		if _, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("mysqladmin shutdown failed: %v", err)
		}
		a.emitEvent("service:stopped", "MySQL")
		return nil
	}

	return fmt.Errorf("could not stop MySQL — no control binary found")
}

// ─── PostgreSQL ──────────────────────────────────────────────────

func (a *App) startPostgreSQL() error {
	if runtime.GOOS == "darwin" {
		if _, err := exec.LookPath("brew"); err == nil {
			for _, formula := range []string{"postgresql", "postgresql@17", "postgresql@16", "postgresql@15", "postgresql@14"} {
				cmd := exec.Command("brew", "services", "start", formula)
				if _, err := cmd.CombinedOutput(); err == nil {
					a.emitEvent("service:started", "PostgreSQL")
					return nil
				}
			}
		}
	}

	if path := findBin("pg_ctl"); path != "" {
		dataDir := a.findPgDataDir()
		if dataDir == "" {
			return fmt.Errorf("PostgreSQL data directory not found")
		}
		cmd := exec.Command(path, "start", "-D", dataDir, "-o", fmt.Sprintf("-p %d", a.pgPort), "-l", filepath.Join(a.configDir, "pg.log"))
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("pg_ctl start failed: %s", string(out))
		}
		a.emitEvent("service:started", "PostgreSQL")
		return nil
	}

	return fmt.Errorf("PostgreSQL not found. Install it first")
}

func (a *App) stopPostgreSQL() error {
	if runtime.GOOS == "darwin" {
		if _, err := exec.LookPath("brew"); err == nil {
			for _, formula := range []string{"postgresql", "postgresql@17", "postgresql@16", "postgresql@15", "postgresql@14"} {
				cmd := exec.Command("brew", "services", "stop", formula)
				if _, err := cmd.CombinedOutput(); err == nil {
					a.emitEvent("service:stopped", "PostgreSQL")
					return nil
				}
			}
		}
	}

	if path := findBin("pg_ctl"); path != "" {
		dataDir := a.findPgDataDir()
		if dataDir != "" {
			cmd := exec.Command(path, "stop", "-D", dataDir)
			if out, err := cmd.CombinedOutput(); err != nil {
				return fmt.Errorf("pg_ctl stop failed: %s", string(out))
			}
			a.emitEvent("service:stopped", "PostgreSQL")
			return nil
		}
	}

	return fmt.Errorf("could not stop PostgreSQL — no control binary found")
}

func (a *App) findPgDataDir() string {
	// Common locations
	home, _ := os.UserHomeDir()
	candidates := []string{
		"/opt/homebrew/var/postgresql@17",
		"/opt/homebrew/var/postgresql@16",
		"/opt/homebrew/var/postgresql@15",
		"/opt/homebrew/var/postgresql@14",
		"/opt/homebrew/var/postgres",
		"/usr/local/var/postgres",
		filepath.Join(home, "postgres-data"),
		"/var/lib/postgresql/data",
	}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "PG_VERSION")); err == nil {
			return c
		}
	}
	return ""
}

// ─── MongoDB ─────────────────────────────────────────────────────

func (a *App) startMongoDB() error {
	if runtime.GOOS == "darwin" {
		if _, err := exec.LookPath("brew"); err == nil {
			// Try community edition first, then regular
			for _, formula := range []string{"mongodb-community", "mongodb/brew/mongodb-community", "mongosh"} {
				cmd := exec.Command("brew", "services", "start", formula)
				if _, err := cmd.CombinedOutput(); err == nil {
					a.emitEvent("service:started", "MongoDB")
					return nil
				}
			}
		}
	}

	if path := findBin("mongod"); path != "" {
		dbPath := filepath.Join(a.configDir, "mongo-data")
		os.MkdirAll(dbPath, 0755)
		logPath := filepath.Join(a.configDir, "mongod.log")

		cmd := exec.Command(path,
			"--port", strconv.Itoa(a.mongoPort),
			"--dbpath", dbPath,
			"--logpath", logPath,
			"--fork",
		)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("mongod start failed: %s", string(out))
		}
		a.emitEvent("service:started", "MongoDB")
		return nil
	}

	return fmt.Errorf("MongoDB not found. Install it first")
}

func (a *App) stopMongoDB() error {
	if runtime.GOOS == "darwin" {
		if _, err := exec.LookPath("brew"); err == nil {
			for _, formula := range []string{"mongodb-community", "mongodb/brew/mongodb-community"} {
				cmd := exec.Command("brew", "services", "stop", formula)
				if _, err := cmd.CombinedOutput(); err == nil {
					a.emitEvent("service:stopped", "MongoDB")
					return nil
				}
			}
		}
	}

	// mongod --shutdown or kill
	if path := findBin("mongod"); path != "" {
		dbPath := filepath.Join(a.configDir, "mongo-data")
		cmd := exec.Command(path, "--shutdown", "--dbpath", dbPath)
		if _, err := cmd.CombinedOutput(); err == nil {
			a.emitEvent("service:stopped", "MongoDB")
			return nil
		}
	}

	// Try mongosh
	if path := findBin("mongosh"); path != "" {
		cmd := exec.Command(path, "--eval", "db.adminCommand({shutdown: 1})", "--quiet")
		cmd.CombinedOutput()
		a.emitEvent("service:stopped", "MongoDB")
		return nil
	}

	return fmt.Errorf("could not stop MongoDB")
}

// ─── Config ──────────────────────────────────────────────────────

func (a *App) GetConfig() AppConfig {
	return AppConfig{
		Port:        a.port,
		AutoStart:   a.autoStart,
		OpenOnStart: a.openOnStart,
		MysqlPort:   a.mysqlPort,
		PgPort:      a.pgPort,
		MongoPort:   a.mongoPort,
	}
}

func (a *App) SetPort(port int) error {
	if port < 1024 || port > 65535 {
		return fmt.Errorf("port must be between 1024 and 65535")
	}
	a.mu.Lock()
	if a.serverProc != nil {
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

// ─── Browser ─────────────────────────────────────────────────────

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

// ─── System info ─────────────────────────────────────────────────

func (a *App) GetSystemInfo() map[string]string {
	return map[string]string{
		"os":        runtime.GOOS,
		"arch":      runtime.GOARCH,
		"goVer":     runtime.Version(),
		"configDir": a.configDir,
	}
}

// ─── Helpers ─────────────────────────────────────────────────────

func (a *App) findBinary() string {
	var candidates []string

	// Project dir (most reliable)
	if a.projectDir != "" {
		candidates = append(candidates, filepath.Join(a.projectDir, "bin", "socadmin"))
	}

	execPath, _ := os.Executable()
	execDir := filepath.Dir(execPath)
	cwd, _ := os.Getwd()

	candidates = append(candidates,
		filepath.Join(execDir, "..", "..", "..", "..", "..", "bin", "socadmin"),
		filepath.Join(execDir, "..", "bin", "socadmin"),
		filepath.Join(execDir, "socadmin"),
		filepath.Join(cwd, "bin", "socadmin"),
		filepath.Join(cwd, "..", "bin", "socadmin"),
	)

	if p, err := exec.LookPath("socadmin"); err == nil {
		candidates = append(candidates, p)
	}

	for _, c := range candidates {
		abs, _ := filepath.Abs(c)
		if _, err := os.Stat(abs); err == nil {
			return abs
		}
	}
	return ""
}

func (a *App) waitForPort(port int, event string, onReady func()) {
	for i := 0; i < 30; i++ {
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 200*time.Millisecond)
		if err == nil {
			conn.Close()
			wailsRuntime.EventsEmit(a.ctx, event, port)
			if onReady != nil {
				onReady()
			}
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
	a.emitError(fmt.Sprintf("Port %d not reachable after 6s", port))
}

func (a *App) emitError(msg string) {
	if a.ctx != nil {
		wailsRuntime.EventsEmit(a.ctx, "app:error", msg)
	}
}

func (a *App) emitEvent(event string, data interface{}) {
	if a.ctx != nil {
		wailsRuntime.EventsEmit(a.ctx, event, data)
	}
}

func isPortOpen(port int) bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 300*time.Millisecond)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

func (a *App) findPIDOnPort(port int) int {
	out, err := exec.Command("lsof", "-ti", fmt.Sprintf(":%d", port)).CombinedOutput()
	if err != nil {
		return 0
	}
	line := strings.TrimSpace(strings.Split(string(out), "\n")[0])
	pid, _ := strconv.Atoi(line)
	return pid
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
			if p, _ := strconv.Atoi(val); p >= 1024 && p <= 65535 {
				a.port = p
			}
		case "autoStart":
			a.autoStart = val == "true"
		case "openOnStart":
			a.openOnStart = val == "true"
		case "mysqlPort":
			if p, _ := strconv.Atoi(val); p >= 1024 && p <= 65535 {
				a.mysqlPort = p
			}
		case "pgPort":
			if p, _ := strconv.Atoi(val); p >= 1024 && p <= 65535 {
				a.pgPort = p
			}
		case "mongoPort":
			if p, _ := strconv.Atoi(val); p >= 1024 && p <= 65535 {
				a.mongoPort = p
			}
		}
	}
}

func (a *App) saveConfig() {
	content := fmt.Sprintf(
		"port=%d\nautoStart=%t\nopenOnStart=%t\nmysqlPort=%d\npgPort=%d\nmongoPort=%d\n",
		a.port, a.autoStart, a.openOnStart, a.mysqlPort, a.pgPort, a.mongoPort,
	)
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
