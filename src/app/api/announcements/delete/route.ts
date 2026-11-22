import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authorize(req, ["staff"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body || typeof body.id !== "number" || !Number.isInteger(body.id)) return jsonError("Некорректный запрос.", 400);
  const res = getDb().prepare("DELETE FROM announcements WHERE id = ?").run(body.id);
  return res.changes ? NextResponse.json({ ok: true }) : jsonError("Объявление не найдено.", 404);
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
