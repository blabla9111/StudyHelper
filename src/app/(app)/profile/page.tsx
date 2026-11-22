import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { LogoutButton } from "@/components/LogoutButton";

export const metadata = { title: "Профиль" };

export const dynamic = "force-dynamic";

interface StudentRow {
  faculty: string;
  direction: string;
  course: number;
  groupName: string;
  recordBook: string;
  studyForm: string;
}

interface EmployeeRow {
  department: string;
  position: string;
}

export default async function ProfilePage() {
  const user = await requireUser();
  const db = getDb();

  let rows: { label: string; value: string; href?: string; hint?: string }[] = [];

  if (user.role === "student") {
    // Профиль выбирается по id из сессии, а не из адреса страницы
    const s = db
      .prepare(
        `SELECT g.faculty, g.direction, g.course, g.name AS groupName,
                sp.record_book AS recordBook, sp.study_form AS studyForm
           FROM student_profiles sp JOIN groups g ON g.id = sp.group_id
          WHERE sp.user_id = ?`,
      )
      .get(user.id) as StudentRow | undefined;
    if (s) {
      rows = [
        { label: "Факультет", value: s.faculty },
        { label: "Направление", value: s.direction },
        { label: "Курс", value: `${s.course} курс` },
        { label: "Группа", value: s.groupName, href: "/group", hint: "Список одногруппников" },
        { label: "Номер зачётки", value: s.recordBook },
        { label: "Форма обучения", value: s.studyForm },
      ];
    }
  } else {
    const e = db
      .prepare("SELECT department, position FROM employee_profiles WHERE user_id = ?")
      .get(user.id) as EmployeeRow | undefined;
    if (e) {
      rows = [
        { label: user.role === "teacher" ? "Кафедра" : "Подразделение", value: e.department },
        { label: "Должность", value: e.position },
      ];
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Профиль</h1>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-4">
          <Avatar name={user.fullName} size="lg" />
          <div className="min-w-0">
            <p className="text-xl font-bold leading-tight sm:text-2xl">{user.fullName}</p>
            <p className="mt-1 text-slate-500">{ROLE_LABEL[user.role]}</p>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-100">
          {rows.map((r) => (
            <div key={r.label} className="py-3.5">
              {r.href ? (
                <Link
                  href={r.href}
                  className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 hover:bg-brand-50"
                >
                  <span className="min-w-0">
                    <dt className="text-sm text-slate-500">{r.label}</dt>
                    <dd className="font-semibold text-brand-700">{r.value}</dd>
                    {r.hint && <span className="text-xs text-slate-500">{r.hint}</span>}
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
                </Link>
              ) : (
                <>
                  <dt className="text-sm text-slate-500">{r.label}</dt>
                  <dd className="font-semibold text-slate-900">{r.value}</dd>
                </>
              )}
            </div>
          ))}
        </dl>
      </section>

      <div className="md:hidden">
        <LogoutButton className="w-full justify-center border border-slate-200 bg-white" />
      </div>
    </div>
  );
}
