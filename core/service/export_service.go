package service

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/soleilouisol/socAdmin/core/connector"
	"gopkg.in/yaml.v3"
)

// ── Database-level exports ──────────────────────────────────────────

// ExportDatabaseSQL exports all tables as CREATE + INSERT SQL
func (s *DatabaseService) ExportDatabaseSQL(w io.Writer, database string) error {
	tables, err := s.conn.ListTables(database)
	if err != nil {
		return err
	}

	fmt.Fprintf(w, "-- Export of database: %s\n", database)
	fmt.Fprintf(w, "-- Tables: %d\n\n", len(tables))

	for _, table := range tables {
		if err := s.ExportSQL(w, database, table); err != nil {
			fmt.Fprintf(w, "-- ERROR exporting table %s: %s\n\n", table, err.Error())
			continue
		}
		fmt.Fprintln(w)
	}

	return nil
}

// ExportDatabaseJSON exports all tables as a JSON object { "table_name": [...rows] }
func (s *DatabaseService) ExportDatabaseJSON(w io.Writer, database string) error {
	tables, err := s.conn.ListTables(database)
	if err != nil {
		return err
	}

	data := make(map[string]interface{})
	for _, table := range tables {
		result, err := s.conn.GetRows(database, table, 100000, 0)
		if err != nil {
			data[table] = map[string]string{"error": err.Error()}
			continue
		}
		data[table] = result.Rows
	}

	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	return encoder.Encode(data)
}

// ExportDatabaseCSV exports all tables as CSV blocks separated by headers
func (s *DatabaseService) ExportDatabaseCSV(w io.Writer, database string) error {
	tables, err := s.conn.ListTables(database)
	if err != nil {
		return err
	}

	for i, table := range tables {
		if i > 0 {
			fmt.Fprintln(w)
		}
		fmt.Fprintf(w, "# Table: %s\n", table)
		if err := s.ExportCSV(w, database, table); err != nil {
			fmt.Fprintf(w, "# ERROR: %s\n", err.Error())
		}
	}

	return nil
}

// ExportDatabaseYAML exports all tables as YAML
func (s *DatabaseService) ExportDatabaseYAML(w io.Writer, database string) error {
	tables, err := s.conn.ListTables(database)
	if err != nil {
		return err
	}

	data := make(map[string]interface{})
	for _, table := range tables {
		result, err := s.conn.GetRows(database, table, 100000, 0)
		if err != nil {
			data[table] = map[string]string{"error": err.Error()}
			continue
		}
		data[table] = result.Rows
	}

	return yaml.NewEncoder(w).Encode(data)
}

// ── Table-level exports ─────────────────────────────────────────────

// ExportCSV writes table data as CSV
func (s *DatabaseService) ExportCSV(w io.Writer, database, table string) error {
	result, err := s.conn.GetRows(database, table, 100000, 0)
	if err != nil {
		return err
	}

	writer := csv.NewWriter(w)
	defer writer.Flush()

	if err := writer.Write(result.Columns); err != nil {
		return err
	}

	for _, row := range result.Rows {
		record := make([]string, len(result.Columns))
		for i, col := range result.Columns {
			val := row[col]
			if val == nil {
				record[i] = ""
			} else {
				record[i] = fmt.Sprintf("%v", val)
			}
		}
		if err := writer.Write(record); err != nil {
			return err
		}
	}

	return nil
}

// ExportJSON writes table data as a JSON array
func (s *DatabaseService) ExportJSON(w io.Writer, database, table string) error {
	result, err := s.conn.GetRows(database, table, 100000, 0)
	if err != nil {
		return err
	}

	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	return encoder.Encode(result.Rows)
}

// ExportYAML writes table data as YAML
func (s *DatabaseService) ExportYAML(w io.Writer, database, table string) error {
	result, err := s.conn.GetRows(database, table, 100000, 0)
	if err != nil {
		return err
	}

	return yaml.NewEncoder(w).Encode(result.Rows)
}

// sanitizeColumnExtra strips MySQL information_schema noise from the EXTRA
// column so what remains is valid CREATE TABLE syntax. EXTRA can contain:
//
//	auto_increment                          → keep
//	on update CURRENT_TIMESTAMP             → keep
//	DEFAULT_GENERATED                       → drop (it's a flag meaning "has a DEFAULT")
//	DEFAULT_GENERATED on update CURRENT_TIMESTAMP → keep just the "on update ..." part
//	VIRTUAL GENERATED / STORED GENERATED    → drop (we don't replay generated exprs)
//	INVISIBLE                               → drop (MySQL 8 only, non-standard)
func sanitizeColumnExtra(extra string) string {
	if extra == "" {
		return ""
	}
	// Strip the pure-metadata DEFAULT_GENERATED prefix so "DEFAULT_GENERATED
	// on update CURRENT_TIMESTAMP" becomes "on update CURRENT_TIMESTAMP".
	cleaned := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(extra), "DEFAULT_GENERATED"))
	lower := strings.ToLower(cleaned)
	switch {
	case lower == "" || lower == "default_generated":
		return ""
	case strings.Contains(lower, "generated"):
		// Computed columns — too complex to replay reliably, skip.
		return ""
	case strings.Contains(lower, "invisible"):
		return ""
	}
	return cleaned
}

// formatSQLDefault quotes a default value coming from DescribeTable so it
// is valid inside a CREATE TABLE DEFAULT clause. MySQL returns function
// defaults like CURRENT_TIMESTAMP or NOW() unquoted; literal defaults
// ('foo', 0, '2024-01-01') should be quoted. We detect functions by
// checking for trailing parens or a known keyword list.
func formatSQLDefault(def, colType string) string {
	if def == "" {
		return "''"
	}
	upper := strings.ToUpper(strings.TrimSpace(def))
	// NULL and numeric-looking defaults need no quoting
	if upper == "NULL" {
		return "NULL"
	}
	// Known MySQL default-function names
	functions := []string{
		"CURRENT_TIMESTAMP", "CURRENT_DATE", "CURRENT_TIME",
		"NOW", "UTC_TIMESTAMP", "UTC_DATE", "UTC_TIME", "UUID",
	}
	for _, fn := range functions {
		if upper == fn || strings.HasPrefix(upper, fn+"(") {
			return def
		}
	}
	// If the column type is numeric and the default parses as a number,
	// leave it unquoted.
	if isNumericType(colType) {
		if _, err := fmt.Sscanf(def, "%f", new(float64)); err == nil {
			return def
		}
	}
	// Fall through: treat as a string literal, escape single quotes.
	escaped := strings.ReplaceAll(def, "'", "''")
	return "'" + escaped + "'"
}

// isNumericType returns true for MySQL numeric column types.
func isNumericType(t string) bool {
	lower := strings.ToLower(t)
	prefixes := []string{"int", "tinyint", "smallint", "mediumint", "bigint", "decimal", "numeric", "float", "double", "bit"}
	for _, p := range prefixes {
		if strings.HasPrefix(lower, p) {
			return true
		}
	}
	return false
}

// ExportSQL writes table data as CREATE TABLE + INSERT statements, using
// the SGBD-specific identifier quoting (backticks for MySQL, double
// quotes for Postgres). MongoDB doesn't go through here — use JSON.
func (s *DatabaseService) ExportSQL(w io.Writer, database, table string) error {
	columns, err := s.conn.DescribeTable(database, table)
	if err != nil {
		return err
	}

	result, err := s.conn.GetRows(database, table, 100000, 0)
	if err != nil {
		return err
	}

	q := s.conn.QuoteIdentifier
	// Sniff the connector type once so we can emit SGBD-specific syntax
	// (SERIAL vs auto_increment, skip nextval defaults, etc).
	_, isPostgres := s.conn.(*connector.PostgresConnector)

	fmt.Fprintf(w, "-- Export of %s.%s\n\n", database, table)

	var colDefs []string
	var pks []string
	for _, col := range columns {
		colType := col.Type
		skipDefault := false

		// Postgres identity columns come back as `integer NOT NULL
		// DEFAULT nextval(...)` + extra="auto_increment". None of that
		// is valid in a literal CREATE TABLE — collapse it all to the
		// SERIAL shorthand Postgres already understands.
		if isPostgres && strings.EqualFold(col.Extra, "auto_increment") {
			switch strings.ToLower(colType) {
			case "smallint":
				colType = "SMALLSERIAL"
			case "bigint":
				colType = "BIGSERIAL"
			default:
				colType = "SERIAL"
			}
			skipDefault = true
		}
		// Even for non-identity Postgres columns, a nextval default is
		// always tied to a sequence that doesn't exist in the target DB.
		if isPostgres && col.Default != nil && strings.Contains(strings.ToLower(*col.Default), "nextval(") {
			skipDefault = true
		}

		def := fmt.Sprintf("  %s %s", q(col.Name), colType)
		if col.Null == "NO" {
			def += " NOT NULL"
		}
		// DEFAULT must come before AUTO_INCREMENT / ON UPDATE in MySQL's
		// CREATE TABLE grammar.
		if !skipDefault && col.Default != nil {
			def += " DEFAULT " + formatSQLDefault(*col.Default, colType)
		}
		// Extra is MySQL-specific. For Postgres we already handled the
		// auto_increment case above (→ SERIAL) so skip it entirely.
		if !isPostgres {
			if extra := sanitizeColumnExtra(col.Extra); extra != "" {
				def += " " + extra
			}
		}
		colDefs = append(colDefs, def)
		if col.Key == "PRI" {
			pks = append(pks, q(col.Name))
		}
	}
	if len(pks) > 0 {
		colDefs = append(colDefs, "  PRIMARY KEY ("+strings.Join(pks, ", ")+")")
	}
	fmt.Fprintf(w, "CREATE TABLE IF NOT EXISTS %s (\n%s\n);\n\n", q(table), strings.Join(colDefs, ",\n"))

	if len(result.Rows) == 0 {
		return nil
	}

	quotedCols := make([]string, len(result.Columns))
	for i, col := range result.Columns {
		quotedCols[i] = q(col)
	}
	colList := strings.Join(quotedCols, ", ")

	for _, row := range result.Rows {
		vals := make([]string, len(result.Columns))
		for i, col := range result.Columns {
			val := row[col]
			if val == nil {
				vals[i] = "NULL"
			} else {
				s := fmt.Sprintf("%v", val)
				s = strings.ReplaceAll(s, "'", "''")
				vals[i] = "'" + s + "'"
			}
		}
		fmt.Fprintf(w, "INSERT INTO %s (%s) VALUES (%s);\n", q(table), colList, strings.Join(vals, ", "))
	}

	return nil
}
