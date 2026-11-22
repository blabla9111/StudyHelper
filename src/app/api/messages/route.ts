import { NextResponse } from "next/server";
import { authorize } from "@/lib/api";
import { getDb } from "@/lib/db";
import { listConversations } from "@/lib/messages";

export const dynamic = "force-dynamic";

// Список диалогов текущего пользователя (по сессии) и общий счётчик непрочитанных
export async function GET(req: Request) {
  const auth = await authorize(req, ["student", "teacher", "staff"]);
  if ("error" in auth) return auth.error;
  return NextResponse.json(listConversations(getDb(), auth.user), { headers: { "Cache-Control": "no-store" } });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const POST = notAllowed(["GET"]);
export const PUT = notAllowed(["GET"]);
export const PATCH = notAllowed(["GET"]);
export const DELETE = notAllowed(["GET"]);
