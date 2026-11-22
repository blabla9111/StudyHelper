"use client";

import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

// Понятное сообщение об ошибке вместо белого экрана
export default function CabinetError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white py-8 shadow-sm">
      <EmptyState icon={<TriangleAlert className="size-7" />} title="Что-то пошло не так">
        Не удалось открыть страницу. Попробуйте ещё раз, и если ошибка повторится, вернитесь позже.
      </EmptyState>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Повторить
        </button>
      </div>
    </div>
  );
}
