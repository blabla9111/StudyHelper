import type Database from "better-sqlite3";

export type AudienceType = "all" | "group" | "course" | "direction";

export const AUDIENCE_LABEL: Record<AudienceType, string> = {
  all: "Все студенты",
  group: "Группа",
  course: "Курс",
  direction: "Направление",
};

/** Студенты, которым адресовано объявление */
export function audienceStudentIds(db: Database.Database, type: AudienceType, value: string | null): number[] {
  const base =
    "SELECT sp.user_id AS id FROM student_profiles sp JOIN groups g ON g.id = sp.group_id";
  const rows =
    type === "all"
      ? db.prepare(base).all()
      : type === "group"
        ? db.prepare(`${base} WHERE g.name = ?`).all(value)
        : type === "course"
          ? db.prepare(`${base} WHERE g.course = ?`).all(Number(value))
          : db.prepare(`${base} WHERE g.direction = ?`).all(value);
  return (rows as { id: number }[]).map((r) => r.id);
}
