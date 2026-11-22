"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, TriangleAlert, UserRound } from "lucide-react";
import type { Role } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/types";

export interface DemoAccountView {
  login: string;
  password: string;
  role: Role;
  fullName: string;
  note: string;
}

export function LoginForm({ demoAccounts }: { demoAccounts: DemoAccountView[] }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      if (res.ok) {
        window.location.assign("/");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Не удалось войти. Попробуйте ещё раз.");
    } catch {
      setError("Нет связи с сервером. Проверьте интернет и повторите.");
    }
    setPending(false);
  }

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Вход в кабинет</h1>
      <p className="mt-1.5 text-slate-500">Введите логин и пароль, чтобы продолжить.</p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Логин</span>
          <input
            name="login"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            maxLength={64}
            className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-base outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Пароль</span>
          <span className="relative">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              maxLength={128}
              className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-4 pr-12 text-base outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              className="absolute right-1 top-1 inline-flex size-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </span>
        </label>

        <div aria-live="polite">
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={pending || !login || !password}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 text-base font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          {pending ? "Входим…" : "Войти"}
        </button>
      </form>

      {demoAccounts.length > 0 && (
        <details className="mt-8 rounded-2xl border border-slate-200 bg-white" open>
          <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-semibold text-slate-800">
            Тестовые аккаунты для жюри
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              Только вымышленные демо-аккаунты. Выберите один, чтобы подставить логин и пароль.
            </span>
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {demoAccounts.map((a) => (
              <li key={a.login}>
                <button
                  type="button"
                  onClick={() => {
                    setLogin(a.login);
                    setPassword(a.password);
                    setError(null);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <UserRound className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{a.fullName}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {ROLE_LABEL[a.role]}, {a.note}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {a.login} / {a.password}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
