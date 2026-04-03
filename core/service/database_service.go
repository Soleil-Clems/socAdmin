package service

import (
	"fmt"

	"github.com/soleilouisol/socAdmin/core/connector"
)

type DatabaseService struct {
	conn     connector.Connector
	dbType   string
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
	return nil
}

func (s *DatabaseService) GetType() string {
	return s.dbType
}

func (s *DatabaseService) IsConnected() bool {
	return s.conn != nil
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
