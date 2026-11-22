import Link from "next/link";
import { Archive, FilePlus2, FileText, Inbox } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDayMonth } from "@/lib/schedule";
import { REQUEST_STATUS_LABEL, archiveCutoff, isArchivedRequest, type RequestStatus } from "@/lib/request-catalog";
import { EmptyState } from "@/components/EmptyState";
import { Tracker } from "@/components/requests/Tracker";

export const metadata = { title: "Заявки" };

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  title: string;
  code: string;
  status: RequestStatus;
  delivery: "pdf" | "paper";
  createdAt: string;
  updatedAt: string;
  expectedAt: string;
  student: string;
  groupName: string;
}

const SELECT = `SELECT r.id, r.title, r.code, r.status, r.delivery, r.created_at AS createdAt, r.updated_at AS updatedAt, r.expected_at AS expectedAt,
  u.full_name AS student, g.name AS groupName
  FROM requests r JOIN users u ON u.id = r.student_id
  JOIN student_profiles sp ON sp.user_id = u.id JOIN groups g ON g.id = sp.group_id`;

const STATUS_TONE: Record<RequestStatus, string> = {
  accepted: "bg-slate-100 text-slate-700",
  reviewing: "bg-amber-100 text-amber-800",
  signed: "bg-sky-100 text-sky-800",
  ready: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-700",
};

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ f?: string; tab?: string }> }) {
  const user = await requireUser(["student", "staff"]);
  const db = getDb();

  if (user.role === "student") {
    const all = db.prepare(`${SELECT} WHERE r.student_id = ? ORDER BY r.created_at DESC`).all(user.id) as Row[];
    // Готовые и отклонённые заявки старше месяца (считая от завершения) уходят в архив
    const cutoff = archiveCutoff();
    const archived = all.filter((r) => isArchivedRequest(r.status, r.updatedAt, cutoff)).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
    const current = all.filter((r) => !isArchivedRequest(r.status, r.updatedAt, cutoff));
    const inArchive = (await searchParams).tab === "archive";
    const rows = inArchive ? archived : current;
    const studentTabs = [
      { id: "current", label: "Актуальные", count: current.length, href: "/requests" },
      { id: "archive", label: "Архив", count: archived.length, href: "/requests?tab=archive" },
    ];

    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Заявки</h1>
          <Link href="/requests/new" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
            <FilePlus2 className="size-4" aria-hidden="true" /> Новая заявка
          </Link>
        </div>

        <nav aria-label="Раздел заявок" className="flex gap-2 overflow-x-auto">
          {studentTabs.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              aria-current={(t.id === "archive") === inArchive ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ${(t.id === "archive") === inArchive ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 text-xs ${(t.id === "archive") === inArchive ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{t.count}</span>
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-10 shadow-sm">
            {inArchive ? (
              <EmptyState icon={<Archive className="size-7" />} title="В архиве пока пусто">
                Сюда попадают готовые и отклонённые заявки, с которых прошёл месяц.
              </EmptyState>
            ) : (
              <EmptyState icon={<FileText className="size-7" />} title="Актуальных заявок нет">
                {archived.length > 0
                  ? "Старые готовые заявки лежат во вкладке «Архив». Закажите новую справку, если она нужна."
                  : "Закажите справку об обучении, в военкомат или для стипендии: она придёт в электронном виде."}
              </EmptyState>
            )}
          </div>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold leading-snug">{r.title}</p>
                      <p className="text-xs text-slate-500">№ {r.code} · {r.delivery === "pdf" ? "электронная" : "бумажная"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[r.status]}`}>{REQUEST_STATUS_LABEL[r.status]}</span>
                  </div>
                  <Tracker status={r.status} compact />
                  <p className="mt-3 text-xs text-slate-500">
                    Подана {formatDayMonth(r.createdAt.slice(0, 10))}
                    {inArchive
                      ? ` · ${r.status === "rejected" ? "отклонена" : "готова"} ${formatDayMonth(r.updatedAt.slice(0, 10))}`
                      : r.status !== "ready" && r.status !== "rejected" && ` · ожидаемый срок ${formatDayMonth(r.expectedAt)}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Деканат: очередь заявок всех студентов
  const f = (await searchParams).f;
  const filter = f === "done" || f === "all" ? f : "active";
  const where =
    filter === "active" ? "WHERE r.status IN ('accepted', 'reviewing', 'signed')" : filter === "done" ? "WHERE r.status IN ('ready', 'rejected')" : "";
  const rows = db.prepare(`${SELECT} ${where} ORDER BY r.created_at DESC LIMIT 100`).all() as Row[];
  const tabs = [
    { id: "active", label: "В работе" },
    { id: "done", label: "Завершённые" },
    { id: "all", label: "Все" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Заявки студентов</h1>
      <nav aria-label="Фильтр заявок" className="flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={t.id === "active" ? "/requests" : `/requests?f=${t.id}`}
            aria-current={filter === t.id ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold ${filter === t.id ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-10 shadow-sm">
          <EmptyState icon={<Inbox className="size-7" />} title={filter === "active" ? "Очередь пуста" : "Заявок нет"}>
            {filter === "active" ? "Все заявки обработаны." : "В этом списке пока ничего нет."}
          </EmptyState>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/requests/${r.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug">{r.title}</span>
                  <span className="block text-sm text-slate-600">{r.student} · {r.groupName}</span>
                  <span className="block text-xs text-slate-500">№ {r.code} · подана {formatDayMonth(r.createdAt.slice(0, 10))} · срок {formatDayMonth(r.expectedAt)}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[r.status]}`}>{REQUEST_STATUS_LABEL[r.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
