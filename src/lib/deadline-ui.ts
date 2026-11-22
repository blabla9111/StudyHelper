import { dayDiff, formatDayMonth, plural } from "./schedule";

export interface DeadlineInfo {
  /** «осталось 3 дня», «срок сегодня», «просрочено на 2 дн.» */
  left: string;
  /** «до 20 ноября» */
  due: string;
  overdue: boolean;
  urgent: boolean;
  days: number;
}

export function deadlineInfo(dueDate: string, today: string): DeadlineInfo {
  const days = dayDiff(today, dueDate);
  let left: string;
  if (days < 0) left = `просрочено на ${-days} ${plural(-days, "день", "дня", "дней")}`;
  else if (days === 0) left = "срок сегодня";
  else left = `${plural(days, "остался", "осталось", "осталось")} ${days} ${plural(days, "день", "дня", "дней")}`;
  return { left, due: `до ${formatDayMonth(dueDate)}`, overdue: days < 0, urgent: days <= 2, days };
}
