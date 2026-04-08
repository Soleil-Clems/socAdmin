package api

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"time"

	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/controller"
	"github.com/soleilouisol/socAdmin/core/security"
	"github.com/soleilouisol/socAdmin/core/service"
)

func NewRouter(authRepo *auth.Repository, whitelist *security.IPWhitelist, encKey []byte, apiPrefix string) http.Handler {
	mux := http.NewServeMux()
	p := "/" + apiPrefix + "/api"

	// Services
	authService := service.NewAuthService(authRepo)
	dbService := service.NewDatabaseService()

	// Controllers
	authController := controller.NewAuthController(authService)
	dbController := controller.NewDatabaseController(dbService)
	secController := controller.NewSecurityController(authRepo, whitelist)
	connController := controller.NewConnectionController(authRepo, dbService, encKey)

	// Route publique : infos système pour le formulaire de connexion
	mux.HandleFunc("GET "+p+"/system/info", func(w http.ResponseWriter, r *http.Request) {
		username := ""
		if u, err := user.Current(); err == nil {
			username = u.Username
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"os_user":        username,
			"installed_sgbd": detectInstalledSGBD(),
		})
	})

	// Auth routes (publiques)
	mux.HandleFunc("POST "+p+"/auth/register", authController.Register)
	mux.HandleFunc("POST "+p+"/auth/login", authController.Login)
	mux.HandleFunc("POST "+p+"/auth/refresh", authController.Refresh)

	// Routes protégées — tout le monde (admin + readonly)
	protected := http.NewServeMux()
	protected.HandleFunc("GET "+p+"/auth/me", authController.Me)
	protected.HandleFunc("GET "+p+"/connection/status", dbController.ConnectionStatus)
	protected.HandleFunc("POST "+p+"/connect", dbController.Connect)
	protected.HandleFunc("GET "+p+"/databases", dbController.ListDatabases)
	protected.HandleFunc("GET "+p+"/databases/stats", dbController.ListDatabasesWithStats)
	protected.HandleFunc("GET "+p+"/databases/{db}/tables", dbController.ListTables)
	protected.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/columns", dbController.DescribeTable)
	protected.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/rows", dbController.GetRows)
	protected.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/export", dbController.ExportTable)
	protected.HandleFunc("GET "+p+"/databases/{db}/export", dbController.ExportDatabase)
	protected.HandleFunc("GET "+p+"/databases/{db}/schema", dbController.GetSchema)
	protected.HandleFunc("GET "+p+"/databases/{db}/search", dbController.SearchGlobal)

	// MongoDB-specific (read)
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/find", dbController.MongoFind)
	protected.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/count", dbController.MongoCount)
	protected.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/indexes", dbController.MongoListIndexes)
	protected.HandleFunc("GET "+p+"/users", dbController.ListUsers)
	protected.HandleFunc("GET "+p+"/status", dbController.ServerStatus)
	protected.HandleFunc("GET "+p+"/security/whitelist", secController.GetWhitelist)

	// Saved connections — tout le monde peut lister et utiliser
	protected.HandleFunc("GET "+p+"/connections", connController.ListConnections)
	protected.HandleFunc("POST "+p+"/connections/{id}/use", connController.UseSavedConnection)

	// Routes admin only — écriture, modification, suppression
	protected.HandleFunc("POST "+p+"/databases", auth.RequireAdmin(dbController.CreateDatabase))
	protected.HandleFunc("DELETE "+p+"/databases/{db}", auth.RequireAdmin(dbController.DropDatabase))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables", auth.RequireAdmin(dbController.CreateTable))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/columns/alter", auth.RequireAdmin(dbController.AlterColumn))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/rows", auth.RequireAdmin(dbController.InsertRow))
	protected.HandleFunc("PUT "+p+"/databases/{db}/tables/{table}/rows", auth.RequireAdmin(dbController.UpdateRow))
	protected.HandleFunc("DELETE "+p+"/databases/{db}/tables/{table}/rows", auth.RequireAdmin(dbController.DeleteRow))
	protected.HandleFunc("DELETE "+p+"/databases/{db}/tables/{table}", auth.RequireAdmin(dbController.DropTable))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/truncate", auth.RequireAdmin(dbController.TruncateTable))
	protected.HandleFunc("POST "+p+"/databases/{db}/import/sql", auth.RequireAdmin(dbController.ImportSQL))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/import/csv", auth.RequireAdmin(dbController.ImportCSV))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/import/json", auth.RequireAdmin(dbController.ImportJSON))
	protected.HandleFunc("POST "+p+"/query", auth.RequireAdmin(dbController.ExecuteQuery))

	// MongoDB-specific (write, admin only)
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/indexes", auth.RequireAdmin(dbController.MongoCreateIndex))
	protected.HandleFunc("DELETE "+p+"/databases/{db}/tables/{table}/indexes", auth.RequireAdmin(dbController.MongoDropIndex))

	// Saved connections — admin only pour save/delete
	protected.HandleFunc("POST "+p+"/connections", auth.RequireAdmin(connController.SaveConnection))
	protected.HandleFunc("DELETE "+p+"/connections/{id}", auth.RequireAdmin(connController.DeleteConnection))

	// App users management — admin only
	protected.HandleFunc("GET "+p+"/users/app", auth.RequireAdmin(authController.ListAppUsers))
	protected.HandleFunc("PUT "+p+"/users/app/{id}/role", auth.RequireAdmin(authController.UpdateAppUserRole))
	protected.HandleFunc("DELETE "+p+"/users/app/{id}", auth.RequireAdmin(authController.DeleteAppUser))

	// Security — admin only
	protected.HandleFunc("PUT "+p+"/security/whitelist", auth.RequireAdmin(secController.ToggleWhitelist))
	protected.HandleFunc("POST "+p+"/security/whitelist/ip", auth.RequireAdmin(secController.AddIP))
	protected.HandleFunc("DELETE "+p+"/security/whitelist/ip", auth.RequireAdmin(secController.RemoveIP))

	// Bulk whitelist — admin only
	protected.HandleFunc("POST "+p+"/security/whitelist/bulk", auth.RequireAdmin(secController.BulkAddIPs))
	protected.HandleFunc("GET "+p+"/security/whitelist/export", secController.ExportWhitelist)

	mux.Handle(p+"/", auth.AuthMiddleware(protected))

	// Middleware chain: IP whitelist → rate limiter → CSRF → security headers
	rateLimiter := NewRateLimiter(200, time.Minute) // 200 req/min per IP
	var handler http.Handler = mux
	handler = SecurityHeaders(handler)
	handler = CSRFProtection(handler)
	handler = rateLimiter.Middleware(handler)
	handler = whitelist.Middleware(handler)

	return handler
}

// detectInstalledSGBD checks which database engines are available on the machine.
func detectInstalledSGBD() []string {
	extraPaths := sgbdSearchPaths()

	findBin := func(names ...string) bool {
		for _, name := range names {
			if runtime.GOOS == "windows" {
				name += ".exe"
			}
			if _, err := exec.LookPath(name); err == nil {
				return true
			}
			for _, dir := range extraPaths {
				if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
					return true
				}
			}
		}
		return false
	}

	var installed []string
	if findBin("mysql", "mysqld") {
		installed = append(installed, "mysql")
	}
	if findBin("psql", "postgres") {
		installed = append(installed, "postgresql")
	}
	if findBin("mongod", "mongosh") {
		installed = append(installed, "mongodb")
	}

	// Fallback: if nothing detected (e.g. Docker), return all
	if len(installed) == 0 {
		return []string{"mysql", "postgresql", "mongodb"}
	}
	return installed
}

