package api

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
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
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"installed_sgbd": detectInstalledSGBD(),
		})
	})

	// Auth routes (publiques) — stricter rate limit (10 req/min per IP)
	authLimiter := NewRateLimiter(10, time.Minute)
	withAuthLimit := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			ip := security.NormalizeIP(security.ClientIP(r))
			if !authLimiter.IsAllowed(ip) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]string{"error": "too many requests, try again later"})
				return
			}
			h(w, r)
		}
	}
	mux.HandleFunc("POST "+p+"/auth/register", withAuthLimit(authController.Register))
	mux.HandleFunc("POST "+p+"/auth/login", withAuthLimit(authController.Login))
	mux.HandleFunc("POST "+p+"/auth/refresh", withAuthLimit(authController.Refresh))

	// Logout (protégé mais accessible à tous les users authentifiés)
	protected := http.NewServeMux()
	protected.HandleFunc("POST "+p+"/auth/logout", authController.Logout)
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
	protected.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/stats", dbController.MongoCollectionStats)
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/explain", dbController.MongoExplain)
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/distinct", dbController.MongoDistinct)
	protected.HandleFunc("GET "+p+"/mongo/roles", dbController.MongoListRoles)
	protected.HandleFunc("GET "+p+"/users", dbController.ListUsers)
	protected.HandleFunc("GET "+p+"/status", dbController.ServerStatus)
	protected.HandleFunc("GET "+p+"/mongo/currentop", dbController.MongoCurrentOp)
	protected.HandleFunc("GET "+p+"/databases/{db}/views", dbController.MongoListViews)
	protected.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/validation", dbController.MongoGetValidation)
	protected.HandleFunc("GET "+p+"/databases/{db}/profiling", dbController.MongoGetProfilingLevel)
	protected.HandleFunc("GET "+p+"/databases/{db}/profiling/data", dbController.MongoGetProfileData)
	protected.HandleFunc("GET "+p+"/databases/{db}/dbstats", dbController.MongoDatabaseStats)
	protected.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/capped", dbController.MongoIsCollectionCapped)
	protected.HandleFunc("GET "+p+"/mongo/log", dbController.MongoGetServerLog)
	protected.HandleFunc("GET "+p+"/databases/{db}/collections/meta", dbController.MongoListCollectionsWithMeta)
	protected.HandleFunc("GET "+p+"/mongo/replset", dbController.MongoReplicaSetStatus)
	protected.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/sample", dbController.MongoSampleDocuments)
	protected.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/index-stats", dbController.MongoIndexUsageStats)
	protected.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/field-analysis", dbController.MongoFieldTypeAnalysis)
	protected.HandleFunc("GET "+p+"/mongo/top", dbController.MongoTopStats)
	protected.HandleFunc("GET "+p+"/databases/{db}/roles/detailed", dbController.MongoListRolesDetailed)
	protected.HandleFunc("GET "+p+"/databases/{db}/gridfs", dbController.MongoListGridFSBuckets)
	protected.HandleFunc("GET "+p+"/databases/{db}/gridfs/{bucket}/files", dbController.MongoListGridFSFiles)
	protected.HandleFunc("GET "+p+"/databases/{db}/gridfs/{bucket}/files/{id}/download", dbController.MongoDownloadGridFSFile)
	protected.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/timeseries", dbController.MongoGetTimeSeriesInfo)
	protected.HandleFunc("GET "+p+"/sharding/cluster", dbController.MongoGetClusterShardingInfo)
	protected.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/sharding", dbController.MongoGetCollectionShardingInfo)
	protected.HandleFunc("GET "+p+"/backup/binaries", dbController.BackupBinariesStatus)
	protected.HandleFunc("GET "+p+"/databases/{db}/backup", dbController.BackupDatabase)
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
	protected.HandleFunc("POST "+p+"/databases/{db}/restore", auth.RequireAdmin(dbController.RestoreDatabase))
	protected.HandleFunc("POST "+p+"/databases/{db}/import/sql", auth.RequireAdmin(dbController.ImportSQL))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/import/csv", auth.RequireAdmin(dbController.ImportCSV))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/import/json", auth.RequireAdmin(dbController.ImportJSON))
	protected.HandleFunc("POST "+p+"/query", auth.RequireAdmin(dbController.ExecuteQuery))

	// MongoDB-specific (write, admin only)
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/indexes", auth.RequireAdmin(dbController.MongoCreateIndex))
	protected.HandleFunc("PUT "+p+"/databases/{db}/tables/{table}/indexes/hidden", auth.RequireAdmin(dbController.MongoSetIndexHidden))
	protected.HandleFunc("DELETE "+p+"/databases/{db}/tables/{table}/indexes", auth.RequireAdmin(dbController.MongoDropIndex))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/insertMany", auth.RequireAdmin(dbController.MongoInsertMany))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/updateMany", auth.RequireAdmin(dbController.MongoUpdateMany))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/deleteMany", auth.RequireAdmin(dbController.MongoDeleteMany))
	protected.HandleFunc("POST "+p+"/mongo/killop", auth.RequireAdmin(dbController.MongoKillOp))
	protected.HandleFunc("POST "+p+"/databases/{db}/views", auth.RequireAdmin(dbController.MongoCreateView))
	protected.HandleFunc("PUT "+p+"/databases/{db}/tables/{table}/validation", auth.RequireAdmin(dbController.MongoSetValidation))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/rename", auth.RequireAdmin(dbController.MongoRenameCollection))
	protected.HandleFunc("PUT "+p+"/databases/{db}/profiling", auth.RequireAdmin(dbController.MongoSetProfilingLevel))
	protected.HandleFunc("POST "+p+"/databases/{db}/capped", auth.RequireAdmin(dbController.MongoCreateCappedCollection))
	protected.HandleFunc("POST "+p+"/databases/{db}/timeseries", auth.RequireAdmin(dbController.MongoCreateTimeSeriesCollection))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/compact", auth.RequireAdmin(dbController.MongoCompactCollection))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/duplicate", auth.RequireAdmin(dbController.MongoDuplicateCollection))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/convert-capped", auth.RequireAdmin(dbController.MongoConvertToCapped))
	protected.HandleFunc("POST "+p+"/databases/{db}/tables/{table}/aggregate", auth.RequireAdmin(dbController.MongoRunAggregation))
	protected.HandleFunc("POST "+p+"/databases/{db}/roles", auth.RequireAdmin(dbController.MongoCreateCustomRole))
	protected.HandleFunc("PUT "+p+"/databases/{db}/roles/{role}", auth.RequireAdmin(dbController.MongoUpdateCustomRole))
	protected.HandleFunc("DELETE "+p+"/databases/{db}/roles/{role}", auth.RequireAdmin(dbController.MongoDropCustomRole))
	protected.HandleFunc("POST "+p+"/databases/{db}/gridfs/{bucket}/files", auth.RequireAdmin(dbController.MongoUploadGridFSFile))
	protected.HandleFunc("DELETE "+p+"/databases/{db}/gridfs/{bucket}/files/{id}", auth.RequireAdmin(dbController.MongoDeleteGridFSFile))
	protected.HandleFunc("POST "+p+"/mongo/users", auth.RequireAdmin(dbController.MongoCreateUser))
	protected.HandleFunc("DELETE "+p+"/mongo/users", auth.RequireAdmin(dbController.MongoDropUser))
	protected.HandleFunc("PUT "+p+"/mongo/users/roles", auth.RequireAdmin(dbController.MongoUpdateUserRoles))

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
	protected.HandleFunc("GET "+p+"/security/whitelist/export", auth.RequireAdmin(secController.ExportWhitelist))

	// SSE endpoint — auth via query param "token" (EventSource can't set headers)
	mux.HandleFunc("GET "+p+"/databases/{db}/tables/{table}/watch", auth.AuthFromQueryParam(dbController.MongoWatchSSE))

	mux.Handle(p+"/", auth.AuthMiddleware(protected))

	// Middleware chain: IP whitelist → rate limiter → CSRF → security headers
	rateLimiter := NewRateLimiter(200, time.Minute) // 200 req/min per IP
	var handler http.Handler = mux
	handler = SecurityHeaders(handler)
	handler = CSRFProtection(apiPrefix)(handler)
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

