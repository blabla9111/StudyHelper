// Единый справочник подписей: полная форма (подсказка, чтение с экрана, уведомления) и короткая (таблицы, чипы, телефон).
// Новые подписи добавлять только здесь.
import type { ControlType } from "./grades";

export interface Label {
  full: string;
  short: string;
}

export const CONTROL: Record<ControlType, Label> = {
  credit: { full: "Зачёт", short: "Зачёт" },
  graded_credit: { full: "Дифференцированный зачёт", short: "Дифф. зачёт" },
  exam: { full: "Экзамен", short: "Экзамен" },
};

/** Итоговые оценки по ключу, который выдаёт finalResult */
export const RESULT: Record<"5" | "4" | "3" | "2" | "pass" | "fail", Label> = {
  "5": { full: "Отлично", short: "Отлично" },
  "4": { full: "Хорошо", short: "Хорошо" },
  "3": { full: "Удовлетворительно", short: "Удовл." },
  "2": { full: "Неудовлетворительно", short: "Неуд." },
  pass: { full: "Зачтено", short: "Зачтено" },
  fail: { full: "Не зачтено", short: "Не зачтено" },
};
