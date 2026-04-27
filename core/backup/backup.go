// @soleil-clems: Backup - Native dump/restore (mysqldump, pg_dump, mongodump)
package backup

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/soleilouisol/socAdmin/core/connector"
)

// ErrBinaryMissing is returned when the dump/restore binary cannot be
// found in PATH or any of the well-known install locations.
var ErrBinaryMissing = errors.New("backup binary not found")

// Format describes the on-the-wire format of a backup payload. Each SGBD
// has a single canonical format we use:
//   - mysql      → plain SQL (mysqldump default)
//   - postgresql → plain SQL (pg_dump default)
//   - mongodb    → archive   (mongodump --archive, binary format)
type Format struct {
	Extension   string // file extension shown to the user (".sql", ".archive")
	ContentType string // MIME type for HTTP Content-Type header
}

// FormatFor returns the canonical Format for a given dbType.
func FormatFor(dbType string) Format {
	switch dbType {
	case "mongodb":
		return Format{Extension: ".archive", ContentType: "application/octet-stream"}
	default:
		return Format{Extension: ".sql", ContentType: "application/sql"}
	}
}

// Backup streams a full database dump to w. The caller is responsible for
// setting any HTTP headers before calling. Errors from the underlying
// binary (e.g. authentication failure, missing database) are returned
// after some bytes may already have been written to w — the caller should
// treat any non-nil return as a corrupt download.
func Backup(dbType string, cfg connector.ConnectionConfig, dbName string, w io.Writer) error {
	bin, args, env, err := buildDumpCommand(dbType, cfg, dbName)
	if err != nil {
		return err
	}

	cmd := exec.Command(bin, args...)
	cmd.Env = append(os.Environ(), env...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %w", err)
	}
	// Capture stderr so we can surface a useful error if the dump fails.
	stderrBuf := &limitedBuffer{max: 4096}
	cmd.Stderr = stderrBuf

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start %s: %w", filepath.Base(bin), err)
	}

	if _, err := io.Copy(w, stdout); err != nil {
		_ = cmd.Wait()
		return fmt.Errorf("stream backup: %w", err)
	}

	if err := cmd.Wait(); err != nil {
		stderr := stderrBuf.String()
		if stderr != "" {
			return fmt.Errorf("%s failed: %s", filepath.Base(bin), stderr)
		}
		return fmt.Errorf("%s failed: %w", filepath.Base(bin), err)
	}
	return nil
}

// Restore streams a backup payload from r into the target database. For
// SQL dumps the file is expected to contain plain SQL; for MongoDB it
// must be an archive produced by mongodump --archive.
func Restore(dbType string, cfg connector.ConnectionConfig, dbName string, r io.Reader) error {
	bin, args, env, err := buildRestoreCommand(dbType, cfg, dbName)
	if err != nil {
		return err
	}

	cmd := exec.Command(bin, args...)
	cmd.Env = append(os.Environ(), env...)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("stdin pipe: %w", err)
	}
	stderrBuf := &limitedBuffer{max: 4096}
	cmd.Stderr = stderrBuf

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start %s: %w", filepath.Base(bin), err)
	}

	copyErr := func() error {
		defer stdin.Close()
		if _, err := io.Copy(stdin, r); err != nil {
			return fmt.Errorf("stream restore input: %w", err)
		}
		return nil
	}()

	waitErr := cmd.Wait()
	if copyErr != nil {
		return copyErr
	}
	if waitErr != nil {
		stderr := stderrBuf.String()
		if stderr != "" {
			return fmt.Errorf("%s failed: %s", filepath.Base(bin), stderr)
		}
		return fmt.Errorf("%s failed: %w", filepath.Base(bin), waitErr)
	}
	return nil
}

// CheckBinaries reports which backup tools are available on this machine.
// Used by the frontend to disable backup buttons when the binary is missing.
func CheckBinaries() map[string]bool {
	return map[string]bool{
		"mysql":      lookupBinary("mysqldump") != "",
		"postgresql": lookupBinary("pg_dump") != "",
		"mongodb":    lookupBinary("mongodump") != "",
	}
}

// ── command builders ──────────────────────────────────────────────────

func buildDumpCommand(dbType string, cfg connector.ConnectionConfig, dbName string) (bin string, args, env []string, err error) {
	switch dbType {
	case "mysql":
		bin = lookupBinary("mysqldump")
		if bin == "" {
			return "", nil, nil, fmt.Errorf("%w: mysqldump", ErrBinaryMissing)
		}
		args = []string{
			fmt.Sprintf("--host=%s", cfg.Host),
			fmt.Sprintf("--port=%d", cfg.Port),
			fmt.Sprintf("--user=%s", cfg.User),
			"--single-transaction",
			"--routines",
			"--triggers",
			"--no-tablespaces",
			dbName,
		}
		// Pass password via env var to avoid showing it in `ps`.
		// MYSQL_PWD is the documented mysqldump alternative to --password.
		if cfg.Password != "" {
			env = append(env, "MYSQL_PWD="+cfg.Password)
		}

	case "postgresql":
		bin = lookupBinary("pg_dump")
		if bin == "" {
			return "", nil, nil, fmt.Errorf("%w: pg_dump", ErrBinaryMissing)
		}
		args = []string{
			"--host=" + cfg.Host,
			fmt.Sprintf("--port=%d", cfg.Port),
			"--username=" + cfg.User,
			"--no-password", // never prompt; rely on PGPASSWORD env
			"--clean",
			"--if-exists",
			dbName,
		}
		if cfg.Password != "" {
			env = append(env, "PGPASSWORD="+cfg.Password)
		}

	case "mongodb":
		bin = lookupBinary("mongodump")
		if bin == "" {
			return "", nil, nil, fmt.Errorf("%w: mongodump", ErrBinaryMissing)
		}
		args = []string{
			"--host=" + cfg.Host,
			fmt.Sprintf("--port=%d", cfg.Port),
			"--db=" + dbName,
			"--archive", // write archive to stdout
		}
		if cfg.User != "" {
			args = append(args, "--username="+cfg.User)
		}
		if cfg.Password != "" {
			args = append(args, "--password="+cfg.Password)
			args = append(args, "--authenticationDatabase=admin")
		}

	default:
		return "", nil, nil, fmt.Errorf("unsupported db type: %s", dbType)
	}
	return bin, args, env, nil
}

func buildRestoreCommand(dbType string, cfg connector.ConnectionConfig, dbName string) (bin string, args, env []string, err error) {
	switch dbType {
	case "mysql":
		bin = lookupBinary("mysql")
		if bin == "" {
			return "", nil, nil, fmt.Errorf("%w: mysql", ErrBinaryMissing)
		}
		// NOTE: we'd like to pass --abort-source-on-error so partial
		// restores can't leave a half-populated DB, but that flag only
		// exists in MySQL 8.0+ and MAMP ships 5.7 — adding it breaks
		// restore entirely. mysql(1) reading from stdin aborts on fatal
		// errors by default anyway; the cases where it continues are
		// benign (warnings, duplicate-ignored, etc).
		args = []string{
			fmt.Sprintf("--host=%s", cfg.Host),
			fmt.Sprintf("--port=%d", cfg.Port),
			fmt.Sprintf("--user=%s", cfg.User),
			dbName,
		}
		if cfg.Password != "" {
			env = append(env, "MYSQL_PWD="+cfg.Password)
		}

	case "postgresql":
		bin = lookupBinary("psql")
		if bin == "" {
			return "", nil, nil, fmt.Errorf("%w: psql", ErrBinaryMissing)
		}
		args = []string{
			"--host=" + cfg.Host,
			fmt.Sprintf("--port=%d", cfg.Port),
			"--username=" + cfg.User,
			"--no-password",
			// Equivalent of --abort-source-on-error for psql: stop on the
			// first error instead of limping along.
			"-v", "ON_ERROR_STOP=1",
			"--dbname=" + dbName,
		}
		if cfg.Password != "" {
			env = append(env, "PGPASSWORD="+cfg.Password)
		}

	case "mongodb":
		bin = lookupBinary("mongorestore")
		if bin == "" {
			return "", nil, nil, fmt.Errorf("%w: mongorestore", ErrBinaryMissing)
		}
		args = []string{
			"--host=" + cfg.Host,
			fmt.Sprintf("--port=%d", cfg.Port),
			"--archive",
			"--nsInclude=" + dbName + ".*",
			"--drop",
		}
		if cfg.User != "" {
			args = append(args, "--username="+cfg.User)
		}
		if cfg.Password != "" {
			args = append(args, "--password="+cfg.Password)
			args = append(args, "--authenticationDatabase=admin")
		}

	default:
		return "", nil, nil, fmt.Errorf("unsupported db type: %s", dbType)
	}
	return bin, args, env, nil
}

// ── binary lookup ─────────────────────────────────────────────────────

// lookupBinary returns the absolute path to a backup tool, or "" if not
// found. It first tries PATH, then falls back to platform-specific
// well-known install locations (MAMP, Homebrew, etc).
func lookupBinary(name string) string {
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	if p, err := exec.LookPath(name); err == nil {
		return p
	}
	for _, dir := range searchPaths() {
		full := filepath.Join(dir, name)
		if _, err := os.Stat(full); err == nil {
			return full
		}
	}
	return ""
}

// ── small helpers ─────────────────────────────────────────────────────

// limitedBuffer captures up to max bytes; useful for stderr where we only
// want the first few KB to surface as an error message.
type limitedBuffer struct {
	max int
	buf []byte
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if len(b.buf) >= b.max {
		return len(p), nil
	}
	remaining := b.max - len(b.buf)
	if len(p) > remaining {
		b.buf = append(b.buf, p[:remaining]...)
	} else {
		b.buf = append(b.buf, p...)
	}
	return len(p), nil
}

func (b *limitedBuffer) String() string { return string(b.buf) }
