// @soleil-clems: Manager - Windows platform (winget/choco, net/sc)
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
	"syscall"
	"time"
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

	configDir := filepath.Join(home, ".socadmin")
	mongoMatches, _ := filepath.Glob(filepath.Join(configDir, "mongodb", "mongodb-*", "bin"))
	extraSearchPaths = append(extraSearchPaths, mongoMatches...)
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
			return a.installPostgresWindows()
		case "MongoDB":
			return a.installMongoWindows()
		}
	} else {
		switch name {
		case "MySQL":
			return runCmd("choco", "install", "mysql", "-y")
		case "PostgreSQL":
			return a.installPostgresWindows()
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
			return a.uninstallMongoWindows()
		}
	} else {
		switch name {
		case "MySQL":
			return runCmd("choco", "uninstall", "mysql", "-y")
		case "PostgreSQL":
			return runCmd("choco", "uninstall", "postgresql17", "-y")
		case "MongoDB":
			return a.uninstallMongoWindows()
		}
	}
	return fmt.Errorf("unknown service: %s", name)
}

func (a *App) uninstallMongoWindows() error {
	// Uninstall winget/choco versions
	runCmd("winget", "uninstall", "--id", "MongoDB.Server", "--all-versions")
	runCmd("winget", "uninstall", "--id", "MongoDB.Compass", "--all-versions")
	if _, err := exec.LookPath("choco"); err == nil {
		runCmd("choco", "uninstall", "mongodb", "-y")
	}
	// Remove portable
	portableDir := filepath.Join(a.configDir, "mongodb")
	os.RemoveAll(portableDir)
	return nil
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

func (a *App) installPostgresWindows() error {
	port := fmt.Sprintf("%d", a.pgPort)

	// 1) winget with unattended mode
	log.Printf("[postgres] Trying winget with unattended mode...")
	a.emitEvent("install:progress", "Installing PostgreSQL via winget...")
	err := runCmd("winget", "install", "--id", "PostgreSQL.PostgreSQL.17",
		"--accept-package-agreements", "--accept-source-agreements",
		"--override", "--mode unattended --superpassword root --serverport "+port)
	if err == nil {
		ensurePATH()
		if findBin("psql") != "" {
			return nil
		}
		log.Printf("[postgres] winget OK but psql not found in PATH")
	} else {
		log.Printf("[postgres] winget failed: %v", err)
	}

	// 2) choco
	if _, chocoErr := exec.LookPath("choco"); chocoErr == nil {
		log.Printf("[postgres] Trying choco...")
		a.emitEvent("install:progress", "Installing PostgreSQL via Chocolatey...")
		if chocoErr := runCmd("choco", "install", "postgresql17", "-y", "--params", "/Password:root"); chocoErr == nil {
			ensurePATH()
			if findBin("psql") != "" {
				return nil
			}
			log.Printf("[postgres] choco OK but psql not found in PATH")
		} else {
			log.Printf("[postgres] choco failed: %v", chocoErr)
		}
	}

	return fmt.Errorf("PostgreSQL install failed. Check logs at ~/.socadmin/manager-debug.log or install manually from postgresql.org/download/windows")
}

func (a *App) installMongoWindows() error {
	// 1) winget
	log.Printf("[mongodb] Trying winget...")
	a.emitEvent("install:progress", "Installing MongoDB via winget...")
	err := runCmd("winget", "install", "--id", "MongoDB.Server", "--source", "winget", "--accept-package-agreements", "--accept-source-agreements")
	if err == nil {
		ensurePATH()
		if findBin("mongod") != "" {
			return nil
		}
		log.Printf("[mongodb] winget OK but mongod not found in PATH")
	} else {
		log.Printf("[mongodb] winget failed: %v", err)
	}

	// 2) choco
	if _, chocoErr := exec.LookPath("choco"); chocoErr == nil {
		log.Printf("[mongodb] Trying choco...")
		a.emitEvent("install:progress", "Installing MongoDB via Chocolatey...")
		if chocoErr := runCmd("choco", "install", "mongodb", "-y"); chocoErr == nil {
			ensurePATH()
			if findBin("mongod") != "" {
				return nil
			}
			log.Printf("[mongodb] choco OK but mongod not found in PATH")
		} else {
			log.Printf("[mongodb] choco failed: %v", chocoErr)
		}
	}

	// 3) Portable zip download (no admin needed)
	log.Printf("[mongodb] Trying portable zip download...")
	a.emitEvent("install:progress", "Downloading MongoDB portable...")
	if dlErr := installMongoPortable(a.configDir); dlErr == nil {
		if findBin("mongod") != "" {
			return nil
		}
		log.Printf("[mongodb] portable extracted but mongod not found")
	} else {
		log.Printf("[mongodb] portable download failed: %v", dlErr)
	}

	return fmt.Errorf("MongoDB install failed. Check logs at ~/.socadmin/manager-debug.log or install manually from mongodb.com/try/download/community")
}

func installMongoPortable(configDir string) error {
	mongoDir := filepath.Join(configDir, "mongodb")
	if matches, _ := filepath.Glob(filepath.Join(mongoDir, "mongodb-*", "bin", "mongod.exe")); len(matches) > 0 {
		return nil
	}

	zipPath := filepath.Join(os.TempDir(), "mongodb.zip")
	defer os.Remove(zipPath)

	cmd := exec.Command("powershell", "-NoProfile", "-Command",
		`$ProgressPreference='SilentlyContinue'; `+
			`Invoke-WebRequest -Uri 'https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.4.zip' -OutFile '`+zipPath+`'`)
	hideWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("download failed: %s", string(out))
	}

	os.MkdirAll(mongoDir, 0755)
	cmd2 := exec.Command("powershell", "-NoProfile", "-Command",
		`Expand-Archive -Path '`+zipPath+`' -DestinationPath '`+mongoDir+`' -Force`)
	hideWindow(cmd2)
	out2, err2 := cmd2.CombinedOutput()
	if err2 != nil {
		return fmt.Errorf("extract failed: %s", string(out2))
	}

	if matches, _ := filepath.Glob(filepath.Join(mongoDir, "mongodb-*", "bin")); len(matches) > 0 {
		extraSearchPaths = append(extraSearchPaths, matches[0])
		current := os.Getenv("PATH")
		os.Setenv("PATH", current+string(os.PathListSeparator)+matches[0])
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
	for _, svc := range []string{"MySQL90", "MySQL84", "MySQL80", "MySQL57", "MySQL"} {
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
	path := findBin("mysqld")
	if path == "" {
		return fmt.Errorf("MySQL not found")
	}
	dataDir := a.ensureMySQLDataDir(path)
	if dataDir == "" {
		return fmt.Errorf("MySQL data directory not found and initialization failed")
	}
	baseDir := filepath.Dir(filepath.Dir(path))
	logPath := filepath.Join(a.configDir, "mysql-error.log")
	cmd := exec.Command(path,
		"--basedir="+baseDir,
		"--datadir="+dataDir,
		fmt.Sprintf("--port=%d", a.mysqlPort),
		"--log-error="+logPath)
	hideWindow(cmd)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("mysqld failed: %v", err)
	}
	go cmd.Wait()
	return nil
}

func (a *App) ensureMySQLDataDir(mysqldPath string) string {
	binDir := filepath.Dir(mysqldPath)
	baseDir := filepath.Dir(binDir)
	serverName := filepath.Base(baseDir)
	programData := os.Getenv("PROGRAMDATA")
	if programData == "" {
		programData = `C:\ProgramData`
	}
	candidates := []string{
		filepath.Join(baseDir, "data"),
		filepath.Join(baseDir, "Data"),
		filepath.Join(programData, "MySQL", serverName, "Data"),
		filepath.Join(programData, "MySQL", serverName, "data"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "mysql")); err == nil {
			return c
		}
	}
	dataDir := filepath.Join(baseDir, "data")
	log.Printf("[mysql] Initializing data directory at %s", dataDir)
	cmd := exec.Command(mysqldPath, "--initialize-insecure", "--basedir="+baseDir, "--datadir="+dataDir)
	hideWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[mysql] init failed: %v: %s", err, string(out))
		return ""
	}
	log.Printf("[mysql] init OK")
	return dataDir
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
	for _, svc := range []string{"MongoDB", "MongoDB Server"} {
		c := exec.Command("net", "start", svc)
		hideWindow(c)
		if err := c.Run(); err == nil {
			return nil
		}
	}
	if svc := findWindowsService("MongoDB"); svc != "" {
		c := exec.Command("net", "start", svc)
		hideWindow(c)
		if err := c.Run(); err == nil {
			return nil
		}
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
	for _, svc := range []string{"MongoDB", "MongoDB Server"} {
		c := exec.Command("net", "stop", svc)
		hideWindow(c)
		c.Run()
		if !isPortOpen(a.mongoPort) {
			return nil
		}
	}
	if svc := findWindowsService("MongoDB"); svc != "" {
		c := exec.Command("net", "stop", svc)
		hideWindow(c)
		c.Run()
		if !isPortOpen(a.mongoPort) {
			return nil
		}
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

// ─── Post-install setup ─────────────────────────────────────────

func postInstallOS(a *App, name string) string {
	switch name {
	case "PostgreSQL":
		return a.setupPostgresAfterInstall()
	case "MySQL":
		return a.setupMySQLAfterInstall()
	}
	return ""
}

func (a *App) setupPostgresAfterInstall() string {
	dataDir := a.findPgDataDirWindows()
	if dataDir == "" {
		return "PostgreSQL installed. user=postgres, password=root"
	}
	hbaPath := filepath.Join(dataDir, "pg_hba.conf")
	data, err := os.ReadFile(hbaPath)
	if err != nil {
		return "PostgreSQL installed. user=postgres, password=root"
	}
	original := string(data)
	re := regexp.MustCompile(`(host\s+all\s+all\s+(?:127\.0\.0\.1/32|::1/128)\s+)(?:scram-sha-256|md5)`)
	if !re.MatchString(original) {
		return "PostgreSQL installed. user=postgres"
	}

	trustContent := re.ReplaceAllString(original, "${1}trust")
	os.WriteFile(hbaPath, []byte(trustContent), 0644)

	svc := findWindowsService("postgresql")
	if svc != "" {
		c := exec.Command("net", "stop", svc)
		hideWindow(c)
		c.Run()
		c2 := exec.Command("net", "start", svc)
		hideWindow(c2)
		c2.Run()
	}

	for i := 0; i < 30; i++ {
		if isPortOpen(a.pgPort) {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	if psql := findBin("psql"); psql != "" {
		cmd := exec.Command(psql, "-U", "postgres", "-h", "127.0.0.1",
			"-p", fmt.Sprintf("%d", a.pgPort),
			"-c", "ALTER USER postgres PASSWORD 'root'")
		hideWindow(cmd)
		out, err := cmd.CombinedOutput()
		if err != nil {
			log.Printf("[postgres] set password failed: %s", string(out))
		}
	}

	md5Content := re.ReplaceAllString(original, "${1}md5")
	os.WriteFile(hbaPath, []byte(md5Content), 0644)

	if svc != "" {
		c := exec.Command("net", "stop", svc)
		hideWindow(c)
		c.Run()
		c2 := exec.Command("net", "start", svc)
		hideWindow(c2)
		c2.Run()
	}

	return "PostgreSQL: user=postgres, password=root"
}

func (a *App) setupMySQLAfterInstall() string {
	if !isPortOpen(a.mysqlPort) {
		a.startMySQLWindows()
		for i := 0; i < 30; i++ {
			if isPortOpen(a.mysqlPort) {
				break
			}
			time.Sleep(500 * time.Millisecond)
		}
	}
	if !isPortOpen(a.mysqlPort) {
		return "MySQL installed. user=root"
	}
	mysqladmin := findBin("mysqladmin")
	if mysqladmin != "" {
		cmd := exec.Command(mysqladmin, "-u", "root",
			fmt.Sprintf("--port=%d", a.mysqlPort), "password", "root")
		hideWindow(cmd)
		out, err := cmd.CombinedOutput()
		if err != nil {
			log.Printf("[mysql] set password failed: %s", string(out))
			return "MySQL installed. user=root"
		}
		return "MySQL: user=root, password=root"
	}
	return "MySQL installed. user=root"
}
