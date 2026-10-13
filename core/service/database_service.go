// @soleil-clems: Service - Database operations (CRUD, backup, connectors)
package service

import (
	"context"
	"fmt"
	"io"
	"strings"
	"sync"

	"github.com/soleilouisol/socAdmin/core/backup"
	"github.com/soleilouisol/socAdmin/core/connector"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func toBsonMSlice(roles []map[string]interface{}) []bson.M {
	out := make([]bson.M, len(roles))
	for i, r := range roles {
		out[i] = bson.M(r)
	}
	return out
}

// PreconfiguredDB holds connection info from env vars (Docker compose).
type PreconfiguredDB struct {
	Type     string `json:"type"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string
}

type userSession struct {
	conn   connector.Connector
	dbType string
	host   string
	port   int
	user   string
}

type DatabaseService struct {
	mu            sync.RWMutex
	sessions      map[int64]*userSession
	preconfigured []PreconfiguredDB
}

func NewDatabaseService() *DatabaseService {
	return &DatabaseService{
		sessions: make(map[int64]*userSession),
	}
}

// SetPreconfigured stores DB configs from env vars.
func (s *DatabaseService) SetPreconfigured(configs []PreconfiguredDB) {
	s.preconfigured = configs
}

// ListPreconfigured returns the pre-configured connections (without passwords).
func (s *DatabaseService) ListPreconfigured() []PreconfiguredDB {
	return s.preconfigured
}

func (s *DatabaseService) Connect(userID int64, host string, port int, user, password, dbType string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if sess := s.sessions[userID]; sess != nil {
		sess.conn.Close()
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

	s.sessions[userID] = &userSession{
		conn:   conn,
		dbType: dbType,
		host:   host,
		port:   port,
		user:   user,
	}
	return nil
}

func (s *DatabaseService) GetType(userID int64) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if sess := s.sessions[userID]; sess != nil {
		return sess.dbType
	}
	return ""
}

func (s *DatabaseService) IsConnected(userID int64) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sessions[userID] != nil
}

type ConnectionInfo struct {
	Host   string `json:"host"`
	Port   int    `json:"port"`
	User   string `json:"user"`
	DbType string `json:"type"`
}

func (s *DatabaseService) GetConnectionInfo(userID int64) *ConnectionInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess := s.sessions[userID]
	if sess == nil {
		return nil
	}
	return &ConnectionInfo{
		Host:   sess.host,
		Port:   sess.port,
		User:   sess.user,
		DbType: sess.dbType,
	}
}

func (s *DatabaseService) getSession(userID int64) (*userSession, error) {
	s.mu.RLock()
	sess := s.sessions[userID]
	s.mu.RUnlock()
	if sess == nil {
		return nil, fmt.Errorf("not connected")
	}
	return sess, nil
}

func (s *DatabaseService) getConn(userID int64) (connector.Connector, error) {
	sess, err := s.getSession(userID)
	if err != nil {
		return nil, err
	}
	return sess.conn, nil
}

func (s *DatabaseService) getMongoConn(userID int64) (*connector.MongoConnector, error) {
	sess, err := s.getSession(userID)
	if err != nil {
		return nil, err
	}
	mc, ok := sess.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc, nil
}

func (s *DatabaseService) BackupDatabase(userID int64, dbName string, w io.Writer) error {
	sess, err := s.getSession(userID)
	if err != nil {
		return err
	}
	cfg := sess.conn.GetConfig()
	return backup.Backup(sess.dbType, cfg, dbName, w)
}

func (s *DatabaseService) RestoreDatabase(userID int64, dbName string, r io.Reader) error {
	sess, err := s.getSession(userID)
	if err != nil {
		return err
	}
	cfg := sess.conn.GetConfig()
	return backup.Restore(sess.dbType, cfg, dbName, r)
}

// BackupBinariesAvailable returns a map[dbType]bool indicating whether
// the dump binary for each SGBD is installed on this machine.
func (s *DatabaseService) BackupBinariesAvailable() map[string]bool {
	return backup.CheckBinaries()
}

func (s *DatabaseService) BackupFormat(userID int64) backup.Format {
	sess, _ := s.getSession(userID)
	if sess == nil {
		return backup.FormatFor("")
	}
	return backup.FormatFor(sess.dbType)
}

func (s *DatabaseService) ListDatabases(userID int64) ([]string, error) {
	c, err := s.getConn(userID)
	if err != nil {
		return nil, err
	}
	return c.ListDatabases()
}

func (s *DatabaseService) ListDatabasesWithStats(userID int64) ([]connector.DatabaseInfo, error) {
	sess, err := s.getSession(userID)
	if err != nil {
		return nil, err
	}

	switch sess.dbType {
	case "mysql":
		return s.mysqlDatabaseStats(userID)
	case "postgresql":
		return s.postgresDatabaseStats(userID)
	case "mongodb":
		return s.mongoDatabaseStats(userID)
	default:
		names, err := sess.conn.ListDatabases()
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

func (s *DatabaseService) mysqlDatabaseStats(userID int64) ([]connector.DatabaseInfo, error) {
	c, err := s.getConn(userID)
	if err != nil {
		return nil, err
	}
	result, err := c.ExecuteQuery("", `
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

func (s *DatabaseService) postgresDatabaseStats(userID int64) ([]connector.DatabaseInfo, error) {
	c, err := s.getConn(userID)
	if err != nil {
		return nil, err
	}
	result, err := c.ExecuteQuery("", `
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
		tables, _ := c.ListTables(name)
		infos = append(infos, connector.DatabaseInfo{
			Name:       name,
			TableCount: len(tables),
			Size:       formatBytes(sb),
			SizeBytes:  sb,
		})
	}
	return infos, nil
}

func (s *DatabaseService) mongoDatabaseStats(userID int64) ([]connector.DatabaseInfo, error) {
	c, err := s.getConn(userID)
	if err != nil {
		return nil, err
	}
	names, err := c.ListDatabases()
	if err != nil {
		return nil, err
	}
	infos := make([]connector.DatabaseInfo, 0, len(names))
	for _, name := range names {
		tables, _ := c.ListTables(name)
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

func (s *DatabaseService) CreateDatabase(userID int64, name string) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	return c.CreateDatabase(name)
}

func (s *DatabaseService) DropDatabase(userID int64, name string) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	return c.DropDatabase(name)
}

func (s *DatabaseService) CreateTable(userID int64, database, table string, columns []connector.TableColumnDef) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	return c.CreateTable(database, table, columns)
}

func (s *DatabaseService) ListTables(userID int64, database string) ([]string, error) {
	c, err := s.getConn(userID)
	if err != nil {
		return nil, err
	}
	return c.ListTables(database)
}

func (s *DatabaseService) DescribeTable(userID int64, database, table string) ([]connector.Column, error) {
	c, err := s.getConn(userID)
	if err != nil {
		return nil, err
	}
	return c.DescribeTable(database, table)
}

func (s *DatabaseService) GetRows(userID int64, database, table string, limit, offset int) (*connector.QueryResult, error) {
	c, err := s.getConn(userID)
	if err != nil {
		return nil, err
	}
	return c.GetRows(database, table, limit, offset)
}

func (s *DatabaseService) InsertRow(userID int64, database, table string, data map[string]interface{}) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	return c.InsertRow(database, table, data)
}

func (s *DatabaseService) UpdateRow(userID int64, database, table string, primaryKey map[string]interface{}, data map[string]interface{}) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	return c.UpdateRow(database, table, primaryKey, data)
}

func (s *DatabaseService) DeleteRow(userID int64, database, table string, primaryKey map[string]interface{}) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	return c.DeleteRow(database, table, primaryKey)
}

func (s *DatabaseService) ExecuteQuery(userID int64, database, query string) (*connector.QueryResult, error) {
	c, err := s.getConn(userID)
	if err != nil {
		return nil, err
	}
	return c.ExecuteQuery(database, query)
}

func (s *DatabaseService) ExecuteScript(userID int64, database, script string) (int, error) {
	c, err := s.getConn(userID)
	if err != nil {
		return 0, err
	}
	return c.ExecuteScript(database, script)
}

func (s *DatabaseService) DropTable(userID int64, database, table string) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	return c.DropTable(database, table)
}

func (s *DatabaseService) AlterColumn(userID int64, database, table string, op connector.AlterColumnOp) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	return c.AlterColumn(database, table, op)
}

func (s *DatabaseService) TruncateTable(userID int64, database, table string) error {
	c, err := s.getConn(userID)
	if err != nil {
		return err
	}
	return c.TruncateTable(database, table)
}

// SearchGlobalResult represents search results from one table.
type SearchGlobalResult struct {
	Table   string                   `json:"table"`
	Matches []map[string]interface{} `json:"matches"`
	Total   int                      `json:"total"`
	Columns []string                 `json:"columns"`
}

func (s *DatabaseService) SearchGlobal(userID int64, database, query string, limit int) ([]SearchGlobalResult, error) {
	sess, err := s.getSession(userID)
	if err != nil {
		return nil, err
	}
	c := sess.conn
	dt := sess.dbType

	tables, err := c.ListTables(database)
	if err != nil {
		return nil, err
	}

	var results []SearchGlobalResult

	for _, table := range tables {
		cols, err := c.DescribeTable(database, table)
		if err != nil {
			continue
		}

		var searchQuery string
		colNames := make([]string, len(cols))
		for i, col := range cols {
			colNames[i] = col.Name
		}

		switch dt {
		case "mysql":
			var castCols []string
			for _, col := range cols {
				castCols = append(castCols, fmt.Sprintf("COALESCE(CAST(`%s` AS CHAR),'')", col.Name))
			}
			searchQuery = fmt.Sprintf(
				"SELECT * FROM `%s`.`%s` WHERE CONCAT_WS(' ',%s) LIKE '%%%s%%' LIMIT %d",
				database, table, joinStrings(castCols, ","), escapeLike(query), limit,
			)
		case "postgresql":
			var castCols []string
			for _, col := range cols {
				castCols = append(castCols, fmt.Sprintf(`COALESCE("%s"::text,'')`, col.Name))
			}
			searchQuery = fmt.Sprintf(
				`SELECT * FROM public."%s" WHERE CONCAT_WS(' ',%s) ILIKE '%%%s%%' LIMIT %d`,
				table, joinStrings(castCols, ","), escapeLike(query), limit,
			)
		case "mongodb":
			result, err := c.GetRows(database, table, 100, 0)
			if err != nil {
				continue
			}
			var matches []map[string]interface{}
			lowerQ := fmt.Sprintf("%v", query)
			for _, row := range result.Rows {
				for _, v := range row {
					sv := fmt.Sprintf("%v", v)
					if containsCI(sv, lowerQ) {
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

		result, err := c.ExecuteQuery(database, searchQuery)
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

func (s *DatabaseService) GetSchema(userID int64, database string) ([]connector.TableSchema, error) {
	c, err := s.getConn(userID)
	if err != nil {
		return nil, err
	}

	tables, err := c.ListTables(database)
	if err != nil {
		return nil, err
	}

	fkMap := s.getForeignKeys(userID, database)

	var schema []connector.TableSchema
	for _, tableName := range tables {
		cols, err := c.DescribeTable(database, tableName)
		if err != nil {
			continue
		}

		var schemaCols []connector.SchemaColumn
		for _, col := range cols {
			sc := connector.SchemaColumn{
				Name:      col.Name,
				Type:      col.Type,
				Nullable:  col.Null == "YES",
				IsPrimary: strings.Contains(col.Key, "PRI") || strings.Contains(col.Key, "PRIMARY"),
			}
			fkKey := tableName + "." + col.Name
			if fk, ok := fkMap[fkKey]; ok {
				sc.ForeignKey = &fk
			}
			schemaCols = append(schemaCols, sc)
		}

		schema = append(schema, connector.TableSchema{
			Name:    tableName,
			Columns: schemaCols,
		})
	}

	return schema, nil
}

func (s *DatabaseService) getForeignKeys(userID int64, database string) map[string]connector.FKInfo {
	fkMap := make(map[string]connector.FKInfo)
	sess, err := s.getSession(userID)
	if err != nil {
		return fkMap
	}
	c := sess.conn
	dt := sess.dbType

	var query string
	switch dt {
	case "mysql":
		query = fmt.Sprintf(`
			SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
			FROM information_schema.KEY_COLUMN_USAGE
			WHERE TABLE_SCHEMA = '%s'
			AND REFERENCED_TABLE_NAME IS NOT NULL
		`, escapeLike(database))
	case "postgresql":
		query = fmt.Sprintf(`
			SELECT
				tc.table_name,
				kcu.column_name,
				ccu.table_name AS referenced_table,
				ccu.column_name AS referenced_column
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
			JOIN information_schema.constraint_column_usage ccu
				ON ccu.constraint_name = tc.constraint_name
				AND ccu.table_schema = tc.table_schema
			WHERE tc.constraint_type = 'FOREIGN KEY'
			AND tc.table_schema = 'public'
		`)
		_ = database
	default:
		return fkMap
	}

	result, err := c.ExecuteQuery(database, query)
	if err != nil {
		return fkMap
	}

	for _, row := range result.Rows {
		tableName := fmt.Sprintf("%v", row["TABLE_NAME"])
		colName := fmt.Sprintf("%v", row["COLUMN_NAME"])
		refTable := fmt.Sprintf("%v", row["REFERENCED_TABLE_NAME"])
		refCol := fmt.Sprintf("%v", row["REFERENCED_COLUMN_NAME"])

		if tableName == "<nil>" {
			tableName = fmt.Sprintf("%v", row["table_name"])
			colName = fmt.Sprintf("%v", row["column_name"])
			refTable = fmt.Sprintf("%v", row["referenced_table"])
			refCol = fmt.Sprintf("%v", row["referenced_column"])
		}

		fkMap[tableName+"."+colName] = connector.FKInfo{
			RefTable:  refTable,
			RefColumn: refCol,
		}
	}

	return fkMap
}

// ── MongoDB-specific methods ──

func (s *DatabaseService) MongoFind(userID int64, database, collection, filter, sort, projection string, limit, skip int) (*connector.QueryResult, int64, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, 0, err
	}
	return mc.FindDocuments(database, collection, filter, sort, projection, limit, skip)
}

func (s *DatabaseService) MongoExplain(userID int64, database, collection, filter, sort string) (map[string]interface{}, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.ExplainFind(database, collection, filter, sort)
}

func (s *DatabaseService) MongoCount(userID int64, database, collection string) (int64, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return 0, err
	}
	return mc.CountDocuments(database, collection)
}

func (s *DatabaseService) MongoListIndexes(userID int64, database, collection string) ([]connector.IndexInfo, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.ListIndexes(database, collection)
}

func (s *DatabaseService) MongoCreateIndex(userID int64, database, collection, keysJSON string, unique bool, name string) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.CreateIndex(database, collection, keysJSON, unique, name)
}

func (s *DatabaseService) MongoCreateIndexAdvanced(userID int64, database, collection, keysJSON string, unique, sparse bool, name string, ttlSeconds int, partialFilterJSON string) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.CreateIndexAdvanced(database, collection, keysJSON, unique, sparse, name, ttlSeconds, partialFilterJSON)
}

func (s *DatabaseService) MongoCreateIndexFull(userID int64, database, collection, keysJSON string, opts connector.IndexCreateOptions) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.CreateIndexFull(database, collection, keysJSON, opts)
}

func (s *DatabaseService) MongoSetIndexHidden(userID int64, database, collection, indexName string, hidden bool) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.SetIndexHidden(database, collection, indexName, hidden)
}

func (s *DatabaseService) MongoDropIndex(userID int64, database, collection, indexName string) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.DropIndex(database, collection, indexName)
}

func (s *DatabaseService) MongoWatchCollection(userID int64, ctx context.Context, database, collection string, events chan<- connector.ChangeEvent) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.WatchCollection(ctx, database, collection, events)
}

func (s *DatabaseService) MongoCollectionStats(userID int64, database, collection string) (*connector.CollectionStats, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.CollectionStats(database, collection)
}

// ── Bulk Operations ──

func (s *DatabaseService) MongoInsertMany(userID int64, database, collection string, docs []map[string]interface{}) (int, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return 0, err
	}
	return mc.InsertMany(database, collection, docs)
}

func (s *DatabaseService) MongoUpdateMany(userID int64, database, collection, filter, update string) (int64, int64, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return 0, 0, err
	}
	return mc.UpdateMany(database, collection, filter, update)
}

func (s *DatabaseService) MongoDeleteMany(userID int64, database, collection, filter string) (int64, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return 0, err
	}
	return mc.DeleteMany(database, collection, filter)
}

// ── Distinct ──

func (s *DatabaseService) MongoDistinct(userID int64, database, collection, field, filter string) ([]interface{}, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.Distinct(database, collection, field, filter)
}

// ── User Management ──

func (s *DatabaseService) MongoCreateUser(userID int64, database, username, password string, roles []map[string]interface{}) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.MongoCreateUser(database, username, password, toBsonMSlice(roles))
}

func (s *DatabaseService) MongoDropUser(userID int64, database, username string) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.MongoDropUser(database, username)
}

func (s *DatabaseService) MongoUpdateUserRoles(userID int64, database, username string, roles []map[string]interface{}) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.MongoUpdateUserRoles(database, username, toBsonMSlice(roles))
}

func (s *DatabaseService) MongoListRoles(userID int64, database string) ([]string, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.MongoListRoles(database)
}

// ── currentOp / killOp ──

func (s *DatabaseService) MongoCurrentOp(userID int64) ([]map[string]interface{}, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.CurrentOp()
}

func (s *DatabaseService) MongoKillOp(userID int64, opid interface{}) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.KillOp(opid)
}

// ── MongoDB Views ──

func (s *DatabaseService) MongoCreateView(userID int64, database, viewName, source, pipelineJSON string) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.CreateView(database, viewName, source, pipelineJSON)
}

func (s *DatabaseService) MongoListViews(userID int64, database string) ([]map[string]interface{}, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.ListViews(database)
}

// ── Schema Validation ──

func (s *DatabaseService) MongoGetValidation(userID int64, database, collection string) (map[string]interface{}, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.GetValidationRules(database, collection)
}

func (s *DatabaseService) MongoSetValidation(userID int64, database, collection, validatorJSON, level, action string) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.SetValidationRules(database, collection, validatorJSON, level, action)
}

// ── Rename Collection ──

func (s *DatabaseService) MongoRenameCollection(userID int64, database, oldName, newName string) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.RenameCollection(database, oldName, newName)
}

// ── Database Profiler ──

func (s *DatabaseService) MongoGetProfilingLevel(userID int64, database string) (map[string]interface{}, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.GetProfilingLevel(database)
}

func (s *DatabaseService) MongoSetProfilingLevel(userID int64, database string, level, slowms int) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.SetProfilingLevel(database, level, slowms)
}

func (s *DatabaseService) MongoGetProfileData(userID int64, database string, limit int) ([]map[string]interface{}, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.GetProfileData(database, limit)
}

// ── Database Stats ──

func (s *DatabaseService) MongoDatabaseStats(userID int64, database string) (map[string]interface{}, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.DatabaseStats(database)
}

// ── Capped Collections ──

func (s *DatabaseService) MongoCreateCappedCollection(userID int64, database, collection string, sizeBytes, maxDocs int64) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.CreateCappedCollection(database, collection, sizeBytes, maxDocs)
}

func (s *DatabaseService) MongoIsCollectionCapped(userID int64, database, collection string) (bool, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return false, err
	}
	return mc.IsCollectionCapped(database, collection)
}

// ── Compact Collection ──

func (s *DatabaseService) MongoCompactCollection(userID int64, database, collection string) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.CompactCollection(database, collection)
}

// ── Duplicate Collection ──

func (s *DatabaseService) MongoDuplicateCollection(userID int64, database, source, target string) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.DuplicateCollection(database, source, target)
}

// ── Server Log ──

func (s *DatabaseService) MongoGetServerLog(userID int64, logType string) ([]string, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.GetServerLog(logType)
}

// ── Convert to Capped ──

func (s *DatabaseService) MongoConvertToCapped(userID int64, database, collection string, sizeBytes int64) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.ConvertToCapped(database, collection, sizeBytes)
}

// ── Collection Metadata ──

func (s *DatabaseService) MongoListCollectionsWithMeta(userID int64, database string) ([]connector.CollectionMetadata, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.ListCollectionsWithMeta(database)
}

// ── Replica Set Info ──

func (s *DatabaseService) MongoReplicaSetStatus(userID int64) (map[string]interface{}, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.ReplicaSetStatus()
}

// ── Sample Documents ──

func (s *DatabaseService) MongoSampleDocuments(userID int64, database, collection string, n int) (*connector.QueryResult, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.SampleDocuments(database, collection, n)
}

// ── Index Usage Stats ──

func (s *DatabaseService) MongoIndexUsageStats(userID int64, database, collection string) ([]map[string]interface{}, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.IndexUsageStats(database, collection)
}

// ── Field Type Analysis ──

func (s *DatabaseService) MongoFieldTypeAnalysis(userID int64, database, collection string, sampleSize int) ([]map[string]interface{}, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.FieldTypeAnalysis(database, collection, sampleSize)
}

// ── Top Commands ──

func (s *DatabaseService) MongoTopStats(userID int64) ([]map[string]interface{}, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.TopStats()
}

func (s *DatabaseService) MongoRunAggregation(userID int64, database, collection, pipelineJSON string) (*connector.QueryResult, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.RunAggregation(database, collection, pipelineJSON)
}

// ── Custom Roles ──

func (s *DatabaseService) MongoListRolesDetailed(userID int64, database string, showBuiltin bool) ([]connector.RoleInfo, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.ListRolesDetailed(database, showBuiltin)
}

func (s *DatabaseService) MongoCreateCustomRole(userID int64, database, roleName, privilegesJSON, inheritedRolesJSON string) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.CreateCustomRole(database, roleName, privilegesJSON, inheritedRolesJSON)
}

func (s *DatabaseService) MongoUpdateCustomRole(userID int64, database, roleName, privilegesJSON, inheritedRolesJSON string) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.UpdateCustomRole(database, roleName, privilegesJSON, inheritedRolesJSON)
}

func (s *DatabaseService) MongoDropCustomRole(userID int64, database, roleName string) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.DropCustomRole(database, roleName)
}

// ── GridFS ──

func (s *DatabaseService) MongoListGridFSBuckets(userID int64, database string) ([]string, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.ListGridFSBuckets(database)
}

func (s *DatabaseService) MongoListGridFSFiles(userID int64, database, bucket string, limit int) ([]connector.GridFSFileInfo, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.ListGridFSFiles(database, bucket, limit)
}

func (s *DatabaseService) MongoUploadGridFSFile(userID int64, database, bucket, filename string, data []byte) (string, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return "", err
	}
	return mc.UploadGridFSFile(database, bucket, filename, data)
}

func (s *DatabaseService) MongoDownloadGridFSFile(userID int64, database, bucket, fileID string) ([]byte, string, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, "", err
	}
	return mc.DownloadGridFSFile(database, bucket, fileID)
}

func (s *DatabaseService) MongoDeleteGridFSFile(userID int64, database, bucket, fileID string) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.DeleteGridFSFile(database, bucket, fileID)
}

// ── Time Series ──

func (s *DatabaseService) MongoCreateTimeSeriesCollection(userID int64, database, collection, timeField, metaField, granularity string, expireAfterSeconds int64) error {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return err
	}
	return mc.CreateTimeSeriesCollection(database, collection, timeField, metaField, granularity, expireAfterSeconds)
}

func (s *DatabaseService) MongoGetTimeSeriesInfo(userID int64, database, collection string) (*connector.TimeSeriesOptions, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.GetTimeSeriesInfo(database, collection)
}

// ── Sharding ──

func (s *DatabaseService) MongoGetClusterShardingInfo(userID int64) (*connector.ShardedClusterInfo, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.GetClusterShardingInfo()
}

func (s *DatabaseService) MongoGetCollectionShardingInfo(userID int64, database, collection string) (*connector.CollectionShardingInfo, error) {
	mc, err := s.getMongoConn(userID)
	if err != nil {
		return nil, err
	}
	return mc.GetCollectionShardingInfo(database, collection)
}

func (s *DatabaseService) Disconnect(userID int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if sess := s.sessions[userID]; sess != nil {
		err := sess.conn.Close()
		delete(s.sessions, userID)
		return err
	}
	return nil
}

// ListUsers returns the database server users
func (s *DatabaseService) ListUsers(userID int64) (*connector.QueryResult, error) {
	sess, err := s.getSession(userID)
	if err != nil {
		return nil, err
	}
	c := sess.conn
	switch sess.dbType {
	case "mysql":
		return c.ExecuteQuery("", "SELECT User, Host FROM mysql.user ORDER BY User")
	case "postgresql":
		return c.ExecuteQuery("", "SELECT rolname AS \"User\", CASE WHEN rolcanlogin THEN 'Yes' ELSE 'No' END AS \"Can Login\", CASE WHEN rolsuper THEN 'Yes' ELSE 'No' END AS \"Superuser\", CASE WHEN rolcreatedb THEN 'Yes' ELSE 'No' END AS \"Create DB\", CASE WHEN rolcreaterole THEN 'Yes' ELSE 'No' END AS \"Create Role\" FROM pg_roles ORDER BY rolname")
	case "mongodb":
		mc, ok := c.(*connector.MongoConnector)
		if !ok {
			return nil, fmt.Errorf("unexpected connector type")
		}
		return mc.ListUsers()
	default:
		return nil, fmt.Errorf("unsupported for this database type")
	}
}

// ChangeDBUserPassword changes the password of a database user
func (s *DatabaseService) ChangeDBUserPassword(userID int64, username, host, newPassword string) error {
	sess, err := s.getSession(userID)
	if err != nil {
		return err
	}
	c := sess.conn
	if newPassword == "" {
		return fmt.Errorf("password cannot be empty")
	}
	escaped := strings.ReplaceAll(newPassword, "'", "''")
	switch sess.dbType {
	case "mysql":
		query := fmt.Sprintf("ALTER USER %s@%s IDENTIFIED BY '%s'",
			c.QuoteIdentifier(username),
			c.QuoteIdentifier(host),
			escaped)
		_, err := c.ExecuteQuery("", query)
		if err != nil {
			return err
		}
		_, _ = c.ExecuteQuery("", "FLUSH PRIVILEGES")
		return nil
	case "postgresql":
		query := fmt.Sprintf("ALTER USER %s WITH PASSWORD '%s'",
			c.QuoteIdentifier(username),
			escaped)
		_, err := c.ExecuteQuery("", query)
		return err
	default:
		return fmt.Errorf("password change not supported for %s", sess.dbType)
	}
}

// ServerStatus returns key server status information
func (s *DatabaseService) ServerStatus(userID int64) (*connector.QueryResult, error) {
	sess, err := s.getSession(userID)
	if err != nil {
		return nil, err
	}
	c := sess.conn
	switch sess.dbType {
	case "mysql":
		return c.ExecuteQuery("", "SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime','Threads_connected','Questions','Slow_queries','Open_tables','Bytes_received','Bytes_sent','Connections','Aborted_connects','Max_used_connections')")
	case "postgresql":
		return c.ExecuteQuery("", "SELECT name AS \"Variable_name\", setting AS \"Value\" FROM pg_settings WHERE name IN ('max_connections','shared_buffers','work_mem','effective_cache_size','maintenance_work_mem') UNION ALL SELECT 'server_version', version() UNION ALL SELECT 'active_connections', count(*)::text FROM pg_stat_activity WHERE state = 'active'")
	case "mongodb":
		mc, ok := c.(*connector.MongoConnector)
		if !ok {
			return nil, fmt.Errorf("unexpected connector type")
		}
		return mc.ServerStatus()
	default:
		return nil, fmt.Errorf("unsupported for this database type")
	}
}

// ── Triggers ─────────────────────────────────────────────────────────────

func (s *DatabaseService) ListTriggers(userID int64, database string) ([]connector.TriggerInfo, error) {
	sess, err := s.getSession(userID)
	if err != nil {
		return nil, err
	}
	switch sess.dbType {
	case "mysql":
		return sess.conn.(*connector.MySQLConnector).ListTriggers(database)
	case "postgresql":
		return sess.conn.(*connector.PostgresConnector).ListTriggers(database)
	default:
		return nil, fmt.Errorf("triggers not supported for %s", sess.dbType)
	}
}

func (s *DatabaseService) DropTrigger(userID int64, database, name, table string) error {
	sess, err := s.getSession(userID)
	if err != nil {
		return err
	}
	switch sess.dbType {
	case "mysql":
		return sess.conn.(*connector.MySQLConnector).DropTrigger(database, name)
	case "postgresql":
		return sess.conn.(*connector.PostgresConnector).DropTrigger(database, name, table)
	default:
		return fmt.Errorf("triggers not supported for %s", sess.dbType)
	}
}

// ── Routines ─────────────────────────────────────────────────────────────

func (s *DatabaseService) ListRoutines(userID int64, database string) ([]connector.RoutineInfo, error) {
	sess, err := s.getSession(userID)
	if err != nil {
		return nil, err
	}
	switch sess.dbType {
	case "mysql":
		return sess.conn.(*connector.MySQLConnector).ListRoutines(database)
	case "postgresql":
		return sess.conn.(*connector.PostgresConnector).ListRoutines(database)
	default:
		return nil, fmt.Errorf("routines not supported for %s", sess.dbType)
	}
}

func (s *DatabaseService) DropRoutine(userID int64, database, name, routineType string) error {
	sess, err := s.getSession(userID)
	if err != nil {
		return err
	}
	switch sess.dbType {
	case "mysql":
		return sess.conn.(*connector.MySQLConnector).DropRoutine(database, name, routineType)
	case "postgresql":
		return sess.conn.(*connector.PostgresConnector).DropRoutine(database, name, routineType)
	default:
		return fmt.Errorf("routines not supported for %s", sess.dbType)
	}
}

// ── Schemas (PostgreSQL) ─────────────────────────────────────────────────

func (s *DatabaseService) ListSchemas(userID int64, database string) ([]string, error) {
	sess, err := s.getSession(userID)
	if err != nil {
		return nil, err
	}
	if sess.dbType != "postgresql" {
		return nil, fmt.Errorf("schemas not supported for %s", sess.dbType)
	}
	return sess.conn.(*connector.PostgresConnector).ListSchemas(database)
}

func (s *DatabaseService) ListTablesInSchema(userID int64, database, schema string) ([]string, error) {
	sess, err := s.getSession(userID)
	if err != nil {
		return nil, err
	}
	if sess.dbType != "postgresql" {
		return nil, fmt.Errorf("schemas not supported for %s", sess.dbType)
	}
	return sess.conn.(*connector.PostgresConnector).ListTablesInSchema(database, schema)
}

// ── Table Maintenance ────────────────────────────────────────────────────

func (s *DatabaseService) MaintenanceTable(userID int64, database, table, operation string) (string, error) {
	sess, err := s.getSession(userID)
	if err != nil {
		return "", err
	}
	switch sess.dbType {
	case "mysql":
		return sess.conn.(*connector.MySQLConnector).MaintenanceTable(database, table, operation)
	case "postgresql":
		return sess.conn.(*connector.PostgresConnector).MaintenanceTable(database, table, operation)
	default:
		return "", fmt.Errorf("maintenance not supported for %s", sess.dbType)
	}
}
