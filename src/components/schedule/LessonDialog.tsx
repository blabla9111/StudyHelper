"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookMarked,
  CalendarPlus,
  Check,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Pause,
  Play,
  Presentation,
  TriangleAlert,
  Video,
  Bookmark,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { deadlineInfo } from "@/lib/deadline-ui";
import { formatDayMonth, formatWeekdayDayMonth, slotByNumber, type LessonFormat } from "@/lib/schedule";
import type { Occurrence } from "@/lib/types";
import { colorFor } from "./palette";
import { FormatBadge, JoinControl } from "./format-ui";
import { StatusBadge } from "./parts";
import { inputCls, TeacherPanel } from "./TeacherPanel";

export interface Detail {
  occurrence: Occurrence;
  materials: { id: number; title: string; kind: "presentation" | "notes" | "sources"; url: string | null }[];
  recording: { title: string; url: string | null; minutes: number | null } | null;
  deadlines: { id: number; title: string; dueDate: string; done: boolean; doneCount: number }[];
  myRequest: { reason: string; comment: string | null; status: string; teacherComment: string | null } | null;
  requests: { id: number; student: string; reason: string; comment: string | null; status: string; teacherComment: string | null }[];
  seriesFormat: LessonFormat;
}

const MATERIAL_ICON = { presentation: Presentation, notes: FileText, sources: BookMarked } as const;
const MATERIAL_LABEL = { presentation: "Презентация", notes: "Конспект", sources: "Источники" } as const;

export function LessonDialog({
  o: initial,
  role,
  today,
  onClose,
  onChanged,
}: {
  o: Occurrence;
  role: "student" | "teacher";
  today: string;
  onClose: () => void;
  /** Расписание изменилось: список занятий нужно загрузить заново */
  onChanged: () => void;
}) {
  const [o, setO] = useState(initial);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/lessons/detail?lessonId=${initial.lessonId}&date=${initial.date}`, { cache: "no-store" });
      if (!res.ok) throw new Error("bad");
      const d = (await res.json()) as Detail;
      setDetail(d);
      setO(d.occurrence);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [initial.lessonId, initial.date]);

  // После любого изменения обновляем карточку и список занятий под ней
  const reload = useCallback(async () => {
    await fetchDetail();
    onChanged();
  }, [fetchDetail, onChanged]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const c = colorFor(o.disciplineId);
  const slot = slotByNumber(o.slot)!;
  const active = o.status !== "cancelled" && o.status !== "moved_away";
  const icsHref = `/api/schedule/ics?lessonId=${o.lessonId}&date=${o.date}`;

  return (
    <Modal title={o.subject} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.soft} ${c.text}`}>
          <span className={`size-2 rounded-full ${c.dot}`} aria-hidden="true" />
          {o.kind}
        </span>
        <StatusBadge status={o.status} />
        {active && <FormatBadge o={o} />}
      </div>

      <dl className="mt-4 divide-y divide-slate-100 text-[15px]">
        <Row label="Дата">{formatWeekdayDayMonth(o.date)}</Row>
        <Row label="Время">
          {o.start}–{o.end} <span className="text-slate-400">({slot.n} пара)</span>
        </Row>
        {o.format !== "online" && (
          <Row label="Аудитория">
            {o.room}
            {o.prevRoom && <span className="text-slate-400"> (раньше {o.prevRoom})</span>}
          </Row>
        )}
        <Row label={role === "student" ? "Преподаватель" : "Группа"}>{role === "student" ? o.teacher : o.group}</Row>
      </dl>

      {o.status === "moved_away" && o.otherDate && o.otherSlot && (
        <Note>
          Перенесена на {formatDayMonth(o.otherDate)} в {slotByNumber(o.otherSlot)?.start}.{o.note && ` Причина: ${o.note}.`}
        </Note>
      )}
      {o.status === "moved_here" && o.otherDate && o.otherSlot && (
        <Note>
          Перенесена с {formatDayMonth(o.otherDate)} ({slotByNumber(o.otherSlot)?.start}).{o.note && ` Причина: ${o.note}.`}
        </Note>
      )}
      {o.status === "cancelled" && <Note>Занятие отменено.{o.note && ` Причина: ${o.note}.`}</Note>}
      {o.status === "room_changed" && o.note && <Note>{o.note}</Note>}

      {active && (
        <div className="mt-4 flex flex-col gap-3">
          {o.format !== "offline" && (
            <>
              <JoinControl o={o} full />
              {o.onlineComment && <Note>Для подключения: {o.onlineComment}</Note>}
            </>
          )}
          <a href={icsHref} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <CalendarPlus className="size-4" aria-hidden="true" /> Добавить в календарь
          </a>
        </div>
      )}

      {loadError && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Не удалось загрузить материалы.{" "}
            <button type="button" onClick={reload} className="font-semibold underline">
              Повторить
            </button>
          </span>
        </p>
      )}

      {role === "student" && (
        <StudentSections o={o} detail={detail} today={today} reload={reload} />
      )}

      {role === "teacher" && (
        <TeacherPanel
          o={o}
          detail={detail}
          today={today}
          reload={reload}
          onScheduleChanged={() => {
            onChanged();
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">{children}</p>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-slate-100 pt-4">
      <h3 className="mb-2.5 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

function Skeleton() {
  return <div className="h-14 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />;
}

function StudentSections({ o, detail, today, reload }: { o: Occurrence; detail: Detail | null; today: string; reload: () => void }) {
  return (
    <>
      <Block title="Задание и дедлайн">
        {!detail ? (
          <Skeleton />
        ) : detail.deadlines.length === 0 ? (
          <p className="text-sm text-slate-500">Заданий к этой паре нет.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.deadlines.map((d) => (
              <DeadlineRow key={d.id} d={d} today={today} reload={reload} />
            ))}
          </ul>
        )}
      </Block>

      <Block title="Материалы">
        {!detail ? (
          <Skeleton />
        ) : detail.materials.length === 0 ? (
          <p className="text-sm text-slate-500">Материалов пока нет.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {detail.materials.map((m) => {
              const Icon = MATERIAL_ICON[m.kind];
              const inner = (
                <>
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{m.title}</span>
                    <span className="block text-xs text-slate-500">{MATERIAL_LABEL[m.kind]}</span>
                  </span>
                  {m.url ? <ExternalLink className="size-4 shrink-0 text-slate-400" aria-hidden="true" /> : <Download className="size-4 shrink-0 text-slate-400" aria-hidden="true" />}
                </>
              );
              const cls = "flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50";
              return (
                <li key={m.id}>
                  {m.url ? (
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
                  ) : (
                    <a href={`/api/materials/${m.id}/download`} className={cls}>{inner}</a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Block>

      <Block title="Запись">
        {!detail ? <Skeleton /> : detail.recording ? <PlayerStub rec={detail.recording} /> : <p className="text-sm text-slate-500">Записи нет.</p>}
      </Block>

      {detail && <RecordingRequest o={o} detail={detail} reload={reload} />}
    </>
  );
}

function DeadlineRow({ d, today, reload }: { d: Detail["deadlines"][number]; today: string; reload: () => void }) {
  const [pending, setPending] = useState(false);
  const info = deadlineInfo(d.dueDate, today);
  async function toggle() {
    setPending(true);
    await fetch("/api/deadlines/done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, done: !d.done }),
    }).catch(() => null);
    await reload();
    setPending(false);
  }
  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={d.done}
        aria-label={`Сделано: ${d.title}`}
        onClick={toggle}
        disabled={pending}
        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl border-2 ${d.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-brand-400"}`}
      >
        {pending ? <Loader2 className="size-5 animate-spin text-slate-400" aria-hidden="true" /> : <Check className="size-5" aria-hidden="true" />}
      </button>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-medium ${d.done ? "text-slate-400 line-through" : ""}`}>{d.title}</span>
        <span className={`block text-xs ${d.done ? "text-slate-400" : info.overdue ? "font-semibold text-rose-600" : info.urgent ? "font-semibold text-amber-700" : "text-slate-500"}`}>
          {info.due} · {d.done ? "сделано" : info.left}
        </span>
      </span>
    </li>
  );
}

/** Плеер-заглушка: настоящего видео в концепте нет */
function PlayerStub({ rec }: { rec: NonNullable<Detail["recording"]> }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div>
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-slate-900">
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? "Пауза" : "Смотреть запись"}
          className="inline-flex size-14 items-center justify-center rounded-full bg-white/90 text-slate-900 hover:bg-white"
        >
          {playing ? <Pause className="size-6" aria-hidden="true" /> : <Play className="size-6 translate-x-0.5" aria-hidden="true" />}
        </button>
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20" aria-hidden="true">
          <div className={`h-full bg-brand-500 transition-[width] ease-linear ${playing ? "w-full duration-[30s]" : "w-1/5 duration-0"}`} />
        </div>
        <span className="absolute left-3 top-3 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white/80">Демо-плеер: видео условное</span>
      </div>
      <p className="mt-2 text-[15px] font-medium">{rec.title}</p>
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Video className="size-3.5" aria-hidden="true" />
        {rec.minutes ? `${rec.minutes} мин` : "Запись пары"}
        {rec.url && (
          <>
            {" · "}
            <a href={rec.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 hover:underline">
              открыть запись
            </a>
          </>
        )}
      </p>
    </div>
  );
}

const REASONS = [
  { v: "illness", label: "Болею" },
  { v: "work", label: "Работа или стажировка" },
  { v: "event", label: "Олимпиада или мероприятие" },
  { v: "other", label: "Другое" },
];

const ANSWER_TEXT: Record<string, { title: string; tone: string }> = {
  sent: { title: "Отправлен, ждём ответ преподавателя", tone: "bg-slate-100 text-slate-700" },
  will_record: { title: "Преподаватель запишет пару", tone: "bg-emerald-100 text-emerald-800" },
  will_send_notes: { title: "Преподаватель пришлёт конспект", tone: "bg-emerald-100 text-emerald-800" },
  declined: { title: "Записать пару не получится", tone: "bg-rose-100 text-rose-800" },
};

function RecordingRequest({ o, detail, reload }: { o: Occurrence; detail: Detail; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("illness");
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = o.status !== "cancelled" && o.status !== "moved_away";
  if (!active) return null;

  async function send() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/recording-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: o.lessonId, date: o.date, reason, comment }),
      });
      if (res.ok) {
        setOpen(false);
        await reload();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Не удалось отправить запрос.");
      }
    } catch {
      setError("Нет связи с сервером. Повторите попытку.");
    }
    setPending(false);
  }

  const req = detail.myRequest;
  return (
    <Block title="Пропуск пары">
      {req ? (
        <div className={`rounded-xl px-3.5 py-3 text-sm ${ANSWER_TEXT[req.status]?.tone ?? ""}`}>
          <p className="flex items-center gap-2 font-semibold">
            <Bookmark className="size-4" aria-hidden="true" />
            {ANSWER_TEXT[req.status]?.title}
          </p>
          {req.teacherComment && <p className="mt-1">Комментарий преподавателя: {req.teacherComment}</p>}
        </div>
      ) : (
        <>
          {o.format === "hybrid" && <p className="mb-3 rounded-xl bg-violet-50 px-3.5 py-3 text-sm text-violet-900">Пару можно смотреть в прямом эфире.</p>}
          {!open ? (
            <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand-600 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50">
              <Video className="size-4" aria-hidden="true" /> Попросить записать пару
            </button>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Причина</span>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
                  {REASONS.map((r) => (
                    <option key={r.v} value={r.v}>{r.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Комментарий {reason === "other" ? "" : "(необязательно)"}</span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={500}
                  rows={3}
                  required={reason === "other"}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-base outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                />
              </label>
              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Отмена
                </button>
                <button type="submit" disabled={pending} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                  {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Отправить
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </Block>
  );
}
