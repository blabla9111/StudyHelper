"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Search } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { plural } from "@/lib/schedule";
import { REQUEST_KINDS, searchKinds } from "@/lib/request-catalog";

const EXAMPLES = ["военкомат", "стипендия", "работа", "академический отпуск"];

export function CatalogSearch() {
  const [q, setQ] = useState("");
  const list = q.trim() ? searchKinds(q) : REQUEST_KINDS;
  const certs = list.filter((k) => k.category === "certificate");
  const statements = list.filter((k) => k.category === "statement");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label htmlFor="catalog-q" className="sr-only">Поиск по ситуации</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id="catalog-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Что нужно? Например, «справка в военкомат»"
            className="h-14 w-full rounded-2xl border border-slate-300 bg-white pl-12 pr-4 text-base outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
          />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => setQ(e)} className="min-h-9 rounded-full bg-slate-100 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-200">
              {e}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white py-8">
          <EmptyState icon={<Search className="size-7" />} title="Ничего не нашлось">
            Попробуйте другое слово или выберите «Справка по месту требования».
          </EmptyState>
        </div>
      )}

      {certs.length > 0 && <Group title="Справки" items={certs} />}
      {statements.length > 0 && <Group title="Заявления" items={statements} />}
    </div>
  );
}

function Group({ title, items }: { title: string; items: typeof REQUEST_KINDS }) {
  return (
    <section>
      <h2 className="mb-2.5 text-lg font-bold">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((k) => (
          <li key={k.id}>
            <Link href={`/requests/new/${k.id}`} className="flex h-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <FileText className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-snug">{k.title}</span>
                <span className="mt-0.5 block text-sm text-slate-600">{k.description}</span>
                <span className="mt-1.5 block text-xs text-slate-500">
                  Срок: до {k.days} {plural(k.days, "дня", "дней", "дней")} · {k.pdfAllowed ? "PDF или бумага" : "выдаётся в деканате"}
                </span>
              </span>
              <ArrowRight className="mt-1 size-4 shrink-0 text-slate-400" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
