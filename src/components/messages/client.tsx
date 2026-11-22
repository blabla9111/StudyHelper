"use client";

import { useEffect, useState } from "react";

export const MAX_BODY_LEN = 2000;

// ───────────── Типы ответов API ─────────────

export interface ConversationItem {
  id: number;
  type: "direct" | "group";
  title: string;
  subtitle: string;
  lastText: string | null;
  lastAt: string | null;
  lastMine: boolean;
  unread: number;
  pinned: boolean;
}

export interface MessageItem {
  id: number;
  authorId: number;
  authorName: string;
  mine: boolean;
  body: string;
  createdAt: string;
  deleted: boolean;
  broadcast: string | null;
  deletableUntil: string | null;
}

export interface BroadcastItem {
  id: number;
  body: string;
  groups: string;
  recipients: number;
  createdAt: string;
  deletableUntil: string | null;
}

// ───────────── Время (всё по Москве) ─────────────

const TZ = "Europe/Moscow";
const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const dayKeyFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ });

export const timeOf = (iso: string) => timeFmt.format(new Date(iso));
const dayKey = (d: Date) => dayKeyFmt.format(d);

export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const k = dayKey(d);
  if (k === dayKey(now)) return "Сегодня";
  if (k === dayKey(new Date(now.getTime() - 86_400_000))) return "Вчера";
  const sameYear = k.slice(0, 4) === dayKey(now).slice(0, 4);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
    timeZone: TZ,
  }).format(d);
}

export const sameDay = (a: string, b: string) => dayKey(new Date(a)) === dayKey(new Date(b));

/** Время в строке списка: сегодня — часы, вчера — «Вчера», иначе дата */
export function listTime(iso: string, now = new Date()): string {
  const k = dayKey(new Date(iso));
  if (k === dayKey(now)) return timeOf(iso);
  if (k === dayKey(new Date(now.getTime() - 86_400_000))) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso)).replace(".", "");
}

// ───────────── Общие события и счётчик непрочитанных ─────────────

/** Любое изменение (отправили, прочитали, удалили): список и значок в меню обновляются */
export const CHANGED_EVENT = "messages:changed";
export const notifyMessagesChanged = () => window.dispatchEvent(new Event(CHANGED_EVENT));

let unread = 0;
const subs = new Set<(n: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

export function setUnreadCount(n: number) {
  unread = n;
  subs.forEach((f) => f(n));
}

async function refreshUnread() {
  try {
    const res = await fetch("/api/messages/unread", { cache: "no-store" });
    if (!res.ok) return;
    setUnreadCount(((await res.json()) as { unread: number }).unread);
  } catch {
    /* без сети значок просто не обновится */
  }
}

const onVisible = () => {
  if (document.visibilityState === "visible") refreshUnread();
};

/** Счётчик для значка в меню: опрос раз в 30 секунд, пока вкладка активна, и сразу после изменений */
export function useUnreadMessages(): number {
  const [n, setN] = useState(unread);
  useEffect(() => {
    subs.add(setN);
    if (subs.size === 1) {
      refreshUnread();
      timer = setInterval(onVisible, 30_000);
      window.addEventListener(CHANGED_EVENT, refreshUnread);
      document.addEventListener("visibilitychange", onVisible);
    } else {
      setN(unread);
    }
    return () => {
      subs.delete(setN);
      if (subs.size === 0) {
        if (timer) clearInterval(timer);
        timer = null;
        window.removeEventListener(CHANGED_EVENT, refreshUnread);
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, []);
  return n;
}

export function UnreadBadge({ className = "" }: { className?: string }) {
  const n = useUnreadMessages();
  if (n <= 0) return null;
  return (
    <span
      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-semibold leading-none text-white ${className}`}
    >
      <span className="sr-only">Непрочитанных сообщений: </span>
      {n > 99 ? "99+" : n}
    </span>
  );
}
