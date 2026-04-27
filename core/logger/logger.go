// @soleil-clems: Logger - Security-safe audit logging
package logger

import (
	"fmt"
	"log"
	"os"
	"time"
)

// Logger writes structured security-safe audit logs to stdout.
// NEVER logs: SQL content, passwords, row data, emails, tokens.
// Only logs: action, timing, target, client IP, user ID, row counts.

var std = log.New(os.Stdout, "", 0)

func timestamp() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05Z")
}

// Auth logs authentication events
func Auth(action string, userID int64, ip string) {
	std.Printf("%s [AUTH] action=%s user_id=%d ip=%s", timestamp(), action, userID, ip)
}

// AuthFail logs failed authentication (no user ID available)
func AuthFail(action string, ip string) {
	std.Printf("%s [AUTH] action=%s status=failed ip=%s", timestamp(), action, ip)
}

// Connect logs database connection events
func Connect(userID int64, ip string, dbType string, host string, port int, success bool) {
	status := "ok"
	if !success {
		status = "failed"
	}
	std.Printf("%s [CONNECT] user_id=%d ip=%s type=%s target=%s:%d status=%s",
		timestamp(), userID, ip, dbType, host, port, status)
}

// Query logs query execution (never the SQL content itself)
func Query(userID int64, ip string, database string, duration time.Duration, rowCount int, isError bool) {
	status := "ok"
	if isError {
		status = "error"
	}
	std.Printf("%s [QUERY] user_id=%d ip=%s db=%s duration=%s rows=%d status=%s",
		timestamp(), userID, ip, database, duration.Round(time.Millisecond), rowCount, status)
}

// Export logs data export events
func Export(userID int64, ip string, database string, table string, format string) {
	target := database
	if table != "" {
		target = fmt.Sprintf("%s.%s", database, table)
	}
	std.Printf("%s [EXPORT] user_id=%d ip=%s target=%s format=%s", timestamp(), userID, ip, target, format)
}

// Import logs data import events
func Import(userID int64, ip string, database string, table string, format string, rowCount int) {
	target := database
	if table != "" {
		target = fmt.Sprintf("%s.%s", database, table)
	}
	std.Printf("%s [IMPORT] user_id=%d ip=%s target=%s format=%s rows=%d",
		timestamp(), userID, ip, target, format, rowCount)
}

// Admin logs administrative actions (drop DB, truncate, etc.)
func Admin(userID int64, ip string, action string, target string) {
	std.Printf("%s [ADMIN] user_id=%d ip=%s action=%s target=%s",
		timestamp(), userID, ip, action, target)
}

// Security logs security-related events (whitelist changes, etc.)
func Security(userID int64, ip string, action string, detail string) {
	std.Printf("%s [SECURITY] user_id=%d ip=%s action=%s detail=%s",
		timestamp(), userID, ip, action, detail)
}
