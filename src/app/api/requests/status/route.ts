import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { advanceRequest, REQUEST_SELECT, type RequestRow } from "@/lib/requests-data";

export const dynamic = "force-dynamic";

// Следующий шаг заявки («Принята → Проверяется → Подписана → Готова»). Двигать статус может только сотрудник деканата.
export async function POST(req: Request) {
  const auth = await authorize(req, ["staff"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body || typeof body.id !== "number" || !Number.isInteger(body.id)) return jsonError("Некорректный запрос.", 400);

  const db = getDb();
  const row = db.prepare(`${REQUEST_SELECT} WHERE id = ?`).get(body.id) as RequestRow | undefined;
  if (!row) return jsonError("Заявка не найдена.", 404);

  const next = db.transaction(() => advanceRequest(db, row))();
  if (!next) return jsonError("Заявка уже на последнем шаге или отклонена.", 400);
  return NextResponse.json({ ok: true, status: next });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
