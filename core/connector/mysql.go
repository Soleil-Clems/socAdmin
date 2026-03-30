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

func (c *MySQLConnector) Close() error {
	if c.db != nil {
		return c.db.Close()
	}
	return nil
}
