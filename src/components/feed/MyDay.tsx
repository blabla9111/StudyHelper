"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeAlert,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Footprints,
  Info,
  Megaphone,
  MapPin,
  Loader2,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { FormatBadge, FormatIcon, JoinControl, useNow } from "@/components/schedule/format-ui";
import { LessonDialog } from "@/components/schedule/LessonDialog";
import { colorFor } from "@/components/schedule/palette";
import { Tracker } from "@/components/requests/Tracker";
import { deadlineInfo } from "@/lib/deadline-ui";
import { relativeTime } from "@/lib/format";
import type { AnnouncementItem, ChangeItem, DeadlineItem, Feed } from "@/lib/feed";
import { formatDayMonth, formatWeekdayDayMonth, plural, untilText, whereText } from "@/lib/schedule";
import type { Occurrence } from "@/lib/types";

const PREF_KEY = "sh.onlyImportant";

function Card({ children, tone = "plain", className = "" }: { children: ReactNode; tone?: "plain" | "warn" | "action"; className?: string }) {
  const border = tone === "warn" ? "border-amber-300 bg-amber-50/60" : tone === "action" ? "border-brand-300 bg-brand-50/50" : "border-slate-200 bg-white";
  return <section className={`rounded-2xl border p-4 shadow-sm ${border} ${className}`}>{children}</section>;
}

function SectionTitle({ children, href, hrefLabel }: { children: ReactNode; href?: string; hrefLabel?: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{children}</h2>
      {href && (
        <Link href={href} className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
          {hrefLabel ?? "см. больше"} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

const outlineBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50";

export function MyDay({ feed }: { feed: Feed }) {
  const router = useRouter();
  const [only, setOnly] = useState(false);
  const [open, setOpen] = useState<Occurrence | null>(null);
  const [howTo, setHowTo] = useState<Occurrence | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      setOnly(localStorage.getItem(PREF_KEY) === "1");
    } catch {
      /* хранилище недоступно: остаёмся с настройкой по умолчанию */
    }
  }, []);
  function toggleOnly() {
    const v = !only;
    setOnly(v);
    try {
      localStorage.setItem(PREF_KEY, v ? "1" : "0");
    } catch {
      /* не страшно */
    }
  }

  // Карточку пары можно открыть прямо из ленты
  const openLesson = useCallback(async (lessonId: number, date: string) => {
    try {
      const res = await fetch(`/api/lessons/detail?lessonId=${lessonId}&date=${date}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as { occurrence: Occurrence };
      setOpen(d.occurrence);
    } catch {
      /* нет связи: ничего не открываем */
    }
  }, []);

  async function markDone(id: number) {
    setHidden((h) => new Set(h).add(id));
    try {
      const res = await fetch("/api/deadlines/done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, done: true }),
      });
      if (!res.ok) throw new Error("bad");
      router.refresh();
    } catch {
      setHidden((h) => {
        const n = new Set(h);
        n.delete(id);
        return n;
      });
    }
  }

  const deadlines = feed.deadlines.filter((d) => !hidden.has(d.id));
  const importantDeadlines = deadlines.filter((d) => deadlineInfo(d.dueDate, feed.today).days <= 3);
  const shownDeadlines = only ? importantDeadlines : deadlines;
  const requests = only ? feed.requests.filter((r) => r.status === "ready" || r.status === "rejected") : feed.requests;
  const announcements = only ? feed.announcements.filter((a) => a.needsAction) : feed.announcements;
  const showToday = !only && feed.todayLessons.length > 0;

  const nothing = feed.changes.length === 0 && !feed.next && !showToday && shownDeadlines.length === 0 && requests.length === 0 && announcements.length === 0;

  const summary = [
    feed.lessonsToday > 0 ? `Сегодня ${feed.lessonsToday} ${plural(feed.lessonsToday, "пара", "пары", "пар")}` : "Сегодня пар нет",
    feed.deadlinesWeek > 0 ? `${feed.deadlinesWeek} ${plural(feed.deadlinesWeek, "дедлайн", "дедлайна", "дедлайнов")} на неделе` : "дедлайнов на неделе нет",
  ].join(", ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-medium text-slate-700">{summary}</p>
        <button
          type="button"
          role="switch"
          aria-checked={only}
          onClick={toggleOnly}
          className="inline-flex min-h-11 items-center gap-2.5 rounded-full border border-slate-300 bg-white py-1 pl-3 pr-1.5 text-sm font-semibold text-slate-700"
        >
          Только важное
          <span className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${only ? "bg-brand-600" : "bg-slate-300"}`} aria-hidden="true">
            <span className={`absolute size-5 rounded-full bg-white shadow transition-all ${only ? "left-6" : "left-1"}`} />
          </span>
        </button>
      </div>

      {nothing && (
        <Card>
          <EmptyState icon={<CheckCircle2 className="size-7" />} title="На сегодня всё">
            {only ? "Важных дел нет. Выключите фильтр, чтобы увидеть всё остальное." : "Ничего нового: пар, дедлайнов и объявлений нет."}
          </EmptyState>
        </Card>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          {feed.changes.length > 0 && (
            <div className="flex flex-col gap-3">
              {feed.changes.map((c) => (
                <ChangeCard key={c.id} c={c} onOpen={() => openLesson(c.occ.lessonId, c.occ.date)} onHowTo={() => setHowTo(c.occ)} />
              ))}
            </div>
          )}

          {feed.next && <NextCard occ={feed.next.occ} startMs={feed.next.startMs} endMs={feed.next.endMs} today={feed.today} onOpen={() => openLesson(feed.next!.occ.lessonId, feed.next!.occ.date)} onHowTo={() => setHowTo(feed.next!.occ)} />}

          {showToday && (
            <Card>
              <SectionTitle href="/schedule" hrefLabel="Расписание">Сегодня</SectionTitle>
              <ul className="flex flex-col gap-1">
                {feed.todayLessons.map((o) => (
                  <TodayRow key={o.key} o={o} onOpen={() => openLesson(o.lessonId, o.date)} />
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {shownDeadlines.length > 0 && (
            <Card>
              <SectionTitle>Дедлайны</SectionTitle>
              <ul className="flex flex-col gap-2">
                {shownDeadlines.map((d) => (
                  <DeadlineRow key={d.id} d={d} today={feed.today} onDone={() => markDone(d.id)} onOpen={() => d.lessonId && d.lessonDate && openLesson(d.lessonId, d.lessonDate)} />
                ))}
              </ul>
            </Card>
          )}

          {requests.length > 0 && (
            <Card>
              <SectionTitle href="/requests">Заявки</SectionTitle>
              <ul className="flex flex-col gap-3">
                {requests.map((r) => (
                  <li key={r.id}>
                    <Link href={`/requests/${r.id}`} className="block rounded-xl p-1.5 hover:bg-slate-50">
                      <p className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
                        <FileText className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
                        <span className="min-w-0 truncate">{r.title}</span>
                      </p>
                      <p className="-mt-1 mb-2 text-xs text-slate-600">
                        № {r.code} · подана {formatDayMonth(r.createdAt.slice(0, 10))}
                      </p>
                      <Tracker status={r.status} compact />
                      {r.status === "ready" && (
                        <p className="mt-2 text-sm font-medium text-emerald-700">{r.delivery === "pdf" ? "Готова: можно скачать PDF" : "Готова: заберите в деканате"}</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {announcements.length > 0 && (
            <Card>
              <SectionTitle>Объявления</SectionTitle>
              <ul className="flex flex-col gap-3">
                {announcements.map((a) => (
                  <AnnouncementRow key={a.id} a={a} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {open && (
        <LessonDialog o={open} role="student" today={feed.today} onClose={() => setOpen(null)} onChanged={() => router.refresh()} />
      )}
      {howTo && <HowToDialog o={howTo} onClose={() => setHowTo(null)} />}
    </div>
  );
}

function ChangeCard({ c, onOpen, onHowTo }: { c: ChangeItem; onOpen: () => void; onHowTo: () => void }) {
  const o = c.occ;
  const live = c.kind !== "cancelled";
  const showJoin = live && o.format !== "offline";
  const label = c.kind === "cancelled" ? "Отменена" : "Изменилось";
  return (
    <Card tone="warn">
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Открыть карточку пары: ${c.title}`}>
        <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-amber-200/70 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-900">
          <BadgeAlert className="size-3.5" aria-hidden="true" /> {label}
        </span>
        <span className="mt-1 block text-lg font-bold leading-snug">{c.title}</span>
        {c.note && <span className="mt-1 block text-sm text-slate-700">{c.note}</span>}
        {c.rows.map((r) => (
          <span key={r.label} className="mt-2 block rounded-xl bg-white/80 px-3 py-2.5 text-[15px]">
            <span className="block text-xs font-medium text-slate-500">{r.label}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-slate-500 line-through decoration-slate-300">{r.was}</span>
              <ArrowRight className="size-4 shrink-0 text-amber-700" aria-hidden="true" />
              <span className="font-semibold text-slate-900">{r.now}</span>
            </span>
          </span>
        ))}
      </button>
      {live && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {showJoin && (
            <div className="min-w-[10rem] flex-1">
              <JoinControl o={o} full />
            </div>
          )}
          <a href={`/api/schedule/ics?lessonId=${o.lessonId}&date=${o.date}`} className={outlineBtn}>
            <CalendarPlus className="size-4" aria-hidden="true" /> Добавить в календарь
          </a>
          {o.format !== "online" && (
            <button type="button" onClick={onHowTo} className={outlineBtn}>
              <Footprints className="size-4" aria-hidden="true" /> Как дойти
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function NextCard({ occ: o, startMs, endMs, today, onOpen, onHowTo }: { occ: Occurrence; startMs: number; endMs: number; today: string; onOpen: () => void; onHowTo: () => void }) {
  const now = useNow(15_000);
  const c = colorFor(o.disciplineId);
  const left = now === null ? "" : untilText(startMs, endMs, now);
  const dayLabel = o.date === today ? "Сегодня" : formatWeekdayDayMonth(o.date);
  return (
    <Card>
      <SectionTitle>Ближайшая пара</SectionTitle>
      <button type="button" onClick={onOpen} className="flex w-full items-stretch gap-3 text-left" aria-label={`Открыть карточку пары: ${o.subject}`}>
        <span className="flex w-14 shrink-0 flex-col justify-center text-sm tabular-nums">
          <span className="text-lg font-bold leading-tight">{o.start}</span>
          <span className="text-slate-400">{o.end}</span>
        </span>
        <span className={`w-1 shrink-0 rounded-full ${c.bar}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold leading-snug">{o.subject}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
            <span>{dayLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              {o.format === "online" ? <FormatIcon format="online" /> : <MapPin className="size-3.5" aria-hidden="true" />}
              {whereText(o)}
            </span>
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <FormatBadge o={o} />
            {left && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800">
                <Clock className="size-3.5" aria-hidden="true" /> {left}
              </span>
            )}
          </span>
        </span>
      </button>
      {(o.format !== "offline" || o.format === "offline") && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {o.format !== "offline" && (
            <div className="min-w-[10rem] flex-1">
              <JoinControl o={o} full />
            </div>
          )}
          {o.format !== "online" && (
            <button type="button" onClick={onHowTo} className={outlineBtn}>
              <Footprints className="size-4" aria-hidden="true" /> Как дойти
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function TodayRow({ o, onOpen }: { o: Occurrence; onOpen: () => void }) {
  const c = colorFor(o.disciplineId);
  const dead = o.status === "cancelled";
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-stretch gap-3 rounded-xl p-2 text-left hover:bg-slate-50">
        <span className="w-12 shrink-0 text-sm tabular-nums">
          <span className="block font-semibold">{o.start}</span>
          <span className="block text-slate-400">{o.end}</span>
        </span>
        <span className={`w-1 shrink-0 rounded-full ${c.bar} ${dead ? "opacity-40" : ""}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={`block text-[15px] font-semibold leading-snug ${dead ? "line-through opacity-60" : ""}`}>{o.subject}</span>
          <span className="block text-sm text-slate-500">
            {o.kind} · {whereText(o)}
          </span>
        </span>
        {dead && <span className="self-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">Отменена</span>}
      </button>
    </li>
  );
}

function DeadlineRow({ d, today, onDone, onOpen }: { d: DeadlineItem; today: string; onDone: () => void; onOpen: () => void }) {
  const info = deadlineInfo(d.dueDate, today);
  const [pending, setPending] = useState(false);
  return (
    <li className={`flex items-center gap-2 rounded-xl border px-2 py-2 ${info.overdue ? "border-rose-300 bg-rose-50" : info.urgent ? "border-amber-200 bg-amber-50/50" : "border-slate-200"}`}>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 px-1 text-left" aria-label={`Открыть карточку пары: ${d.title}`}>
        <span className="block text-xs font-medium text-slate-500">{d.subject}</span>
        <span className="block text-[15px] font-semibold leading-snug">{d.title}</span>
        <span className={`block text-xs ${info.overdue ? "font-bold text-rose-700" : info.urgent ? "font-bold text-amber-800" : "text-slate-500"}`}>
          {info.due} · {info.left}
        </span>
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true);
          onDone();
        }}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-emerald-500 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />} Сделано
      </button>
    </li>
  );
}

function AnnouncementRow({ a }: { a: AnnouncementItem }) {
  return (
    <li className={`rounded-xl border p-3 ${a.needsAction ? "border-brand-300 bg-brand-50/50" : "border-slate-200"}`}>
      <p className="mb-1 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${a.needsAction ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}>
          {a.needsAction ? <Megaphone className="size-3" aria-hidden="true" /> : <Info className="size-3" aria-hidden="true" />}
          {a.needsAction ? "Нужно действие" : "К сведению"}
        </span>
        <span className="text-xs text-slate-400">{relativeTime(a.createdAt)}</span>
      </p>
      <p className="text-[15px] font-semibold leading-snug">{a.title}</p>
      <p className="mt-0.5 text-sm text-slate-600">{a.body}</p>
      {a.needsAction && a.actionHref && a.actionLabel && (
        <Link href={a.actionHref} className="mt-2.5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
          {a.actionLabel} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </li>
  );
}

/** «Как дойти»: подсказка по номеру аудитории. Корпус и схема вымышленные. */
function HowToDialog({ o, onClose }: { o: Occurrence; onClose: () => void }) {
  const digits = o.room.match(/\d+/)?.[0] ?? "";
  const floor = digits.length >= 3 ? Number(digits[0]) : digits ? 1 : null;
  const wing = digits.length >= 3 ? (Number(digits.slice(-2)) < 20 ? "левом" : "правом") : null;
  return (
    <Modal title="Как дойти" onClose={onClose}>
      <p className="text-[15px] text-slate-700">
        {o.subject}, <strong>ауд. {o.room}</strong>.
      </p>
      {floor ? (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] text-slate-700">
          <li>Войдите в главный корпус через центральный вход.</li>
          <li>Поднимитесь на {floor} этаж по центральной лестнице или на лифте.</li>
          {wing && <li>Аудитория находится в {wing} крыле: номера идут по порядку.</li>}
        </ol>
      ) : (
        <p className="mt-3 text-[15px] text-slate-700">Уточните аудиторию в карточке пары.</p>
      )}
      <p className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-slate-500">Схема условная: в концепте нет настоящего вуза и карты кампуса.</p>
    </Modal>
  );
}
