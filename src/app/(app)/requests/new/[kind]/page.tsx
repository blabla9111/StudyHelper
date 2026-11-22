import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { kindById } from "@/lib/request-catalog";
import { plural } from "@/lib/schedule";
import { RequestForm } from "@/components/requests/RequestForm";

export const metadata = { title: "Новая заявка" };

export default async function NewRequestFormPage({ params }: { params: Promise<{ kind: string }> }) {
  const user = await requireUser(["student"]);
  const kind = kindById((await params).kind);
  if (!kind) notFound();

  // Данные берутся из профиля вошедшего студента
  const p = getDb()
    .prepare(
      `SELECT g.name AS "group", g.course, g.direction, sp.record_book AS recordBook
         FROM student_profiles sp JOIN groups g ON g.id = sp.group_id WHERE sp.user_id = ?`,
    )
    .get(user.id) as { group: string; course: number; direction: string; recordBook: string } | undefined;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <Link href="/requests/new" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ChevronLeft className="size-4" aria-hidden="true" /> Каталог
        </Link>
        <h1 className="text-2xl font-bold leading-snug tracking-tight sm:text-3xl">{kind.title}</h1>
        <p className="mt-1 text-slate-600">{kind.description}</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Ваши данные">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Данные из профиля</h2>
        <dl className="divide-y divide-slate-100 text-[15px]">
          {[
            ["ФИО", user.fullName],
            ["Группа", p ? `${p.group}, ${p.course} курс` : "—"],
            ["Направление", p?.direction ?? "—"],
            ["Номер зачётки", p?.recordBook ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2">
              <dt className="shrink-0 text-slate-500">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-slate-500">Если данные неверны, обратитесь в деканат. Изменить их здесь нельзя.</p>
      </section>

      <RequestForm kind={kind} />
      <p className="text-center text-xs text-slate-500">Ожидаемый срок: до {kind.days} {plural(kind.days, "дня", "дней", "дней")}.</p>
    </div>
  );
}
