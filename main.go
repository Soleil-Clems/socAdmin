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

	router := api.NewRouter(authRepo)

	port := 8080
	fmt.Printf("socAdmin server running on http://localhost:%d\n", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), router))
}
