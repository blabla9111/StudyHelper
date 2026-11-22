import type Database from "better-sqlite3";

/** Запись в журнал изменений: кто, когда, что и над чем сделал; в details лежат прежние значения */
export function writeAudit(db: Database.Database, userId: number | null, action: string, object: string, details: unknown) {
  db.prepare("INSERT INTO audit_log (at, user_id, action, object, details) VALUES (?, ?, ?, ?, ?)").run(
    new Date().toISOString(),
    userId,
    action,
    object,
    JSON.stringify(details ?? null),
  );
}

/** Последнее событие жизненного цикла ведомости (закрыта или открыта для правок) */
export function lastGradebookEvent(db: Database.Database, disciplineId: number): string | null {
  const row = db
    .prepare("SELECT action FROM audit_log WHERE object = ? AND action IN ('gradebook_close', 'gradebook_reopen') ORDER BY id DESC LIMIT 1")
    .get(`discipline:${disciplineId}`) as { action: string } | undefined;
  return row?.action ?? null;
}
