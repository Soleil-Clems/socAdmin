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
)

func main() {
	resetEmail := flag.String("reset-password", "", "Reset the password of the user with this email (interactive). Does not start the server.")
	flag.Parse()

	authRepo, err := auth.NewRepository("socadmin.db")
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
