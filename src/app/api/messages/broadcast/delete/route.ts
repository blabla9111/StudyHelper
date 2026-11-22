import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { deleteBroadcast } from "@/lib/messages";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authorize(req, ["teacher"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  const id = Number(body?.broadcastId);
  if (!Number.isInteger(id) || id <= 0) return jsonError("Рассылка не найдена.", 404);
  const r = deleteBroadcast(getDb(), auth.user, id);
  return r.ok ? NextResponse.json({ ok: true }) : jsonError(r.error ?? "Ошибка.", r.status);
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
