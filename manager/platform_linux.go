// @soleil-clems: Manager - Linux platform (apt/dnf, systemctl)
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

func configureCmdOS(_ *exec.Cmd) {}

var extraSearchPaths = []string{
	"/usr/bin",
	"/usr/sbin",
	"/usr/lib/postgresql/17/bin",
	"/usr/lib/postgresql/16/bin",
	"/usr/lib/postgresql/15/bin",
	"/usr/lib/postgresql/14/bin",
	"/usr/lib/mysql/bin",
	"/usr/local/bin",
	"/snap/bin",
}

func binaryName() string { return "socadmin" }

func findPackageManager() string { return linuxPackageManager() }

func findPIDOnPortOS(port int) int {
	// Try ss first (available on modern Linux)
	out, err := exec.Command("ss", "-tlnp", fmt.Sprintf("sport = :%d", port)).CombinedOutput()
	if err == nil {
		re := regexp.MustCompile(`pid=(\d+)`)
		if m := re.FindStringSubmatch(string(out)); len(m) > 1 {
			pid, _ := strconv.Atoi(m[1])
			return pid
		}
	}
	// Fallback to fuser
	out, err = exec.Command("fuser", fmt.Sprintf("%d/tcp", port)).CombinedOutput()
	if err == nil {
		pid, _ := strconv.Atoi(strings.TrimSpace(string(out)))
		return pid
	}
	return 0
}

func detectSourceOS(binPath string) string {
	// Check dpkg (Debian/Ubuntu)
	if _, err := exec.LookPath("dpkg"); err == nil {
		out, err := exec.Command("dpkg", "-S", binPath).CombinedOutput()
		if err == nil && !strings.Contains(string(out), "not found") {
			return "apt"
		}
	}
	// Check rpm (Fedora/RHEL)
	if _, err := exec.LookPath("rpm"); err == nil {
		out, err := exec.Command("rpm", "-qf", binPath).CombinedOutput()
		if err == nil && !strings.Contains(string(out), "not owned") {
			return "dnf"
		}
	}
	if strings.Contains(binPath, "/snap/") {
		return "snap"
	}
	return "system"
}

func canInstallServicesOS() bool {
	if _, err := exec.LookPath("apt-get"); err == nil {
		return true
	}
	if _, err := exec.LookPath("dnf"); err == nil {
		return true
	}
	return false
}

func linuxPackageManager() string {
	if _, err := exec.LookPath("apt-get"); err == nil {
		return "apt"
	}
	if _, err := exec.LookPath("dnf"); err == nil {
		return "dnf"
	}
	return ""
}

func installServiceOS(a *App, name string) error {
	pm := linuxPackageManager()
	if pm == "" {
		return fmt.Errorf("no supported package manager found (apt-get or dnf)")
	}

	a.emitEvent("install:progress", fmt.Sprintf("Installing %s...", name))

	switch name {
	case "MySQL":
		if pm == "apt" {
			return runSudo("apt-get", "install", "-y", "mysql-server")
		}
		return runSudo("dnf", "install", "-y", "mysql-server")

	case "PostgreSQL":
		if pm == "apt" {
			return runSudo("apt-get", "install", "-y", "postgresql")
		}
		return runSudo("dnf", "install", "-y", "postgresql-server")

	case "MongoDB":
		// MongoDB requires adding the repo first
		if pm == "apt" {
			// Add MongoDB repo (Ubuntu/Debian)
			exec.Command("bash", "-c", `wget -qO - https://www.mongodb.org/static/pgp/server-8.0.asc | sudo apt-key add -`).CombinedOutput()
			exec.Command("bash", "-c", `echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list`).CombinedOutput()
			runSudo("apt-get", "update")
			return runSudo("apt-get", "install", "-y", "mongodb-org")
		}
		// Fedora/RHEL
		return runSudo("dnf", "install", "-y", "mongodb-org")

	default:
		return fmt.Errorf("unknown service: %s", name)
	}
}

func uninstallServiceOS(a *App, name string) error {
	pm := linuxPackageManager()
	if pm == "" {
		return fmt.Errorf("no supported package manager found")
	}

	a.emitEvent("uninstall:progress", fmt.Sprintf("Uninstalling %s...", name))

	switch name {
	case "MySQL":
		if pm == "apt" {
			return runSudo("apt-get", "remove", "-y", "mysql-server")
		}
		return runSudo("dnf", "remove", "-y", "mysql-server")

	case "PostgreSQL":
		if pm == "apt" {
			return runSudo("apt-get", "remove", "-y", "postgresql")
		}
		return runSudo("dnf", "remove", "-y", "postgresql-server")

	case "MongoDB":
		if pm == "apt" {
			return runSudo("apt-get", "remove", "-y", "mongodb-org")
		}
		return runSudo("dnf", "remove", "-y", "mongodb-org")

	default:
		return fmt.Errorf("unknown service: %s", name)
	}
}

func runSudo(args ...string) error {
	// Try pkexec (graphical sudo) first, fallback to sudo
	if _, err := exec.LookPath("pkexec"); err == nil {
		out, err := exec.Command("pkexec", args...).CombinedOutput()
		if err != nil {
			return fmt.Errorf("%s", string(out))
		}
		return nil
	}
	out, err := exec.Command("sudo", args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s", string(out))
	}
	return nil
}

// ─── Start / Stop ────────────────────────────────────────────────

func startServiceOS(a *App, name string) error {
	switch name {
	case "MySQL":
		return a.startMySQLLinux()
	case "PostgreSQL":
		return a.startPostgresLinux()
	case "MongoDB":
		return a.startMongoLinux()
	}
	return fmt.Errorf("unknown service: %s", name)
}

func stopServiceOS(a *App, name string) error {
	switch name {
	case "MySQL":
		return a.stopMySQLLinux()
	case "PostgreSQL":
		return a.stopPostgresLinux()
	case "MongoDB":
		return a.stopMongoLinux()
	}
	return fmt.Errorf("unknown service: %s", name)
}

// ─── MySQL ───────────────────────────────────────────────────────

func (a *App) startMySQLLinux() error {
	// Try systemctl first
	for _, svc := range []string{"mysql", "mysqld", "mariadb"} {
		out, err := exec.Command("systemctl", "start", svc).CombinedOutput()
		if err == nil {
			return nil
		}
		_ = out
	}
	// Direct
	if path := findBin("mysqld_safe"); path != "" {
		cmd := exec.Command(path, fmt.Sprintf("--port=%d", a.mysqlPort))
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("mysqld_safe failed: %v", err)
		}
		go cmd.Wait()
		return nil
	}
	return fmt.Errorf("MySQL not found")
}

func (a *App) stopMySQLLinux() error {
	for _, svc := range []string{"mysql", "mysqld", "mariadb"} {
		exec.Command("systemctl", "stop", svc).Run()
		if !isPortOpen(a.mysqlPort) {
			return nil
		}
	}
	if path := findBin("mysqladmin"); path != "" {
		exec.Command(path, "-u", "root", fmt.Sprintf("--port=%d", a.mysqlPort), "shutdown").CombinedOutput()
		if !isPortOpen(a.mysqlPort) {
			return nil
		}
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

func (a *App) startPostgresLinux() error {
	if err := exec.Command("systemctl", "start", "postgresql").Run(); err == nil {
		return nil
	}
	if path := findBin("pg_ctl"); path != "" {
		dataDir := a.findPgDataDirLinux()
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

func (a *App) stopPostgresLinux() error {
	exec.Command("systemctl", "stop", "postgresql").Run()
	if !isPortOpen(a.pgPort) {
		return nil
	}
	if path := findBin("pg_ctl"); path != "" {
		dataDir := a.findPgDataDirLinux()
		if dataDir != "" {
			exec.Command(path, "stop", "-D", dataDir, "-m", "fast").CombinedOutput()
			if !isPortOpen(a.pgPort) {
				return nil
			}
		}
	}
	if pid := findPIDOnPort(a.pgPort); pid > 0 {
		if proc, err := os.FindProcess(pid); err == nil {
			proc.Kill()
		}
		return nil
	}
	return fmt.Errorf("could not stop PostgreSQL")
}

func (a *App) findPgDataDirLinux() string {
	candidates := []string{
		"/var/lib/postgresql/17/main",
		"/var/lib/postgresql/16/main",
		"/var/lib/postgresql/15/main",
		"/var/lib/postgresql/14/main",
		"/var/lib/pgsql/data",
	}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "PG_VERSION")); err == nil {
			return c
		}
	}
	return ""
}

// ─── MongoDB ─────────────────────────────────────────────────────

func (a *App) startMongoLinux() error {
	if err := exec.Command("systemctl", "start", "mongod").Run(); err == nil {
		return nil
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

func (a *App) stopMongoLinux() error {
	exec.Command("systemctl", "stop", "mongod").Run()
	if !isPortOpen(a.mongoPort) {
		return nil
	}
	if path := findBin("mongod"); path != "" {
		dbPath := filepath.Join(a.configDir, "mongo-data")
		exec.Command(path, "--shutdown", "--dbpath", dbPath).CombinedOutput()
		if !isPortOpen(a.mongoPort) {
			return nil
		}
	}
	if path := findBin("mongosh"); path != "" {
		exec.Command(path, "--eval", "db.adminCommand({shutdown: 1})", "--quiet").CombinedOutput()
		if !isPortOpen(a.mongoPort) {
			return nil
		}
	}
	if pid := findPIDOnPort(a.mongoPort); pid > 0 {
		if proc, err := os.FindProcess(pid); err == nil {
			proc.Kill()
		}
		return nil
	}
	return fmt.Errorf("could not stop MongoDB")
}
