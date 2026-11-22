import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import type { Role, SessionUser } from "./types";

export const SESSION_COOKIE = "sh_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Создаёт сессию: случайный токен уходит в httpOnly-cookie, в базе лежит только его хеш. */
export async function createSession(userId: number) {
  const db = getDb();
  const now = Date.now();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date(now).toISOString());

  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(hashToken(token), userId, new Date(now).toISOString(), new Date(now + SESSION_TTL_MS).toISOString());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // В боевом режиме cookie всегда Secure; отключить можно только явным COOKIE_SECURE=false (проверка по http, например с телефона)
    secure: process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false"),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  jar.delete(SESSION_COOKIE);
}

/** Текущий пользователь по cookie или null. Кэшируется на время одного запроса. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = getDb()
    .prepare(
      `SELECT u.id, u.login, u.role, u.full_name AS fullName
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), new Date().toISOString()) as SessionUser | undefined;

  return row ?? null;
});

/** Для страниц: без входа — на /login, чужая роль — на главную. */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/");
  return user;
}
