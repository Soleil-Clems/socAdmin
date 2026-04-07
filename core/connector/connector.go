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
	DropTable(database, table string) error
	TruncateTable(database, table string) error
	AlterColumn(database, table string, op AlterColumnOp) error
	Close() error
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
