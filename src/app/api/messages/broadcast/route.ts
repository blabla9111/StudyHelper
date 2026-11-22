import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import {
  BROADCASTS_PER_HOUR,
  MAX_BODY,
  createBroadcast,
  groupsOfTeacher,
  listBroadcasts,
  normalizeBody,
} from "@/lib/messages";
import { registerFailure, retryAfterSeconds } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// Группы преподавателя и история его рассылок
export async function GET(req: Request) {
  const auth = await authorize(req, ["teacher"]);
  if ("error" in auth) return auth.error;
  const db = getDb();
  return NextResponse.json(
    { groups: groupsOfTeacher(db, auth.user.id), broadcasts: listBroadcasts(db, auth.user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Рассылка всем студентам выбранных групп: не больше 5 в час
export async function POST(req: Request) {
  const auth = await authorize(req, ["teacher"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос.", 400);

  const key = `broadcast:${auth.user.id}`;
  const wait = retryAfterSeconds(key, BROADCASTS_PER_HOUR);
  if (wait > 0) {
    const res = jsonError(`Можно отправлять не больше ${BROADCASTS_PER_HOUR} рассылок в час. Попробуйте через ${Math.ceil(wait / 60)} мин.`, 429);
    res.headers.set("Retry-After", String(wait));
    return res;
  }

  const groupIds = Array.isArray(body.groupIds) ? body.groupIds.map(Number) : [];
  if (groupIds.length === 0 || groupIds.length > 10 || groupIds.some((g) => !Number.isInteger(g) || g <= 0)) {
    return jsonError("Выберите хотя бы одну группу.", 400);
  }
  const text = normalizeBody(body.body);
  if (!text) return jsonError("Введите текст рассылки.", 400);
  if (text.length > MAX_BODY) return jsonError(`Текст длиннее ${MAX_BODY} символов.`, 400);

  const result = createBroadcast(getDb(), auth.user, groupIds, text);
  if (!result.ok) return jsonError(result.error, result.status);
  registerFailure(key, 60 * 60_000);
  return NextResponse.json({ ok: true, recipients: result.recipients });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const PUT = notAllowed(["GET", "POST"]);
export const PATCH = notAllowed(["GET", "POST"]);
export const DELETE = notAllowed(["GET", "POST"]);
