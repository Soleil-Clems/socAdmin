import customfetch, { API_URL } from "@/lib/custom-fetch";

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
  keys: Record<string, number>;
  unique: boolean;
  sparse: boolean;
  ttl?: number;
};

export type MongoRoleInfo = {
  role: string;
  db: string;
  isBuiltin: boolean;
  privileges?: { resource: Record<string, unknown>; actions: string[] }[];
  inheritedRoles?: { role: string; db: string }[];
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

  mongoInsertMany: async (db: string, collection: string, docs: Record<string, unknown>[]) => {
    const token = localStorage.getItem("access_token");
    const res = await fetch(`${API_URL}/databases/${db}/tables/${collection}/insertMany`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(docs),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Insert failed");
    return data as { inserted: number };
  },

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

  mongoCreateIndex: (db: string, collection: string, keys: string, unique: boolean, name?: string, sparse?: boolean, ttlSeconds?: number, partialFilter?: string) =>
    customfetch.post(`/databases/${db}/tables/${collection}/indexes`, {
      keys, unique, name: name || "",
      sparse: sparse || false,
      ttl_seconds: ttlSeconds || 0,
      partial_filter: partialFilter || "",
    }),

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

  mongoUploadGridFSFile: async (db: string, bucket: string, file: File) => {
    const token = localStorage.getItem("access_token");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/databases/${db}/gridfs/${bucket}/files`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data as { id: string; filename: string; size: number };
  },

  mongoDownloadGridFSFile: async (db: string, bucket: string, id: string, filename: string) => {
    const token = localStorage.getItem("access_token");
    const res = await fetch(`${API_URL}/databases/${db}/gridfs/${bucket}/files/${id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  mongoDeleteGridFSFile: (db: string, bucket: string, id: string) =>
    customfetch.delete(`/databases/${db}/gridfs/${bucket}/files/${id}`),

  listUsers: () => customfetch.get<Record<string, unknown>[]>("/users"),

  serverStatus: () => customfetch.get<Record<string, unknown>>("/status"),

  // Export — returns raw file content (not JSON)
  exportDatabase: async (db: string, format: "csv" | "json" | "sql" | "yaml" = "sql") => {
    const token = localStorage.getItem("access_token");
    const res = await fetch(`${API_URL}/databases/${db}/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${db}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  },

  exportTable: async (db: string, table: string, format: "csv" | "json" | "sql" | "yaml") => {
    const token = localStorage.getItem("access_token");
    const res = await fetch(`${API_URL}/databases/${db}/tables/${table}/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Import
  importSQL: (db: string, sql: string) => {
    const token = localStorage.getItem("access_token");
    return fetch(`${API_URL}/databases/${db}/import/sql`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: sql,
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      return data;
    });
  },

  importCSV: (db: string, table: string, csv: string) => {
    const token = localStorage.getItem("access_token");
    return fetch(`${API_URL}/databases/${db}/tables/${table}/import/csv`, {
      method: "POST",
      headers: {
        "Content-Type": "text/csv",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: csv,
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      return data;
    });
  },

  importJSON: (db: string, table: string, jsonData: string) => {
    const token = localStorage.getItem("access_token");
    return fetch(`${API_URL}/databases/${db}/tables/${table}/import/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: jsonData,
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      return data;
    });
  },
};
