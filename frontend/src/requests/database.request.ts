import customfetch from "@/lib/custom-fetch";

export type TableColumnDef = {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  auto_increment: boolean;
  default_value: string;
};

export type AlterColumnOp = {
  op: "add" | "drop" | "rename" | "modify";
  name: string;
  new_name?: string;
  type?: string;
  nullable?: boolean;
  default_value?: string;
};

export type DatabaseInfo = {
  name: string;
  table_count: number;
  size: string;
  size_bytes: number;
};

export type SchemaTable = {
  name: string;
  columns: SchemaColumn[];
};

export type SchemaColumn = {
  name: string;
  type: string;
  nullable: boolean;
  is_primary: boolean;
  foreign_key?: { ref_table: string; ref_column: string };
};

export type MongoFindResult = {
  Columns: string[];
  Rows: Record<string, unknown>[];
  total: number;
};

export type MongoCollectionStats = {
  documents: number;
  avg_doc_size: number;
  total_size: number;
  index_count: number;
  index_size: number;
  storage_size: number;
};

export type MongoIndex = {
  name: string;
  keys: Record<string, number | string>;
  unique: boolean;
  sparse: boolean;
  hidden?: boolean;
  ttl?: number;
};

export type MongoRoleInfo = {
  role: string;
  db: string;
  isBuiltin: boolean;
  privileges?: { resource: Record<string, unknown>; actions: string[] }[];
  inheritedRoles?: { role: string; db: string }[];
};

export type TimeSeriesOptions = {
  timeField: string;
  metaField?: string;
  granularity?: string;
  expireAfterSeconds?: number;
  bucketMaxSpanSeconds?: number;
  bucketRoundingSeconds?: number;
};

export type ShardInfo = {
  id: string;
  host: string;
  state: number;
  tags?: string[];
};

export type ShardedClusterInfo = {
  isSharded: boolean;
  shards: ShardInfo[];
  balancerRunning: boolean;
  balancerEnabled: boolean;
};

export type CollectionShardingInfo = {
  sharded: boolean;
  shardKey?: Record<string, unknown>;
  unique?: boolean;
  chunkCount: number;
  distribution?: { shard: string; chunks: number }[];
};

export type GridFSFileInfo = {
  id: string;
  filename: string;
  length: number;
  chunkSize: number;
  uploadDate: string;
  metadata?: string;
};

export type SearchResult = {
  table: string;
  matches: Record<string, unknown>[];
  total: number;
  columns: string[];
};

export type TriggerInfo = {
  name: string;
  table: string;
  event: string;
  timing: string;
  statement: string;
};

export type RoutineInfo = {
  name: string;
  type: string;
  return_type?: string;
  body: string;
  param_list?: string;
};

export type ChangeEvent = {
  operationType: string;
  fullDocument?: Record<string, unknown>;
  documentKey?: Record<string, unknown>;
  ns: { db: string; coll: string };
  timestamp: string;
};

type Column = {
  Name: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
};

type QueryResult = {
  Columns: string[];
  Rows: Record<string, unknown>[];
};

export const databaseRequest = {
  list: () => customfetch.get<string[]>("/databases"),

  listWithStats: () => customfetch.get<DatabaseInfo[]>("/databases/stats"),

  getSchema: (db: string) =>
    customfetch.get<SchemaTable[]>(`/databases/${db}/schema`),

  searchGlobal: (db: string, q: string, limit = 5) =>
    customfetch.get<SearchResult[]>(`/databases/${db}/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  createDatabase: (name: string) =>
    customfetch.post("/databases", { name }),

  dropDatabase: (db: string) => customfetch.delete(`/databases/${db}`),

  listTables: (db: string) => customfetch.get<string[]>(`/databases/${db}/tables`),

  createTable: (db: string, name: string, columns: TableColumnDef[]) =>
    customfetch.post(`/databases/${db}/tables`, { name, columns }),

  alterColumn: (db: string, table: string, op: AlterColumnOp) =>
    customfetch.post(
      `/databases/${db}/tables/${table}/columns/alter`,
      op as unknown as Record<string, unknown>,
    ),

  describeTable: (db: string, table: string) =>
    customfetch.get<Column[]>(`/databases/${db}/tables/${table}/columns`),

  getRows: (db: string, table: string, limit = 50, offset = 0) =>
    customfetch.get<QueryResult>(`/databases/${db}/tables/${table}/rows?limit=${limit}&offset=${offset}`),

  insertRow: (db: string, table: string, data: Record<string, unknown>) =>
    customfetch.post(`/databases/${db}/tables/${table}/rows`, { data }),

  updateRow: (db: string, table: string, primaryKey: Record<string, unknown>, data: Record<string, unknown>) =>
    customfetch.put(`/databases/${db}/tables/${table}/rows`, { primary_key: primaryKey, data }),

  deleteRow: (db: string, table: string, primaryKey: Record<string, unknown>) =>
    customfetch.delete(`/databases/${db}/tables/${table}/rows`, { primary_key: primaryKey }),

  dropTable: (db: string, table: string) =>
    customfetch.delete(`/databases/${db}/tables/${table}`),

  truncateTable: (db: string, table: string) =>
    customfetch.post(`/databases/${db}/tables/${table}/truncate`, {}),

  executeQuery: (query: string, database?: string) =>
    customfetch.post<QueryResult>("/query", { query, database }),

  // MongoDB-specific
  mongoFind: (db: string, collection: string, filter: string, sort: string, limit: number, skip: number, projection = "{}") =>
    customfetch.post<MongoFindResult>(`/databases/${db}/tables/${collection}/find`, { filter, sort, projection, limit, skip }),

  mongoExplain: (db: string, collection: string, filter: string, sort: string) =>
    customfetch.post<Record<string, unknown>>(`/databases/${db}/tables/${collection}/explain`, { filter, sort }),

  mongoInsertMany: (db: string, collection: string, docs: Record<string, unknown>[]) =>
    customfetch.post<{ inserted: number }>(`/databases/${db}/tables/${collection}/insertMany`, docs),

  mongoUpdateMany: (db: string, collection: string, filter: string, update: string) =>
    customfetch.post<{ matched: number; modified: number }>(`/databases/${db}/tables/${collection}/updateMany`, { filter, update }),

  mongoDeleteMany: (db: string, collection: string, filter: string) =>
    customfetch.post<{ deleted: number }>(`/databases/${db}/tables/${collection}/deleteMany`, { filter }),

  mongoDistinct: (db: string, collection: string, field: string, filter = "{}") =>
    customfetch.post<{ field: string; values: unknown[]; count: number }>(`/databases/${db}/tables/${collection}/distinct`, { field, filter }),

  // MongoDB user management
  mongoCreateUser: (username: string, password: string, database: string, roles: { role: string; db: string }[]) =>
    customfetch.post("/mongo/users", { username, password, database, roles }),

  mongoDropUser: (username: string, database: string) =>
    customfetch.delete("/mongo/users", { username, database }),

  mongoUpdateUserRoles: (username: string, database: string, roles: { role: string; db: string }[]) =>
    customfetch.put("/mongo/users/roles", { username, database, roles }),

  mongoListRoles: (db = "admin") =>
    customfetch.get<string[]>(`/mongo/roles?db=${db}`),

  mongoCount: (db: string, collection: string) =>
    customfetch.get<{ count: number }>(`/databases/${db}/tables/${collection}/count`),

  mongoListIndexes: (db: string, collection: string) =>
    customfetch.get<MongoIndex[]>(`/databases/${db}/tables/${collection}/indexes`),

  mongoCreateIndex: (db: string, collection: string, opts: {
    keys: string; unique?: boolean; sparse?: boolean; hidden?: boolean;
    name?: string; ttl_seconds?: number; partial_filter?: string;
    collation?: string; wildcard_proj?: string; default_language?: string; text_weights?: string;
  }) =>
    customfetch.post(`/databases/${db}/tables/${collection}/indexes`, {
      keys: opts.keys,
      unique: opts.unique || false,
      sparse: opts.sparse || false,
      hidden: opts.hidden || false,
      name: opts.name || "",
      ttl_seconds: opts.ttl_seconds || 0,
      partial_filter: opts.partial_filter || "",
      collation: opts.collation || "",
      wildcard_proj: opts.wildcard_proj || "",
      default_language: opts.default_language || "",
      text_weights: opts.text_weights || "",
    }),

  mongoSetIndexHidden: (db: string, collection: string, name: string, hidden: boolean) =>
    customfetch.put(`/databases/${db}/tables/${collection}/indexes/hidden`, { name, hidden }),

  mongoDropIndex: (db: string, collection: string, name: string) =>
    customfetch.delete(`/databases/${db}/tables/${collection}/indexes`, { name }),

  mongoCollectionStats: (db: string, collection: string) =>
    customfetch.get<MongoCollectionStats>(`/databases/${db}/tables/${collection}/stats`),

  // currentOp / killOp
  mongoCurrentOp: () =>
    customfetch.get<{ opid: unknown; active: boolean; op: string; ns: string; secs_running: number; desc: string; client: string; command: string }[]>("/mongo/currentop"),

  mongoKillOp: (opid: unknown) =>
    customfetch.post("/mongo/killop", { opid } as Record<string, unknown>),

  // MongoDB Views
  mongoListViews: (db: string) =>
    customfetch.get<{ name: string; viewOn: string; pipeline: string }[]>(`/databases/${db}/views`),

  mongoCreateView: (db: string, name: string, source: string, pipeline: string) =>
    customfetch.post(`/databases/${db}/views`, { name, source, pipeline }),

  // Schema Validation
  mongoGetValidation: (db: string, collection: string) =>
    customfetch.get<{ validator?: string; validationLevel: string; validationAction: string }>(`/databases/${db}/tables/${collection}/validation`),

  mongoSetValidation: (db: string, collection: string, validator: string, level: string, action: string) =>
    customfetch.put(`/databases/${db}/tables/${collection}/validation`, { validator, validation_level: level, validation_action: action }),

  // Rename Collection
  mongoRenameCollection: (db: string, collection: string, newName: string) =>
    customfetch.post(`/databases/${db}/tables/${collection}/rename`, { new_name: newName }),

  // Database Profiler
  mongoGetProfilingLevel: (db: string) =>
    customfetch.get<{ was: number; slowms: number }>(`/databases/${db}/profiling`),

  mongoSetProfilingLevel: (db: string, level: number, slowms: number) =>
    customfetch.put(`/databases/${db}/profiling`, { level, slowms }),

  mongoGetProfileData: (db: string, limit = 50) =>
    customfetch.get<{ op: string; ns: string; millis: number; ts: string; command: string; nreturned: number; docsExamined: number; keysExamined: number; planSummary: string }[]>(`/databases/${db}/profiling/data?limit=${limit}`),

  // Database Stats
  mongoDatabaseStats: (db: string) =>
    customfetch.get<Record<string, unknown>>(`/databases/${db}/dbstats`),

  // Capped Collections
  mongoCreateCappedCollection: (db: string, name: string, sizeBytes: number, maxDocs: number) =>
    customfetch.post(`/databases/${db}/capped`, { name, size_bytes: sizeBytes, max_docs: maxDocs }),

  mongoIsCollectionCapped: (db: string, collection: string) =>
    customfetch.get<{ capped: boolean }>(`/databases/${db}/tables/${collection}/capped`),

  // Compact
  mongoCompactCollection: (db: string, collection: string) =>
    customfetch.post(`/databases/${db}/tables/${collection}/compact`, {}),

  // Duplicate Collection
  mongoDuplicateCollection: (db: string, collection: string, target: string) =>
    customfetch.post(`/databases/${db}/tables/${collection}/duplicate`, { target }),

  // Server Log
  mongoGetServerLog: (type = "global") =>
    customfetch.get<{ log: string[]; total: number }>(`/mongo/log?type=${type}`),

  // Convert to Capped
  mongoConvertToCapped: (db: string, collection: string, sizeBytes: number) =>
    customfetch.post(`/databases/${db}/tables/${collection}/convert-capped`, { size_bytes: sizeBytes }),

  // Collection Metadata
  mongoListCollectionsWithMeta: (db: string) =>
    customfetch.get<{ name: string; type: string; capped: boolean; documents: number; size: number }[]>(`/databases/${db}/collections/meta`),

  // Replica Set
  mongoReplicaSetStatus: () =>
    customfetch.get<Record<string, unknown>>("/mongo/replset"),

  // Sample
  mongoSampleDocuments: (db: string, collection: string, n = 10) =>
    customfetch.get<{ Columns: string[]; Rows: Record<string, unknown>[] }>(`/databases/${db}/tables/${collection}/sample?n=${n}`),

  // Index Usage Stats
  mongoIndexUsageStats: (db: string, collection: string) =>
    customfetch.get<{ name: string; ops: number; since: string }[]>(`/databases/${db}/tables/${collection}/index-stats`),

  // Field Type Analysis
  mongoFieldTypeAnalysis: (db: string, collection: string, sample = 100) =>
    customfetch.get<Record<string, Record<string, number>>>(`/databases/${db}/tables/${collection}/field-analysis?sample=${sample}`),

  // Top Stats
  mongoTopStats: () =>
    customfetch.get<{ namespace: string; total_time: number; total_count: number; read_time: number; read_count: number; write_time: number; write_count: number }[]>("/mongo/top"),

  // Aggregation Pipeline
  mongoRunAggregation: (db: string, collection: string, pipeline: string) =>
    customfetch.post<QueryResult>(`/databases/${db}/tables/${collection}/aggregate`, { pipeline }),

  // ── Custom Roles ──
  mongoListRolesDetailed: (db: string, showBuiltin = false) =>
    customfetch.get<MongoRoleInfo[]>(`/databases/${db}/roles/detailed?builtin=${showBuiltin ? "1" : "0"}`),

  mongoCreateCustomRole: (db: string, name: string, privileges: string, inheritedRoles: string) =>
    customfetch.post(`/databases/${db}/roles`, { name, privileges, inherited_roles: inheritedRoles }),

  mongoUpdateCustomRole: (db: string, role: string, privileges: string, inheritedRoles: string) =>
    customfetch.put(`/databases/${db}/roles/${role}`, { name: role, privileges, inherited_roles: inheritedRoles }),

  mongoDropCustomRole: (db: string, role: string) =>
    customfetch.delete(`/databases/${db}/roles/${role}`),

  // ── GridFS ──
  mongoListGridFSBuckets: (db: string) =>
    customfetch.get<string[]>(`/databases/${db}/gridfs`),

  mongoListGridFSFiles: (db: string, bucket: string, limit = 200) =>
    customfetch.get<GridFSFileInfo[]>(`/databases/${db}/gridfs/${bucket}/files?limit=${limit}`),

  mongoUploadGridFSFile: (db: string, bucket: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return customfetch.upload<{ id: string; filename: string; size: number }>(
      `/databases/${db}/gridfs/${bucket}/files`,
      form,
    );
  },

  mongoDownloadGridFSFile: (db: string, bucket: string, id: string, filename: string) =>
    customfetch.download(`/databases/${db}/gridfs/${bucket}/files/${id}/download`, filename),

  mongoDeleteGridFSFile: (db: string, bucket: string, id: string) =>
    customfetch.delete(`/databases/${db}/gridfs/${bucket}/files/${id}`),

  // ── Time Series ──
  mongoCreateTimeSeriesCollection: (
    db: string,
    data: {
      name: string;
      timeField: string;
      metaField?: string;
      granularity?: string;
      expireAfterSeconds?: number;
    },
  ) => customfetch.post(`/databases/${db}/timeseries`, data),

  mongoGetTimeSeriesInfo: (db: string, collection: string) =>
    customfetch.get<TimeSeriesOptions | { timeseries: null }>(
      `/databases/${db}/tables/${collection}/timeseries`,
    ),

  // ── Sharding ──
  mongoGetClusterShardingInfo: () =>
    customfetch.get<ShardedClusterInfo>("/sharding/cluster"),

  mongoGetCollectionShardingInfo: (db: string, collection: string) =>
    customfetch.get<CollectionShardingInfo>(
      `/databases/${db}/tables/${collection}/sharding`,
    ),

  listUsers: () => customfetch.get<Record<string, unknown>[]>("/users"),

  serverStatus: () => customfetch.get<Record<string, unknown>>("/status"),

  // Export — triggers a file download with the SGBD-native dump format
  exportDatabase: (db: string, format: "csv" | "json" | "sql" | "yaml" = "sql") =>
    customfetch.download(`/databases/${db}/export?format=${format}`, `${db}.${format}`),

  exportTable: (db: string, table: string, format: "csv" | "json" | "sql" | "yaml") =>
    customfetch.download(`/databases/${db}/tables/${table}/export?format=${format}`, `${table}.${format}`),

  // Import — raw text body, custom Content-Type per format
  importSQL: (db: string, sql: string) =>
    customfetch.postText(`/databases/${db}/import/sql`, sql, "text/plain"),

  importCSV: (db: string, table: string, csv: string) =>
    customfetch.postText(`/databases/${db}/tables/${table}/import/csv`, csv, "text/csv"),

  importJSON: (db: string, table: string, jsonData: string) =>
    customfetch.postText(`/databases/${db}/tables/${table}/import/json`, jsonData, "application/json"),

  // ── Backup / Restore ────────────────────────────────────────────
  // Returns which native dump tools are installed on the host so the
  // UI can disable the backup button when missing.
  backupBinariesStatus: () =>
    customfetch.get<Record<string, boolean>>("/backup/binaries"),

  // Streams a database dump to a file download.
  backupDatabase: (db: string, dbType: string) => {
    const ts = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace("T", "-")
      .slice(0, 15);
    const ext = dbType === "mongodb" ? "archive" : "sql";
    return customfetch.download(`/databases/${db}/backup`, `${db}-${ts}.${ext}`);
  },

  // Uploads a dump file and replays it into db.
  restoreDatabase: (db: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return customfetch.upload(`/databases/${db}/restore`, form);
  },

  // ── Triggers ──
  listTriggers: (db: string) =>
    customfetch.get<TriggerInfo[]>(`/databases/${db}/triggers`),

  dropTrigger: (db: string, name: string, table: string) =>
    customfetch.delete(`/databases/${db}/triggers`, { name, table }),

  // ── Routines (stored procedures / functions) ──
  listRoutines: (db: string) =>
    customfetch.get<RoutineInfo[]>(`/databases/${db}/routines`),

  dropRoutine: (db: string, name: string, type: string) =>
    customfetch.delete(`/databases/${db}/routines`, { name, type }),

  // ── Schemas (PostgreSQL) ──
  listSchemas: (db: string) =>
    customfetch.get<string[]>(`/databases/${db}/schemas`),

  listTablesInSchema: (db: string, schema: string) =>
    customfetch.get<string[]>(`/databases/${db}/schemas/${schema}/tables`),

  // ── Table Maintenance ──
  maintenanceTable: (db: string, table: string, operation: string) =>
    customfetch.post<{ result: string }>(`/databases/${db}/tables/${table}/maintenance`, { operation }),
};
