import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { clean } from "@/lib/lesson-access";
import { REQUEST_SELECT, rejectRequest, type RequestRow } from "@/lib/requests-data";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authorize(req, ["staff"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body || typeof body.id !== "number" || !Number.isInteger(body.id)) return jsonError("Некорректный запрос.", 400);
  const reason = clean(body.reason, 300);
  if (!reason) return jsonError("Укажите причину отказа.", 400);

  const db = getDb();
  const row = db.prepare(`${REQUEST_SELECT} WHERE id = ?`).get(body.id) as RequestRow | undefined;
  if (!row) return jsonError("Заявка не найдена.", 404);
  if (row.status === "ready" || row.status === "rejected") return jsonError("Эту заявку уже нельзя отклонить.", 400);

  db.transaction(() => rejectRequest(db, row, reason))();
  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
