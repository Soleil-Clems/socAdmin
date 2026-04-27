// @soleil-clems: Connector - SQL injection prevention (identifier validation)
package connector

import (
	"fmt"
	"regexp"
	"strings"
)

// identPattern is strict: ASCII letters, digits, underscore, hyphen, period.
// No spaces (prevents DSN injection), no unicode homoglyphes, max 128 chars.
var identPattern = regexp.MustCompile(`^[a-zA-Z0-9_][a-zA-Z0-9_\-.]{0,127}$`)

func ValidateIdentifier(name string) error {
	if name == "" {
		return fmt.Errorf("identifier cannot be empty")
	}
	if !identPattern.MatchString(name) {
		return fmt.Errorf("invalid identifier %q: only ASCII letters, digits, underscores, hyphens, and periods are allowed (no spaces)", name)
	}
	return nil
}

// validateSQLType checks that a SQL type string doesn't contain injection payloads.
// It allows a base type keyword followed by optional parenthesized parameters.
var sqlTypePattern = regexp.MustCompile(`(?i)^[A-Z][A-Z0-9_ ]*(\([0-9, ]+\))?$`)

func validateSQLType(t string) error {
	t = strings.TrimSpace(t)
	if t == "" {
		return fmt.Errorf("type cannot be empty")
	}
	if !sqlTypePattern.MatchString(t) {
		return fmt.Errorf("invalid column type %q", t)
	}
	// Block if it contains SQL keywords that suggest injection
	upper := strings.ToUpper(t)
	for _, kw := range []string{"DROP", "DELETE", "INSERT", "UPDATE", "SELECT", "ALTER", "EXEC", "UNION", "--", ";"} {
		if strings.Contains(upper, kw) {
			return fmt.Errorf("invalid column type %q: contains forbidden keyword", t)
		}
	}
	return nil
}

// sanitizeDefault wraps a default value as a single-quoted SQL literal,
// escaping embedded single quotes to prevent injection.
// Reserved SQL defaults (CURRENT_TIMESTAMP, NULL, TRUE, FALSE, integers) are passed through.
func sanitizeDefault(val string) string {
	val = strings.TrimSpace(val)
	upper := strings.ToUpper(val)

	// Allow well-known SQL constants
	switch upper {
	case "NULL", "TRUE", "FALSE", "CURRENT_TIMESTAMP", "CURRENT_DATE", "NOW()":
		return upper
	}

	// Allow plain integers/decimals
	if regexp.MustCompile(`^-?[0-9]+(\.[0-9]+)?$`).MatchString(val) {
		return val
	}

	// Everything else → quote as string literal with escaped single quotes
	escaped := strings.ReplaceAll(val, "'", "''")
	return "'" + escaped + "'"
}
