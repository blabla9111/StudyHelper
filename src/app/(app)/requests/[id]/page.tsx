import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DELIVERY_LABEL, kindById, REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/request-catalog";
import { REQUEST_SELECT, type RequestRow } from "@/lib/requests-data";
import { formatDayMonth } from "@/lib/schedule";
import { RequestActions } from "@/components/requests/RequestActions";
import { Tracker } from "@/components/requests/Tracker";

export const metadata = { title: "Заявка" };

export const dynamic = "force-dynamic";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["student", "staff"]);
  const { id } = await params;
  const db = getDb();
  const r = db.prepare(`${REQUEST_SELECT} WHERE id = ?`).get(Number(id)) as RequestRow | undefined;
  // Чужая заявка выглядит как несуществующая
  if (!r || (user.role === "student" && r.studentId !== user.id)) notFound();

  const kind = kindById(r.kind);
  const events = db.prepare("SELECT status, at, comment FROM request_events WHERE request_id = ? ORDER BY at").all(r.id) as {
    status: RequestStatus;
    at: string;
    comment: string | null;
  }[];
  const dates: Partial<Record<RequestStatus, string>> = {};
  for (const e of events) dates[e.status] = formatDayMonth(e.at.slice(0, 10));

  const owner = db
    .prepare(
      `SELECT u.full_name AS name, g.name AS "group", g.course, sp.record_book AS recordBook
         FROM users u JOIN student_profiles sp ON sp.user_id = u.id JOIN groups g ON g.id = sp.group_id WHERE u.id = ?`,
    )
    .get(r.studentId) as { name: string; group: string; course: number; recordBook: string };

  const pdfReady = r.status === "ready" && r.delivery === "pdf" && kind?.category === "certificate";
  const rows: [string, string][] = [
    ["Номер", r.code],
    ["Формат", DELIVERY_LABEL[r.delivery]],
    ["Статус", REQUEST_STATUS_LABEL[r.status]],
    ["Подана", formatDayMonth(r.createdAt.slice(0, 10))],
  ];
  if (r.status !== "ready" && r.status !== "rejected") rows.push(["Ожидаемый срок", formatDayMonth(r.expectedAt)]);
  if (r.validUntil) rows.push(["Действительна до", formatDayMonth(r.validUntil)]);
  if (r.purpose) rows.push(["Куда предоставляется", r.purpose]);
  if (user.role === "staff") rows.unshift(["Студент", `${owner.name}, ${owner.group}, ${owner.course} курс`], ["Номер зачётки", owner.recordBook]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <Link href="/requests" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ChevronLeft className="size-4" aria-hidden="true" /> Заявки
        </Link>
        <h1 className="text-2xl font-bold leading-snug tracking-tight sm:text-3xl">{r.title}</h1>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Статус заявки">
        <Tracker status={r.status} dates={dates} />
        {r.status === "rejected" && r.rejectReason && (
          <p className="mt-4 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-800">Причина отказа: {r.rejectReason}</p>
        )}
        {r.status === "ready" && r.delivery === "paper" && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900">Готова. Заберите в деканате (ауд. 101, адрес вымышленный), с собой нужен студенческий билет.</p>
        )}
        {pdfReady && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900">Электронная справка готова. В PDF есть QR-код: по нему можно проверить подлинность.</p>
        )}
      </section>

      <RequestActions
        id={r.id}
        status={r.status}
        role={user.role === "staff" ? "staff" : "student"}
        pdfReady={pdfReady}
        verifyCode={pdfReady ? r.verifyCode : null}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="divide-y divide-slate-100 text-[15px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="shrink-0 text-slate-500">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
          {r.note && (
            <div className="py-2.5">
              <dt className="text-slate-500">Комментарий студента</dt>
              <dd className="mt-1 font-medium">{r.note}</dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}
