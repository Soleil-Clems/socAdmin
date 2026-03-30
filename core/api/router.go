package api

import (
	"encoding/json"
	"net/http"

	"github.com/soleilouisol/socAdmin/core/connector"
)

var mysqlConn *connector.MySQLConnector

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]string{"error": message})
}

func NewRouter() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/connect", handleConnect)
	mux.HandleFunc("GET /api/databases", handleListDatabases)
	mux.HandleFunc("GET /api/databases/{db}/tables", handleListTables)
	mux.HandleFunc("GET /api/databases/{db}/tables/{table}/columns", handleDescribeTable)
	mux.HandleFunc("GET /api/databases/{db}/tables/{table}/rows", handleGetRows)
	mux.HandleFunc("POST /api/query", handleExecuteQuery)

	return mux
}
