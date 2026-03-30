package controller

import (
	"encoding/json"
	"net/http"
	"strconv"

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
	Query string `json:"query"`
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

	result, err := c.dbService.ExecuteQuery(req.Query)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, result)
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

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]string{"error": message})
}
