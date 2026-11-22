import { NextResponse } from "next/server";
import { authorize, jsonError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getConversationForUser, markRead, unreadTotal } from "@/lib/messages";

export const dynamic = "force-dynamic";

// Отметка «прочитано» хранится на пользователя
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, ["student", "teacher", "staff"], { mutating: true });
  if ("error" in auth) return auth.error;
  const db = getDb();
  const access = getConversationForUser(db, auth.user, Number((await ctx.params).id));
  if (!access) return jsonError("Диалог недоступен.", 404);
  markRead(db, access.id, auth.user.id);
  return NextResponse.json({ ok: true, unread: unreadTotal(db, auth.user) });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
