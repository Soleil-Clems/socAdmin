package connector

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoConfig struct {
	Host     string
	Port     int
	User     string
	Password string
}

type MongoConnector struct {
	client *mongo.Client
	config MongoConfig
}

func NewMongoConnector(config MongoConfig) *MongoConnector {
	return &MongoConnector{config: config}
}

func (c *MongoConnector) Connect() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var uri string
	if c.config.User != "" && c.config.Password != "" {
		uri = fmt.Sprintf("mongodb://%s:%s@%s:%d",
			c.config.User, c.config.Password, c.config.Host, c.config.Port)
	} else {
		uri = fmt.Sprintf("mongodb://%s:%d", c.config.Host, c.config.Port)
	}

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	if err := client.Ping(ctx, nil); err != nil {
		return fmt.Errorf("failed to ping MongoDB: %w", err)
	}

	c.client = client
	return nil
}

func (c *MongoConnector) ListDatabases() ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	databases, err := c.client.ListDatabaseNames(ctx, bson.D{})
	if err != nil {
		return nil, fmt.Errorf("failed to list databases: %w", err)
	}
	return databases, nil
}

func (c *MongoConnector) CreateDatabase(name string) error {
	// MongoDB crée la database automatiquement quand on insère un document.
	// On insère puis supprime un doc temporaire pour forcer la création de la DB
	// sans laisser de collection parasite.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	db := c.client.Database(name)

	// Vérifier si la DB existe déjà
	dbs, err := c.client.ListDatabaseNames(ctx, bson.M{"name": name})
	if err == nil && len(dbs) > 0 {
		return nil // DB existe déjà, rien à faire
	}

	// Créer une collection placeholder pour matérialiser la DB
	coll := db.Collection("_socadmin_init")
	_, err = coll.InsertOne(ctx, bson.M{"_created": true})
	if err != nil {
		return fmt.Errorf("failed to create database: %w", err)
	}

	return nil
}

func (c *MongoConnector) DropDatabase(name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return c.client.Database(name).Drop(ctx)
}

func (c *MongoConnector) CreateTable(database string, collection string, _ []TableColumnDef) error {
	// MongoDB est schemaless, on crée juste la collection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Vérifier si la collection existe déjà
	existing, err := c.client.Database(database).ListCollectionNames(ctx, bson.M{"name": collection})
	if err == nil && len(existing) > 0 {
		return nil
	}

	return c.client.Database(database).CreateCollection(ctx, collection)
}

// ListTables retourne les collections d'une database (filtre les collections internes)
func (c *MongoConnector) ListTables(database string) ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	all, err := c.client.Database(database).ListCollectionNames(ctx, bson.D{})
	if err != nil {
		return nil, fmt.Errorf("failed to list collections: %w", err)
	}

	var collections []string
	for _, name := range all {
		if name != "_socadmin_init" && name != "_init" {
			collections = append(collections, name)
		}
	}
	return collections, nil
}

// DescribeTable analyse un échantillon de documents pour déduire le schéma
func (c *MongoConnector) DescribeTable(database, collection string) ([]Column, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	coll := c.client.Database(database).Collection(collection)
	cursor, err := coll.Find(ctx, bson.D{}, options.Find().SetLimit(100))
	if err != nil {
		return nil, fmt.Errorf("failed to sample collection: %w", err)
	}
	defer cursor.Close(ctx)

	fieldTypes := make(map[string]string)
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		for key, val := range doc {
			if _, exists := fieldTypes[key]; !exists {
				fieldTypes[key] = fmt.Sprintf("%T", val)
			}
		}
	}

	var columns []Column
	for name, typ := range fieldTypes {
		key := ""
		if name == "_id" {
			key = "PRI"
		}
		columns = append(columns, Column{
			Name: name,
			Type: typ,
			Null: "YES",
			Key:  key,
		})
	}

	sort.Slice(columns, func(i, j int) bool {
		if columns[i].Name == "_id" {
			return true
		}
		if columns[j].Name == "_id" {
			return false
		}
		return columns[i].Name < columns[j].Name
	})

	return columns, nil
}

func (c *MongoConnector) GetRows(database, collection string, limit, offset int) (*QueryResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	coll := c.client.Database(database).Collection(collection)
	opts := options.Find().SetLimit(int64(limit)).SetSkip(int64(offset))

	cursor, err := coll.Find(ctx, bson.D{}, opts)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer cursor.Close(ctx)

	return cursorToQueryResult(ctx, cursor)
}

// ExecuteQuery exécute une commande JSON MongoDB (ex: {"find": "users", "filter": {"age": {"$gt": 25}}})
func (c *MongoConnector) ExecuteQuery(database, query string) (*QueryResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var cmd bson.D
	if err := bson.UnmarshalExtJSON([]byte(query), true, &cmd); err != nil {
		return nil, fmt.Errorf("invalid JSON command: %w", err)
	}

	// Utiliser la database passée en paramètre, sinon chercher dans la commande, sinon "test"
	dbName := database
	if dbName == "" {
		dbName = "test"
		for i, elem := range cmd {
			if elem.Key == "database" {
				dbName = fmt.Sprintf("%v", elem.Value)
				cmd = append(cmd[:i], cmd[i+1:]...)
				break
			}
		}
	}

	var result bson.M
	err := c.client.Database(dbName).RunCommand(ctx, cmd).Decode(&result)
	if err != nil {
		return nil, fmt.Errorf("command failed: %w", err)
	}

	// Si le résultat contient un cursor avec des documents
	if cursor, ok := result["cursor"].(bson.M); ok {
		if batch, ok := cursor["firstBatch"].(bson.A); ok {
			return bsonArrayToQueryResult(batch)
		}
	}

	// Sinon, retourner le résultat brut en une seule ligne
	jsonBytes, _ := json.Marshal(result)
	return &QueryResult{
		Columns: []string{"result"},
		Rows:    []map[string]interface{}{{"result": string(jsonBytes)}},
	}, nil
}

func (c *MongoConnector) InsertRow(database, collection string, data map[string]interface{}) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Supprimer _id si vide (laisser MongoDB le générer)
	if id, ok := data["_id"]; ok {
		if id == nil || id == "" {
			delete(data, "_id")
		}
	}

	coll := c.client.Database(database).Collection(collection)
	_, err := coll.InsertOne(ctx, data)
	return err
}

func (c *MongoConnector) UpdateRow(database, collection string, primaryKey map[string]interface{}, data map[string]interface{}) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	delete(data, "_id")

	filter := bson.M{}
	for k, v := range primaryKey {
		filter[k] = v
	}

	update := bson.M{"$set": data}
	coll := c.client.Database(database).Collection(collection)
	_, err := coll.UpdateOne(ctx, filter, update)
	return err
}

func (c *MongoConnector) DeleteRow(database, collection string, primaryKey map[string]interface{}) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{}
	for k, v := range primaryKey {
		filter[k] = v
	}

	coll := c.client.Database(database).Collection(collection)
	_, err := coll.DeleteOne(ctx, filter)
	return err
}

func (c *MongoConnector) DropTable(database, collection string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return c.client.Database(database).Collection(collection).Drop(ctx)
}

func (c *MongoConnector) TruncateTable(database, collection string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := c.client.Database(database).Collection(collection).DeleteMany(ctx, bson.D{})
	return err
}

func (c *MongoConnector) AlterColumn(database, collection string, op AlterColumnOp) error {
	return fmt.Errorf("ALTER COLUMN is not supported for MongoDB (schemaless)")
}

func (c *MongoConnector) Close() error {
	if c.client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return c.client.Disconnect(ctx)
	}
	return nil
}

func cursorToQueryResult(ctx context.Context, cursor *mongo.Cursor) (*QueryResult, error) {
	var docs []bson.M
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, err
	}

	if len(docs) == 0 {
		return &QueryResult{Columns: []string{}, Rows: []map[string]interface{}{}}, nil
	}

	// Collecter toutes les clés uniques
	keySet := make(map[string]bool)
	for _, doc := range docs {
		for k := range doc {
			keySet[k] = true
		}
	}

	var columns []string
	if keySet["_id"] {
		columns = append(columns, "_id")
		delete(keySet, "_id")
	}
	var rest []string
	for k := range keySet {
		rest = append(rest, k)
	}
	sort.Strings(rest)
	columns = append(columns, rest...)

	var rows []map[string]interface{}
	for _, doc := range docs {
		row := make(map[string]interface{})
		for _, col := range columns {
			if val, ok := doc[col]; ok {
				row[col] = fmt.Sprintf("%v", val)
			} else {
				row[col] = nil
			}
		}
		rows = append(rows, row)
	}

	return &QueryResult{Columns: columns, Rows: rows}, nil
}

func bsonArrayToQueryResult(arr bson.A) (*QueryResult, error) {
	var docs []bson.M
	for _, item := range arr {
		if doc, ok := item.(bson.M); ok {
			docs = append(docs, doc)
		}
	}

	if len(docs) == 0 {
		return &QueryResult{Columns: []string{}, Rows: []map[string]interface{}{}}, nil
	}

	keySet := make(map[string]bool)
	for _, doc := range docs {
		for k := range doc {
			keySet[k] = true
		}
	}

	var columns []string
	if keySet["_id"] {
		columns = append(columns, "_id")
		delete(keySet, "_id")
	}
	var rest []string
	for k := range keySet {
		rest = append(rest, k)
	}
	sort.Strings(rest)
	columns = append(columns, rest...)

	var rows []map[string]interface{}
	for _, doc := range docs {
		row := make(map[string]interface{})
		for _, col := range columns {
			if val, ok := doc[col]; ok {
				row[col] = fmt.Sprintf("%v", val)
			} else {
				row[col] = nil
			}
		}
		rows = append(rows, row)
	}

	return &QueryResult{Columns: columns, Rows: rows}, nil
}
