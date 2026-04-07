package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/soleilouisol/socAdmin/core/api"
	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/security"
)

func main() {
	authRepo, err := auth.NewRepository("socadmin.db")
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize JWT secret from DB (generated once, persisted)
	secret, err := authRepo.GetOrCreateJWTSecret()
	if err != nil {
		log.Fatalf("Failed to initialize JWT secret: %v", err)
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

	apiHandler := api.NewRouter(authRepo, whitelist, encKey, apiPrefix)
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
	fmt.Printf("socAdmin server running on http://localhost:%d\n", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), handler))
}
