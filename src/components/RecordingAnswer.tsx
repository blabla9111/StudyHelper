"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";

const OPTIONS = [
  { v: "will_record", label: "Запишу", cls: "bg-emerald-700 text-white hover:bg-emerald-800" },
  { v: "will_send_notes", label: "Пришлю конспект", cls: "bg-brand-600 text-white hover:bg-brand-700" },
  { v: "declined", label: "Не получится", cls: "border border-rose-300 text-rose-700 hover:bg-rose-50" },
] as const;

export type AnswerTarget = { id: number } | { lessonId: number; date: string; all: boolean };

/** Ответ на запрос записи: на один запрос ({ id }) или сразу на все запросы одной пары */
export function RecordingAnswer({
  target,
  current,
  currentComment,
  commentLabel = "Комментарий студенту",
}: {
  target: AnswerTarget;
  current: string | null;
  currentComment: string | null;
  commentLabel?: string;
}) {
  const router = useRouter();
  const [comment, setComment] = useState(currentComment ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(status: string) {
    setPending(status);
    setError(null);
    try {
      const res = await fetch("/api/recording-requests/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, status, comment }),
      });
      if (res.ok) router.refresh();
      else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Не удалось отправить ответ.");
    } catch {
      setError("Нет связи с сервером. Повторите попытку.");
    }
    setPending(null);
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">{commentLabel} (для отказа обязателен)</span>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
        />
      </label>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => answer(o.v)}
            disabled={pending !== null}
            aria-pressed={current === o.v}
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold disabled:opacity-60 ${o.cls} ${current === o.v ? "ring-4 ring-slate-300" : ""}`}
          >
            {pending === o.v && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} {o.label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
}
