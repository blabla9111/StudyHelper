import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import {
  MAX_BODY,
  MSG_PER_MINUTE,
  conversationHeader,
  getConversationForUser,
  getMessages,
  normalizeBody,
  sendMessage,
} from "@/lib/messages";
import { registerFailure, retryAfterSeconds } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Последние 50 сообщений диалога (или более старые порции по ?before=<id>)
export async function GET(req: Request, ctx: Ctx) {
  const auth = await authorize(req, ["student", "teacher", "staff"]);
  if ("error" in auth) return auth.error;
  const db = getDb();
  const access = getConversationForUser(db, auth.user, Number((await ctx.params).id));
  if (!access) return jsonError("Диалог недоступен.", 404);

  const beforeRaw = new URL(req.url).searchParams.get("before");
  const before = beforeRaw !== null && Number.isInteger(Number(beforeRaw)) ? Number(beforeRaw) : undefined;
  return NextResponse.json(
    { conversation: conversationHeader(db, auth.user, access), ...getMessages(db, access.id, auth.user, before) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Отправка сообщения: не больше 20 в минуту, только обычный текст до 2000 символов
export async function POST(req: Request, ctx: Ctx) {
  const auth = await authorize(req, ["student", "teacher", "staff"], { mutating: true });
  if ("error" in auth) return auth.error;
  const db = getDb();
  const access = getConversationForUser(db, auth.user, Number((await ctx.params).id));
  if (!access) return jsonError("Диалог недоступен.", 404);

  const key = `msg:${auth.user.id}`;
  const wait = retryAfterSeconds(key, MSG_PER_MINUTE);
  if (wait > 0) {
    const res = jsonError(`Слишком много сообщений. Подождите ${wait} с.`, 429);
    res.headers.set("Retry-After", String(wait));
    return res;
  }

  const body = await readJson(req);
  const text = normalizeBody(body?.body);
  if (!text) return jsonError("Введите текст сообщения.", 400);
  if (text.length > MAX_BODY) return jsonError(`Сообщение длиннее ${MAX_BODY} символов.`, 400);

  registerFailure(key, 60_000);
  const result = sendMessage(db, auth.user, access, text);
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json({ ok: true, id: result.id });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const PUT = notAllowed(["GET", "POST"]);
export const PATCH = notAllowed(["GET", "POST"]);
export const DELETE = notAllowed(["GET", "POST"]);
