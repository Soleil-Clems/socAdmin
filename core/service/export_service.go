// @soleil-clems: Service - Import/Export (CSV, JSON, SQL, YAML)
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
func (s *DatabaseService) ExportDatabaseSQL(userID int64, w io.Writer, database string) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	tables, err := c.ListTables(database)
	if err != nil {
		return err
	}

	fmt.Fprintf(w, "-- Export of database: %s\n", database)
	fmt.Fprintf(w, "-- Tables: %d\n\n", len(tables))

	for _, table := range tables {
		if err := s.ExportSQL(userID, w, database, table); err != nil {
			fmt.Fprintf(w, "-- ERROR exporting table %s: %s\n\n", table, err.Error())
			continue
		}
		fmt.Fprintln(w)
	}

	return nil
}

// ExportDatabaseJSON exports all tables as a JSON object { "table_name": [...rows] }
func (s *DatabaseService) ExportDatabaseJSON(userID int64, w io.Writer, database string) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	tables, err := c.ListTables(database)
	if err != nil {
		return err
	}

	data := make(map[string]interface{})
	for _, table := range tables {
		result, err := c.GetRows(database, table, 100000, 0)
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
func (s *DatabaseService) ExportDatabaseCSV(userID int64, w io.Writer, database string) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	tables, err := c.ListTables(database)
	if err != nil {
		return err
	}

	for i, table := range tables {
		if i > 0 {
			fmt.Fprintln(w)
		}
		fmt.Fprintf(w, "# Table: %s\n", table)
		if err := s.ExportCSV(userID, w, database, table); err != nil {
			fmt.Fprintf(w, "# ERROR: %s\n", err.Error())
		}
	}

	return nil
}

// ExportDatabaseYAML exports all tables as YAML
func (s *DatabaseService) ExportDatabaseYAML(userID int64, w io.Writer, database string) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	tables, err := c.ListTables(database)
	if err != nil {
		return err
	}

	data := make(map[string]interface{})
	for _, table := range tables {
		result, err := c.GetRows(database, table, 100000, 0)
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
func (s *DatabaseService) ExportCSV(userID int64, w io.Writer, database, table string) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	result, err := c.GetRows(database, table, 100000, 0)
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
func (s *DatabaseService) ExportJSON(userID int64, w io.Writer, database, table string) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	result, err := c.GetRows(database, table, 100000, 0)
	if err != nil {
		return err
	}

	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	return encoder.Encode(result.Rows)
}

// ExportYAML writes table data as YAML
func (s *DatabaseService) ExportYAML(userID int64, w io.Writer, database, table string) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	result, err := c.GetRows(database, table, 100000, 0)
	if err != nil {
		return err
	}

	return yaml.NewEncoder(w).Encode(result.Rows)
}

// sanitizeColumnExtra strips MySQL information_schema noise from the EXTRA
// column so what remains is valid CREATE TABLE syntax.
func sanitizeColumnExtra(extra string) string {
	if extra == "" {
		return ""
	}
	cleaned := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(extra), "DEFAULT_GENERATED"))
	lower := strings.ToLower(cleaned)
	switch {
	case lower == "" || lower == "default_generated":
		return ""
	case strings.Contains(lower, "generated"):
		return ""
	case strings.Contains(lower, "invisible"):
		return ""
	}
	return cleaned
}

func formatSQLDefault(def, colType string) string {
	if def == "" {
		return "''"
	}
	upper := strings.ToUpper(strings.TrimSpace(def))
	if upper == "NULL" {
		return "NULL"
	}
	functions := []string{
		"CURRENT_TIMESTAMP", "CURRENT_DATE", "CURRENT_TIME",
		"NOW", "UTC_TIMESTAMP", "UTC_DATE", "UTC_TIME", "UUID",
	}
	for _, fn := range functions {
		if upper == fn || strings.HasPrefix(upper, fn+"(") {
			return def
		}
	}
	if isNumericType(colType) {
		if _, err := fmt.Sscanf(def, "%f", new(float64)); err == nil {
			return def
		}
	}
	escaped := strings.ReplaceAll(def, "'", "''")
	return "'" + escaped + "'"
}

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

// ExportSQL writes table data as CREATE TABLE + INSERT statements.
func (s *DatabaseService) ExportSQL(userID int64, w io.Writer, database, table string) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	columns, err := c.DescribeTable(database, table)
	if err != nil {
		return err
	}

	result, err := c.GetRows(database, table, 100000, 0)
	if err != nil {
		return err
	}

	q := c.QuoteIdentifier
	_, isPostgres := c.(*connector.PostgresConnector)

	fmt.Fprintf(w, "-- Export of %s.%s\n\n", database, table)

	var colDefs []string
	var pks []string
	for _, col := range columns {
		colType := col.Type
		skipDefault := false

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
		if isPostgres && col.Default != nil && strings.Contains(strings.ToLower(*col.Default), "nextval(") {
			skipDefault = true
		}

		def := fmt.Sprintf("  %s %s", q(col.Name), colType)
		if col.Null == "NO" {
			def += " NOT NULL"
		}
		if !skipDefault && col.Default != nil {
			def += " DEFAULT " + formatSQLDefault(*col.Default, colType)
		}
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
				sv := fmt.Sprintf("%v", val)
				sv = strings.ReplaceAll(sv, "'", "''")
				vals[i] = "'" + sv + "'"
			}
		}
		fmt.Fprintf(w, "INSERT INTO %s (%s) VALUES (%s);\n", q(table), colList, strings.Join(vals, ", "))
	}

	return nil
}
