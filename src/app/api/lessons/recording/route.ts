import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { clean, getLessonOnDate, lessonLink } from "@/lib/lesson-access";
import { notifyUsers } from "@/lib/notify";
import { formatDayMonth, todayIso, validUrl } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// Запись пары: прикрепить или убрать. Прикрепить можно, когда пара уже началась.
export async function POST(req: Request) {
  const auth = await authorize(req, ["teacher"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос.", 400);
  const found = getLessonOnDate(auth.user, body.lessonId, body.date);
  if (!found) return jsonError("Занятие не найдено.", 404);
  const { lesson, occ } = found;

  const db = getDb();
  const now = new Date().toISOString();

  if (body.remove === true) {
    db.prepare(
      "UPDATE lesson_sessions SET recording_title = NULL, recording_url = NULL, recording_min = NULL, updated_at = ? WHERE lesson_id = ? AND date = ?",
    ).run(now, lesson.id, occ.date);
    return NextResponse.json({ ok: true });
  }

  if (occ.date > todayIso()) return jsonError("Запись можно прикрепить, когда пара пройдёт.", 400);
  const title = clean(body.title, 120);
  if (!title) return jsonError("Укажите название записи.", 400);
  const rawUrl = clean(body.url, 500);
  if (rawUrl && !validUrl(rawUrl)) return jsonError("Ссылка должна начинаться с http:// или https://.", 400);
  const minutes = typeof body.minutes === "number" && Number.isInteger(body.minutes) && body.minutes > 0 && body.minutes <= 600 ? body.minutes : null;

  db.transaction(() => {
    const exists = db.prepare("SELECT 1 FROM lesson_sessions WHERE lesson_id = ? AND date = ?").get(lesson.id, occ.date);
    if (exists) {
      db.prepare(
        "UPDATE lesson_sessions SET recording_title = ?, recording_url = ?, recording_min = ?, updated_at = ? WHERE lesson_id = ? AND date = ?",
      ).run(title, rawUrl || null, minutes, now, lesson.id, occ.date);
    } else {
      db.prepare(
        "INSERT INTO lesson_sessions (lesson_id, date, recording_title, recording_url, recording_min, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(lesson.id, occ.date, title, rawUrl || null, minutes, now);
    }
    // Тем, кто просил записать эту пару, сообщаем, что запись появилась
    const askers = (
      db
        .prepare("SELECT student_id AS id FROM recording_requests WHERE lesson_id = ? AND date = ? AND status = 'will_record'")
        .all(lesson.id, occ.date) as { id: number }[]
    ).map((r) => r.id);
    notifyUsers(db, askers, {
      type: "recording_request",
      title: "Запись пары готова",
      body: `${lesson.subject}, ${formatDayMonth(occ.date)}: запись прикреплена к карточке пары.`,
      link: lessonLink(lesson.id, occ.date),
    });
  })();

  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
