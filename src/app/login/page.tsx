import { redirect } from "next/navigation";
import { CalendarCheck, Bell, FileCheck2, MessageSquare } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { DEMO_ACCOUNTS, demoModeEnabled } from "@/lib/demo";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { ConceptStrip } from "@/components/ConceptStrip";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Вход" };

export const dynamic = "force-dynamic";

const POINTS = [
  { icon: CalendarCheck, text: "Расписание и изменения в нём — на одном экране" },
  { icon: FileCheck2, text: "Справки и заявления с понятным статусом" },
  { icon: Bell, text: "Объявления деканата и дедлайны без чатов и почты" },
  { icon: MessageSquare, text: "Общение с преподавателями и группой внутри кабинета" },
];

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  const demo = demoModeEnabled()
    ? DEMO_ACCOUNTS.map(({ login, password, role, fullName, note }) => ({ login, password, role, fullName, note }))
    : [];

  return (
    <div className="flex min-h-dvh flex-col">
      <ConceptStrip />
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-2">
        <section className="hidden flex-col justify-between bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 p-12 text-white lg:flex">
          <Logo light />
          <div>
            <h2 className="max-w-md text-4xl font-bold leading-tight tracking-tight">Весь деканат — в одном месте</h2>
            <p className="mt-4 max-w-md text-lg text-brand-100">
              Учёба, документы и связь с деканатом в одном кабинете, который удобно открывать с телефона.
            </p>
            <ul className="mt-8 flex max-w-md flex-col gap-4">
              {POINTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-brand-50">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-brand-200">
            {BRAND.university} — вымышленный вуз для демонстрации концепта.
          </p>
        </section>

        <main id="main" className="flex min-w-0 flex-col items-center px-5 py-8 sm:px-8 lg:justify-center">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <LoginForm demoAccounts={demo} />
        </main>
      </div>
    </div>
  );
}
