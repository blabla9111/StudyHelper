import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white py-8 shadow-sm">
        <EmptyState icon={<Compass className="size-7" />} title="Такой страницы нет">
          Возможно, ссылка устарела или в ней опечатка.
        </EmptyState>
        <div className="flex justify-center">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700">
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
