package service

import (
	"fmt"

	"github.com/soleilouisol/socAdmin/core/connector"
)

type DatabaseService struct {
	conn *connector.MySQLConnector
}

func NewDatabaseService() *DatabaseService {
	return &DatabaseService{}
}

func (s *DatabaseService) Connect(host string, port int, user, password string) error {
	// Fermer l'ancienne connexion si elle existe
	if s.conn != nil {
		s.conn.Close()
	}

	conn := connector.NewMySQLConnector(connector.MySQLConfig{
		Host:     host,
		Port:     port,
		User:     user,
		Password: password,
	})

	if err := conn.Connect(); err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}

	s.conn = conn
	return nil
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

func (s *DatabaseService) ExecuteQuery(query string) (*connector.QueryResult, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	return s.conn.ExecuteQuery(query)
}

func (s *DatabaseService) Disconnect() error {
	if s.conn != nil {
		err := s.conn.Close()
		s.conn = nil
		return err
	}
	return nil
}
