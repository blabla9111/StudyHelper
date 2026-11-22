"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Bell,
  BellOff,
  X,
  CalendarX,
  CalendarClock,
  FileCheck,
  Megaphone,
  Clock,
  GraduationCap,
  MessageCircle,
  Video,
  Film,
  type LucideIcon,
} from "lucide-react";
import { relativeTime } from "@/lib/format";
import type { NotificationDTO } from "@/lib/types";

const TYPE_STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  class_cancelled: { icon: CalendarX, tone: "bg-rose-100 text-rose-600" },
  class_moved: { icon: CalendarClock, tone: "bg-amber-100 text-amber-700" },
  request_status: { icon: FileCheck, tone: "bg-emerald-100 text-emerald-700" },
  announcement: { icon: Megaphone, tone: "bg-brand-100 text-brand-700" },
  deadline: { icon: Clock, tone: "bg-violet-100 text-violet-700" },
  grade: { icon: GraduationCap, tone: "bg-cyan-100 text-cyan-800" },
  message: { icon: MessageCircle, tone: "bg-slate-100 text-slate-700" },
  lesson_format: { icon: Video, tone: "bg-sky-100 text-sky-700" },
  recording_request: { icon: Film, tone: "bg-emerald-100 text-emerald-700" },
};
const FALLBACK_STYLE = { icon: Bell, tone: "bg-slate-100 text-slate-700" };

const POLL_MS = 30_000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [undo, setUndo] = useState<NotificationDTO | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as { items: NotificationDTO[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  // Первая загрузка и обновление раз в 30 секунд, пока вкладка открыта
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Панель: Esc закрывает, фон страницы не прокручивается
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function markRead(body: { ids: number[] } | { all: true }) {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      /* при ошибке сети уведомления останутся новыми и пометятся при следующем открытии */
    }
  }

  async function dismiss(n: NotificationDTO) {
    setItems((prev) => prev.filter((i) => i.id !== n.id));
    if (!n.read) setUnread((u) => Math.max(0, u - 1));
    setToastError(null);
    let ok = false;
    try {
      ok = (await fetch(`/api/notifications/${n.id}`, { method: "DELETE" })).ok;
    } catch {
      ok = false;
    }
    if (!ok) {
      // Не получилось: возвращаем уведомление на место
      setItems((prev) => insertSorted(prev, n));
      if (!n.read) setUnread((u) => u + 1);
      setUndo(null);
      setToastError("Не удалось удалить уведомление. Попробуйте ещё раз.");
      return;
    }
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(n);
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  }

  async function restore() {
    const n = undo;
    if (!n) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(null);
    try {
      const res = await fetch(`/api/notifications/${n.id}/restore`, { method: "POST" });
      if (!res.ok) throw new Error("bad status");
      setItems((prev) => insertSorted(prev, { ...n, read: true }));
    } catch {
      setToastError("Не удалось вернуть уведомление.");
    }
  }

  function openPanel() {
    setOpen(true);
    load();
  }

  function closePanel() {
    setOpen(false);
    setUndo(null);
    setToastError(null);
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (ids.length > 0) {
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      setUnread(0);
      markRead({ ids });
    }
  }

  function markAll() {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    setUnread(0);
    markRead({ all: true });
  }

  const fresh = items.filter((i) => !i.read);
  const older = items.filter((i) => i.read);

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-label={unread > 0 ? `Уведомления, новых: ${unread}` : "Уведомления"}
        aria-haspopup="dialog"
        className="relative inline-flex size-11 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <Bell className="size-6" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-semibold leading-none text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Панель выводится в body: у шапки есть backdrop-filter, из-за него fixed-элементы внутри неё
          привязываются к шапке, а не к экрану */}
      {open &&
        createPortal(
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/40" onClick={closePanel} aria-hidden="true" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Уведомления"
            className="absolute inset-y-0 right-0 flex w-full animate-slide-in flex-col bg-white shadow-2xl sm:max-w-md"
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold">Уведомления</h2>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={markAll}
                    className="min-h-10 rounded-lg px-3 text-sm font-medium text-brand-600 hover:bg-brand-50"
                  >
                    Прочитать все
                  </button>
                )}
                <button
                  ref={closeRef}
                  type="button"
                  onClick={closePanel}
                  aria-label="Закрыть уведомления"
                  className="inline-flex size-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {status === "loading" && <PanelSkeleton />}

              {status === "error" && (
                <div className="px-4 py-10 text-center">
                  <p className="font-semibold">Не удалось загрузить уведомления</p>
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
                <div className="flex flex-col items-center px-4 py-14 text-center">
                  <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <BellOff className="size-7" aria-hidden="true" />
                  </span>
                  <p className="font-semibold">Уведомлений нет</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Здесь появятся отмены пар, статусы заявок и объявления деканата.
                  </p>
                </div>
              )}

              {status === "ready" && items.length > 0 && (
                <>
                  {fresh.length > 0 ? (
                    <Section title="Новые">
                      {fresh.map((n) => (
                        <Item key={n.id} n={n} onNavigate={closePanel} onDismiss={dismiss} />
                      ))}
                    </Section>
                  ) : (
                    <p className="px-3 py-3 text-sm text-slate-500">Новых уведомлений нет.</p>
                  )}
                  {older.length > 0 && (
                    <Section title="Раньше">
                      {older.map((n) => (
                        <Item key={n.id} n={n} onNavigate={closePanel} onDismiss={dismiss} />
                      ))}
                    </Section>
                  )}
                </>
              )}
            </div>
            <div className="min-h-0 shrink-0" aria-live="polite" role="status">
              {undo && (
                <div className="mx-3 mb-3 flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white">
                  <span>Уведомление удалено</span>
                  <button type="button" onClick={restore} className="min-h-9 rounded-lg px-2 font-semibold text-brand-200 hover:text-white">
                    Отменить
                  </button>
                </div>
              )}
              {toastError && (
                <p role="alert" className="mx-3 mb-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {toastError}
                </p>
              )}
            </div>
          </aside>
        </div>,
          document.body,
        )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-2">
      <h3 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="flex flex-col gap-1">{children}</ul>
    </section>
  );
}

function insertSorted(list: NotificationDTO[], n: NotificationDTO): NotificationDTO[] {
  return [...list, n].sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : y.id - x.id));
}

function Item({ n, onNavigate, onDismiss }: { n: NotificationDTO; onNavigate: () => void; onDismiss: (n: NotificationDTO) => void }) {
  const { icon: Icon, tone } = TYPE_STYLE[n.type] ?? FALLBACK_STYLE;
  const content = (
    <>
      <span className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="notif-body min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className={`text-[15px] leading-snug ${n.read ? "font-medium text-slate-700" : "font-semibold text-slate-900"}`}>
            {n.title}
          </span>
          {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-label="новое" />}
        </span>
        {n.body && <span className="mt-0.5 block text-sm leading-snug text-slate-600">{n.body}</span>}
        <span className="mt-1 block text-xs text-slate-500">{relativeTime(n.createdAt)}</span>
      </span>
    </>
  );
  const cls = `flex gap-3 rounded-xl p-3 text-left transition-colors ${n.read ? "hover:bg-slate-50" : "bg-brand-50/60 hover:bg-brand-50"}`;

  return (
    <SwipeRow onDismiss={() => onDismiss(n)}>
      {n.link ? (
        <Link href={n.link} onClick={onNavigate} className={cls}>
          {content}
        </Link>
      ) : (
        <div className={cls}>{content}</div>
      )}
      <button type="button" onClick={() => onDismiss(n)} aria-label="Удалить уведомление" title="Удалить уведомление" className="notif-del">
        <X className="size-4" aria-hidden="true" />
      </button>
    </SwipeRow>
  );
}

const EDGE = 24; // у самого края экрана жест «Назад» в Safari, там смахивание не начинаем
const FAR = 0.4; // доля ширины, после которой уведомление уезжает
const FAST = 0.6; // px/мс: быстрый жест тоже удаляет

/** Строка списка: на сенсорном экране смахивание влево или вправо удаляет уведомление */
function SwipeRow({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; mode: "h" | "v" | null; w: number; id: number } | null>(null);
  const moved = useRef(false);
  const [dx, setDx] = useState(0);
  const [phase, setPhase] = useState<"idle" | "drag" | "out" | "collapse">("idle");
  const [height, setHeight] = useState<number | null>(null);

  function down(e: React.PointerEvent) {
    if (e.pointerType !== "touch" || phase === "out" || phase === "collapse") return;
    if (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), mode: null, w: ref.current?.offsetWidth ?? 320, id: e.pointerId };
    moved.current = false;
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (d.mode === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      d.mode = Math.abs(mx) > Math.abs(my) * 1.2 ? "h" : "v";
      if (d.mode === "h") {
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* не критично */
        }
        setPhase("drag");
      }
    }
    if (d.mode === "h") {
      moved.current = true;
      setDx(mx);
    }
  }
  function end(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.mode !== "h") return;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - d.t);
    if (Math.abs(dx) > d.w * FAR || (Math.abs(dx) > 40 && speed > FAST)) {
      setPhase("out");
      setDx(Math.sign(dx || 1) * d.w * 1.15);
      setHeight(ref.current?.offsetHeight ?? null);
      setTimeout(() => setPhase("collapse"), 180);
      setTimeout(onDismiss, 360);
    } else {
      setPhase("idle");
      setDx(0);
    }
    void e;
  }
  function cancel() {
    drag.current = null;
    if (phase === "drag") {
      setPhase("idle");
      setDx(0);
    }
  }

  const style: React.CSSProperties =
    phase === "collapse"
      ? { height: 0, opacity: 0, overflow: "hidden", transition: "height 160ms ease, opacity 160ms ease" }
      : { height: height ?? undefined };
  const inner: React.CSSProperties = {
    transform: dx ? `translateX(${dx}px)` : undefined,
    opacity: phase === "drag" ? Math.max(0.35, 1 - Math.abs(dx) / 400) : phase === "out" ? 0 : 1,
    transition: phase === "drag" ? "none" : "transform 180ms ease, opacity 180ms ease",
    touchAction: "pan-y",
  };

  return (
    <li ref={ref} className="notif-item relative" style={style}>
      <div
        style={inner}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={cancel}
        onClickCapture={(e) => {
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          }
        }}
      >
        {children}
      </div>
    </li>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-2" aria-busy="true" aria-label="Загрузка">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse gap-3 rounded-xl p-3">
          <div className="size-10 rounded-full bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/3 rounded bg-slate-100" />
            <div className="h-3 w-full rounded bg-slate-100" />
            <div className="h-3 w-1/4 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
