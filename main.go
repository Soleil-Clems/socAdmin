package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/soleilouisol/socAdmin/core/api"
	"github.com/soleilouisol/socAdmin/core/auth"
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

	router := api.NewRouter(authRepo)

	port := 8080
	fmt.Printf("socAdmin server running on http://localhost:%d\n", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), router))
}
