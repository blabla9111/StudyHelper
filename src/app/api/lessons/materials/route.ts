import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { clean, getLessonOnDate } from "@/lib/lesson-access";
import { validUrl } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const KINDS = ["presentation", "notes", "sources"];

// Преподаватель добавляет материал к своей паре. Файлы условные: без ссылки скачивается демо-текст.
export async function POST(req: Request) {
  const auth = await authorize(req, ["teacher"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос.", 400);
  const found = getLessonOnDate(auth.user, body.lessonId, body.date);
  if (!found) return jsonError("Занятие не найдено.", 404);

  const title = clean(body.title, 120);
  if (!title) return jsonError("Укажите название материала.", 400);
  if (typeof body.kind !== "string" || !KINDS.includes(body.kind)) return jsonError("Выберите тип материала.", 400);
  const rawUrl = clean(body.url, 500);
  if (rawUrl && !validUrl(rawUrl)) return jsonError("Ссылка должна начинаться с http:// или https://.", 400);

  const db = getDb();
  const count = (
    db.prepare("SELECT COUNT(*) AS c FROM materials WHERE lesson_id = ? AND date = ?").get(found.lesson.id, found.occ.date) as {
      c: number;
    }
  ).c;
  if (count >= 20) return jsonError("К паре можно прикрепить не больше 20 материалов.", 400);

  db.prepare("INSERT INTO materials (lesson_id, date, title, kind, url, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    found.lesson.id,
    found.occ.date,
    title,
    body.kind,
    rawUrl || null,
    new Date().toISOString(),
  );
  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
