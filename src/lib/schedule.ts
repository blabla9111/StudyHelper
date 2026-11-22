// Календарные функции расписания. Без серверных зависимостей: работают и на сервере, и в браузере.
// Даты везде строки «ГГГГ-ММ-ДД», вычисления идут в UTC, поэтому часовой пояс компьютера не влияет.

export const SLOTS = [
  { n: 1, start: "08:10", end: "09:40" },
  { n: 2, start: "09:50", end: "11:20" },
  { n: 3, start: "11:30", end: "13:00" },
  { n: 4, start: "13:30", end: "15:00" },
  { n: 5, start: "15:30", end: "17:00" },
  { n: 6, start: "17:10", end: "18:40" },
  { n: 7, start: "18:50", end: "20:20" },
] as const;

export const slotByNumber = (n: number) => SLOTS.find((s) => s.n === n);

// Понедельник первой (нечётной) недели семестра
export const SEMESTER_START = "2026-09-07";

export const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

export const isDateString = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUtc(s));

function toUtc(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

function fromUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * DAY_MS);

export function addMonths(d: string, n: number): string {
  const [y, m] = d.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
}

/** 1 — понедельник … 7 — воскресенье */
export function weekdayOf(d: string): number {
  const w = new Date(toUtc(d)).getUTCDay();
  return w === 0 ? 7 : w;
}

export const mondayOf = (d: string) => addDays(d, 1 - weekdayOf(d));

export function weekIndex(d: string): number {
  return Math.floor((toUtc(mondayOf(d)) - toUtc(SEMESTER_START)) / (7 * DAY_MS)) + 1;
}

export function parityOf(d: string): "odd" | "even" {
  return ((weekIndex(d) % 2) + 2) % 2 === 1 ? "odd" : "even";
}

export function lessonOccursOn(lesson: { weekday: number; parity: string }, d: string): boolean {
  return weekdayOf(d) === lesson.weekday && (lesson.parity === "all" || lesson.parity === parityOf(d));
}

/** Сегодняшняя дата по Москве */
export const todayIso = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(now);

export const formatDayMonth = (d: string) =>
  new Date(toUtc(d)).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

export const formatWeekdayDayMonth = (d: string) => {
  const s = new Date(toUtc(d)).toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const monthTitle = (d: string) => {
  const s = new Date(toUtc(d)).toLocaleDateString("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1).replace(" г.", "");
};

export const dayOfMonth = (d: string) => Number(d.slice(8, 10));

/** Границы сетки месяца: с понедельника первой недели по воскресенье последней */
export function monthRange(d: string): { from: string; to: string } {
  const [y, m] = d.split("-").map(Number);
  const first = `${y}-${pad(m)}-01`;
  const last = fromUtc(Date.UTC(y, m, 0));
  return { from: mondayOf(first), to: addDays(mondayOf(last), 6) };
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export type LessonFormat = "offline" | "online" | "hybrid";

export const FORMAT_LABEL: Record<LessonFormat, string> = {
  offline: "Очно",
  online: "Онлайн",
  hybrid: "Очно + трансляция",
};

/** Начало и конец занятия в миллисекундах (Москва — UTC+3 без перехода на летнее время) */
export function lessonWindow(date: string, start: string, end: string): { startMs: number; endMs: number } {
  const [y, m, d] = date.split("-").map(Number);
  const at = (hhmm: string) => {
    const [h, min] = hhmm.split(":").map(Number);
    return Date.UTC(y, m - 1, d, h - 3, min);
  };
  return { startMs: at(start), endMs: at(end) };
}

/** Кнопка «Подключиться» активна за 15 минут до начала и до конца пары */
export const JOIN_BEFORE_MS = 15 * 60_000;

export function joinState(startMs: number, endMs: number, now: number): "early" | "open" | "over" {
  if (now < startMs - JOIN_BEFORE_MS) return "early";
  if (now <= endMs) return "open";
  return "over";
}

/** «через 1 ч 20 мин», «через 12 мин», «идёт сейчас» */
export function untilText(startMs: number, endMs: number, now: number): string {
  if (now >= endMs) return "закончилась";
  if (now >= startMs) return "идёт сейчас";
  const min = Math.ceil((startMs - now) / 60_000);
  if (min < 60) return `через ${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h >= 24) return `через ${Math.round(h / 24)} дн.`;
  return m ? `через ${h} ч ${m} мин` : `через ${h} ч`;
}

/** Склонение: 1 день, 2 дня, 5 дней */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Разность в днях между двумя датами (b − a) */
export function dayDiff(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** Допустимая ссылка: только http и https */
export function validUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 500) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Где проходит пара: для онлайна аудитория не показывается */
export function whereText(o: { format: LessonFormat; room: string }): string {
  if (o.format === "online") return "Онлайн";
  if (o.format === "hybrid") return `ауд. ${o.room} + трансляция`;
  return `ауд. ${o.room}`;
}
