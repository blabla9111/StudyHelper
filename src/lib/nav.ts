import type { Role } from "./types";

export type NavIcon =
  | "home"
  | "schedule"
  | "grades"
  | "requests"
  | "messages"
  | "gradebooks"
  | "announcements"
  | "recordings";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

// Меню зависит от роли. На телефоне все пункты попадают в нижнюю панель (их не больше пяти).
export const NAV: Record<Role, NavItem[]> = {
  student: [
    { href: "/", label: "Главная", icon: "home" },
    { href: "/schedule", label: "Расписание", icon: "schedule" },
    { href: "/grades", label: "Зачётка", icon: "grades" },
    { href: "/requests", label: "Заявки", icon: "requests" },
    { href: "/messages", label: "Сообщения", icon: "messages" },
  ],
  teacher: [
    { href: "/", label: "Главная", icon: "home" },
    { href: "/schedule", label: "Расписание", icon: "schedule" },
    { href: "/gradebooks", label: "Ведомости", icon: "gradebooks" },
    { href: "/recordings", label: "Записи", icon: "recordings" },
    { href: "/messages", label: "Сообщения", icon: "messages" },
  ],
  staff: [
    { href: "/", label: "Главная", icon: "home" },
    { href: "/requests", label: "Заявки", icon: "requests" },
    { href: "/announcements", label: "Объявления", icon: "announcements" },
    { href: "/messages", label: "Сообщения", icon: "messages" },
  ],
};
