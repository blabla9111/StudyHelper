"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, LockOpen, TriangleAlert } from "lucide-react";
import { Modal } from "./Modal";
import { ResultName } from "./Short";
import { MAX_POINTS, examPartLabel, finalResult, type ControlType } from "@/lib/grades";
import { formatDayMonth } from "@/lib/schedule";

interface Row {
  studentId: number;
  fullName: string;
  kt1: number | null;
  kt2: number | null;
  exam: number | null;
}

type Field = "kt1" | "kt2" | "exam";
type Draft = Record<number, Record<Field, string>>;

const toDraft = (rows: Row[]): Draft =>
  Object.fromEntries(
    rows.map((r) => [r.studentId, { kt1: r.kt1?.toString() ?? "", kt2: r.kt2?.toString() ?? "", exam: r.exam?.toString() ?? "" }]),
  );

function parse(value: string, max: number): { value: number | null; error: boolean } {
  const v = value.trim();
  if (v === "") return { value: null, error: false };
  if (!/^\d{1,3}$/.test(v)) return { value: null, error: true };
  const n = Number(v);
  return n > max ? { value: null, error: true } : { value: n, error: false };
}

const COLS = "@4xl:grid-cols-[minmax(0,1fr)_6rem_6rem_6rem_4.5rem_10rem]";

export function GradebookEditor({
  disciplineId,
  control,
  closedAt,
  rows,
}: {
  disciplineId: number;
  control: ControlType;
  closedAt: string | null;
  rows: Row[];
}) {
  const router = useRouter();
  const closed = closedAt !== null;
  const [draft, setDraft] = useState<Draft>(() => toDraft(rows));
  const [saved, setSaved] = useState<Draft>(() => toDraft(rows));
  const [pending, setPending] = useState<"save" | "close" | "reopen" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  const computed = useMemo(
    () =>
      rows.map((r) => {
        const d = draft[r.studentId];
        const kt1 = parse(d.kt1, MAX_POINTS.kt1);
        const kt2 = parse(d.kt2, MAX_POINTS.kt2);
        const exam = parse(d.exam, MAX_POINTS.exam);
        const complete = kt1.value !== null && kt2.value !== null && exam.value !== null;
        const total = [kt1.value, kt2.value, exam.value].reduce<number>((s, x) => s + (x ?? 0), 0);
        const any = kt1.value !== null || kt2.value !== null || exam.value !== null;
        return { r, kt1, kt2, exam, complete, total: any ? total : null, hasError: kt1.error || kt2.error || exam.error };
      }),
    [rows, draft],
  );

  const hasErrors = computed.some((c) => c.hasError);
  const incomplete = computed.filter((c) => !c.complete).length;

  function set(studentId: number, field: Field, value: string) {
    setMessage(null);
    setDraft((prev) => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value.replace(/\s/g, "") } }));
  }

  async function post(path: string, body?: unknown) {
    const res = await fetch(`/api/gradebooks/${disciplineId}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, error: data.error };
  }

  async function save(): Promise<boolean> {
    setPending("save");
    setMessage(null);
    try {
      const payload = {
        rows: computed.map((c) => ({ studentId: c.r.studentId, kt1: c.kt1.value, kt2: c.kt2.value, exam: c.exam.value })),
      };
      const res = await post("", payload);
      if (!res.ok) {
        setMessage({ kind: "error", text: res.error ?? "Не удалось сохранить." });
        return false;
      }
      setSaved(draft);
      setMessage({ kind: "ok", text: "Баллы сохранены. Студенты видят их в своей зачётке." });
      return true;
    } catch {
      setMessage({ kind: "error", text: "Нет связи с сервером. Повторите попытку." });
      return false;
    } finally {
      setPending(null);
    }
  }

  async function close() {
    setConfirming(false);
    if (dirty && !(await save())) return;
    setPending("close");
    try {
      const res = await post("/close");
      if (!res.ok) {
        setMessage({ kind: "error", text: res.error ?? "Не удалось закрыть ведомость." });
        setPending(null);
        return;
      }
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Нет связи с сервером. Повторите попытку." });
      setPending(null);
    }
  }

  async function reopen() {
    setPending("reopen");
    try {
      const res = await post("/reopen");
      if (!res.ok) {
        setMessage({ kind: "error", text: res.error ?? "Не удалось открыть ведомость." });
        setPending(null);
        return;
      }
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Нет связи с сервером. Повторите попытку." });
      setPending(null);
    }
  }

  const inputCls = (error: boolean) =>
    `h-12 w-full rounded-xl border bg-white px-3 text-center text-base tabular-nums outline-none transition disabled:bg-slate-50 disabled:text-slate-500 @4xl:h-11 ${
      error ? "border-rose-400 focus:ring-4 focus:ring-rose-100" : "border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
    }`;

  return (
    <div className="contents">
      {closed ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span>
              Ведомость закрыта {formatDayMonth(closedAt.slice(0, 10))}. Студенты видят итоговые оценки.
            </span>
          </p>
          <button
            type="button"
            onClick={reopen}
            disabled={pending !== null}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
          >
            {pending === "reopen" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <LockOpen className="size-4" aria-hidden="true" />}
            Открыть для правок
          </button>
        </div>
      ) : (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Ведомость открыта. Сохранённые баллы видны студентам сразу, а итоговые оценки появятся после закрытия ведомости.
        </p>
      )}

      <section className="@container overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`hidden gap-3 border-b border-slate-100 px-5 py-3 text-sm text-slate-500 @4xl:grid ${COLS}`} aria-hidden="true">
          <span>Студент</span>
          <span className="text-center">КТ 1 (до {MAX_POINTS.kt1})</span>
          <span className="text-center">КТ 2 (до {MAX_POINTS.kt2})</span>
          <span className="text-center">{examPartLabel(control)} (до {MAX_POINTS.exam})</span>
          <span className="text-center">Сумма</span>
          <span>Итог</span>
        </div>

        <ul className="divide-y divide-slate-100">
          {computed.map(({ r, kt1, kt2, exam, complete, total }) => {
            const res = complete && total !== null ? finalResult(control, total) : null;
            const d = draft[r.studentId];
            return (
              <li key={r.studentId} className={`flex flex-col gap-3 px-4 py-3.5 @4xl:grid @4xl:items-center @4xl:gap-3 @4xl:px-5 @4xl:py-2.5 ${COLS}`}>
                <p className="font-semibold leading-snug text-slate-900">{r.fullName}</p>

                <div className="grid grid-cols-3 gap-2 @4xl:contents">
                  {(
                    [
                      ["kt1", kt1, `КТ 1 (до ${MAX_POINTS.kt1})`, "КТ 1"],
                      ["kt2", kt2, `КТ 2 (до ${MAX_POINTS.kt2})`, "КТ 2"],
                      ["exam", exam, `${examPartLabel(control)} (до ${MAX_POINTS.exam})`, examPartLabel(control)],
                    ] as const
                  ).map(([field, parsed, label, short]) => (
                    <label key={field} className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500 @4xl:sr-only">{short}</span>
                      <input
                        aria-label={`${r.fullName}: ${label}`}
                        inputMode="numeric"
                        autoComplete="off"
                        value={d[field]}
                        disabled={closed}
                        onChange={(e) => set(r.studentId, field, e.target.value)}
                        aria-invalid={parsed.error}
                        placeholder="—"
                        className={inputCls(parsed.error)}
                      />
                    </label>
                  ))}
                </div>

                <p className="flex items-center gap-2 text-sm @4xl:contents">
                  <span className="text-slate-500 @4xl:hidden">Сумма:</span>
                  <span className="font-semibold tabular-nums @4xl:text-center">{total ?? "—"}</span>
                  <span className="@4xl:block">
                    {res ? (
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${res.passed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"}`}>
                        <ResultName control={control} result={res} />
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">ждёт баллов</span>
                    )}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm ${message.kind === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`}
        >
          {message.kind === "error" ? <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {message.text}
        </p>
      )}
      {hasErrors && !closed && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Баллы должны быть целыми числами: контрольные точки до {MAX_POINTS.kt1}, {examPartLabel(control).toLowerCase()} до {MAX_POINTS.exam}.
        </p>
      )}

      {!closed && (
        <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col gap-1.5 md:bottom-4">
          {incomplete > 0 && (
            <p className="rounded-xl bg-white/95 px-3 py-1.5 text-center text-xs text-slate-500 shadow-sm backdrop-blur sm:text-right">
              Чтобы закрыть ведомость, заполните баллы у всех: осталось {incomplete}.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur sm:ml-auto sm:flex">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || hasErrors || pending !== null}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand-600 px-5 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending === "save" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={hasErrors || incomplete > 0 || pending !== null}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending === "close" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Закрыть ведомость
            </button>
          </div>
        </div>
      )}

      {confirming && (
        <Modal title="Закрыть ведомость?" onClose={() => setConfirming(false)}>
          <p className="text-slate-600">
            Студенты получат итоговые оценки и уведомления со своим результатом. Закрытую ведомость можно будет открыть для правок.
          </p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} className="min-h-12 flex-1 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Отмена
            </button>
            <button type="button" onClick={close} className="min-h-12 flex-1 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700">
              Закрыть
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
