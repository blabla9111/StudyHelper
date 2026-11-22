"use client";

import { useEffect, useState } from "react";
import { MapPin, Radio, Video, ExternalLink } from "lucide-react";
import { FORMAT_LABEL, joinState, lessonWindow, type LessonFormat } from "@/lib/schedule";
import type { Occurrence } from "@/lib/types";

/** Текущее время в браузере. До первой отрисовки на клиенте null, чтобы сервер и браузер выдали одинаковую разметку. */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const ICON: Record<LessonFormat, typeof Video> = { offline: MapPin, online: Video, hybrid: Radio };

export function FormatIcon({ format, className = "size-3.5" }: { format: LessonFormat; className?: string }) {
  if (format === "offline") return null;
  const Icon = ICON[format];
  return <Icon className={className} aria-hidden="true" />;
}

const TONE: Record<LessonFormat, string> = {
  offline: "bg-slate-100 text-slate-700",
  online: "bg-sky-100 text-sky-800",
  hybrid: "bg-violet-100 text-violet-800",
};

/** Плашка формата: «Очно», «Онлайн» или «Идёт трансляция» (во время пары), иначе «Очно + трансляция» */
export function FormatBadge({ o }: { o: Pick<Occurrence, "format" | "date" | "start" | "end" | "status"> }) {
  const now = useNow();
  const Icon = ICON[o.format];
  let label: string = FORMAT_LABEL[o.format];
  let live = false;
  if (o.format === "hybrid" && now !== null && o.status !== "cancelled" && o.status !== "moved_away") {
    const w = lessonWindow(o.date, o.start, o.end);
    if (now >= w.startMs && now <= w.endMs) {
      label = "Идёт трансляция";
      live = true;
    }
  }
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[o.format]}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
      {live && <span className="size-1.5 animate-pulse rounded-full bg-rose-600" aria-hidden="true" />}
    </span>
  );
}

/**
 * Кнопка «Подключиться»: активна за 15 минут до начала и во время пары.
 * Раньше показываем серую подсказку, если ссылки нет — «Ссылка появится позже».
 */
export function JoinControl({ o, full = false }: { o: Occurrence; full?: boolean }) {
  const now = useNow();
  if (o.format === "offline" || o.status === "cancelled" || o.status === "moved_away") return null;

  if (!o.onlineUrl) {
    return <p className="text-sm text-slate-500">Ссылка появится позже</p>;
  }
  const w = lessonWindow(o.date, o.start, o.end);
  const state = now === null ? "early" : joinState(w.startMs, w.endMs, now);
  const base = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold ${full ? "w-full" : ""}`;

  if (state === "open") {
    return (
      <a
        href={o.onlineUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} bg-brand-600 text-white hover:bg-brand-700`}
      >
        <ExternalLink className="size-4" aria-hidden="true" /> Подключиться
      </a>
    );
  }
  if (state === "over") return <p className="text-sm text-slate-500">Пара закончилась</p>;
  return (
    <div className={full ? "w-full" : ""}>
      <button type="button" disabled className={`${base} cursor-not-allowed bg-slate-100 text-slate-400`}>
        <ExternalLink className="size-4" aria-hidden="true" /> Подключиться
      </button>
      <p className="mt-1.5 text-xs text-slate-500">Станет доступна за 15 минут до начала</p>
    </div>
  );
}
