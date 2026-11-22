import { getDb } from "./db";
import { addDays, daysBetween, lessonOccursOn, slotByNumber, todayIso, type LessonFormat } from "./schedule";
import type { Occurrence, SessionUser } from "./types";

interface LessonRow {
  id: number;
  disciplineId: number;
  weekday: number;
  slot: number;
  kind: string;
  parity: string;
  room: string;
  onlineUrl: string | null;
  format: LessonFormat;
  onlineComment: string | null;
  subject: string;
  groupName: string;
  teacherName: string;
}

interface ChangeRow {
  lessonId: number;
  date: string;
  status: "cancelled" | "moved" | "room_changed";
  newDate: string | null;
  newSlot: number | null;
  newRoom: string | null;
  reason: string | null;
  createdAt: string;
}

interface SessionRow {
  lessonId: number;
  date: string;
  format: LessonFormat | null;
  onlineUrl: string | null;
  onlineComment: string | null;
  prevFormat: LessonFormat | null;
  changeKind: "format" | "link" | null;
  changedAt: string | null;
  recordingTitle: string | null;
}

const LESSON_SELECT = `
  SELECT l.id, l.discipline_id AS disciplineId, l.weekday, l.slot, l.kind, l.parity, l.room,
         l.online_url AS onlineUrl, l.format, l.online_comment AS onlineComment, d.name AS subject, g.name AS groupName, t.full_name AS teacherName
    FROM lessons l
    JOIN disciplines d ON d.id = l.discipline_id
    JOIN groups g ON g.id = d.group_id
    JOIN users t ON t.id = d.teacher_id`;

/** Занятия текущего пользователя: студенту — его группы, преподавателю — его дисциплины. */
export function lessonsFor(user: SessionUser): LessonRow[] {
  const db = getDb();
  if (user.role === "student") {
    return db
      .prepare(`${LESSON_SELECT} WHERE d.group_id = (SELECT group_id FROM student_profiles WHERE user_id = ?)`)
      .all(user.id) as LessonRow[];
  }
  if (user.role === "teacher") {
    return db.prepare(`${LESSON_SELECT} WHERE d.teacher_id = ?`).all(user.id) as LessonRow[];
  }
  return [];
}

interface Extras {
  sessions: Map<string, SessionRow>;
  marks: Map<string, "will_record" | "will_send_notes">;
}

function build(
  l: LessonRow,
  date: string,
  extras: Extras,
  over: Partial<Occurrence> & { slot?: number; room?: string } = {},
): Occurrence {
  const slot = over.slot ?? l.slot;
  const s = slotByNumber(slot)!;
  const ses = extras.sessions.get(`${l.id}|${date}`);
  const format = ses?.format ?? l.format;
  const url = format === "offline" ? null : (ses?.onlineUrl ?? l.onlineUrl ?? null);
  return {
    key: `${l.id}:${date}:${over.status ?? "normal"}`,
    lessonId: l.id,
    disciplineId: l.disciplineId,
    date,
    slot,
    start: s.start,
    end: s.end,
    subject: l.subject,
    kind: l.kind,
    room: over.room ?? l.room,
    onlineUrl: url,
    format,
    onlineComment: format === "offline" ? null : (ses?.onlineComment ?? l.onlineComment ?? null),
    formatChange:
      ses?.changeKind && ses.changedAt
        ? { kind: ses.changeKind, from: ses.prevFormat ?? l.format, at: ses.changedAt }
        : null,
    hasRecording: Boolean(ses?.recordingTitle),
    recordingMark: extras.marks.get(`${l.id}|${date}`) ?? null,
    changedAt: null,
    teacher: l.teacherName,
    group: l.groupName,
    status: "normal",
    note: null,
    prevRoom: null,
    otherDate: null,
    otherSlot: null,
    ...over,
  };
}

export function getOccurrences(user: SessionUser, from: string, to: string): Occurrence[] {
  const lessons = lessonsFor(user);
  if (lessons.length === 0) return [];

  const byId = new Map(lessons.map((l) => [l.id, l]));
  const marks = lessons.map(() => "?").join(",");
  const changes = getDb()
    .prepare(
      `SELECT lesson_id AS lessonId, date, status, new_date AS newDate, new_slot AS newSlot,
              new_room AS newRoom, reason, created_at AS createdAt
         FROM lesson_changes
        WHERE lesson_id IN (${marks})
          AND ((date BETWEEN ? AND ?) OR (new_date BETWEEN ? AND ?))`,
    )
    .all(...lessons.map((l) => l.id), from, to, from, to) as ChangeRow[];

  const changeAt = new Map(changes.map((c) => [`${c.lessonId}|${c.date}`, c]));
  const out: Occurrence[] = [];

  // Формат, ссылки и записи конкретных дат (и сами даты переноса тоже)
  const sessions = new Map<string, SessionRow>();
  for (const r of getDb()
    .prepare(
      `SELECT lesson_id AS lessonId, date, format, online_url AS onlineUrl, online_comment AS onlineComment,
              prev_format AS prevFormat, change_kind AS changeKind, changed_at AS changedAt,
              recording_title AS recordingTitle
         FROM lesson_sessions WHERE lesson_id IN (${marks}) AND date BETWEEN ? AND ?`,
    )
    .all(...lessons.map((l) => l.id), from, to) as SessionRow[]) {
    sessions.set(`${r.lessonId}|${r.date}`, r);
  }
  const markMap = new Map<string, "will_record" | "will_send_notes">();
  if (user.role === "student") {
    for (const r of getDb()
      .prepare(
        `SELECT lesson_id AS lessonId, date, status FROM recording_requests
          WHERE student_id = ? AND status IN ('will_record', 'will_send_notes') AND date BETWEEN ? AND ?`,
      )
      .all(user.id, from, to) as { lessonId: number; date: string; status: "will_record" | "will_send_notes" }[]) {
      markMap.set(`${r.lessonId}|${r.date}`, r.status);
    }
  }
  const extras: Extras = { sessions, marks: markMap };

  for (const date of daysBetween(from, to)) {
    for (const l of lessons) {
      if (!lessonOccursOn(l, date)) continue;
      const c = changeAt.get(`${l.id}|${date}`);
      if (!c) {
        out.push(build(l, date, extras));
      } else if (c.status === "cancelled") {
        out.push(build(l, date, extras, { status: "cancelled", note: c.reason, changedAt: c.createdAt }));
      } else if (c.status === "room_changed") {
        out.push(build(l, date, extras, { status: "room_changed", room: c.newRoom ?? l.room, prevRoom: l.room, note: c.reason, changedAt: c.createdAt }));
      } else {
        out.push(build(l, date, extras, { status: "moved_away", note: c.reason, otherDate: c.newDate, otherSlot: c.newSlot, changedAt: c.createdAt }));
      }
    }
  }

  // Перенесённые занятия показываем и на новом месте, даже если исходная дата вне диапазона
  for (const c of changes) {
    if (c.status !== "moved" || !c.newDate || !c.newSlot) continue;
    if (c.newDate < from || c.newDate > to) continue;
    const l = byId.get(c.lessonId);
    if (!l) continue;
    out.push(
      build(l, c.newDate, extras, {
        status: "moved_here",
        changedAt: c.createdAt,
        slot: c.newSlot,
        room: c.newRoom ?? l.room,
        note: c.reason,
        otherDate: c.date,
        otherSlot: l.slot,
      }),
    );
  }

  return out.sort((a, b) => (a.date === b.date ? a.slot - b.slot : a.date < b.date ? -1 : 1));
}

/** Ближайшее занятие после сегодняшнего дня (для пустого состояния «Сегодня пар нет»). */
export function getNextOccurrence(user: SessionUser, today = todayIso()): Occurrence | null {
  const next = getOccurrences(user, addDays(today, 1), addDays(today, 14));
  return next.find((o) => o.status !== "cancelled" && o.status !== "moved_away") ?? null;
}

/** Конкретное занятие пользователя в конкретную дату (для карточки пары) */
export function getOccurrenceFor(user: SessionUser, lessonId: number, date: string): Occurrence | null {
  return getOccurrences(user, date, date).find((o) => o.lessonId === lessonId) ?? null;
}
