package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
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
	_, err := exec.LookPath("brew")
	return err == nil
}

func installServiceOS(a *App, name string) error {
	if _, err := exec.LookPath("brew"); err != nil {
		return fmt.Errorf("Homebrew is not installed. Visit https://brew.sh")
	}

	var formula string
	switch name {
	case "MySQL":
		formula = "mysql"
	case "PostgreSQL":
		formula = "postgresql@17"
	case "MongoDB":
		exec.Command("brew", "tap", "mongodb/brew").CombinedOutput()
		formula = "mongodb-community"
	default:
		return fmt.Errorf("unknown service: %s", name)
	}

	a.emitEvent("install:progress", fmt.Sprintf("Installing %s...", name))
	out, err := exec.Command("brew", "install", formula).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s", string(out))
	}
	return nil
}

func uninstallServiceOS(a *App, name string) error {
	if _, err := exec.LookPath("brew"); err != nil {
		return fmt.Errorf("Homebrew is not installed")
	}

	var formula string
	switch name {
	case "MySQL":
		formula = "mysql"
	case "PostgreSQL":
		formula = "postgresql@17"
		for _, f := range []string{"postgresql@17", "postgresql@16", "postgresql@15", "postgresql@14", "postgresql"} {
			out, _ := exec.Command("brew", "list", f).CombinedOutput()
			if !strings.Contains(string(out), "Error") {
				formula = f
				break
			}
		}
	case "MongoDB":
		formula = "mongodb-community"
	default:
		return fmt.Errorf("unknown service: %s", name)
	}

	a.emitEvent("uninstall:progress", fmt.Sprintf("Uninstalling %s...", name))
	out, err := exec.Command("brew", "uninstall", "--force", formula).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s", string(out))
	}
	return nil
}

// ─── Brew helper ─────────────────────────────────────────────────

func brewServiceAction(action, formula string) bool {
	if _, err := exec.LookPath("brew"); err != nil {
		return false
	}
	out, err := exec.Command("brew", "services", action, formula).CombinedOutput()
	if err != nil {
		return false
	}
	return strings.Contains(string(out), "Successfully")
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
	if brewServiceAction("start", "mysql") {
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
	if brewServiceAction("stop", "mysql") {
		return nil
	}
	if path := findBin("mysqladmin"); path != "" {
		exec.Command(path, "-u", "root", "-proot", fmt.Sprintf("--port=%d", a.mysqlPort), "shutdown").CombinedOutput()
		return nil
	}
	if path := findBin("mysql.server"); path != "" {
		exec.Command(path, "stop").CombinedOutput()
		return nil
	}
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
	for _, formula := range []string{"postgresql@17", "postgresql@16", "postgresql@15", "postgresql@14", "postgresql"} {
		if brewServiceAction("start", formula) {
			return nil
		}
	}
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
	for _, formula := range []string{"postgresql@17", "postgresql@16", "postgresql@15", "postgresql@14", "postgresql"} {
		if brewServiceAction("stop", formula) {
			return nil
		}
	}
	if path := findBin("pg_ctl"); path != "" {
		dataDir := a.findPgDataDirDarwin()
		if dataDir != "" {
			out, err := exec.Command(path, "stop", "-D", dataDir).CombinedOutput()
			if err != nil {
				return fmt.Errorf("pg_ctl failed: %s", string(out))
			}
			return nil
		}
	}
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
	for _, formula := range []string{"mongodb-community", "mongodb/brew/mongodb-community"} {
		if brewServiceAction("start", formula) {
			return nil
		}
	}
	if path := findBin("mongod"); path != "" {
		dbPath := filepath.Join(a.configDir, "mongo-data")
		os.MkdirAll(dbPath, 0755)
		logPath := filepath.Join(a.configDir, "mongod.log")
		out, err := exec.Command(path, "--port", fmt.Sprintf("%d", a.mongoPort), "--dbpath", dbPath, "--logpath", logPath, "--fork").CombinedOutput()
		if err != nil {
			return fmt.Errorf("mongod failed: %s", string(out))
		}
		return nil
	}
	return fmt.Errorf("MongoDB not found")
}

func (a *App) stopMongoDarwin() error {
	for _, formula := range []string{"mongodb-community", "mongodb/brew/mongodb-community"} {
		if brewServiceAction("stop", formula) {
			return nil
		}
	}
	if path := findBin("mongod"); path != "" {
		dbPath := filepath.Join(a.configDir, "mongo-data")
		exec.Command(path, "--shutdown", "--dbpath", dbPath).CombinedOutput()
		return nil
	}
	if path := findBin("mongosh"); path != "" {
		exec.Command(path, "--eval", "db.adminCommand({shutdown: 1})", "--quiet").CombinedOutput()
		return nil
	}
	return fmt.Errorf("could not stop MongoDB")
}
