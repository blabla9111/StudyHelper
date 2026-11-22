"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Download, Loader2, TriangleAlert, XCircle } from "lucide-react";
import type { RequestStatus } from "@/lib/request-catalog";

async function post(url: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Не удалось выполнить действие.";
  } catch {
    return "Нет связи с сервером. Повторите попытку.";
  }
}

const NEXT_LABEL: Record<string, string> = {
  accepted: "Взять в работу",
  reviewing: "Подписать",
  signed: "Отметить готовой",
};

export function RequestActions({
  id,
  status,
  role,
  pdfReady,
  verifyCode,
}: {
  id: number;
  status: RequestStatus;
  role: "student" | "staff";
  pdfReady: boolean;
  verifyCode: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"next" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const final = status === "ready" || status === "rejected";

  async function advance() {
    setPending("next");
    setError(null);
    const err = await post("/api/requests/status", { id });
    setPending(null);
    if (err) setError(err);
    else router.refresh();
  }
  async function reject() {
    setPending("reject");
    setError(null);
    const err = await post("/api/requests/reject", { id, reason });
    setPending(null);
    if (err) setError(err);
    else {
      setRejecting(false);
      router.refresh();
    }
  }

  const btn = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-60";
  const spinner = <Loader2 className="size-4 animate-spin" aria-hidden="true" />;

  return (
    <div className="flex flex-col gap-3">
      {pdfReady && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <a href={`/api/requests/${id}/pdf`} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>
            <Download className="size-4" aria-hidden="true" /> Скачать PDF
          </a>
          {verifyCode && (
            <a href={`/verify/${verifyCode}`} target="_blank" rel="noopener noreferrer" className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>
              <BadgeCheck className="size-4" aria-hidden="true" /> Проверить подлинность
            </a>
          )}
        </div>
      )}

      {role === "staff" && !final && !rejecting && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={advance} disabled={pending !== null} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>
            {pending === "next" && spinner} {NEXT_LABEL[status]}
          </button>
          <button type="button" onClick={() => setRejecting(true)} className={`${btn} border border-rose-300 text-rose-700 hover:bg-rose-50`}>
            <XCircle className="size-4" aria-hidden="true" /> Отклонить
          </button>
        </div>
      )}

      {role === "staff" && rejecting && (
        <form
          className="flex flex-col gap-2.5 rounded-xl border border-rose-200 bg-rose-50/50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            reject();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Причина отказа (её увидит студент)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={300} rows={3} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setRejecting(false)} className={`${btn} flex-1 border border-slate-300 bg-white text-slate-700`}>Назад</button>
            <button type="submit" disabled={pending !== null || !reason.trim()} className={`${btn} flex-1 bg-rose-600 text-white hover:bg-rose-700`}>
              {pending === "reject" && spinner} Отклонить заявку
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
}
