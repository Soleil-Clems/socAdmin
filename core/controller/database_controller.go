package controller

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/soleilouisol/socAdmin/core/connector"
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

	if err := c.dbService.Connect(req.Host, req.Port, req.User, req.Password, dbType); err != nil {
		jsonError(w, http.StatusBadGateway, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"status": "connected", "type": dbType})
}

func (c *DatabaseController) ListDatabases(w http.ResponseWriter, r *http.Request) {
	databases, err := c.dbService.ListDatabases()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, databases)
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

	if err := c.dbService.CreateDatabase(req.Name); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, map[string]string{"status": "created"})
}

func (c *DatabaseController) DropDatabase(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	if err := c.dbService.DropDatabase(db); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"status": "dropped"})
}

func (c *DatabaseController) CreateTable(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	var req CreateTableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		jsonError(w, http.StatusBadRequest, "table name is required")
		return
	}
	if len(req.Columns) == 0 {
		jsonError(w, http.StatusBadRequest, "at least one column is required")
		return
	}

	if err := c.dbService.CreateTable(db, req.Name, req.Columns); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusCreated, map[string]string{"status": "created"})
}

func (c *DatabaseController) ListTables(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

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

	result, err := c.dbService.ExecuteQuery(req.Database, req.Query)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, result)
}

func (c *DatabaseController) DropTable(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	if err := c.dbService.DropTable(db, table); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"status": "dropped"})
}

func (c *DatabaseController) TruncateTable(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

	if err := c.dbService.TruncateTable(db, table); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

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
	default:
		jsonError(w, http.StatusBadRequest, "format must be csv, json, or sql")
	}
}

func (c *DatabaseController) ImportSQL(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")

	body, err := io.ReadAll(r.Body)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "failed to read body")
		return
	}

	sql := string(body)
	statements := splitSQL(sql)

	var errors []string
	executed := 0
	for _, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if _, err := c.dbService.ExecuteQuery(db, stmt); err != nil {
			errors = append(errors, err.Error())
		} else {
			executed++
		}
	}

	result := map[string]interface{}{
		"executed": executed,
		"errors":   errors,
	}
	jsonResponse(w, http.StatusOK, result)
}

func (c *DatabaseController) ImportCSV(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

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

	result := map[string]interface{}{
		"inserted": inserted,
		"errors":   errors,
	}
	jsonResponse(w, http.StatusOK, result)
}

func (c *DatabaseController) ImportJSON(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	table := r.PathValue("table")

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

	result := map[string]interface{}{
		"inserted": inserted,
		"errors":   errors,
	}
	jsonResponse(w, http.StatusOK, result)
}

// splitSQL splits a SQL dump into individual statements
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

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]string{"error": message})
}
