// @soleil-clems: Manager - Linux platform (apt/dnf, systemctl)
package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

func configureCmdOS(_ *exec.Cmd) {}

func postInstallOS(_ *App, _ string) string { return "" }

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
	out, err := exec.Command("ss", "-tlnp", fmt.Sprintf("sport = :%d", port)).CombinedOutput()
	if err == nil {
		re := regexp.MustCompile(`pid=(\d+)`)
		if m := re.FindStringSubmatch(string(out)); len(m) > 1 {
			pid, _ := strconv.Atoi(m[1])
			return pid
		}
	}
	out, err = exec.Command("fuser", fmt.Sprintf("%d/tcp", port)).CombinedOutput()
	if err == nil {
		pid, _ := strconv.Atoi(strings.TrimSpace(string(out)))
		return pid
	}
	return 0
}

func detectSourceOS(binPath string) string {
	if _, err := exec.LookPath("dpkg"); err == nil {
		out, err := exec.Command("dpkg", "-S", binPath).CombinedOutput()
		if err == nil && !strings.Contains(string(out), "not found") {
			return "apt"
		}
	}
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

// ─── Privileged command execution ───────────────────────────────

const helperPath = "/usr/lib/soca-manager/soca-helper"

func findFullPath(name string) string {
	for _, dir := range []string{"/usr/bin", "/usr/sbin", "/usr/local/bin", "/bin", "/sbin"} {
		p := filepath.Join(dir, name)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return name
}

func runHelper(command string) error {
	if _, err := os.Stat(helperPath); err != nil {
		return fmt.Errorf("soca-helper not found at %s — reinstall the package", helperPath)
	}

	sudoBin := findFullPath("sudo")
	out, err := exec.Command(sudoBin, "-n", helperPath, command).CombinedOutput()
	if err == nil {
		return nil
	}
	log.Printf("[helper] sudo -n failed: %s", strings.TrimSpace(string(out)))

	pkexecBin := findFullPath("pkexec")
	out, err = exec.Command(pkexecBin, helperPath, command).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s", strings.TrimSpace(string(out)))
	}
	return nil
}

// ─── Install / Uninstall ────────────────────────────────────────

func installServiceOS(a *App, name string) error {
	a.emitEvent("install:progress", fmt.Sprintf("Installing %s...", name))

	switch name {
	case "MySQL":
		return runHelper("install-mysql")
	case "PostgreSQL":
		return runHelper("install-postgresql")
	case "MongoDB":
		return runHelper("install-mongodb")
	default:
		return fmt.Errorf("unknown service: %s", name)
	}
}

func uninstallServiceOS(a *App, name string) error {
	a.emitEvent("uninstall:progress", fmt.Sprintf("Uninstalling %s...", name))

	switch name {
	case "MySQL":
		return runHelper("remove-mysql")
	case "PostgreSQL":
		return runHelper("remove-postgresql")
	case "MongoDB":
		return runHelper("remove-mongodb")
	default:
		return fmt.Errorf("unknown service: %s", name)
	}
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
	if err := runHelper("start-mysql"); err == nil {
		return nil
	}
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
	runHelper("stop-mysql")
	if a.waitForPortClosedTimeout(a.mysqlPort, 10*time.Second) {
		return nil
	}
	if path := findBin("mysqladmin"); path != "" {
		exec.Command(path, "-u", "root", fmt.Sprintf("--port=%d", a.mysqlPort), "shutdown").CombinedOutput()
		if a.waitForPortClosedTimeout(a.mysqlPort, 5*time.Second) {
			return nil
		}
	}
	return a.killOnPort(a.mysqlPort, "MySQL")
}

// ─── PostgreSQL ──────────────────────────────────────────────────

func (a *App) startPostgresLinux() error {
	if err := runHelper("start-postgresql"); err == nil {
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
	runHelper("stop-postgresql")
	if a.waitForPortClosedTimeout(a.pgPort, 10*time.Second) {
		return nil
	}
	if path := findBin("pg_ctl"); path != "" {
		dataDir := a.findPgDataDirLinux()
		if dataDir != "" {
			exec.Command(path, "stop", "-D", dataDir, "-m", "fast").CombinedOutput()
			if a.waitForPortClosedTimeout(a.pgPort, 5*time.Second) {
				return nil
			}
		}
	}
	return a.killOnPort(a.pgPort, "PostgreSQL")
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
	if err := runHelper("start-mongod"); err == nil {
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
	runHelper("stop-mongod")
	if a.waitForPortClosedTimeout(a.mongoPort, 10*time.Second) {
		return nil
	}
	if path := findBin("mongod"); path != "" {
		dbPath := filepath.Join(a.configDir, "mongo-data")
		exec.Command(path, "--shutdown", "--dbpath", dbPath).CombinedOutput()
		if a.waitForPortClosedTimeout(a.mongoPort, 5*time.Second) {
			return nil
		}
	}
	if path := findBin("mongosh"); path != "" {
		exec.Command(path, "--eval", "db.adminCommand({shutdown: 1})", "--quiet").CombinedOutput()
		if a.waitForPortClosedTimeout(a.mongoPort, 5*time.Second) {
			return nil
		}
	}
	return a.killOnPort(a.mongoPort, "MongoDB")
}

// ─── Helpers ────────────────────────────────────────────────────

func (a *App) waitForPortClosedTimeout(port int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !isPortOpen(port) {
			return true
		}
		time.Sleep(300 * time.Millisecond)
	}
	return !isPortOpen(port)
}

func (a *App) killOnPort(port int, name string) error {
	pid := findPIDOnPort(port)
	if pid > 0 {
		if proc, err := os.FindProcess(pid); err == nil {
			proc.Kill()
			log.Printf("[service] killed %s (pid %d) on port %d", name, pid, port)
		}
		return nil
	}
	if !isPortOpen(port) {
		return nil
	}
	return fmt.Errorf("could not stop %s", name)
}
