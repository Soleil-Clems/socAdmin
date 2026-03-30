package connector

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

type MySQLConfig struct {
	Host     string
	Port     int
	User     string
	Password string
}

type Column struct {
	Name    string
	Type    string
	Null    string
	Key     string
	Default *string
	Extra   string
}

type QueryResult struct {
	Columns []string
	Rows    []map[string]interface{}
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
	return c.executeQuery(query)
}

func (c *MySQLConnector) ExecuteQuery(query string) (*QueryResult, error) {
	return c.executeQuery(query)
}

func (c *MySQLConnector) executeQuery(query string) (*QueryResult, error) {
	rows, err := c.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var results []map[string]interface{}
	for rows.Next() {
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, err
		}

		row := make(map[string]interface{})
		for i, col := range columns {
			val := values[i]
			if b, ok := val.([]byte); ok {
				row[col] = string(b)
			} else {
				row[col] = val
			}
		}
		results = append(results, row)
	}

	return &QueryResult{Columns: columns, Rows: results}, nil
}

func (c *MySQLConnector) Close() error {
	if c.db != nil {
		return c.db.Close()
	}
	return nil
}

func quoteIdentifier(name string) string {
	return "`" + name + "`"
}
