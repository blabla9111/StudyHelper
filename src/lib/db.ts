import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA } from "./schema";

type Db = Database.Database;

// Одно соединение на процесс (в dev-режиме модули перезагружаются, поэтому храним в globalThis)
const g = globalThis as unknown as { __studyhelperDb?: Db };

export function getDb(): Db {
  if (!g.__studyhelperDb) {
    const file = process.env.DATABASE_PATH
      ? path.resolve(process.env.DATABASE_PATH)
      : path.join(process.cwd(), "data", "studyhelper.db");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new Database(file);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    migrate(db);
    g.__studyhelperDb = db;
  }
  return g.__studyhelperDb;
}

// Базы, созданные прежними версиями, дополняем новыми столбцами (CREATE TABLE IF NOT EXISTS их не добавит)
function migrate(db: Db) {
  const cols = (db.prepare("PRAGMA table_info(lessons)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("format")) {
    db.exec("ALTER TABLE lessons ADD COLUMN format TEXT NOT NULL DEFAULT 'offline'");
  }
  if (!cols.includes("online_comment")) {
    db.exec("ALTER TABLE lessons ADD COLUMN online_comment TEXT");
  }
  const ncols = (db.prepare("PRAGMA table_info(notifications)").all() as { name: string }[]).map((c) => c.name);
  if (!ncols.includes("dismissed_at")) {
    db.exec("ALTER TABLE notifications ADD COLUMN dismissed_at TEXT");
  }
}
