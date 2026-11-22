import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { notifyUsers, studentIdsOfGroup } from "@/lib/notify";
import { formatDayMonth, isDateString, lessonOccursOn, slotByNumber, todayIso } from "@/lib/schedule";

export const dynamic = "force-dynamic";

interface LessonRow {
  id: number;
  weekday: number;
  slot: number;
  kind: string;
  parity: string;
  room: string;
  subject: string;
  groupId: number;
  teacherId: number;
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Отмена, перенос или смена аудитории занятия. Только преподаватель и только своей дисциплины.
export async function POST(req: Request) {
  const auth = await authorize(req, ["teacher"], { mutating: true });
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос.", 400);

  const lessonId = body.lessonId;
  const date = body.date;
  const action = body.action;
  if (!Number.isInteger(lessonId) || !isDateString(date)) return jsonError("Некорректный запрос.", 400);
  if (action !== "cancel" && action !== "move" && action !== "room" && action !== "restore") {
    return jsonError("Неизвестное действие.", 400);
  }

  const db = getDb();
  const lesson = db
    .prepare(
      `SELECT l.id, l.weekday, l.slot, l.kind, l.parity, l.room, d.name AS subject,
              d.group_id AS groupId, d.teacher_id AS teacherId
         FROM lessons l JOIN disciplines d ON d.id = l.discipline_id WHERE l.id = ?`,
    )
    .get(lessonId) as LessonRow | undefined;

  // Чужое занятие выглядит так же, как несуществующее
  if (!lesson || lesson.teacherId !== user.id) return jsonError("Занятие не найдено.", 404);
  if (!lessonOccursOn(lesson, date)) return jsonError("В эту дату такого занятия нет.", 400);

  const today = todayIso();
  if (date < today) return jsonError("Нельзя менять прошедшие занятия.", 400);

  const reason = clean(body.reason, 200);
  const kind = lesson.kind.toLowerCase();
  const start = slotByNumber(lesson.slot)!.start;
  const head = `${lesson.subject}, ${kind} ${formatDayMonth(date)} в ${start}`;
  const students = studentIdsOfGroup(db, lesson.groupId);

  const upsert = db.prepare(
    `INSERT INTO lesson_changes (lesson_id, date, status, new_date, new_slot, new_room, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const remove = db.prepare("DELETE FROM lesson_changes WHERE lesson_id = ? AND date = ?");
  const now = new Date().toISOString();

  if (action === "restore") {
    db.transaction(() => {
      remove.run(lesson.id, date);
      notifyUsers(db, students, {
        type: "class_moved",
        title: "Пара состоится по расписанию",
        body: `${head}: изменения отменены.`,
        link: "/schedule",
      });
    })();
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel") {
    db.transaction(() => {
      remove.run(lesson.id, date);
      upsert.run(lesson.id, date, "cancelled", null, null, null, reason || null, now);
      notifyUsers(db, students, {
        type: "class_cancelled",
        title: "Пара отменена",
        body: `${head}.${reason ? ` Причина: ${reason}.` : ""}`,
        link: "/schedule",
      });
    })();
    return NextResponse.json({ ok: true });
  }

  if (action === "room") {
    const room = clean(body.newRoom, 30);
    if (!room) return jsonError("Укажите новую аудиторию.", 400);
    if (room === lesson.room) return jsonError("Это уже текущая аудитория.", 400);
    db.transaction(() => {
      remove.run(lesson.id, date);
      upsert.run(lesson.id, date, "room_changed", null, null, room, reason || null, now);
      notifyUsers(db, students, {
        type: "class_moved",
        title: "Изменена аудитория",
        body: `${head}: аудитория ${room} вместо ${lesson.room}.${reason ? ` ${reason}.` : ""}`,
        link: "/schedule",
      });
    })();
    return NextResponse.json({ ok: true });
  }

  // Перенос
  const newDate = body.newDate;
  const newSlot = body.newSlot;
  if (!isDateString(newDate) || typeof newSlot !== "number" || !Number.isInteger(newSlot) || !slotByNumber(newSlot)) {
    return jsonError("Укажите новую дату и номер пары.", 400);
  }
  if (newDate < today) return jsonError("Новая дата уже прошла.", 400);
  if (newDate === date && newSlot === lesson.slot) return jsonError("Выберите другое время или дату.", 400);
  const newRoom = clean(body.newRoom, 30);
  const newStart = slotByNumber(newSlot)!.start;

  db.transaction(() => {
    remove.run(lesson.id, date);
    upsert.run(lesson.id, date, "moved", newDate, newSlot, newRoom || null, reason || null, now);
    notifyUsers(db, students, {
      type: "class_moved",
      title: "Пара перенесена",
      body: `${head} перенесена на ${formatDayMonth(newDate)} в ${newStart}${newRoom ? `, аудитория ${newRoom}` : ""}.${reason ? ` Причина: ${reason}.` : ""}`,
      link: "/schedule",
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
