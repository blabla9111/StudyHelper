import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { audienceStudentIds, type AudienceType } from "@/lib/announcements";
import { getDb } from "@/lib/db";
import { clean } from "@/lib/lesson-access";
import { notifyUsers } from "@/lib/notify";
import { isDateString, todayIso } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const TYPES: AudienceType[] = ["all", "group", "course", "direction"];

// Сотрудник деканата публикует объявление для всех, группы, курса или направления.
export async function POST(req: Request) {
  const auth = await authorize(req, ["staff"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос.", 400);

  const title = clean(body.title, 120);
  const text = clean(body.body, 1000);
  if (!title || !text) return jsonError("Заполните заголовок и текст.", 400);
  const type = body.audienceType as AudienceType;
  if (!TYPES.includes(type)) return jsonError("Выберите, кому адресовано объявление.", 400);

  const db = getDb();
  let value: string | null = null;
  if (type !== "all") {
    value = clean(body.audienceValue, 100);
    if (!value) return jsonError("Укажите адресата: группу, курс или направление.", 400);
    const ok =
      type === "group"
        ? db.prepare("SELECT 1 FROM groups WHERE name = ?").get(value)
        : type === "course"
          ? db.prepare("SELECT 1 FROM groups WHERE course = ?").get(Number(value))
          : db.prepare("SELECT 1 FROM groups WHERE direction = ?").get(value);
    if (!ok) return jsonError("Такого адресата нет. Выберите из списка.", 400);
  }

  const needsAction = body.needsAction === true;
  const actionLabel = needsAction ? clean(body.actionLabel, 40) : "";
  const actionHref = needsAction ? clean(body.actionHref, 200) : "";
  if (needsAction && (!actionLabel || !actionHref)) return jsonError("Для объявления с действием укажите кнопку и раздел.", 400);
  // Кнопка ведёт только внутрь приложения
  if (actionHref && !/^\/(?!\/)[\w\-/?=&.]*$/.test(actionHref)) return jsonError("Раздел должен быть адресом внутри приложения.", 400);

  const validUntil = body.validUntil ? body.validUntil : null;
  if (validUntil !== null && (!isDateString(validUntil) || validUntil < todayIso())) {
    return jsonError("Дата окончания не может быть в прошлом.", 400);
  }

  db.transaction(() => {
    db.prepare(
      `INSERT INTO announcements (author_id, title, body, audience_type, audience_value, needs_action, action_label, action_href, valid_until, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(auth.user.id, title, text, type, value, needsAction ? 1 : 0, actionLabel || null, actionHref || null, validUntil, new Date().toISOString());
    notifyUsers(db, audienceStudentIds(db, type, value), {
      type: "announcement",
      title: needsAction ? `Нужно действие: ${title}` : title,
      body: text.slice(0, 160),
      link: "/",
    });
  })();
  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
