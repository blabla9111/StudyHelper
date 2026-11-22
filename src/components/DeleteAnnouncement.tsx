"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteAnnouncement({ id, title }: { id: number; title: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Удалить объявление «${title}»`}
      onClick={async () => {
        setPending(true);
        await fetch("/api/announcements/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
        router.refresh();
        setPending(false);
      }}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
    >
      <Trash2 className="size-5" aria-hidden="true" />
    </button>
  );
}
