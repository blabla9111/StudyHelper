import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { clean, getLessonOnDate, lessonLink } from "@/lib/lesson-access";
import { notifyUsers, studentIdsOfGroup } from "@/lib/notify";
import { formatDayMonth, isDateString, todayIso } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// Преподаватель задаёт задание с дедлайном. Оно сразу появляется в «Моём дне» студентов группы.
export async function POST(req: Request) {
  const auth = await authorize(req, ["teacher"], { mutating: true });
  if ("error" in auth) return auth.error;
  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос.", 400);
  const found = getLessonOnDate(auth.user, body.lessonId, body.date);
  if (!found) return jsonError("Занятие не найдено.", 404);
  const { lesson, occ } = found;

  const title = clean(body.title, 120);
  if (!title) return jsonError("Укажите название задания.", 400);
  if (!isDateString(body.dueDate)) return jsonError("Укажите срок сдачи.", 400);
  if (body.dueDate < todayIso()) return jsonError("Срок не может быть в прошлом.", 400);
  if (body.dueDate > "2027-12-31") return jsonError("Слишком далёкий срок.", 400);

  const db = getDb();
  const count = (
    db.prepare("SELECT COUNT(*) AS c FROM deadlines WHERE lesson_id = ? AND lesson_date = ?").get(lesson.id, occ.date) as { c: number }
  ).c;
  if (count >= 10) return jsonError("К паре можно добавить не больше 10 заданий.", 400);

  db.transaction(() => {
    db.prepare(
      "INSERT INTO deadlines (discipline_id, lesson_id, lesson_date, title, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(lesson.disciplineId, lesson.id, occ.date, title, body.dueDate, new Date().toISOString());
    notifyUsers(db, studentIdsOfGroup(db, lesson.groupId), {
      type: "deadline",
      title: `Новое задание: ${lesson.subject}`,
      body: `${title}. Срок: ${formatDayMonth(body.dueDate as string)}.`,
      link: lessonLink(lesson.id, occ.date),
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
