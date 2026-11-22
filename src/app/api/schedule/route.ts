import { NextResponse } from "next/server";
import { authorize, jsonError } from "@/lib/api";
import { getOccurrences } from "@/lib/schedule-data";
import { daysBetween, isDateString } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// Занятия только самого пользователя: группа студента или дисциплины преподавателя берутся из сессии
export async function GET(req: Request) {
  const auth = await authorize(req, ["student", "teacher"]);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!isDateString(from) || !isDateString(to) || from > to) return jsonError("Некорректный период.", 400);
  if (daysBetween(from, to).length > 62) return jsonError("Слишком большой период.", 400);

  return NextResponse.json(
    { occurrences: getOccurrences(auth.user, from, to) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const POST = notAllowed(["GET"]);
export const PUT = notAllowed(["GET"]);
export const PATCH = notAllowed(["GET"]);
export const DELETE = notAllowed(["GET"]);
