// Небольшие функции форматирования. Безопасны и для сервера, и для браузера.

/** «Лисицына Арина Романовна» → «ЛА» */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

/** Имя из «Фамилия Имя Отчество» */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[1] ?? fullName;
}

/** «Имя Отчество» для обращения к преподавателю */
export function nameAndPatronymic(fullName: string): string {
  return fullName.trim().split(/\s+/).slice(1).join(" ") || fullName;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
  if (abs < 60) return "только что";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

const TZ = "Europe/Moscow";

export function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("ru-RU", { hour: "numeric", hour12: false, timeZone: TZ }).format(now),
  );
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 18) return "Добрый день";
  if (hour >= 18 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}

export function todayLabel(now = new Date()): string {
  const s = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(now);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
