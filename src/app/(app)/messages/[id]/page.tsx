import { notFound } from "next/navigation";
import { ConversationView } from "@/components/messages/ConversationView";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getConversationForUser } from "@/lib/messages";

export const metadata = { title: "Диалог" };

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Адрес не из цифр не может быть диалогом: 404 сразу, до всех остальных запросов
  if (!/^\d{1,9}$/.test(id)) notFound();
  const user = await requireUser();
  const convId = Number(id);
  // Чужой или несуществующий диалог — обычная страница 404
  if (!getConversationForUser(getDb(), user, convId)) notFound();
  return <ConversationView key={convId} id={convId} />;
}
