import customfetch from "@/lib/custom-fetch";

export const databaseRequest = {
  list: () => customfetch.get("/databases"),

  listTables: (db: string) => customfetch.get(`/databases/${db}/tables`),

  describeTable: (db: string, table: string) =>
    customfetch.get(`/databases/${db}/tables/${table}/columns`),

  getRows: (db: string, table: string, limit = 50, offset = 0) =>
    customfetch.get(`/databases/${db}/tables/${table}/rows?limit=${limit}&offset=${offset}`),

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
    customfetch.post("/query", { query, database }),
};
