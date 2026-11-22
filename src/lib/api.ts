import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { sameOrigin } from "./origin";
import { hit } from "./ratelimit";
import type { Role, SessionUser } from "./types";

export const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Общая проверка для API: вход, роль и (для изменяющих запросов) Origin.
 * Возвращает пользователя либо готовый ответ с ошибкой.
 */
export async function authorize(
  req: Request,
  roles: Role[],
  opts: { mutating?: boolean } = {},
): Promise<{ user: SessionUser } | { error: NextResponse }> {
  if (opts.mutating && !sameOrigin(req)) return { error: jsonError("Запрос отклонён.", 403) };
  if (opts.mutating && tooLarge(req)) return { error: jsonError("Слишком большой запрос.", 413) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("Требуется вход.", 401) };
  if (!roles.includes(user.role)) return { error: jsonError("Недостаточно прав.", 403) };
  return { user };
}

/** Потолок размера тела запроса: всё, что отправляет сайт, много меньше */
export const MAX_BODY_BYTES = 64 * 1024;

/** По заголовку Content-Length: true, если тело заведомо больше потолка */
export const tooLarge = (req: Request) => Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES;

/** Читает тело частями и останавливается на потолке, поэтому огромный запрос не попадает в память целиком */
async function readBodyText(req: Request): Promise<string | "too_large" | null> {
  if (tooLarge(req)) return "too_large";
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return "too_large";
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Как readJson, но отличает «слишком большой запрос» от «некорректный» */
export async function readJsonLimited(req: Request): Promise<Record<string, unknown> | "too_large" | null> {
  const text = await readBodyText(req);
  if (text === "too_large") return "too_large";
  if (text === null) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const body = await readJsonLimited(req);
  return body === "too_large" ? null : body;
}

/**
 * Лимит частоты на пользователя для дорогих действий. Возвращает готовый ответ 429 или null.
 * Ключ включает имя действия, поэтому разные действия считаются отдельно.
 */
export function limitUser(userId: number, action: string, max: number, windowMs = 60_000): NextResponse | null {
  const wait = hit(`act:${action}:${userId}`, max, windowMs);
  if (wait <= 0) return null;
  return NextResponse.json(
    { error: "Слишком много действий подряд. Подождите немного и повторите." },
    { status: 429, headers: { "Retry-After": String(wait) } },
  );
}
