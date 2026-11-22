import { NextResponse } from "next/server";
import { authorize, jsonError } from "@/lib/api";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Удалить своё уведомление (оно скрывается и больше не возвращается). Чужое и несуществующее отвечают одинаково: 404.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, ["student", "teacher", "staff"], { mutating: true });
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!/^\d{1,9}$/.test(id)) return jsonError("Уведомление не найдено.", 404);

  const res = getDb()
    .prepare("UPDATE notifications SET dismissed_at = ?, read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ? AND dismissed_at IS NULL")
    .run(new Date().toISOString(), new Date().toISOString(), Number(id), auth.user.id);
  if (res.changes === 0) return jsonError("Уведомление не найдено.", 404);
  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["DELETE"]);
export const POST = notAllowed(["DELETE"]);
export const PUT = notAllowed(["DELETE"]);
export const PATCH = notAllowed(["DELETE"]);
