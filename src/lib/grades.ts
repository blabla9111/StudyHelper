// Правила баллов и оценок. Без серверных зависимостей: используются и на сервере, и в браузере.

export type ControlType = "credit" | "graded_credit" | "exam";


// Две контрольные точки по 30 баллов и экзамен (или зачёт) на 40: всего 100
export const MAX_POINTS = { kt1: 30, kt2: 30, exam: 40 } as const;
export const PASS_POINTS = 60;

export interface RawGrade {
  kt1: number | null;
  kt2: number | null;
  exam: number | null;
}

export const examPartLabel = (control: ControlType) => (control === "credit" ? "Зачёт" : "Экзамен");

/** Сумма выставленных баллов или null, если баллов ещё нет */
export function totalPoints(g: RawGrade | null | undefined): number | null {
  if (!g) return null;
  const parts = [g.kt1, g.kt2, g.exam].filter((x): x is number => x !== null && x !== undefined);
  return parts.length === 0 ? null : parts.reduce((a, b) => a + b, 0);
}

export const isComplete = (g: RawGrade | null | undefined): boolean =>
  !!g && g.kt1 !== null && g.kt2 !== null && g.exam !== null;

export interface FinalResult {
  /** Короткая отметка: «5», «4», «Зачтено» */
  mark: string;
  /** Полная подпись (для уведомлений); подписи для таблиц берутся из lib/labels.ts по `key` */
  label: string;
  key: "5" | "4" | "3" | "2" | "pass" | "fail";
  passed: boolean;
}

export function finalResult(control: ControlType, total: number): FinalResult {
  if (control === "credit") {
    return total >= PASS_POINTS
      ? { mark: "Зачтено", label: "Зачтено", key: "pass", passed: true }
      : { mark: "Не зачтено", label: "Не зачтено", key: "fail", passed: false };
  }
  if (total >= 85) return { mark: "5", label: "Отлично", key: "5", passed: true };
  if (total >= 70) return { mark: "4", label: "Хорошо", key: "4", passed: true };
  if (total >= PASS_POINTS) return { mark: "3", label: "Удовлетворительно", key: "3", passed: true };
  return { mark: "2", label: "Неудовлетворительно", key: "2", passed: false };
}
