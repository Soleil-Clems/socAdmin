package service

import (
	"fmt"

	"github.com/soleilouisol/socAdmin/core/connector"
)

type DatabaseService struct {
	conn   connector.Connector
	dbType string
	host   string
	port   int
	user   string
}

func NewDatabaseService() *DatabaseService {
	return &DatabaseService{}
}

func (s *DatabaseService) Connect(host string, port int, user, password, dbType string) error {
	if s.conn != nil {
		s.conn.Close()
	}

	var conn connector.Connector

	switch dbType {
	case "mysql":
		conn = connector.NewMySQLConnector(connector.MySQLConfig{
			Host: host, Port: port, User: user, Password: password,
		})
	case "postgresql":
		conn = connector.NewPostgresConnector(connector.PostgresConfig{
			Host: host, Port: port, User: user, Password: password,
		})
	case "mongodb":
		conn = connector.NewMongoConnector(connector.MongoConfig{
			Host: host, Port: port, User: user, Password: password,
		})
	default:
		return fmt.Errorf("unsupported database type: %s", dbType)
	}

	if err := conn.Connect(); err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}

	s.conn = conn
	s.dbType = dbType
	s.host = host
	s.port = port
	s.user = user
	return nil
}

func (s *DatabaseService) GetType() string {
	return s.dbType
}

func (s *DatabaseService) IsConnected() bool {
	return s.conn != nil
}

type ConnectionInfo struct {
	Host   string `json:"host"`
	Port   int    `json:"port"`
	User   string `json:"user"`
	DbType string `json:"type"`
}

func (s *DatabaseService) GetConnectionInfo() *ConnectionInfo {
	if s.conn == nil {
		return nil
	}
	return &ConnectionInfo{
		Host:   s.host,
		Port:   s.port,
		User:   s.user,
		DbType: s.dbType,
	}
}

func (s *DatabaseService) ListDatabases() ([]string, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	return s.conn.ListDatabases()
}

func (s *DatabaseService) CreateDatabase(name string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	return s.conn.CreateDatabase(name)
}

func (s *DatabaseService) DropDatabase(name string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	return s.conn.DropDatabase(name)
}

func (s *DatabaseService) CreateTable(database, table string, columns []connector.TableColumnDef) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	return s.conn.CreateTable(database, table, columns)
}

func (s *DatabaseService) ListTables(database string) ([]string, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	return s.conn.ListTables(database)
}

func (s *DatabaseService) DescribeTable(database, table string) ([]connector.Column, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	return s.conn.DescribeTable(database, table)
}

func (s *DatabaseService) GetRows(database, table string, limit, offset int) (*connector.QueryResult, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	return s.conn.GetRows(database, table, limit, offset)
}

func (s *DatabaseService) InsertRow(database, table string, data map[string]interface{}) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	return s.conn.InsertRow(database, table, data)
}

func (s *DatabaseService) UpdateRow(database, table string, primaryKey map[string]interface{}, data map[string]interface{}) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	return s.conn.UpdateRow(database, table, primaryKey, data)
}

func (s *DatabaseService) DeleteRow(database, table string, primaryKey map[string]interface{}) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	return s.conn.DeleteRow(database, table, primaryKey)
}

func (s *DatabaseService) ExecuteQuery(database, query string) (*connector.QueryResult, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	return s.conn.ExecuteQuery(database, query)
}

func (s *DatabaseService) DropTable(database, table string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	return s.conn.DropTable(database, table)
}

func (s *DatabaseService) TruncateTable(database, table string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	return s.conn.TruncateTable(database, table)
}

func (s *DatabaseService) Disconnect() error {
	if s.conn != nil {
		err := s.conn.Close()
		s.conn = nil
		s.dbType = ""
		return err
	}
	return nil
}

// ListUsers returns the database server users
func (s *DatabaseService) ListUsers() (*connector.QueryResult, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	switch s.dbType {
	case "mysql":
		return s.conn.ExecuteQuery("", "SELECT User, Host FROM mysql.user ORDER BY User")
	case "postgresql":
		return s.conn.ExecuteQuery("", "SELECT rolname AS \"User\", CASE WHEN rolcanlogin THEN 'Yes' ELSE 'No' END AS \"Can Login\", CASE WHEN rolsuper THEN 'Yes' ELSE 'No' END AS \"Superuser\", CASE WHEN rolcreatedb THEN 'Yes' ELSE 'No' END AS \"Create DB\", CASE WHEN rolcreaterole THEN 'Yes' ELSE 'No' END AS \"Create Role\" FROM pg_roles ORDER BY rolname")
	case "mongodb":
		return s.conn.ExecuteQuery("admin", `{"listUsers": 1}`)
	default:
		return nil, fmt.Errorf("unsupported for this database type")
	}
}

// ServerStatus returns key server status information
func (s *DatabaseService) ServerStatus() (*connector.QueryResult, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	switch s.dbType {
	case "mysql":
		return s.conn.ExecuteQuery("", "SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime','Threads_connected','Questions','Slow_queries','Open_tables','Bytes_received','Bytes_sent','Connections','Aborted_connects','Max_used_connections')")
	case "postgresql":
		return s.conn.ExecuteQuery("", "SELECT name AS \"Variable_name\", setting AS \"Value\" FROM pg_settings WHERE name IN ('max_connections','shared_buffers','work_mem','effective_cache_size','maintenance_work_mem') UNION ALL SELECT 'server_version', version() UNION ALL SELECT 'active_connections', count(*)::text FROM pg_stat_activity WHERE state = 'active'")
	case "mongodb":
		return nil, fmt.Errorf("status not supported for MongoDB")
	default:
		return nil, fmt.Errorf("unsupported for this database type")
	}
}
