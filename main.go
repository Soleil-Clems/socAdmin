// @soleil-clems: Main - Server entrypoint & bootstrap
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/soleilouisol/socAdmin/core/api"
	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/security"
	"github.com/soleilouisol/socAdmin/core/service"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	resetEmail := flag.String("reset-password", "", "Reset the password of the user with this email (interactive). Does not start the server.")
	flag.Parse()

	// Data directory: all persistent files (socadmin.db, TLS certs, etc.)
	// live here. Configurable via DATA_DIR env var, defaults to current dir.
	dataDir := os.Getenv("DATA_DIR")
	if dataDir != "" {
		if err := os.MkdirAll(dataDir, 0700); err != nil {
			log.Fatalf("Failed to create data directory %s: %v", dataDir, err)
		}
	}
	dbPath := "socadmin.db"
	if dataDir != "" {
		dbPath = dataDir + "/socadmin.db"
	}

	authRepo, err := auth.NewRepository(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	if *resetEmail != "" {
		if err := runPasswordReset(authRepo, *resetEmail); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		os.Exit(0)
	}

	// Initialize JWT secret: prefer JWT_SECRET env var (recommended in prod),
	// fallback to auto-generated secret in SQLite (zero-config for dev).
	var secret []byte
	if envSecret := os.Getenv("JWT_SECRET"); envSecret != "" {
		if len(envSecret) < 32 {
			log.Fatalf("Configuration error: JWT_SECRET must be at least 32 characters (got %d).\n"+
				"  Generate one with: openssl rand -base64 32\n"+
				"  Then set it in your environment or docker-compose.yml.", len(envSecret))
		}
		secret = []byte(envSecret)
	} else {
		secret, err = authRepo.GetOrCreateJWTSecret()
		if err != nil {
			log.Fatalf("Failed to initialize JWT secret: %v", err)
		}
	}
	auth.InitJWTSecret(secret)

	// Clean expired refresh tokens on startup
	if err := authRepo.CleanExpiredTokens(); err != nil {
		log.Printf("Warning: failed to clean expired tokens: %v", err)
	}

	// Initialize AES-256 encryption key for DB credentials
	encKey, err := authRepo.GetOrCreateEncryptionKey()
	if err != nil {
		log.Fatalf("Failed to initialize encryption key: %v", err)
	}

	// Initialize random API prefix (non-guessable URL)
	apiPrefix, err := authRepo.GetOrCreateAPIPrefix()
	if err != nil {
		log.Fatalf("Failed to initialize API prefix: %v", err)
	}

	// Initialize IP whitelist from persisted state
	whitelist := security.NewIPWhitelist()
	whitelist.SetEnabled(authRepo.GetIPWhitelistEnabled())
	if ips, err := authRepo.GetWhitelistedIPs(); err == nil {
		for _, ip := range ips {
			whitelist.AddIP(ip)
		}
	}

	// Auto-provision admin from env vars (Docker/phpMyAdmin-style).
	// Idempotent: skips if the email already exists.
	if adminEmail := os.Getenv("ADMIN_EMAIL"); adminEmail != "" {
		if adminPass := os.Getenv("ADMIN_PASSWORD"); adminPass != "" {
			existing, _ := authRepo.FindByEmail(adminEmail)
			if existing == nil {
				if err := auth.ValidatePassword(adminPass); err != nil {
					log.Fatalf("Configuration error: ADMIN_PASSWORD is invalid — %v.\n"+
						"  Requirements: at least 10 characters, with uppercase, lowercase, digit, and special character.\n"+
						"  Example: Test1234!@", err)
				}
				hashed, err := bcrypt.GenerateFromPassword([]byte(adminPass), bcrypt.DefaultCost)
				if err != nil {
					log.Fatalf("Failed to hash admin password: %v", err)
				}
				if _, err := authRepo.CreateUser(adminEmail, string(hashed), "admin"); err != nil {
					log.Fatalf("Failed to create admin user: %v", err)
				}
				log.Printf("Auto-provisioned admin user: %s", adminEmail)
			}
		}
	}

	// Create database service (shared between auto-connect and router)
	dbService := service.NewDatabaseService()

	// Pre-configured database connections from env vars (Docker/phpMyAdmin-style).
	// Supports all 3 types simultaneously: MYSQL_HOST, POSTGRES_HOST, MONGO_HOST, etc.
	type dbEnvConfig struct {
		envPrefix   string
		dbType      string
		defaultPort int
		defaultUser string
	}
	dbConfigs := []dbEnvConfig{
		{"MYSQL", "mysql", 3306, "root"},
		{"POSTGRES", "postgresql", 5432, "postgres"},
		{"MONGO", "mongodb", 27017, ""},
	}

	var preconfigs []service.PreconfiguredDB
	for _, cfg := range dbConfigs {
		host := os.Getenv(cfg.envPrefix + "_HOST")
		if host == "" {
			continue
		}
		port := cfg.defaultPort
		if p := os.Getenv(cfg.envPrefix + "_PORT"); p != "" {
			if v, err := strconv.Atoi(p); err == nil && v > 0 {
				port = v
			}
		}
		user := cfg.defaultUser
		if u := os.Getenv(cfg.envPrefix + "_USER"); u != "" {
			user = u
		}
		password := os.Getenv(cfg.envPrefix + "_PASSWORD")

		preconfigs = append(preconfigs, service.PreconfiguredDB{
			Type:     cfg.dbType,
			Host:     host,
			Port:     port,
			User:     user,
			Password: password,
		})
	}
	dbService.SetPreconfigured(preconfigs)

	apiHandler := api.NewRouter(authRepo, whitelist, encKey, apiPrefix, dbService)
	frontend := FrontendHandler(apiPrefix)

	// Serve API routes under /{prefix}/api/, everything else is the React SPA
	apiPathPrefix := "/" + apiPrefix + "/api"
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(r.URL.Path) >= len(apiPathPrefix) && r.URL.Path[:len(apiPathPrefix)] == apiPathPrefix {
			apiHandler.ServeHTTP(w, r)
			return
		}
		frontend.ServeHTTP(w, r)
	})

	port := 8080
	if envPort := os.Getenv("PORT"); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil && p > 0 {
			port = p
		}
	}

	// TLS support: set TLS_CERT and TLS_KEY env vars to enable HTTPS.
	// When enabled, an HTTP→HTTPS redirect listener runs on port 80.
	tlsCert := os.Getenv("TLS_CERT")
	tlsKey := os.Getenv("TLS_KEY")

	if tlsCert != "" && tlsKey != "" {
		// HSTS header is already set in SecurityHeaders middleware.
		// Start HTTP→HTTPS redirect on port 80 in background.
		go func() {
			redirectPort := 80
			if envRedirectPort := os.Getenv("HTTP_REDIRECT_PORT"); envRedirectPort != "" {
				if p, err := strconv.Atoi(envRedirectPort); err == nil && p > 0 {
					redirectPort = p
				}
			}
			redirect := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				target := fmt.Sprintf("https://%s%s", r.Host, r.RequestURI)
				http.Redirect(w, r, target, http.StatusMovedPermanently)
			})
			log.Printf("HTTP→HTTPS redirect on :%d", redirectPort)
			if err := http.ListenAndServe(fmt.Sprintf(":%d", redirectPort), redirect); err != nil {
				log.Printf("Warning: HTTP redirect listener failed: %v", err)
			}
		}()

		fmt.Printf("socAdmin server running on https://localhost:%d (TLS)\n", port)
		log.Fatal(http.ListenAndServeTLS(fmt.Sprintf(":%d", port), tlsCert, tlsKey, handler))
	} else {
		fmt.Printf("socAdmin server running on http://localhost:%d\n", port)
		log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), handler))
	}
}
