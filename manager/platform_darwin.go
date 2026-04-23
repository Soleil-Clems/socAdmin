package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var extraSearchPaths = []string{
	// MAMP MySQL
	"/Applications/MAMP/Library/bin/mysql80/bin",
	"/Applications/MAMP/Library/bin/mysql57/bin",
	"/Applications/MAMP/Library/bin",
	// Homebrew (arm64)
	"/opt/homebrew/bin",
	"/opt/homebrew/opt/mysql/bin",
	"/opt/homebrew/opt/postgresql@17/bin",
	"/opt/homebrew/opt/postgresql@16/bin",
	"/opt/homebrew/opt/postgresql@15/bin",
	"/opt/homebrew/opt/postgresql/bin",
	"/opt/homebrew/opt/mongodb-community/bin",
	// Homebrew (Intel)
	"/usr/local/bin",
	"/usr/local/opt/mysql/bin",
	"/usr/local/opt/postgresql/bin",
	"/usr/local/opt/mongodb-community/bin",
}

func binaryName() string { return "socadmin" }

// findBrew returns the absolute path to brew, or "" if not found.
func findBrew() string {
	for _, p := range []string{
		"/opt/homebrew/bin/brew",
		"/usr/local/bin/brew",
	} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	if p, err := exec.LookPath("brew"); err == nil {
		return p
	}
	return ""
}

func findPIDOnPortOS(port int) int {
	out, err := exec.Command("lsof", "-ti", fmt.Sprintf(":%d", port)).CombinedOutput()
	if err != nil {
		return 0
	}
	line := strings.TrimSpace(strings.Split(string(out), "\n")[0])
	pid, _ := strconv.Atoi(line)
	return pid
}

func detectSourceOS(binPath string) string {
	if strings.Contains(binPath, "/MAMP/") {
		return "mamp"
	}
	if strings.Contains(binPath, "/homebrew/") || strings.Contains(binPath, "/Cellar/") || strings.Contains(binPath, "/usr/local/opt/") {
		return "homebrew"
	}
	if real, err := filepath.EvalSymlinks(binPath); err == nil {
		if strings.Contains(real, "/homebrew/") || strings.Contains(real, "/Cellar/") {
			return "homebrew"
		}
	}
	return "system"
}

func canInstallServicesOS() bool {
	return findBrew() != ""
}

func installServiceOS(a *App, name string) error {
	brew := findBrew()
	if brew == "" {
		return fmt.Errorf("Homebrew is not installed. Visit https://brew.sh")
	}

	a.emitEvent("install:progress", fmt.Sprintf("Installing %s...", name))

	switch name {
	case "MySQL":
		out, err := exec.Command(brew, "install", "mysql").CombinedOutput()
		if err != nil {
			return fmt.Errorf("%s", string(out))
		}
	case "PostgreSQL":
		out, err := exec.Command(brew, "install", "postgresql@17").CombinedOutput()
		if err != nil {
			return fmt.Errorf("%s", string(out))
		}
	case "MongoDB":
		exec.Command(brew, "tap", "mongodb/brew").CombinedOutput()
		out, err := exec.Command(brew, "install", "mongodb/brew/mongodb-community").CombinedOutput()
		if err != nil {
			return fmt.Errorf("%s", string(out))
		}
	default:
		return fmt.Errorf("unknown service: %s", name)
	}
	return nil
}

func uninstallServiceOS(a *App, name string) error {
	brew := findBrew()
	if brew == "" {
		return fmt.Errorf("Homebrew is not installed")
	}

	// Stop the service first
	stopServiceOS(a, name)

	a.emitEvent("uninstall:progress", fmt.Sprintf("Uninstalling %s...", name))

	switch name {
	case "MySQL":
		exec.Command(brew, "services", "stop", "mysql").CombinedOutput()
		out, err := exec.Command(brew, "uninstall", "--force", "mysql").CombinedOutput()
		if err != nil {
			return fmt.Errorf("%s", string(out))
		}
	case "PostgreSQL":
		for _, f := range []string{"postgresql@17", "postgresql@16", "postgresql@15", "postgresql@14", "postgresql"} {
			exec.Command(brew, "services", "stop", f).CombinedOutput()
			exec.Command(brew, "uninstall", "--force", f).CombinedOutput()
		}
	case "MongoDB":
		exec.Command(brew, "services", "stop", "mongodb-community").CombinedOutput()
		// Uninstall server + deps (mongosh, database-tools)
		exec.Command(brew, "uninstall", "--force", "mongodb-community").CombinedOutput()
		exec.Command(brew, "uninstall", "--force", "mongosh").CombinedOutput()
		exec.Command(brew, "uninstall", "--force", "mongodb-database-tools").CombinedOutput()
	default:
		return fmt.Errorf("unknown service: %s", name)
	}
	return nil
}

// ─── Brew helper ─────────────────────────────────────────────────

func brewRun(args ...string) (string, error) {
	brew := findBrew()
	if brew == "" {
		return "", fmt.Errorf("brew not found")
	}
	out, err := exec.Command(brew, args...).CombinedOutput()
	return string(out), err
}

func brewServiceStart(formula string) bool {
	out, err := brewRun("services", "start", formula)
	if err != nil {
		log.Printf("[brew] services start %s failed: %s", formula, out)
		return false
	}
	s := strings.ToLower(out)
	if strings.Contains(s, "error") {
		log.Printf("[brew] services start %s error: %s", formula, out)
		return false
	}
	return true
}

func brewServiceStop(formula string) bool {
	out, err := brewRun("services", "stop", formula)
	if err != nil {
		log.Printf("[brew] services stop %s failed: %s", formula, out)
		return false
	}
	return true
}

func brewServiceIsRunning(formula string) bool {
	out, err := brewRun("services", "info", formula, "--json")
	if err != nil {
		return false
	}
	return strings.Contains(out, `"running":true`)
}

// waitPortClosed waits for a port to close.
func waitPortClosed(port int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !isPortOpen(port) {
			return true
		}
		time.Sleep(200 * time.Millisecond)
	}
	return !isPortOpen(port)
}

// waitPortOpen waits for a port to open.
func waitPortOpen(port int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if isPortOpen(port) {
			return true
		}
		time.Sleep(200 * time.Millisecond)
	}
	return isPortOpen(port)
}

// ─── Launchd helpers ─────────────────────────────────────────────

// unloadLaunchdService removes a brew-managed plist from launchd so KeepAlive
// doesn't respawn the process after we kill it.
func (a *App) unloadLaunchdService(namePrefix string) {
	home, _ := os.UserHomeDir()
	plistDir := filepath.Join(home, "Library", "LaunchAgents")
	entries, err := os.ReadDir(plistDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if strings.Contains(e.Name(), namePrefix) && strings.HasSuffix(e.Name(), ".plist") {
			plist := filepath.Join(plistDir, e.Name())
			log.Printf("[launchd] unloading %s", plist)
			exec.Command("launchctl", "unload", "-w", plist).CombinedOutput()
		}
	}
}

// loadLaunchdService re-enables a brew-managed plist in launchd.
func (a *App) loadLaunchdService(namePrefix string) {
	home, _ := os.UserHomeDir()
	plistDir := filepath.Join(home, "Library", "LaunchAgents")
	entries, err := os.ReadDir(plistDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if strings.Contains(e.Name(), namePrefix) && strings.HasSuffix(e.Name(), ".plist") {
			plist := filepath.Join(plistDir, e.Name())
			log.Printf("[launchd] loading %s", plist)
			exec.Command("launchctl", "load", "-w", plist).CombinedOutput()
		}
	}
}

// ─── Start / Stop ────────────────────────────────────────────────

func startServiceOS(a *App, name string) error {
	switch name {
	case "MySQL":
		return a.startMySQLDarwin()
	case "PostgreSQL":
		return a.startPostgresDarwin()
	case "MongoDB":
		return a.startMongoDarwin()
	}
	return fmt.Errorf("unknown service: %s", name)
}

func stopServiceOS(a *App, name string) error {
	switch name {
	case "MySQL":
		return a.stopMySQLDarwin()
	case "PostgreSQL":
		return a.stopPostgresDarwin()
	case "MongoDB":
		return a.stopMongoDarwin()
	}
	return fmt.Errorf("unknown service: %s", name)
}

// ─── MySQL ───────────────────────────────────────────────────────

func (a *App) startMySQLDarwin() error {
	if brewServiceStart("mysql") {
		return nil
	}
	if path := findBin("mysqld_safe"); path != "" {
		cmd := exec.Command(path,
			fmt.Sprintf("--port=%d", a.mysqlPort),
			"--log-error="+filepath.Join(a.configDir, "mysql_error.log"),
		)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("mysqld_safe failed: %v", err)
		}
		go cmd.Wait()
		return nil
	}
	if path := findBin("mysql.server"); path != "" {
		if out, err := exec.Command(path, "start").CombinedOutput(); err != nil {
			return fmt.Errorf("mysql.server failed: %s", string(out))
		}
		return nil
	}
	if path := findBin("mysqld"); path != "" {
		cmd := exec.Command(path, fmt.Sprintf("--port=%d", a.mysqlPort))
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("mysqld failed: %v", err)
		}
		go cmd.Wait()
		return nil
	}
	return fmt.Errorf("MySQL not found")
}

func (a *App) stopMySQLDarwin() error {
	a.unloadLaunchdService("mysql")
	// Try brew services stop
	if brewServiceIsRunning("mysql") {
		brewServiceStop("mysql")
		if waitPortClosed(a.mysqlPort, 3*time.Second) {
			return nil
		}
	}
	// Try mysqladmin shutdown
	if path := findBin("mysqladmin"); path != "" {
		exec.Command(path, "-u", "root", "-proot", fmt.Sprintf("--port=%d", a.mysqlPort), "shutdown").CombinedOutput()
		if waitPortClosed(a.mysqlPort, 3*time.Second) {
			return nil
		}
	}
	// Try mysql.server stop
	if path := findBin("mysql.server"); path != "" {
		exec.Command(path, "stop").CombinedOutput()
		if waitPortClosed(a.mysqlPort, 3*time.Second) {
			return nil
		}
	}
	// Kill by PID
	if pid := findPIDOnPort(a.mysqlPort); pid > 0 {
		if proc, err := os.FindProcess(pid); err == nil {
			proc.Kill()
		}
		return nil
	}
	return fmt.Errorf("could not stop MySQL")
}

// ─── PostgreSQL ──────────────────────────────────────────────────

func (a *App) startPostgresDarwin() error {
	// If already running, nothing to do
	if isPortOpen(a.pgPort) {
		return nil
	}

	// Try re-loading the launchd plist (if it was previously unloaded by stop)
	a.loadLaunchdService("postgresql")
	if waitPortOpen(a.pgPort, 3*time.Second) {
		return nil
	}

	// Try brew services start
	brew := findBrew()
	if brew != "" {
		for _, formula := range []string{"postgresql@17", "postgresql@16", "postgresql@15", "postgresql@14", "postgresql"} {
			out, _ := exec.Command(brew, "list", formula).CombinedOutput()
			if !strings.Contains(string(out), "Error") {
				if brewServiceStart(formula) {
					return nil
				}
				break
			}
		}
	}
	// Try pg_ctl directly
	if path := findBin("pg_ctl"); path != "" {
		dataDir := a.findPgDataDirDarwin()
		if dataDir == "" {
			return fmt.Errorf("PostgreSQL data directory not found")
		}
		out, err := exec.Command(path, "start", "-D", dataDir, "-o", fmt.Sprintf("-p %d", a.pgPort), "-l", filepath.Join(a.configDir, "pg.log")).CombinedOutput()
		if err != nil {
			return fmt.Errorf("pg_ctl failed: %s", string(out))
		}
		return nil
	}
	return fmt.Errorf("PostgreSQL not found")
}

func (a *App) stopPostgresDarwin() error {
	log.Printf("[pg stop] port %d, isOpen=%v", a.pgPort, isPortOpen(a.pgPort))

	// Must unload from launchctl first — KeepAlive will restart the process otherwise
	a.unloadLaunchdService("postgresql")

	// Try brew services stop
	for _, formula := range []string{"postgresql@17", "postgresql@16", "postgresql@15", "postgresql@14", "postgresql"} {
		if brewServiceIsRunning(formula) {
			log.Printf("[pg stop] brew services stop %s", formula)
			brewServiceStop(formula)
			if waitPortClosed(a.pgPort, 3*time.Second) {
				log.Printf("[pg stop] stopped via brew services")
				return nil
			}
		}
	}
	// Try pg_ctl stop
	if path := findBin("pg_ctl"); path != "" {
		dataDir := a.findPgDataDirDarwin()
		log.Printf("[pg stop] pg_ctl=%s dataDir=%s", path, dataDir)
		if dataDir != "" {
			out, err := exec.Command(path, "stop", "-D", dataDir, "-m", "fast").CombinedOutput()
			log.Printf("[pg stop] pg_ctl stop result: err=%v out=%s", err, string(out))
			if waitPortClosed(a.pgPort, 5*time.Second) {
				log.Printf("[pg stop] stopped via pg_ctl")
				return nil
			}
		}
	}
	// Kill by PID
	if pid := findPIDOnPort(a.pgPort); pid > 0 {
		log.Printf("[pg stop] killing PID %d", pid)
		if proc, err := os.FindProcess(pid); err == nil {
			proc.Kill()
		}
		return nil
	}
	log.Printf("[pg stop] FAILED — no method worked")
	return fmt.Errorf("could not stop PostgreSQL")
}

func (a *App) findPgDataDirDarwin() string {
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

func (a *App) startMongoDarwin() error {
	// Try brew services start
	for _, formula := range []string{"mongodb-community", "mongodb/brew/mongodb-community"} {
		if brewServiceStart(formula) {
			return nil
		}
	}
	// Try mongod directly (--fork is not supported on macOS, run in background)
	if path := findBin("mongod"); path != "" {
		var cmd *exec.Cmd
		// Use Homebrew config if available
		for _, brewConf := range []string{
			"/opt/homebrew/etc/mongod.conf",
			"/usr/local/etc/mongod.conf",
		} {
			if _, err := os.Stat(brewConf); err == nil {
				cmd = exec.Command(path, "--config", brewConf, "--port", fmt.Sprintf("%d", a.mongoPort))
				break
			}
		}
		if cmd == nil {
			dbPath := filepath.Join(a.configDir, "mongo-data")
			os.MkdirAll(dbPath, 0755)
			logPath := filepath.Join(a.configDir, "mongod.log")
			cmd = exec.Command(path, "--port", fmt.Sprintf("%d", a.mongoPort), "--dbpath", dbPath, "--logpath", logPath)
		}
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("mongod failed: %v", err)
		}
		go cmd.Wait()
		return nil
	}
	return fmt.Errorf("MongoDB not found")
}

func (a *App) stopMongoDarwin() error {
	a.unloadLaunchdService("mongodb")
	// Try brew services stop
	for _, formula := range []string{"mongodb-community", "mongodb/brew/mongodb-community"} {
		if brewServiceIsRunning(formula) {
			brewServiceStop(formula)
			if waitPortClosed(a.mongoPort, 3*time.Second) {
				return nil
			}
		}
	}
	// Try mongod --shutdown with known dbPaths
	if path := findBin("mongod"); path != "" {
		for _, dbPath := range []string{
			"/opt/homebrew/var/mongodb",
			"/usr/local/var/mongodb",
			filepath.Join(a.configDir, "mongo-data"),
		} {
			if _, err := os.Stat(dbPath); err == nil {
				exec.Command(path, "--shutdown", "--dbpath", dbPath).CombinedOutput()
				if waitPortClosed(a.mongoPort, 3*time.Second) {
					return nil
				}
			}
		}
	}
	// Try mongosh shutdown command
	if path := findBin("mongosh"); path != "" {
		exec.Command(path, "--port", fmt.Sprintf("%d", a.mongoPort), "--eval", "db.adminCommand({shutdown: 1})", "--quiet").CombinedOutput()
		if waitPortClosed(a.mongoPort, 3*time.Second) {
			return nil
		}
	}
	// Kill by PID
	if pid := findPIDOnPort(a.mongoPort); pid > 0 {
		if proc, err := os.FindProcess(pid); err == nil {
			proc.Kill()
		}
		return nil
	}
	return fmt.Errorf("could not stop MongoDB")
}
