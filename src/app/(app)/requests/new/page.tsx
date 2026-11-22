import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { CatalogSearch } from "@/components/requests/CatalogSearch";

export const metadata = { title: "Новая заявка" };

export default async function NewRequestPage() {
  await requireUser(["student"]);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/requests" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ChevronLeft className="size-4" aria-hidden="true" /> Заявки
        </Link>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Новая заявка</h1>
        <p className="mt-1 text-slate-600">Выберите справку или найдите её по ситуации.</p>
      </div>
      <CatalogSearch />
    </div>
  );
}
