"use client";

import { useEffect, useState } from "react";
import { Check, Megaphone, Trash2 } from "lucide-react";
import { Modal } from "../Modal";
import { MAX_BODY_LEN, notifyMessagesChanged, listTime, type BroadcastItem } from "./client";

interface GroupOption {
  id: number;
  name: string;
  students: number;
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

/** Рассылка всем студентам выбранных групп: форма → подтверждение → готово */
export function BroadcastModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Рассылка группе" onClose={onClose}>
      <Form onClose={onClose} />
    </Modal>
  );
}

function Form({ onClose }: { onClose: () => void }) {
  const [groups, setGroups] = useState<GroupOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(0);

  useEffect(() => {
    fetch("/api/messages/broadcast", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { groups: GroupOption[] }) => setGroups(d.groups))
      .catch(() => setFailed(true));
  }, []);

  const picked = (groups ?? []).filter((g) => chosen.includes(g.id));
  const total = picked.reduce((s, g) => s + g.students, 0);
  const names = picked.map((g) => g.name).join(", ");
  const trimmed = text.trim();
  const canSend = picked.length > 0 && trimmed.length > 0 && trimmed.length <= MAX_BODY_LEN;

  async function send() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/messages/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: chosen, body: text }),
      });
      const data = (await res.json().catch(() => ({}))) as { recipients?: number; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Не удалось отправить рассылку.");
        setStep("form");
      } else {
        setSent(data.recipients ?? total);
        setStep("done");
        notifyMessagesChanged();
      }
    } catch {
      setError("Нет связи с сервером. Рассылка не отправлена, попробуйте ещё раз.");
      setStep("form");
    }
    setBusy(false);
  }

  if (step === "done") {
    return (
      <div className="flex flex-col items-center px-2 py-6 text-center">
        <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="size-7" aria-hidden="true" />
        </span>
        <p className="text-lg font-bold">Рассылка отправлена</p>
        <p className="mt-1 text-sm text-slate-500">
          Получили {sent} {plural(sent, "студент", "студента", "студентов")}. Ответы придут в личные диалоги.
        </p>
        <button type="button" onClick={onClose} className="mt-5 min-h-12 w-full rounded-xl bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700">
          Готово
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div>
        <p className="text-base font-semibold leading-snug">
          Отправить сообщение {total} {plural(total, "студенту", "студентам", "студентам")} ({names})?
        </p>
        <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{trimmed}</p>
        <p className="mt-2 text-xs text-slate-500">Каждый студент получит уведомление. Удалить рассылку можно в течение 5 минут.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={() => setStep("form")} className="min-h-12 rounded-xl border border-slate-200 px-5 font-semibold text-slate-700 hover:bg-slate-50">
            Назад
          </button>
          <button type="button" disabled={busy} onClick={send} className="min-h-12 rounded-xl bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            {busy ? "Отправляю…" : "Отправить"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-slate-700">Кому</legend>
        {failed && <p className="text-sm text-slate-500">Не удалось загрузить группы. Закройте окно и попробуйте ещё раз.</p>}
        {groups === null && !failed && <div className="h-12 animate-pulse rounded-xl bg-slate-100" aria-busy="true" />}
        <div className="flex flex-col gap-2">
          {groups?.map((g) => {
            const on = chosen.includes(g.id);
            return (
              <label
                key={g.id}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 ${on ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white"}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setChosen((c) => (on ? c.filter((x) => x !== g.id) : [...c, g.id]))}
                  className="size-5 accent-brand-600"
                />
                <span className="flex-1 font-medium">{g.name}</span>
                <span className="text-sm text-slate-500">
                  {g.students} {plural(g.students, "студент", "студента", "студентов")}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">Текст рассылки</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_BODY_LEN}
          rows={5}
          placeholder="Например: занятие перенесено, что подготовить, к какому сроку"
          className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-base outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
        />
        <span className="mt-1 block text-right text-xs text-slate-400">
          {text.length} / {MAX_BODY_LEN}
        </span>
      </label>

      <p className="mt-2 text-sm text-slate-600" aria-live="polite">
        {picked.length > 0 ? `Получат: ${total} ${plural(total, "студент", "студента", "студентов")}` : "Выберите хотя бы одну группу."}
      </p>

      <button
        type="button"
        disabled={!canSend}
        onClick={() => setStep("confirm")}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
      >
        <Megaphone className="size-5" aria-hidden="true" />
        Продолжить
      </button>
    </div>
  );
}

/** Раздел «Мои рассылки» внизу списка диалогов преподавателя */
export function MyBroadcasts({ items }: { items: BroadcastItem[] }) {
  const [open, setOpen] = useState<BroadcastItem | null>(null);
  return (
    <section className="border-t border-slate-100 py-2">
      <h2 className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Мои рассылки</h2>
      {items.length === 0 ? (
        <p className="px-4 pb-3 text-sm text-slate-500">Рассылок пока не было.</p>
      ) : (
        <ul>
          {items.slice(0, 5).map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => setOpen(b)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <Megaphone className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">{b.groups}</span>
                    <span className="shrink-0 text-xs text-slate-400">{listTime(b.createdAt)}</span>
                  </span>
                  <span className="block truncate text-sm text-slate-500">{b.body}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <BroadcastDetail b={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function BroadcastDetail({ b, onClose }: { b: BroadcastItem; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canDelete = b.deletableUntil !== null && new Date(b.deletableUntil).getTime() > Date.now();

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/messages/broadcast/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcastId: b.id }),
      });
      if (!res.ok) {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Не удалось удалить рассылку.");
        setBusy(false);
        return;
      }
      notifyMessagesChanged();
      onClose();
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
      setBusy(false);
    }
  }

  return (
    <Modal title="Рассылка" onClose={onClose}>
      <p className="text-sm text-slate-500">
        {b.groups} · {b.recipients} {plural(b.recipients, "получатель", "получателя", "получателей")} · {new Date(b.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })}
      </p>
      <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-[15px] leading-relaxed">{b.body}</p>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {canDelete ? (
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 px-5 font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
        >
          <Trash2 className="size-5" aria-hidden="true" />
          Удалить у всех получателей
        </button>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Удалить рассылку можно только в течение 5 минут после отправки.</p>
      )}
    </Modal>
  );
}
