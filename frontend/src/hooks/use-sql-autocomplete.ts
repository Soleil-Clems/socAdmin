import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

// ── SQL Keywords ──────────────────────────────────────────────────────────
const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "BETWEEN", "LIKE",
  "IS", "NULL", "AS", "ON", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER",
  "CROSS", "FULL", "GROUP", "BY", "ORDER", "ASC", "DESC", "HAVING",
  "LIMIT", "OFFSET", "DISTINCT", "ALL", "UNION", "INTERSECT", "EXCEPT",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE",
  "TABLE", "DATABASE", "INDEX", "VIEW", "DROP", "ALTER", "ADD",
  "COLUMN", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "UNIQUE",
  "CHECK", "DEFAULT", "AUTO_INCREMENT", "CASCADE", "RESTRICT",
  "TRUNCATE", "RENAME", "TO", "EXISTS", "IF", "REPLACE", "TEMPORARY",
  "CASE", "WHEN", "THEN", "ELSE", "END", "CAST", "CONVERT",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "NULLIF",
  "CONCAT", "SUBSTRING", "TRIM", "UPPER", "LOWER", "LENGTH",
  "NOW", "CURRENT_TIMESTAMP", "CURRENT_DATE", "EXTRACT",
  "WITH", "RECURSIVE", "RETURNING", "EXPLAIN", "ANALYZE",
  "GRANT", "REVOKE", "COMMIT", "ROLLBACK", "BEGIN", "TRANSACTION",
  "SHOW", "DESCRIBE", "USE",
];

const PG_EXTRA = [
  "SERIAL", "BIGSERIAL", "SMALLSERIAL", "BOOLEAN", "TEXT", "JSONB", "JSON",
  "UUID", "BYTEA", "ARRAY", "ILIKE", "SIMILAR", "LATERAL", "TABLESAMPLE",
  "GENERATED", "ALWAYS", "IDENTITY", "CONCURRENTLY", "MATERIALIZED",
  "VACUUM", "REINDEX", "CLUSTER", "NOTIFY", "LISTEN", "UNLISTEN",
  "COPY", "DO", "PERFORM", "RAISE", "RETURN", "LOOP", "FOR", "WHILE",
];

const MYSQL_EXTRA = [
  "TINYINT", "SMALLINT", "MEDIUMINT", "BIGINT", "FLOAT", "DOUBLE",
  "DECIMAL", "CHAR", "VARCHAR", "TINYTEXT", "MEDIUMTEXT", "LONGTEXT",
  "BLOB", "TINYBLOB", "MEDIUMBLOB", "LONGBLOB", "ENUM", "SET",
  "DATETIME", "TIMESTAMP", "DATE", "TIME", "YEAR", "UNSIGNED",
  "ENGINE", "INNODB", "CHARSET", "COLLATE", "UTF8MB4",
  "BINARY", "VARBINARY", "BIT", "JSON", "GEOMETRY",
];

const MONGO_COMMANDS = [
  "find", "aggregate", "count", "distinct", "insert", "update", "delete",
  "findAndModify", "getMore", "createIndexes", "dropIndexes", "listIndexes",
  "collStats", "dbStats", "serverStatus", "currentOp", "killOp",
  "$match", "$group", "$sort", "$limit", "$skip", "$project", "$unwind",
  "$lookup", "$addFields", "$set", "$unset", "$replaceRoot", "$replaceWith",
  "$merge", "$out", "$facet", "$bucket", "$bucketAuto", "$sample",
  "$count", "$sortByCount", "$graphLookup", "$geoNear",
  "$sum", "$avg", "$min", "$max", "$push", "$addToSet", "$first", "$last",
  "filter", "pipeline", "cursor", "query", "key", "projection", "sort",
];

// ── Context detection ─────────────────────────────────────────────────────

type SuggestionKind = "keyword" | "table" | "column" | "mongo";

export type Suggestion = {
  text: string;
  kind: SuggestionKind;
  detail?: string;
};

/**
 * Parse the text before the cursor to figure out what to suggest.
 * Returns: { prefix, context }
 *   prefix  = the partial word being typed (for filtering)
 *   context = "keyword" | "table" | "column" | "mongo"
 *   tableName = if context is "column", which table to pull columns from
 */
function parseContext(
  textBeforeCursor: string,
  isMongo: boolean,
): { prefix: string; context: SuggestionKind; tableName?: string } {
  if (isMongo) {
    // For MongoDB JSON queries, just match partial words
    const m = textBeforeCursor.match(/[\w$]+$/);
    return { prefix: m?.[0] ?? "", context: "mongo" };
  }

  // Get the last partial word
  const wordMatch = textBeforeCursor.match(/[\w.]+$/);
  const prefix = wordMatch?.[0] ?? "";

  // Look at the tokens before the prefix to determine context
  const before = textBeforeCursor.slice(0, textBeforeCursor.length - prefix.length).trimEnd();
  const upperBefore = before.toUpperCase();

  // Dot notation: table.col → suggest columns of that table
  if (prefix.includes(".")) {
    const parts = prefix.split(".");
    return { prefix: parts[parts.length - 1], context: "column", tableName: parts[0] };
  }

  // After FROM, JOIN, INTO, UPDATE, TABLE → suggest tables
  if (
    /\b(FROM|JOIN|INTO|UPDATE|TABLE|TRUNCATE|DESCRIBE|DESC)\s*$/i.test(upperBefore) ||
    /\b(FROM|JOIN|INTO|UPDATE|TABLE|TRUNCATE|DESCRIBE|DESC)\s+[\w,]+\s*,\s*$/i.test(upperBefore)
  ) {
    return { prefix, context: "table" };
  }

  // After SELECT, WHERE, ON, SET, BY, HAVING, AND, OR → suggest columns (from detected table)
  const tableFromClause = extractTableName(textBeforeCursor);
  if (
    tableFromClause &&
    /\b(SELECT|WHERE|ON|SET|BY|HAVING|AND|OR|,)\s*$/i.test(upperBefore)
  ) {
    return { prefix, context: "column", tableName: tableFromClause };
  }

  // After a table name in SELECT ... → suggest columns
  if (tableFromClause && /\.\s*$/i.test(before)) {
    return { prefix, context: "column", tableName: tableFromClause };
  }

  // Default: suggest keywords + tables
  return { prefix, context: "keyword" };
}

/** Try to extract the main table name from the query so far. */
function extractTableName(text: string): string | undefined {
  const upper = text.toUpperCase();

  // FROM table
  const fromMatch = upper.match(/\bFROM\s+(\w+)/i);
  if (fromMatch) {
    // Find the actual case from the original text
    const idx = upper.lastIndexOf(fromMatch[0]);
    const original = text.slice(idx).match(/\bFROM\s+(\w+)/i);
    return original?.[1];
  }

  // UPDATE table
  const updateMatch = text.match(/\bUPDATE\s+(\w+)/i);
  if (updateMatch) return updateMatch[1];

  // INSERT INTO table
  const insertMatch = text.match(/\bINTO\s+(\w+)/i);
  if (insertMatch) return insertMatch[1];

  return undefined;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useSqlAutocomplete(
  db: string,
  dbType: string,
) {
  const isMongo = dbType === "mongodb";
  const isPg = dbType === "postgresql";

  // Fetch table list
  const { data: tables } = useQuery({
    queryKey: ["tables", db],
    queryFn: () => databaseRequest.listTables(db),
    enabled: !!db,
    staleTime: 30_000,
  });

  // Column cache: table → column names
  const columnsCache = useRef<Map<string, string[]>>(new Map());
  const [, forceUpdate] = useState(0);

  // Prefetch columns for known tables
  const fetchColumnsFor = useCallback(
    (table: string) => {
      if (!db || !table || columnsCache.current.has(table)) return;
      // Mark as loading to avoid duplicate fetches
      columnsCache.current.set(table, []);
      databaseRequest.describeTable(db, table).then((cols) => {
        const names = cols.map((c) => ("Name" in c ? (c as { Name: string }).Name : (c as { name: string }).name));
        columnsCache.current.set(table, names);
        forceUpdate((n) => n + 1);
      }).catch(() => {
        // Silently ignore — columns won't be suggested for this table
      });
    },
    [db],
  );

  // When tables change, reset cache
  useEffect(() => {
    columnsCache.current.clear();
  }, [db]);

  // Build keyword set based on DB type
  const allKeywords = useMemo(() => {
    if (isMongo) return MONGO_COMMANDS;
    const base = [...SQL_KEYWORDS];
    if (isPg) base.push(...PG_EXTRA);
    else base.push(...MYSQL_EXTRA);
    return [...new Set(base)];
  }, [isMongo, isPg]);

  const getSuggestions = useCallback(
    (textBeforeCursor: string, maxResults = 12): Suggestion[] => {
      const { prefix, context, tableName } = parseContext(textBeforeCursor, isMongo);

      if (!prefix && context !== "table" && context !== "column") return [];

      const lowerPrefix = prefix.toLowerCase();
      const results: Suggestion[] = [];

      if (context === "mongo") {
        for (const cmd of MONGO_COMMANDS) {
          if (cmd.toLowerCase().startsWith(lowerPrefix) && cmd.toLowerCase() !== lowerPrefix) {
            results.push({ text: cmd, kind: "mongo", detail: cmd.startsWith("$") ? "stage/op" : "command" });
          }
          if (results.length >= maxResults) break;
        }
        // Also suggest collection names
        if (tables) {
          for (const t of tables) {
            if (t.toLowerCase().startsWith(lowerPrefix) && t.toLowerCase() !== lowerPrefix) {
              results.push({ text: t, kind: "table", detail: "collection" });
            }
            if (results.length >= maxResults) break;
          }
        }
        return results;
      }

      if (context === "column" && tableName) {
        // Fetch columns if not cached
        fetchColumnsFor(tableName);
        const cols = columnsCache.current.get(tableName) ?? [];
        for (const col of cols) {
          if (col.toLowerCase().startsWith(lowerPrefix) && col.toLowerCase() !== lowerPrefix) {
            results.push({ text: col, kind: "column", detail: tableName });
          }
          if (results.length >= maxResults) break;
        }
        // If no columns yet (loading), fall through to keywords
        if (results.length > 0) return results;
      }

      if (context === "table") {
        if (tables) {
          for (const t of tables) {
            if (t.toLowerCase().startsWith(lowerPrefix)) {
              results.push({ text: t, kind: "table", detail: isMongo ? "collection" : "table" });
            }
            if (results.length >= maxResults) break;
          }
        }
        return results;
      }

      // Keywords + tables mixed
      const scored: (Suggestion & { score: number })[] = [];

      for (const kw of allKeywords) {
        if (kw.toLowerCase().startsWith(lowerPrefix) && kw.toLowerCase() !== lowerPrefix) {
          scored.push({ text: kw, kind: "keyword", score: kw.length === prefix.length ? 2 : 1 });
        }
      }

      if (tables) {
        for (const t of tables) {
          if (t.toLowerCase().startsWith(lowerPrefix) && t.toLowerCase() !== lowerPrefix) {
            scored.push({ text: t, kind: "table", detail: "table", score: 3 });
          }
        }
      }

      // Also suggest columns from the current table context
      const tableFromQuery = extractTableName(textBeforeCursor);
      if (tableFromQuery) {
        fetchColumnsFor(tableFromQuery);
        const cols = columnsCache.current.get(tableFromQuery) ?? [];
        for (const col of cols) {
          if (col.toLowerCase().startsWith(lowerPrefix) && col.toLowerCase() !== lowerPrefix) {
            scored.push({ text: col, kind: "column", detail: tableFromQuery, score: 4 });
          }
        }
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, maxResults);
    },
    [allKeywords, tables, isMongo, fetchColumnsFor],
  );

  return { getSuggestions, tables };
}
