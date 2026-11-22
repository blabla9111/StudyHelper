import { NextResponse } from "next/server";
import { authorize, jsonError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getLessonOnDate } from "@/lib/lesson-access";

export const dynamic = "force-dynamic";

// Всё, что нужно карточке пары. Доступ только к занятиям своей группы или своей дисциплины.
export async function GET(req: Request) {
  const auth = await authorize(req, ["student", "teacher"]);
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const url = new URL(req.url);
  const found = getLessonOnDate(user, Number(url.searchParams.get("lessonId")), url.searchParams.get("date"));
  if (!found) return jsonError("Занятие не найдено.", 404);
  const { lesson, occ } = found;

  const db = getDb();
  const materials = db
    .prepare("SELECT id, title, kind, url FROM materials WHERE lesson_id = ? AND date = ? ORDER BY id")
    .all(lesson.id, occ.date);
  const session = db
    .prepare(
      "SELECT recording_title AS title, recording_url AS url, recording_min AS minutes FROM lesson_sessions WHERE lesson_id = ? AND date = ?",
    )
    .get(lesson.id, occ.date) as { title: string | null; url: string | null; minutes: number | null } | undefined;

  const deadlines = db
    .prepare(
      `SELECT d.id, d.title, d.due_date AS dueDate,
              EXISTS (SELECT 1 FROM deadline_done x WHERE x.deadline_id = d.id AND x.student_id = ?) AS done,
              (SELECT COUNT(*) FROM deadline_done x WHERE x.deadline_id = d.id) AS doneCount
         FROM deadlines d
        WHERE d.lesson_id = ? AND d.lesson_date = ?
        ORDER BY d.due_date, d.id`,
    )
    .all(user.id, lesson.id, occ.date) as { id: number; title: string; dueDate: string; done: number; doneCount: number }[];

  let myRequest = null;
  let requests: unknown[] = [];
  if (user.role === "student") {
    myRequest = db
      .prepare(
        `SELECT reason, comment, status, teacher_comment AS teacherComment
           FROM recording_requests WHERE student_id = ? AND lesson_id = ? AND date = ?`,
      )
      .get(user.id, lesson.id, occ.date);
  } else {
    requests = db
      .prepare(
        `SELECT r.id, u.full_name AS student, r.reason, r.comment, r.status, r.teacher_comment AS teacherComment
           FROM recording_requests r JOIN users u ON u.id = r.student_id
          WHERE r.lesson_id = ? AND r.date = ? ORDER BY r.created_at`,
      )
      .all(lesson.id, occ.date);
  }

  return NextResponse.json({
    occurrence: occ,
    materials,
    recording: session?.title ? { title: session.title, url: session.url, minutes: session.minutes } : null,
    deadlines: deadlines.map((d) => ({ ...d, done: Boolean(d.done) })),
    myRequest: myRequest ?? null,
    requests,
    seriesFormat: lesson.format,
  });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const POST = notAllowed(["GET"]);
export const PUT = notAllowed(["GET"]);
export const PATCH = notAllowed(["GET"]);
export const DELETE = notAllowed(["GET"]);
