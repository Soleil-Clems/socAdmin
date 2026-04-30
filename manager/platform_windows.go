// @soleil-clems: Manager - Windows platform (winget/choco, net/sc)
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
)

const createNoWindow = 0x08000000

func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: createNoWindow,
	}
}

func configureCmdOS(cmd *exec.Cmd) { hideWindow(cmd) }

var extraSearchPaths = []string{
	`C:\Program Files\MySQL\MySQL Server 9.0\bin`,
	`C:\Program Files\MySQL\MySQL Server 8.4\bin`,
	`C:\Program Files\MySQL\MySQL Server 8.0\bin`,
	`C:\Program Files\MySQL\MySQL Server 5.7\bin`,
	`C:\Program Files\PostgreSQL\17\bin`,
	`C:\Program Files\PostgreSQL\16\bin`,
	`C:\Program Files\PostgreSQL\15\bin`,
	`C:\Program Files\PostgreSQL\14\bin`,
	`C:\Program Files\MongoDB\Server\8.0\bin`,
	`C:\Program Files\MongoDB\Server\7.0\bin`,
	`C:\Program Files\MongoDB\Server\6.0\bin`,
	`C:\ProgramData\chocolatey\bin`,
}

func init() {
	home, _ := os.UserHomeDir()
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = filepath.Join(home, "AppData", "Local")
	}
	wingetPaths := []string{
		filepath.Join(localAppData, "Microsoft", "WinGet", "Links"),
		filepath.Join(localAppData, "Programs", "mongosh"),
	}
	extraSearchPaths = append(extraSearchPaths, wingetPaths...)
}

func binaryName() string { return "socadmin.exe" }

func findPackageManager() string { return windowsPackageManager() }

func findPIDOnPortOS(port int) int {
	cmd := exec.Command("cmd", "/c", "netstat", "-ano", "-p", "tcp")
	hideWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return 0
	}
	target := fmt.Sprintf(":%d", port)
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if !strings.Contains(line, target) || !strings.Contains(line, "LISTENING") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 5 {
			pid, _ := strconv.Atoi(fields[4])
			return pid
		}
	}
	return 0
}

func detectSourceOS(binPath string) string {
	lower := strings.ToLower(binPath)
	if strings.Contains(lower, "chocolatey") {
		return "chocolatey"
	}
	// Check winget
	if _, err := exec.LookPath("winget"); err == nil {
		return "winget"
	}
	return "system"
}

func canInstallServicesOS() bool {
	if _, err := exec.LookPath("winget"); err == nil {
		return true
	}
	if _, err := exec.LookPath("choco"); err == nil {
		return true
	}
	return false
}

func windowsPackageManager() string {
	if _, err := exec.LookPath("winget"); err == nil {
		return "winget"
	}
	if _, err := exec.LookPath("choco"); err == nil {
		return "choco"
	}
	return ""
}

func installServiceOS(a *App, name string) error {
	pm := windowsPackageManager()
	if pm == "" {
		return fmt.Errorf("no package manager found (winget or chocolatey)")
	}

	a.emitEvent("install:progress", fmt.Sprintf("Installing %s...", name))

	if pm == "winget" {
		switch name {
		case "MySQL":
			return runCmd("winget", "install", "--id", "Oracle.MySQL", "--accept-package-agreements", "--accept-source-agreements")
		case "PostgreSQL":
			return runCmd("winget", "install", "--id", "PostgreSQL.PostgreSQL.17", "--accept-package-agreements", "--accept-source-agreements")
		case "MongoDB":
			return runCmd("winget", "install", "--id", "MongoDB.Server", "--accept-package-agreements", "--accept-source-agreements")
		}
	} else {
		switch name {
		case "MySQL":
			return runCmd("choco", "install", "mysql", "-y")
		case "PostgreSQL":
			return runCmd("choco", "install", "postgresql17", "-y")
		case "MongoDB":
			return runCmd("choco", "install", "mongodb", "-y")
		}
	}
	return fmt.Errorf("unknown service: %s", name)
}

func uninstallServiceOS(a *App, name string) error {
	pm := windowsPackageManager()
	if pm == "" {
		return fmt.Errorf("no package manager found")
	}

	a.emitEvent("uninstall:progress", fmt.Sprintf("Uninstalling %s...", name))

	if pm == "winget" {
		switch name {
		case "MySQL":
			return runCmd("winget", "uninstall", "--id", "Oracle.MySQL")
		case "PostgreSQL":
			return runCmd("winget", "uninstall", "--id", "PostgreSQL.PostgreSQL.17")
		case "MongoDB":
			return runCmd("winget", "uninstall", "--id", "MongoDB.Server")
		}
	} else {
		switch name {
		case "MySQL":
			return runCmd("choco", "uninstall", "mysql", "-y")
		case "PostgreSQL":
			return runCmd("choco", "uninstall", "postgresql17", "-y")
		case "MongoDB":
			return runCmd("choco", "uninstall", "mongodb", "-y")
		}
	}
	return fmt.Errorf("unknown service: %s", name)
}

func runCmd(args ...string) error {
	cmd := exec.Command(args[0], args[1:]...)
	hideWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		outStr := string(out)
		if strings.Contains(outStr, "already installed") || strings.Contains(outStr, "No available upgrade found") {
			return nil
		}
		return fmt.Errorf("%s", outStr)
	}
	return nil
}

// ─── Start / Stop ────────────────────────────────────────────────

func startServiceOS(a *App, name string) error {
	switch name {
	case "MySQL":
		return a.startMySQLWindows()
	case "PostgreSQL":
		return a.startPostgresWindows()
	case "MongoDB":
		return a.startMongoWindows()
	}
	return fmt.Errorf("unknown service: %s", name)
}

func stopServiceOS(a *App, name string) error {
	switch name {
	case "MySQL":
		return a.stopMySQLWindows()
	case "PostgreSQL":
		return a.stopPostgresWindows()
	case "MongoDB":
		return a.stopMongoWindows()
	}
	return fmt.Errorf("unknown service: %s", name)
}

// findWindowsService looks for a Windows service by pattern
func findWindowsService(pattern string) string {
	cmd := exec.Command("sc", "query", "type=", "service", "state=", "all")
	hideWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return ""
	}
	re := regexp.MustCompile(`(?i)SERVICE_NAME:\s*(` + pattern + `\S*)`)
	if m := re.FindStringSubmatch(string(out)); len(m) > 1 {
		return m[1]
	}
	return ""
}

// ─── MySQL ───────────────────────────────────────────────────────

func (a *App) startMySQLWindows() error {
	// Try common Windows service names
	for _, svc := range []string{"MySQL80", "MySQL84", "MySQL57", "MySQL"} {
		c := exec.Command("net", "start", svc)
		hideWindow(c)
		if err := c.Run(); err == nil {
			return nil
		}
	}
	if svc := findWindowsService("MySQL"); svc != "" {
		c := exec.Command("net", "start", svc)
		hideWindow(c)
		if err := c.Run(); err == nil {
			return nil
		}
	}
	if path := findBin("mysqld"); path != "" {
		cmd := exec.Command(path, fmt.Sprintf("--port=%d", a.mysqlPort), "--console")
		hideWindow(cmd)
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("mysqld failed: %v", err)
		}
		go cmd.Wait()
		return nil
	}
	return fmt.Errorf("MySQL not found")
}

func (a *App) stopMySQLWindows() error {
	for _, svc := range []string{"MySQL80", "MySQL84", "MySQL57", "MySQL"} {
		c := exec.Command("net", "stop", svc)
		hideWindow(c)
		c.Run()
		if !isPortOpen(a.mysqlPort) {
			return nil
		}
	}
	if svc := findWindowsService("MySQL"); svc != "" {
		c := exec.Command("net", "stop", svc)
		hideWindow(c)
		c.Run()
		if !isPortOpen(a.mysqlPort) {
			return nil
		}
	}
	if path := findBin("mysqladmin"); path != "" {
		c := exec.Command(path, "-u", "root", fmt.Sprintf("--port=%d", a.mysqlPort), "shutdown")
		hideWindow(c)
		c.CombinedOutput()
		if !isPortOpen(a.mysqlPort) {
			return nil
		}
	}
	if pid := findPIDOnPort(a.mysqlPort); pid > 0 {
		c := exec.Command("taskkill", "/PID", fmt.Sprintf("%d", pid), "/F")
		hideWindow(c)
		c.Run()
		return nil
	}
	return fmt.Errorf("could not stop MySQL")
}

// ─── PostgreSQL ──────────────────────────────────────────────────

func (a *App) startPostgresWindows() error {
	if svc := findWindowsService("postgresql"); svc != "" {
		c := exec.Command("net", "start", svc)
		hideWindow(c)
		if err := c.Run(); err == nil {
			return nil
		}
	}
	if path := findBin("pg_ctl"); path != "" {
		dataDir := a.findPgDataDirWindows()
		if dataDir == "" {
			return fmt.Errorf("PostgreSQL data directory not found")
		}
		c := exec.Command(path, "start", "-D", dataDir, "-o", fmt.Sprintf("-p %d", a.pgPort), "-l", filepath.Join(a.configDir, "pg.log"))
		hideWindow(c)
		out, err := c.CombinedOutput()
		if err != nil {
			return fmt.Errorf("pg_ctl failed: %s", string(out))
		}
		return nil
	}
	return fmt.Errorf("PostgreSQL not found")
}

func (a *App) stopPostgresWindows() error {
	if svc := findWindowsService("postgresql"); svc != "" {
		c := exec.Command("net", "stop", svc)
		hideWindow(c)
		c.Run()
		if !isPortOpen(a.pgPort) {
			return nil
		}
	}
	if path := findBin("pg_ctl"); path != "" {
		dataDir := a.findPgDataDirWindows()
		if dataDir != "" {
			c := exec.Command(path, "stop", "-D", dataDir, "-m", "fast")
			hideWindow(c)
			c.CombinedOutput()
			if !isPortOpen(a.pgPort) {
				return nil
			}
		}
	}
	if pid := findPIDOnPort(a.pgPort); pid > 0 {
		c := exec.Command("taskkill", "/PID", fmt.Sprintf("%d", pid), "/F")
		hideWindow(c)
		c.Run()
		return nil
	}
	return fmt.Errorf("could not stop PostgreSQL")
}

func (a *App) findPgDataDirWindows() string {
	for _, ver := range []string{"17", "16", "15", "14"} {
		p := filepath.Join(`C:\Program Files\PostgreSQL`, ver, "data")
		if _, err := os.Stat(filepath.Join(p, "PG_VERSION")); err == nil {
			return p
		}
	}
	programData := os.Getenv("PROGRAMDATA")
	if programData == "" {
		programData = `C:\ProgramData`
	}
	for _, ver := range []string{"17", "16", "15", "14"} {
		p := filepath.Join(programData, "PostgreSQL", ver, "data")
		if _, err := os.Stat(filepath.Join(p, "PG_VERSION")); err == nil {
			return p
		}
	}
	// Check if pg_ctl can report the data dir via Windows service
	if svc := findWindowsService("postgresql"); svc != "" {
		c := exec.Command("sc", "qc", svc)
		hideWindow(c)
		out, err := c.CombinedOutput()
		if err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				if idx := strings.Index(line, "-D"); idx >= 0 {
					rest := strings.TrimSpace(line[idx+2:])
					rest = strings.Trim(rest, `"`)
					if next := strings.Index(rest, `"`); next > 0 {
						rest = rest[:next]
					}
					rest = strings.TrimSpace(rest)
					if _, err := os.Stat(filepath.Join(rest, "PG_VERSION")); err == nil {
						return rest
					}
				}
			}
		}
	}
	return ""
}

// ─── MongoDB ─────────────────────────────────────────────────────

func (a *App) startMongoWindows() error {
	c := exec.Command("net", "start", "MongoDB")
	hideWindow(c)
	if err := c.Run(); err == nil {
		return nil
	}
	if path := findBin("mongod"); path != "" {
		dbPath := filepath.Join(a.configDir, "mongo-data")
		os.MkdirAll(dbPath, 0755)
		logPath := filepath.Join(a.configDir, "mongod.log")
		cmd := exec.Command(path, "--port", fmt.Sprintf("%d", a.mongoPort), "--dbpath", dbPath, "--logpath", logPath)
		hideWindow(cmd)
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("mongod failed: %v", err)
		}
		go cmd.Wait()
		return nil
	}
	return fmt.Errorf("MongoDB not found")
}

func (a *App) stopMongoWindows() error {
	c := exec.Command("net", "stop", "MongoDB")
	hideWindow(c)
	c.Run()
	if !isPortOpen(a.mongoPort) {
		return nil
	}
	if path := findBin("mongod"); path != "" {
		dbPath := filepath.Join(a.configDir, "mongo-data")
		c2 := exec.Command(path, "--shutdown", "--dbpath", dbPath)
		hideWindow(c2)
		c2.CombinedOutput()
		if !isPortOpen(a.mongoPort) {
			return nil
		}
	}
	if pid := findPIDOnPort(a.mongoPort); pid > 0 {
		c3 := exec.Command("taskkill", "/PID", fmt.Sprintf("%d", pid), "/F")
		hideWindow(c3)
		c3.Run()
		return nil
	}
	return fmt.Errorf("could not stop MongoDB")
}
