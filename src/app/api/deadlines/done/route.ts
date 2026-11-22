import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Студент отмечает своё задание выполненным (или снимает отметку). Только задания своей группы.
export async function POST(req: Request) {
  const auth = await authorize(req, ["student"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body || typeof body.id !== "number" || !Number.isInteger(body.id) || typeof body.done !== "boolean") {
    return jsonError("Некорректный запрос.", 400);
  }

  const db = getDb();
  const ok = db
    .prepare(
      `SELECT 1 FROM deadlines d
         JOIN disciplines x ON x.id = d.discipline_id
         JOIN student_profiles sp ON sp.group_id = x.group_id
        WHERE d.id = ? AND sp.user_id = ?`,
    )
    .get(body.id, auth.user.id);
  if (!ok) return jsonError("Задание не найдено.", 404);

  if (body.done) {
    db.prepare("INSERT OR IGNORE INTO deadline_done (deadline_id, student_id, done_at) VALUES (?, ?, ?)").run(
      body.id,
      auth.user.id,
      new Date().toISOString(),
    );
  } else {
    db.prepare("DELETE FROM deadline_done WHERE deadline_id = ? AND student_id = ?").run(body.id, auth.user.id);
  }
  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
