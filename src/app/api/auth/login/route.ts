import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { clientIp, sameOrigin } from "@/lib/origin";
import { clearFailures, registerFailure, retryAfterSeconds } from "@/lib/ratelimit";
import { readJsonLimited } from "@/lib/api";

export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_PAIR = 5; // неудач на пару «логин + адрес»
const MAX_PER_LOGIN = 30; // мягкий потолок на логин со всех адресов
const MAX_PER_IP = 30;

// Хеш для сравнения, когда такого логина нет: время ответа не выдаёт, существует ли аккаунт
const DUMMY_HASH = bcrypt.hashSync("не-существующий-пароль", 10);

const fail = (error: string, status: number, headers?: Record<string, string>) =>
  NextResponse.json({ error }, { status, headers });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Запрос отклонён.", 403);

  const parsed = await readJsonLimited(req);
  if (parsed === "too_large") return fail("Слишком большой запрос.", 413);
  if (!parsed) return fail("Некорректный запрос.", 400);
  const body = parsed as { login?: unknown; password?: unknown };

  const login = typeof body.login === "string" ? body.login.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!login || !password) return fail("Введите логин и пароль.", 400);
  if (login.length > 64 || password.length > 128) return fail("Неверный логин или пароль.", 401);

  // Чужие неудачи не должны закрывать вход владельцу аккаунта: основной счётчик привязан к паре «логин + адрес»
  const ip = clientIp(req);
  const pairKey = `login:${login.toLowerCase()}:${ip}`;
  const softKey = `loginsoft:${login.toLowerCase()}`;
  const ipKey = `ip:${ip}`;
  const wait = Math.max(
    retryAfterSeconds(pairKey, MAX_PER_PAIR),
    retryAfterSeconds(softKey, MAX_PER_LOGIN),
    retryAfterSeconds(ipKey, MAX_PER_IP),
  );
  if (wait > 0) {
    const minutes = Math.ceil(wait / 60);
    return fail(`Слишком много попыток входа. Попробуйте снова через ${minutes} мин.`, 429, {
      "Retry-After": String(wait),
    });
  }

  const user = getDb()
    .prepare("SELECT id, password_hash AS hash FROM users WHERE login = ?")
    .get(login) as { id: number; hash: string } | undefined;

  const ok = await bcrypt.compare(password, user?.hash ?? DUMMY_HASH);
  if (!user || !ok) {
    registerFailure(pairKey, WINDOW_MS);
    registerFailure(softKey, WINDOW_MS);
    registerFailure(ipKey, WINDOW_MS);
    return fail("Неверный логин или пароль.", 401);
  }

  clearFailures(pairKey);
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
