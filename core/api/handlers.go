package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/soleilouisol/socAdmin/core/connector"
)

type ConnectRequest struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
}

type QueryRequest struct {
	Query string `json:"query"`
}

func handleConnect(w http.ResponseWriter, r *http.Request) {
	var req ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	conn := connector.NewMySQLConnector(connector.MySQLConfig{
		Host:     req.Host,
		Port:     req.Port,
		User:     req.User,
		Password: req.Password,
	})

	if err := conn.Connect(); err != nil {
		jsonError(w, http.StatusUnauthorized, "connection failed: "+err.Error())
		return
	}

	// Fermer l'ancienne connexion si elle existe
	if mysqlConn != nil {
		mysqlConn.Close()
	}
	mysqlConn = conn

	jsonResponse(w, http.StatusOK, map[string]string{"status": "connected"})
}

func handleListDatabases(w http.ResponseWriter, r *http.Request) {
	if mysqlConn == nil {
		jsonError(w, http.StatusBadRequest, "not connected")
		return
	}

	databases, err := mysqlConn.ListDatabases()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, databases)
}

func handleListTables(w http.ResponseWriter, r *http.Request) {
	if mysqlConn == nil {
		jsonError(w, http.StatusBadRequest, "not connected")
		return
	}

	db := r.PathValue("db")
	tables, err := mysqlConn.ListTables(db)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, tables)
}

func handleDescribeTable(w http.ResponseWriter, r *http.Request) {
	if mysqlConn == nil {
		jsonError(w, http.StatusBadRequest, "not connected")
		return
	}

	db := r.PathValue("db")
	table := r.PathValue("table")

	columns, err := mysqlConn.DescribeTable(db, table)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, columns)
}

func handleGetRows(w http.ResponseWriter, r *http.Request) {
	if mysqlConn == nil {
		jsonError(w, http.StatusBadRequest, "not connected")
		return
	}

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

	result, err := mysqlConn.GetRows(db, table, limit, offset)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, result)
}

func handleExecuteQuery(w http.ResponseWriter, r *http.Request) {
	if mysqlConn == nil {
		jsonError(w, http.StatusBadRequest, "not connected")
		return
	}

	var req QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Query == "" {
		jsonError(w, http.StatusBadRequest, "query is required")
		return
	}

	result, err := mysqlConn.ExecuteQuery(req.Query)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, result)
}
