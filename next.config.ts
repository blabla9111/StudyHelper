import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Политика содержимого. Next.js вставляет в страницы свои короткие скрипты, поэтому нужен 'unsafe-inline';
// в режиме разработки добавляется 'unsafe-eval' (его требует перезагрузка кода). Скрипты и стили только со своего сайта.
// CSP_REPORT_ONLY=true включает режим «только сообщать» (нарушения видны в консоли браузера, но ничего не блокируется).
const csp = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "font-src 'self' data:",
  "connect-src 'self'" + (isProd ? "" : " ws: wss:"),
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
const cspHeader = process.env.CSP_REPORT_ONLY === "true" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: cspHeader, value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
