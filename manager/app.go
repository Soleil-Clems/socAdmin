// @soleil-clems: Manager - Server control, service management, config
package main

import (
	"context"
	"fmt"
	"log"
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
	Source    string `json:"source"` // "homebrew", "mamp", "apt", "dnf", "winget", "chocolatey", "system"
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
	installMu   sync.Mutex
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

func init() {
	ensurePATH()
	initDebugLog()
}

func initDebugLog() {
	home, _ := os.UserHomeDir()
	logPath := filepath.Join(home, ".socadmin", "manager-debug.log")
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return
	}
	log.SetOutput(f)
	log.SetFlags(log.Ltime | log.Lshortfile)
	log.Printf("=== socAdmin Manager started ===")
	log.Printf("PATH = %s", os.Getenv("PATH"))
	if b := findPackageManager(); b != "" {
		log.Printf("package manager = %s", b)
	}
	log.Printf("mongod = %s", findBin("mongod"))
	log.Printf("pg_ctl = %s", findBin("pg_ctl"))
	log.Printf("mongosh = %s", findBin("mongosh"))
	log.Printf("mysqld = %s", findBin("mysqld"))
}

func ensurePATH() {
	current := os.Getenv("PATH")

	var dirs []string
	switch runtime.GOOS {
	case "darwin":
		home, _ := os.UserHomeDir()
		dirs = []string{
			"/opt/homebrew/bin",
			"/opt/homebrew/sbin",
			"/usr/local/bin",
			"/usr/local/sbin",
			filepath.Join(home, ".local/bin"),
		}
	case "linux":
		home, _ := os.UserHomeDir()
		dirs = []string{
			"/usr/local/bin",
			"/usr/local/sbin",
			"/usr/bin",
			"/usr/sbin",
			"/snap/bin",
			filepath.Join(home, ".local/bin"),
			"/home/linuxbrew/.linuxbrew/bin",
		}
	case "windows":
		dirs = []string{
			`C:\Program Files\PostgreSQL\17\bin`,
			`C:\Program Files\PostgreSQL\16\bin`,
			`C:\Program Files\MySQL\MySQL Server 8.4\bin`,
			`C:\Program Files\MySQL\MySQL Server 8.0\bin`,
			`C:\Program Files\MongoDB\Server\8.0\bin`,
			`C:\Program Files\MongoDB\Server\7.0\bin`,
			`C:\ProgramData\chocolatey\bin`,
		}
	}

	for _, d := range dirs {
		if !strings.Contains(current, d) {
			if _, err := os.Stat(d); err == nil {
				current = current + string(os.PathListSeparator) + d
			}
		}
	}
	os.Setenv("PATH", current)
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
		filepath.Join(execDir, "..", "..", "..", "..", ".."), // .app bundle (macOS)
		filepath.Join(execDir, ".."),                        // manager/ dir
		cwd,
		filepath.Join(cwd, ".."),
	}

	for _, c := range candidates {
		abs, _ := filepath.Abs(c)
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

	if a.serverProc != nil {
		return a.serverStatusLocked()
	}

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
	cmd.Dir = a.projectDir
	cmd.Env = append(os.Environ(), fmt.Sprintf("PORT=%d", a.port))
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

	proc := a.serverProc
	a.serverProc = nil
	a.startedAt = time.Time{}

	a.mu.Unlock()

	if proc != nil {
		proc.Kill()
		proc.Wait()
	}

	if pid := findPIDOnPort(a.port); pid > 0 {
		if p, err := os.FindProcess(pid); err == nil {
			p.Kill()
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

func (a *App) serverStatusLocked() ServerStatus {
	s := ServerStatus{
		Port: a.port,
		URL:  fmt.Sprintf("http://localhost:%d", a.port),
	}
	if a.serverProc != nil {
		s.Running = true
		s.PID = findPIDOnPort(a.port)
		if !a.startedAt.IsZero() {
			s.Uptime = formatDuration(time.Since(a.startedAt))
		}
	}
	return s
}

// ─── SGBD Service control (delegates to platform) ───────────────

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
			s.Source = detectSourceOS(path)
			break
		}
	}

	s.Running = isPortOpen(port)
	if s.Running {
		s.PID = findPIDOnPort(port)
	}

	return s
}

func (a *App) StartService(name string) {
	go func() {
		err := startServiceOS(a, name)
		if err != nil {
			log.Printf("[service] Failed to start %s: %v", name, err)
			a.emitEvent("service:error", fmt.Sprintf("Failed to start %s: %v", name, err))
			return
		}
		port := a.servicePort(name)
		a.waitForPort(port, "service:started", nil)
	}()
}

func (a *App) StopService(name string) {
	go func() {
		err := stopServiceOS(a, name)
		if err != nil {
			log.Printf("[service] Failed to stop %s: %v", name, err)
			a.emitEvent("service:error", fmt.Sprintf("Failed to stop %s: %v", name, err))
			return
		}
		port := a.servicePort(name)
		a.waitForPortClosed(port)
		a.emitEvent("service:stopped", name)
	}()
}

func (a *App) servicePort(name string) int {
	switch name {
	case "MySQL":
		return a.mysqlPort
	case "PostgreSQL":
		return a.pgPort
	case "MongoDB":
		return a.mongoPort
	}
	return 0
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

// ─── Install / Uninstall (delegates to platform) ────────────────

func (a *App) InstallService(name string) {
	go func() {
		a.installMu.Lock()
		defer a.installMu.Unlock()

		a.emitEvent("install:progress", fmt.Sprintf("Installing %s...", name))
		err := installServiceOS(a, name)
		if err != nil {
			a.emitError(fmt.Sprintf("Failed to install %s: %v", name, err))
			return
		}
		a.emitEvent("install:done", name)
	}()
}

func (a *App) UninstallService(name string) {
	go func() {
		a.installMu.Lock()
		defer a.installMu.Unlock()

		port := a.servicePort(name)
		if isPortOpen(port) {
			stopServiceOS(a, name)
			a.waitForPortClosed(port)
		}

		a.emitEvent("uninstall:progress", fmt.Sprintf("Uninstalling %s...", name))
		err := uninstallServiceOS(a, name)
		if err != nil {
			a.emitError(fmt.Sprintf("Failed to uninstall %s: %v", name, err))
			return
		}
		a.emitEvent("uninstall:done", name)
	}()
}

func (a *App) CanInstallServices() bool {
	return canInstallServicesOS()
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
		// Windows: also check with .exe
		if runtime.GOOS == "windows" {
			fullExe := full + ".exe"
			if _, err := os.Stat(fullExe); err == nil {
				return fullExe
			}
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
	bin := binaryName()
	var candidates []string

	if a.projectDir != "" {
		candidates = append(candidates, filepath.Join(a.projectDir, "bin", bin))
	}

	execPath, _ := os.Executable()
	execDir := filepath.Dir(execPath)
	cwd, _ := os.Getwd()

	candidates = append(candidates,
		filepath.Join(execDir, "..", "..", "..", "..", "..", "bin", bin),
		filepath.Join(execDir, "..", "bin", bin),
		filepath.Join(execDir, bin),
		filepath.Join(cwd, "bin", bin),
		filepath.Join(cwd, "..", "bin", bin),
	)

	if p, err := exec.LookPath(bin); err == nil {
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

func findPIDOnPort(port int) int {
	return findPIDOnPortOS(port)
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

func (a *App) waitForPortClosed(port int) {
	for i := 0; i < 20; i++ {
		if !isPortOpen(port) {
			return
		}
		time.Sleep(300 * time.Millisecond)
	}
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
