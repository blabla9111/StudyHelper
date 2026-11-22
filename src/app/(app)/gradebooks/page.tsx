import Link from "next/link";
import { ChevronRight, ClipboardX } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { ControlType } from "@/lib/grades";
import { ControlName } from "@/components/Short";
import { formatDayMonth } from "@/lib/schedule";
import { EmptyState } from "@/components/EmptyState";

export const metadata = { title: "Ведомости" };

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  name: string;
  control: ControlType;
  semester: number;
  examDate: string | null;
  closedAt: string | null;
  groupName: string;
  students: number;
  complete: number;
}

const FILTERS = [
  { key: "open", label: "Открытые" },
  { key: "closed", label: "Закрытые" },
  { key: "all", label: "Все" },
] as const;

const COLS = "@4xl:grid-cols-[minmax(0,2.4fr)_6rem_minmax(0,1.5fr)_8rem_minmax(0,1.3fr)_7rem_1.5rem]";

export default async function GradebooksPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser(["teacher"]);
  const asked = (await searchParams).status;
  const status = FILTERS.some((f) => f.key === asked) ? (asked as (typeof FILTERS)[number]["key"]) : "open";

  // Только дисциплины, которые ведёт этот преподаватель
  const all = getDb()
    .prepare(
      `SELECT d.id, d.name, d.control_type AS control, d.semester, d.exam_date AS examDate,
              d.closed_at AS closedAt, g.name AS groupName,
              (SELECT COUNT(*) FROM student_profiles sp WHERE sp.group_id = d.group_id) AS students,
              (SELECT COUNT(*) FROM grades gr WHERE gr.discipline_id = d.id
                  AND gr.kt1 IS NOT NULL AND gr.kt2 IS NOT NULL AND gr.exam IS NOT NULL) AS complete
         FROM disciplines d JOIN groups g ON g.id = d.group_id
        WHERE d.teacher_id = ?
        ORDER BY d.closed_at IS NOT NULL, d.exam_date, d.name`,
    )
    .all(user.id) as Row[];

  const counts = { open: all.filter((r) => !r.closedAt).length, closed: all.filter((r) => r.closedAt).length, all: all.length };
  const rows = all.filter((r) => (status === "all" ? true : status === "open" ? !r.closedAt : !!r.closedAt));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Ведомости</h1>

      <nav aria-label="Фильтр ведомостей" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/gradebooks?status=${f.key}`}
            aria-current={status === f.key ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-[15px] font-medium ${
              status === f.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800 hover:bg-slate-200/70"
            }`}
          >
            {f.label}
            <span className={`rounded-full px-2 text-xs font-semibold ${status === f.key ? "bg-white/20" : "bg-white text-slate-600"}`}>
              {counts[f.key]}
            </span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-8 shadow-sm">
          <EmptyState icon={<ClipboardX className="size-7" />} title="Ведомостей нет">
            {status === "open" ? "Все ваши ведомости закрыты." : "В этом списке пока ничего нет."}
          </EmptyState>
        </div>
      ) : (
        <section className="@container overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className={`hidden gap-3 border-b border-slate-100 px-5 py-3 text-sm text-slate-500 @4xl:grid ${COLS}`} aria-hidden="true">
            <span>Название предмета</span>
            <span>Группа</span>
            <span>Тип контроля</span>
            <span>Заполнено</span>
            <span>Статус</span>
            <span>Дата экзамена</span>
            <span />
          </div>
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/gradebooks/${r.id}`} className="block px-4 py-4 transition-colors hover:bg-slate-50 @4xl:px-5">
                  <span className={`hidden items-center gap-3 @4xl:grid ${COLS}`}>
                    <span className="min-w-0 break-words font-semibold leading-snug text-slate-900">{r.name}</span>
                    <span className="min-w-0 break-words text-slate-700">{r.groupName}</span>
                    <span className="min-w-0 break-words text-slate-700"><ControlName control={r.control} /></span>
                    <span className="min-w-0 whitespace-nowrap tabular-nums text-slate-700">
                      {r.complete} из {r.students}
                    </span>
                    <span>
                      <StatusChip closed={!!r.closedAt} />
                    </span>
                    <span className="text-slate-700">{r.examDate ? formatDayMonth(r.examDate) : "—"}</span>
                    <ChevronRight className="size-5 text-slate-400" aria-hidden="true" />
                  </span>

                  <span className="flex items-start gap-3 @4xl:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug text-slate-900">{r.name}</span>
                      <span className="mt-0.5 block text-sm text-slate-500">
                        Группа {r.groupName} · <ControlName control={r.control} />
                        {r.examDate && ` · ${formatDayMonth(r.examDate)}`}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusChip closed={!!r.closedAt} />
                        <span className="text-sm tabular-nums text-slate-600">
                          Заполнено {r.complete} из {r.students}
                        </span>
                      </span>
                    </span>
                    <ChevronRight className="mt-1 size-5 shrink-0 text-slate-400" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StatusChip({ closed }: { closed: boolean }) {
  return closed ? (
    <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">Закрыта</span>
  ) : (
    <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Открыта</span>
  );
}
