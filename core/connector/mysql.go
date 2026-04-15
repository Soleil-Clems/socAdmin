package connector

import (
	"database/sql"
	"fmt"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

type MySQLConfig struct {
	Host     string
	Port     int
	User     string
	Password string
}

type MySQLConnector struct {
	db     *sql.DB
	config MySQLConfig
}

func NewMySQLConnector(config MySQLConfig) *MySQLConnector {
	return &MySQLConnector{config: config}
}

func (c *MySQLConnector) Connect() error {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/", c.config.User, c.config.Password, c.config.Host, c.config.Port)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return fmt.Errorf("failed to open connection: %w", err)
	}

	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping MySQL: %w", err)
	}

	c.db = db
	return nil
}

func (c *MySQLConnector) ListDatabases() ([]string, error) {
	rows, err := c.db.Query("SHOW DATABASES")
	if err != nil {
		return nil, fmt.Errorf("failed to list databases: %w", err)
	}
	defer rows.Close()

	var databases []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		databases = append(databases, name)
	}
	return databases, nil
}

func (c *MySQLConnector) CreateDatabase(name string) error {
	_, err := c.db.Exec("CREATE DATABASE " + quoteIdentifier(name))
	return err
}

func (c *MySQLConnector) DropDatabase(name string) error {
	_, err := c.db.Exec("DROP DATABASE " + quoteIdentifier(name))
	return err
}

func (c *MySQLConnector) CreateTable(database string, table string, columns []TableColumnDef) error {
	var colDefs []string
	var pks []string
	for _, col := range columns {
		def := quoteIdentifier(col.Name) + " " + col.Type
		if !col.Nullable {
			def += " NOT NULL"
		}
		if col.AutoIncrement {
			def += " AUTO_INCREMENT"
		}
		if col.DefaultValue != "" {
			def += " DEFAULT " + col.DefaultValue
		}
		colDefs = append(colDefs, def)
		if col.PrimaryKey {
			pks = append(pks, quoteIdentifier(col.Name))
		}
	}
	if len(pks) > 0 {
		colDefs = append(colDefs, "PRIMARY KEY ("+strings.Join(pks, ", ")+")")
	}
	query := fmt.Sprintf("CREATE TABLE %s.%s (\n%s\n)",
		quoteIdentifier(database), quoteIdentifier(table), strings.Join(colDefs, ",\n"))
	_, err := c.db.Exec(query)
	return err
}

func (c *MySQLConnector) ListTables(database string) ([]string, error) {
	rows, err := c.db.Query("SHOW TABLES FROM " + quoteIdentifier(database))
	if err != nil {
		return nil, fmt.Errorf("failed to list tables: %w", err)
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		tables = append(tables, name)
	}
	return tables, nil
}

func (c *MySQLConnector) DescribeTable(database, table string) ([]Column, error) {
	query := fmt.Sprintf("SHOW COLUMNS FROM %s.%s", quoteIdentifier(database), quoteIdentifier(table))
	rows, err := c.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to describe table: %w", err)
	}
	defer rows.Close()

	var columns []Column
	for rows.Next() {
		var col Column
		if err := rows.Scan(&col.Name, &col.Type, &col.Null, &col.Key, &col.Default, &col.Extra); err != nil {
			return nil, err
		}
		columns = append(columns, col)
	}
	return columns, nil
}

func (c *MySQLConnector) GetRows(database, table string, limit, offset int) (*QueryResult, error) {
	query := fmt.Sprintf("SELECT * FROM %s.%s LIMIT %d OFFSET %d",
		quoteIdentifier(database), quoteIdentifier(table), limit, offset)
	return scanQuery(c.db, query)
}

func (c *MySQLConnector) InsertRow(database, table string, data map[string]interface{}) error {
	cols, placeholders, vals := buildInsertSQL(data)
	query := fmt.Sprintf("INSERT INTO %s.%s (%s) VALUES (%s)",
		quoteIdentifier(database), quoteIdentifier(table), cols, placeholders)
	_, err := c.db.Exec(query, vals...)
	return err
}

func (c *MySQLConnector) UpdateRow(database, table string, primaryKey map[string]interface{}, data map[string]interface{}) error {
	setClauses, setVals := buildUpdateSQL(data)
	whereClauses, whereVals := buildWhereSQL(primaryKey)
	query := fmt.Sprintf("UPDATE %s.%s SET %s WHERE %s",
		quoteIdentifier(database), quoteIdentifier(table), setClauses, whereClauses)
	vals := append(setVals, whereVals...)
	_, err := c.db.Exec(query, vals...)
	return err
}

func (c *MySQLConnector) DeleteRow(database, table string, primaryKey map[string]interface{}) error {
	whereClauses, whereVals := buildWhereSQL(primaryKey)
	query := fmt.Sprintf("DELETE FROM %s.%s WHERE %s",
		quoteIdentifier(database), quoteIdentifier(table), whereClauses)
	_, err := c.db.Exec(query, whereVals...)
	return err
}

func (c *MySQLConnector) ExecuteQuery(database, query string) (*QueryResult, error) {
	if database != "" {
		db, err := c.connectToDb(database)
		if err != nil {
			return nil, err
		}
		defer db.Close()
		return scanQuery(db, query)
	}
	return scanQuery(c.db, query)
}

func (c *MySQLConnector) DropTable(database, table string) error {
	query := fmt.Sprintf("DROP TABLE %s.%s", quoteIdentifier(database), quoteIdentifier(table))
	_, err := c.db.Exec(query)
	return err
}

func (c *MySQLConnector) AlterColumn(database, table string, op AlterColumnOp) error {
	qTable := quoteIdentifier(database) + "." + quoteIdentifier(table)
	switch op.Op {
	case "add":
		if op.Name == "" || op.Type == "" {
			return fmt.Errorf("name and type are required")
		}
		if err := validateSQLType(op.Type); err != nil {
			return err
		}
		def := quoteIdentifier(op.Name) + " " + op.Type
		if !op.Nullable {
			def += " NOT NULL"
		}
		if op.DefaultValue != "" {
			def += " DEFAULT " + sanitizeDefault(op.DefaultValue)
		}
		_, err := c.db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s", qTable, def))
		return err
	case "drop":
		if op.Name == "" {
			return fmt.Errorf("name is required")
		}
		_, err := c.db.Exec(fmt.Sprintf("ALTER TABLE %s DROP COLUMN %s", qTable, quoteIdentifier(op.Name)))
		return err
	case "rename":
		if op.Name == "" || op.NewName == "" {
			return fmt.Errorf("name and new_name are required")
		}
		_, err := c.db.Exec(fmt.Sprintf("ALTER TABLE %s RENAME COLUMN %s TO %s",
			qTable, quoteIdentifier(op.Name), quoteIdentifier(op.NewName)))
		return err
	case "modify":
		if op.Name == "" || op.Type == "" {
			return fmt.Errorf("name and type are required")
		}
		if err := validateSQLType(op.Type); err != nil {
			return err
		}
		def := quoteIdentifier(op.Name) + " " + op.Type
		if !op.Nullable {
			def += " NOT NULL"
		}
		if op.DefaultValue != "" {
			def += " DEFAULT " + sanitizeDefault(op.DefaultValue)
		}
		_, err := c.db.Exec(fmt.Sprintf("ALTER TABLE %s MODIFY COLUMN %s", qTable, def))
		return err
	default:
		return fmt.Errorf("unknown operation: %s", op.Op)
	}
}

func (c *MySQLConnector) TruncateTable(database, table string) error {
	query := fmt.Sprintf("TRUNCATE TABLE %s.%s", quoteIdentifier(database), quoteIdentifier(table))
	_, err := c.db.Exec(query)
	return err
}

// QuoteIdentifier wraps a MySQL identifier in backticks.
func (c *MySQLConnector) QuoteIdentifier(name string) string {
	return quoteIdentifier(name)
}

func (c *MySQLConnector) connectToDb(database string) (*sql.DB, error) {
	if err := ValidateIdentifier(database); err != nil {
		return nil, fmt.Errorf("invalid database name: %w", err)
	}
	// multiStatements=true allows us to run an entire SQL dump (or any
	// `;`-separated script) in a single Exec call without naïvely splitting
	// it ourselves — MySQL handles comments, delimiters, strings correctly.
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?multiStatements=true&parseTime=true",
		c.config.User, c.config.Password, c.config.Host, c.config.Port, database)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// ExecuteScript runs a multi-statement SQL script in a single Exec call.
// Requires the per-database connection (which has multiStatements=true).
// Returns 1 on success since MySQL handles the whole script atomically;
// callers wanting per-statement progress should split client-side.
func (c *MySQLConnector) ExecuteScript(database, script string) (int, error) {
	if database == "" {
		return 0, fmt.Errorf("database is required")
	}
	db, err := c.connectToDb(database)
	if err != nil {
		return 0, err
	}
	defer db.Close()

	if _, err := db.Exec(script); err != nil {
		return 0, err
	}
	return 1, nil
}

func buildInsertSQL(data map[string]interface{}) (string, string, []interface{}) {
	var cols []string
	var placeholders []string
	var vals []interface{}
	for k, v := range data {
		cols = append(cols, quoteIdentifier(k))
		placeholders = append(placeholders, "?")
		vals = append(vals, v)
	}
	return strings.Join(cols, ", "), strings.Join(placeholders, ", "), vals
}

func buildUpdateSQL(data map[string]interface{}) (string, []interface{}) {
	var clauses []string
	var vals []interface{}
	for k, v := range data {
		clauses = append(clauses, quoteIdentifier(k)+" = ?")
		vals = append(vals, v)
	}
	return strings.Join(clauses, ", "), vals
}

func buildWhereSQL(pk map[string]interface{}) (string, []interface{}) {
	var clauses []string
	var vals []interface{}
	for k, v := range pk {
		clauses = append(clauses, quoteIdentifier(k)+" = ?")
		vals = append(vals, v)
	}
	return strings.Join(clauses, " AND "), vals
}

func (c *MySQLConnector) Close() error {
	if c.db != nil {
		return c.db.Close()
	}
	return nil
}

// GetConfig returns the raw connection info. Used by external tools (mysqldump).
func (c *MySQLConnector) GetConfig() ConnectionConfig {
	return ConnectionConfig{
		Host:     c.config.Host,
		Port:     c.config.Port,
		User:     c.config.User,
		Password: c.config.Password,
	}
}

func quoteIdentifier(name string) string {
	escaped := strings.ReplaceAll(name, "`", "``")
	return "`" + escaped + "`"
}

// ── Triggers ─────────────────────────────────────────────────────────────

func (c *MySQLConnector) ListTriggers(database string) ([]TriggerInfo, error) {
	db, err := c.connectToDb(database)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, EVENT_MANIPULATION, ACTION_TIMING, ACTION_STATEMENT
		FROM INFORMATION_SCHEMA.TRIGGERS
		WHERE TRIGGER_SCHEMA = ?
		ORDER BY EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION`, database)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var triggers []TriggerInfo
	for rows.Next() {
		var t TriggerInfo
		if err := rows.Scan(&t.Name, &t.Table, &t.Event, &t.Timing, &t.Statement); err != nil {
			return nil, err
		}
		triggers = append(triggers, t)
	}
	return triggers, nil
}

func (c *MySQLConnector) DropTrigger(database, name string) error {
	if err := ValidateIdentifier(name); err != nil {
		return err
	}
	db, err := c.connectToDb(database)
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec("DROP TRIGGER " + quoteIdentifier(name))
	return err
}

// ── Routines (stored procedures & functions) ─────────────────────────────

func (c *MySQLConnector) ListRoutines(database string) ([]RoutineInfo, error) {
	db, err := c.connectToDb(database)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT ROUTINE_NAME, ROUTINE_TYPE, IFNULL(DTD_IDENTIFIER, ''), ROUTINE_DEFINITION, IFNULL(ROUTINE_COMMENT, '')
		FROM INFORMATION_SCHEMA.ROUTINES
		WHERE ROUTINE_SCHEMA = ?
		ORDER BY ROUTINE_TYPE, ROUTINE_NAME`, database)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var routines []RoutineInfo
	for rows.Next() {
		var r RoutineInfo
		var comment string
		if err := rows.Scan(&r.Name, &r.Type, &r.ReturnType, &r.Body, &comment); err != nil {
			return nil, err
		}
		routines = append(routines, r)
	}

	// Get param lists with SHOW CREATE
	for i, r := range routines {
		keyword := "PROCEDURE"
		if r.Type == "FUNCTION" {
			keyword = "FUNCTION"
		}
		row := db.QueryRow("SHOW CREATE " + keyword + " " + quoteIdentifier(r.Name))
		var createName, createSQL, charset, collation string
		if r.Type == "FUNCTION" {
			// SHOW CREATE FUNCTION returns: Function, sql_mode, Create Function, character_set_client, collation_connection, Database Collation
			var sqlMode string
			if err := row.Scan(&createName, &sqlMode, &createSQL, &charset, &collation, &collation); err == nil {
				routines[i].Body = createSQL
			}
		} else {
			var sqlMode string
			if err := row.Scan(&createName, &sqlMode, &createSQL, &charset, &collation, &collation); err == nil {
				routines[i].Body = createSQL
			}
		}
	}

	return routines, nil
}

func (c *MySQLConnector) DropRoutine(database, name, routineType string) error {
	if err := ValidateIdentifier(name); err != nil {
		return err
	}
	keyword := "PROCEDURE"
	if strings.ToUpper(routineType) == "FUNCTION" {
		keyword = "FUNCTION"
	}
	db, err := c.connectToDb(database)
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec("DROP " + keyword + " IF EXISTS " + quoteIdentifier(name))
	return err
}

// ── Table Maintenance ────────────────────────────────────────────────────

func (c *MySQLConnector) MaintenanceTable(database, table, operation string) (string, error) {
	if err := ValidateIdentifier(table); err != nil {
		return "", err
	}
	allowed := map[string]bool{"OPTIMIZE": true, "REPAIR": true, "CHECK": true, "ANALYZE": true}
	op := strings.ToUpper(operation)
	if !allowed[op] {
		return "", fmt.Errorf("invalid operation: %s", operation)
	}

	db, err := c.connectToDb(database)
	if err != nil {
		return "", err
	}
	defer db.Close()

	rows, err := db.Query(op + " TABLE " + quoteIdentifier(table))
	if err != nil {
		return "", err
	}
	defer rows.Close()

	// MySQL returns: Table, Op, Msg_type, Msg_text
	var results []string
	for rows.Next() {
		var tbl, opName, msgType, msgText string
		if err := rows.Scan(&tbl, &opName, &msgType, &msgText); err != nil {
			continue
		}
		results = append(results, fmt.Sprintf("%s: %s", msgType, msgText))
	}
	return strings.Join(results, "; "), nil
}
