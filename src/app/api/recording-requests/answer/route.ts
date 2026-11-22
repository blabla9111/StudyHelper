import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { clean, lessonLink } from "@/lib/lesson-access";
import { notifyUsers } from "@/lib/notify";
import { formatDayMonth } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const ANSWERS = {
  will_record: "Преподаватель запишет пару",
  will_send_notes: "Преподаватель пришлёт конспект",
  declined: "Записать пару не получится",
} as const;

interface Target {
  id: number;
  studentId: number;
  lessonId: number;
  date: string;
  subject: string;
}

/**
 * Преподаватель отвечает на запросы студентов. Только по своим дисциплинам.
 * Два режима: один запрос ({ id }) или все запросы одной пары ({ lessonId, date }), по умолчанию только ждущие ответа,
 * а с all: true ещё и уже отвеченные (чтобы изменить решение для всех).
 */
export async function POST(req: Request) {
  const auth = await authorize(req, ["teacher"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос.", 400);
  const status = body.status as keyof typeof ANSWERS;
  if (typeof body.status !== "string" || !Object.hasOwn(ANSWERS, status)) return jsonError("Выберите ответ.", 400);
  const comment = clean(body.comment, 500);
  if (status === "declined" && !comment) return jsonError("Напишите студентам, почему не получится.", 400);

  const db = getDb();
  const select = `SELECT r.id, r.student_id AS studentId, r.lesson_id AS lessonId, r.date, d.name AS subject
                    FROM recording_requests r
                    JOIN lessons l ON l.id = r.lesson_id
                    JOIN disciplines d ON d.id = l.discipline_id`;
  let targets: Target[];

  if (typeof body.id === "number" && Number.isInteger(body.id)) {
    targets = db.prepare(`${select} WHERE r.id = ? AND d.teacher_id = ?`).all(body.id, auth.user.id) as Target[];
  } else if (Number.isInteger(body.lessonId) && typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    targets = db
      .prepare(`${select} WHERE r.lesson_id = ? AND r.date = ? AND d.teacher_id = ? ${body.all === true ? "" : "AND r.status = 'sent'"}`)
      .all(body.lessonId, body.date, auth.user.id) as Target[];
  } else {
    return jsonError("Некорректный запрос.", 400);
  }
  if (targets.length === 0) return jsonError("Запросы не найдены.", 404);

  const now = new Date().toISOString();
  db.transaction(() => {
    const upd = db.prepare("UPDATE recording_requests SET status = ?, teacher_comment = ?, updated_at = ? WHERE id = ?");
    for (const t of targets) {
      upd.run(status, comment || null, now, t.id);
      notifyUsers(db, [t.studentId], {
        type: "recording_request",
        title: ANSWERS[status],
        body: `${t.subject}, ${formatDayMonth(t.date)}.${comment ? ` ${comment}` : ""}`,
        link: lessonLink(t.lessonId, t.date),
      });
    }
  })();
  return NextResponse.json({ ok: true, updated: targets.length });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
