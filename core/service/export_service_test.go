package service

import "testing"

func TestSanitizeColumnExtra(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"", ""},
		{"auto_increment", "auto_increment"},
		{"on update CURRENT_TIMESTAMP", "on update CURRENT_TIMESTAMP"},
		{"DEFAULT_GENERATED", ""},
		{"DEFAULT_GENERATED on update CURRENT_TIMESTAMP", "on update CURRENT_TIMESTAMP"},
		{"VIRTUAL GENERATED", ""},
		{"STORED GENERATED", ""},
		{"INVISIBLE", ""},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := sanitizeColumnExtra(tt.input)
			if got != tt.want {
				t.Errorf("sanitizeColumnExtra(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestFormatSQLDefault(t *testing.T) {
	tests := []struct {
		def     string
		colType string
		want    string
	}{
		{"", "varchar", "''"},
		{"NULL", "varchar", "NULL"},
		{"CURRENT_TIMESTAMP", "datetime", "CURRENT_TIMESTAMP"},
		{"NOW()", "datetime", "NOW()"},
		{"UTC_TIMESTAMP", "datetime", "UTC_TIMESTAMP"},
		{"42", "INT", "42"},
		{"3.14", "DECIMAL(10,2)", "3.14"},
		{"hello", "varchar", "'hello'"},
		{"it's", "varchar", "'it''s'"},
		{"0", "INT", "0"},
		{"-1", "BIGINT", "-1"},
		{"some text", "TEXT", "'some text'"},
	}
	for _, tt := range tests {
		t.Run(tt.def+"_"+tt.colType, func(t *testing.T) {
			got := formatSQLDefault(tt.def, tt.colType)
			if got != tt.want {
				t.Errorf("formatSQLDefault(%q, %q) = %q, want %q", tt.def, tt.colType, got, tt.want)
			}
		})
	}
}

func TestIsNumericType(t *testing.T) {
	numeric := []string{"INT", "int", "BIGINT", "tinyint", "DECIMAL(10,2)", "float", "double", "bit"}
	for _, typ := range numeric {
		if !isNumericType(typ) {
			t.Errorf("isNumericType(%q) = false, want true", typ)
		}
	}

	nonNumeric := []string{"VARCHAR(255)", "TEXT", "DATETIME", "BLOB", "BOOLEAN"}
	for _, typ := range nonNumeric {
		if isNumericType(typ) {
			t.Errorf("isNumericType(%q) = true, want false", typ)
		}
	}
}
