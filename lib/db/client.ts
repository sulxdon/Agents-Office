import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { drizzle, type SQLJsDatabase } from "drizzle-orm/sql-js";
import * as schema from "./schema";
import fs from "node:fs";
import path from "node:path";

// sql.js (SQLite compiled to WASM) — no native build tools needed, persists to a file.
// AGENT_OFFICE_DB overrides the path (tests point it at a temp file).
// Read lazily so the override can be set before first use.
function dbPath() {
  return process.env.AGENT_OFFICE_DB || path.join(process.cwd(), "data", "agent-office.sqlite");
}

let sqlDb: SQLJsDatabase<typeof schema> | null = null;
let rawDb: SqlJsDatabase | null = null;
let initPromise: Promise<SQLJsDatabase<typeof schema>> | null = null;

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT '🏢', floor_number INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#6366f1', office_id TEXT);
CREATE TABLE IF NOT EXISTS offices (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, team_id TEXT, name TEXT NOT NULL, x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, width REAL NOT NULL DEFAULT 420, height REAL NOT NULL DEFAULT 300);
CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, avatar TEXT DEFAULT '🙂', personality_prompt TEXT DEFAULT '', model TEXT DEFAULT '', skills TEXT DEFAULT '[]', status TEXT NOT NULL DEFAULT 'idle', x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, current_task_id TEXT);
CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'active', priority TEXT NOT NULL DEFAULT 'medium', created_by TEXT DEFAULT 'ceo', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT DEFAULT '', assignee_agent_id TEXT, status TEXT NOT NULL DEFAULT 'todo', dependencies TEXT DEFAULT '[]', artifacts TEXT DEFAULT '[]', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, task_id TEXT, agent_id TEXT, project_id TEXT, content TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'chat', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, agent_id TEXT, type TEXT NOT NULL DEFAULT 'fact', content TEXT NOT NULL, embedding TEXT DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'info', description TEXT NOT NULL, timestamp INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS whiteboards (id TEXT PRIMARY KEY, office_id TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS llm_calls (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, provider TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', agent_name TEXT, task_id TEXT, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, latency_ms INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 1, error TEXT, timestamp INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events_outbox (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}', timestamp INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_events_outbox_project_time ON events_outbox (project_id, timestamp);
`;

export async function getDb(): Promise<SQLJsDatabase<typeof schema>> {
  if (sqlDb) return sqlDb;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const SQL = await initSqlJs();
    const file = dbPath();
    let db: SqlJsDatabase;
    try {
      if (fs.existsSync(file)) {
        const buf = fs.readFileSync(file);
        db = new SQL.Database(buf);
      } else {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        db = new SQL.Database();
      }
    } catch {
      db = new SQL.Database();
    }
    db.exec(CREATE_TABLES);
    rawDb = db;
    sqlDb = drizzle(db, { schema });
    return sqlDb;
  })();
  return initPromise;
}

/** Flush the in-memory SQLite state to disk. Call after writes. */
export function persistDb() {
  if (!rawDb) return;
  try {
    const file = dbPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const data = rawDb.export();
    fs.writeFileSync(file, Buffer.from(data));
  } catch {
    // persistence is best-effort; the app keeps running in memory
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced flush for high-frequency writers (event bus). Coalesces bursts
 * into one disk write instead of exporting the whole DB per event.
 */
export function schedulePersist(delayMs = 1500) {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistDb();
  }, delayMs);
  persistTimer.unref?.();
}
