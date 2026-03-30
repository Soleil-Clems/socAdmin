package connector

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
)

type PostgresConfig struct {
	Host     string
	Port     int
	User     string
	Password string
}

type PostgresConnector struct {
	db     *sql.DB
	config PostgresConfig
}

func NewPostgresConnector(config PostgresConfig) *PostgresConnector {
	return &PostgresConnector{config: config}
}

func (c *PostgresConnector) Connect() error {
	dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s sslmode=disable",
		c.config.Host, c.config.Port, c.config.User, c.config.Password)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("failed to open connection: %w", err)
	}

	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping PostgreSQL: %w", err)
	}

	c.db = db
	return nil
}

func (c *PostgresConnector) ListDatabases() ([]string, error) {
	rows, err := c.db.Query("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")
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

func (c *PostgresConnector) ListTables(database string) ([]string, error) {
	// PostgreSQL nécessite une connexion à la DB spécifique
	db, err := c.connectToDb(database)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT table_name FROM information_schema.tables
		WHERE table_schema = 'public'
		ORDER BY table_name
	`)
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

func (c *PostgresConnector) DescribeTable(database, table string) ([]Column, error) {
	db, err := c.connectToDb(database)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT
			c.column_name,
			c.data_type,
			c.is_nullable,
			COALESCE(
				(SELECT 'PRI' FROM information_schema.table_constraints tc
				 JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
				 WHERE tc.table_name = c.table_name AND kcu.column_name = c.column_name
				 AND tc.constraint_type = 'PRIMARY KEY' LIMIT 1),
				''
			) as key,
			c.column_default,
			CASE WHEN c.is_identity = 'YES' THEN 'auto_increment' ELSE '' END as extra
		FROM information_schema.columns c
		WHERE c.table_schema = 'public' AND c.table_name = $1
		ORDER BY c.ordinal_position
	`, table)
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

func (c *PostgresConnector) GetRows(database, table string, limit, offset int) (*QueryResult, error) {
	db, err := c.connectToDb(database)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	query := fmt.Sprintf(`SELECT * FROM "%s" LIMIT %d OFFSET %d`, table, limit, offset)
	return scanQuery(db, query)
}

func (c *PostgresConnector) ExecuteQuery(query string) (*QueryResult, error) {
	return scanQuery(c.db, query)
}

func (c *PostgresConnector) Close() error {
	if c.db != nil {
		return c.db.Close()
	}
	return nil
}

func (c *PostgresConnector) connectToDb(database string) (*sql.DB, error) {
	dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		c.config.Host, c.config.Port, c.config.User, c.config.Password, database)
	return sql.Open("postgres", dsn)
}

// scanQuery est partagé entre MySQL et PostgreSQL (même interface database/sql)
func scanQuery(db *sql.DB, query string) (*QueryResult, error) {
	rows, err := db.Query(query)
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
