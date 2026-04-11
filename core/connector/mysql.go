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

func (c *MySQLConnector) connectToDb(database string) (*sql.DB, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s",
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
