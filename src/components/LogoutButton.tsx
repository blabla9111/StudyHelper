"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

export function LogoutButton({ className = "" }: { className?: string }) {
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className={`inline-flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60 ${className}`}
    >
      <LogOut className="size-5" aria-hidden="true" />
      {pending ? "Выходим…" : "Выйти"}
    </button>
  );
}
