import { getDb } from "./db";
import type { ControlType, RawGrade } from "./grades";
import type { SessionUser } from "./types";

export interface OwnedDiscipline {
  id: number;
  name: string;
  control: ControlType;
  semester: number;
  examDate: string | null;
  closedAt: string | null;
  groupId: number;
  groupName: string;
}

/** Дисциплина, которую ведёт именно этот преподаватель; иначе null (для чужой — как будто её нет). */
export function getOwnedDiscipline(user: SessionUser, id: number): OwnedDiscipline | null {
  if (user.role !== "teacher" || !Number.isInteger(id)) return null;
  const row = getDb()
    .prepare(
      `SELECT d.id, d.name, d.control_type AS control, d.semester, d.exam_date AS examDate,
              d.closed_at AS closedAt, d.group_id AS groupId, g.name AS groupName
         FROM disciplines d JOIN groups g ON g.id = d.group_id
        WHERE d.id = ? AND d.teacher_id = ?`,
    )
    .get(id, user.id) as OwnedDiscipline | undefined;
  return row ?? null;
}

export interface GradebookRow extends RawGrade {
  studentId: number;
  fullName: string;
}

export function getGradebookRows(disciplineId: number, groupId: number): GradebookRow[] {
  return getDb()
    .prepare(
      `SELECT u.id AS studentId, u.full_name AS fullName, gr.kt1, gr.kt2, gr.exam
         FROM student_profiles sp
         JOIN users u ON u.id = sp.user_id
         LEFT JOIN grades gr ON gr.discipline_id = ? AND gr.student_id = u.id
        WHERE sp.group_id = ?
        ORDER BY u.full_name COLLATE NOCASE`,
    )
    .all(disciplineId, groupId) as GradebookRow[];
}
