"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { AUDIENCE_LABEL, type AudienceType } from "@/lib/announcements";

const field = "h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100";

const ACTIONS = [
  { label: "Заказать справку", href: "/requests/new" },
  { label: "Подать заявление на материальную помощь", href: "/requests/new/material_aid" },
  { label: "Открыть расписание", href: "/schedule" },
];

export function AnnouncementForm({ groups, courses, directions }: { groups: string[]; courses: number[]; directions: string[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<AudienceType>("all");
  const [value, setValue] = useState("");
  const [needsAction, setNeedsAction] = useState(false);
  const [action, setAction] = useState(0);
  const [validUntil, setValidUntil] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const options = type === "group" ? groups : type === "course" ? courses.map(String) : type === "direction" ? directions : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          audienceType: type,
          audienceValue: value,
          needsAction,
          actionLabel: ACTIONS[action].label,
          actionHref: ACTIONS[action].href,
          validUntil: validUntil || null,
        }),
      });
      if (res.ok) {
        setTitle("");
        setBody("");
        setDone(true);
        router.refresh();
      } else {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Не удалось опубликовать.");
      }
    } catch {
      setError("Нет связи с сервером. Повторите попытку.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-bold">Новое объявление</h2>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Заголовок</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Текст</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={1000} rows={4} className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-base outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Кому</span>
          <select value={type} onChange={(e) => { setType(e.target.value as AudienceType); setValue(""); }} className={field}>
            {(Object.keys(AUDIENCE_LABEL) as AudienceType[]).map((t) => (
              <option key={t} value={t}>{AUDIENCE_LABEL[t]}</option>
            ))}
          </select>
        </label>
        {type !== "all" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">{AUDIENCE_LABEL[type]}</span>
            <select value={value} onChange={(e) => setValue(e.target.value)} required className={field}>
              <option value="" disabled>Выберите…</option>
              {options.map((o) => (
                <option key={o} value={o}>{type === "course" ? `${o} курс` : o}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={needsAction} onChange={(e) => setNeedsAction(e.target.checked)} className="size-5 accent-brand-600" />
        <span className="text-[15px] font-medium">Нужно действие от студентов</span>
      </label>
      {needsAction && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Кнопка в объявлении</span>
          <select value={action} onChange={(e) => setAction(Number(e.target.value))} className={field}>
            {ACTIONS.map((a, i) => (
              <option key={a.href} value={i}>{a.label}</option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Показывать до (необязательно)</span>
        <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={field} />
      </label>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
      {done && <p className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">Опубликовано. Студенты получили уведомление.</p>}
      <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Опубликовать
      </button>
    </form>
  );
}
