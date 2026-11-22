"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Coffee, TriangleAlert } from "lucide-react";
import {
  addDays,
  addMonths,
  dayOfMonth,
  daysBetween,
  formatDayMonth,
  formatWeekdayDayMonth,
  mondayOf,
  monthRange,
  monthTitle,
  parityOf,
  SLOTS,
  WEEKDAY_SHORT,
} from "@/lib/schedule";
import type { Occurrence } from "@/lib/types";
import { LessonChip, LessonRow } from "./parts";
import { LessonDialog } from "./LessonDialog";
import { colorFor } from "./palette";

type View = "week" | "month";
type Role = "student" | "teacher";

export function ScheduleView({
  role,
  today,
  initial = null,
}: {
  role: Role;
  today: string;
  /** Открыть карточку пары сразу (ссылка из уведомления или из «Моего дня») */
  initial?: { date: string; lessonId: number } | null;
}) {
  const [chosenView, setView] = useState<View>("week");
  // На телефоне месяц не показываем: по точкам без подписей ничего не понять, поэтому там всегда неделя
  const isMobile = useIsMobile();
  const view: View = isMobile ? "week" : chosenView;
  const [anchor, setAnchor] = useState(initial?.date ?? today);
  const [selected, setSelected] = useState(initial?.date ?? today);
  const [items, setItems] = useState<Occurrence[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [open, setOpen] = useState<Occurrence | null>(null);
  const reqId = useRef(0);

  const range = useMemo(
    () => (view === "week" ? { from: mondayOf(anchor), to: addDays(mondayOf(anchor), 6) } : monthRange(anchor)),
    [view, anchor],
  );

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setStatus("loading");
    try {
      const res = await fetch(`/api/schedule?from=${range.from}&to=${range.to}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as { occurrences: Occurrence[] };
      if (id !== reqId.current) return;
      setItems(data.occurrences);
      setStatus("ready");
      setLoadedOnce(true);
    } catch {
      if (id === reqId.current) setStatus("error");
    }
  }, [range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!initial) return;
    fetch(`/api/lessons/detail?lessonId=${initial.lessonId}&date=${initial.date}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { occurrence: Occurrence } | null) => {
        if (d) setOpen(d.occurrence);
      })
      .catch(() => null);
    // только при первом открытии страницы
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byDate = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of items) {
      const list = m.get(o.date);
      if (list) list.push(o);
      else m.set(o.date, [o]);
    }
    return m;
  }, [items]);

  const days = useMemo(() => daysBetween(range.from, range.to), [range]);
  const weeks = useMemo(() => {
    const out: string[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);

  function shift(dir: -1 | 1) {
    if (view === "week") {
      setAnchor((a) => addDays(a, 7 * dir));
      setSelected((s) => addDays(s, 7 * dir));
    } else {
      const next = addMonths(anchor, dir);
      setAnchor(next);
      setSelected(next);
    }
  }

  function goToday() {
    setAnchor(today);
    setSelected(today);
  }

  function switchView(v: View) {
    setView(v);
    setSelected((s) => (v === "week" ? s : s));
  }

  const label =
    view === "month"
      ? monthTitle(anchor)
      : (() => {
          const a = range.from;
          const b = range.to;
          return a.slice(5, 7) === b.slice(5, 7)
            ? `${dayOfMonth(a)} – ${formatDayMonth(b)}`
            : `${formatDayMonth(a)} – ${formatDayMonth(b)}`;
        })();

  const parityLabel = parityOf(range.from) === "even" ? "Чётная неделя" : "Нечётная неделя";
  const firstLoad = status === "loading" && !loadedOnce;
  const stale = status === "loading" && loadedOnce;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 md:gap-0">
        <div className="flex items-center gap-x-1.5 sm:gap-x-2 md:flex-wrap md:gap-y-1">
          <button
            type="button"
            onClick={goToday}
            className="min-h-11 shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Сегодня
          </button>
          <div className="flex shrink-0 items-center">
            <button type="button" onClick={() => shift(-1)} aria-label={view === "week" ? "Предыдущая неделя" : "Предыдущий месяц"} className="inline-flex size-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100">
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => shift(1)} aria-label={view === "week" ? "Следующая неделя" : "Следующий месяц"} className="inline-flex size-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100">
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-w-0 flex-1 md:min-w-[9rem]">
            <p className="truncate text-base font-bold sm:text-lg">{label}</p>
            {view === "week" && <p className="hidden truncate text-xs text-slate-600 md:block">{parityLabel}</p>}
          </div>
          <div role="group" aria-label="Вид расписания" className="hidden shrink-0 overflow-hidden rounded-xl border border-brand-600 md:flex">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => switchView(v)}
                aria-pressed={view === v}
                className={`min-h-10 px-4 text-sm font-semibold ${view === v ? "bg-brand-600 text-white" : "bg-white text-brand-700 hover:bg-brand-50"}`}
              >
                {v === "week" ? "Неделя" : "Месяц"}
              </button>
            ))}
          </div>
        </div>
        {view === "week" && <p className="pl-1 text-xs text-slate-600 md:hidden">{parityLabel}</p>}
      </div>

      {status === "error" ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
          <TriangleAlert className="mx-auto mb-3 size-8 text-amber-500" aria-hidden="true" />
          <p className="font-semibold">Не удалось загрузить расписание</p>
          <p className="mt-1 text-sm text-slate-500">Проверьте интернет и попробуйте ещё раз.</p>
          <button type="button" onClick={load} className="mt-4 min-h-11 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
            Повторить
          </button>
        </div>
      ) : firstLoad ? (
        <Skeleton />
      ) : (
        <div className={stale ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={stale}>
          {view === "week" ? (
            <>
              <WeekGrid days={days} today={today} byDate={byDate} onOpen={setOpen} />
              <div className="md:hidden">
                <DayStrip days={days} today={today} selected={selected} byDate={byDate} onSelect={setSelected} />
                <DayList date={selected} today={today} items={byDate.get(selected) ?? []} role={role} onOpen={setOpen} />
              </div>
            </>
          ) : (
            <MonthGrid weeks={weeks} anchor={anchor} today={today} selected={selected} byDate={byDate} onSelect={setSelected} onOpen={setOpen} />
          )}
        </div>
      )}

      {open && (
        <LessonDialog
          o={open}
          role={role}
          today={today}
          onClose={() => setOpen(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

/** true на экранах уже 768 px; на сервере и до первого кадра false (по умолчанию и так неделя) */
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return mobile;
}

function WeekGrid({
  days,
  today,
  byDate,
  onOpen,
}: {
  days: string[];
  today: string;
  byDate: Map<string, Occurrence[]>;
  onOpen: (o: Occurrence) => void;
}) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
      <div className="grid min-w-[860px]" style={{ gridTemplateColumns: "5rem repeat(7, minmax(0, 1fr))" }}>
        <div className="border-b border-slate-100" />
        {days.map((d, i) => (
          <div
            key={d}
            className={`border-b border-l border-slate-100 px-2 py-2.5 text-center ${d === today ? "bg-brand-50" : ""}`}
          >
            <span className="text-xs font-medium text-slate-500">{WEEKDAY_SHORT[i]}</span>
            <span className={`ml-1.5 inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold ${d === today ? "bg-brand-600 text-white" : "text-slate-900"}`}>
              {dayOfMonth(d)}
            </span>
          </div>
        ))}

        {SLOTS.map((s) => (
          <WeekRow key={s.n} slot={s} days={days} today={today} byDate={byDate} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function WeekRow({
  slot,
  days,
  today,
  byDate,
  onOpen,
}: {
  slot: (typeof SLOTS)[number];
  days: string[];
  today: string;
  byDate: Map<string, Occurrence[]>;
  onOpen: (o: Occurrence) => void;
}) {
  return (
    <>
      <div className="border-t border-slate-100 px-2 py-2 text-right">
        <span className="block text-sm font-semibold tabular-nums text-slate-800">{slot.start}</span>
        <span className="block text-xs text-slate-400">{slot.n} пара</span>
      </div>
      {days.map((d) => {
        const cell = (byDate.get(d) ?? []).filter((o) => o.slot === slot.n);
        return (
          <div
            key={d}
            className={`flex min-h-[72px] flex-col gap-1 border-l border-t border-slate-100 p-1 ${d === today ? "bg-brand-50/40" : ""}`}
          >
            {cell.map((o) => (
              <LessonChip key={o.key} o={o} onOpen={onOpen} />
            ))}
          </div>
        );
      })}
    </>
  );
}

function DayStrip({
  days,
  today,
  selected,
  byDate,
  onSelect,
}: {
  days: string[];
  today: string;
  selected: string;
  byDate: Map<string, Occurrence[]>;
  onSelect: (d: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm" role="group" aria-label="Дни недели">
      {days.map((d, i) => {
        const has = (byDate.get(d) ?? []).some((o) => o.status !== "cancelled" && o.status !== "moved_away");
        const isSel = d === selected;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelect(d)}
            aria-pressed={isSel}
            aria-label={formatWeekdayDayMonth(d)}
            className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl ${isSel ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
          >
            <span className={`text-xs font-medium ${isSel ? "text-brand-100" : "text-slate-500"}`}>{WEEKDAY_SHORT[i]}</span>
            <span className={`text-base font-semibold ${d === today && !isSel ? "text-brand-600" : ""}`}>{dayOfMonth(d)}</span>
            <span className={`size-1.5 rounded-full ${has ? (isSel ? "bg-white" : "bg-brand-500") : "bg-transparent"}`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function DayList({
  date,
  today,
  items,
  role,
  onOpen,
}: {
  date: string;
  today: string;
  items: Occurrence[];
  role: Role;
  onOpen: (o: Occurrence) => void;
}) {
  return (
    <section className="mt-4 md:mt-0">
      <h2 className="mb-2 text-base font-bold">{formatWeekdayDayMonth(date)}</h2>
      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center shadow-sm">
          <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Coffee className="size-7" aria-hidden="true" />
          </span>
          <p className="font-semibold">{date === today ? "На сегодня пар нет" : "В этот день пар нет"}</p>
          <p className="mt-1 text-sm text-slate-500">Можно отдохнуть или заняться самостоятельной работой.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((o) => (
            <LessonRow key={o.key} o={o} role={role} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MonthGrid({
  weeks,
  anchor,
  today,
  selected,
  byDate,
  onSelect,
  onOpen,
}: {
  weeks: string[][];
  anchor: string;
  today: string;
  selected: string;
  byDate: Map<string, Occurrence[]>;
  onSelect: (d: string) => void;
  onOpen: (o: Occurrence) => void;
}) {
  const month = anchor.slice(5, 7);
  const cols = "grid grid-cols-7 md:grid-cols-[2.25rem_repeat(7,minmax(0,1fr))]";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`${cols} border-b border-slate-100`}>
        <div className="hidden md:block" />
        {WEEKDAY_SHORT.map((w) => (
          <div key={w} className="py-2.5 text-center text-xs font-semibold text-slate-500">
            {w}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className={`${cols} border-t border-slate-100 first:border-t-0`}>
          <div className="hidden items-center justify-center md:flex">
            <span className="rotate-180 text-xs font-medium text-slate-400 [writing-mode:vertical-rl]">
              {parityOf(week[0]) === "even" ? "Чётная" : "Нечётная"}
            </span>
          </div>
          {week.map((d) => {
            const list = (byDate.get(d) ?? []).filter((o) => o.status !== "moved_away");
            const inMonth = d.slice(5, 7) === month;
            const isSel = d === selected;
            return (
              <div
                key={d}
                className={`min-h-16 border-l border-slate-100 first:border-l-0 md:min-h-28 md:first:border-l ${isSel ? "bg-brand-50/60" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(d)}
                  aria-label={formatWeekdayDayMonth(d)}
                  aria-pressed={isSel}
                  className="flex w-full flex-col items-center gap-1 px-1 pt-1.5 md:items-start md:px-2"
                >
                  <span
                    className={`inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold ${
                      d === today ? "bg-brand-600 text-white" : inMonth ? "text-slate-900" : "text-slate-300"
                    }`}
                  >
                    {dayOfMonth(d)}
                  </span>
                  <span className="flex min-h-2 flex-wrap justify-center gap-0.5 md:hidden" aria-hidden="true">
                    {list.slice(0, 4).map((o) => (
                      <span key={o.key} className={`size-1.5 rounded-full ${colorFor(o.disciplineId).dot} ${o.status === "cancelled" ? "opacity-30" : ""}`} />
                    ))}
                  </span>
                </button>
                <div className="hidden flex-col gap-1 px-1 pb-1 md:flex">
                  {list.slice(0, 3).map((o) => (
                    <LessonChip key={o.key} o={o} onOpen={onOpen} showTime />
                  ))}
                  {list.length > 3 && (
                    <button type="button" onClick={() => onSelect(d)} className="px-1 text-left text-xs font-medium text-brand-700 hover:underline">
                      ещё {list.length - 3}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-busy="true" aria-label="Загрузка расписания">
      <div className="mb-4 grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-14 rounded-xl bg-slate-100" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-2 h-20 rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}
