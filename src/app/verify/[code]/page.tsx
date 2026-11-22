import type { Metadata } from "next";
import { BadgeCheck, SearchX } from "lucide-react";
import { getDb } from "@/lib/db";
import { Logo } from "@/components/Logo";
import { formatDayMonth, todayIso } from "@/lib/schedule";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Проверка справки · StudyHelper", robots: { index: false, follow: false } };

interface Found {
  title: string;
  code: string;
  fullName: string;
  issued: string;
  validUntil: string | null;
}

// Общедоступная страница проверки: открывается по QR-коду без входа.
// Показывает только то, что нужно для проверки: вид справки, номер, дату, срок и сокращённое ФИО.
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let found: Found | null = null;

  if (/^[a-f0-9]{16}$/.test(code)) {
    const r = getDb()
      .prepare(
        `SELECT r.title, r.code, r.valid_until AS validUntil, r.updated_at AS updatedAt, u.full_name AS fullName,
                (SELECT at FROM request_events e WHERE e.request_id = r.id AND e.status = 'ready' ORDER BY at DESC LIMIT 1) AS readyAt
           FROM requests r JOIN users u ON u.id = r.student_id
          WHERE r.verify_code = ? AND r.status = 'ready' AND r.delivery = 'pdf'`,
      )
      .get(code) as { title: string; code: string; validUntil: string | null; updatedAt: string; fullName: string; readyAt: string | null } | undefined;
    if (r) {
      const [last, first, middle] = r.fullName.split(/\s+/);
      found = {
        title: r.title,
        code: r.code,
        fullName: `${last} ${first?.[0] ?? ""}.${middle ? ` ${middle[0]}.` : ""}`,
        issued: (r.readyAt ?? r.updatedAt).slice(0, 10),
        validUntil: r.validUntil,
      };
    }
  }

  const expired = found?.validUntil ? found.validUntil < todayIso() : false;

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-5 py-8">
      <Logo />
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {found ? (
          <>
            <div className={`mb-4 inline-flex size-14 items-center justify-center rounded-full ${expired ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
              <BadgeCheck className="size-8" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold leading-snug">{expired ? "Справка подлинна, но срок действия истёк" : "Справка подлинна"}</h1>
            <p className="mt-2 text-slate-600">
              Выдана {formatDayMonth(found.issued)} {found.issued.slice(0, 4)} г.
              {found.validUntil && ` Действительна до ${formatDayMonth(found.validUntil)} ${found.validUntil.slice(0, 4)} г.`}
            </p>
            <dl className="mt-5 divide-y divide-slate-100 text-[15px]">
              <div className="flex justify-between gap-4 py-2.5"><dt className="text-slate-500">Документ</dt><dd className="text-right font-medium">{found.title}</dd></div>
              <div className="flex justify-between gap-4 py-2.5"><dt className="text-slate-500">Номер</dt><dd className="font-medium">{found.code}</dd></div>
              <div className="flex justify-between gap-4 py-2.5"><dt className="text-slate-500">Выдана</dt><dd className="font-medium">{found.fullName}</dd></div>
            </dl>
          </>
        ) : (
          <>
            <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-rose-100 text-rose-700">
              <SearchX className="size-8" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold leading-snug">Справка не найдена</h1>
            <p className="mt-2 text-slate-600">
              Такой справки в системе нет или она ещё не готова. Проверьте, что QR-код отсканирован полностью.
            </p>
          </>
        )}
      </div>
      <p className="text-center text-xs leading-relaxed text-slate-500">
        StudyHelper — учебный концепт для конкурса, а не официальный сервис вуза. Все данные вымышленные.
      </p>
    </main>
  );
}
