import { NextResponse } from "next/server";
import { authorize, jsonError } from "@/lib/api";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// «Отменить» после удаления: возвращает своё только что удалённое уведомление
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, ["student", "teacher", "staff"], { mutating: true });
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!/^\d{1,9}$/.test(id)) return jsonError("Уведомление не найдено.", 404);

  const res = getDb()
    .prepare("UPDATE notifications SET dismissed_at = NULL WHERE id = ? AND user_id = ? AND dismissed_at IS NOT NULL")
    .run(Number(id), auth.user.id);
  if (res.changes === 0) return jsonError("Уведомление не найдено.", 404);
  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
