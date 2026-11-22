"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Megaphone, MessageSquarePlus, MessagesSquare, Search, SearchX, Users, WifiOff } from "lucide-react";
import { Avatar } from "../Avatar";
import { EmptyState } from "../EmptyState";
import { BroadcastModal, MyBroadcasts } from "./Broadcast";
import { NewMessageModal } from "./NewMessage";
import {
  CHANGED_EVENT,
  listTime,
  setUnreadCount,
  type BroadcastItem,
  type ConversationItem,
} from "./client";

const POLL_MS = 30_000;

export function GroupAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-600 text-white ${size === "sm" ? "size-9" : "size-11"}`}
    >
      <Users className={size === "sm" ? "size-4" : "size-5"} />
    </span>
  );
}

export function ConversationList({ role }: { role: "student" | "teacher" | "staff" }) {
  const pathname = usePathname();
  const activeId = Number(/^\/messages\/(\d+)/.exec(pathname)?.[1] ?? 0);

  const [items, setItems] = useState<ConversationItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [bcastOpen, setBcastOpen] = useState(false);
  const [broadcasts, setBroadcasts] = useState<BroadcastItem[] | null>(null);
  const closeNew = useCallback(() => setNewOpen(false), []);
  const closeBcast = useCallback(() => setBcastOpen(false), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/messages", { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as { items: ConversationItem[]; unread: number };
      setItems(data.items);
      setUnreadCount(data.unread);
      setStatus("ready");
    } catch {
      setStatus((s) => (s === "ready" ? s : "error"));
    }
  }, []);

  const loadBroadcasts = useCallback(async () => {
    if (role !== "teacher") return;
    try {
      const res = await fetch("/api/messages/broadcast", { cache: "no-store" });
      if (res.ok) setBroadcasts(((await res.json()) as { broadcasts: BroadcastItem[] }).broadcasts);
    } catch {
      /* история рассылок подтянется при следующем обновлении */
    }
  }, [role]);

  useEffect(() => {
    load();
    loadBroadcasts();
    const refresh = () => {
      load();
      loadBroadcasts();
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    window.addEventListener(CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener(CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, loadBroadcasts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.title.toLowerCase().includes(q)) : items;
  }, [items, query]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <h1 className="text-xl font-bold tracking-tight">Сообщения</h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <MessageSquarePlus className="size-5" aria-hidden="true" />
            Новое сообщение
          </button>
          {role === "teacher" && (
            <button
              type="button"
              onClick={() => setBcastOpen(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Megaphone className="size-5" aria-hidden="true" />
              Рассылка
            </button>
          )}
        </div>
        <label className="relative block">
          <span className="sr-only">Поиск по диалогам</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти диалог по имени"
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-base outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === "loading" && <ListSkeleton />}

        {status === "error" && (
          <div className="px-4 py-10 text-center">
            <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <WifiOff className="size-7" aria-hidden="true" />
            </span>
            <p className="font-semibold">Не удалось загрузить диалоги</p>
            <p className="mt-1 text-sm text-slate-500">Проверьте интернет и попробуйте ещё раз.</p>
            <button
              type="button"
              onClick={() => {
                setStatus("loading");
                load();
              }}
              className="mt-4 min-h-11 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Повторить
            </button>
          </div>
        )}

        {status === "ready" && items.length === 0 && (
          <EmptyState icon={<MessagesSquare className="size-7" />} title="Пока нет диалогов">
            {role === "staff"
              ? "Нажмите «Новое сообщение», чтобы написать студенту или преподавателю."
              : role === "teacher"
                ? "Здесь появятся ответы студентов. Написать студенту, коллеге, деканату или всей группе можно кнопками выше."
                : "Нажмите «Новое сообщение», чтобы написать преподавателю или одногруппнику."}
          </EmptyState>
        )}

        {status === "ready" && items.length > 0 && filtered.length === 0 && (
          <EmptyState icon={<SearchX className="size-7" />} title="Ничего не нашли">
            Попробуйте изменить запрос.
          </EmptyState>
        )}

        {status === "ready" && filtered.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {filtered.map((c) => (
              <li key={c.id}>
                <Row c={c} active={c.id === activeId} />
              </li>
            ))}
          </ul>
        )}

        {role === "teacher" && broadcasts && <MyBroadcasts items={broadcasts} />}
      </div>

      {newOpen && <NewMessageModal onClose={closeNew} />}
      {bcastOpen && <BroadcastModal onClose={closeBcast} />}
    </div>
  );
}

function Row({ c, active }: { c: ConversationItem; active: boolean }) {
  return (
    <Link
      href={`/messages/${c.id}`}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors ${active ? "bg-brand-50" : "hover:bg-slate-50"}`}
    >
      {c.type === "group" ? <GroupAvatar /> : <Avatar name={c.title} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[15px] ${c.unread > 0 ? "font-bold text-slate-900" : "font-semibold text-slate-800"}`}>{c.title}</span>
          {c.lastAt && <span className="shrink-0 text-xs text-slate-400">{listTime(c.lastAt)}</span>}
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={`truncate text-sm ${c.unread > 0 ? "text-slate-800" : "text-slate-500"}`}>
            {c.lastText ?? (c.type === "group" ? "Сообщений пока нет" : "")}
          </span>
          {c.unread > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">
              <span className="sr-only">Непрочитанных: </span>
              {c.unread}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

function ListSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Загрузка диалогов" className="divide-y divide-slate-100">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex min-h-[72px] items-center gap-3 px-4 py-3">
          <span className="size-11 shrink-0 animate-pulse rounded-full bg-slate-200" />
          <span className="flex-1 space-y-2">
            <span className="block h-3.5 w-1/2 animate-pulse rounded bg-slate-200" />
            <span className="block h-3 w-4/5 animate-pulse rounded bg-slate-100" />
          </span>
        </li>
      ))}
    </ul>
  );
}
