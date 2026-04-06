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
	Port        int    `json:"port"`
	AutoStart   bool   `json:"autoStart"`
	OpenOnStart bool   `json:"openOnStart"`
	MysqlPort   int    `json:"mysqlPort"`
	PgPort      int    `json:"pgPort"`
	MongoPort   int    `json:"mongoPort"`
	ProjectDir  string `json:"projectDir"`
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
	projectDir  string

	mysqlPort int
	pgPort    int
	mongoPort int
}

// Extra paths where SGBD binaries live (MAMP, Homebrew, etc.)
var extraSearchPaths = []string{
	"/Applications/MAMP/Library/bin/mysql80/bin",
	"/Applications/MAMP/Library/bin/mysql57/bin",
	"/Applications/MAMP/Library/bin",
	"/opt/homebrew/bin",
	"/opt/homebrew/opt/mysql/bin",
	"/opt/homebrew/opt/postgresql@17/bin",
	"/opt/homebrew/opt/postgresql@16/bin",
	"/opt/homebrew/opt/postgresql@15/bin",
	"/opt/homebrew/opt/postgresql/bin",
	"/opt/homebrew/opt/mongodb-community/bin",
	"/usr/local/bin",
	"/usr/local/opt/mysql/bin",
	"/usr/local/opt/postgresql/bin",
	"/usr/local/opt/mongodb-community/bin",
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
		mysqlPort:   8889,
		pgPort:      5432,
		mongoPort:   27017,
	}
	a.loadConfig()

	// Auto-detect project dir if not saved
	if a.projectDir == "" {
		a.projectDir = detectProjectDir()
		if a.projectDir != "" {
			a.saveConfig()
		}
	}

	return a
}

func detectProjectDir() string {
	execPath, _ := os.Executable()
	execDir := filepath.Dir(execPath)
	cwd, _ := os.Getwd()

	candidates := []string{
		filepath.Join(execDir, "..", "..", "..", "..", ".."), // .app bundle
		filepath.Join(execDir, ".."),                         // manager/ dir
		cwd,
		filepath.Join(cwd, ".."),
	}

	for _, c := range candidates {
		abs, _ := filepath.Abs(c)
		// Project root has main.go + core/ directory
		if _, err := os.Stat(filepath.Join(abs, "main.go")); err == nil {
			if _, err := os.Stat(filepath.Join(abs, "core")); err == nil {
				return abs
			}
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

	// Already managed by us
	if a.serverProc != nil {
		return a.serverStatusLocked()
	}

	// Already running externally (e.g. make start)
	if isPortOpen(a.port) {
		pid := findPIDOnPort(a.port)
		return ServerStatus{Running: true, Port: a.port, PID: pid, URL: fmt.Sprintf("http://localhost:%d", a.port)}
	}

	binPath := a.findBinary()
	if binPath == "" {
		a.emitError(fmt.Sprintf("socAdmin binary not found. Run 'make build' in the project root.\nSearched projectDir: %s", a.projectDir))
		return ServerStatus{Running: false, Port: a.port}
	}

	cmd := exec.Command(binPath)
	// Run from the project root so socadmin.db is found/created in the right place
	cmd.Dir = a.projectDir
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

	stopped := false

	// If we own the process, kill it
	if a.serverProc != nil {
		a.serverProc.Signal(os.Interrupt)
		// Give it a moment to shut down gracefully, then force kill
		done := make(chan struct{})
		go func() {
			a.serverProc.Wait()
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			a.serverProc.Kill()
			a.serverProc.Wait()
		}
		a.serverProc = nil
		a.startedAt = time.Time{}
		stopped = true
	}

	// Also kill anything still holding the port (externally started, or zombie)
	if isPortOpen(a.port) {
		pid := findPIDOnPort(a.port)
		if pid > 0 {
			if proc, err := os.FindProcess(pid); err == nil {
				proc.Signal(os.Interrupt)
				time.Sleep(500 * time.Millisecond)
				if isPortOpen(a.port) {
					proc.Kill()
				}
			}
		}
		stopped = true
	}

	// Wait for the port to actually free up
	if stopped {
		for i := 0; i < 10; i++ {
			if !isPortOpen(a.port) {
				break
			}
			time.Sleep(200 * time.Millisecond)
		}
	}

	wailsRuntime.EventsEmit(a.ctx, "server:stopped", nil)
	return ServerStatus{Running: false, Port: a.port}
}

func (a *App) GetServerStatus() ServerStatus {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.serverStatusLocked()
}

// serverStatusLocked returns status without acquiring the mutex (caller must hold it).
func (a *App) serverStatusLocked() ServerStatus {
	running := isPortOpen(a.port)
	s := ServerStatus{
		Running: running,
		Port:    a.port,
		URL:     fmt.Sprintf("http://localhost:%d", a.port),
	}
	if running {
		s.PID = findPIDOnPort(a.port)
		if a.serverProc != nil && !a.startedAt.IsZero() {
			s.Uptime = formatDuration(time.Since(a.startedAt))
		}
	} else {
		if a.serverProc != nil {
			a.serverProc = nil
			a.startedAt = time.Time{}
		}
	}
	return s
}

// ─── SGBD Service control ────────────────────────────────────────

func (a *App) GetAllServices() []ServiceStatus {
	return []ServiceStatus{
		a.detectService("MySQL", a.mysqlPort, []string{"mysqld", "mysql.server", "mysql"}, []string{"--version"}),
		a.detectService("PostgreSQL", a.pgPort, []string{"postgres", "pg_isready", "psql"}, []string{"--version"}),
		a.detectService("MongoDB", a.mongoPort, []string{"mongod", "mongosh"}, []string{"--version"}),
	}
}

func (a *App) detectService(name string, port int, binaries []string, versionArgs []string) ServiceStatus {
	s := ServiceStatus{Name: name, Port: port}

	for _, bin := range binaries {
		if path := findBin(bin); path != "" {
			s.Installed = true
			s.Path = path
			s.Version = getVersion(path, versionArgs)
			break
		}
	}

	s.Running = isPortOpen(port)
	if s.Running {
		s.PID = findPIDOnPort(port)
	}

	return s
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

// ─── MySQL ───────────────────────────────────────────────────────

func (a *App) startMySQL() error {
	if ok := brewServiceAction("start", "mysql"); ok {
		a.emitEvent("service:started", "MySQL")
		return nil
	}

	// MAMP
	if _, err := os.Stat("/Applications/MAMP/bin/start.sh"); err == nil {
		exec.Command("/Applications/MAMP/bin/start.sh").CombinedOutput()
		a.emitEvent("service:started", "MySQL")
		return nil
	}

	if path := findBin("mysql.server"); path != "" {
		if out, err := exec.Command(path, "start").CombinedOutput(); err != nil {
			return fmt.Errorf("mysql.server start failed: %s", string(out))
		}
		a.emitEvent("service:started", "MySQL")
		return nil
	}

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

	return fmt.Errorf("MySQL not found. Install via Homebrew or MAMP")
}

func (a *App) stopMySQL() error {
	if ok := brewServiceAction("stop", "mysql"); ok {
		a.emitEvent("service:stopped", "MySQL")
		return nil
	}

	if _, err := os.Stat("/Applications/MAMP/bin/stop.sh"); err == nil {
		exec.Command("/Applications/MAMP/bin/stop.sh").CombinedOutput()
		a.emitEvent("service:stopped", "MySQL")
		return nil
	}

	if path := findBin("mysql.server"); path != "" {
		if out, err := exec.Command(path, "stop").CombinedOutput(); err != nil {
			return fmt.Errorf("mysql.server stop failed: %s", string(out))
		}
		a.emitEvent("service:stopped", "MySQL")
		return nil
	}

	if path := findBin("mysqladmin"); path != "" {
		exec.Command(path, "-u", "root", "shutdown").CombinedOutput()
		a.emitEvent("service:stopped", "MySQL")
		return nil
	}

	return fmt.Errorf("could not stop MySQL")
}

// ─── PostgreSQL ──────────────────────────────────────────────────

func (a *App) startPostgreSQL() error {
	for _, formula := range []string{"postgresql@17", "postgresql@16", "postgresql@15", "postgresql@14", "postgresql"} {
		if brewServiceAction("start", formula) {
			a.emitEvent("service:started", "PostgreSQL")
			return nil
		}
	}

	if path := findBin("pg_ctl"); path != "" {
		dataDir := a.findPgDataDir()
		if dataDir == "" {
			return fmt.Errorf("PostgreSQL data directory not found")
		}
		out, err := exec.Command(path, "start", "-D", dataDir, "-o", fmt.Sprintf("-p %d", a.pgPort), "-l", filepath.Join(a.configDir, "pg.log")).CombinedOutput()
		if err != nil {
			return fmt.Errorf("pg_ctl start failed: %s", string(out))
		}
		a.emitEvent("service:started", "PostgreSQL")
		return nil
	}

	return fmt.Errorf("PostgreSQL not found. Install it first")
}

func (a *App) stopPostgreSQL() error {
	for _, formula := range []string{"postgresql@17", "postgresql@16", "postgresql@15", "postgresql@14", "postgresql"} {
		if brewServiceAction("stop", formula) {
			a.emitEvent("service:stopped", "PostgreSQL")
			return nil
		}
	}

	if path := findBin("pg_ctl"); path != "" {
		dataDir := a.findPgDataDir()
		if dataDir != "" {
			out, err := exec.Command(path, "stop", "-D", dataDir).CombinedOutput()
			if err != nil {
				return fmt.Errorf("pg_ctl stop failed: %s", string(out))
			}
			a.emitEvent("service:stopped", "PostgreSQL")
			return nil
		}
	}

	return fmt.Errorf("could not stop PostgreSQL")
}

func (a *App) findPgDataDir() string {
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
	for _, formula := range []string{"mongodb-community", "mongodb/brew/mongodb-community"} {
		if brewServiceAction("start", formula) {
			a.emitEvent("service:started", "MongoDB")
			return nil
		}
	}

	if path := findBin("mongod"); path != "" {
		dbPath := filepath.Join(a.configDir, "mongo-data")
		os.MkdirAll(dbPath, 0755)
		logPath := filepath.Join(a.configDir, "mongod.log")
		out, err := exec.Command(path, "--port", strconv.Itoa(a.mongoPort), "--dbpath", dbPath, "--logpath", logPath, "--fork").CombinedOutput()
		if err != nil {
			return fmt.Errorf("mongod start failed: %s", string(out))
		}
		a.emitEvent("service:started", "MongoDB")
		return nil
	}

	return fmt.Errorf("MongoDB not found. Install it first")
}

func (a *App) stopMongoDB() error {
	for _, formula := range []string{"mongodb-community", "mongodb/brew/mongodb-community"} {
		if brewServiceAction("stop", formula) {
			a.emitEvent("service:stopped", "MongoDB")
			return nil
		}
	}

	if path := findBin("mongod"); path != "" {
		dbPath := filepath.Join(a.configDir, "mongo-data")
		exec.Command(path, "--shutdown", "--dbpath", dbPath).CombinedOutput()
		a.emitEvent("service:stopped", "MongoDB")
		return nil
	}

	if path := findBin("mongosh"); path != "" {
		exec.Command(path, "--eval", "db.adminCommand({shutdown: 1})", "--quiet").CombinedOutput()
		a.emitEvent("service:stopped", "MongoDB")
		return nil
	}

	return fmt.Errorf("could not stop MongoDB")
}

// ─── Brew helper ─────────────────────────────────────────────────

// brewServiceAction runs `brew services start/stop <formula>` and returns true
// only if it actually succeeded (checks output for "Successfully").
func brewServiceAction(action, formula string) bool {
	if runtime.GOOS != "darwin" {
		return false
	}
	if _, err := exec.LookPath("brew"); err != nil {
		return false
	}
	out, err := exec.Command("brew", "services", action, formula).CombinedOutput()
	if err != nil {
		return false
	}
	output := string(out)
	return strings.Contains(output, "Successfully")
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
		ProjectDir:  a.projectDir,
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

// SetProjectDir allows the user to manually set the project path from the UI.
func (a *App) SetProjectDir(dir string) error {
	if _, err := os.Stat(filepath.Join(dir, "main.go")); err != nil {
		return fmt.Errorf("not a valid socAdmin project directory (main.go not found)")
	}
	a.projectDir = dir
	a.saveConfig()
	return nil
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
		"os":         runtime.GOOS,
		"arch":       runtime.GOARCH,
		"goVer":      runtime.Version(),
		"configDir":  a.configDir,
		"projectDir": a.projectDir,
	}
}

// ─── Helpers ─────────────────────────────────────────────────────

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

func (a *App) findBinary() string {
	var candidates []string

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

func findPIDOnPort(port int) int {
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
		case "projectDir":
			if val != "" {
				a.projectDir = val
			}
		}
	}
}

func (a *App) saveConfig() {
	content := fmt.Sprintf(
		"port=%d\nautoStart=%t\nopenOnStart=%t\nmysqlPort=%d\npgPort=%d\nmongoPort=%d\nprojectDir=%s\n",
		a.port, a.autoStart, a.openOnStart, a.mysqlPort, a.pgPort, a.mongoPort, a.projectDir,
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
