import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { canInitiate, getOrCreateDirect } from "@/lib/messages";

export const dynamic = "force-dynamic";

const UNAVAILABLE = "Этому адресату написать нельзя.";

// Открывает диалог с человеком. Существующий диалог возвращается как есть, второй не создаётся.
// Запрещённая пара и несуществующий пользователь неотличимы: одинаковый ответ 404.
export async function POST(req: Request) {
  const auth = await authorize(req, ["student", "teacher", "staff"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  const userId = Number(body?.userId);
  if (!body || !Number.isInteger(userId) || userId <= 0) return jsonError(UNAVAILABLE, 404);

  const db = getDb();
  const key = `${Math.min(auth.user.id, userId)}-${Math.max(auth.user.id, userId)}`;
  const existing = db
    .prepare(
      `SELECT c.id FROM conversations c
         JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = ?
        WHERE c.pair_key = ?`,
    )
    .get(auth.user.id, key) as { id: number } | undefined;
  if (existing) return NextResponse.json({ id: existing.id });

  if (!canInitiate(db, auth.user, userId)) return jsonError(UNAVAILABLE, 404);
  return NextResponse.json({ id: getOrCreateDirect(db, auth.user.id, userId) });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
