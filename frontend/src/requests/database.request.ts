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
