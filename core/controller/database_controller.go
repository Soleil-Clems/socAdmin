// @soleil-clems: Controller - Database HTTP handlers (CRUD, queries, import/export)
package controller

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"net"

	"github.com/soleilouisol/socAdmin/core/connector"
	"github.com/soleilouisol/socAdmin/core/logger"
	"github.com/soleilouisol/socAdmin/core/service"
)

type DatabaseController struct {
	dbService *service.DatabaseService
}

func NewDatabaseController(dbService *service.DatabaseService) *DatabaseController {
	return &DatabaseController{dbService: dbService}
}

type ConnectRequest struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	Type     string `json:"type"`
}

type QueryRequest struct {
	Database string `json:"database"`
	Query    string `json:"query"`
}

type RowRequest struct {
	Data map[string]interface{} `json:"data"`
}

type UpdateRowRequest struct {
	PrimaryKey map[string]interface{} `json:"primary_key"`
	Data       map[string]interface{} `json:"data"`
}

type DeleteRowRequest struct {
	PrimaryKey map[string]interface{} `json:"primary_key"`
}

type CreateDatabaseRequest struct {
	Name string `json:"name"`
}

type CreateTableRequest struct {
	Name    string                    `json:"name"`
	Columns []connector.TableColumnDef `json:"columns"`
}

func (c *DatabaseController) ConnectionStatus(w http.ResponseWriter, r *http.Request) {
	info := c.dbService.GetConnectionInfo()
	if info == nil {
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"connected": false,
		})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"connected": true,
		"host":      info.Host,
		"port":      info.Port,
		"user":      info.User,
		"type":      info.DbType,
	})
}

func (c *DatabaseController) Connect(w http.ResponseWriter, r *http.Request) {
	var req ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	dbType := req.Type
	if dbType == "" {
		dbType = "mysql"
	}

	// SSRF protection — block connections to link-local / cloud metadata IPs
	if isBlockedHost(req.Host) {
		jsonError(w, http.StatusBadRequest, "connection to this address is not allowed")
		return
	}

	if err := c.dbService.Connect(req.Host, req.Port, req.User, req.Password, dbType); err != nil {
		logger.Connect(requestUserID(r), requestIP(r), dbType, req.Host, req.Port, false)
		jsonError(w, http.StatusBadGateway, err.Error())
		return
	}

	logger.Connect(requestUserID(r), requestIP(r), dbType, req.Host, req.Port, true)
	jsonResponse(w, http.StatusOK, map[string]string{"status": "connected", "type": dbType})
}

func (c *DatabaseController) Disconnect(w http.ResponseWriter, r *http.Request) {
	if err := c.dbService.Disconnect(); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "disconnected"})
}

func (c *DatabaseController) ListPreconfigured(w http.ResponseWriter, r *http.Request) {
	preconfigs := c.dbService.ListPreconfigured()
	if preconfigs == nil {
		preconfigs = []service.PreconfiguredDB{}
	}
	// Include passwords so the frontend can pre-fill the connect form.
	// This endpoint is auth-protected; credentials come from server env vars.
	type preconfigResp struct {
		Type     string `json:"type"`
		Host     string `json:"host"`
		Port     int    `json:"port"`
		User     string `json:"user"`
		Password string `json:"password"`
	}
	out := make([]preconfigResp, len(preconfigs))
	for i, pc := range preconfigs {
		out[i] = preconfigResp{Type: pc.Type, Host: pc.Host, Port: pc.Port, User: pc.User, Password: pc.Password}
	}
	jsonResponse(w, http.StatusOK, out)
}

func (c *DatabaseController) ListDatabases(w http.ResponseWriter, r *http.Request) {
	databases, err := c.dbService.ListDatabases()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, databases)
}

func (c *DatabaseController) ListDatabasesWithStats(w http.ResponseWriter, r *http.Request) {
	infos, err := c.dbService.ListDatabasesWithStats()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, infos)
}

// GetSchema returns the full schema for a database (tables, columns, foreign keys)
func (c *DatabaseController) GetSchema(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	if !validatePathIdent(w, db, "database") {
		return
	}

	schema, err := c.dbService.GetSchema(db)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, schema)
}

// SearchGlobal searches for a term across all tables in a database
func (c *DatabaseController) SearchGlobal(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	if !validatePathIdent(w, db, "database") {
		return
	}

	q := r.URL.Query().Get("q")
	if q == "" {
		jsonError(w, http.StatusBadRequest, "query parameter 'q' is required")
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 5 // results per table
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 50 {
			limit = l
		}
	}

	results, err := c.dbService.SearchGlobal(db, q, limit)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, results)
}

func (c *DatabaseController) CreateDatabase(w http.ResponseWriter, r *http.Request) {
	var req CreateDatabaseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		jsonError(w, http.StatusBadRequest, "name is required")
		return
	}
	if !validatePathIdent(w, req.Name, "database name") {
		return
	}

	if err := c.dbService.CreateDatabase(req.Name); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "create_database", req.Name)
	jsonResponse(w, http.StatusCreated, map[string]string{"status": "created"})
}

func (c *DatabaseController) DropDatabase(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	if !validatePathIdent(w, db, "database") {
		return
	}

	if err := c.dbService.DropDatabase(db); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "drop_database", db)
	jsonResponse(w, http.StatusOK, map[string]string{"status": "dropped"})
}

func (c *DatabaseController) CreateTable(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	if !validatePathIdent(w, db, "database") {
		return
	}

	var req CreateTableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if !validatePathIdent(w, req.Name, "table name") {
		return
	}
	for _, col := range req.Columns {
		if col.Name != "" {
			if !validatePathIdent(w, col.Name, "column name") {
				return
			}
		}
	}

	if err := c.dbService.CreateTable(db, req.Name, req.Columns); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, map[string]string{"status": "created"})
}

func (c *DatabaseController) ListTables(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	if !validatePathIdent(w, db, "database") {
		return
	}

	tables, err := c.dbService.ListTables(db)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, tables)
}

func (c *DatabaseController) DescribeTable(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")
	if !validatePathIdent(w, db, "database") || !validatePathIdent(w, table, "table") {
		return
	}

	columns, err := c.dbService.DescribeTable(db, table)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, columns)
}

func (c *DatabaseController) GetRows(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")
	if !validatePathIdent(w, db, "database") || !validatePathIdent(w, table, "table") {
		return
	}

	limit := 50
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 1000 {
			limit = v
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	result, err := c.dbService.GetRows(db, table, limit, offset)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, result)
}

func (c *DatabaseController) ExecuteQuery(w http.ResponseWriter, r *http.Request) {
	var req QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Query == "" {
		jsonError(w, http.StatusBadRequest, "query is required")
		return
	}

	// Multi-statement detection: if the query contains more than one real
	// statement (ignoring trailing semicolons + comments), route to
	// ExecuteScript so the whole block is executed atomically by the
	// driver. A single-statement query still goes through ExecuteQuery
	// so we can return rows.
	start := time.Now()
	if isMultiStatement(req.Query) {
		if req.Database == "" {
			jsonError(w, http.StatusBadRequest, "database is required for multi-statement scripts")
			return
		}
		_, err := c.dbService.ExecuteScript(req.Database, req.Query)
		duration := time.Since(start)
		if err != nil {
			logger.Query(requestUserID(r), requestIP(r), req.Database, duration, 0, true)
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
		logger.Query(requestUserID(r), requestIP(r), req.Database, duration, 0, false)
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"Columns": []string{"result"},
			"Rows":    []map[string]interface{}{{"result": "script executed"}},
		})
		return
	}

	result, err := c.dbService.ExecuteQuery(req.Database, req.Query)
	duration := time.Since(start)

	if err != nil {
		logger.Query(requestUserID(r), requestIP(r), req.Database, duration, 0, true)
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	rowCount := 0
	if result != nil {
		rowCount = len(result.Rows)
	}
	logger.Query(requestUserID(r), requestIP(r), req.Database, duration, rowCount, false)
	jsonResponse(w, http.StatusOK, result)
}

func (c *DatabaseController) DropTable(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")
	if !validatePathIdent(w, db, "database") || !validatePathIdent(w, table, "table") {
		return
	}

	if err := c.dbService.DropTable(db, table); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "drop_table", fmt.Sprintf("%s.%s", db, table))
	jsonResponse(w, http.StatusOK, map[string]string{"status": "dropped"})
}

func (c *DatabaseController) AlterColumn(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")
	if !validatePathIdent(w, db, "database") || !validatePathIdent(w, table, "table") {
		return
	}

	var op connector.AlterColumnOp
	if err := json.NewDecoder(r.Body).Decode(&op); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if op.Op != "add" && op.Op != "drop" && op.Op != "rename" && op.Op != "modify" {
		jsonError(w, http.StatusBadRequest, "op must be one of: add, drop, rename, modify")
		return
	}
	if err := connector.ValidateIdentifier(op.Name); op.Name != "" && err != nil {
		jsonError(w, http.StatusBadRequest, "column name: "+err.Error())
		return
	}
	if op.NewName != "" {
		if err := connector.ValidateIdentifier(op.NewName); err != nil {
			jsonError(w, http.StatusBadRequest, "new column name: "+err.Error())
			return
		}
	}

	if err := c.dbService.AlterColumn(db, table, op); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "alter_column_"+op.Op, fmt.Sprintf("%s.%s.%s", db, table, op.Name))
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (c *DatabaseController) TruncateTable(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")
	if !validatePathIdent(w, db, "database") || !validatePathIdent(w, table, "table") {
		return
	}

	if err := c.dbService.TruncateTable(db, table); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "truncate_table", fmt.Sprintf("%s.%s", db, table))
	jsonResponse(w, http.StatusOK, map[string]string{"status": "truncated"})
}

func (c *DatabaseController) InsertRow(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req RowRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := c.dbService.InsertRow(db, table, req.Data); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, map[string]string{"status": "inserted"})
}

func (c *DatabaseController) UpdateRow(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req UpdateRowRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := c.dbService.UpdateRow(db, table, req.PrimaryKey, req.Data); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (c *DatabaseController) DeleteRow(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req DeleteRowRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := c.dbService.DeleteRow(db, table, req.PrimaryKey); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (c *DatabaseController) ExportTable(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")
	format := r.URL.Query().Get("format")

	logger.Export(requestUserID(r), requestIP(r), db, table, format)

	switch format {
	case "csv":
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.csv"`, table))
		if err := c.dbService.ExportCSV(w, db, table); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	case "json":
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.json"`, table))
		if err := c.dbService.ExportJSON(w, db, table); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	case "sql":
		w.Header().Set("Content-Type", "application/sql")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.sql"`, table))
		if err := c.dbService.ExportSQL(w, db, table); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	case "yaml":
		w.Header().Set("Content-Type", "application/x-yaml")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.yaml"`, table))
		if err := c.dbService.ExportYAML(w, db, table); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	default:
		jsonError(w, http.StatusBadRequest, "format must be csv, json, sql, or yaml")
	}
}

func (c *DatabaseController) ExportDatabase(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "sql"
	}

	logger.Export(requestUserID(r), requestIP(r), db, "", format)

	switch format {
	case "sql":
		w.Header().Set("Content-Type", "application/sql")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.sql"`, db))
		if err := c.dbService.ExportDatabaseSQL(w, db); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	case "json":
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.json"`, db))
		if err := c.dbService.ExportDatabaseJSON(w, db); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	case "csv":
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.csv"`, db))
		if err := c.dbService.ExportDatabaseCSV(w, db); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	case "yaml":
		w.Header().Set("Content-Type", "application/x-yaml")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.yaml"`, db))
		if err := c.dbService.ExportDatabaseYAML(w, db); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	default:
		jsonError(w, http.StatusBadRequest, "format must be csv, json, sql, or yaml")
	}
}

func (c *DatabaseController) ListUsers(w http.ResponseWriter, r *http.Request) {
	result, err := c.dbService.ListUsers()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, result)
}

func (c *DatabaseController) ChangeDBUserPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username    string `json:"username"`
		Host        string `json:"host"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.Username == "" || req.NewPassword == "" {
		jsonError(w, http.StatusBadRequest, "username and new_password are required")
		return
	}
	if req.Host == "" {
		req.Host = "%"
	}

	logger.Admin(requestUserID(r), requestIP(r), "CHANGE_DB_PASSWORD", req.Username+"@"+req.Host)

	if err := c.dbService.ChangeDBUserPassword(req.Username, req.Host, req.NewPassword); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (c *DatabaseController) ServerStatus(w http.ResponseWriter, r *http.Request) {
	result, err := c.dbService.ServerStatus()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, result)
}

func (c *DatabaseController) ImportSQL(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	r.Body = http.MaxBytesReader(w, r.Body, 100<<20) // 100 MB
	body, err := io.ReadAll(r.Body)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "failed to read body")
		return
	}

	sql := string(body)

	// Reject native dumps — they include directives (SET, USE, /*!...*/,
	// CREATE DATABASE) that our simple Exec path can't reliably replay.
	// The user should go through the Restore endpoint instead, which pipes
	// the file to mysql / psql directly.
	if looksLikeNativeDump(sql) {
		jsonError(w, http.StatusBadRequest,
			"This looks like a native dump file (mysqldump / pg_dump output). "+
				"Use the Restore button on the database row instead — Import SQL "+
				"is meant for hand-written scripts, not full backups.")
		return
	}

	// Delegate to the driver which knows how to parse comments, strings
	// and delimiters correctly — way more reliable than our regex-based
	// splitSQL. On failure we return the raw driver error so the user
	// sees exactly which statement broke.
	if _, err := c.dbService.ExecuteScript(db, sql); err != nil {
		logger.Import(requestUserID(r), requestIP(r), db, "", "sql", 0)
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	logger.Import(requestUserID(r), requestIP(r), db, "", "sql", 1)
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"executed": 1,
		"errors":   []string{},
	})
}

func (c *DatabaseController) ImportCSV(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	r.Body = http.MaxBytesReader(w, r.Body, 100<<20) // 100 MB
	body, err := io.ReadAll(r.Body)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "failed to read body")
		return
	}

	reader := csv.NewReader(strings.NewReader(string(body)))
	records, err := reader.ReadAll()
	if err != nil {
		jsonError(w, http.StatusBadRequest, "invalid CSV: "+err.Error())
		return
	}

	if len(records) < 2 {
		jsonError(w, http.StatusBadRequest, "CSV must have a header row and at least one data row")
		return
	}

	headers := records[0]
	inserted := 0
	var errors []string

	for i, record := range records[1:] {
		data := make(map[string]interface{})
		for j, col := range headers {
			if j < len(record) {
				val := strings.TrimSpace(record[j])
				if val == "" || strings.EqualFold(val, "null") {
					data[col] = nil
				} else {
					data[col] = val
				}
			}
		}
		if err := c.dbService.InsertRow(db, table, data); err != nil {
			errors = append(errors, fmt.Sprintf("row %d: %s", i+2, err.Error()))
		} else {
			inserted++
		}
	}

	logger.Import(requestUserID(r), requestIP(r), db, table, "csv", inserted)

	result := map[string]interface{}{
		"inserted": inserted,
		"errors":   errors,
	}
	jsonResponse(w, http.StatusOK, result)
}

func (c *DatabaseController) ImportJSON(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	r.Body = http.MaxBytesReader(w, r.Body, 100<<20) // 100 MB
	var rows []map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&rows); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid JSON array: "+err.Error())
		return
	}

	inserted := 0
	var errors []string

	for i, row := range rows {
		if err := c.dbService.InsertRow(db, table, row); err != nil {
			errors = append(errors, fmt.Sprintf("row %d: %s", i+1, err.Error()))
		} else {
			inserted++
		}
	}

	logger.Import(requestUserID(r), requestIP(r), db, table, "json", inserted)

	result := map[string]interface{}{
		"inserted": inserted,
		"errors":   errors,
	}
	jsonResponse(w, http.StatusOK, result)
}

// splitSQL splits a SQL dump into individual statements
// isMultiStatement returns true if the SQL string contains more than one
// semicolon-terminated statement (ignoring comments and trailing
// whitespace). We use this to route the query editor between the
// single-statement ExecuteQuery path (which can return rows) and the
// multi-statement ExecuteScript path.
func isMultiStatement(sql string) bool {
	stmts := splitSQL(sql)
	count := 0
	for _, s := range stmts {
		if strings.TrimSpace(s) != "" {
			count++
			if count > 1 {
				return true
			}
		}
	}
	return false
}

// looksLikeNativeDump sniffs the first few KB of an SQL file for the
// telltale comments / directives produced by mysqldump and pg_dump. We
// use this to reject dumps in Import SQL (where they'd fail anyway) and
// direct the user to Restore instead.
func looksLikeNativeDump(sql string) bool {
	head := sql
	if len(head) > 4096 {
		head = head[:4096]
	}
	head = strings.ToLower(head)

	markers := []string{
		"-- mysql dump",       // mysqldump
		"-- mariadb dump",     // mariadb-dump
		"-- host:",            // mysqldump header
		"-- server version",   // mysqldump header
		"-- postgresql database dump", // pg_dump
		"-- dumped from database", // pg_dump
		"-- dumped by pg_dump",    // pg_dump
		"/*!40",               // mysqldump conditional comments
		"/*!50",
	}
	for _, m := range markers {
		if strings.Contains(head, m) {
			return true
		}
	}
	return false
}

func splitSQL(sql string) []string {
	var statements []string
	var current strings.Builder
	inString := false
	var stringChar byte

	for i := 0; i < len(sql); i++ {
		ch := sql[i]

		if inString {
			current.WriteByte(ch)
			if ch == stringChar && (i+1 >= len(sql) || sql[i+1] != stringChar) {
				inString = false
			} else if ch == stringChar {
				i++ // skip escaped quote
				current.WriteByte(sql[i])
			}
			continue
		}

		if ch == '\'' || ch == '"' {
			inString = true
			stringChar = ch
			current.WriteByte(ch)
			continue
		}

		// Skip -- line comments
		if ch == '-' && i+1 < len(sql) && sql[i+1] == '-' {
			for i < len(sql) && sql[i] != '\n' {
				i++
			}
			continue
		}

		if ch == ';' {
			stmt := strings.TrimSpace(current.String())
			if stmt != "" {
				statements = append(statements, stmt)
			}
			current.Reset()
			continue
		}

		current.WriteByte(ch)
	}

	// Last statement without semicolon
	stmt := strings.TrimSpace(current.String())
	if stmt != "" {
		statements = append(statements, stmt)
	}

	return statements
}

// ── MongoDB-specific handlers ──

type MongoFindRequest struct {
	Filter     string `json:"filter"`     // JSON string, e.g. {"age": {"$gt": 25}}
	Sort       string `json:"sort"`       // JSON string, e.g. {"name": 1}
	Projection string `json:"projection"` // JSON string, e.g. {"name": 1, "age": 1}
	Limit      int    `json:"limit"`
	Skip       int    `json:"skip"`
}

func (c *DatabaseController) MongoFind(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req MongoFindRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Limit <= 0 || req.Limit > 1000 {
		req.Limit = 50
	}
	if req.Skip < 0 {
		req.Skip = 0
	}

	result, total, err := c.dbService.MongoFind(db, table, req.Filter, req.Sort, req.Projection, req.Limit, req.Skip)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"Columns": result.Columns,
		"Rows":    result.Rows,
		"total":   total,
	})
}

func (c *DatabaseController) MongoCount(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	count, err := c.dbService.MongoCount(db, table)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{"count": count})
}

func (c *DatabaseController) MongoListIndexes(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	indexes, err := c.dbService.MongoListIndexes(db, table)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, indexes)
}

type MongoCreateIndexRequest struct {
	Keys            string `json:"keys"`             // JSON string, e.g. {"field": 1}
	Unique          bool   `json:"unique"`
	Sparse          bool   `json:"sparse"`
	Hidden          bool   `json:"hidden"`
	Name            string `json:"name"`
	TTLSeconds      int    `json:"ttl_seconds"`
	PartialFilter   string `json:"partial_filter"`   // JSON
	Collation       string `json:"collation"`        // JSON
	WildcardProj    string `json:"wildcard_proj"`    // JSON
	DefaultLanguage string `json:"default_language"` // text indexes
	TextWeights     string `json:"text_weights"`     // JSON
}

func (c *DatabaseController) MongoCreateIndex(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req MongoCreateIndexRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Keys == "" {
		jsonError(w, http.StatusBadRequest, "keys are required")
		return
	}

	opts := connector.IndexCreateOptions{
		Unique:          req.Unique,
		Sparse:          req.Sparse,
		Hidden:          req.Hidden,
		Name:            req.Name,
		TTLSeconds:      req.TTLSeconds,
		PartialFilter:   req.PartialFilter,
		Collation:       req.Collation,
		WildcardProj:    req.WildcardProj,
		DefaultLanguage: req.DefaultLanguage,
		TextWeights:     req.TextWeights,
	}
	if err := c.dbService.MongoCreateIndexFull(db, table, req.Keys, opts); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, map[string]string{"status": "created"})
}

type MongoSetIndexHiddenRequest struct {
	Name   string `json:"name"`
	Hidden bool   `json:"hidden"`
}

func (c *DatabaseController) MongoSetIndexHidden(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req MongoSetIndexHiddenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		jsonError(w, http.StatusBadRequest, "index name is required")
		return
	}

	if err := c.dbService.MongoSetIndexHidden(db, table, req.Name, req.Hidden); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	action := "unhidden"
	if req.Hidden {
		action = "hidden"
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": action})
}

type MongoDropIndexRequest struct {
	Name string `json:"name"`
}

func (c *DatabaseController) MongoDropIndex(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req MongoDropIndexRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		jsonError(w, http.StatusBadRequest, "index name is required")
		return
	}

	if err := c.dbService.MongoDropIndex(db, table, req.Name); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"status": "dropped"})
}

func (c *DatabaseController) MongoCollectionStats(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	stats, err := c.dbService.MongoCollectionStats(db, table)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, stats)
}

type MongoExplainRequest struct {
	Filter string `json:"filter"`
	Sort   string `json:"sort"`
}

func (c *DatabaseController) MongoExplain(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req MongoExplainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	plan, err := c.dbService.MongoExplain(db, table, req.Filter, req.Sort)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, plan)
}

// ── Bulk Operations ──

func (c *DatabaseController) MongoInsertMany(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var docs []map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&docs); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid JSON array: "+err.Error())
		return
	}
	if len(docs) == 0 {
		jsonError(w, http.StatusBadRequest, "at least one document is required")
		return
	}

	inserted, err := c.dbService.MongoInsertMany(db, table, docs)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, map[string]interface{}{"inserted": inserted})
}

type MongoUpdateManyRequest struct {
	Filter string `json:"filter"`
	Update string `json:"update"`
}

func (c *DatabaseController) MongoUpdateMany(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req MongoUpdateManyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Filter == "" || req.Update == "" {
		jsonError(w, http.StatusBadRequest, "filter and update are required")
		return
	}

	matched, modified, err := c.dbService.MongoUpdateMany(db, table, req.Filter, req.Update)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"matched":  matched,
		"modified": modified,
	})
}

type MongoDeleteManyRequest struct {
	Filter string `json:"filter"`
}

func (c *DatabaseController) MongoDeleteMany(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req MongoDeleteManyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Filter == "" || req.Filter == "{}" {
		jsonError(w, http.StatusBadRequest, "a non-empty filter is required (use truncate to delete all)")
		return
	}

	deleted, err := c.dbService.MongoDeleteMany(db, table, req.Filter)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "delete_many", fmt.Sprintf("%s.%s (%d deleted)", db, table, deleted))
	jsonResponse(w, http.StatusOK, map[string]interface{}{"deleted": deleted})
}

// ── Distinct ──

type MongoDistinctRequest struct {
	Field  string `json:"field"`
	Filter string `json:"filter"`
}

func (c *DatabaseController) MongoDistinct(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req MongoDistinctRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Field == "" {
		jsonError(w, http.StatusBadRequest, "field is required")
		return
	}

	values, err := c.dbService.MongoDistinct(db, table, req.Field, req.Filter)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"field":  req.Field,
		"values": values,
		"count":  len(values),
	})
}

// ── MongoDB User Management ──

type MongoCreateUserRequest struct {
	Username string                   `json:"username"`
	Password string                   `json:"password"`
	Database string                   `json:"database"`
	Roles    []map[string]interface{} `json:"roles"`
}

func (c *DatabaseController) MongoCreateUser(w http.ResponseWriter, r *http.Request) {
	var req MongoCreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Username == "" || req.Password == "" {
		jsonError(w, http.StatusBadRequest, "username and password are required")
		return
	}
	if req.Database == "" {
		req.Database = "admin"
	}

	if err := c.dbService.MongoCreateUser(req.Database, req.Username, req.Password, req.Roles); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "create_mongo_user", req.Username+"@"+req.Database)
	jsonResponse(w, http.StatusCreated, map[string]string{"status": "created"})
}

type MongoDropUserRequest struct {
	Username string `json:"username"`
	Database string `json:"database"`
}

func (c *DatabaseController) MongoDropUser(w http.ResponseWriter, r *http.Request) {
	var req MongoDropUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Username == "" {
		jsonError(w, http.StatusBadRequest, "username is required")
		return
	}
	if req.Database == "" {
		req.Database = "admin"
	}

	if err := c.dbService.MongoDropUser(req.Database, req.Username); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "drop_mongo_user", req.Username+"@"+req.Database)
	jsonResponse(w, http.StatusOK, map[string]string{"status": "dropped"})
}

type MongoUpdateUserRolesRequest struct {
	Username string                   `json:"username"`
	Database string                   `json:"database"`
	Roles    []map[string]interface{} `json:"roles"`
}

func (c *DatabaseController) MongoUpdateUserRoles(w http.ResponseWriter, r *http.Request) {
	var req MongoUpdateUserRolesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Username == "" {
		jsonError(w, http.StatusBadRequest, "username is required")
		return
	}
	if req.Database == "" {
		req.Database = "admin"
	}

	if err := c.dbService.MongoUpdateUserRoles(req.Database, req.Username, req.Roles); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "update_mongo_user_roles", req.Username+"@"+req.Database)
	jsonResponse(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (c *DatabaseController) MongoListRoles(w http.ResponseWriter, r *http.Request) {
	db := r.URL.Query().Get("db")
	if db == "" {
		db = "admin"
	}

	roles, err := c.dbService.MongoListRoles(db)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, roles)
}

// ── currentOp / killOp ──

func (c *DatabaseController) MongoCurrentOp(w http.ResponseWriter, r *http.Request) {
	ops, err := c.dbService.MongoCurrentOp()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, ops)
}

type MongoKillOpRequest struct {
	OpID interface{} `json:"opid"`
}

func (c *DatabaseController) MongoKillOp(w http.ResponseWriter, r *http.Request) {
	var req MongoKillOpRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.OpID == nil {
		jsonError(w, http.StatusBadRequest, "opid is required")
		return
	}

	if err := c.dbService.MongoKillOp(req.OpID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "kill_op", fmt.Sprintf("%v", req.OpID))
	jsonResponse(w, http.StatusOK, map[string]string{"status": "killed"})
}

// ── MongoDB Views ──

type MongoCreateViewRequest struct {
	Name     string `json:"name"`
	Source   string `json:"source"`
	Pipeline string `json:"pipeline"` // JSON array string
}

func (c *DatabaseController) MongoCreateView(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	var req MongoCreateViewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.Source == "" || req.Pipeline == "" {
		jsonError(w, http.StatusBadRequest, "name, source, and pipeline are required")
		return
	}

	if err := c.dbService.MongoCreateView(db, req.Name, req.Source, req.Pipeline); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "create_view", fmt.Sprintf("%s.%s (on %s)", db, req.Name, req.Source))
	jsonResponse(w, http.StatusCreated, map[string]string{"status": "created"})
}

func (c *DatabaseController) MongoListViews(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	views, err := c.dbService.MongoListViews(db)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if views == nil {
		views = []map[string]interface{}{}
	}

	jsonResponse(w, http.StatusOK, views)
}

// ── Schema Validation ──

func (c *DatabaseController) MongoGetValidation(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	rules, err := c.dbService.MongoGetValidation(db, table)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, rules)
}

type MongoSetValidationRequest struct {
	Validator       string `json:"validator"`
	ValidationLevel string `json:"validation_level"`
	ValidationAction string `json:"validation_action"`
}

func (c *DatabaseController) MongoSetValidation(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req MongoSetValidationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := c.dbService.MongoSetValidation(db, table, req.Validator, req.ValidationLevel, req.ValidationAction); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "set_validation", fmt.Sprintf("%s.%s", db, table))
	jsonResponse(w, http.StatusOK, map[string]string{"status": "updated"})
}

// ── Rename Collection ──

type MongoRenameCollectionRequest struct {
	NewName string `json:"new_name"`
}

func (c *DatabaseController) MongoRenameCollection(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req MongoRenameCollectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.NewName == "" {
		jsonError(w, http.StatusBadRequest, "new_name is required")
		return
	}

	if err := c.dbService.MongoRenameCollection(db, table, req.NewName); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "rename_collection", fmt.Sprintf("%s.%s → %s", db, table, req.NewName))
	jsonResponse(w, http.StatusOK, map[string]string{"status": "renamed"})
}

// ── Database Profiler ──

func (c *DatabaseController) MongoGetProfilingLevel(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	data, err := c.dbService.MongoGetProfilingLevel(db)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, data)
}

type MongoSetProfilingRequest struct {
	Level  int `json:"level"`
	SlowMs int `json:"slowms"`
}

func (c *DatabaseController) MongoSetProfilingLevel(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	var req MongoSetProfilingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Level < 0 || req.Level > 2 {
		jsonError(w, http.StatusBadRequest, "level must be 0, 1, or 2")
		return
	}

	if err := c.dbService.MongoSetProfilingLevel(db, req.Level, req.SlowMs); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "set_profiling", fmt.Sprintf("%s level=%d slowms=%d", db, req.Level, req.SlowMs))
	jsonResponse(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (c *DatabaseController) MongoGetProfileData(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}

	data, err := c.dbService.MongoGetProfileData(db, limit)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if data == nil {
		data = []map[string]interface{}{}
	}
	jsonResponse(w, http.StatusOK, data)
}

// ── Database Stats ──

func (c *DatabaseController) MongoDatabaseStats(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	stats, err := c.dbService.MongoDatabaseStats(db)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, stats)
}

// ── Capped Collections ──

type MongoCreateCappedRequest struct {
	Name      string `json:"name"`
	SizeBytes int64  `json:"size_bytes"`
	MaxDocs   int64  `json:"max_docs"`
}

func (c *DatabaseController) MongoCreateCappedCollection(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	var req MongoCreateCappedRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		jsonError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.SizeBytes <= 0 {
		jsonError(w, http.StatusBadRequest, "size_bytes must be positive")
		return
	}

	if err := c.dbService.MongoCreateCappedCollection(db, req.Name, req.SizeBytes, req.MaxDocs); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "create_capped_collection", fmt.Sprintf("%s.%s", db, req.Name))
	jsonResponse(w, http.StatusCreated, map[string]string{"status": "created"})
}

func (c *DatabaseController) MongoIsCollectionCapped(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	capped, err := c.dbService.MongoIsCollectionCapped(db, table)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"capped": capped})
}

// ── Compact Collection ──

func (c *DatabaseController) MongoCompactCollection(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	if err := c.dbService.MongoCompactCollection(db, table); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "compact_collection", fmt.Sprintf("%s.%s", db, table))
	jsonResponse(w, http.StatusOK, map[string]string{"status": "compacted"})
}

// ── Duplicate Collection ──

type MongoDuplicateRequest struct {
	Target string `json:"target"`
}

func (c *DatabaseController) MongoDuplicateCollection(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req MongoDuplicateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Target == "" {
		jsonError(w, http.StatusBadRequest, "target name is required")
		return
	}

	if err := c.dbService.MongoDuplicateCollection(db, table, req.Target); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "duplicate_collection", fmt.Sprintf("%s.%s → %s", db, table, req.Target))
	jsonResponse(w, http.StatusCreated, map[string]string{"status": "duplicated"})
}

// ── Server Log ──

func (c *DatabaseController) MongoGetServerLog(w http.ResponseWriter, r *http.Request) {
	logType := r.URL.Query().Get("type")
	if logType == "" {
		logType = "global"
	}

	lines, err := c.dbService.MongoGetServerLog(logType)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if lines == nil {
		lines = []string{}
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"log":   lines,
		"total": len(lines),
	})
}

// ── Convert to Capped ──

type MongoConvertToCappedRequest struct {
	SizeBytes int64 `json:"size_bytes"`
}

func (c *DatabaseController) MongoConvertToCapped(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req MongoConvertToCappedRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.SizeBytes <= 0 {
		jsonError(w, http.StatusBadRequest, "size_bytes must be positive")
		return
	}

	if err := c.dbService.MongoConvertToCapped(db, table, req.SizeBytes); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "convert_to_capped", fmt.Sprintf("%s.%s size=%d", db, table, req.SizeBytes))
	jsonResponse(w, http.StatusOK, map[string]string{"status": "converted"})
}

// ── Collection Metadata ──

func (c *DatabaseController) MongoListCollectionsWithMeta(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	metas, err := c.dbService.MongoListCollectionsWithMeta(db)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if metas == nil {
		metas = []connector.CollectionMetadata{}
	}
	jsonResponse(w, http.StatusOK, metas)
}

// ── Replica Set Info ──

func (c *DatabaseController) MongoReplicaSetStatus(w http.ResponseWriter, r *http.Request) {
	status, err := c.dbService.MongoReplicaSetStatus()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if status == nil {
		jsonResponse(w, http.StatusOK, map[string]interface{}{"replica_set": false})
		return
	}
	status["replica_set"] = true
	jsonResponse(w, http.StatusOK, status)
}

// ── Sample Documents ──

func (c *DatabaseController) MongoSampleDocuments(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	n := 10
	if s := r.URL.Query().Get("n"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v > 0 && v <= 100 {
			n = v
		}
	}

	result, err := c.dbService.MongoSampleDocuments(db, table, n)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, result)
}

// ── Custom Roles ──

func (c *DatabaseController) MongoListRolesDetailed(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	showBuiltin := r.URL.Query().Get("builtin") == "1"

	roles, err := c.dbService.MongoListRolesDetailed(db, showBuiltin)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, roles)
}

type CreateRoleRequest struct {
	Name           string `json:"name"`
	Privileges     string `json:"privileges"`
	InheritedRoles string `json:"inherited_roles"`
}

func (c *DatabaseController) MongoCreateCustomRole(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	var req CreateRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Name == "" {
		jsonError(w, http.StatusBadRequest, "role name is required")
		return
	}

	if err := c.dbService.MongoCreateCustomRole(db, req.Name, req.Privileges, req.InheritedRoles); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "created"})
}

func (c *DatabaseController) MongoUpdateCustomRole(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	roleName := r.PathValue("role")

	var req CreateRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := c.dbService.MongoUpdateCustomRole(db, roleName, req.Privileges, req.InheritedRoles); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (c *DatabaseController) MongoDropCustomRole(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	roleName := r.PathValue("role")

	if err := c.dbService.MongoDropCustomRole(db, roleName); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "dropped"})
}

// ── GridFS ──

func (c *DatabaseController) MongoListGridFSBuckets(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	buckets, err := c.dbService.MongoListGridFSBuckets(db)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if buckets == nil {
		buckets = []string{}
	}
	jsonResponse(w, http.StatusOK, buckets)
}

func (c *DatabaseController) MongoListGridFSFiles(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	bucket := r.PathValue("bucket")

	limit := 200
	if s := r.URL.Query().Get("limit"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v > 0 {
			limit = v
		}
	}

	files, err := c.dbService.MongoListGridFSFiles(db, bucket, limit)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if files == nil {
		files = []connector.GridFSFileInfo{}
	}
	jsonResponse(w, http.StatusOK, files)
}

func (c *DatabaseController) MongoUploadGridFSFile(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	bucket := r.PathValue("bucket")

	// Max 50MB upload
	r.Body = http.MaxBytesReader(w, r.Body, 50<<20)
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		jsonError(w, http.StatusBadRequest, "Failed to parse upload: "+err.Error())
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, http.StatusBadRequest, "Missing file field")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "Failed to read file")
		return
	}

	id, err := c.dbService.MongoUploadGridFSFile(db, bucket, header.Filename, data)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"id":       id,
		"filename": header.Filename,
		"size":     len(data),
	})
}

func (c *DatabaseController) MongoDownloadGridFSFile(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	bucket := r.PathValue("bucket")
	fileID := r.PathValue("id")

	data, filename, err := c.dbService.MongoDownloadGridFSFile(db, bucket, fileID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Write(data)
}

func (c *DatabaseController) MongoDeleteGridFSFile(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	bucket := r.PathValue("bucket")
	fileID := r.PathValue("id")

	if err := c.dbService.MongoDeleteGridFSFile(db, bucket, fileID); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ── Run Aggregation Pipeline ──

type AggregationRequest struct {
	Pipeline string `json:"pipeline"`
}

func (c *DatabaseController) MongoRunAggregation(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	var req AggregationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	result, err := c.dbService.MongoRunAggregation(db, table, req.Pipeline)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, result)
}

// ── Index Usage Stats ──

func (c *DatabaseController) MongoIndexUsageStats(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	stats, err := c.dbService.MongoIndexUsageStats(db, table)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, stats)
}

// ── Field Type Analysis ──

func (c *DatabaseController) MongoFieldTypeAnalysis(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	sampleSize := 100
	if s := r.URL.Query().Get("sample"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v > 0 && v <= 1000 {
			sampleSize = v
		}
	}

	analysis, err := c.dbService.MongoFieldTypeAnalysis(db, table, sampleSize)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, analysis)
}

// ── Top Stats ──

func (c *DatabaseController) MongoTopStats(w http.ResponseWriter, r *http.Request) {
	stats, err := c.dbService.MongoTopStats()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, stats)
}

// ── Time Series Collections ──

type MongoCreateTimeSeriesRequest struct {
	Name               string `json:"name"`
	TimeField          string `json:"timeField"`
	MetaField          string `json:"metaField,omitempty"`
	Granularity        string `json:"granularity,omitempty"`
	ExpireAfterSeconds int64  `json:"expireAfterSeconds,omitempty"`
}

func (c *DatabaseController) MongoCreateTimeSeriesCollection(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	var req MongoCreateTimeSeriesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		jsonError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.TimeField == "" {
		jsonError(w, http.StatusBadRequest, "timeField is required")
		return
	}
	if req.Granularity != "" && req.Granularity != "seconds" && req.Granularity != "minutes" && req.Granularity != "hours" {
		jsonError(w, http.StatusBadRequest, "granularity must be seconds, minutes or hours")
		return
	}

	if err := c.dbService.MongoCreateTimeSeriesCollection(db, req.Name, req.TimeField, req.MetaField, req.Granularity, req.ExpireAfterSeconds); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "create_timeseries_collection", fmt.Sprintf("%s.%s", db, req.Name))
	jsonResponse(w, http.StatusCreated, map[string]string{"status": "created"})
}

func (c *DatabaseController) MongoGetTimeSeriesInfo(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	info, err := c.dbService.MongoGetTimeSeriesInfo(db, table)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if info == nil {
		jsonResponse(w, http.StatusOK, map[string]interface{}{"timeseries": nil})
		return
	}
	jsonResponse(w, http.StatusOK, info)
}

// ── Sharding ──

func (c *DatabaseController) MongoGetClusterShardingInfo(w http.ResponseWriter, r *http.Request) {
	info, err := c.dbService.MongoGetClusterShardingInfo()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, info)
}

func (c *DatabaseController) MongoGetCollectionShardingInfo(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	info, err := c.dbService.MongoGetCollectionShardingInfo(db, table)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, info)
}

// ── Backup / Restore ──────────────────────────────────────────────────

// BackupBinariesStatus reports which native dump tools are installed.
// Used by the frontend to disable the backup button when the binary is
// missing on the host.
func (c *DatabaseController) BackupBinariesStatus(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, http.StatusOK, c.dbService.BackupBinariesAvailable())
}

// BackupDatabase streams a full database dump as a file download.
func (c *DatabaseController) BackupDatabase(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	if !validatePathIdent(w, db, "database name") {
		return
	}

	format := c.dbService.BackupFormat()
	filename := fmt.Sprintf("%s-%s%s", db, time.Now().Format("20060102-150405"), format.Extension)

	logger.Admin(requestUserID(r), requestIP(r), "backup", db)

	w.Header().Set("Content-Type", format.ContentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	// Disable any reverse-proxy buffering so the user sees progress as
	// the dump streams in.
	w.Header().Set("X-Accel-Buffering", "no")

	if err := c.dbService.BackupDatabase(db, w); err != nil {
		// At this point we've likely already written the response headers,
		// so we can't switch to JSON. Surface the error in the body — the
		// frontend will detect a corrupt download via the trailing error
		// marker. We also log it for the operator.
		fmt.Fprintf(w, "\n-- BACKUP FAILED: %s\n", err.Error())
		return
	}
}

// RestoreDatabase reads an uploaded dump file and replays it.
// Expects multipart/form-data with field "file".
func (c *DatabaseController) RestoreDatabase(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	if !validatePathIdent(w, db, "database name") {
		return
	}

	// 0 = unlimited memory limit; multipart will spool large files to /tmp.
	// We cap the request body via the standard 32MB in-memory threshold and
	// rely on the OS for the rest.
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid multipart payload: "+err.Error())
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		jsonError(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer file.Close()

	logger.Admin(requestUserID(r), requestIP(r), "restore", db)

	if err := c.dbService.RestoreDatabase(db, file); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

// MongoWatchSSE streams change stream events as Server-Sent Events.
// Auth is via Bearer token in "token" query parameter (EventSource API
// cannot set custom headers).
func (c *DatabaseController) MongoWatchSSE(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // nginx
	flusher.Flush()

	ctx := r.Context()
	events := make(chan connector.ChangeEvent, 16)

	go func() {
		defer close(events)
		if err := c.dbService.MongoWatchCollection(ctx, db, table, events); err != nil {
			// context cancelled is expected when client disconnects
			if ctx.Err() == nil {
				// Send error event
				data, _ := json.Marshal(map[string]string{"error": err.Error()})
				fmt.Fprintf(w, "event: error\ndata: %s\n\n", data)
				flusher.Flush()
			}
		}
	}()

	for {
		select {
		case evt, ok := <-events:
			if !ok {
				return
			}
			data, err := json.Marshal(evt)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case <-ctx.Done():
			return
		}
	}
}

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]string{"error": sanitizeErrorMessage(message)})
}

// sanitizeErrorMessage strips filesystem paths and internal details from errors
// to avoid leaking server internals to the client.
func sanitizeErrorMessage(msg string) string {
	// Remove absolute paths (Unix and Windows)
	for _, prefix := range []string{"/home/", "/root/", "/tmp/", "/var/", "/usr/", "C:\\", "D:\\"} {
		if idx := strings.Index(msg, prefix); idx != -1 {
			// Find the end of the path (space or colon)
			end := idx
			for end < len(msg) && msg[end] != ' ' && msg[end] != ':' && msg[end] != '\n' {
				end++
			}
			msg = msg[:idx] + "[path]" + msg[end:]
		}
	}
	return msg
}

// isBlockedHost returns true for hosts that should never be used as DB targets
// (cloud metadata endpoints, link-local addresses, loopback when inappropriate).
func isBlockedHost(host string) bool {
	ip := net.ParseIP(host)
	if ip == nil {
		// Hostname — block known metadata hostnames
		lower := strings.ToLower(host)
		return lower == "metadata.google.internal" ||
			lower == "metadata.google" ||
			strings.HasSuffix(lower, ".internal")
	}
	// Block link-local 169.254.0.0/16 (AWS/GCP/Azure metadata)
	if ip4 := ip.To4(); ip4 != nil {
		return ip4[0] == 169 && ip4[1] == 254
	}
	// Block IPv6 link-local (fe80::/10)
	return ip.IsLinkLocalUnicast()
}

// ── Triggers ─────────────────────────────────────────────────────────────

func (c *DatabaseController) ListTriggers(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	if !validatePathIdent(w, db, "database") {
		return
	}
	triggers, err := c.dbService.ListTriggers(db)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, sanitizeErrorMessage(err.Error()))
		return
	}
	if triggers == nil {
		triggers = []connector.TriggerInfo{}
	}
	jsonResponse(w, http.StatusOK, triggers)
}

func (c *DatabaseController) DropTrigger(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	if !validatePathIdent(w, db, "database") {
		return
	}
	var req struct {
		Name  string `json:"name"`
		Table string `json:"table"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !validatePathIdent(w, req.Name, "trigger name") {
		return
	}
	if req.Table != "" && !validatePathIdent(w, req.Table, "table") {
		return
	}
	if err := c.dbService.DropTrigger(db, req.Name, req.Table); err != nil {
		jsonError(w, http.StatusInternalServerError, sanitizeErrorMessage(err.Error()))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ── Routines ─────────────────────────────────────────────────────────────

func (c *DatabaseController) ListRoutines(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	if !validatePathIdent(w, db, "database") {
		return
	}
	routines, err := c.dbService.ListRoutines(db)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, sanitizeErrorMessage(err.Error()))
		return
	}
	if routines == nil {
		routines = []connector.RoutineInfo{}
	}
	jsonResponse(w, http.StatusOK, routines)
}

func (c *DatabaseController) DropRoutine(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	if !validatePathIdent(w, db, "database") {
		return
	}
	var req struct {
		Name string `json:"name"`
		Type string `json:"type"` // PROCEDURE or FUNCTION
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !validatePathIdent(w, req.Name, "routine name") {
		return
	}
	if req.Type != "PROCEDURE" && req.Type != "FUNCTION" {
		jsonError(w, http.StatusBadRequest, "type must be PROCEDURE or FUNCTION")
		return
	}
	if err := c.dbService.DropRoutine(db, req.Name, req.Type); err != nil {
		jsonError(w, http.StatusInternalServerError, sanitizeErrorMessage(err.Error()))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ── Schemas (PostgreSQL) ─────────────────────────────────────────────────

func (c *DatabaseController) ListSchemas(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	if !validatePathIdent(w, db, "database") {
		return
	}
	schemas, err := c.dbService.ListSchemas(db)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, sanitizeErrorMessage(err.Error()))
		return
	}
	if schemas == nil {
		schemas = []string{}
	}
	jsonResponse(w, http.StatusOK, schemas)
}

func (c *DatabaseController) ListTablesInSchema(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	schema := r.PathValue("schema")
	if !validatePathIdent(w, db, "database") || !validatePathIdent(w, schema, "schema") {
		return
	}
	tables, err := c.dbService.ListTablesInSchema(db, schema)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, sanitizeErrorMessage(err.Error()))
		return
	}
	if tables == nil {
		tables = []string{}
	}
	jsonResponse(w, http.StatusOK, tables)
}

// ── Table Maintenance ────────────────────────────────────────────────────

func (c *DatabaseController) MaintenanceTable(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")
	if !validatePathIdent(w, db, "database") || !validatePathIdent(w, table, "table") {
		return
	}
	var req struct {
		Operation string `json:"operation"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	allowed := map[string]bool{
		"OPTIMIZE": true, "REPAIR": true, "CHECK": true, "ANALYZE": true,
		"VACUUM": true, "VACUUM_FULL": true, "REINDEX": true,
	}
	if !allowed[strings.ToUpper(req.Operation)] {
		jsonError(w, http.StatusBadRequest, "invalid maintenance operation")
		return
	}
	result, err := c.dbService.MaintenanceTable(db, table, req.Operation)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, sanitizeErrorMessage(err.Error()))
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"result": result})
}
