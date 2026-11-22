import type Database from "better-sqlite3";

export interface NewNotification {
  type: string;
  title: string;
  body: string;
  link: string;
}

/** У каждого получателя своя копия уведомления со своим статусом «прочитано» */
export function notifyUsers(db: Database.Database, userIds: number[], n: NewNotification) {
  const stmt = db.prepare(
    "INSERT INTO notifications (user_id, type, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const now = new Date().toISOString();
  for (const id of userIds) stmt.run(id, n.type, n.title, n.body, n.link, now);
}

export function studentIdsOfGroup(db: Database.Database, groupId: number): number[] {
  return (
    db.prepare("SELECT user_id AS id FROM student_profiles WHERE group_id = ?").all(groupId) as { id: number }[]
  ).map((r) => r.id);
}
