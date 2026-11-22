"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { DELIVERY_LABEL, type Delivery, type RequestKind } from "@/lib/request-catalog";

const field = "h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100";

export function RequestForm({ kind }: { kind: RequestKind }) {
  const router = useRouter();
  const [delivery, setDelivery] = useState<Delivery>(kind.pdfAllowed ? "pdf" : "paper");
  const [purpose, setPurpose] = useState(kind.purposePrefill ?? "");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ purpose?: string; note?: string }>({});
  const uid = useId();
  const purposeId = `${uid}-purpose`;
  const noteId = `${uid}-note`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: { purpose?: string; note?: string } = {};
    if (kind.purposeLabel && kind.purposeRequired && !purpose.trim()) errs.purpose = "Укажите, куда предоставляется справка.";
    if (kind.noteRequired && !note.trim()) errs.note = "Заполните это поле: оно нужно деканату для проверки заявки.";
    setFieldErrors(errs);
    if (errs.purpose || errs.note) {
      document.getElementById(errs.purpose ? purposeId : noteId)?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: kind.id, delivery, purpose, note }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: number; error?: string };
      if (res.ok && data.id) {
        router.push(`/requests/${data.id}`);
        router.refresh();
        return;
      }
      setError(data.error ?? "Не удалось отправить заявку.");
    } catch {
      setError("Нет связи с сервером. Повторите попытку.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {kind.pdfAllowed ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Формат справки</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["pdf", "paper"] as Delivery[]).map((d) => (
              <label
                key={d}
                htmlFor={`${uid}-d-${d}`}
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 ${delivery === d ? "border-brand-600 bg-brand-50" : "border-slate-300 hover:bg-slate-50"}`}
              >
                <input id={`${uid}-d-${d}`} type="radio" name="delivery" value={d} checked={delivery === d} onChange={() => setDelivery(d)} aria-describedby={`${uid}-d-${d}-hint`} className="size-5 accent-brand-600" />
                <span>
                  <span className="block text-[15px] font-semibold">{DELIVERY_LABEL[d]}</span>
                  <span id={`${uid}-d-${d}-hint`} className="block text-xs text-slate-500">{d === "pdf" ? "С QR-кодом, скачать сразу" : "Забрать в деканате"}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">Решение по заявлению выдаётся в деканате.</p>
      )}

      {kind.purposeLabel && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={purposeId} className="text-sm font-medium text-slate-700">
            {kind.purposeLabel}
            {kind.purposeRequired ? "" : " (необязательно)"}
          </label>
          <input
            id={purposeId}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            maxLength={200}
            aria-required={kind.purposeRequired}
            aria-invalid={!!fieldErrors.purpose}
            aria-describedby={`${purposeId}-count${fieldErrors.purpose ? ` ${purposeId}-err` : ""}`}
            className={field}
          />
          <FieldMeta id={purposeId} error={fieldErrors.purpose} length={purpose.length} max={200} />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={noteId} className="text-sm font-medium text-slate-700">{kind.noteLabel}</label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          aria-required={kind.noteRequired}
          aria-invalid={!!fieldErrors.note}
          aria-describedby={`${noteId}-count${fieldErrors.note ? ` ${noteId}-err` : ""}`}
          className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-base outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
        />
        <FieldMeta id={noteId} error={fieldErrors.note} length={note.length} max={500} />
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      <button type="submit" disabled={pending} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Отправить заявку
      </button>
    </form>
  );
}

/** Под полем: своё сообщение об ошибке и счётчик «N / лимит» */
function FieldMeta({ id, error, length, max }: { id: string; error?: string; length: number; max: number }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <p id={`${id}-err`} className="text-sm text-rose-700" role={error ? "alert" : undefined}>
        {error}
      </p>
      <p id={`${id}-count`} className={`ml-auto shrink-0 text-xs tabular-nums ${length >= max ? "font-semibold text-rose-700" : "text-slate-500"}`}>
        {length} / {max}
      </p>
    </div>
  );
}
