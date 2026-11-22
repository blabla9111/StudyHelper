import { NextResponse } from "next/server";
import { authorize, limitUser } from "@/lib/api";
import { getDb } from "@/lib/db";
import { recipientsFor } from "@/lib/messages";

export const dynamic = "force-dynamic";

// Только те, кому текущий пользователь вообще может написать первым
export async function GET(req: Request) {
  const auth = await authorize(req, ["student", "teacher", "staff"]);
  if ("error" in auth) return auth.error;
  // Поиск срабатывает при наборе, поэтому потолок выше, чем у остальных действий
  const limited = limitUser(auth.user.id, "recipients", 60);
  if (limited) return limited;
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  return NextResponse.json(recipientsFor(getDb(), auth.user, q), { headers: { "Cache-Control": "no-store" } });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const POST = notAllowed(["GET"]);
export const PUT = notAllowed(["GET"]);
export const PATCH = notAllowed(["GET"]);
export const DELETE = notAllowed(["GET"]);
