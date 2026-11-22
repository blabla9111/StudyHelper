"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, Search, SearchX } from "lucide-react";
import { Avatar } from "./Avatar";
import { EmptyState } from "./EmptyState";

export interface GroupMember {
  id: number;
  fullName: string;
  isMe: boolean;
}

export function GroupList({ members }: { members: GroupMember[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  // «Написать»: открывает личный диалог с одногруппником (если его ещё нет, сервер создаёт его)
  async function write(id: number) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/messages/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: number; error?: string };
      if (res.ok && data.id) {
        router.push(`/messages/${data.id}`);
        return;
      }
      setError(data.error ?? "Не удалось открыть диалог.");
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
    }
    setBusy(null);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? members.filter((m) => m.fullName.toLowerCase().includes(q)) : members;
  }, [members, query]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-3">
        <label className="relative block">
          <span className="sr-only">Поиск по группе</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти одногруппника"
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-base outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="mx-3 mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={<SearchX className="size-7" />} title="Никого не нашли">
          Попробуйте изменить запрос.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100">
          {filtered.map((m) => (
            <li key={m.id} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
              <Avatar name={m.fullName} />
              <span className="min-w-0 flex-1 break-words font-medium leading-snug text-slate-900">{m.fullName}</span>
              {m.isMe ? (
                <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                  это вы
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => write(m.id)}
                  disabled={busy !== null}
                  aria-label={`Написать: ${m.fullName}`}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-brand-200 px-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-60"
                >
                  {busy === m.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <MessageSquare className="size-4" aria-hidden="true" />}
                  Написать
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
