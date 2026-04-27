// @soleil-clems: Connector - Common SGBD interface (MySQL, PostgreSQL, MongoDB)
package connector

// Connector est l'interface commune pour tous les SGBD.
// MySQL et PostgreSQL l'implémentent directement.
// MongoDB l'implémente avec des adaptations (collections = tables, databases = databases).
type Connector interface {
	Connect() error
	ListDatabases() ([]string, error)
	CreateDatabase(name string) error
	DropDatabase(name string) error
	ListTables(database string) ([]string, error)
	CreateTable(database string, table string, columns []TableColumnDef) error
	DescribeTable(database, table string) ([]Column, error)
	GetRows(database, table string, limit, offset int) (*QueryResult, error)
	InsertRow(database, table string, data map[string]interface{}) error
	UpdateRow(database, table string, primaryKey map[string]interface{}, data map[string]interface{}) error
	DeleteRow(database, table string, primaryKey map[string]interface{}) error
	ExecuteQuery(database, query string) (*QueryResult, error)
	// ExecuteScript runs a multi-statement script (e.g. an SQL dump) in a
	// single round-trip. Returns the number of statements that completed
	// successfully and any fatal error. Implementations are free to abort
	// on the first error or run best-effort.
	ExecuteScript(database, script string) (int, error)
	DropTable(database, table string) error
	TruncateTable(database, table string) error
	AlterColumn(database, table string, op AlterColumnOp) error
	GetConfig() ConnectionConfig
	// QuoteIdentifier wraps an identifier (table, column, database name)
	// in the SGBD-specific quoting syntax. MySQL uses backticks, Postgres
	// uses double quotes, MongoDB has no concept of identifiers.
	QuoteIdentifier(name string) string
	Close() error
}

// ConnectionConfig is the raw connection info needed by external tools
// (mysqldump, pg_dump, mongodump, etc). Returned by Connector.GetConfig().
// Should never be serialized to JSON or logged — contains the password.
type ConnectionConfig struct {
	Host     string
	Port     int
	User     string
	Password string
}

// AlterColumnOp describes a single column-level ALTER TABLE operation.
// Op is one of: "add", "drop", "rename", "modify".
type AlterColumnOp struct {
	Op           string `json:"op"`
	Name         string `json:"name"`                    // current column name (all ops)
	NewName      string `json:"new_name,omitempty"`      // for rename
	Type         string `json:"type,omitempty"`          // for add/modify
	Nullable     bool   `json:"nullable,omitempty"`      // for add/modify
	DefaultValue string `json:"default_value,omitempty"` // for add/modify
}

type Column struct {
	Name    string
	Type    string
	Null    string
	Key     string
	Default *string
	Extra   string
}

type TableColumnDef struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	Nullable      bool   `json:"nullable"`
	PrimaryKey    bool   `json:"primary_key"`
	AutoIncrement bool   `json:"auto_increment"`
	DefaultValue  string `json:"default_value"`
}

type TableSchema struct {
	Name    string         `json:"name"`
	Columns []SchemaColumn `json:"columns"`
}

type SchemaColumn struct {
	Name       string  `json:"name"`
	Type       string  `json:"type"`
	Nullable   bool    `json:"nullable"`
	IsPrimary  bool    `json:"is_primary"`
	ForeignKey *FKInfo `json:"foreign_key,omitempty"`
}

type FKInfo struct {
	RefTable  string `json:"ref_table"`
	RefColumn string `json:"ref_column"`
}

type DatabaseInfo struct {
	Name       string `json:"name"`
	TableCount int    `json:"table_count"`
	Size       string `json:"size"` // human-readable (e.g. "12.5 MB")
	SizeBytes  int64  `json:"size_bytes"`
}

type QueryResult struct {
	Columns []string
	Rows    []map[string]interface{}
}

// TriggerInfo describes a database trigger.
type TriggerInfo struct {
	Name      string `json:"name"`
	Table     string `json:"table"`
	Event     string `json:"event"`     // INSERT, UPDATE, DELETE
	Timing    string `json:"timing"`    // BEFORE, AFTER
	Statement string `json:"statement"` // trigger body / definition
}

// RoutineInfo describes a stored procedure or function.
type RoutineInfo struct {
	Name       string `json:"name"`
	Type       string `json:"type"` // PROCEDURE or FUNCTION
	ReturnType string `json:"return_type,omitempty"`
	Body       string `json:"body"`
	ParamList  string `json:"param_list,omitempty"`
}
