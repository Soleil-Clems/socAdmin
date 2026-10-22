// @soleil-clems: Manager - macOS platform (Homebrew, launchctl)
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

func configureCmdOS(_ *exec.Cmd) {}

func postInstallOS(_ *App, _ string) string { return "" }

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

func findPackageManager() string { return findBrew() }

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

func brewInstallCmd(brew string, args ...string) *exec.Cmd {
	cmd := exec.Command(brew, args...)
	cmd.Env = append(os.Environ(), "HOMEBREW_NO_AUTO_UPDATE=1", "HOMEBREW_NO_ENV_HINTS=1")
	return cmd
}

func installServiceOS(a *App, name string) error {
	brew := findBrew()
	if brew == "" {
		return fmt.Errorf("Homebrew is not installed. Visit https://brew.sh")
	}

	// Update Homebrew once before installing (faster than per-formula auto-update)
	a.emitEvent("install:progress", "Updating Homebrew...")
	exec.Command(brew, "update", "--quiet").CombinedOutput()

	a.emitEvent("install:progress", fmt.Sprintf("Installing %s...", name))

	switch name {
	case "MySQL":
		out, err := brewInstallCmd(brew, "install", "mysql").CombinedOutput()
		if err != nil {
			return fmt.Errorf("%s", string(out))
		}
	case "PostgreSQL":
		out, err := brewInstallCmd(brew, "install", "postgresql@17").CombinedOutput()
		if err != nil {
			return fmt.Errorf("%s", string(out))
		}
	case "MongoDB":
		brewInstallCmd(brew, "tap", "mongodb/brew").CombinedOutput()
		brewInstallCmd(brew, "trust", "mongodb/brew").CombinedOutput()
		out, err := brewInstallCmd(brew, "install", "mongodb/brew/mongodb-community").CombinedOutput()
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
		// Wait briefly to detect immediate crash
		done := make(chan error, 1)
		go func() { done <- cmd.Wait() }()
		select {
		case err := <-done:
			if err != nil {
				return fmt.Errorf("mongod crashed on startup: %v", err)
			}
			return fmt.Errorf("mongod exited immediately")
		case <-time.After(2 * time.Second):
			return nil
		}
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

// repairMongoFCV fixes a featureCompatibilityVersion mismatch by temporarily
// installing the old MongoDB version, downgrading FCV to 8.0, then removing it.
func repairMongoFCV(a *App) error {
	brew := findBrew()
	if brew == "" {
		return fmt.Errorf("Homebrew is required for this repair")
	}

	oldVersion := detectOldMongoFCV()
	if oldVersion == "" {
		return fmt.Errorf("could not detect the incompatible MongoDB version from logs")
	}
	formula := "mongodb/brew/mongodb-community@" + oldVersion

	// Use the versioned opt path for the old mongod binary — this path
	// survives even when brew install overwrites the main symlinks.
	mongodOld := fmt.Sprintf("/opt/homebrew/opt/mongodb-community@%s/bin/mongod", oldVersion)
	mongoshOld := fmt.Sprintf("/opt/homebrew/opt/mongodb-community@%s/bin/mongosh", oldVersion)
	prefix := "/opt/homebrew"
	if _, err := os.Stat("/opt/homebrew/bin/brew"); err != nil {
		prefix = "/usr/local"
		mongodOld = fmt.Sprintf("%s/opt/mongodb-community@%s/bin/mongod", prefix, oldVersion)
		mongoshOld = fmt.Sprintf("%s/opt/mongodb-community@%s/bin/mongosh", prefix, oldVersion)
	}

	dbPath := prefix + "/var/mongodb"

	a.emitEvent("install:progress", fmt.Sprintf("Installing MongoDB %s temporarily...", oldVersion))
	log.Printf("[repair] installing %s", formula)
	cmd := exec.Command(brew, "install", formula)
	cmd.Env = append(os.Environ(), "HOMEBREW_NO_AUTO_UPDATE=1", "HOMEBREW_NO_ENV_HINTS=1")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to install %s: %s", formula, formatInstallError(string(out)))
	}

	cleanup := func() {
		log.Printf("[repair] cleaning up %s", formula)
		exec.Command(brew, "uninstall", "--force", formula).CombinedOutput()
		// Restore main mongodb-community symlinks broken by the temp install/uninstall
		exec.Command(brew, "unlink", "mongodb-community").CombinedOutput()
		exec.Command(brew, "link", "mongodb-community").CombinedOutput()
		log.Printf("[repair] relinked mongodb-community")
	}

	if _, err := os.Stat(mongodOld); err != nil {
		cleanup()
		return fmt.Errorf("MongoDB %s binary not found at %s", oldVersion, mongodOld)
	}

	a.emitEvent("install:progress", "Starting old MongoDB version to repair data...")
	port := 37017
	log.Printf("[repair] starting mongod %s on port %d with dbpath %s", oldVersion, port, dbPath)
	mongodCmd := exec.Command(mongodOld, "--dbpath", dbPath, "--port", fmt.Sprintf("%d", port), "--logpath", "/dev/null", "--bind_ip", "127.0.0.1")
	if err := mongodCmd.Start(); err != nil {
		cleanup()
		return fmt.Errorf("failed to start MongoDB %s: %v", oldVersion, err)
	}

	if !waitPortOpen(port, 30*time.Second) {
		mongodCmd.Process.Kill()
		mongodCmd.Wait()
		cleanup()
		return fmt.Errorf("MongoDB %s did not start in time", oldVersion)
	}

	a.emitEvent("install:progress", "Upgrading compatibility version...")
	// Use the versioned mongosh to avoid symlink issues
	mongosh := mongoshOld
	if _, err := os.Stat(mongosh); err != nil {
		mongosh = findBin("mongosh")
	}
	if mongosh == "" {
		mongodCmd.Process.Kill()
		mongodCmd.Wait()
		cleanup()
		return fmt.Errorf("mongosh not found — cannot run repair command")
	}
	log.Printf("[repair] using mongosh at %s", mongosh)

	setFCV := "db.adminCommand({setFeatureCompatibilityVersion: '8.0', confirm: true})"
	out, err := exec.Command(mongosh, "--port", fmt.Sprintf("%d", port), "--eval", setFCV, "admin", "--quiet").CombinedOutput()
	log.Printf("[repair] setFCV output: %s err: %v", string(out), err)

	a.emitEvent("install:progress", "Stopping temporary MongoDB...")
	exec.Command(mongosh, "--port", fmt.Sprintf("%d", port), "--eval", "db.adminCommand({shutdown: 1})", "admin", "--quiet").CombinedOutput()
	waitPortClosed(port, 10*time.Second)
	mongodCmd.Wait()

	a.emitEvent("install:progress", "Cleaning up temporary install...")
	cleanup()

	if err != nil {
		return fmt.Errorf("failed to set FCV: %s", string(out))
	}

	a.emitEvent("install:progress", "Repair complete — you can now start MongoDB")
	a.emitEvent("install:done", "MongoDB")
	return nil
}

func detectOldMongoFCV() string {
	for _, logPath := range []string{
		"/opt/homebrew/var/log/mongodb/mongo.log",
		"/usr/local/var/log/mongodb/mongo.log",
	} {
		data, err := os.ReadFile(logPath)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for i := len(lines) - 1; i >= 0 && i >= len(lines)-500; i-- {
			line := lines[i]
			if strings.Contains(line, "featureCompatibilityVersion") && strings.Contains(line, "UPGRADE PROBLEM") {
				// MongoDB logs are JSON — the version appears as: version: \"8.2\"
				if idx := strings.Index(line, `version: \"`); idx != -1 {
					start := idx + len(`version: \"`)
					end := strings.Index(line[start:], `\"`)
					if end > 0 {
						return line[start : start+end]
					}
				}
				// Fallback for plain text logs: version: "8.2"
				if idx := strings.Index(line, "version: \""); idx != -1 {
					start := idx + len("version: \"")
					end := strings.Index(line[start:], "\"")
					if end > 0 {
						return line[start : start+end]
					}
				}
			}
		}
	}
	return ""
}
