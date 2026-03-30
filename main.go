package main

import (
	"fmt"
	"log"

	"github.com/soleilouisol/socAdmin/core/connector"
)

func main() {
	config := connector.MySQLConfig{
		Host:     "127.0.0.1",
		Port:     8889,
		User:     "root",
		Password: "root",
	}

	mysql := connector.NewMySQLConnector(config)

	fmt.Println("Connexion à MySQL (MAMP)...")
	if err := mysql.Connect(); err != nil {
		log.Fatalf("Erreur de connexion : %v", err)
	}
	defer mysql.Close()

	fmt.Println("Connecté !")

	databases, err := mysql.ListDatabases()
	if err != nil {
		log.Fatalf("Erreur listing databases : %v", err)
	}

	fmt.Println("Bases de données :")
	for _, db := range databases {
		fmt.Printf("  - %s\n", db)
	}
}
