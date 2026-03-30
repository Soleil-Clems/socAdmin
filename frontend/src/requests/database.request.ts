import customfetch from "@/lib/custom-fetch";

export const databaseRequest = {
  list: () => customfetch.get("/databases"),

  listTables: (db: string) => customfetch.get(`/databases/${db}/tables`),

  describeTable: (db: string, table: string) =>
    customfetch.get(`/databases/${db}/tables/${table}/columns`),

  getRows: (db: string, table: string, limit = 50, offset = 0) =>
    customfetch.get(`/databases/${db}/tables/${table}/rows?limit=${limit}&offset=${offset}`),

  executeQuery: (query: string) => customfetch.post("/query", { query }),
};
