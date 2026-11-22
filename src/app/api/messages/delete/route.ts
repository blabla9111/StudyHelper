import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { deleteMessage } from "@/lib/messages";

export const dynamic = "force-dynamic";

// Автор может удалить своё сообщение в течение 5 минут (рассылка удаляется у всех получателей)
export async function POST(req: Request) {
  const auth = await authorize(req, ["student", "teacher", "staff"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  const id = Number(body?.messageId);
  if (!Number.isInteger(id) || id <= 0) return jsonError("Сообщение не найдено.", 404);
  const r = deleteMessage(getDb(), auth.user, id);
  return r.ok ? NextResponse.json({ ok: true }) : jsonError(r.error ?? "Ошибка.", r.status);
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
