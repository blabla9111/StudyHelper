import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/origin";
import { readJsonLimited } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Запрос отклонён." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

  const parsed = await readJsonLimited(req);
  if (parsed === "too_large") return NextResponse.json({ error: "Слишком большой запрос." }, { status: 413 });
  if (!parsed) return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  const body = parsed as { ids?: unknown; all?: unknown };

  const db = getDb();
  const now = new Date().toISOString();

  if (body.all === true) {
    db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND dismissed_at IS NULL").run(now, user.id);
    return NextResponse.json({ ok: true });
  }

  if (!Array.isArray(body.ids) || body.ids.length > 100 || !body.ids.every((x) => Number.isInteger(x))) {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  // Условие user_id = ? не даст отметить чужие уведомления, даже если подставить чужой id
  const stmt = db.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL");
  db.transaction((ids: number[]) => ids.forEach((id) => stmt.run(now, id, user.id)))(body.ids as number[]);

  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
