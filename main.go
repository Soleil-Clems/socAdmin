package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/soleilouisol/socAdmin/core/api"
)

func main() {
	router := api.NewRouter()

	port := 8080
	fmt.Printf("socAdmin server running on http://localhost:%d\n", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), router))
}
