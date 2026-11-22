"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Megaphone, MessageSquareOff, RotateCcw, SendHorizonal, Trash2, WifiOff } from "lucide-react";
import { Avatar } from "../Avatar";
import { Modal } from "../Modal";
import { GroupAvatar } from "./ConversationList";
import {
  MAX_BODY_LEN,
  dayLabel,
  notifyMessagesChanged,
  sameDay,
  setUnreadCount,
  timeOf,
  type MessageItem,
} from "./client";

interface Header {
  id: number;
  type: "direct" | "group";
  title: string;
  subtitle: string;
  canSend: boolean;
}

interface Pending {
  tempId: number;
  body: string;
  state: "sending" | "failed";
  error?: string;
}

const POLL_MS = 5_000;

export function ConversationView({ id }: { id: number }) {
  const [header, setHeader] = useState<Header | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [text, setText] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [toDelete, setToDelete] = useState<MessageItem | null>(null);
  const [tick, setTick] = useState(0);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);
  const forceBottomRef = useRef(true);
  const keepHeightRef = useRef<number | null>(null);
  const readRef = useRef(0);

  // Высота экрана с учётом клавиатуры на телефоне: диалог занимает видимую область целиком
  useEffect(() => {
    const vv = window.visualViewport;
    const apply = () => {
      document.documentElement.style.setProperty("--vvh", `${vv ? vv.height : window.innerHeight}px`);
      if (vv && window.matchMedia("(max-width: 767px)").matches) window.scrollTo(0, 0);
    };
    apply();
    vv?.addEventListener("resize", apply);
    window.addEventListener("resize", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      window.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--vvh");
    };
  }, []);

  const markRead = useCallback(
    async (list: MessageItem[]) => {
      const maxForeign = list.reduce((m, x) => (!x.mine && !x.deleted && x.id > m ? x.id : m), 0);
      if (maxForeign <= readRef.current || document.visibilityState !== "visible") return;
      readRef.current = maxForeign;
      try {
        const res = await fetch(`/api/messages/${id}/read`, { method: "POST" });
        if (res.ok) {
          setUnreadCount(((await res.json()) as { unread: number }).unread);
          notifyMessagesChanged();
        } else {
          readRef.current = 0;
        }
      } catch {
        readRef.current = 0;
      }
    },
    [id],
  );

  // Последние 50 сообщений: при опросе новые и изменённые (удалённые) заменяют хвост списка
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/${id}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (res.status === 404) {
        setStatus("missing");
        return;
      }
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as { conversation: Header; messages: MessageItem[]; hasMore: boolean };
      setHeader(data.conversation);
      setOffline(false);
      setMessages((prev) => {
        const first = data.messages[0]?.id ?? Infinity;
        const older = prev.filter((m) => m.id < first);
        if (older.length === 0) setHasMore(data.hasMore);
        return [...older, ...data.messages];
      });
      setStatus("ready");
      markRead(data.messages);
    } catch {
      setOffline(true);
      setStatus((s) => (s === "ready" ? s : "error"));
    }
  }, [id, markRead]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        load();
        setTick((t) => t + 1);
      }
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  async function loadOlder() {
    if (loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/messages/${id}?before=${messages[0].id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as { messages: MessageItem[]; hasMore: boolean };
      keepHeightRef.current = scrollerRef.current?.scrollHeight ?? null;
      setMessages((prev) => [...data.messages, ...prev]);
      setHasMore(data.hasMore);
    } catch {
      setOffline(true);
    }
    setLoadingOlder(false);
  }

  // Прокрутка: к низу при открытии, при своей отправке и если читатель уже внизу; при подгрузке старых позиция сохраняется
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (keepHeightRef.current !== null) {
      el.scrollTop += el.scrollHeight - keepHeightRef.current;
      keepHeightRef.current = null;
      return;
    }
    if (forceBottomRef.current || stickRef.current) {
      el.scrollTop = el.scrollHeight;
      if (status === "ready") forceBottomRef.current = false;
    }
  }, [messages, pending, status]);

  function onScroll() {
    const el = scrollerRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function post(body: string, tempId: number) {
    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const error = res.status === 404 ? "Диалог недоступен." : (data.error ?? "Не удалось отправить.");
        setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, state: "failed", error } : x)));
        return;
      }
      forceBottomRef.current = true;
      await load();
      setPending((p) => p.filter((x) => x.tempId !== tempId));
      notifyMessagesChanged();
    } catch {
      setPending((p) =>
        p.map((x) => (x.tempId === tempId ? { ...x, state: "failed", error: "Нет связи с сервером." } : x)),
      );
    }
  }

  function send() {
    const body = text.trim();
    if (!body || body.length > MAX_BODY_LEN || !header?.canSend) return;
    const tempId = -Date.now() - Math.floor(Math.random() * 1000);
    setPending((p) => [...p, { tempId, body, state: "sending" }]);
    setText("");
    forceBottomRef.current = true;
    post(body, tempId);
    taRef.current?.focus();
  }

  function retry(p: Pending) {
    setPending((list) => list.map((x) => (x.tempId === p.tempId ? { ...x, state: "sending", error: undefined } : x)));
    post(p.body, p.tempId);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // На компьютере Enter отправляет, Shift+Enter переносит строку. На телефоне Enter всегда перенос.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      e.preventDefault();
      send();
    }
  }

  // Поле растёт вместе с текстом, но не больше пяти строк
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 132)}px`;
  }, [text, header?.canSend]);

  async function confirmDelete() {
    const m = toDelete;
    if (!m) return;
    setToDelete(null);
    try {
      const res = await fetch("/api/messages/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: m.id }),
      });
      if (!res.ok) setOffline(true);
    } catch {
      setOffline(true);
    }
    await load();
    notifyMessagesChanged();
  }

  if (status === "missing") {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <MessageSquareOff className="size-7" aria-hidden="true" />
          </span>
          <p className="font-semibold">Диалог недоступен</p>
          <p className="mt-1 max-w-xs text-sm text-slate-500">Он удалён или у вас нет к нему доступа.</p>
          <Link href="/messages" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
            К списку диалогов
          </Link>
        </div>
      </Shell>
    );
  }

  const isGroup = header?.type === "group";
  const now = Date.now();
  void tick;

  return (
    <Shell>
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-4 md:pt-2">
        <Link href="/messages" aria-label="Назад к диалогам" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 md:hidden">
          <ChevronLeft className="size-6" aria-hidden="true" />
        </Link>
        {header ? (
          <>
            {isGroup ? <GroupAvatar /> : <Avatar name={header.title} />}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold leading-tight">{header.title}</h1>
              <p className="truncate text-xs text-slate-500">{header.subtitle}</p>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center gap-3" aria-busy="true">
            <span className="size-11 animate-pulse rounded-full bg-slate-200" />
            <span className="h-4 w-40 animate-pulse rounded bg-slate-200" />
          </div>
        )}
      </header>

      {offline && status === "ready" && (
        <p role="status" className="flex shrink-0 items-center justify-center gap-2 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          <WifiOff className="size-3.5" aria-hidden="true" /> Нет связи, повторяю попытку
        </p>
      )}

      <div ref={scrollerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 px-3 py-3 md:px-5">
        {status === "loading" && <ThreadSkeleton />}

        {status === "error" && (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <WifiOff className="size-7" aria-hidden="true" />
            </span>
            <p className="font-semibold">Не удалось загрузить диалог</p>
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

        {status === "ready" && (
          <>
            {hasMore && (
              <div className="mb-3 flex justify-center">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                >
                  {loadingOlder && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  Показать более ранние сообщения
                </button>
              </div>
            )}

            {messages.length === 0 && pending.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <p className="font-semibold">Сообщений пока нет</p>
                <p className="mt-1 max-w-xs text-sm text-slate-500">
                  {header?.canSend ? "Напишите первым: сообщение увидит только собеседник." : "В этом диалоге писать нельзя."}
                </p>
              </div>
            )}

            <ul className="flex flex-col gap-1">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
                const showAuthor = isGroup && !m.mine && (newDay || prev.authorId !== m.authorId || prev.mine);
                const canDelete = m.deletableUntil !== null && new Date(m.deletableUntil).getTime() > now;
                return (
                  <Fragment key={m.id}>
                    {newDay && (
                      <li className="my-2 flex justify-center">
                        <span className="rounded-full bg-slate-200/70 px-3 py-0.5 text-xs font-medium text-slate-600">{dayLabel(m.createdAt)}</span>
                      </li>
                    )}
                    <li className={`flex flex-col ${m.mine ? "items-end" : "items-start"} ${showAuthor ? "mt-2" : ""}`}>
                      {showAuthor && <span className="mb-0.5 px-1 text-xs font-semibold text-brand-700">{m.authorName}</span>}
                      <Bubble m={m} />
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setToDelete(m)}
                          className="mt-0.5 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" /> Удалить
                        </button>
                      )}
                    </li>
                  </Fragment>
                );
              })}

              {pending.map((p) => (
                <li key={p.tempId} className="flex flex-col items-end">
                  <div className={`max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-[15px] leading-snug text-white ${p.state === "failed" ? "bg-rose-400" : "bg-brand-400"}`}>
                    <p className="whitespace-pre-wrap break-words">{p.body}</p>
                  </div>
                  {p.state === "sending" ? (
                    <span className="mt-0.5 px-1 text-xs text-slate-400">Отправляю…</span>
                  ) : (
                    <span role="alert" className="mt-1 flex flex-wrap items-center justify-end gap-x-2 text-xs text-rose-700">
                      {p.error}
                      <button type="button" onClick={() => retry(p)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-semibold hover:bg-rose-50">
                        <RotateCcw className="size-3.5" aria-hidden="true" /> Повторить
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setText((t) => t || p.body);
                          setPending((l) => l.filter((x) => x.tempId !== p.tempId));
                        }}
                        className="min-h-9 rounded-lg px-2 font-medium text-slate-500 hover:bg-slate-100"
                      >
                        В поле ввода
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {status === "ready" && header && !header.canSend && (
        <p className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-slate-500">
          Писать этому собеседнику сейчас нельзя.
        </p>
      )}

      {(status !== "ready" || header?.canSend) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="shrink-0 border-t border-slate-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 md:px-4"
        >
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Сообщение</span>
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                maxLength={MAX_BODY_LEN}
                rows={1}
                disabled={status !== "ready"}
                placeholder="Напишите сообщение"
                className="block max-h-[132px] min-h-12 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-snug outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100 disabled:opacity-60"
              />
            </label>
            <button
              type="submit"
              disabled={status !== "ready" || text.trim().length === 0}
              aria-label="Отправить"
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              <SendHorizonal className="size-5" aria-hidden="true" />
            </button>
          </div>
          {text.length >= 1700 && (
            <p className={`mt-1 text-right text-xs ${text.length >= MAX_BODY_LEN ? "font-semibold text-rose-600" : "text-slate-400"}`}>
              {text.length} / {MAX_BODY_LEN}
            </p>
          )}
        </form>
      )}

      {toDelete && (
        <Modal title="Удалить сообщение?" onClose={() => setToDelete(null)}>
          <p className="text-sm text-slate-600">
            {toDelete.broadcast
              ? "Рассылка исчезнет у всех получателей: вместо текста останется «Сообщение удалено»."
              : "Вместо текста в диалоге останется «Сообщение удалено»."}
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setToDelete(null)} className="min-h-12 rounded-xl border border-slate-200 px-5 font-semibold text-slate-700 hover:bg-slate-50">
              Отмена
            </button>
            <button type="button" onClick={confirmDelete} className="min-h-12 rounded-xl bg-rose-600 px-5 font-semibold text-white hover:bg-rose-700">
              Удалить
            </button>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

/** Контейнер диалога: на телефоне занимает весь экран, на компьютере лежит в правой колонке */
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col bg-white md:overflow-hidden md:rounded-2xl md:border md:border-slate-200 md:shadow-sm">{children}</div>;
}

function Bubble({ m }: { m: MessageItem }) {
  if (m.deleted) {
    return (
      <div className="max-w-[85%] rounded-2xl border border-dashed border-slate-300 px-3.5 py-2 text-sm italic text-slate-400">
        Сообщение удалено <span className="not-italic">· {timeOf(m.createdAt)}</span>
      </div>
    );
  }
  return (
    <div
      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
        m.mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-900"
      }`}
    >
      {m.broadcast && (
        <p className={`mb-1 flex items-center gap-1 text-xs font-semibold ${m.mine ? "text-brand-100" : "text-brand-700"}`}>
          <Megaphone className="size-3.5" aria-hidden="true" /> Рассылка · {m.broadcast}
        </p>
      )}
      <p className="whitespace-pre-wrap break-words">{m.body}</p>
      <p className={`mt-0.5 text-right text-xs ${m.mine ? "text-brand-100" : "text-slate-400"}`}>{timeOf(m.createdAt)}</p>
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка сообщений" className="flex flex-col gap-3">
      <span className="h-10 w-2/3 animate-pulse rounded-2xl bg-slate-200" />
      <span className="ml-auto h-10 w-1/2 animate-pulse rounded-2xl bg-slate-200" />
      <span className="h-14 w-3/4 animate-pulse rounded-2xl bg-slate-200" />
    </div>
  );
}
