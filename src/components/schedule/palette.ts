import type { OccurrenceStatus } from "@/lib/types";

// Цвет дисциплины: полоска слева, мягкий фон, текст и точка для месячного вида на телефоне
export const PALETTE = [
  { bar: "bg-sky-500", soft: "bg-sky-50", text: "text-sky-900", dot: "bg-sky-500" },
  { bar: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-900", dot: "bg-violet-500" },
  { bar: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-900", dot: "bg-emerald-500" },
  { bar: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-900", dot: "bg-amber-500" },
  { bar: "bg-rose-600", soft: "bg-rose-50", text: "text-rose-900", dot: "bg-rose-600" },
  { bar: "bg-teal-500", soft: "bg-teal-50", text: "text-teal-900", dot: "bg-teal-500" },
  { bar: "bg-indigo-500", soft: "bg-indigo-50", text: "text-indigo-900", dot: "bg-indigo-500" },
  { bar: "bg-orange-500", soft: "bg-orange-50", text: "text-orange-900", dot: "bg-orange-500" },
] as const;

export const colorFor = (disciplineId: number) => PALETTE[disciplineId % PALETTE.length];

export const STATUS_BADGE: Record<OccurrenceStatus, { label: string; cls: string } | null> = {
  normal: null,
  cancelled: { label: "Отменена", cls: "bg-rose-100 text-rose-700" },
  moved_away: { label: "Перенесена", cls: "bg-amber-100 text-amber-800" },
  moved_here: { label: "Перенос", cls: "bg-amber-100 text-amber-800" },
  room_changed: { label: "Новая аудитория", cls: "bg-amber-100 text-amber-800" },
};
