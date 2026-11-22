import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authorize(req, ["teacher"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body || typeof body.id !== "number" || !Number.isInteger(body.id)) return jsonError("Некорректный запрос.", 400);

  const db = getDb();
  const ok = db
    .prepare(
      "SELECT 1 FROM deadlines d JOIN disciplines x ON x.id = d.discipline_id WHERE d.id = ? AND x.teacher_id = ?",
    )
    .get(body.id, auth.user.id);
  if (!ok) return jsonError("Задание не найдено.", 404);
  db.prepare("DELETE FROM deadlines WHERE id = ?").run(body.id);
  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
