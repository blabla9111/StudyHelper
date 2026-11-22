import { requireUser } from "@/lib/auth";

export const metadata = { title: "Сообщения" };

export const dynamic = "force-dynamic";

// Список диалогов и заглушка «Выберите диалог» рисует каркас раздела (layout.tsx)
export default async function MessagesPage() {
  await requireUser();
  return null;
}
