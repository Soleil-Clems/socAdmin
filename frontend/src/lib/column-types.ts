// @soleil-clems: Lib - Column type utilities
export const MYSQL_TYPES = [
  "INT", "BIGINT", "SMALLINT", "TINYINT",
  "VARCHAR(255)", "VARCHAR(100)", "VARCHAR(50)",
  "TEXT", "LONGTEXT", "MEDIUMTEXT",
  "BOOLEAN",
  "DATE", "DATETIME", "TIMESTAMP",
  "FLOAT", "DOUBLE", "DECIMAL(10,2)",
  "JSON", "BLOB",
];

export const PG_TYPES = [
  "INTEGER", "BIGINT", "SMALLINT",
  "VARCHAR(255)", "VARCHAR(100)", "VARCHAR(50)",
  "TEXT",
  "BOOLEAN",
  "DATE", "TIMESTAMP", "TIMESTAMPTZ",
  "REAL", "DOUBLE PRECISION", "NUMERIC(10,2)",
  "JSON", "JSONB", "BYTEA", "UUID",
];

export function typeOptionsFor(dbType: string | null | undefined): string[] {
  return dbType === "postgresql" ? PG_TYPES : MYSQL_TYPES;
}
