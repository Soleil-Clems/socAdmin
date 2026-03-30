package connector

// Connector est l'interface commune pour tous les SGBD.
// MySQL et PostgreSQL l'implémentent directement.
// MongoDB l'implémente avec des adaptations (collections = tables, databases = databases).
type Connector interface {
	Connect() error
	ListDatabases() ([]string, error)
	ListTables(database string) ([]string, error)
	DescribeTable(database, table string) ([]Column, error)
	GetRows(database, table string, limit, offset int) (*QueryResult, error)
	ExecuteQuery(query string) (*QueryResult, error)
	Close() error
}

type Column struct {
	Name    string
	Type    string
	Null    string
	Key     string
	Default *string
	Extra   string
}

type QueryResult struct {
	Columns []string
	Rows    []map[string]interface{}
}
