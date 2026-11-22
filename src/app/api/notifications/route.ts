import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { NotificationDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// Уведомления только текущего пользователя: user_id берётся из сессии, а не из запроса
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, type, title, body, link, created_at AS createdAt, read_at AS readAt
         FROM notifications WHERE user_id = ? AND dismissed_at IS NULL
        ORDER BY created_at DESC LIMIT 30`,
    )
    .all(user.id) as (Omit<NotificationDTO, "read"> & { readAt: string | null })[];

  const unread = (
    db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL AND dismissed_at IS NULL").get(user.id) as {
      c: number;
    }
  ).c;

  const items: NotificationDTO[] = rows.map(({ readAt, ...rest }) => ({ ...rest, read: readAt !== null }));
  return NextResponse.json({ items, unread }, { headers: { "Cache-Control": "no-store" } });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const POST = notAllowed(["GET"]);
export const PUT = notAllowed(["GET"]);
export const PATCH = notAllowed(["GET"]);
export const DELETE = notAllowed(["GET"]);
