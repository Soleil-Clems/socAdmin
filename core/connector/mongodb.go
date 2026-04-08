package connector

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"
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
				fieldTypes[key] = friendlyBsonType(val)
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

// ListUsers returns MongoDB users as a clean QueryResult table
func (c *MongoConnector) ListUsers() (*QueryResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var result bson.M
	err := c.client.Database("admin").RunCommand(ctx, bson.D{{Key: "usersInfo", Value: 1}}).Decode(&result)
	if err != nil {
		return nil, fmt.Errorf("usersInfo failed: %w", err)
	}

	users, ok := result["users"].(bson.A)
	if !ok || len(users) == 0 {
		return &QueryResult{
			Columns: []string{"User", "Database", "Roles"},
			Rows:    []map[string]interface{}{},
		}, nil
	}

	var rows []map[string]interface{}
	for _, u := range users {
		doc, ok := u.(bson.M)
		if !ok {
			continue
		}
		user := fmt.Sprintf("%v", doc["user"])
		db := fmt.Sprintf("%v", doc["db"])
		roles := ""
		if r, ok := doc["roles"].(bson.A); ok {
			for i, role := range r {
				if rd, ok := role.(bson.M); ok {
					if i > 0 {
						roles += ", "
					}
					roles += fmt.Sprintf("%v@%v", rd["role"], rd["db"])
				}
			}
		}
		rows = append(rows, map[string]interface{}{
			"User":     user,
			"Database": db,
			"Roles":    roles,
		})
	}

	return &QueryResult{
		Columns: []string{"User", "Database", "Roles"},
		Rows:    rows,
	}, nil
}

// ServerStatus returns key MongoDB server metrics as a clean Variable/Value table
func (c *MongoConnector) ServerStatus() (*QueryResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var result bson.M
	err := c.client.Database("admin").RunCommand(ctx, bson.D{{Key: "serverStatus", Value: 1}}).Decode(&result)
	if err != nil {
		return nil, fmt.Errorf("serverStatus failed: %w", err)
	}

	var rows []map[string]interface{}
	add := func(name string, value interface{}) {
		rows = append(rows, map[string]interface{}{
			"Variable_name": name,
			"Value":         fmt.Sprintf("%v", value),
		})
	}

	add("version", result["version"])
	add("uptime", result["uptime"])
	add("host", result["host"])

	if conn, ok := result["connections"].(bson.M); ok {
		add("connections.current", conn["current"])
		add("connections.available", conn["available"])
		add("connections.totalCreated", conn["totalCreated"])
	}

	if mem, ok := result["mem"].(bson.M); ok {
		add("mem.resident_mb", mem["resident"])
		add("mem.virtual_mb", mem["virtual"])
	}

	if gl, ok := result["globalLock"].(bson.M); ok {
		add("globalLock.totalTime_us", gl["totalTime"])
		if q, ok := gl["currentQueue"].(bson.M); ok {
			add("globalLock.queue.total", q["total"])
		}
		if a, ok := gl["activeClients"].(bson.M); ok {
			add("globalLock.activeClients.total", a["total"])
		}
	}

	if net, ok := result["network"].(bson.M); ok {
		add("network.bytesIn", net["bytesIn"])
		add("network.bytesOut", net["bytesOut"])
		add("network.numRequests", net["numRequests"])
	}

	if ops, ok := result["opcounters"].(bson.M); ok {
		add("ops.insert", ops["insert"])
		add("ops.query", ops["query"])
		add("ops.update", ops["update"])
		add("ops.delete", ops["delete"])
		add("ops.command", ops["command"])
	}

	if cat, ok := result["catalogStats"].(bson.M); ok {
		add("collections", cat["collections"])
		add("views", cat["views"])
	}

	return &QueryResult{
		Columns: []string{"Variable_name", "Value"},
		Rows:    rows,
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

	filter := buildMongoFilter(primaryKey)
	update := bson.M{"$set": data}
	coll := c.client.Database(database).Collection(collection)
	_, err := coll.UpdateOne(ctx, filter, update)
	return err
}

func (c *MongoConnector) DeleteRow(database, collection string, primaryKey map[string]interface{}) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := buildMongoFilter(primaryKey)
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

// ── MongoDB-specific methods (not in Connector interface) ──

// FindDocuments performs a server-side find with filter, sort, limit, skip.
// filterJSON and sortJSON are raw JSON strings (e.g. `{"age":{"$gt":25}}`, `{"name":1}`).
func (c *MongoConnector) FindDocuments(database, collection, filterJSON, sortJSON string, limit, skip int) (*QueryResult, int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	coll := c.client.Database(database).Collection(collection)

	// Parse filter
	filter := bson.D{}
	if filterJSON != "" && filterJSON != "{}" {
		if err := bson.UnmarshalExtJSON([]byte(filterJSON), false, &filter); err != nil {
			return nil, 0, fmt.Errorf("invalid filter JSON: %w", err)
		}
	}

	// Convert _id string values to ObjectID in filter
	filter = convertFilterIDs(filter)

	// Count total matching documents
	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, fmt.Errorf("count failed: %w", err)
	}

	// Build find options
	opts := options.Find().SetLimit(int64(limit)).SetSkip(int64(skip))

	// Parse sort
	if sortJSON != "" && sortJSON != "{}" {
		var sortDoc bson.D
		if err := bson.UnmarshalExtJSON([]byte(sortJSON), false, &sortDoc); err == nil && len(sortDoc) > 0 {
			opts.SetSort(sortDoc)
		}
	}

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, fmt.Errorf("find failed: %w", err)
	}
	defer cursor.Close(ctx)

	result, err := cursorToQueryResult(ctx, cursor)
	if err != nil {
		return nil, 0, err
	}
	return result, total, nil
}

// CountDocuments returns the total number of documents in a collection.
func (c *MongoConnector) CountDocuments(database, collection string) (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	coll := c.client.Database(database).Collection(collection)
	return coll.CountDocuments(ctx, bson.D{})
}

// IndexInfo represents a MongoDB index.
type IndexInfo struct {
	Name   string                 `json:"name"`
	Keys   map[string]interface{} `json:"keys"`
	Unique bool                   `json:"unique"`
	Sparse bool                   `json:"sparse"`
	TTL    *int32                 `json:"ttl,omitempty"`
}

// ListIndexes returns all indexes on a collection.
func (c *MongoConnector) ListIndexes(database, collection string) ([]IndexInfo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	coll := c.client.Database(database).Collection(collection)
	cursor, err := coll.Indexes().List(ctx)
	if err != nil {
		return nil, fmt.Errorf("list indexes failed: %w", err)
	}
	defer cursor.Close(ctx)

	var indexes []IndexInfo
	for cursor.Next(ctx) {
		var raw bson.M
		if err := cursor.Decode(&raw); err != nil {
			continue
		}
		info := IndexInfo{
			Name: fmt.Sprintf("%v", raw["name"]),
		}
		// Parse keys
		info.Keys = make(map[string]interface{})
		if keyDoc, ok := raw["key"].(bson.M); ok {
			for k, v := range keyDoc {
				info.Keys[k] = v
			}
		} else if keyDoc, ok := raw["key"].(bson.D); ok {
			for _, e := range keyDoc {
				info.Keys[e.Key] = e.Value
			}
		}
		if u, ok := raw["unique"].(bool); ok {
			info.Unique = u
		}
		if s, ok := raw["sparse"].(bool); ok {
			info.Sparse = s
		}
		if ttl, ok := raw["expireAfterSeconds"].(int32); ok {
			info.TTL = &ttl
		}
		indexes = append(indexes, info)
	}
	return indexes, nil
}

// CreateIndex creates a new index on a collection.
// keysJSON is like `{"field": 1}` or `{"field": -1}` or `{"f1": 1, "f2": -1}`.
func (c *MongoConnector) CreateIndex(database, collection, keysJSON string, unique bool, name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var keys bson.D
	if err := bson.UnmarshalExtJSON([]byte(keysJSON), false, &keys); err != nil {
		return fmt.Errorf("invalid keys JSON: %w", err)
	}
	if len(keys) == 0 {
		return fmt.Errorf("at least one key is required")
	}

	model := mongo.IndexModel{Keys: keys}
	opts := options.Index()
	if unique {
		opts.SetUnique(true)
	}
	if name != "" {
		opts.SetName(name)
	}
	model.Options = opts

	coll := c.client.Database(database).Collection(collection)
	_, err := coll.Indexes().CreateOne(ctx, model)
	return err
}

// DropIndex removes an index by name.
func (c *MongoConnector) DropIndex(database, collection, indexName string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if indexName == "_id_" {
		return fmt.Errorf("cannot drop the default _id index")
	}

	coll := c.client.Database(database).Collection(collection)
	return coll.Indexes().DropOne(ctx, indexName)
}

// convertFilterIDs recursively converts _id string values to ObjectID in a filter.
func convertFilterIDs(doc bson.D) bson.D {
	for i, elem := range doc {
		if elem.Key == "_id" {
			doc[i].Value = convertIDValue(elem.Value)
		}
	}
	return doc
}

func convertIDValue(val interface{}) interface{} {
	switch v := val.(type) {
	case string:
		if oid, err := bson.ObjectIDFromHex(v); err == nil {
			return oid
		}
		return v
	case bson.D:
		// Operator like {"$in": [...], "$gt": "..."}
		for i, elem := range v {
			v[i].Value = convertIDValue(elem.Value)
		}
		return v
	case bson.A:
		for i, item := range v {
			v[i] = convertIDValue(item)
		}
		return v
	default:
		return val
	}
}

func (c *MongoConnector) Close() error {
	if c.client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return c.client.Disconnect(ctx)
	}
	return nil
}

// buildMongoFilter converts a primary key map to a bson.M filter,
// converting _id strings back to ObjectID when valid.
func buildMongoFilter(pk map[string]interface{}) bson.M {
	filter := bson.M{}
	for k, v := range pk {
		if k == "_id" {
			if s, ok := v.(string); ok {
				if oid, err := bson.ObjectIDFromHex(s); err == nil {
					filter[k] = oid
					continue
				}
			}
		}
		filter[k] = v
	}
	return filter
}

// friendlyBsonType returns a human-readable type name for a BSON value.
func friendlyBsonType(val interface{}) string {
	if val == nil {
		return "null"
	}
	t := reflect.TypeOf(val)
	typeName := t.String()

	switch {
	case strings.Contains(typeName, "ObjectID"):
		return "ObjectId"
	case strings.Contains(typeName, "DateTime"), strings.Contains(typeName, "Time"):
		return "Date"
	case typeName == "bson.A", strings.Contains(typeName, "bson.A"):
		return "Array"
	case typeName == "bson.M", strings.Contains(typeName, "bson.M"):
		return "Object"
	case typeName == "bson.D":
		return "Object"
	}

	switch val.(type) {
	case string:
		return "String"
	case int, int32, int64:
		return "Int"
	case float32, float64:
		return "Double"
	case bool:
		return "Boolean"
	default:
		return typeName
	}
}

// formatBsonValue converts a BSON value to a display-friendly string.
func formatBsonValue(val interface{}) interface{} {
	if val == nil {
		return nil
	}
	switch v := val.(type) {
	case bson.ObjectID:
		return v.Hex()
	case bson.M:
		b, _ := json.Marshal(v)
		return string(b)
	case bson.D:
		m := make(map[string]interface{})
		for _, e := range v {
			m[e.Key] = e.Value
		}
		b, _ := json.Marshal(m)
		return string(b)
	case bson.A:
		b, _ := json.Marshal(v)
		return string(b)
	default:
		return fmt.Sprintf("%v", val)
	}
}

func docsToQueryResult(docs []bson.M) *QueryResult {
	if len(docs) == 0 {
		return &QueryResult{Columns: []string{}, Rows: []map[string]interface{}{}}
	}

	// Collect unique keys
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
				row[col] = formatBsonValue(val)
			} else {
				row[col] = nil
			}
		}
		rows = append(rows, row)
	}

	return &QueryResult{Columns: columns, Rows: rows}
}

func cursorToQueryResult(ctx context.Context, cursor *mongo.Cursor) (*QueryResult, error) {
	var docs []bson.M
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	return docsToQueryResult(docs), nil
}

func bsonArrayToQueryResult(arr bson.A) (*QueryResult, error) {
	var docs []bson.M
	for _, item := range arr {
		if doc, ok := item.(bson.M); ok {
			docs = append(docs, doc)
		}
	}
	return docsToQueryResult(docs), nil
}
