import { NextResponse } from "next/server";
import { authorize, jsonError, limitUser, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { clean, getLessonOnDate, tooLong } from "@/lib/lesson-access";
import { notifyUsers } from "@/lib/notify";
import { formatDayMonth } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  illness: "болею",
  work: "работа или стажировка",
  event: "олимпиада или мероприятие",
  other: "другое",
};

// Студент просит записать пару
export async function POST(req: Request) {
  const auth = await authorize(req, ["student"], { mutating: true });
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const limited = limitUser(user.id, "recording", 30);
  if (limited) return limited;
  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос.", 400);
  const found = getLessonOnDate(user, body.lessonId, body.date);
  if (!found) return jsonError("Занятие не найдено.", 404);
  const { lesson, occ } = found;

  if (occ.status === "cancelled" || occ.status === "moved_away") return jsonError("Эта пара не состоится.", 400);
  if (typeof body.reason !== "string" || !(Object.hasOwn(REASONS, body.reason))) return jsonError("Выберите причину.", 400);
  if (tooLong(body.comment, 500)) return jsonError("Комментарий не длиннее 500 символов.", 400);
  const comment = clean(body.comment, 500);
  if (body.reason === "other" && !comment) return jsonError("Опишите причину в комментарии.", 400);

  const db = getDb();
  const dup = db
    .prepare("SELECT 1 FROM recording_requests WHERE student_id = ? AND lesson_id = ? AND date = ?")
    .get(user.id, lesson.id, occ.date);
  if (dup) return jsonError("Вы уже отправили запрос на эту пару.", 409);

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO recording_requests (student_id, lesson_id, date, reason, comment, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'sent', ?, ?)`,
    ).run(user.id, lesson.id, occ.date, body.reason, comment || null, now, now);
    // Одна пара, много просящих: у преподавателя одно уведомление со счётчиком, а не по штуке на каждого студента
    const link = `/recordings#pair-${lesson.id}-${occ.date}`;
    const count = (db.prepare("SELECT COUNT(*) AS c FROM recording_requests WHERE lesson_id = ? AND date = ?").get(lesson.id, occ.date) as { c: number }).c;
    const open = db
      .prepare("SELECT id FROM notifications WHERE user_id = ? AND type = 'recording_request' AND link = ? AND read_at IS NULL AND dismissed_at IS NULL")
      .get(lesson.teacherId, link) as { id: number } | undefined;
    if (open && count > 1) {
      db.prepare("UPDATE notifications SET title = ?, body = ?, created_at = ? WHERE id = ?").run(
        `Запросы на запись пары: ${count}`,
        `${lesson.subject}, ${formatDayMonth(occ.date)}. Студенты и причины собраны в одном списке.`,
        now,
        open.id,
      );
    } else {
      notifyUsers(db, [lesson.teacherId], {
        type: "recording_request",
        title: "Запрос на запись пары",
        body: `${user.fullName}: ${lesson.subject}, ${formatDayMonth(occ.date)}. Причина: ${REASONS[body.reason as string]}.`,
        link,
      });
    }
  })();
  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
