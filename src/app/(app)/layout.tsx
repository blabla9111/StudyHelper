import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";

// Все страницы внутри кабинета доступны только после входа
export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
