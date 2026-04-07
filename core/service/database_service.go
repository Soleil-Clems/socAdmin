package service

import (
	"fmt"
	"strings"

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

// ListDatabasesWithStats returns databases with table count and size info.
func (s *DatabaseService) ListDatabasesWithStats() ([]connector.DatabaseInfo, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}

	switch s.dbType {
	case "mysql":
		return s.mysqlDatabaseStats()
	case "postgresql":
		return s.postgresDatabaseStats()
	case "mongodb":
		return s.mongoDatabaseStats()
	default:
		// Fallback: just names, no stats
		names, err := s.conn.ListDatabases()
		if err != nil {
			return nil, err
		}
		infos := make([]connector.DatabaseInfo, len(names))
		for i, n := range names {
			infos[i] = connector.DatabaseInfo{Name: n}
		}
		return infos, nil
	}
}

func (s *DatabaseService) mysqlDatabaseStats() ([]connector.DatabaseInfo, error) {
	result, err := s.conn.ExecuteQuery("", `
		SELECT
			s.SCHEMA_NAME,
			COUNT(t.TABLE_NAME) AS table_count,
			COALESCE(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) AS size_bytes
		FROM information_schema.SCHEMATA s
		LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = s.SCHEMA_NAME
		GROUP BY s.SCHEMA_NAME
		ORDER BY s.SCHEMA_NAME
	`)
	if err != nil {
		return nil, err
	}
	infos := make([]connector.DatabaseInfo, 0, len(result.Rows))
	for _, row := range result.Rows {
		name := fmt.Sprintf("%v", row["SCHEMA_NAME"])
		tc := toInt64(row["table_count"])
		sb := toInt64(row["size_bytes"])
		infos = append(infos, connector.DatabaseInfo{
			Name:       name,
			TableCount: int(tc),
			Size:       formatBytes(sb),
			SizeBytes:  sb,
		})
	}
	return infos, nil
}

func (s *DatabaseService) postgresDatabaseStats() ([]connector.DatabaseInfo, error) {
	result, err := s.conn.ExecuteQuery("", `
		SELECT
			d.datname AS name,
			pg_database_size(d.datname) AS size_bytes
		FROM pg_database d
		WHERE d.datistemplate = false
		ORDER BY d.datname
	`)
	if err != nil {
		return nil, err
	}
	infos := make([]connector.DatabaseInfo, 0, len(result.Rows))
	for _, row := range result.Rows {
		name := fmt.Sprintf("%v", row["name"])
		sb := toInt64(row["size_bytes"])
		// Table count requires per-DB connection, get it from ListTables
		tables, _ := s.conn.ListTables(name)
		infos = append(infos, connector.DatabaseInfo{
			Name:       name,
			TableCount: len(tables),
			Size:       formatBytes(sb),
			SizeBytes:  sb,
		})
	}
	return infos, nil
}

func (s *DatabaseService) mongoDatabaseStats() ([]connector.DatabaseInfo, error) {
	names, err := s.conn.ListDatabases()
	if err != nil {
		return nil, err
	}
	infos := make([]connector.DatabaseInfo, 0, len(names))
	for _, name := range names {
		tables, _ := s.conn.ListTables(name)
		// MongoDB doesn't have a simple size query via the Connector interface
		infos = append(infos, connector.DatabaseInfo{
			Name:       name,
			TableCount: len(tables),
		})
	}
	return infos, nil
}

func toInt64(v interface{}) int64 {
	switch val := v.(type) {
	case int64:
		return val
	case float64:
		return int64(val)
	case int:
		return int64(val)
	case string:
		var n int64
		fmt.Sscanf(val, "%d", &n)
		return n
	default:
		return 0
	}
}

func formatBytes(b int64) string {
	if b == 0 {
		return "0 B"
	}
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
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

func (s *DatabaseService) AlterColumn(database, table string, op connector.AlterColumnOp) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	return s.conn.AlterColumn(database, table, op)
}

func (s *DatabaseService) TruncateTable(database, table string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	return s.conn.TruncateTable(database, table)
}

// SearchGlobalResult represents search results from one table.
type SearchGlobalResult struct {
	Table    string                   `json:"table"`
	Matches  []map[string]interface{} `json:"matches"`
	Total    int                      `json:"total"`
	Columns  []string                 `json:"columns"`
}

// SearchGlobal searches for a term across all tables/collections in a database.
func (s *DatabaseService) SearchGlobal(database, query string, limit int) ([]SearchGlobalResult, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}

	tables, err := s.conn.ListTables(database)
	if err != nil {
		return nil, err
	}

	var results []SearchGlobalResult

	for _, table := range tables {
		cols, err := s.conn.DescribeTable(database, table)
		if err != nil {
			continue
		}

		// Build a search query based on SGBD type
		var searchQuery string
		colNames := make([]string, len(cols))
		for i, c := range cols {
			colNames[i] = c.Name
		}

		switch s.dbType {
		case "mysql":
			// CONCAT_WS all columns and LIKE search
			var castCols []string
			for _, c := range cols {
				castCols = append(castCols, fmt.Sprintf("COALESCE(CAST(`%s` AS CHAR),'')", c.Name))
			}
			searchQuery = fmt.Sprintf(
				"SELECT * FROM `%s`.`%s` WHERE CONCAT_WS(' ',%s) LIKE '%%%s%%' LIMIT %d",
				database, table, joinStrings(castCols, ","), escapeLike(query), limit,
			)
		case "postgresql":
			var castCols []string
			for _, c := range cols {
				castCols = append(castCols, fmt.Sprintf(`COALESCE("%s"::text,'')`, c.Name))
			}
			searchQuery = fmt.Sprintf(
				`SELECT * FROM "%s".public."%s" WHERE CONCAT_WS(' ',%s) ILIKE '%%%s%%' LIMIT %d`,
				database, table, joinStrings(castCols, ","), escapeLike(query), limit,
			)
		case "mongodb":
			// For MongoDB, search via regex on all string fields
			result, err := s.conn.GetRows(database, table, 100, 0)
			if err != nil {
				continue
			}
			var matches []map[string]interface{}
			lowerQ := fmt.Sprintf("%v", query)
			for _, row := range result.Rows {
				for _, v := range row {
					s := fmt.Sprintf("%v", v)
					if containsCI(s, lowerQ) {
						matches = append(matches, row)
						break
					}
				}
				if len(matches) >= limit {
					break
				}
			}
			if len(matches) > 0 {
				results = append(results, SearchGlobalResult{
					Table:   table,
					Matches: matches,
					Total:   len(matches),
					Columns: colNames,
				})
			}
			continue
		default:
			continue
		}

		// Execute SQL search
		result, err := s.conn.ExecuteQuery(database, searchQuery)
		if err != nil {
			continue
		}

		if len(result.Rows) > 0 {
			results = append(results, SearchGlobalResult{
				Table:   table,
				Matches: result.Rows,
				Total:   len(result.Rows),
				Columns: result.Columns,
			})
		}
	}

	return results, nil
}

func joinStrings(strs []string, sep string) string {
	result := ""
	for i, s := range strs {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}

func escapeLike(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "%", "\\%")
	s = strings.ReplaceAll(s, "_", "\\_")
	s = strings.ReplaceAll(s, "'", "''")
	return s
}

func containsCI(s, substr string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(substr))
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
		if mc, ok := s.conn.(*connector.MongoConnector); ok {
			return mc.ListUsers()
		}
		return nil, fmt.Errorf("unexpected connector type")
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
		if mc, ok := s.conn.(*connector.MongoConnector); ok {
			return mc.ServerStatus()
		}
		return nil, fmt.Errorf("unexpected connector type")
	default:
		return nil, fmt.Errorf("unsupported for this database type")
	}
}
