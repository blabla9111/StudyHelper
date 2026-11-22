import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { clean, getLessonOnDate, lessonLink } from "@/lib/lesson-access";
import { notifyUsers, studentIdsOfGroup } from "@/lib/notify";
import { formatDayMonth, todayIso, validUrl, type LessonFormat } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const FORMATS: LessonFormat[] = ["offline", "online", "hybrid"];

// Формат проведения пары на конкретную дату: очно, онлайн или очно с трансляцией.
export async function POST(req: Request) {
  const auth = await authorize(req, ["teacher"], { mutating: true });
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос.", 400);
  const found = getLessonOnDate(user, body.lessonId, body.date);
  if (!found) return jsonError("Занятие не найдено.", 404);
  const { lesson, occ } = found;

  const format = body.format as LessonFormat;
  if (!FORMATS.includes(format)) return jsonError("Выберите формат: очно, онлайн или очно с трансляцией.", 400);
  if (occ.date < todayIso()) return jsonError("Нельзя менять формат прошедшей пары.", 400);
  if (occ.status === "cancelled" || occ.status === "moved_away") return jsonError("Эта пара не состоится.", 400);

  let url: string | null = null;
  let comment: string | null = null;
  if (format !== "offline") {
    const rawUrl = clean(body.url, 500);
    if (rawUrl) {
      if (!validUrl(rawUrl)) return jsonError("Ссылка должна начинаться с http:// или https://.", 400);
      url = rawUrl;
    }
    comment = clean(body.comment, 300) || null;
  }

  const sameFormat = format === occ.format;
  if (sameFormat && url === (occ.format === "offline" ? null : occ.onlineUrl) && comment === occ.onlineComment) {
    return jsonError("Ничего не изменилось.", 400);
  }

  const db = getDb();
  const now = new Date().toISOString();
  const linkAdded = !sameFormat ? false : Boolean(url) && url !== occ.onlineUrl;
  const kind = sameFormat ? "link" : "format";
  const hadChange = db
    .prepare("SELECT 1 FROM lesson_sessions WHERE lesson_id = ? AND date = ?")
    .get(lesson.id, occ.date);

  db.transaction(() => {
    if (hadChange) {
      db.prepare(
        `UPDATE lesson_sessions
            SET format = ?, online_url = ?, online_comment = ?, prev_format = ?, change_kind = ?, changed_at = ?, updated_at = ?
          WHERE lesson_id = ? AND date = ?`,
      ).run(format, url, comment, occ.format, kind, now, now, lesson.id, occ.date);
    } else {
      db.prepare(
        `INSERT INTO lesson_sessions (lesson_id, date, format, online_url, online_comment, prev_format, change_kind, changed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(lesson.id, occ.date, format, url, comment, occ.format, kind, now, now);
    }

    const label = format === "online" ? "теперь онлайн" : format === "hybrid" ? "теперь с трансляцией" : "теперь очно";
    const title = sameFormat
      ? linkAdded
        ? `${lesson.subject} ${occ.start}: добавлена ссылка`
        : `${lesson.subject} ${occ.start}: обновлены данные подключения`
      : `${lesson.subject} ${occ.start} ${label}`;
    const text =
      `${formatDayMonth(occ.date)}, ${lesson.kind.toLowerCase()}.` +
      (format === "online" ? " Аудитория не нужна." : "") +
      (url ? " Ссылка для подключения в карточке пары." : format !== "offline" ? " Ссылка появится позже." : "");
    notifyUsers(db, studentIdsOfGroup(db, lesson.groupId), {
      type: "lesson_format",
      title,
      body: text,
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
