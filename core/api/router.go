package api

import (
	"net/http"

	"github.com/soleilouisol/socAdmin/core/controller"
	"github.com/soleilouisol/socAdmin/core/service"
)

func NewRouter() http.Handler {
	mux := http.NewServeMux()

	// Services
	dbService := service.NewDatabaseService()

	// Controllers
	dbController := controller.NewDatabaseController(dbService)

	// Routes
	mux.HandleFunc("POST /api/connect", dbController.Connect)
	mux.HandleFunc("GET /api/databases", dbController.ListDatabases)
	mux.HandleFunc("GET /api/databases/{db}/tables", dbController.ListTables)
	mux.HandleFunc("GET /api/databases/{db}/tables/{table}/columns", dbController.DescribeTable)
	mux.HandleFunc("GET /api/databases/{db}/tables/{table}/rows", dbController.GetRows)
	mux.HandleFunc("POST /api/query", dbController.ExecuteQuery)

	return mux
}
