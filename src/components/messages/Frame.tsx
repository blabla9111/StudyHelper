"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { ConversationList } from "./ConversationList";

/**
 * Каркас раздела. Компьютер: список слева, диалог справа. Телефон: либо список, либо диалог на весь экран
 * (с кнопкой «Назад»). Список остаётся смонтированным при переходах, поэтому не мигает.
 */
export function MessagesFrame({ role, children }: { role: "student" | "teacher" | "staff"; children: ReactNode }) {
  const pathname = usePathname();
  const inDialog = /^\/messages\/\d+/.test(pathname);

  return (
    <div className="md:grid md:h-[calc(100dvh-11rem)] md:min-h-[480px] md:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] md:gap-4">
      <div className={`${inDialog ? "hidden md:block" : "block"} h-full min-h-0`}>
        <ConversationList role={role} />
      </div>
      <div
        className={
          inDialog
            ? "fixed inset-x-0 top-0 z-40 h-[var(--vvh,100dvh)] bg-white md:static md:z-auto md:h-full md:bg-transparent"
            : "hidden h-full min-h-0 md:block"
        }
      >
        {inDialog ? (
          children
        ) : (
          <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 px-6 text-center">
            <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <MessagesSquare className="size-7" aria-hidden="true" />
            </span>
            <p className="font-semibold">Выберите диалог</p>
            <p className="mt-1 max-w-xs text-sm text-slate-500">Или нажмите «Новое сообщение», чтобы начать переписку.</p>
          </div>
        )}
      </div>
    </div>
  );
}
