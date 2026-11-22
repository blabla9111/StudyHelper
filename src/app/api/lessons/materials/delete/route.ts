import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getLessonForUser } from "@/lib/lesson-access";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authorize(req, ["teacher"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body || typeof body.id !== "number" || !Number.isInteger(body.id)) return jsonError("Некорректный запрос.", 400);

  const db = getDb();
  const row = db.prepare("SELECT lesson_id AS lessonId FROM materials WHERE id = ?").get(body.id) as { lessonId: number } | undefined;
  if (!row || !getLessonForUser(auth.user, row.lessonId)) return jsonError("Материал не найден.", 404);
  db.prepare("DELETE FROM materials WHERE id = ?").run(body.id);
  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
