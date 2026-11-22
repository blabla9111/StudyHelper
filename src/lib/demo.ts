import type { Role } from "./types";

// Тестовые аккаунты для жюри. Пароли в базе хранятся только в виде bcrypt-хеша.
export interface DemoAccount {
  login: string;
  password: string;
  role: Role;
  fullName: string;
  note: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { login: "student1", password: "Study-One-26", role: "student", fullName: "Лисицына Арина Романовна", note: "группа ПИ-24-1, 3 курс" },
  { login: "student2", password: "Study-Two-26", role: "student", fullName: "Громов Тимур Ильдарович", note: "группа ПИ-25-2, 2 курс" },
  { login: "teacher1", password: "Teach-One-26", role: "teacher", fullName: "Сомов Виктор Павлович", note: "кафедра прикладной информатики" },
  { login: "teacher2", password: "Teach-Two-26", role: "teacher", fullName: "Беляева Нина Олеговна", note: "кафедра высшей математики" },
  { login: "dean1", password: "Dean-One-26", role: "staff", fullName: "Крылова Эльвира Михайловна", note: "деканат ФИТ" },
];

/**
 * Показывать ли блок демо-аккаунтов на странице входа.
 * Включается DEMO_MODE=true (или NEXT_PUBLIC_DEMO=1). Без настройки он виден только при локальной разработке,
 * на боевом сервере (NODE_ENV=production) по умолчанию выключен.
 */
export const demoModeEnabled = () => {
  const flag = process.env.DEMO_MODE;
  if (flag === "false") return false; // явное «выключено» сильнее любых других флагов
  if (flag === "true" || process.env.NEXT_PUBLIC_DEMO === "1") return true;
  return process.env.NODE_ENV !== "production";
};
