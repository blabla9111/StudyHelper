import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "StudyHelper — личный кабинет студента (концепт)", template: "%s · StudyHelper" },
  description: "Учебный концепт цифрового деканата. Не официальный сервис вуза.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2744d6",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <a href="#main" className="skip-link">К содержимому</a>
        {children}
      </body>
    </html>
  );
}
