import { requireUser } from "@/lib/auth";
import { MessagesFrame } from "@/components/messages/Frame";

export const dynamic = "force-dynamic";

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <MessagesFrame role={user.role}>{children}</MessagesFrame>;
}
