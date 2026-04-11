package service

import (
	"fmt"
	"io"
	"strings"

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

// BackupDatabase streams a full dump of dbName to w using the appropriate
// native binary (mysqldump/pg_dump/mongodump). The caller is responsible
// for setting HTTP headers before calling.
func (s *DatabaseService) BackupDatabase(dbName string, w io.Writer) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	cfg := s.conn.GetConfig()
	return backup.Backup(s.dbType, cfg, dbName, w)
}

// RestoreDatabase replays a dump from r into dbName. For SQL dumps the
// target database must already exist; for MongoDB the archive contains
// the database name and is restored under dbName via --nsInclude.
func (s *DatabaseService) RestoreDatabase(dbName string, r io.Reader) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	cfg := s.conn.GetConfig()
	return backup.Restore(s.dbType, cfg, dbName, r)
}

// BackupBinariesAvailable returns a map[dbType]bool indicating whether
// the dump binary for each SGBD is installed on this machine.
func (s *DatabaseService) BackupBinariesAvailable() map[string]bool {
	return backup.CheckBinaries()
}

// BackupFormat returns the canonical extension and content-type for the
// current connection's backup format.
func (s *DatabaseService) BackupFormat() backup.Format {
	return backup.FormatFor(s.dbType)
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
			// PostgreSQL: ExecuteQuery connects to the specific DB, so just use public."table"
			searchQuery = fmt.Sprintf(
				`SELECT * FROM public."%s" WHERE CONCAT_WS(' ',%s) ILIKE '%%%s%%' LIMIT %d`,
				table, joinStrings(castCols, ","), escapeLike(query), limit,
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

// GetSchema returns the full schema for a database (tables, columns, foreign keys).
func (s *DatabaseService) GetSchema(database string) ([]connector.TableSchema, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}

	tables, err := s.conn.ListTables(database)
	if err != nil {
		return nil, err
	}

	// Get foreign keys map
	fkMap := s.getForeignKeys(database)

	var schema []connector.TableSchema
	for _, tableName := range tables {
		cols, err := s.conn.DescribeTable(database, tableName)
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
	if s.conn == nil {
		return fkMap
	}

	var query string
	switch s.dbType {
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

	result, err := s.conn.ExecuteQuery(database, query)
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
	if s.conn == nil {
		return nil, 0, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, 0, fmt.Errorf("not a MongoDB connection")
	}
	return mc.FindDocuments(database, collection, filter, sort, projection, limit, skip)
}

// MongoExplain runs explain on a find query.
func (s *DatabaseService) MongoExplain(database, collection, filter, sort string) (map[string]interface{}, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.ExplainFind(database, collection, filter, sort)
}

// MongoCount returns total document count for a collection.
func (s *DatabaseService) MongoCount(database, collection string) (int64, error) {
	if s.conn == nil {
		return 0, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return 0, fmt.Errorf("not a MongoDB connection")
	}
	return mc.CountDocuments(database, collection)
}

// MongoListIndexes returns indexes for a collection.
func (s *DatabaseService) MongoListIndexes(database, collection string) ([]connector.IndexInfo, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.ListIndexes(database, collection)
}

// MongoCreateIndex creates an index on a collection.
func (s *DatabaseService) MongoCreateIndex(database, collection, keysJSON string, unique bool, name string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.CreateIndex(database, collection, keysJSON, unique, name)
}

// MongoCreateIndexAdvanced creates an index with advanced options.
func (s *DatabaseService) MongoCreateIndexAdvanced(database, collection, keysJSON string, unique, sparse bool, name string, ttlSeconds int, partialFilterJSON string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.CreateIndexAdvanced(database, collection, keysJSON, unique, sparse, name, ttlSeconds, partialFilterJSON)
}

// MongoDropIndex drops an index by name.
func (s *DatabaseService) MongoDropIndex(database, collection, indexName string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.DropIndex(database, collection, indexName)
}

// MongoCollectionStats returns stats for a MongoDB collection.
func (s *DatabaseService) MongoCollectionStats(database, collection string) (*connector.CollectionStats, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.CollectionStats(database, collection)
}

// ── Bulk Operations ──

func (s *DatabaseService) MongoInsertMany(database, collection string, docs []map[string]interface{}) (int, error) {
	if s.conn == nil {
		return 0, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return 0, fmt.Errorf("not a MongoDB connection")
	}
	return mc.InsertMany(database, collection, docs)
}

func (s *DatabaseService) MongoUpdateMany(database, collection, filter, update string) (int64, int64, error) {
	if s.conn == nil {
		return 0, 0, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return 0, 0, fmt.Errorf("not a MongoDB connection")
	}
	return mc.UpdateMany(database, collection, filter, update)
}

func (s *DatabaseService) MongoDeleteMany(database, collection, filter string) (int64, error) {
	if s.conn == nil {
		return 0, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return 0, fmt.Errorf("not a MongoDB connection")
	}
	return mc.DeleteMany(database, collection, filter)
}

// ── Distinct ──

func (s *DatabaseService) MongoDistinct(database, collection, field, filter string) ([]interface{}, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.Distinct(database, collection, field, filter)
}

// ── User Management ──

func (s *DatabaseService) MongoCreateUser(database, username, password string, roles []map[string]interface{}) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.MongoCreateUser(database, username, password, toBsonMSlice(roles))
}

func (s *DatabaseService) MongoDropUser(database, username string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.MongoDropUser(database, username)
}

func (s *DatabaseService) MongoUpdateUserRoles(database, username string, roles []map[string]interface{}) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.MongoUpdateUserRoles(database, username, toBsonMSlice(roles))
}

func (s *DatabaseService) MongoListRoles(database string) ([]string, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.MongoListRoles(database)
}

// ── currentOp / killOp ──

func (s *DatabaseService) MongoCurrentOp() ([]map[string]interface{}, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.CurrentOp()
}

func (s *DatabaseService) MongoKillOp(opid interface{}) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.KillOp(opid)
}

// ── MongoDB Views ──

func (s *DatabaseService) MongoCreateView(database, viewName, source, pipelineJSON string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.CreateView(database, viewName, source, pipelineJSON)
}

func (s *DatabaseService) MongoListViews(database string) ([]map[string]interface{}, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.ListViews(database)
}

// ── Schema Validation ──

func (s *DatabaseService) MongoGetValidation(database, collection string) (map[string]interface{}, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.GetValidationRules(database, collection)
}

func (s *DatabaseService) MongoSetValidation(database, collection, validatorJSON, level, action string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.SetValidationRules(database, collection, validatorJSON, level, action)
}

// ── Rename Collection ──

func (s *DatabaseService) MongoRenameCollection(database, oldName, newName string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.RenameCollection(database, oldName, newName)
}

// ── Database Profiler ──

func (s *DatabaseService) MongoGetProfilingLevel(database string) (map[string]interface{}, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.GetProfilingLevel(database)
}

func (s *DatabaseService) MongoSetProfilingLevel(database string, level, slowms int) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.SetProfilingLevel(database, level, slowms)
}

func (s *DatabaseService) MongoGetProfileData(database string, limit int) ([]map[string]interface{}, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.GetProfileData(database, limit)
}

// ── Database Stats ──

func (s *DatabaseService) MongoDatabaseStats(database string) (map[string]interface{}, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.DatabaseStats(database)
}

// ── Capped Collections ──

func (s *DatabaseService) MongoCreateCappedCollection(database, collection string, sizeBytes, maxDocs int64) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.CreateCappedCollection(database, collection, sizeBytes, maxDocs)
}

func (s *DatabaseService) MongoIsCollectionCapped(database, collection string) (bool, error) {
	if s.conn == nil {
		return false, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return false, fmt.Errorf("not a MongoDB connection")
	}
	return mc.IsCollectionCapped(database, collection)
}

// ── Compact Collection ──

func (s *DatabaseService) MongoCompactCollection(database, collection string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.CompactCollection(database, collection)
}

// ── Duplicate Collection ──

func (s *DatabaseService) MongoDuplicateCollection(database, source, target string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.DuplicateCollection(database, source, target)
}

// ── Server Log ──

func (s *DatabaseService) MongoGetServerLog(logType string) ([]string, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.GetServerLog(logType)
}

// ── Convert to Capped ──

func (s *DatabaseService) MongoConvertToCapped(database, collection string, sizeBytes int64) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.ConvertToCapped(database, collection, sizeBytes)
}

// ── Collection Metadata ──

func (s *DatabaseService) MongoListCollectionsWithMeta(database string) ([]connector.CollectionMetadata, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.ListCollectionsWithMeta(database)
}

// ── Replica Set Info ──

func (s *DatabaseService) MongoReplicaSetStatus() (map[string]interface{}, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.ReplicaSetStatus()
}

// ── Sample Documents ──

func (s *DatabaseService) MongoSampleDocuments(database, collection string, n int) (*connector.QueryResult, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.SampleDocuments(database, collection, n)
}

// ── Index Usage Stats ──

func (s *DatabaseService) MongoIndexUsageStats(database, collection string) ([]map[string]interface{}, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.IndexUsageStats(database, collection)
}

// ── Field Type Analysis ──

func (s *DatabaseService) MongoFieldTypeAnalysis(database, collection string, sampleSize int) ([]map[string]interface{}, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.FieldTypeAnalysis(database, collection, sampleSize)
}

// ── Top Commands ──

func (s *DatabaseService) MongoTopStats() ([]map[string]interface{}, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.TopStats()
}

func (s *DatabaseService) MongoRunAggregation(database, collection, pipelineJSON string) (*connector.QueryResult, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.RunAggregation(database, collection, pipelineJSON)
}

// ── Custom Roles ──

func (s *DatabaseService) MongoListRolesDetailed(database string, showBuiltin bool) ([]connector.RoleInfo, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.ListRolesDetailed(database, showBuiltin)
}

func (s *DatabaseService) MongoCreateCustomRole(database, roleName, privilegesJSON, inheritedRolesJSON string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.CreateCustomRole(database, roleName, privilegesJSON, inheritedRolesJSON)
}

func (s *DatabaseService) MongoUpdateCustomRole(database, roleName, privilegesJSON, inheritedRolesJSON string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.UpdateCustomRole(database, roleName, privilegesJSON, inheritedRolesJSON)
}

func (s *DatabaseService) MongoDropCustomRole(database, roleName string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.DropCustomRole(database, roleName)
}

// ── GridFS ──

func (s *DatabaseService) MongoListGridFSBuckets(database string) ([]string, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.ListGridFSBuckets(database)
}

func (s *DatabaseService) MongoListGridFSFiles(database, bucket string, limit int) ([]connector.GridFSFileInfo, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.ListGridFSFiles(database, bucket, limit)
}

func (s *DatabaseService) MongoUploadGridFSFile(database, bucket, filename string, data []byte) (string, error) {
	if s.conn == nil {
		return "", fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return "", fmt.Errorf("not a MongoDB connection")
	}
	return mc.UploadGridFSFile(database, bucket, filename, data)
}

func (s *DatabaseService) MongoDownloadGridFSFile(database, bucket, fileID string) ([]byte, string, error) {
	if s.conn == nil {
		return nil, "", fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, "", fmt.Errorf("not a MongoDB connection")
	}
	return mc.DownloadGridFSFile(database, bucket, fileID)
}

func (s *DatabaseService) MongoDeleteGridFSFile(database, bucket, fileID string) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.DeleteGridFSFile(database, bucket, fileID)
}

// ── Time Series ──

func (s *DatabaseService) MongoCreateTimeSeriesCollection(database, collection, timeField, metaField, granularity string, expireAfterSeconds int64) error {
	if s.conn == nil {
		return fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return fmt.Errorf("not a MongoDB connection")
	}
	return mc.CreateTimeSeriesCollection(database, collection, timeField, metaField, granularity, expireAfterSeconds)
}

func (s *DatabaseService) MongoGetTimeSeriesInfo(database, collection string) (*connector.TimeSeriesOptions, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.GetTimeSeriesInfo(database, collection)
}

// ── Sharding ──

func (s *DatabaseService) MongoGetClusterShardingInfo() (*connector.ShardedClusterInfo, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.GetClusterShardingInfo()
}

func (s *DatabaseService) MongoGetCollectionShardingInfo(database, collection string) (*connector.CollectionShardingInfo, error) {
	if s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	mc, ok := s.conn.(*connector.MongoConnector)
	if !ok {
		return nil, fmt.Errorf("not a MongoDB connection")
	}
	return mc.GetCollectionShardingInfo(database, collection)
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
