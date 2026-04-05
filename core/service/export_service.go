package service

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// ExportDatabaseSQL exports all tables in a database as a single SQL file
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

// ExportCSV writes table data as CSV to the writer
func (s *DatabaseService) ExportCSV(w io.Writer, database, table string) error {
	result, err := s.conn.GetRows(database, table, 100000, 0)
	if err != nil {
		return err
	}

	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Header
	if err := writer.Write(result.Columns); err != nil {
		return err
	}

	// Rows
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

// ExportJSON writes table data as a JSON array to the writer
func (s *DatabaseService) ExportJSON(w io.Writer, database, table string) error {
	result, err := s.conn.GetRows(database, table, 100000, 0)
	if err != nil {
		return err
	}

	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	return encoder.Encode(result.Rows)
}

// ExportSQL writes table data as INSERT statements to the writer
func (s *DatabaseService) ExportSQL(w io.Writer, database, table string) error {
	columns, err := s.conn.DescribeTable(database, table)
	if err != nil {
		return err
	}

	result, err := s.conn.GetRows(database, table, 100000, 0)
	if err != nil {
		return err
	}

	// CREATE TABLE statement
	fmt.Fprintf(w, "-- Export of %s.%s\n\n", database, table)

	var colDefs []string
	var pks []string
	for _, col := range columns {
		def := fmt.Sprintf("  `%s` %s", col.Name, col.Type)
		if col.Null == "NO" {
			def += " NOT NULL"
		}
		if col.Extra != "" {
			def += " " + col.Extra
		}
		if col.Default != nil {
			def += " DEFAULT " + *col.Default
		}
		colDefs = append(colDefs, def)
		if col.Key == "PRI" {
			pks = append(pks, fmt.Sprintf("`%s`", col.Name))
		}
	}
	if len(pks) > 0 {
		colDefs = append(colDefs, "  PRIMARY KEY ("+strings.Join(pks, ", ")+")")
	}
	fmt.Fprintf(w, "CREATE TABLE IF NOT EXISTS `%s` (\n%s\n);\n\n", table, strings.Join(colDefs, ",\n"))

	if len(result.Rows) == 0 {
		return nil
	}

	// INSERT statements
	quotedCols := make([]string, len(result.Columns))
	for i, col := range result.Columns {
		quotedCols[i] = "`" + col + "`"
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
		fmt.Fprintf(w, "INSERT INTO `%s` (%s) VALUES (%s);\n", table, colList, strings.Join(vals, ", "))
	}

	return nil
}
