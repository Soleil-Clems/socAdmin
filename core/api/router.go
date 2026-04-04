package api

import (
	"encoding/json"
	"net/http"
	"os/user"

	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/controller"
	"github.com/soleilouisol/socAdmin/core/service"
)

func NewRouter(authRepo *auth.Repository) http.Handler {
	mux := http.NewServeMux()

	// Services
	authService := service.NewAuthService(authRepo)
	dbService := service.NewDatabaseService()

	// Controllers
	authController := controller.NewAuthController(authService)
	dbController := controller.NewDatabaseController(dbService)

	// Route publique : infos système pour le formulaire de connexion
	mux.HandleFunc("GET /api/system/info", func(w http.ResponseWriter, r *http.Request) {
		username := ""
		if u, err := user.Current(); err == nil {
			username = u.Username
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"os_user": username})
	})

	// Auth routes (publiques)
	mux.HandleFunc("POST /api/auth/register", authController.Register)
	mux.HandleFunc("POST /api/auth/login", authController.Login)
	mux.HandleFunc("POST /api/auth/refresh", authController.Refresh)

	// Routes protégées
	protected := http.NewServeMux()
	protected.HandleFunc("GET /api/auth/me", authController.Me)
	protected.HandleFunc("GET /api/connection/status", dbController.ConnectionStatus)
	protected.HandleFunc("POST /api/connect", dbController.Connect)
	protected.HandleFunc("GET /api/databases", dbController.ListDatabases)
	protected.HandleFunc("POST /api/databases", dbController.CreateDatabase)
	protected.HandleFunc("DELETE /api/databases/{db}", dbController.DropDatabase)
	protected.HandleFunc("GET /api/databases/{db}/tables", dbController.ListTables)
	protected.HandleFunc("POST /api/databases/{db}/tables", dbController.CreateTable)
	protected.HandleFunc("GET /api/databases/{db}/tables/{table}/columns", dbController.DescribeTable)
	protected.HandleFunc("GET /api/databases/{db}/tables/{table}/rows", dbController.GetRows)
	protected.HandleFunc("POST /api/databases/{db}/tables/{table}/rows", dbController.InsertRow)
	protected.HandleFunc("PUT /api/databases/{db}/tables/{table}/rows", dbController.UpdateRow)
	protected.HandleFunc("DELETE /api/databases/{db}/tables/{table}/rows", dbController.DeleteRow)
	protected.HandleFunc("DELETE /api/databases/{db}/tables/{table}", dbController.DropTable)
	protected.HandleFunc("POST /api/databases/{db}/tables/{table}/truncate", dbController.TruncateTable)
	protected.HandleFunc("GET /api/databases/{db}/tables/{table}/export", dbController.ExportTable)
	protected.HandleFunc("POST /api/databases/{db}/import/sql", dbController.ImportSQL)
	protected.HandleFunc("POST /api/databases/{db}/tables/{table}/import/csv", dbController.ImportCSV)
	protected.HandleFunc("POST /api/databases/{db}/tables/{table}/import/json", dbController.ImportJSON)
	protected.HandleFunc("POST /api/query", dbController.ExecuteQuery)

	mux.Handle("/api/", auth.AuthMiddleware(protected))

	return mux
}
