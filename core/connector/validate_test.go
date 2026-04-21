package connector

import (
	"strings"
	"testing"
)

func TestValidateIdentifier(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"simple", "users", false},
		{"with underscore", "user_accounts", false},
		{"with hyphen", "my-database", false},
		{"with period", "db.table", false},
		{"with digits", "table123", false},
		{"starts with digit", "123table", false},
		{"empty", "", true},
		{"has space", "my table", true},
		{"has semicolon", "users;DROP", true},
		{"has quote", "users'", true},
		{"has backtick", "users`", true},
		{"has parenthesis", "users()", true},
		{"unicode", "données", true},
		{"too long", string(make([]byte, 129)), true},
		{"max length", strings.Repeat("a", 128), false},
		{"starts with underscore", "_hidden", false},
		{"starts with hyphen", "-bad", true},
		{"sql injection attempt", "users; DROP TABLE users--", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateIdentifier(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateIdentifier(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
		})
	}
}

func TestValidateSQLType(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"varchar", "VARCHAR(255)", false},
		{"int", "INT", false},
		{"bigint", "BIGINT", false},
		{"decimal", "DECIMAL(10, 2)", false},
		{"timestamp", "TIMESTAMP", false},
		{"empty", "", true},
		{"drop injection", "INT; DROP TABLE users", true},
		{"select injection", "VARCHAR(255) SELECT", true},
		{"union injection", "INT UNION", true},
		{"comment injection", "INT --comment", true},
		{"semicolon", "INT;", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateSQLType(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateSQLType(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
		})
	}
}

func TestSanitizeDefault(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"NULL", "NULL"},
		{"null", "NULL"},
		{"TRUE", "TRUE"},
		{"FALSE", "FALSE"},
		{"CURRENT_TIMESTAMP", "CURRENT_TIMESTAMP"},
		{"NOW()", "NOW()"},
		{"42", "42"},
		{"-1", "-1"},
		{"3.14", "3.14"},
		{"hello", "'hello'"},
		{"it's", "'it''s'"},
		{"Robert'; DROP TABLE--", "'Robert''; DROP TABLE--'"},
		{"", "''"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := sanitizeDefault(tt.input)
			if got != tt.want {
				t.Errorf("sanitizeDefault(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
