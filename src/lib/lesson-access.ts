import { getDb } from "./db";
import { getOccurrenceFor } from "./schedule-data";
import type { LessonFormat } from "./schedule";
import type { Occurrence, SessionUser } from "./types";

export interface LessonInfo {
  id: number;
  disciplineId: number;
  weekday: number;
  slot: number;
  parity: string;
  kind: string;
  room: string;
  format: LessonFormat;
  onlineUrl: string | null;
  onlineComment: string | null;
  subject: string;
  groupId: number;
  groupName: string;
  teacherId: number;
}

/**
 * Занятие, к которому у пользователя есть доступ: студенту — занятия его группы,
 * преподавателю — его дисциплины. Чужое занятие неотличимо от несуществующего.
 */
export function getLessonForUser(user: SessionUser, lessonId: number): LessonInfo | null {
  const row = getDb()
    .prepare(
      `SELECT l.id, l.discipline_id AS disciplineId, l.weekday, l.slot, l.parity, l.kind, l.room, l.format,
              l.online_url AS onlineUrl, l.online_comment AS onlineComment, d.name AS subject,
              d.group_id AS groupId, g.name AS groupName, d.teacher_id AS teacherId
         FROM lessons l
         JOIN disciplines d ON d.id = l.discipline_id
         JOIN groups g ON g.id = d.group_id
        WHERE l.id = ?`,
    )
    .get(lessonId) as LessonInfo | undefined;
  if (!row) return null;
  if (user.role === "teacher") return row.teacherId === user.id ? row : null;
  if (user.role === "student") {
    const mine = getDb().prepare("SELECT group_id AS g FROM student_profiles WHERE user_id = ?").get(user.id) as
      | { g: number }
      | undefined;
    return mine && mine.g === row.groupId ? row : null;
  }
  return null;
}

/** Занятие и его конкретная дата с учётом переносов; null, если такого занятия в эту дату нет */
export function getLessonOnDate(
  user: SessionUser,
  lessonId: unknown,
  date: unknown,
): { lesson: LessonInfo; occ: Occurrence } | null {
  if (typeof lessonId !== "number" || !Number.isInteger(lessonId) || typeof date !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const lesson = getLessonForUser(user, lessonId);
  if (!lesson) return null;
  const occ = getOccurrenceFor(user, lessonId, date);
  return occ ? { lesson, occ } : null;
}

export const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Текст длиннее лимита: сервер отвечает ошибкой, а не обрезает молча */
export const tooLong = (v: unknown, max: number) => typeof v === "string" && v.trim().length > max;

export const lessonLink = (lessonId: number, date: string) => `/schedule?d=${date}&l=${lessonId}`;
