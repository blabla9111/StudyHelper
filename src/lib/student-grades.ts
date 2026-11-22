import { getDb } from "./db";
import { finalResult, totalPoints, type ControlType } from "./grades";
import type { GradeItem } from "@/components/GradesView";

export interface StudentGroupInfo {
  groupId: number;
  groupName: string;
  direction: string;
  studyForm: string;
}

export function getStudentGroup(userId: number): StudentGroupInfo | null {
  const row = getDb()
    .prepare(
      `SELECT sp.group_id AS groupId, g.name AS groupName, g.direction, sp.study_form AS studyForm
         FROM student_profiles sp JOIN groups g ON g.id = sp.group_id WHERE sp.user_id = ?`,
    )
    .get(userId) as StudentGroupInfo | undefined;
  return row ?? null;
}

export function getSemesters(groupId: number): number[] {
  return (
    getDb()
      .prepare("SELECT DISTINCT semester FROM disciplines WHERE group_id = ? ORDER BY semester DESC")
      .all(groupId) as { semester: number }[]
  ).map((r) => r.semester);
}

/** Дисциплины группы за семестр с баллами именно этого студента (студент_id берётся из сессии). */
export function getGradeItems(studentId: number, groupId: number, semester: number): GradeItem[] {
  const rows = getDb()
    .prepare(
      `SELECT d.id, d.name, d.control_type AS control, t.full_name AS teacher, d.exam_date AS examDate,
              d.closed_at AS closedAt, gr.kt1, gr.kt2, gr.exam
         FROM disciplines d
         JOIN users t ON t.id = d.teacher_id
         LEFT JOIN grades gr ON gr.discipline_id = d.id AND gr.student_id = ?
        WHERE d.group_id = ? AND d.semester = ?
        ORDER BY d.name COLLATE NOCASE`,
    )
    .all(studentId, groupId, semester) as (Omit<GradeItem, "closed"> & { closedAt: string | null })[];

  return rows.map(({ closedAt, ...rest }) => ({ ...rest, closed: closedAt !== null }));
}

export interface GradesSummary {
  passed: number;
  total: number;
  failed: number;
  averagePoints: number | null;
  nextExam: { name: string; date: string } | null;
}

export function summarize(items: GradeItem[], today: string): GradesSummary {
  let passed = 0;
  let failed = 0;
  const closedTotals: number[] = [];
  for (const i of items) {
    const total = totalPoints(i);
    if (i.closed && total !== null) {
      closedTotals.push(total);
      if (finalResult(i.control as ControlType, total).passed) passed++;
      else failed++;
    }
  }
  const upcoming = items
    .filter((i) => !i.closed && i.examDate && i.examDate >= today)
    .sort((a, b) => (a.examDate! < b.examDate! ? -1 : 1))[0];
  return {
    passed,
    failed,
    total: items.length,
    averagePoints: closedTotals.length ? Math.round(closedTotals.reduce((a, b) => a + b, 0) / closedTotals.length) : null,
    nextExam: upcoming ? { name: upcoming.name, date: upcoming.examDate! } : null,
  };
}
