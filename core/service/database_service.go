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

type DatabaseService struct {
	mu            sync.RWMutex
	conn          connector.Connector
	dbType        string
	host          string
	port          int
	user          string
	preconfigured []PreconfiguredDB
}

func NewDatabaseService() *DatabaseService {
	return &DatabaseService{}
}

// SetPreconfigured stores DB configs from env vars.
func (s *DatabaseService) SetPreconfigured(configs []PreconfiguredDB) {
	s.preconfigured = configs
}

// ListPreconfigured returns the pre-configured connections (without passwords).
func (s *DatabaseService) ListPreconfigured() []PreconfiguredDB {
	return s.preconfigured
}


func (s *DatabaseService) Connect(host string, port int, user, password, dbType string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

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
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.dbType
}

func (s *DatabaseService) IsConnected() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.conn != nil
}

type ConnectionInfo struct {
	Host   string `json:"host"`
	Port   int    `json:"port"`
	User   string `json:"user"`
	DbType string `json:"type"`
}

func (s *DatabaseService) GetConnectionInfo() *ConnectionInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
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

// getConn safely reads the current connector under read lock.
func (s *DatabaseService) getConn() (connector.Connector, error) {
	s.mu.RLock()
	c := s.conn
	s.mu.RUnlock()
	if c == nil {
		return nil, fmt.Errorf("not connected")
	}
	return c, nil
}

// getMongoConn safely reads the current connector and asserts it's MongoDB.
func (s *DatabaseService) getMongoConn() (*connector.MongoConnector, error) {
	s.mu.RLock()
	c := s.conn
	s.mu.RUnlock()
	if c == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := c.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc, nil
}

// BackupDatabase streams a full dump of dbName to w using the appropriate
// native binary (mysqldump/pg_dump/mongodump). The caller is responsible
// for setting HTTP headers before calling.
func (s *DatabaseService) BackupDatabase(dbName string, w io.Writer) error {
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return fmt.Errorf("not connected")
	}
	cfg := c.GetConfig()
	return backup.Backup(dt, cfg, dbName, w)
}

// RestoreDatabase replays a dump from r into dbName. For SQL dumps the
// target database must already exist; for MongoDB the archive contains
// the database name and is restored under dbName via --nsInclude.
func (s *DatabaseService) RestoreDatabase(dbName string, r io.Reader) error {
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return fmt.Errorf("not connected")
	}
	cfg := c.GetConfig()
	return backup.Restore(dt, cfg, dbName, r)
}

// BackupBinariesAvailable returns a map[dbType]bool indicating whether
// the dump binary for each SGBD is installed on this machine.
func (s *DatabaseService) BackupBinariesAvailable() map[string]bool {
	return backup.CheckBinaries()
}

// BackupFormat returns the canonical extension and content-type for the
// current connection's backup format.
func (s *DatabaseService) BackupFormat() backup.Format {
	s.mu.RLock()
	dt := s.dbType
	s.mu.RUnlock()
	return backup.FormatFor(dt)
}

func (s *DatabaseService) ListDatabases() ([]string, error) {
	c, err := s.getConn()
	if err != nil {
		return nil, err
	}
	return c.ListDatabases()
}

// ListDatabasesWithStats returns databases with table count and size info.
func (s *DatabaseService) ListDatabasesWithStats() ([]connector.DatabaseInfo, error) {
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return nil, fmt.Errorf("not connected")
	}

	switch dt {
	case "mysql":
		return s.mysqlDatabaseStats()
	case "postgresql":
		return s.postgresDatabaseStats()
	case "mongodb":
		return s.mongoDatabaseStats()
	default:
		// Fallback: just names, no stats
		names, err := c.ListDatabases()
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
	c, err := s.getConn()
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

func (s *DatabaseService) postgresDatabaseStats() ([]connector.DatabaseInfo, error) {
	c, err := s.getConn()
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
		// Table count requires per-DB connection, get it from ListTables
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

func (s *DatabaseService) mongoDatabaseStats() ([]connector.DatabaseInfo, error) {
	c, err := s.getConn()
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
	c, err := s.getConn()
	if err != nil {
		return err
	}
	return c.CreateDatabase(name)
}

func (s *DatabaseService) DropDatabase(name string) error {
	c, err := s.getConn()
	if err != nil {
		return err
	}
	return c.DropDatabase(name)
}

func (s *DatabaseService) CreateTable(database, table string, columns []connector.TableColumnDef) error {
	c, err := s.getConn()
	if err != nil {
		return err
	}
	return c.CreateTable(database, table, columns)
}

func (s *DatabaseService) ListTables(database string) ([]string, error) {
	c, err := s.getConn()
	if err != nil {
		return nil, err
	}
	return c.ListTables(database)
}

func (s *DatabaseService) DescribeTable(database, table string) ([]connector.Column, error) {
	c, err := s.getConn()
	if err != nil {
		return nil, err
	}
	return c.DescribeTable(database, table)
}

func (s *DatabaseService) GetRows(database, table string, limit, offset int) (*connector.QueryResult, error) {
	c, err := s.getConn()
	if err != nil {
		return nil, err
	}
	return c.GetRows(database, table, limit, offset)
}

func (s *DatabaseService) InsertRow(database, table string, data map[string]interface{}) error {
	c, err := s.getConn()
	if err != nil {
		return err
	}
	return c.InsertRow(database, table, data)
}

func (s *DatabaseService) UpdateRow(database, table string, primaryKey map[string]interface{}, data map[string]interface{}) error {
	c, err := s.getConn()
	if err != nil {
		return err
	}
	return c.UpdateRow(database, table, primaryKey, data)
}

func (s *DatabaseService) DeleteRow(database, table string, primaryKey map[string]interface{}) error {
	c, err := s.getConn()
	if err != nil {
		return err
	}
	return c.DeleteRow(database, table, primaryKey)
}

func (s *DatabaseService) ExecuteQuery(database, query string) (*connector.QueryResult, error) {
	c, err := s.getConn()
	if err != nil {
		return nil, err
	}
	return c.ExecuteQuery(database, query)
}

func (s *DatabaseService) ExecuteScript(database, script string) (int, error) {
	c, err := s.getConn()
	if err != nil {
		return 0, err
	}
	return c.ExecuteScript(database, script)
}

func (s *DatabaseService) DropTable(database, table string) error {
	c, err := s.getConn()
	if err != nil {
		return err
	}
	return c.DropTable(database, table)
}

func (s *DatabaseService) AlterColumn(database, table string, op connector.AlterColumnOp) error {
	c, err := s.getConn()
	if err != nil {
		return err
	}
	return c.AlterColumn(database, table, op)
}

func (s *DatabaseService) TruncateTable(database, table string) error {
	c, err := s.getConn()
	if err != nil {
		return err
	}
	return c.TruncateTable(database, table)
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
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return nil, fmt.Errorf("not connected")
	}

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

		// Build a search query based on SGBD type
		var searchQuery string
		colNames := make([]string, len(cols))
		for i, col := range cols {
			colNames[i] = col.Name
		}

		switch dt {
		case "mysql":
			// CONCAT_WS all columns and LIKE search
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
			// PostgreSQL: ExecuteQuery connects to the specific DB, so just use public."table"
			searchQuery = fmt.Sprintf(
				`SELECT * FROM public."%s" WHERE CONCAT_WS(' ',%s) ILIKE '%%%s%%' LIMIT %d`,
				table, joinStrings(castCols, ","), escapeLike(query), limit,
			)
		case "mongodb":
			// For MongoDB, search via regex on all string fields
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

		// Execute SQL search
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

// GetSchema returns the full schema for a database (tables, columns, foreign keys).
func (s *DatabaseService) GetSchema(database string) ([]connector.TableSchema, error) {
	c, err := s.getConn()
	if err != nil {
		return nil, err
	}

	tables, err := c.ListTables(database)
	if err != nil {
		return nil, err
	}

	// Get foreign keys map
	fkMap := s.getForeignKeys(database)

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
			// Check for foreign key
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

func (s *DatabaseService) getForeignKeys(database string) map[string]connector.FKInfo {
	fkMap := make(map[string]connector.FKInfo)
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return fkMap
	}

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
		_ = database // PostgreSQL uses schema 'public' by default
	default:
		return fkMap // MongoDB has no foreign keys
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

		// PostgreSQL uses lowercase column names
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

// MongoFind performs a server-side find with filter, sort, projection, limit, skip.
func (s *DatabaseService) MongoFind(database, collection, filter, sort, projection string, limit, skip int) (*connector.QueryResult, int64, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, 0, err
	}
	return mc.FindDocuments(database, collection, filter, sort, projection, limit, skip)
}

// MongoExplain runs explain on a find query.
func (s *DatabaseService) MongoExplain(database, collection, filter, sort string) (map[string]interface{}, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.ExplainFind(database, collection, filter, sort)
}

// MongoCount returns total document count for a collection.
func (s *DatabaseService) MongoCount(database, collection string) (int64, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return 0, err
	}
	return mc.CountDocuments(database, collection)
}

// MongoListIndexes returns indexes for a collection.
func (s *DatabaseService) MongoListIndexes(database, collection string) ([]connector.IndexInfo, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.ListIndexes(database, collection)
}

// MongoCreateIndex creates an index on a collection.
func (s *DatabaseService) MongoCreateIndex(database, collection, keysJSON string, unique bool, name string) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.CreateIndex(database, collection, keysJSON, unique, name)
}

// MongoCreateIndexAdvanced creates an index with advanced options.
func (s *DatabaseService) MongoCreateIndexAdvanced(database, collection, keysJSON string, unique, sparse bool, name string, ttlSeconds int, partialFilterJSON string) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.CreateIndexAdvanced(database, collection, keysJSON, unique, sparse, name, ttlSeconds, partialFilterJSON)
}

// MongoCreateIndexFull creates an index with the full option set.
func (s *DatabaseService) MongoCreateIndexFull(database, collection, keysJSON string, opts connector.IndexCreateOptions) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.CreateIndexFull(database, collection, keysJSON, opts)
}

// MongoSetIndexHidden hides or unhides an existing index.
func (s *DatabaseService) MongoSetIndexHidden(database, collection, indexName string, hidden bool) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.SetIndexHidden(database, collection, indexName, hidden)
}

// MongoDropIndex drops an index by name.
func (s *DatabaseService) MongoDropIndex(database, collection, indexName string) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.DropIndex(database, collection, indexName)
}

// MongoWatchCollection opens a change stream on a collection (SSE).
func (s *DatabaseService) MongoWatchCollection(ctx context.Context, database, collection string, events chan<- connector.ChangeEvent) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.WatchCollection(ctx, database, collection, events)
}

// MongoCollectionStats returns stats for a MongoDB collection.
func (s *DatabaseService) MongoCollectionStats(database, collection string) (*connector.CollectionStats, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.CollectionStats(database, collection)
}

// ── Bulk Operations ──

func (s *DatabaseService) MongoInsertMany(database, collection string, docs []map[string]interface{}) (int, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return 0, err
	}
	return mc.InsertMany(database, collection, docs)
}

func (s *DatabaseService) MongoUpdateMany(database, collection, filter, update string) (int64, int64, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return 0, 0, err
	}
	return mc.UpdateMany(database, collection, filter, update)
}

func (s *DatabaseService) MongoDeleteMany(database, collection, filter string) (int64, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return 0, err
	}
	return mc.DeleteMany(database, collection, filter)
}

// ── Distinct ──

func (s *DatabaseService) MongoDistinct(database, collection, field, filter string) ([]interface{}, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.Distinct(database, collection, field, filter)
}

// ── User Management ──

func (s *DatabaseService) MongoCreateUser(database, username, password string, roles []map[string]interface{}) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.MongoCreateUser(database, username, password, toBsonMSlice(roles))
}

func (s *DatabaseService) MongoDropUser(database, username string) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.MongoDropUser(database, username)
}

func (s *DatabaseService) MongoUpdateUserRoles(database, username string, roles []map[string]interface{}) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.MongoUpdateUserRoles(database, username, toBsonMSlice(roles))
}

func (s *DatabaseService) MongoListRoles(database string) ([]string, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.MongoListRoles(database)
}

// ── currentOp / killOp ──

func (s *DatabaseService) MongoCurrentOp() ([]map[string]interface{}, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.CurrentOp()
}

func (s *DatabaseService) MongoKillOp(opid interface{}) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.KillOp(opid)
}

// ── MongoDB Views ──

func (s *DatabaseService) MongoCreateView(database, viewName, source, pipelineJSON string) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.CreateView(database, viewName, source, pipelineJSON)
}

func (s *DatabaseService) MongoListViews(database string) ([]map[string]interface{}, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.ListViews(database)
}

// ── Schema Validation ──

func (s *DatabaseService) MongoGetValidation(database, collection string) (map[string]interface{}, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.GetValidationRules(database, collection)
}

func (s *DatabaseService) MongoSetValidation(database, collection, validatorJSON, level, action string) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.SetValidationRules(database, collection, validatorJSON, level, action)
}

// ── Rename Collection ──

func (s *DatabaseService) MongoRenameCollection(database, oldName, newName string) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.RenameCollection(database, oldName, newName)
}

// ── Database Profiler ──

func (s *DatabaseService) MongoGetProfilingLevel(database string) (map[string]interface{}, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.GetProfilingLevel(database)
}

func (s *DatabaseService) MongoSetProfilingLevel(database string, level, slowms int) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.SetProfilingLevel(database, level, slowms)
}

func (s *DatabaseService) MongoGetProfileData(database string, limit int) ([]map[string]interface{}, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.GetProfileData(database, limit)
}

// ── Database Stats ──

func (s *DatabaseService) MongoDatabaseStats(database string) (map[string]interface{}, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.DatabaseStats(database)
}

// ── Capped Collections ──

func (s *DatabaseService) MongoCreateCappedCollection(database, collection string, sizeBytes, maxDocs int64) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.CreateCappedCollection(database, collection, sizeBytes, maxDocs)
}

func (s *DatabaseService) MongoIsCollectionCapped(database, collection string) (bool, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return false, err
	}
	return mc.IsCollectionCapped(database, collection)
}

// ── Compact Collection ──

func (s *DatabaseService) MongoCompactCollection(database, collection string) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.CompactCollection(database, collection)
}

// ── Duplicate Collection ──

func (s *DatabaseService) MongoDuplicateCollection(database, source, target string) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.DuplicateCollection(database, source, target)
}

// ── Server Log ──

func (s *DatabaseService) MongoGetServerLog(logType string) ([]string, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.GetServerLog(logType)
}

// ── Convert to Capped ──

func (s *DatabaseService) MongoConvertToCapped(database, collection string, sizeBytes int64) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.ConvertToCapped(database, collection, sizeBytes)
}

// ── Collection Metadata ──

func (s *DatabaseService) MongoListCollectionsWithMeta(database string) ([]connector.CollectionMetadata, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.ListCollectionsWithMeta(database)
}

// ── Replica Set Info ──

func (s *DatabaseService) MongoReplicaSetStatus() (map[string]interface{}, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.ReplicaSetStatus()
}

// ── Sample Documents ──

func (s *DatabaseService) MongoSampleDocuments(database, collection string, n int) (*connector.QueryResult, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.SampleDocuments(database, collection, n)
}

// ── Index Usage Stats ──

func (s *DatabaseService) MongoIndexUsageStats(database, collection string) ([]map[string]interface{}, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.IndexUsageStats(database, collection)
}

// ── Field Type Analysis ──

func (s *DatabaseService) MongoFieldTypeAnalysis(database, collection string, sampleSize int) ([]map[string]interface{}, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.FieldTypeAnalysis(database, collection, sampleSize)
}

// ── Top Commands ──

func (s *DatabaseService) MongoTopStats() ([]map[string]interface{}, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.TopStats()
}

func (s *DatabaseService) MongoRunAggregation(database, collection, pipelineJSON string) (*connector.QueryResult, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.RunAggregation(database, collection, pipelineJSON)
}

// ── Custom Roles ──

func (s *DatabaseService) MongoListRolesDetailed(database string, showBuiltin bool) ([]connector.RoleInfo, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.ListRolesDetailed(database, showBuiltin)
}

func (s *DatabaseService) MongoCreateCustomRole(database, roleName, privilegesJSON, inheritedRolesJSON string) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.CreateCustomRole(database, roleName, privilegesJSON, inheritedRolesJSON)
}

func (s *DatabaseService) MongoUpdateCustomRole(database, roleName, privilegesJSON, inheritedRolesJSON string) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.UpdateCustomRole(database, roleName, privilegesJSON, inheritedRolesJSON)
}

func (s *DatabaseService) MongoDropCustomRole(database, roleName string) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.DropCustomRole(database, roleName)
}

// ── GridFS ──

func (s *DatabaseService) MongoListGridFSBuckets(database string) ([]string, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.ListGridFSBuckets(database)
}

func (s *DatabaseService) MongoListGridFSFiles(database, bucket string, limit int) ([]connector.GridFSFileInfo, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.ListGridFSFiles(database, bucket, limit)
}

func (s *DatabaseService) MongoUploadGridFSFile(database, bucket, filename string, data []byte) (string, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return "", err
	}
	return mc.UploadGridFSFile(database, bucket, filename, data)
}

func (s *DatabaseService) MongoDownloadGridFSFile(database, bucket, fileID string) ([]byte, string, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, "", err
	}
	return mc.DownloadGridFSFile(database, bucket, fileID)
}

func (s *DatabaseService) MongoDeleteGridFSFile(database, bucket, fileID string) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.DeleteGridFSFile(database, bucket, fileID)
}

// ── Time Series ──

func (s *DatabaseService) MongoCreateTimeSeriesCollection(database, collection, timeField, metaField, granularity string, expireAfterSeconds int64) error {
	mc, err := s.getMongoConn()
	if err != nil {
		return err
	}
	return mc.CreateTimeSeriesCollection(database, collection, timeField, metaField, granularity, expireAfterSeconds)
}

func (s *DatabaseService) MongoGetTimeSeriesInfo(database, collection string) (*connector.TimeSeriesOptions, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.GetTimeSeriesInfo(database, collection)
}

// ── Sharding ──

func (s *DatabaseService) MongoGetClusterShardingInfo() (*connector.ShardedClusterInfo, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.GetClusterShardingInfo()
}

func (s *DatabaseService) MongoGetCollectionShardingInfo(database, collection string) (*connector.CollectionShardingInfo, error) {
	mc, err := s.getMongoConn()
	if err != nil {
		return nil, err
	}
	return mc.GetCollectionShardingInfo(database, collection)
}

func (s *DatabaseService) Disconnect() error {
	s.mu.Lock()
	defer s.mu.Unlock()
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
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return nil, fmt.Errorf("not connected")
	}
	switch dt {
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
func (s *DatabaseService) ChangeDBUserPassword(username, host, newPassword string) error {
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return fmt.Errorf("not connected")
	}
	if newPassword == "" {
		return fmt.Errorf("password cannot be empty")
	}
	escaped := strings.ReplaceAll(newPassword, "'", "''")
	switch dt {
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
		return fmt.Errorf("password change not supported for %s", dt)
	}
}

// ServerStatus returns key server status information
func (s *DatabaseService) ServerStatus() (*connector.QueryResult, error) {
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return nil, fmt.Errorf("not connected")
	}
	switch dt {
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

func (s *DatabaseService) ListTriggers(database string) ([]connector.TriggerInfo, error) {
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return nil, fmt.Errorf("not connected")
	}
	switch dt {
	case "mysql":
		return c.(*connector.MySQLConnector).ListTriggers(database)
	case "postgresql":
		return c.(*connector.PostgresConnector).ListTriggers(database)
	default:
		return nil, fmt.Errorf("triggers not supported for %s", dt)
	}
}

func (s *DatabaseService) DropTrigger(database, name, table string) error {
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return fmt.Errorf("not connected")
	}
	switch dt {
	case "mysql":
		return c.(*connector.MySQLConnector).DropTrigger(database, name)
	case "postgresql":
		return c.(*connector.PostgresConnector).DropTrigger(database, name, table)
	default:
		return fmt.Errorf("triggers not supported for %s", dt)
	}
}

// ── Routines ─────────────────────────────────────────────────────────────

func (s *DatabaseService) ListRoutines(database string) ([]connector.RoutineInfo, error) {
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return nil, fmt.Errorf("not connected")
	}
	switch dt {
	case "mysql":
		return c.(*connector.MySQLConnector).ListRoutines(database)
	case "postgresql":
		return c.(*connector.PostgresConnector).ListRoutines(database)
	default:
		return nil, fmt.Errorf("routines not supported for %s", dt)
	}
}

func (s *DatabaseService) DropRoutine(database, name, routineType string) error {
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return fmt.Errorf("not connected")
	}
	switch dt {
	case "mysql":
		return c.(*connector.MySQLConnector).DropRoutine(database, name, routineType)
	case "postgresql":
		return c.(*connector.PostgresConnector).DropRoutine(database, name, routineType)
	default:
		return fmt.Errorf("routines not supported for %s", dt)
	}
}

// ── Schemas (PostgreSQL) ─────────────────────────────────────────────────

func (s *DatabaseService) ListSchemas(database string) ([]string, error) {
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return nil, fmt.Errorf("not connected")
	}
	if dt != "postgresql" {
		return nil, fmt.Errorf("schemas not supported for %s", dt)
	}
	return c.(*connector.PostgresConnector).ListSchemas(database)
}

func (s *DatabaseService) ListTablesInSchema(database, schema string) ([]string, error) {
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return nil, fmt.Errorf("not connected")
	}
	if dt != "postgresql" {
		return nil, fmt.Errorf("schemas not supported for %s", dt)
	}
	return c.(*connector.PostgresConnector).ListTablesInSchema(database, schema)
}

// ── Table Maintenance ────────────────────────────────────────────────────

func (s *DatabaseService) MaintenanceTable(database, table, operation string) (string, error) {
	s.mu.RLock()
	c := s.conn
	dt := s.dbType
	s.mu.RUnlock()
	if c == nil {
		return "", fmt.Errorf("not connected")
	}
	switch dt {
	case "mysql":
		return c.(*connector.MySQLConnector).MaintenanceTable(database, table, operation)
	case "postgresql":
		return c.(*connector.PostgresConnector).MaintenanceTable(database, table, operation)
	default:
		return "", fmt.Errorf("maintenance not supported for %s", dt)
	}
}
