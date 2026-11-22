"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CalendarX,
  ChevronDown,
  DoorOpen,
  FileText,
  Film,
  ListTodo,
  Loader2,
  Radio,
  Trash2,
  TriangleAlert,
  Undo2,
  Video,
  MapPin,
} from "lucide-react";
import { addDays, formatDayMonth, SLOTS, type LessonFormat } from "@/lib/schedule";
import type { Occurrence } from "@/lib/types";
import { deadlineInfo } from "@/lib/deadline-ui";
import type { Detail } from "./LessonDialog";

export const inputCls =
  "h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100";

const REASON_LABEL: Record<string, string> = {
  illness: "болею",
  work: "работа или стажировка",
  event: "олимпиада или мероприятие",
  other: "другое",
};
const STATUS_LABEL: Record<string, string> = {
  sent: "Ждёт ответа",
  will_record: "Запишу",
  will_send_notes: "Пришлю конспект",
  declined: "Не получится",
};

async function post(url: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error ?? "Не удалось сохранить.";
  } catch {
    return "Нет связи с сервером. Повторите попытку.";
  }
}

function Section({ icon, title, hint, children, defaultOpen = false }: { icon: ReactNode; title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-3 px-4 text-left"
      >
        <span className="text-brand-600" aria-hidden="true">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{title}</span>
          {hint && <span className="block truncate text-xs text-slate-500">{hint}</span>}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div className="border-t border-slate-100 px-4 py-3">{children}</div>}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {error}
    </p>
  );
}

function Busy({ on }: { on: boolean }) {
  return on ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null;
}

const primaryBtn =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60";
const ghostBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60";

/** Управление парой для преподавателя: формат, материалы, дедлайны, запись, перенос и отмена */
export function TeacherPanel({
  o,
  detail,
  today,
  reload,
  onScheduleChanged,
}: {
  o: Occurrence;
  detail: Detail | null;
  today: string;
  reload: () => void;
  onScheduleChanged: () => void;
}) {
  const future = o.date >= today;
  const alive = o.status !== "cancelled" && o.status !== "moved_away";

  return (
    <div className="mt-5 flex flex-col gap-2.5 border-t border-slate-100 pt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Управление парой</h3>

      <FormatSection o={o} canEdit={future && alive} reload={reload} />
      <MaterialsSection o={o} detail={detail} reload={reload} />
      <DeadlinesSection o={o} detail={detail} today={today} reload={reload} />
      <RecordingSection o={o} detail={detail} today={today} reload={reload} />
      <Section
        icon={<ListTodo className="size-5" />}
        title="Запросы на запись"
        hint={detail ? `${detail.requests.length} по этой паре` : undefined}
      >
        {!detail || detail.requests.length === 0 ? (
          <p className="text-sm text-slate-500">Студенты не просили записать эту пару.</p>
        ) : (
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <caption className="sr-only">Студенты, просящие записать пару, и причины</caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th scope="col" className="w-[40%] py-1 pr-2 font-semibold">Студент</th>
                <th scope="col" className="w-[36%] py-1 pr-2 font-semibold">Причина</th>
                <th scope="col" className="w-[24%] py-1 font-semibold">Ответ</th>
              </tr>
            </thead>
            <tbody>
              {detail.requests.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 align-top">
                  <td className="break-words py-2 pr-2 font-medium leading-snug">{r.student}</td>
                  <td className="break-words py-2 pr-2 leading-snug">{REASON_LABEL[r.reason]}</td>
                  <td className="py-2 text-xs text-slate-500">{STATUS_LABEL[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Link href={`/recordings#pair-${o.lessonId}-${o.date}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:underline">
          Ответить на запросы по этой паре
        </Link>
      </Section>
      <ScheduleChanges o={o} today={today} onChanged={onScheduleChanged} />
    </div>
  );
}

function FormatSection({ o, canEdit, reload }: { o: Occurrence; canEdit: boolean; reload: () => void }) {
  const [format, setFormat] = useState<LessonFormat>(o.format);
  const [url, setUrl] = useState(o.onlineUrl ?? "");
  const [comment, setComment] = useState(o.onlineComment ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    const err = await post("/api/lessons/format", { lessonId: o.lessonId, date: o.date, format, url, comment });
    setPending(false);
    if (err) setError(err);
    else {
      setSaved(true);
      reload();
    }
  }

  const options: { v: LessonFormat; label: string; icon: ReactNode }[] = [
    { v: "offline", label: "Очно", icon: <MapPin className="size-4" /> },
    { v: "online", label: "Онлайн", icon: <Video className="size-4" /> },
    { v: "hybrid", label: "Очно + трансляция", icon: <Radio className="size-4" /> },
  ];

  return (
    <Section icon={<Video className="size-5" />} title="Формат и подключение" hint={options.find((x) => x.v === o.format)?.label}>
      {!canEdit ? (
        <p className="text-sm text-slate-500">Формат можно менять только у будущих занятий, которые состоятся.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="Формат проведения" className="grid gap-2 sm:grid-cols-3">
            {options.map((x) => (
              <button
                key={x.v}
                type="button"
                role="radio"
                aria-checked={format === x.v}
                onClick={() => setFormat(x.v)}
                className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold ${
                  format === x.v ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {x.icon}
                {x.label}
              </button>
            ))}
          </div>
          {format !== "offline" && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Ссылка на подключение</span>
                <input
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  maxLength={500}
                  placeholder="https://… (Zoom, Teams, Телемост)"
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Комментарий (пароль, инструкция)</span>
                <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} className={inputCls} />
              </label>
            </>
          )}
          <ErrorLine error={error} />
          {saved && <p className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">Сохранено, студенты получили уведомление.</p>}
          <button type="button" onClick={save} disabled={pending} className={primaryBtn}>
            <Busy on={pending} /> Сохранить и сообщить студентам
          </button>
        </div>
      )}
    </Section>
  );
}

function MaterialsSection({ o, detail, reload }: { o: Occurrence; detail: Detail | null; reload: () => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("presentation");
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setPending(true);
    setError(null);
    const err = await post("/api/lessons/materials", { lessonId: o.lessonId, date: o.date, title, kind, url });
    setPending(false);
    if (err) setError(err);
    else {
      setTitle("");
      setUrl("");
      reload();
    }
  }
  async function remove(id: number) {
    const err = await post("/api/lessons/materials/delete", { id });
    if (err) setError(err);
    else reload();
  }

  return (
    <Section icon={<FileText className="size-5" />} title="Материалы" hint={detail ? `${detail.materials.length} прикреплено` : undefined}>
      <ul className="mb-3 flex flex-col gap-1.5">
        {detail?.materials.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{m.title}</span>
            <button type="button" onClick={() => remove(m.id)} aria-label={`Удалить ${m.title}`} className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2.5">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Название, например «Лекция 9»" aria-label="Название материала" className={inputCls} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Тип материала" className={inputCls}>
          <option value="presentation">Презентация</option>
          <option value="notes">Конспект</option>
          <option value="sources">Источники</option>
        </select>
        <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="Ссылка (необязательно)" aria-label="Ссылка на материал" className={inputCls} />
        <ErrorLine error={error} />
        <button type="button" onClick={add} disabled={pending || !title.trim()} className={ghostBtn}>
          <Busy on={pending} /> Добавить материал
        </button>
      </div>
    </Section>
  );
}

function DeadlinesSection({ o, detail, today, reload }: { o: Occurrence; detail: Detail | null; today: string; reload: () => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(addDays(today, 7));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setPending(true);
    setError(null);
    const err = await post("/api/deadlines", { lessonId: o.lessonId, date: o.date, title, dueDate: due });
    setPending(false);
    if (err) setError(err);
    else {
      setTitle("");
      reload();
    }
  }
  async function remove(id: number) {
    const err = await post("/api/deadlines/delete", { id });
    if (err) setError(err);
    else reload();
  }

  return (
    <Section icon={<ListTodo className="size-5" />} title="Задание и дедлайн" hint={detail ? `${detail.deadlines.length} заданий` : undefined}>
      <ul className="mb-3 flex flex-col gap-1.5">
        {detail?.deadlines.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium">{d.title}</span>
              <span className="text-xs text-slate-500">
                {deadlineInfo(d.dueDate, today).due} · сделали: {d.doneCount}
              </span>
            </span>
            <button type="button" onClick={() => remove(d.id)} aria-label={`Удалить ${d.title}`} className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2.5">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Например, «Лабораторная № 4»" aria-label="Название задания" className={inputCls} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Срок сдачи</span>
          <input type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
        </label>
        <ErrorLine error={error} />
        <button type="button" onClick={add} disabled={pending || !title.trim()} className={ghostBtn}>
          <Busy on={pending} /> Добавить задание
        </button>
      </div>
    </Section>
  );
}

function RecordingSection({ o, detail, today, reload }: { o: Occurrence; detail: Detail | null; today: string; reload: () => void }) {
  const [title, setTitle] = useState(`${o.subject}, ${formatDayMonth(o.date)}`);
  const [url, setUrl] = useState("");
  const [minutes, setMinutes] = useState("90");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = o.date <= today;

  async function attach(remove = false) {
    setPending(true);
    setError(null);
    const err = await post("/api/lessons/recording", remove ? { lessonId: o.lessonId, date: o.date, remove: true } : { lessonId: o.lessonId, date: o.date, title, url, minutes: Number(minutes) || null });
    setPending(false);
    if (err) setError(err);
    else reload();
  }

  return (
    <Section icon={<Film className="size-5" />} title="Запись пары" hint={detail?.recording ? "Прикреплена" : "Нет записи"}>
      {detail?.recording && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
          <span className="min-w-0 truncate font-medium">{detail.recording.title}</span>
          <button type="button" onClick={() => attach(true)} disabled={pending} className="shrink-0 text-sm font-semibold text-rose-600 hover:underline">
            Убрать
          </button>
        </div>
      )}
      {!started ? (
        <p className="text-sm text-slate-500">Запись можно прикрепить, когда пара пройдёт.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Название записи" className={inputCls} />
          <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="Ссылка на запись (необязательно)" aria-label="Ссылка на запись" className={inputCls} />
          <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Длительность в минутах" placeholder="Длительность, минут" className={inputCls} />
          <ErrorLine error={error} />
          <button type="button" onClick={() => attach()} disabled={pending || !title.trim()} className={ghostBtn}>
            <Busy on={pending} /> {detail?.recording ? "Заменить запись" : "Прикрепить запись"}
          </button>
        </div>
      )}
    </Section>
  );
}

type Mode = "menu" | "cancel" | "move" | "room";

function ScheduleChanges({ o, today, onChanged }: { o: Occurrence; today: string; onChanged: () => void }) {
  // Изменения привязаны к исходной дате занятия, даже если мы смотрим на его новое место
  const origDate = o.status === "moved_here" ? (o.otherDate ?? o.date) : o.date;
  const editable = origDate >= today;
  const changed = o.status !== "normal";

  const [mode, setMode] = useState<Mode>("menu");
  const [reason, setReason] = useState("");
  const [newRoom, setNewRoom] = useState("");
  const [newDate, setNewDate] = useState(addDays(origDate < today ? today : origDate, 1));
  const [newSlot, setNewSlot] = useState(o.slot);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: "cancel" | "move" | "room" | "restore") {
    setPending(true);
    setError(null);
    const err = await post("/api/schedule/changes", { lessonId: o.lessonId, date: origDate, action, reason, newRoom, newDate, newSlot });
    if (err) {
      setError(err);
      setPending(false);
    } else {
      onChanged();
    }
  }

  return (
    <Section icon={<CalendarClock className="size-5" />} title="Отмена, перенос, аудитория">
      {!editable ? (
        <p className="text-sm text-slate-500">Прошедшие занятия изменить нельзя.</p>
      ) : mode === "menu" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-500">Студенты группы {o.group} получат уведомление об изменении.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => setMode("cancel")} className={ghostBtn}><CalendarX className="size-4" aria-hidden="true" /> Отменить</button>
            <button type="button" onClick={() => setMode("move")} className={ghostBtn}><CalendarClock className="size-4" aria-hidden="true" /> Перенести</button>
            <button type="button" onClick={() => setMode("room")} className={ghostBtn}><DoorOpen className="size-4" aria-hidden="true" /> Аудитория</button>
          </div>
          {changed && (
            <button type="button" disabled={pending} onClick={() => send("restore")} className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60">
              <Undo2 className="size-4" aria-hidden="true" /> Вернуть по расписанию
            </button>
          )}
          <ErrorLine error={error} />
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(mode);
          }}
        >
          {mode === "move" && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Новая дата</span>
                <input type="date" required min={today} value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Пара</span>
                <select value={newSlot} onChange={(e) => setNewSlot(Number(e.target.value))} className={inputCls}>
                  {SLOTS.map((s) => (
                    <option key={s.n} value={s.n}>{s.n} пара, {s.start}–{s.end}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          {(mode === "move" || mode === "room") && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">{mode === "room" ? "Новая аудитория" : "Аудитория (если изменится)"}</span>
              <input value={newRoom} onChange={(e) => setNewRoom(e.target.value)} required={mode === "room"} maxLength={30} placeholder="Например, 405" className={inputCls} />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Причина (необязательно)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={inputCls} />
          </label>
          <ErrorLine error={error} />
          <div className="flex gap-2">
            <button type="button" onClick={() => { setMode("menu"); setError(null); }} className={`${ghostBtn} flex-1`}>Назад</button>
            <button type="submit" disabled={pending} className={`${primaryBtn} flex-1`}>
              <Busy on={pending} />
              {mode === "cancel" ? "Отменить пару" : mode === "move" ? "Перенести" : "Сменить аудиторию"}
            </button>
          </div>
        </form>
      )}
    </Section>
  );
}
