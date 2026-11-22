import { NextResponse } from "next/server";
import { authorize } from "@/lib/api";
import { getDb } from "@/lib/db";
import { unreadTotal } from "@/lib/messages";

export const dynamic = "force-dynamic";

// Лёгкий запрос для значка у пункта «Сообщения» в меню
export async function GET(req: Request) {
  const auth = await authorize(req, ["student", "teacher", "staff"]);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ unread: unreadTotal(getDb(), auth.user) }, { headers: { "Cache-Control": "no-store" } });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const POST = notAllowed(["GET"]);
export const PUT = notAllowed(["GET"]);
export const PATCH = notAllowed(["GET"]);
export const DELETE = notAllowed(["GET"]);
