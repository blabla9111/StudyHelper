"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SearchX } from "lucide-react";
import { Avatar } from "../Avatar";
import { EmptyState } from "../EmptyState";
import { Modal } from "../Modal";

interface Recipient {
  id: number;
  fullName: string;
  hint: string;
}
interface Block {
  title: string;
  items: Recipient[];
}

// Адресаты приходят уже отфильтрованными сервером: здесь только те, кому можно написать первым
export function NewMessageModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Новое сообщение" onClose={onClose}>
      <Picker onClose={onClose} />
    </Modal>
  );
}

function Picker({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/messages/recipients?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const data = (await res.json()) as { blocks: Block[]; note?: string };
        if (!cancelled) {
          setBlocks(data.blocks);
          setNote(data.note ?? "");
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, query ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  async function open(id: number) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/messages/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: number; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Не удалось открыть диалог.");
        setBusy(null);
        return;
      }
      onClose();
      router.push(`/messages/${data.id}`);
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
      setBusy(null);
    }
  }

  const empty = blocks !== null && blocks.every((b) => b.items.length === 0);

  return (
    <div>
      <label className="relative mb-3 block">
        <span className="sr-only">Поиск адресата</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Имя или группа"
          className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-base outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
        />
      </label>

      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {failed && blocks === null && <p className="py-6 text-center text-sm text-slate-500">Не удалось загрузить список. Закройте окно и попробуйте ещё раз.</p>}
      {blocks === null && !failed && (
        <div aria-busy="true" className="space-y-3 py-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="size-11 animate-pulse rounded-full bg-slate-200" />
              <span className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      )}
      {note && <p className="px-1 pb-1 text-sm text-slate-600">{note}</p>}
      {empty && !note && (
        <EmptyState icon={<SearchX className="size-7" />} title="Никого не нашли">
          Попробуйте изменить запрос.
        </EmptyState>
      )}

      {blocks?.map(
        (b) =>
          b.items.length > 0 && (
            <section key={b.title} className="mb-3">
              <h3 className="px-1 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{b.title}</h3>
              <ul>
                {b.items.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => open(r.id)}
                      className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Avatar name={r.fullName} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-medium leading-snug text-slate-900">{r.fullName}</span>
                        {r.hint && <span className="block truncate text-xs text-slate-500">{r.hint}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
    </div>
  );
}
