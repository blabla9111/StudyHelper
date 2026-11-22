import { getDb } from "./db";
import { addDays, dayDiff, formatDayMonth, lessonWindow, slotByNumber, todayIso, FORMAT_LABEL, WEEKDAY_SHORT, weekdayOf } from "./schedule";
import { getOccurrences } from "./schedule-data";
import type { RequestStatus } from "./request-catalog";
import type { Occurrence, SessionUser } from "./types";

export interface ChangeRowDTO {
  label: string;
  was: string;
  now: string;
}

export interface ChangeItem {
  id: string;
  kind: "cancelled" | "moved" | "room" | "format" | "link";
  title: string;
  occ: Occurrence;
  rows: ChangeRowDTO[];
  note: string | null;
  at: string;
}

export interface DeadlineItem {
  id: number;
  subject: string;
  title: string;
  dueDate: string;
  lessonId: number | null;
  lessonDate: string | null;
}

export interface RequestItem {
  id: number;
  title: string;
  code: string;
  status: RequestStatus;
  delivery: "pdf" | "paper";
  expectedAt: string;
  createdAt: string;
}

export interface AnnouncementItem {
  id: number;
  title: string;
  body: string;
  needsAction: boolean;
  actionLabel: string | null;
  actionHref: string | null;
  createdAt: string;
  author: string;
}

export interface NextLesson {
  occ: Occurrence;
  startMs: number;
  endMs: number;
}

export interface Feed {
  today: string;
  lessonsToday: number;
  deadlinesWeek: number;
  todayLessons: Occurrence[];
  next: NextLesson | null;
  changes: ChangeItem[];
  deadlines: DeadlineItem[];
  requests: RequestItem[];
  announcements: AnnouncementItem[];
}

const when = (date: string, slot: number | string) => {
  const start = typeof slot === "number" ? (slotByNumber(slot)?.start ?? "") : slot;
  return `${WEEKDAY_SHORT[weekdayOf(date) - 1]}, ${formatDayMonth(date)} · ${start}`;
};

/** Данные ленты «Мой день» для студента. Всё выбирается по id из сессии. */
export function getStudentFeed(user: SessionUser, today = todayIso()): Feed {
  const db = getDb();
  const list = getOccurrences(user, today, addDays(today, 14));
  const alive = (o: Occurrence) => o.status !== "cancelled" && o.status !== "moved_away";

  const todayLessons = list.filter((o) => o.date === today && o.status !== "moved_away");
  const lessonsToday = todayLessons.filter(alive).length;

  // Ближайшая пара: первая, которая ещё не закончилась
  const nowMs = Date.now();
  let next: NextLesson | null = null;
  for (const o of list) {
    if (!alive(o)) continue;
    const w = lessonWindow(o.date, o.start, o.end);
    if (w.endMs > nowMs) {
      next = { occ: o, startMs: w.startMs, endMs: w.endMs };
      break;
    }
  }

  // Что изменилось
  const changes: ChangeItem[] = [];
  const recent = nowMs - 14 * 86_400_000;
  // Изменения смотрим на три недели вперёд: перенос может уходить за границу ближайших двух
  for (const o of getOccurrences(user, today, addDays(today, 21))) {
    if (o.date < today) continue;
    const head = `${o.subject}, ${o.kind.toLowerCase()}`;
    if (o.status === "cancelled") {
      changes.push({ id: `${o.key}`, kind: "cancelled", title: head, occ: o, rows: [], note: `Пара ${formatDayMonth(o.date)} в ${o.start} отменена.${o.note ? ` Причина: ${o.note}.` : ""}`, at: o.changedAt ?? "" });
    } else if (o.status === "moved_here" && o.otherDate && o.otherSlot) {
      changes.push({
        id: o.key,
        kind: "moved",
        title: head,
        occ: o,
        rows: [{ label: "Когда", was: when(o.otherDate, o.otherSlot), now: when(o.date, o.slot) }],
        note: o.note ? `Причина: ${o.note}.` : null,
        at: o.changedAt ?? "",
      });
    } else if (o.status === "room_changed" && o.prevRoom) {
      changes.push({ id: o.key, kind: "room", title: head, occ: o, rows: [{ label: "Аудитория", was: o.prevRoom, now: o.room }], note: null, at: o.changedAt ?? "" });
    }
    if (o.formatChange && alive(o) && new Date(o.formatChange.at).getTime() >= recent) {
      const fc = o.formatChange;
      changes.push({
        id: `${o.key}:fmt`,
        kind: fc.kind,
        title: head,
        occ: o,
        rows:
          fc.kind === "format"
            ? [{ label: "Формат", was: FORMAT_LABEL[fc.from], now: FORMAT_LABEL[o.format] }]
            : [{ label: "Ссылка", was: "не было", now: o.onlineUrl ? "добавлена" : "обновлена" }],
        note: `${formatDayMonth(o.date)}, ${o.start}.`,
        at: fc.at,
      });
    }
  }
  changes.sort((a, b) => (a.at < b.at ? 1 : -1));

  // Дедлайны: просроченные за последний месяц и ближайшие три недели, без выполненных
  const deadlines = db
    .prepare(
      `SELECT d.id, x.name AS subject, d.title, d.due_date AS dueDate, d.lesson_id AS lessonId, d.lesson_date AS lessonDate
         FROM deadlines d
         JOIN disciplines x ON x.id = d.discipline_id
         JOIN student_profiles sp ON sp.group_id = x.group_id
        WHERE sp.user_id = ?
          AND d.due_date BETWEEN ? AND ?
          AND NOT EXISTS (SELECT 1 FROM deadline_done f WHERE f.deadline_id = d.id AND f.student_id = sp.user_id)
        ORDER BY d.due_date, d.id`,
    )
    .all(user.id, addDays(today, -30), addDays(today, 21)) as DeadlineItem[];
  const deadlinesWeek = deadlines.filter((d) => dayDiff(today, d.dueDate) <= 6).length;

  const requests = db
    .prepare(
      `SELECT id, title, code, status, delivery, expected_at AS expectedAt, created_at AS createdAt
         FROM requests
        WHERE student_id = ?
          AND (status IN ('accepted', 'reviewing', 'signed')
               OR (status IN ('ready', 'rejected') AND updated_at >= ?))
        ORDER BY updated_at DESC LIMIT 4`,
    )
    .all(user.id, new Date(nowMs - 7 * 86_400_000).toISOString()) as RequestItem[];

  const announcements = db
    .prepare(
      `SELECT a.id, a.title, a.body, a.needs_action AS needsAction, a.action_label AS actionLabel,
              a.action_href AS actionHref, a.created_at AS createdAt, u.full_name AS author
         FROM announcements a
         JOIN users u ON u.id = a.author_id
         JOIN student_profiles sp ON sp.user_id = ?
         JOIN groups g ON g.id = sp.group_id
        WHERE (a.valid_until IS NULL OR a.valid_until >= ?)
          AND a.created_at >= ?
          AND (a.audience_type = 'all'
               OR (a.audience_type = 'group' AND a.audience_value = g.name)
               OR (a.audience_type = 'course' AND a.audience_value = CAST(g.course AS TEXT))
               OR (a.audience_type = 'direction' AND a.audience_value = g.direction))
        ORDER BY a.needs_action DESC, a.created_at DESC LIMIT 5`,
    )
    .all(user.id, today, new Date(nowMs - 45 * 86_400_000).toISOString()) as (Omit<AnnouncementItem, "needsAction"> & { needsAction: number })[];

  return {
    today,
    lessonsToday,
    deadlinesWeek,
    todayLessons,
    next,
    changes,
    deadlines,
    requests,
    announcements: announcements.map((a) => ({ ...a, needsAction: Boolean(a.needsAction) })),
  };
}
